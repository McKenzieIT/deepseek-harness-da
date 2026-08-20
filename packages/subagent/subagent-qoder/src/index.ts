/**
 * Fixed Qoder one-shot subagent provider. Every accepted run invokes the
 * official Qoder Agent SDK in the delegating Session's workspace, resolves the
 * Qoder PAT through the credentials seam per operation, and returns only the
 * terminal result through the shared `dsh-subagent` result contract.
 *
 * Terminal-only (mirrors the `subagent-claude-code` precedent): the provider
 * drains the complete SDK message stream and accepts only a successful `result`
 * message. Assistant reasoning, tool activity, and intermediate messages
 * remain Qoder-product-local and are not copied into the parent Session — an
 * external one-shot run is not trace-enumerable. Tool/reasoning visibility for
 * audit is deferred (open a follow-up only if P8/forensic confirms a need).
 *
 * Auth: the PAT is resolved per operation via `ctx.credentials.resolve` and
 * passed explicitly through `accessToken(value)` to `options.auth` — never
 * `accessTokenFromEnv()`, which would require the PAT in `process.env` and
 * conflicts with intranet-security-first. MVP resolves with no address (lands
 * the T1 global via the credentials seam fallback chain); threading a
 * per-user `{ userId }` is the P9-future path and needs no P3 core change.
 *
 * Model: `options.model` from config selects a Qoder platform model (consumes
 * the PAT holder's Credits). `resolveModel` pull-mode and BYOK
 * (`CustomModel` → route Qoder calls to a harness-owned LLM) are documented
 * future extensions; the SDK option is available, wiring the callback is
 * deferred until dynamic selection or BYOK is actually needed.
 *
 * @module @deepseek-ai/dsh-subagent-qoder
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
// Type-only: loads the `ctx.identity` declaration so `ctx.identity.current()`
// is typed. Identity is a HARD inject (see `inject` below) — the data-agent
// bundle mounts the identity stub, whose `current()` returns `undefined`, so
// `userId` is `undefined` and `resolve(ref, undefined)` takes the keychain's
// no-`userId`/fallback path — the T1 global PAT, no behavior change from the
// MVP. P9b populates `current()` and the same call resolves the per-user PAT.
import type {} from '@deepseek-ai/dsh-identity'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import {
  assertPositiveFinite,
  NO_START_CAPABILITIES,
  resolveChildCwd,
  type ResolvedSubagentStartRequest,
  type SubagentCapabilities,
  type SubagentProvider,
} from '@deepseek-ai/dsh-subagent'
import {
  DEFAULT_DISPOSE_GRACE_MS,
  startQoderRun,
  type QoderRunSpec,
} from './run.ts'

export const name = 'subagent-qoder'
export const inject = ['subagents', 'credentials', 'identity']

/**
 * Qoder Personal Access Token reference, resolved per operation through the
 * credentials seam. Stored by T1 in `~/.dsh/.credentials.yaml` (file layer,
 * 0600, never `process.env`); rotated by a human or P9 admin via
 * `ctx.credentials.set` — `credentials/updated` hot-reloads and the next
 * `resolve()` picks it up with no restart and no P3 participation.
 */
export const QODER_PERSONAL_ACCESS_TOKEN = credentialRef('QODER_PERSONAL_ACCESS_TOKEN')

/* jscpd:ignore-start -- sibling product providers intentionally expose a
 * small deployment-owned config surface without adding a shared owner. */
/** Deployment-owned model selection and process-release bound. */
export interface Config {
  /**
   * Qoder platform model id forwarded to the SDK as `options.model` (e.g.
   * `'auto'`, `'performance'`, or a named model). Omit to let Qoder choose.
   * Consumes the PAT holder's Qoder Credits.
   */
  readonly model?: string
  /** Grace in milliseconds for Qoder query teardown. */
  readonly disposeGraceMs?: number
}

export const Config: z<Config> = z.object({
  model: z.string(),
  disposeGraceMs: z.number().default(DEFAULT_DISPOSE_GRACE_MS),
})

type ResolvedConfig = { readonly model?: string; readonly disposeGraceMs: number }
/* jscpd:ignore-end */

/* jscpd:ignore-start -- Cordis registration and shared-seam plumbing mirror
 * the claude-code sibling; the Qoder lifecycle remains package-private. */
class QoderProvider implements SubagentProvider {
  readonly name = 'qoder'
  readonly capabilities: SubagentCapabilities = NO_START_CAPABILITIES
  readonly inheritsParentContext = false

  constructor(
    private readonly ctx: Context,
    private readonly config: ResolvedConfig,
  ) {}

  async start(request: ResolvedSubagentStartRequest) {
    const parentCwd = request.parent.session.header.cwd
    if (parentCwd === undefined) {
      throw new Error(
        'subagent-qoder: no working directory for the child — delegate from a parent session that has one',
      )
    }
    // G3 stable opportunistic per-user threading (decision 2): resolve this
    // caller's PAT when the identity seam has a user (P9 login); today
    // `current()` is `undefined` (T1 fallback), so `address` is `undefined`
    // and the keychain provider resolves the global PAT via its no-`userId`
    // path — no behavior change from the MVP. P9b populates `current()` and the
    // same call resolves the per-user PAT (the keychain's per-user slot).
    const userId = this.ctx.identity.current()?.userId
    const credential = await this.ctx.credentials.resolve(
      QODER_PERSONAL_ACCESS_TOKEN,
      userId === undefined ? undefined : { userId },
    )
    if (credential === undefined) {
      throw new Error(
        'subagent-qoder: QODER_PERSONAL_ACCESS_TOKEN is not configured — resolve it via the credentials seam before delegating (the SDK would throw auth_not_configured)',
      )
    }
    const spec: QoderRunSpec = {
      cwd: resolveChildCwd('subagent-qoder', undefined, parentCwd),
      model: this.config.model,
      pat: credential.value,
      disposeGraceMs: this.config.disposeGraceMs,
      onError: (error, stopReason) => {
        this.ctx.logger.warn(
          'subagent-qoder: child run failed (' + stopReason + '): ' + error.message,
        )
      },
    }
    return startQoderRun(request, spec)
  }
}

/**
 * Register the fixed `qoder` provider.
 * @param ctx - context carrying shared subagent and credentials services.
 * @param config - model selection and disposal grace.
 */
export function apply(ctx: Context, config: Config): void {
  const resolved = config as ResolvedConfig
  assertPositiveFinite('subagent-qoder', 'disposeGraceMs', resolved.disposeGraceMs)
  if (resolved.disposeGraceMs > MAX_TIMER_DELAY_MS) {
    throw new Error(
      'subagent-qoder: disposeGraceMs must be no greater than ' + MAX_TIMER_DELAY_MS,
    )
  }
  ctx.subagents.registerProvider(new QoderProvider(ctx, resolved))
}
/* jscpd:ignore-end */
