/**
 * Types for `@deepseek-ai/dsh-eval-runner` — the eval evidence engine.
 *
 * Defines the run result, per-case verdict, attempt result, delta report,
 * and collaborator interfaces for the batch runner.
 *
 * @module @deepseek-ai/dsh-eval-runner/types
 */

import type { MultiTurnCaseResult } from '@deepseek-ai/dsh-eval'

// ─── Verdict Mapping ───────────────────────────────────────────────────────────

/**
 * Runner-level verdict for a case. Maps from the eval core's `Verdict` to a
 * broader classification that includes infra failures and unjudged cases:
 * - `correct` — the case passed (all pass_k attempts passed)
 * - `declined` — the agent explicitly declined to answer
 * - `wrong` — the case failed (model gave incorrect answer)
 * - `unjudged` — the case could not be judged (e.g., judge unavailable)
 * - `infra_failure` — infrastructure failure prevented evaluation
 */
export type RunnerVerdict = 'correct' | 'declined' | 'wrong' | 'unjudged' | 'infra_failure'

// ─── Attempt Result ────────────────────────────────────────────────────────────

/**
 * Result of a single pass_k attempt within a case run.
 */
export interface AttemptResult {
  /** 1-based attempt number within the pass_k sequence. */
  readonly attempt_k: number
  /** Whether the execution assertions (sql_executable, result_non_empty, result_match) all passed. */
  readonly execution_match?: boolean
  /** Whether the delivery assertion passed. */
  readonly delivery_match?: boolean
  /** If this attempt hit an infra error, the description. */
  readonly infra_error?: string
  /** If this attempt hit a non-infra error (model/logic failure that threw), the description. */
  readonly error?: string
}

// ─── Case Verdict ──────────────────────────────────────────────────────────────

/**
 * The verdict for one eval case within a batch run.
 */
export interface CaseVerdict {
  /** The case's unique identifier. */
  readonly case_id: string
  /** Per-attempt results for the pass_k run. */
  readonly pass_k_results: AttemptResult[]
  /** The overall verdict for this case. */
  readonly verdict: RunnerVerdict
  /** Latency in milliseconds for the entire case (all pass_k attempts). */
  readonly latency_ms: number
  /** The raw MultiTurnCaseResult from the eval core (for detailed inspection). */
  readonly raw?: MultiTurnCaseResult
}

// ─── Run Result ────────────────────────────────────────────────────────────────

/**
 * The persisted result of a full batch eval run.
 */
export interface RunResult {
  /** Unique run identifier (UUID or user-supplied). */
  readonly run_id: string
  /** ISO-8601 timestamp when the run started. */
  readonly timestamp: string
  /** Per-case verdicts. */
  readonly cases: CaseVerdict[]
  /** Summary statistics. */
  readonly summary: RunSummary
}

/**
 * Summary statistics for a run.
 */
export interface RunSummary {
  readonly total: number
  readonly correct: number
  readonly wrong: number
  readonly declined: number
  readonly unjudged: number
  readonly infra_failure: number
  readonly pass_rate: number
}

// ─── Delta Report ──────────────────────────────────────────────────────────────

/**
 * A flip: one case whose verdict changed between two runs.
 */
export interface CaseFlip {
  readonly case_id: string
  readonly old_verdict: RunnerVerdict
  readonly new_verdict: RunnerVerdict
}

/**
 * Before/after delta report comparing two runs.
 */
export interface DeltaReport {
  /** The run IDs being compared. */
  readonly run_a_id: string
  readonly run_b_id: string
  /** Cases whose verdict flipped. */
  readonly flips: CaseFlip[]
  /** Summary counts. */
  readonly summary: DeltaSummary
}

/**
 * Delta summary: counts of improved, regressed, and unchanged cases.
 */
export interface DeltaSummary {
  readonly improved: number
  readonly regressed: number
  readonly unchanged: number
}

// ─── Collaborator Interfaces ───────────────────────────────────────────────────

/**
 * Abstract agent responder: ask the agent a question, get a conversation
 * transcript back. The runner calls through this interface so the real agent
 * can be wired later (or stubbed for testing).
 */
export interface AgentResponder {
  /** Send a question to the agent and receive a response. */
  respond(question: string, opts?: AgentRespondOpts): Promise<AgentResponse>
}

/** Options for an agent respond call. */
export interface AgentRespondOpts {
  readonly session_id?: string
  readonly scope_id?: string | null
}

/** The agent's response to a question. */
export interface AgentResponse {
  readonly reply: string
  readonly generated_sql: string | null
  readonly transcript?: unknown[]
}

/**
 * Abstract query executor: execute SQL and return result rows.
 */
export interface QueryExecutor {
  /** Execute a SQL statement and return rows. */
  execute(sql: string): Promise<QueryResult>
}

/** The result of a query execution. */
export interface QueryResult {
  readonly success: boolean
  readonly rows: Record<string, unknown>[]
  readonly row_count: number
  readonly error: string | null
}

/**
 * Abstract judge provider: judge whether actual output matches expected.
 */
export interface JudgeExecutor {
  /** Judge whether actual matches expected. */
  judge(expected: unknown, actual: string, question: string): Promise<JudgeResult>
}

/** The result of a judge evaluation. */
export interface JudgeResult {
  readonly score: number
  readonly rationale: string
  readonly error?: string
}

// ─── Health Gate ───────────────────────────────────────────────────────────────

/**
 * Result of a single health check.
 */
export interface HealthCheckResult {
  readonly name: string
  readonly healthy: boolean
  readonly message: string
  readonly latency_ms: number
}

/**
 * Result of the pre-flight health gate.
 */
export interface HealthGateResult {
  readonly passed: boolean
  readonly checks: HealthCheckResult[]
  readonly timestamp: string
}

// ─── Batch Runner Options ──────────────────────────────────────────────────────

/**
 * Options for the batch runner.
 */
export interface BatchRunOptions {
  /** Unique run ID. If not provided, a UUID is generated. */
  readonly run_id?: string
  /** Number of pass_k attempts per case (default: 3). */
  readonly pass_k?: number
  /** Maximum infra retries per case (default: 2). */
  readonly max_infra_retries?: number
  /** Output path for the result JSON file. */
  readonly output_path?: string
  /** Whether to skip the health gate. */
  readonly skip_health_gate?: boolean
  /** Wall-clock timeout per attempt in ms (default: null = no timeout). */
  readonly timeout_ms?: number | null
  /** Concurrency limit for parallel case execution (default: 1 = serial). */
  readonly concurrency?: number
  /** Progress callback. */
  readonly on_progress?: (completed: number, total: number, case_id: string) => void
}

// ─── Infra Retry ───────────────────────────────────────────────────────────────

/**
 * Classification of a failure for retry purposes.
 */
export type InfraFailureKind = 'connectivity' | 'timeout' | 'rate_limit' | 'transient' | 'permanent'

/**
 * Record of an infra retry attempt.
 */
export interface InfraRetryRecord {
  readonly attempt: number
  readonly kind: InfraFailureKind
  readonly error: string
  readonly timestamp: string
}
