/**
 * Register a {@link DashScopeAdapter} for the `aga` provider route on `ctx.llm`, against
 * the AGA AI Gateway's DashScope native text-generation endpoint. Connection facts resolve per
 * request instead of frozen at load: the plugin layers its `cordis.yml` entry config under the
 * optional `llm-dashscope` user-settings section (`ctx.settings`) and resolves the API key through
 * the optional credential seam (`ctx.credentials`), so a changed base URL, catalog, or key reaches
 * the very next request without restarting anything, while an in-flight stream keeps the facts it
 * started with. The one registration-captured fact — the retry policy — re-registers the route in
 * place when it changes. Model discovery (`GET /api/v1/models`) is offered through the harness
 * discovery seam for the same settings namespace.
 *
 * Native protocol (NOT OpenAI-compatible): no per-request thinking knob (thinking is model-bound),
 * so the Config carries no `thinking`/`reasoningEffort` and the adapter exposes no reasoning
 * efforts — the data-agent controls thinking by model selection.
 *
 * @module @deepseek-ai/dsh-llm-dashscope
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { assertUsableApiKey, LlmError, resolveRetryPolicy, RetryPolicySchema } from '@deepseek-ai/dsh-llm'
import type { LlmDiscoveredModel, LlmModelDiscoveryRequest, RetryPolicyConfig } from '@deepseek-ai/dsh-llm'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf, type LaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment'
import { deepEqualJson, installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { getOrCreateAnonymousUserId, type AnonymousUserId } from '@deepseek-ai/dsh-anonymous-user-id'
import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MAX_TOKENS,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  DashScopeAdapter,
} from './adapter.ts'
import type { DashScopeCatalogModel, DashScopeConnectionOptions } from './adapter.ts'
import { httpErrorCode } from './adapter.ts'

export {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MAX_TOKENS,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  DashScopeAdapter,
} from './adapter.ts'
export type { DashScopeAdapterOptions, DashScopeCatalogModel, DashScopeConnectionOptions } from './adapter.ts'
export type { RequestDefaults } from './serialize.ts'
export type * from './types.ts'

export const name = 'llm-dashscope'
export const inject = ['llm']

const NS = settingsNamespace('llm-dashscope')
const DEFAULT_API_KEY_ENV = 'DASHSCOPE_API_KEY'
/** The single provider route this plugin owns. */
const PROVIDER = 'aga'

const DEFAULT_MODELS: DashScopeCatalogModel[] = [
  { id: 'qwen-flash', name: 'Qwen-Flash' },
  { id: 'qwen-plus', name: 'Qwen-Plus' },
  { id: 'qwen3.7-max', name: 'Qwen3.7-Max' },
  { id: 'qwen3.6-plus', name: 'Qwen3.6-Plus' },
]

/**
 * Plugin config, validated by the same-named schemastery schema and doubling as the `llm-dashscope`
 * settings-section shape. Every field is optional in yml: a missing API key resolves through
 * {@link Config.apiKeyEnv} at each request (a request without any key fails with
 * `MISSING_CREDENTIAL`, not at plugin load). No `thinking`/`reasoningEffort` — the native protocol
 * has no per-request thinking knob.
 */
export interface Config {
  /** Credential reference (environment-variable name) resolved per request; defaults to `DASHSCOPE_API_KEY`. */
  apiKeyEnv?: string
  /**
   * Endpoint base (the full generation URL); falls back to $DASHSCOPE_BASE_URL from a trusted
   * environment layer, then the public AGA gateway.
   */
  baseURL?: string
  /** Default per-request output cap (default 8,192); a model's own cap and explicit request values win. */
  maxTokens?: number
  /**
   * Positive context capacity used when the selected model has no exact value (default
   * 131,072; provisional — qwen model-specific windows not in `/api/v1/models`).
   */
  defaultContextWindow?: number
  /** Advisory models shown by discovery consumers; defaults to a qwen subset. */
  models?: DashScopeCatalogModel[]
  /**
   * Maximum provider idle time while one stream read is outstanding (default five minutes;
   * the gateway queues under load, so keep generous).
   */
  streamIdleTimeoutMs?: number
  /** Provider-owned model-request retry policy; omission uses normal defaults. */
  retryPolicy?: RetryPolicyConfig
}

const catalogModel: z<DashScopeCatalogModel> = z.object({
  id: z.string().required(),
  name: z.string(),
  description: z.string(),
  contextWindow: z.number().step(1).min(1),
  maxTokens: z.number().step(1).min(1),
})

export const Config: z<Config> = z.object({
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  baseURL: z.string(),
  maxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_MAX_TOKENS),
  defaultContextWindow: z.number().step(1).min(1).default(DEFAULT_CONTEXT_WINDOW),
  models: z.array(catalogModel).default(DEFAULT_MODELS),
  streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
  retryPolicy: RetryPolicySchema,
})

/**
 * Public API default (pre-prod AGA gateway). The internal endpoint comes from $DASHSCOPE_BASE_URL
 * or an explicit `baseURL` (the full generation URL — POSTed directly, no path suffix).
 */
export const PUBLIC_BASE_URL = 'https://pre-aga-ai-gateway.alibaba-inc.com/api/v1/services/aigc/text-generation/generation'

/** Environment variable naming this provider's endpoint, honored only from trusted layers. */
const BASE_URL_ENV = 'DASHSCOPE_BASE_URL'

/** One resolution's complete request facts. */
export type ResolvedDashScopeOptions = DashScopeConnectionOptions

/** Resolve, validate, and detach the advisory model catalog. */
function resolveModels(models: readonly DashScopeCatalogModel[] | undefined): DashScopeCatalogModel[] {
  const seen = new Set<string>()
  return (models ?? DEFAULT_MODELS).map((model) => {
    if (model.id.length === 0) throw new Error('llm-dashscope: catalog model ids must be non-empty')
    if (model.name !== undefined && model.name.length === 0) {
      throw new Error(`llm-dashscope: catalog model "${model.id}" has an empty name`)
    }
    if (model.contextWindow !== undefined
      && (!Number.isInteger(model.contextWindow) || model.contextWindow <= 0)) {
      throw new Error(`llm-dashscope: catalog model "${model.id}" contextWindow must be a positive integer`)
    }
    if (model.maxTokens !== undefined
      && (!Number.isInteger(model.maxTokens) || model.maxTokens <= 0)) {
      throw new Error(`llm-dashscope: catalog model "${model.id}" maxTokens must be a positive integer`)
    }
    if (seen.has(model.id)) throw new Error(`llm-dashscope: duplicate catalog model "${model.id}"`)
    seen.add(model.id)
    return {
      id: model.id,
      ...model.name === undefined ? {} : { name: model.name },
      ...model.description === undefined ? {} : { description: model.description },
      ...model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow },
      ...model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens },
    }
  })
}

/**
 * The one explicit resolve step from raw config to validated connection facts.
 * @param config - raw plugin config or resolved settings snapshot.
 * @param environment - this run's environment layers, or `undefined` outside the product CLI.
 * @returns validated connection facts plus the credential reference.
 */
export function resolveAdapterOptions(config: Config, environment?: LaunchEnvironmentSnapshot): ResolvedDashScopeOptions {
  if (config.defaultContextWindow !== undefined
    && (!Number.isInteger(config.defaultContextWindow) || config.defaultContextWindow <= 0)) {
    throw new Error('llm-dashscope: defaultContextWindow must be a positive integer')
  }
  if (config.maxTokens !== undefined
    && (!Number.isSafeInteger(config.maxTokens) || config.maxTokens <= 0)) {
    throw new Error('llm-dashscope: maxTokens must be a positive safe integer')
  }
  const streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS
  if (!Number.isFinite(streamIdleTimeoutMs)
    || streamIdleTimeoutMs <= 0
    || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(
      `llm-dashscope: streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`,
    )
  }
  return {
    apiKeyEnv: credentialRef(config.apiKeyEnv ?? DEFAULT_API_KEY_ENV),
    baseURL: config.baseURL
      ?? environment?.get(BASE_URL_ENV)?.value
      ?? PUBLIC_BASE_URL,
    defaults: {},
    maxTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
    defaultContextWindow: config.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW,
    models: resolveModels(config.models),
    streamIdleTimeoutMs,
    retryPolicy: resolveRetryPolicy(config.retryPolicy, 'llm-dashscope: retryPolicy'),
  }
}

/**
 * Interrogate the AGA gateway's live model list (`GET {origin}/api/v1/models`). The discovery
 * request carries the endpoint + one-shot credential directly (a provider being added has no
 * route to name); the origin is derived from the supplied generation `baseURL`.
 */
async function discoverModels(request: LlmModelDiscoveryRequest): Promise<LlmDiscoveredModel[]> {
  if ((request.baseURL ?? '').length === 0) {
    throw new LlmError('DashScope model discovery needs a baseURL', 'INVALID_DISCOVERY')
  }
  const origin = new URL(request.baseURL as string).origin
  let response: Response
  try {
    response = await fetch(`${origin}/api/v1/models`, {
      headers: { Authorization: `Bearer ${request.apiKey ?? ''}` },
      signal: request.signal ?? null,
    })
  } catch (error: unknown) {
    throw new LlmError(`DashScope /models request to ${origin} failed`, 'TRANSPORT', { cause: error })
  }
  if (!response.ok) {
    throw new LlmError(`DashScope /models HTTP ${response.status}`, httpErrorCode(response.status))
  }
  const data = await response.json() as { models?: string[] }
  const seen = new Set<string>()
  const models: LlmDiscoveredModel[] = []
  for (const id of data.models ?? []) {
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) continue
    seen.add(id)
    models.push({ id })
  }
  return models
}

export function apply(ctx: Context, config: Config): void {
  let current: () => Config = () => config
  let lastRaw: Config | undefined
  let lastGood: ResolvedDashScopeOptions | undefined
  const options = (): ResolvedDashScopeOptions => {
    const raw = current()
    if (raw === lastRaw && lastGood !== undefined) return lastGood
    try {
      const next = resolveAdapterOptions(raw, launchEnvironmentOf(ctx))
      lastRaw = raw
      lastGood = next
      return next
    } catch (error) {
      if (lastGood === undefined) throw error
      lastRaw = raw
      ctx.logger.error('llm-dashscope: keeping the last good configuration after an invalid settings section')
      ctx.logger.error(error)
      return lastGood
    }
  }
  options()

  const resolveApiKey = async (connection: ResolvedDashScopeOptions): Promise<string> => {
    const ref = connection.apiKeyEnv
    const credentials = ctx.get('credentials')
    if (credentials !== undefined) {
      const hit = await credentials.resolve(ref)
      if (hit !== undefined) return assertUsableApiKey(hit.value, 'llm-dashscope', ref)
    } else {
      const ambient = launchEnvironmentOf(ctx).get(ref)
      if (ambient !== undefined && ambient.value.length > 0) {
        return assertUsableApiKey(ambient.value, 'llm-dashscope', ref)
      }
    }
    throw new LlmError(
      `llm-dashscope: no API key for provider route "${PROVIDER}"; store ${ref} through the credentials`
      + ` service (the web Models page writes it), or export ${ref} in the launching environment`,
      'MISSING_CREDENTIAL',
    )
  }

  let userId: AnonymousUserId | undefined
  const resolveUserId = (): AnonymousUserId => userId ??= getOrCreateAnonymousUserId()
  const adapter = new DashScopeAdapter({ options, resolveApiKey, resolveUserId })
  ctx.llm.registerConfigurableProviders([
    { provider: PROVIDER, displayName: 'DashScope', settingsNs: NS, settingsPath: [] },
  ])
  ctx.llm.registerModelDiscovery(NS, discoverModels)
  const registration = ctx.llm.registerAdapter([PROVIDER], adapter)
  let registeredPolicy = options().retryPolicy
  const ensureRegistrationFacts = (): void => {
    const policy = options().retryPolicy
    if (deepEqualJson(policy, registeredPolicy)) return
    registration.replace([PROVIDER])
    registeredPolicy = policy
  }

  installSettingsSection(ctx, NS, Config, config, {
    setSource: (source) => {
      current = source
    },
    onChange: ensureRegistrationFacts,
  })
}
