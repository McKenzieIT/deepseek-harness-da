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
import type { ManagementContextRequest, ManagementContextResolution } from './types.ts'

export type { DataScopeBindingState, ManagementContextRequest, ManagementContextResolution } from './types.ts'
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
    const existing = this.findExisting(workspace, request.dataScopeId, await this.listSummaries())
    if (existing !== undefined) return { sessionId: existing, created: false }
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
   * Select the newest matching Management Session from the Workspace's durable
   * session membership: preset `semantic-layer-management` and `dataScope`
   * bound to `dataScopeId`, highest `updatedAt`. Reads projection values cold
   * from the supplied Session list — never opening full history.
   */
  private findExisting(
    workspace: Workspace,
    dataScopeId: string,
    items: SessionListItems,
  ): SessionId | undefined {
    const memberIds = new Set<SessionId>(workspace.sessionIds)
    if (memberIds.size === 0) return undefined
    let best: { sessionId: SessionId; updatedAt: number } | undefined
    for (const item of items) {
      if (!memberIds.has(item.sessionId)) continue
      const values = item.projections?.values
      if (values?.agentPreset !== MANAGEMENT_PRESET_ID) continue
      const binding = values.dataScope
      if (binding == null || binding.dataScopeId !== dataScopeId) continue
      if (best === undefined || item.updatedAt > best.updatedAt) {
        best = { sessionId: item.sessionId, updatedAt: item.updatedAt }
      }
    }
    return best?.sessionId
  }

  /**
   * Create one ordinary Session pinned to `semantic-layer-management`, then
   * append the durable `data-scope/bound` event recording the managed scope.
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
    return created.sessionId
  }
}

export default ManagementContextService
