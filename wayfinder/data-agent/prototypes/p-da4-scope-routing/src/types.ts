/**
 * Shared types for scope-routing tools.
 * @module @deepseek-ai/dsh-tool-scope-routing/types
 */

/** Scope summary surfaced to the LLM (list_scopes return / system prompt injection). */
export interface ScopeSummary {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly aliases: readonly string[]
  readonly is_active: boolean
}

/** delegate_query return value — structured result + interpretation text. */
export interface DelegateQueryResult {
  readonly ok: boolean
  readonly scope_id: string
  /** Structured query outcome (rows/columns) from the subagent's EXECUTION phase. */
  readonly outcome?: QueryOutcome
  /** Subagent's INTERPRETATION text (for cross-scope synthesis by the main agent). */
  readonly interpretation?: string
  readonly error?: string
}

/** Minimal query outcome shape (mirrors query-maxcompute's existing return). */
export interface QueryOutcome {
  readonly status: 'completed' | 'failed' | 'pending'
  readonly columns?: readonly string[]
  readonly rows?: readonly Record<string, unknown>[]
  readonly row_count?: number
  readonly error?: string
}

/** Scope alias match result from the harness fallback detector. */
export interface AliasMatchResult {
  readonly matched: boolean
  readonly scope_ids: readonly string[]
  readonly matched_aliases: readonly string[]
  readonly is_multi_scope: boolean
}
