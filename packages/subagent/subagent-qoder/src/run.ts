/**
 * One-shot Qoder lifecycle: invoke the official Qoder Agent SDK, resolve the
 * PAT through the credentials seam per operation, map only a strict SDK
 * success to completion, and dispose to query quiescence.
 *
 * The Qoder `SDKResultMessage` is Claude-shaped (`subtype`/`is_error`/`result`),
 * so the claude-code `successfulResult` / `consumeClaudeQuery` extraction
 * transfers verbatim — see `wayfinder/data-agent/research/qoder-sdk-dts.md`.
 * The Qoder SDK defaults to `WorkerTransport` (an obfuscated in-process worker
 * runtime downloaded at install), so unlike claude-code there is no external
 * CLI process to resolve or terminate: `Query.close()` is the whole teardown.
 *
 * @module @deepseek-ai/dsh-subagent-qoder/run
 */

import { randomUUID } from 'node:crypto'
import {
  accessToken,
  query as qoderQuery,
  type Options,
  type Query,
  type SDKMessage,
  type SDKResultMessage,
} from '@qoder-ai/qoder-agent-sdk'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { SessionId, type JsonValue } from '@deepseek-ai/dsh-session'
import {
  settleRunResult,
  subprocessRunHandle,
  type SubagentCosts,
  type SubagentResult,
  type SubagentRun,
  type SubagentStartRequest,
  type SubagentStopReason,
} from '@deepseek-ai/dsh-subagent'

/** Default POSIX grace for Qoder query teardown. */
export const DEFAULT_DISPOSE_GRACE_MS = 3_000

/* jscpd:ignore-start -- sibling providers intentionally keep product-private
 * run inputs and error normalization instead of adding a shared owner. */
/** Fully resolved inputs for one official Qoder Agent SDK query. */
export interface QoderRunSpec {
  /** Parent Session workspace supplied to the SDK. */
  readonly cwd: string
  /** Qoder platform model id forwarded as `options.model`; omit for Qoder's default. */
  readonly model?: string | undefined
  /** Resolved Qoder PAT value, forwarded as `options.auth` via `accessToken(value)`. */
  readonly pat: string
  /** Grace passed to the shared teardown path. */
  readonly disposeGraceMs: number
  /** Diagnostic sink for a post-publication error flattened into a result. */
  readonly onError?: (error: Error, stopReason: SubagentStopReason) => void
}

function thrown(value: unknown): Error {
  /* v8 ignore next -- typed SDK failures reject with Error. */
  return value instanceof Error ? value : new Error(String(value))
}
/* jscpd:ignore-end */

/**
 * Validate and preserve the one-shot task before crossing the SDK boundary.
 * @param prompt - task content accepted from the shared subagent service.
 * @returns the exact text sequence as one SDK prompt.
 */
export function textTask(prompt: readonly ContentBlock[]): string {
  if (prompt.length === 0) {
    throw new Error('subagent-qoder: the one-shot task must contain only text blocks')
  }
  const texts: string[] = []
  for (const block of prompt) {
    if (block.type !== 'text') {
      throw new Error('subagent-qoder: the one-shot task must contain only text blocks')
    }
    texts.push(block.text)
  }
  if (texts.every(text => text.trim().length === 0)) {
    throw new Error('subagent-qoder: the one-shot task must not be empty')
  }
  return texts.join('')
}

/**
 * Strictly derive the only SDK result that can complete a shared run. The
 * Qoder `SDKResultMessage` is Claude-shaped (`subtype`/`is_error`/`result`),
 * so the same strict-success rule as the claude-code precedent applies.
 * @param message - an official discriminated result union.
 * @returns exact final text for a successful, non-error result.
 */
export function successfulResult(message: SDKResultMessage): string {
  if (
    message.subtype !== 'success'
    || message.is_error
    || message.result.trim().length === 0
  ) {
    const detail = message.subtype === 'success'
      ? 'success result was marked as an error or contained no answer'
      : message.errors.join('; ') || message.subtype
    throw new Error('subagent-qoder: Qoder failed: ' + detail)
  }
  return message.result
}

/**
 * Capture Qoder cost telemetry from a strict-success SDK result for audit (the
 * G3 per-user Credits driver). Reads the `SDKResultSuccess` cost fields
 * (`total_cost_usd` / `total_credits?` / `usage` / `modelUsage`, per
 * `wayfinder/data-agent/research/qoder-sdk-dts.md`) before the SDK result is
 * otherwise consumed; the values are execution-local (the agent loop persists
 * only `content`/`error`/`meta`), so they reach an audit `tools/post-execute`
 * observer through the delegating tool's canonical `result.value.costs`
 * without ever entering the durable session log. Returns `undefined` for a
 * non-success message or when the success carries no cost telemetry (a fixture
 * or an SDK shape without costs), so existing consumers see the unchanged
 * `{ output, stopReason }` shape; the caller never reaches the error path
 * because {@link successfulResult} throws first.
 * @param message - an official discriminated result union.
 * @returns the captured cost telemetry, or `undefined` when absent.
 */
function qoderCosts(message: SDKResultMessage): SubagentCosts | undefined {
  if (message.subtype !== 'success') return undefined
  // The success branch carries the cost fields (research/qoder-sdk-dts.md);
  // read through a narrow local view so a loosely-typed SDK cannot break
  // compilation, while runtime correctness rests on the documented shape.
  const success = message as unknown as {
    total_cost_usd?: number
    total_credits?: number
    usage?: JsonValue
    modelUsage?: JsonValue
  }
  // `total_cost_usd` is required on a real SDKResultSuccess, but a fixture or
  // an SDK shape without cost telemetry leaves it absent; omit costs then so
  // the SubagentResult keeps its { output, stopReason } shape for existing
  // consumers.
  if (success.total_cost_usd === undefined) return undefined
  return {
    total_cost_usd: success.total_cost_usd,
    ...(success.total_credits !== undefined ? { total_credits: success.total_credits } : {}),
    ...(success.usage !== undefined ? { usage: success.usage } : {}),
    ...(success.modelUsage !== undefined ? { modelUsage: success.modelUsage } : {}),
  }
}

/**
 * Consume the complete SDK stream and require one strict success plus normal
 * iterator completion. Non-`result` messages (assistant reasoning, tool
 * activity, status, api_retry, model_queue_status, hooks, tasks,
 * permission_denied, cloud_agent_event, etc.) are noise for a terminal-only
 * run and are skipped without narrowing their loosely-typed deltas — so
 * `includePartialMessages` stays false and the loose `stream_event` deltas
 * are never emitted, avoiding runtime-narrowing cost entirely. The strict
 * success's cost telemetry is captured into {@link SubagentResult.costs} for
 * an audit `tools/post-execute` observer (G3 driver); it is execution-local
 * and never persisted.
 * @param query - published official Qoder SDK query.
 * @returns the completed shared result.
 */
export async function consumeQoderQuery(
  query: AsyncIterable<SDKMessage>,
): Promise<SubagentResult> {
  let answer: string | undefined
  let costs: SubagentCosts | undefined
  for await (const message of query) {
    if (message.type !== 'result') continue
    answer = successfulResult(message)
    costs = qoderCosts(message)
  }
  if (answer === undefined) {
    throw new Error('subagent-qoder: Qoder ended without a result')
  }
  return {
    output: [{ type: 'text', text: answer }],
    stopReason: 'completed',
    ...(costs !== undefined ? { costs } : {}),
  }
}

/**
 * Close the official Qoder query. The SDK owns its worker runtime, so unlike
 * the claude-code process-tree teardown there is no external process to
 * terminate; `Query.close()` is the whole teardown.
 * @param query - official Qoder SDK query, when creation reached that point.
 */
export async function disposeQoderQuery(
  query: Pick<Query, 'close'> | undefined,
): Promise<void> {
  if (query === undefined) return
  await query.close()
}

/**
 * Build the fixed official SDK options for one one-shot provider run. Auth is
 * the PAT resolved through the credentials seam, passed explicitly via
 * `accessToken(value)` — never `accessTokenFromEnv()`, which would require the
 * PAT in `process.env` and conflicts with intranet-security-first. The run is
 * pinned terminal-only: no partial messages, no persisted session, and no
 * interactive AskUserQuestion.
 * @param spec - Workspace, model, PAT, and disposal policy.
 * @param controller - per-run cancellation owner.
 * @returns options for one terminal-only one-shot Qoder query.
 */
export function qoderQueryOptions(
  spec: QoderRunSpec,
  controller: AbortController,
): Options {
  const options: Options = {
    abortController: controller,
    cwd: spec.cwd,
    auth: accessToken(spec.pat),
    persistSession: false,
    disallowedTools: ['AskUserQuestion'],
    closeGraceMs: spec.disposeGraceMs,
  }
  if (spec.model !== undefined) {
    options.model = spec.model
  }
  return options
}

/**
 * Start one official Qoder Agent SDK query and publish its one-shot run.
 *
 * `query()` returns its `AsyncGenerator<SDKMessage>` synchronously; the worker
 * spawn, the `system/init` wire-protocol handshake (which may throw
 * `ProtocolVersionMismatchError` on a cross-major mismatch), and the agent
 * loop all happen during iteration — i.e. post-publication, so they settle
 * through `settleRunResult` as `error` (or `aborted`) rather than rejecting
 * `start()`. Only a synchronous construction failure (rare) rejects
 * `start()` through the startup catch below.
 * @param request - resolved shared subagent request.
 * @param spec - Workspace, model, PAT, and diagnostic policy.
 * @returns the published run after the Query exists.
 */
export async function startQoderRun(
  request: SubagentStartRequest,
  spec: QoderRunSpec,
): Promise<SubagentRun> {
  const prompt = textTask(request.prompt)
  if (request.signal.aborted) {
    throw new Error('subagent-qoder: request was aborted before SDK startup')
  }

  const controller = new AbortController()
  const requestCancel = (): void => {
    if (!controller.signal.aborted) {
      controller.abort(new Error('subagent-qoder: run cancelled locally'))
    }
  }
  const onAbort = (): void => { requestCancel() }
  request.signal.addEventListener('abort', onAbort, { once: true })

  let query: Query | undefined
  try {
    query = qoderQuery({
      prompt,
      options: qoderQueryOptions(spec, controller),
    })
    if (controller.signal.aborted) {
      throw new Error('subagent-qoder: request was aborted before SDK startup')
    }
  } catch (error: unknown) {
    request.signal.removeEventListener('abort', onAbort)
    const cancelledBeforeCleanup = controller.signal.aborted
    requestCancel()
    if (query !== undefined) {
      try {
        await disposeQoderQuery(query)
      } catch (disposeError: unknown) {
        throw new AggregateError(
          [thrown(error), thrown(disposeError)],
          'subagent-qoder: startup failed and query cleanup also failed',
        )
      }
    }
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- the request can abort while cleanup is awaited.
    if (cancelledBeforeCleanup || request.signal.aborted) {
      throw new Error('subagent-qoder: request was aborted before SDK startup')
    }
    throw thrown(error)
  }

  const publishedQuery = query
  const result = settleRunResult({
    attempt: () => consumeQoderQuery(publishedQuery),
    collectOutput: () => [],
    cancelled: () => controller.signal.aborted,
    onError: spec.onError,
    signal: request.signal,
    onAbort,
  })

  return subprocessRunHandle({
    id: SessionId(randomUUID()),
    result,
    signal: request.signal,
    onAbort,
    requestCancel,
    teardown: () => disposeQoderQuery(publishedQuery),
  })
}
