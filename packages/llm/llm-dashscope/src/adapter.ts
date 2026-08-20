/**
 * `DashScopeAdapter`: fetch + native SSE against the DashScope (AGA AI Gateway) text-generation
 * endpoint, emitting harness StreamChunks. The adapter is transport-only: connection facts arrive
 * through a thunk resolved once per operation and the bearer token through a per-request resolver,
 * so the registering plugin owns validation, layering, and credential policy.
 *
 * Native protocol (NOT OpenAI-compatible): the endpoint base IS the full generation URL (no
 * `/chat/completions` suffix — the adapter POSTs `connection.baseURL` directly); streaming is
 * triggered by the `X-DashScope-SSE: enable` header + `parameters.incremental_output: true` (set
 * by `serialize.ts`); the gateway's `request_id` rides in the response/error BODY, not headers
 * (extracted by {@link requestIdOf}). The gateway rate-limits by queuing, never 429, so callers
 * should keep `streamIdleTimeoutMs` generous.
 *
 * @module dsh-llm-dashscope/adapter
 */

import { attributionHeaders, CONTEXT_WINDOW_EXCEEDED_CODE, isContextWindowExceededError, isQuotaExceededError, LlmAdapter, LlmError, ProviderRequestId, QUOTA_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  ResolvedRetryPolicy,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { idleWatchdog, timeoutOf } from '@deepseek-ai/dsh-timeout'
import type { AnonymousUserId } from '@deepseek-ai/dsh-anonymous-user-id'
import { serializeRequest } from './serialize.ts'
import type { RequestDefaults } from './serialize.ts'
import { parseSse } from './sse.ts'
import { translate } from './translate.ts'
import type { WireChunk } from './types.ts'

/** One optional model entry advertised by the direct-fetch adapter. */
export interface DashScopeCatalogModel {
  /** Wire model id accepted by the configured endpoint. */
  id: string
  /** Selector label; defaults to {@link id}. */
  name?: string
  /** Optional selector detail for deployments with similar model variants. */
  description?: string
  /** Known combined request/response context capacity; omitted when deployment metadata is unavailable. */
  contextWindow?: number
  /** Per-request output cap for this model; omission falls back to the profile's {@link DashScopeConnectionOptions.maxTokens}. */
  maxTokens?: number
}

/**
 * Validated connection facts for one operation. The plugin's `resolveAdapterOptions` is the one
 * explicit resolve step producing this shape; the adapter trusts it and re-reads it per operation.
 */
export interface DashScopeConnectionOptions {
  /**
   * Endpoint base; this IS the full generation URL (the adapter POSTs it directly, no path
   * suffix). Default `https://pre-aga-ai-gateway.alibaba-inc.com/api/v1/services/aigc/
   * text-generation/generation`.
   */
  baseURL: string
  /** Credential reference of this same resolution, resolved per request. */
  apiKeyEnv: CredentialRef
  /** Request defaults (native protocol has no per-request thinking knob; empty today). */
  defaults: RequestDefaults
  /** Default per-request output cap; explicit request values win. */
  maxTokens: number
  /** Positive context capacity used when the selected model has no exact value. */
  defaultContextWindow: number
  /** Advisory models exposed to discovery consumers; requests remain unrestricted. */
  models: readonly DashScopeCatalogModel[]
  /** Maximum provider idle time while one stream read is outstanding. */
  streamIdleTimeoutMs: number
  /** Provider-owned model-request retry policy, already resolved. */
  retryPolicy: ResolvedRetryPolicy
}

/** Constructor options for {@link DashScopeAdapter}: the operation-local resolution hooks the plugin owns. */
export interface DashScopeAdapterOptions {
  /** Current validated connection facts; called once per operation. */
  options: () => DashScopeConnectionOptions
  /**
   * Resolve the bearer token for the connection facts of one request. Throws `LlmError`
   * `MISSING_CREDENTIAL` when no key is available anywhere.
   */
  resolveApiKey: (connection: DashScopeConnectionOptions) => Promise<string>
  /** Resolve the harness-home anonymous id shared with telemetry and feedback. */
  resolveUserId: () => AnonymousUserId
}

/** Default maximum idle interval while an adapter stream read is outstanding. */
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000
/**
 * Default combined request/response context capacity. Provisional — qwen model-specific context
 * windows were not in the live `/api/v1/models` output (ids only); operators should set per-model.
 */
export const DEFAULT_CONTEXT_WINDOW = 131_072
/** Default per-request output-token cap. */
export const DEFAULT_MAX_TOKENS = 8_192
const STREAM_IDLE_TIMEOUT_CODE = 'LLM_STREAM_IDLE_TIMEOUT'

function modelInfo(provider: string, model: DashScopeCatalogModel): LlmModelInfo {
  return {
    provider,
    id: model.id,
    name: model.name ?? model.id,
    ...model.description === undefined ? {} : { description: model.description },
    inputModalities: ['text'],
  }
}

function providerRetryAfterMs(value: string | null): number | undefined {
  if (value === null) return undefined
  if (/^\d+$/.test(value)) {
    const delay = Number(value) * 1_000
    return Number.isFinite(delay) && delay > 0 ? delay : undefined
  }
  const delay = Date.parse(value) - Date.now()
  return Number.isFinite(delay) && delay > 0 ? delay : undefined
}

/** Extract the gateway's per-request id from a parsed body (success or error). NOT a response header. */
function requestIdOf(parsed: WireChunk): ReturnType<typeof ProviderRequestId> | undefined {
  const value = parsed.request_id ?? parsed.error?.request_id
  return value === undefined || value.length === 0 ? undefined : ProviderRequestId(value)
}

/**
 * Map an HTTP status to a stable LlmError code. The gateway's 404 is a model-level refusal
 * (the credential itself was accepted) → `MODEL_NOT_AVAILABLE`.
 * @param status - status of a non-2xx provider response.
 * @param error - parsed provider error body (top-level `code`/`message`, optionally nested under `error`).
 * @returns the normalized harness error code.
 */
export function httpErrorCode(status: number, error?: WireChunk): string {
  if (status === 401 || status === 403) return 'AUTH'
  if (status === 404) return 'MODEL_NOT_AVAILABLE'
  const detail = [error?.code, error?.error?.code, error?.message, error?.error?.message].filter(Boolean).join(' ')
  if (isQuotaExceededError(detail)) return QUOTA_EXCEEDED_CODE
  if (status === 429) return 'RATE_LIMIT'
  if (status === 400) {
    if (isContextWindowExceededError(detail)) return CONTEXT_WINDOW_EXCEEDED_CODE
    return 'INVALID_REQUEST'
  }
  if (status >= 500) return 'SERVER'
  return `HTTP_${status}`
}

/** Wrap a decoded error-body string as a single-chunk UTF-8 stream for {@link parseSse}. */
function bodyAsStream(text: string): ReadableStream<BufferSource> {
  const encoded = new TextEncoder().encode(text)
  return new ReadableStream({
    start(controller) { controller.enqueue(encoded); controller.close() },
  })
}

/**
 * Parse a non-2xx error body into a {@link WireChunk}. AGA frames 4xx errors as SSE
 * (`id:1\nevent:error\n:HTTP_STATUS/<status>\ndata:{code,message,request_id}`) but labels them
 * `application/json` (live-confirmed 2026-08-20: probe P2/P4 returned HTTP 400 with
 * `content-type: application/json` yet an SSE-framed body). Content-type is therefore NOT a
 * reliable discriminator. Try plain JSON first (404 bodies ARE plain JSON `{"error":{code,
 * message,type}}`); if that fails, drain via {@link parseSse} and JSON-parse the first non-empty
 * `data:` payload. Returns `undefined` when no payload is recoverable — the HTTP status still
 * classifies the failure via {@link httpErrorCode}, but `code`/`message`/`request_id` are lost.
 *
 * Before this helper, the `!response.ok` path called `response.json()`, which throws on the SSE
 * framing; the catch swallowed it, the message stayed generic (`DashScope API error (HTTP 400)`),
 * and the body's `code`/`message`/`request_id` were dropped — the operator lost the only thread
 * (`request_id`) into the gateway-side log. This restores them.
 * @param text - the raw non-2xx response body.
 * @returns the parsed error body, or `undefined` when neither plain JSON nor SSE `data:` JSON was recoverable.
 */
export async function parseErrorBody(text: string): Promise<WireChunk | undefined> {
  if (text.length === 0) return undefined
  try {
    return JSON.parse(text) as WireChunk
  } catch {
    // Not plain JSON — likely AGA's SSE-framed 4xx error wire shape. Drain to the first
    // non-empty `data:` payload and JSON-parse that. Content-type is intentionally NOT consulted:
    // AGA labels SSE-framed errors `application/json` (live-confirmed), so it would mislead.
  }
  for await (const data of parseSse(bodyAsStream(text))) {
    try { return JSON.parse(data) as WireChunk } catch { continue }
  }
  return undefined
}

/**
 * The DashScope direct-fetch adapter. One instance serves every model name it was registered
 * under (the harness model name IS the wire model name).
 *
 * One stable signal reaches both initial fetch and body reads. Caller aborts map to `ABORTED`;
 * the configured per-read idle watchdog maps to `TIMEOUT`.
 */
export class DashScopeAdapter extends LlmAdapter {
  constructor(private readonly config: DashScopeAdapterOptions) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'DashScope' }
  }

  override providerRetryPolicy(_provider: string): ResolvedRetryPolicy {
    return this.config.options().retryPolicy
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve(this.config.options().models.map(model => modelInfo(provider, model)))
  }

  override resolveModel(
    provider: string,
    model: string,
    _signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    const connection = this.config.options()
    const configured = connection.models.find(entry => entry.id === model)
    const contextWindow = configured?.contextWindow ?? connection.defaultContextWindow
    // Native protocol has no per-request thinking knob (thinking is model-bound), so this adapter
    // exposes no reasoning efforts: a caller setting `reasoningEffort` is rejected by the runtime
    // (`UNSUPPORTED_REASONING_EFFORT`). The data-agent controls thinking by model selection.
    return Promise.resolve({
      ...configured === undefined
        ? { provider, id: model, name: model, inputModalities: ['text' as const] }
        : modelInfo(provider, configured),
      context: { contextWindow },
      defaultMaxTokens: configured?.maxTokens ?? connection.maxTokens,
    })
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    // One resolution per stream call: connection facts and the credential freeze here and hold for
    // this whole request, so an in-flight stream never observes a configuration change.
    const connection = this.config.options()
    const apiKey = await this.config.resolveApiKey(connection)
    const userId = this.config.resolveUserId()
    const consumer = new AbortController()
    const upstream = options.signal === undefined
      ? consumer.signal
      : AbortSignal.any([options.signal, consumer.signal])
    using watchdog = idleWatchdog(upstream, connection.streamIdleTimeoutMs, STREAM_IDLE_TIMEOUT_CODE)
    const iterator = this.request(
      options,
      watchdog.signal,
      connection,
      apiKey,
      userId,
      () => { watchdog.pulse() },
    )[Symbol.asyncIterator]()
    let exhausted = false
    try {
      while (true) {
        const result = await watchdog.next(iterator)
        if (result.done) {
          exhausted = true
          return
        }
        yield result.value
      }
    } catch (error: unknown) {
      if (timeoutOf(watchdog.signal, STREAM_IDLE_TIMEOUT_CODE) !== undefined) {
        throw new LlmError(
          `DashScope stream idle timeout after ${connection.streamIdleTimeoutMs}ms`,
          'TIMEOUT',
          { cause: error },
        )
      }
      if (options.signal?.aborted) {
        throw new LlmError('DashScope request aborted by caller', 'ABORTED', { cause: error })
      }
      if (error instanceof LlmError) throw error
      throw new LlmError(`DashScope API stream from ${connection.baseURL} failed`, 'TRANSPORT', { cause: error })
    } finally {
      consumer.abort('DashScope stream consumer stopped')
      if (!exhausted && iterator.return !== undefined) {
        try {
          await iterator.return()
        } catch (_abortedTransportTeardown) {
          // The consumer controller already owns termination; a return-time abort cannot add a second outcome.
        }
      }
    }
  }

  private async * request(
    options: GenerateOptions,
    signal: AbortSignal,
    connection: DashScopeConnectionOptions,
    apiKey: string,
    userId: AnonymousUserId,
    onComment: () => void,
  ): AsyncIterable<StreamChunk> {
    const body = serializeRequest(options, connection.defaults)
    // Prepared outside the try so the TRANSPORT label below covers exactly the transport boundary.
    const payload = JSON.stringify(body)
    const headers = {
      'authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'accept': 'text/event-stream',
      // Native streaming trigger (DashScope protocol), NOT a harness attribution header.
      'X-DashScope-SSE': 'enable',
      ...attributionHeaders(),
      'x-dashscope-harness-user-id': String(userId),
      ...options.sessionId !== undefined
        ? { 'x-dashscope-harness-session-id': String(options.sessionId) }
        : {},
      ...options.purpose === 'compaction'
        ? { 'x-dashscope-harness-compact': '1' }
        : {},
    }

    // TODO(http): adopt the Cordis HTTP service when shared transport configuration outweighs its dependencies.
    let response: Response
    try {
      // baseURL IS the full generation URL — POST it directly (no path suffix).
      response = await fetch(connection.baseURL, {
        method: 'POST',
        headers,
        body: payload,
        signal,
      })
    } catch (error: unknown) {
      if (signal.aborted) throw error
      throw new LlmError(
        `DashScope API request to ${connection.baseURL} failed`,
        'TRANSPORT',
        { cause: error },
      )
    }

    if (!response.ok) {
      let message = `DashScope API error (HTTP ${response.status})`
      let parsed: WireChunk | undefined
      try {
        parsed = await parseErrorBody(await response.text())
        const text = parsed?.message ?? parsed?.error?.message
        if (text) message = text
      } catch {
        // Only swallow error-body parsing: the HTTP status still identifies the failure.
      }
      const delay = providerRetryAfterMs(response.headers.get('retry-after'))
      // request_id is in the error BODY, not a response header (live-confirmed).
      const id = parsed !== undefined ? requestIdOf(parsed) : undefined
      throw new LlmError(message, httpErrorCode(response.status, parsed), {
        status: response.status,
        ...delay === undefined ? {} : { providerRetryAfterMs: delay },
        ...id === undefined ? {} : { requestId: id },
      })
    }
    if (!response.body) {
      throw new LlmError('DashScope API returned no response body', 'EMPTY_RESPONSE')
    }

    yield* translate(parseSse(response.body, onComment))
  }
}
