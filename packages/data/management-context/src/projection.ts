/**
 * The `data-scope/bound` session event and the `dataScope` Session projection.
 *
 * A Management Session records which Data Scope it manages as a durable
 * `data-scope/bound` event, appended once immediately after the session is
 * created. The `dataScope` projection folds that event so the Session list can
 * surface the bound scope cold — from the projection cache, without opening the
 * full session history. The binding is never inferred from the Workspace name,
 * path, Session title, or a process-level active scope; it is only ever the
 * value recorded on the event.
 *
 * @module @deepseek-ai/dsh-management-context/projection
 */

import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { z } from 'zod'
import type { DataScopeBindingState, DataScopeId } from './types.ts'

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Binds this Session to the Data Scope it manages. Appended once right
     * after a Management Session is created, before its first turn. The bound
     * scope is a recorded fact: it fixes which scope every management operation
     * in this session acts on and is never re-derived from workspace or session
     * metadata. The binding is immutable — a session is never rebound to a
     * different scope. When the scope is later deleted from the registry the
     * event stays readable, but new management operations for that scope fail.
     */
    'data-scope/bound': { dataScopeId: DataScopeId; workspaceId: WorkspaceId }
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    /** Durable data-scope binding fold state (see {@link DataScopeBindingState}). */
    dataScope: DataScopeBindingState
  }
  interface SessionProjectionMap {
    /** The bound Data Scope surfaced to the Session list, or `null` when unbound. */
    dataScope: DataScopeBindingState
  }
}

const dataScopeSchema = z.union([
  z.object({ dataScopeId: z.string().min(1) }),
  z.null(),
]) as unknown as z.ZodType<DataScopeBindingState>

/**
 * Folds `data-scope/bound` into the durable per-session data-scope binding.
 * Starts `null`, becomes `{ dataScopeId }` on the first binding event, and
 * ignores every other event. The binding is immutable, so a later
 * `data-scope/bound` never changes an already-bound state reference.
 */
export const dataScopeProjectionDefinition = {
  key: 'dataScope',
  stateSchema: dataScopeSchema,
  init: (_header, _inheritedEventCount) => null,
  apply: (state, event) => (
    state === null && event.type === 'data-scope/bound'
      ? { dataScopeId: event.data.dataScopeId }
      : state
  ),
  wire: { viewSchema: dataScopeSchema, view: state => state },
  stateVersion: 1,
} satisfies ProjectionDefinition<'dataScope', DataScopeBindingState>
