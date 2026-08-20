/**
 * Pure types for `@deepseek-ai/dsh-eval`. Types only — no runtime code — so this
 * module is excluded from the per-file coverage gate. The shapes here are the
 * library's contract surface: verdicts, the execution result the scorer reads,
 * structural "view" interfaces that the real `dsh-sdk-client` / `dsh-query`
 * runtime shapes satisfy without this package importing them (zero-seam-dep:
 * the library registers nothing on a Cordis context and takes its
 * collaborator callables injected — D9, the evaluator never constructs the
 * agent under test), and the multi-turn result/attempt/diagnostic records.
 *
 * @module @deepseek-ai/dsh-eval/types
 */

/**
 * Multi-turn + single-turn verdict. `partial` arises only from the derailment
 * mapping (`pass`→`partial`, `fail`→`fail`) in `MultiTurnSession`; the da (ii)
 * assertions themselves yield only `pass`/`fail`.
 */
export type Verdict = 'pass' | 'partial' | 'fail'

/**
 * SPEC §5.2 failure classes. `syntax_error`/`guard_rejected` are statements
 * about the SQL under test (the agent's SQL is wrong → score);
 * `infrastructure`/`timeout`/`patience` mean the warehouse did not answer
 * (→ refuse, not score, the turn is resubmittable). Mirrors
 * `rbi_eval.scoring.l1.classify_execution_failure`.
 */
export type FailureClass = 'syntax_error' | 'guard_rejected' | 'infrastructure' | 'timeout' | 'patience'

/**
 * One scored assertion (da (ii): `sql_executable` / `result_non_empty` /
 * `result_match` / `delivery`). `skipped` is for an assertion that did not run
 * (e.g. an EXECUTION-only case has no DELIVERY).
 */
export interface AssertionResult {
  readonly status: 'pass' | 'fail' | 'skipped'
  readonly detail: string
  /** Present on `sql_executable` when it failed, so a reader can tell "the SQL is wrong" from "the warehouse was not there". */
  readonly failureClass?: FailureClass
}

/**
 * Transient scoring input: what happened when the agent's generated SQL was
 * executed externally (eval re-runs the SQL via the injected
 * `CaseSqlExecutor` for a deterministic actual — G2 "跑 da 自己的 ODPS", the
 * agent's trace `tool/result` is not trusted for execution determinism).
 */
export interface ExecutionResult {
  readonly success: boolean
  /**
   * Dict rows (`Record<string, unknown>[]`) — match_mode handlers read keyed
   * columns, so the `CaseSqlExecutor` adapter zips `QueryOutcome.columns`
   * onto each `QueryOutcome.rows` row.
   */
  readonly rows: readonly Record<string, unknown>[]
  readonly rowCount: number
  readonly error: string | null
  readonly failureClass: FailureClass | null
}

/**
 * The da (ii) score: a verdict folded from the declared assertions (pass iff
 * all declared pass) plus the assertions themselves + the execution result
 * that produced them.
 */
export interface ScoreDaResult {
  readonly verdict: Verdict
  readonly assertions: Record<string, AssertionResult>
  readonly executionResult: ExecutionResult
}

/**
 * Minimal structural view of one `session.event` payload the adapter reads.
 * Broad on purpose: the real `@deepseek-ai/dsh-sdk-client` `SessionEvent` union
 * has many variants; the adapter narrows on `type` + casts the `data` slice it
 * reads (`assistant/message` → `message.content`; `tool/call` →
 * `arguments`/`sql`). This package does not import the SDK.
 */
export interface RunResultEvent {
  readonly type: string
  readonly data?: unknown
}

/**
 * Minimal structural view of `DeepSeekHarness.run()`'s `RunResult`. `events`
 * carries the root-session event stream (incl. `tool/call` + `tool/result` +
 * `assistant/message`); the adapter reads `finalResponse` + parses SQL out of
 * `tool/call`.
 */
export interface RunResultView {
  readonly finalResponse: string
  readonly events: readonly RunResultEvent[]
  readonly notifications?: readonly unknown[]
}

/**
 * Minimal structural view of `ctx.query.execute()`'s `QueryOutcome`. The
 * `CaseSqlExecutor` adapter maps this to `ExecutionResult`
 * (completed→success+rows; failed→!success+error+
 * `classifyExecutionFailure`; pending→`patience` refuse — the warehouse did
 * not answer, the turn is unjudged).
 */
export interface QueryOutcomeView {
  readonly state: 'completed' | 'pending' | 'failed'
  readonly columns?: readonly string[]
  readonly rows?: readonly unknown[][]
  readonly rowCount?: number
  readonly error?: string
  readonly failureKind?: string
  readonly instanceId?: string
}

/** One question put to the agent. Carries the identifiers a real adapter needs (session affinity, scope routing). */
export interface AgentTurnRequest {
  readonly sessionId: string
  readonly caseId: string
  readonly scopeId: string | null
  readonly turnIndex: number
  readonly message: string
}

/** What the agent answered. `generatedSql` is optional per turn and only consulted on the terminal turn, where EXECUTION runs. */
export interface AgentTurnReply {
  readonly reply: string
  readonly generatedSql: string | null
  readonly generatedBehavior: string | null
}

/**
 * The injected "ask the agent" step (D9: the evaluator is handed the
 * collaborator; it never constructs the agent under test). Wraps a
 * `DeepSeekHarness` so `reply = run(message, sessionId).finalResponse` and
 * `generatedSql` is parsed from the `tool/call` event.
 */
export type Responder = (request: AgentTurnRequest) => Promise<AgentTurnReply>

/**
 * Executes the terminal turn's generated SQL so the scorer has a real result
 * to assert on. The host wires `ctx.query.execute` → `mapQueryOutcome` → this.
 */
export type CaseSqlExecutor = (sql: string) => Promise<ExecutionResult>

/** The prompt handed to an injected DELIVERY LLM-judge. */
export interface JudgePrompt {
  readonly question: string
  readonly agentAnswer: string
  readonly expectedAnswer: string
}

/** One verdict from an injected DELIVERY LLM-judge. `score` is 0..1; `>= JUDGE_PASS_THRESHOLD` (0.6) ⇒ DELIVERY pass. */
export interface JudgeVerdict {
  readonly score: number
  readonly rationale: string
  readonly judgeError?: string
}

/**
 * The injected DELIVERY LLM-judge provider (judge ≠ agent LLM: `dsh-llm-replay`
 * freezes only the agent runtime; the judge is a separate eval-side LLM call).
 * May throw (retryable / auth / unclassified); auth aborts the whole run
 * (SPEC §5.5).
 */
export type JudgeProvider = (prompt: JudgePrompt) => Promise<JudgeVerdict>

/** Per-attempt multi-turn diagnostic. */
export interface MultiTurnDiagnostic {
  readonly sessionId: string
  readonly totalTurns: number
  readonly streak: number
  readonly terminalVerdict: Verdict | null
  readonly derailedAtTurn: number | null
}

/**
 * Outcome of handing one reply to a session. A discriminated union on
 * `executionError`: set → the engine raised (the session was NOT advanced);
 * `null` → `result` holds the session's verdict + the `l1` the session already
 * computed (a non-null `SubmitResponseResult`).
 */
export type TurnSubmission =
  | { readonly result: null; readonly execution: null; readonly executionError: string }
  | { readonly result: SubmitResponseResult; readonly execution: ExecutionResult | null; readonly executionError: null }

/**
 * Return value of `MultiTurnSession.submitResponse()`. `l1` carries the score
 * that produced `verdict`, so a caller persists the scoring that produced the
 * verdict rather than recomputing it (rbi A3).
 */
export interface SubmitResponseResult {
  readonly status: SubmitStatus
  readonly nextInput: string | null
  readonly verdict: Verdict | null
  readonly streak: number
  readonly diagnostic: MultiTurnDiagnostic | null
  readonly l1: ScoreDaResult | null
}

/** `MultiTurnSession` lifecycle: `pending`→`running`→`terminated`|`completed`. */
export type SessionState = 'pending' | 'running' | 'terminated' | 'completed'

/** `submitResponse` status: `continue` (more scripted turns), `completed` (terminal turn scored), `terminated` (derailment). */
export type SubmitStatus = 'continue' | 'completed' | 'terminated'

/**
 * One pass_k attempt. `error` set when the attempt could not run to a verdict
 * (agent raised, SQL execution failed, wall-clock timeout, H1 protocol fault)
 * — distinct from `fail`: the case was not judged.
 */
export interface MultiTurnAttempt {
  attempt: number
  readonly verdict: Verdict | null
  readonly state: SessionState
  readonly turnsTaken: number
  readonly streak: number
  readonly diagnostic: MultiTurnDiagnostic | null
  readonly submission: TurnSubmission | null
  readonly error: string | null
  readonly timeout: boolean
  readonly l1: ScoreDaResult | null
}

/** Outcome of running one multi-turn case `pass_k` times. `passed` is pass_k: every attempt must reach `pass`. */
export interface MultiTurnCaseResult {
  readonly caseId: string
  readonly passK: number
  readonly passed: boolean
  readonly verdict: Verdict | null
  readonly attempts: readonly MultiTurnAttempt[]
  readonly latencyMs: number
  readonly lastSubmission: TurnSubmission | null
}
