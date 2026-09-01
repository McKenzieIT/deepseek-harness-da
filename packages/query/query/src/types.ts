/**
 * Client-safe type surface of the query-engine seam (`ctx.query`). Types only —
 * no runtime code, nothing Host-only — so a Client compilation face reads
 * exactly the signature the Host emits.
 *
 * @module @deepseek-ai/dsh-query/types
 */

/** Per-game access-isolation scope (mirror RBI `scope_id`); the trust boundary. */
export type ScopeId = string

/** Sidecar query instance id (pending / attach / cancel address; A1-split). */
export type InstanceId = string

/** Three-state query outcome (mirror RBI `QueryOutcome`; P4 decision B). */
export type QueryState = 'completed' | 'pending' | 'failed'

/**
 * Caller-facing request: SQL + scope + optional mode. Optional fields the
 * caller may omit; the engine fills defaults into a spec (explicit over
 * implicit at the package boundary).
 *
 * `mode` is a PROTOTYPE-ONLY knob the stand-in sidecar uses to drive the
 * P1-wiring scenarios (fast=Completed, slow=Pending, blocking=held in-flight
 * for cancel/crash, fail=Failed). A real pyodps sidecar derives pending vs
 * completed from actual engine execution and carries no mode; production
 * hardening drops it.
 */
export interface QueryRequest {
  readonly sql: string
  readonly scopeId: ScopeId
  readonly mode?: 'fast' | 'slow' | 'blocking' | 'fail'
}

/** Resolved/validated request; defaults filled by the engine. */
export interface QuerySpec {
  readonly sql: string
  readonly scopeId: ScopeId
  readonly mode: 'fast' | 'slow' | 'blocking' | 'fail'
}

/**
 * Settled query outcome; one of three states (P4 decision B 3-state).
 * - completed: columns/rows/rowCount (truncated flags a capped row set).
 * - pending: instanceId to attach/cancel + progress; the query job is still running.
 * - failed: error + failureKind (semantic, transport, …).
 */
export interface QueryOutcome {
  readonly state: QueryState
  /** completed: */
  readonly columns?: string[]
  readonly rows?: unknown[][]
  readonly rowCount?: number
  readonly truncated?: boolean
  /** pending: */
  readonly instanceId?: InstanceId
  readonly elapsedMs?: number
  readonly stage?: string
  /** failed: */
  readonly error?: string
  readonly failureKind?: string
  /** meta: */
  readonly sql: string
  readonly executionMeta?: {
    readonly durationMs?: number
    readonly instanceId?: InstanceId
    readonly costCheck?: 'passed' | 'failed'
    readonly timedOut?: boolean
  }
}
