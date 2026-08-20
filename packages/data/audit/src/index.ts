/**
 * `ctx.audit` service — relational per-user audit for the DeepSeek Harness.
 *
 * Three audit surfaces, all observe-only (never block the pipeline):
 *   - tool-audit: observe `tools/post-execute` (fires for allowed AND denied
 *     calls — a deny shows up as `result.isError === true` with the deny reason
 *     in `result.error.message`; there is no `decision` param in the real
 *     Cordis signature, unlike the P8 prototype's stand-in). Captures tool_name,
 *     args_hash, outcome, and — for a `qoder_call` — the G3 Credits
 *     (`total_cost_usd`/`total_credits?`/`usage`/`modelUsage`) read from the
 *     delegating tool's canonical `result.value.costs` (surfaced additively by
 *     the P3 `subagent-qoder` change; execution-local, never persisted).
 *   - session-event: observe `session/event` (emit; `(session, event)` —
 *     `event.type` + `event.data`).
 *   - tier-2 write: `recordTier2Write` helper (hash NOT body, fail-silent).
 *
 * P8b decisions baked in: ①a verdict-only `patch` (identity fields not
 * patchable — corrected by `appendCorrection`) + ②c `stats` (immutable) +
 * `correctedStats` (override-applied), both on the owned `SQLiteAuditStore`.
 *
 * Identity today: per-user `user_id` / `scope_id` / `tenant_id` are NULL (T1
 * fallback, P8 D6) — the harness has no per-user login-state seam yet (only an
 * anonymous install id); `session_id` is read from the calling agent's session
 * / the session-event subject. P9's `@deepseek-ai/dsh-admin` will populate the
 * per-user login-state ctx that `resolveIdentity` reads (a small additive wire
 * then). This mirrors P3's MVP (resolves the PAT with no `{userId}` address).
 *
 * The store opens synchronously in the constructor (one-time `mkdirSync` +
 * `openSync`) so `ctx.audit.store` is available immediately after the service
 * loads — no `[Service.init]` timing window where a tool call could fire before
 * the store is ready. A regular `_store` field (not an ES private `#store`)
 * because cordis proxies Services and ES private fields are unreachable
 * through the Proxy.
 *
 * @module @deepseek-ai/dsh-audit
 */

import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { JsonValue, Session, SessionEvent } from '@deepseek-ai/dsh-session'
// Type-only: loads the `tools/*` Events augmentation so `ctx.on('tools/post-execute', …)`
// is typed (signature, PostToolDecision return). The seam stays runtime-optional.
import type {} from '@deepseek-ai/dsh-tools'
import { fromPayload, TAG, type AuditRecord } from './schema.ts'
import { SQLiteAuditStore, openAuditDatabase, type AuditIdentity } from './store.ts'

export { fromPayload, toPayload, TAG, IDENTITY_FIELDS, type AuditRecord } from './schema.ts'
export {
  SQLiteAuditStore,
  openAuditDatabase,
  type AuditCaller,
  type AuditIdentity,
  type AuditQueryFilter,
  type AuditRecordWithHistory,
  type AuditStats,
} from './store.ts'

/** Audit service configuration. */
export interface AuditConfig {
  /**
   * Filesystem path to the audit SQLite database file, or `:memory:` (tests).
   * Missing directories and the database file are created owner-only (0o700 /
   * 0o600) — intranet-security-first. Production default `var/audit/audit.db`.
   */
  readonly path: string
}

function newLogId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 8)
}
function nowIso(): string {
  return new Date().toISOString()
}

interface ToolExecView {
  readonly name: string
  readonly arguments?: unknown
  readonly agent?: { readonly session?: { readonly id?: unknown } } | undefined
}

interface ToolResultView {
  readonly isError: boolean
  readonly value?: JsonValue
  readonly content?: readonly unknown[]
  readonly error?: { readonly message: string; readonly info?: unknown }
}

interface Tier2WriteOpts {
  readonly scope_id?: string | null
  readonly tenant_id?: string | null
  readonly user_id?: string | null
  readonly session_id?: string | null
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    audit: Audit
  }
}

/**
 * Per-user audit service. Owns a {@link SQLiteAuditStore} (opened synchronously
 * in the constructor) and registers observe-only `tools/post-execute` +
 * `session/event` listeners. The store is a sibling seam (`ctx.audit`), NOT
 * routed through `ctx.storage` (KV-only — no relational tables/indexes).
 */
export class Audit extends Service {
  static Config: z<AuditConfig> = z.object({
    path: z.string().required(),
  })

  private readonly _store: SQLiteAuditStore

  constructor(ctx: Context, config: AuditConfig) {
    super(ctx, 'audit')
    this._store = new SQLiteAuditStore(openAuditDatabase(config.path))
    this.ctx.on('tools/post-execute', async (exec, result, next) => {
      try {
        this.recordTool(exec, result)
      } catch (error) {
        this.ctx.logger.warn(`[audit] tool-audit 留痕失败: tool=${exec.name}: ${(error as Error).message}`)
      }
      return next()
    })
    this.ctx.on('session/event', (session, event) => {
      try {
        this.recordSessionEvent(session, event)
      } catch (error) {
        this.ctx.logger.warn(`[audit] session-event 留痕失败: ${event.type}: ${(error as Error).message}`)
      }
    })
    this.ctx.effect(() => () => {
      this._store.close()
    }, 'audit.closeStore')
  }

  /** The opened store. */
  get store(): SQLiteAuditStore {
    return this._store
  }

  /**
   * Resolve the per-request caller identity (user/scope/tenant). T1 fallback:
   * returns empty (→ NULL columns) because the harness has no per-user
   * login-state seam yet. P9's `@deepseek-ai/dsh-admin` will populate the
   * login-state ctx this reads — a small additive wire then (same ctx P3's
   * `resolve(ref, {userId})` will read). `session_id` is read separately
   * (from the calling agent's session / the session-event subject), not here.
   */
  protected resolveIdentity(): AuditIdentity {
    return {}
  }

  /**
   * Record one tool call from `tools/post-execute` (allowed or denied). A
   * `qoder_call` tag is emitted when the delegating tool surfaced G3 Credits
   * (`result.value.costs`); a denied call is captured as `isError` with the
   * deny reason in `result.error.message` (the real API has no `decision`
   * param, so a distinct `guard_deny` tag is not auto-emitted here — record
   * one explicitly via {@link record} from the P10 intranet tool-gate).
   */
  recordTool(exec: ToolExecView, result: ToolResultView): void {
    const identity = this.resolveIdentity()
    const costs = extractCosts(result)
    const extra: Record<string, unknown> = {
      tool_name: exec.name,
      args_hash: this._store.hashBody(JSON.stringify(exec.arguments ?? {})),
    }
    let tags: readonly string[]
    if (result.isError) {
      extra.is_error = true
      extra.error = result.error?.message ?? null
      if (result.error?.info !== undefined) extra.error_info = result.error.info
      tags = ['tool_call']
    } else {
      extra.is_error = false
      const summary = summarizeSuccess(result)
      if (summary !== null) extra.result_summary = summary
      if (costs !== undefined) {
        extra.credits = costs
        tags = [TAG.QODER_CALL]
      } else {
        tags = ['tool_call']
      }
    }
    const args = exec.arguments as { model?: string } | undefined
    const sessionId = exec.agent?.session?.id
    const rec = fromPayload({
      log_id: newLogId(),
      timestamp: nowIso(),
      session_id: sessionId === undefined || sessionId === null ? null : String(sessionId),
      scope_id: identity.scope_id ?? null,
      tenant_id: identity.tenant_id ?? null,
      user_id: identity.user_id ?? null,
      model: args?.model ?? null,
      auto_tags: tags,
      extra,
    })
    this._store.append(rec)
  }

  /** Record one `session/event` (emit; observe-only). */
  recordSessionEvent(session: Session, event: SessionEvent): void {
    const identity = this.resolveIdentity()
    const rec = fromPayload({
      log_id: newLogId(),
      timestamp: nowIso(),
      session_id: session.id === undefined ? null : String(session.id),
      scope_id: identity.scope_id ?? null,
      tenant_id: identity.tenant_id ?? null,
      user_id: identity.user_id ?? null,
      auto_tags: [TAG.SESSION_EVENT],
      extra: { event_type: event.type, details: (event as { data?: unknown }).data ?? null },
    })
    this._store.append(rec)
  }

  /**
   * Tier-2 persistent-write 留痕 (mirror RBI record_tier2_write). Hash, NOT
   * body — answers "who/when/which scope/which version", not the content
   * (intranet-security-first). Fail-silent: a 留痕 failure never breaks the
   * business write. Called by P6 semantic-layer etc.
   */
  recordTier2Write(toolName: string, payload: unknown, opts: Tier2WriteOpts = {}): string {
    const identity = this.resolveIdentity()
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
    const rec = fromPayload({
      log_id: newLogId(),
      timestamp: nowIso(),
      session_id: opts.session_id ?? null,
      scope_id: opts.scope_id ?? identity.scope_id ?? null,
      tenant_id: opts.tenant_id ?? identity.tenant_id ?? null,
      user_id: opts.user_id ?? identity.user_id ?? null,
      auto_tags: [TAG.TOOL_WRITE],
      extra: {
        tier: 'tier-2',
        tool_name: toolName,
        payload_hash: this._store.hashBody(body),
        payload_bytes: Buffer.byteLength(body),
      },
    })
    try {
      return this._store.append(rec)
    } catch (error) {
      this.ctx.logger.warn(`[audit] Tier-2 留痕失败（业务写入不受影响）: tool=${toolName}: ${(error as Error).message}`)
      return rec.log_id
    }
  }

  /** Direct record (test hook + explicit `guard_deny`/correction tagging). */
  record(rec: AuditRecord | Record<string, unknown>): string {
    return this._store.append(rec)
  }
}

/**
 * Extract G3 Credits from a foreground subagent tool result's canonical value
 * (`{ kind:'foreground', …, costs? }`). The costs object is the
 * `SubagentCosts` surfaced additively by the P3 `subagent-qoder` change;
 * absent for providers that do not report costs (claude-code today).
 */
function extractCosts(result: { readonly isError: boolean; readonly value?: JsonValue }): unknown {
  if (result.isError) return undefined
  const value = result.value
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return undefined
  const costs = (value as Record<string, unknown>).costs
  if (costs === undefined || costs === null || typeof costs !== 'object' || Array.isArray(costs)) return undefined
  return costs
}

/** Best-effort short text summary of a successful tool result's content. */
function summarizeSuccess(result: { readonly content?: readonly unknown[] }): string | null {
  const content = result.content
  if (content === undefined) return null
  const texts: string[] = []
  for (const block of content) {
    if (block !== null && typeof block === 'object' && (block as { type?: string }).type === 'text') {
      const text = (block as { text?: string }).text
      if (typeof text === 'string') texts.push(text)
    }
  }
  const joined = texts.join('')
  return joined.length > 0 ? joined.slice(0, 80) : null
}

export default Audit
