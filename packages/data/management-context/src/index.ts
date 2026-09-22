/**
 * Management Context service (`ctx.managementContext`): resolves a Management
 * Context — the pair `Workspace × Data Scope` — to a persistent Management
 * Session, using only upstream public interfaces.
 *
 * A resolution creates an ordinary Session through the public
 * `ctx.sessionController.create()`, pinned to the `semantic-layer-management`
 * preset, then records the managed Data Scope as a durable `data-scope/bound`
 * session event. The `dataScope` projection surfaces that binding to the
 * Session list without opening full history.
 *
 * Concurrency: {@link ManagementContextService.resolveOrCreate} is
 * single-flighted per `(workspaceId, dataScopeId)`. Two concurrent default
 * calls for the same context create exactly one session and return the same
 * `sessionId`.
 *
 * Idempotency and recovery: a default resolve re-derives the session from the
 * target Workspace's durable session membership and the persisted `dataScope`
 * and `agentPreset` projections — never an in-memory binding map — so it
 * survives a process restart. When several matching sessions exist it selects
 * the newest by `updatedAt`.
 *
 * No fallback: a missing Workspace, missing Data Scope, unavailable preset, or
 * failed session creation each fail loud. There is no default preset and no
 * active-scope fallback; the Data Scope id is never inferred from the Workspace
 * name, path, Session title, or a process-level active scope.
 *
 * @module @deepseek-ai/dsh-management-context
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-projection'
import type { Workspace } from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-scope-registry'
import type {} from '@deepseek-ai/dsh-agent-presets'
import type { SessionSummary } from '@deepseek-ai/dsh-api-session-controller'
import { dataScopeProjectionDefinition } from './projection.ts'
import type { DataScopeId, ManagementContextRequest, ManagementContextResolution } from './types.ts'

export type { DataScopeBindingState, DataScopeId, ManagementContextRequest, ManagementContextResolution } from './types.ts'
export { dataScopeProjectionDefinition } from './projection.ts'
export { ManagementContextGateway } from './remote.ts'
export type { ManagementContextRemote } from './remote.ts'

/** The preset every Management Session is pinned to. */
export const MANAGEMENT_PRESET_ID = 'semantic-layer-management'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Resolves a Management Context (`Workspace × Data Scope`) to a persistent Management Session. */
    managementContext: ManagementContextService
  }
}

/** Separator for the single-flight key; NUL cannot appear in an id. */
const KEY_SEPARATOR = '\u0000'

/** The cold Session-list rows default recovery filters over. */
type SessionListItems = readonly SessionSummary[]

/**
 * Outcome of a cold-list recovery scan for an existing Management Session.
 * - `found` — a member session whose cold projection confirms the management
 *   preset and the target Data Scope; reuse it.
 * - `no-match` — every member session's cold projection is readable and none
 *   is a management session bound to the target scope; safe to create.
 * - `unknown` — at least one member session's cold projection is missing or
 *   stale (the Session-list hint is explicitly partial). The scan cannot rule
 *   it out as the target session, so the caller MUST NOT silently create a
 *   duplicate; it fails loud until the projection cache is warmed.
 */
type FindExistingResult =
  | { readonly kind: 'found'; readonly sessionId: SessionId }
  | { readonly kind: 'no-match' }
  | { readonly kind: 'unknown'; readonly sessionId: SessionId }

/**
 * The `ctx.managementContext` service. Owns per-context single-flight, fail-loud
 * validation, session creation pinned to `semantic-layer-management`, and the
 * durable data-scope binding.
 */
export class ManagementContextService extends Service {
  static inject = [
    'sessionController',
    'sessions',
    'sessionProjections',
    'workspaceRegistry',
    'scopes',
    'agentPresets',
  ] as const

  /**
   * In-flight default resolutions keyed by `${workspaceId}\0${dataScopeId}`.
   * Deleted when the resolution settles. This is a per-call de-duplication
   * window only — never the authority on which session a context maps to (that
   * is re-derived from durable membership and projections every call).
   */
  private readonly inflight = new Map<string, Promise<ManagementContextResolution>>()

  /**
   * @param ctx - Cordis context providing the Session Controller, Session
   *   store, projection registry, Workspace registry, Scope registry, and
   *   Agent presets.
   */
  constructor(ctx: Context) {
    super(ctx, 'managementContext')
    ctx.sessionProjections.register(dataScopeProjectionDefinition)
  }

  /**
   * Resolve the Management Context to its Management Session, creating one only
   * when none exists yet. Single-flighted per `(workspaceId, dataScopeId)`:
   * concurrent default calls for the same context share one resolution and
   * return the same `sessionId`.
   * @param request - the Workspace and Data Scope identifying the context.
   * @returns the resolved session id and whether this call created it.
   * @throws when the Workspace or Data Scope is unknown, the
   *   `semantic-layer-management` preset is unavailable, or session creation fails.
   */
  resolveOrCreate(request: ManagementContextRequest): Promise<ManagementContextResolution> {
    const key = `${request.workspaceId}${KEY_SEPARATOR}${request.dataScopeId}`
    const inFlight = this.inflight.get(key)
    if (inFlight !== undefined) return inFlight
    const pending = this.runResolveOrCreate(request)
    this.inflight.set(key, pending)
    const clear = (): void => { this.inflight.delete(key) }
    pending.then(clear, clear)
    return pending
  }

  /**
   * Always create another Management Session for the context, independent of any
   * existing session. A subsequent default {@link resolveOrCreate} then selects
   * the newest matching session by `updatedAt`.
   * @param request - the Workspace and Data Scope identifying the context.
   * @returns the new session id, with `created: true`.
   * @throws when the Workspace or Data Scope is unknown, the
   *   `semantic-layer-management` preset is unavailable, or session creation fails.
   */
  async createNew(request: ManagementContextRequest): Promise<ManagementContextResolution> {
    await this.validate(request)
    const sessionId = await this.createSession(request)
    return { sessionId, created: true }
  }

  private async runResolveOrCreate(request: ManagementContextRequest): Promise<ManagementContextResolution> {
    const workspace = await this.validate(request)
    const result = this.findExisting(workspace, request.dataScopeId, await this.listSummaries())
    if (result.kind === 'found') return { sessionId: result.sessionId, created: false }
    if (result.kind === 'unknown') {
      throw new Error(
        `management-context: cannot resolve context (${request.workspaceId}, ${request.dataScopeId}) — `
          + 'the projection cache for member session "'
          + result.sessionId
          + '" is missing or stale; warm the cache before retrying to avoid a silent duplicate creation',
      )
    }
    const sessionId = await this.createSession(request)
    return { sessionId, created: true }
  }

  /**
   * Fail loud unless the Workspace exists, the Data Scope exists, and the
   * `semantic-layer-management` preset resolves. No fallback on any axis.
   * @returns the validated Workspace.
   */
  private async validate(request: ManagementContextRequest): Promise<Workspace> {
    const workspace = this.ctx.workspaceRegistry.get(request.workspaceId)
    if (workspace === undefined) {
      throw new Error(`management-context: workspace "${request.workspaceId}" not found`)
    }
    if (this.ctx.scopes.get(request.dataScopeId) === undefined) {
      throw new Error(
        `management-context: data scope "${request.dataScopeId}" not found; refusing active-scope fallback`,
      )
    }
    await this.ctx.agentPresets.resolve(MANAGEMENT_PRESET_ID)
    return workspace
  }

  /** Cold-safe Session list read used by default recovery (no history is opened). */
  private async listSummaries(): Promise<SessionListItems> {
    const { items } = await this.ctx.sessionController.list({}, new AbortController().signal)
    return items
  }

  /**
   * Scan the Workspace's durable session membership for the newest matching
   * Management Session: preset `semantic-layer-management` and `dataScope`
   * bound to `dataScopeId`, highest `updatedAt`. Reads projection values cold
   * from the supplied Session list — never opening full history.
   *
   * The Session-list cold hint is explicitly partial: a member session may
   * carry no projection block at all, or a block whose `agentPreset` or
   * `dataScope` cell is missing. Such a session is **unknown**, not a
   * confirmed no-match — the scan returns `unknown` for it instead of
   * silently skipping it, so the caller never creates a duplicate when an
   * existing session might already be the target.
   */
  private findExisting(
    workspace: Workspace,
    dataScopeId: DataScopeId,
    items: SessionListItems,
  ): FindExistingResult {
    const memberIds = new Set<SessionId>(workspace.sessionIds)
    if (memberIds.size === 0) return { kind: 'no-match' }
    let best: { sessionId: SessionId; updatedAt: number } | undefined
    for (const item of items) {
      if (!memberIds.has(item.sessionId)) continue
      const values = item.projections?.values
      // No projection block at all — the cold cache is missing/stale for this
      // member. Cannot rule it out; fail loud rather than risk a duplicate.
      if (values === undefined) return { kind: 'unknown', sessionId: item.sessionId }
      const preset = values.agentPreset
      // Preset cell missing — cannot classify this member. Unknown.
      if (preset === undefined) return { kind: 'unknown', sessionId: item.sessionId }
      // Confirmed non-management — a genuine no-match for this context.
      if (preset !== MANAGEMENT_PRESET_ID) continue
      const binding = values.dataScope
      // Management preset but the dataScope cell is missing — cannot tell
      // which scope this session manages. Unknown.
      if (binding === undefined) return { kind: 'unknown', sessionId: item.sessionId }
      // Confirmed management but bound to a different scope — no-match.
      if (binding == null || binding.dataScopeId !== dataScopeId) continue
      // Confirmed match — track the newest by updatedAt.
      if (best === undefined || item.updatedAt > best.updatedAt) {
        best = { sessionId: item.sessionId, updatedAt: item.updatedAt }
      }
    }
    return best === undefined
      ? { kind: 'no-match' }
      : { kind: 'found', sessionId: best.sessionId }
  }

  /**
   * Create one ordinary Session pinned to `semantic-layer-management`, then
   * append the durable `data-scope/bound` event recording the managed scope.
   *
   * The binding is made durable before this method returns. When the
   * `sessionProjectionCache` service is available (the production path), its
   * `write(session)` method takes the projection checkpoint cut, flushes the
   * session log to durable storage (`ctx.sessions.flush`), and then writes the
   * cache rows — so a cold read or a reopened process sees the `dataScope`
   * projection without opening full history. When the cache service is absent
   * (the unit-test harness), the method falls back to a bare log flush so the
   * event still reaches persistence listeners. A flush or write failure
   * propagates as a creation failure.
   */
  private async createSession(request: ManagementContextRequest): Promise<SessionId> {
    const created = await this.ctx.sessionController.create({
      workspaceId: request.workspaceId,
      agentPreset: MANAGEMENT_PRESET_ID,
    })
    const session = this.ctx.sessions.get(created.sessionId)
    /* v8 ignore next 3 -- sessionController.create attaches the created session to the store */
    if (session === undefined) {
      throw new Error(`management-context: created session "${created.sessionId}" is not attached to the store`)
    }
    session.append('data-scope/bound', {
      dataScopeId: request.dataScopeId,
      workspaceId: request.workspaceId,
    })
    const projectionCache = this.ctx.get('sessionProjectionCache')
    if (projectionCache !== undefined) {
      await projectionCache.write(session)
    } else {
      await this.ctx.sessions.flush(session)
    }
    return created.sessionId
  }
}

export default ManagementContextService
