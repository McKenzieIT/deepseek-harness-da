/**
 * Pure types for the Management Context capability (`ctx.managementContext`).
 * A Management Context is the pair `Workspace × Data Scope`; resolving one
 * yields a persistent Management Session pinned to the
 * `semantic-layer-management` preset.
 *
 * @module @deepseek-ai/dsh-management-context/types
 */

import type { SessionId } from '@deepseek-ai/dsh-session'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace'

/**
 * The identity of a Management Context: which Workspace and which Data Scope
 * the Management Session serves. Neither field is inferred — the Data Scope id
 * is never derived from the Workspace name, path, Session title, or a
 * process-level active scope.
 */
export interface ManagementContextRequest {
  /** The Workspace the Management Session attaches to (must exist in the registry). */
  readonly workspaceId: WorkspaceId
  /** The Data Scope the Management Session manages (must exist in the scope registry). */
  readonly dataScopeId: string
}

/**
 * The outcome of resolving a Management Context: the Management Session id and
 * whether this call created it (`false` when an existing session was reused).
 */
export interface ManagementContextResolution {
  /** The resolved Management Session id. */
  readonly sessionId: SessionId
  /** `true` when this call created the session; `false` when it reused an existing one. */
  readonly created: boolean
}

/**
 * Durable per-session data-scope binding fold state: the bound Data Scope id,
 * or `null` before any `data-scope/bound` event. Plain JSON so the projection
 * cache can persist and surface it to the Session list without opening history.
 */
export type DataScopeBindingState = { readonly dataScopeId: string } | null
