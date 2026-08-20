/**
 * Multi-turn driving — the "监考老师" the state machine never had (1:1
 * re-expression of `rbi_eval.orchestration.multi_turn` on da seams).
 *
 * - `AgentResponder` is **injected** (D9: the evaluator never constructs the
 *   agent under test — the host wraps `DeepSeekHarness`).
 * - `submitTurn` owns execution+submission in ONE place (rbi A2: the duplicate
 *   was the root cause); on execution failure the session is NOT advanced
 *   (constraint ②) — the turn is unjudged, not failed.
 * - `driveSession` owns the loop; never raises for agent failures (one
 *   unreachable agent does not abort a batch); `AuthenticationAbort` is the
 *   one exception (the whole run is over, SPEC §5.5).
 * - `runMultiTurnCase` applies pass_k (`DEFAULT_PASS_K=3`, SPEC §6.5: pass^k,
 *   must pass every time).
 * - `passKVerdict` takes the **first non-passing** attempt's verdict, NOT the
 *   last (anti-flakiness — a 2-of-3 case whose 3rd attempt passed must not be
 *   recorded `pass`).
 *
 * DA adaptations: async throughout (scoreDa's DELIVERY LLM-judge is async);
 * `Promise.race` wall-clock timeout (H2 mitigation — no mid-turn cancel on
 * the wire → abandoning a turn means closing the runtime; the host's `onTimeout`
 * does close+respawn); `CaseSqlExecutor` is injected (the host wires
 * `ctx.query.execute` → `mapQueryOutcome`); `JudgeProvider` is injected (the
 * host wires `llm-dashscope`/`ctx.llm`); `deliveryOpts` threaded so tests
 * inject instant backoff (decision 1/2: tunables as function params).
 *
 * @module @deepseek-ai/dsh-eval/multi_turn
 */

import { MultiTurnSession, MAX_TURNS_PER_ATTEMPT } from './session.ts'
import { AuthenticationAbort } from './judge.ts'
import { ENVIRONMENTAL_FAILURE_CLASSES, classifyExecutionFailure } from './classify_failure.ts'
import type { DeliveryOpts } from './delivery.ts'
import type { EvalCase } from './eval_case.ts'
import type {
  CaseSqlExecutor,
  ExecutionResult,
  JudgeProvider,
  MultiTurnAttempt,
  MultiTurnCaseResult,
  MultiTurnDiagnostic,
  Responder,
  ScoreDaResult,
  SessionState,
  TurnSubmission,
  Verdict,
} from './types.ts'

/** SPEC §6.5 / D9 Q2: a multi-turn case is run k times and must pass every time (pass^k). Three is D9's number. */
export const DEFAULT_PASS_K = 3

/**
 * The ONE place that decides what a multi-turn session id looks like (rbi R1):
 * pass_k needs per-attempt sessions; a single drive has no repetition to
 * number.
 * @param runId - the eval run this session belongs to.
 * @param caseId - the id of the case being driven.
 * @param attempt - the pass_k attempt number (1-based), or `null` for a single non-pass_k drive.
 * @returns the session id — `runId:caseId`, or `runId:caseId:attempt` when an attempt is supplied.
 */
export function sessionId(runId: string, caseId: string, attempt: number | null = null): string {
  const base = `${runId}:${caseId}`
  return attempt === null ? base : `${base}:${attempt}`
}

/** Options for {@link driveSession} / {@link runMultiTurnCase}. */
export interface DriveOptions {
  readonly runId: string
  readonly responder: Responder
  readonly attempt?: number | null
  readonly executeSql?: CaseSqlExecutor | null
  readonly provider?: JudgeProvider | null
  readonly deliveryOpts?: DeliveryOpts
  readonly timeoutMs?: number | null
  readonly onTimeout?: ((sessionId: string, attempt: number | null, turnIndex: number) => Promise<void>) | null
}

/** Inputs to {@link submitTurn} (the scoreDa context collaborators). */
export interface SubmitTurnOpts {
  readonly generatedSql: string | null
  readonly executeSql: CaseSqlExecutor | null
  readonly provider: JudgeProvider | null
  readonly deliveryOpts: DeliveryOpts | undefined
}

/** Fields of a {@link MultiTurnAttempt} that vary per outcome (the rest are resolved by `driveSession`). */
interface AttemptFields {
  readonly verdict: Verdict | null
  readonly diagnostic: MultiTurnDiagnostic | null
  readonly submission: TurnSubmission | null
  readonly error: string | null
  readonly timeout: boolean
  readonly l1: ScoreDaResult | null
}

/** A thrown error's name + message (covers the `instanceof Error` check once, not at every catch site). */
function describeError(err: unknown): { name: string; msg: string } {
  if (err instanceof Error) return { name: err.constructor.name, msg: err.message }
  return { name: 'Error', msg: String(err) }
}

/** Build one flat {@link MultiTurnAttempt} from resolved common fields + per-outcome fields (no inline `??`). */
function buildAttempt(attempt: number, state: SessionState, turnsTaken: number, streak: number, f: AttemptFields): MultiTurnAttempt {
  return {
    attempt,
    verdict: f.verdict,
    state,
    turnsTaken,
    streak,
    diagnostic: f.diagnostic,
    submission: f.submission,
    error: f.error,
    timeout: f.timeout,
    l1: f.l1,
  }
}

/**
 * Execute the reply's SQL (if any) then hand the turn to the session. Returns
 * on execution failure; never raises for it (constraint ①) — except
 * `AuthenticationAbort` (a credential failure ends the whole run, SPEC §5.5).
 * On execution failure the session is NOT advanced (constraint ②): an
 * **environmental** failure (infrastructure/timeout/patience — the warehouse
 * did not answer) is a refusal (the turn is unjudged + resubmittable); a
 * `syntax_error`/`guard_rejected` failure (the agent's SQL is wrong) is scored
 * (decision 3).
 * @param session - the multi-turn session.
 * @param replyText - the agent's reply text.
 * @param opts - the generated SQL + injected executor + judge + DELIVERY tunables.
 * @returns the `TurnSubmission`.
 */
export async function submitTurn(session: MultiTurnSession, replyText: string, opts: SubmitTurnOpts): Promise<TurnSubmission> {
  if (opts.executeSql === null || opts.generatedSql === null) {
    const result = await session.submitResponse(replyText, {
      generatedSql: opts.generatedSql,
      executionResult: null,
      provider: opts.provider,
      deliveryOpts: opts.deliveryOpts,
    })
    return { result, execution: null, executionError: null }
  }
  let execution: ExecutionResult
  try {
    execution = await opts.executeSql(opts.generatedSql)
  } catch (err) {
    if (err instanceof AuthenticationAbort) throw err
    const { name, msg } = describeError(err)
    return { result: null, execution: null, executionError: `${name}: ${msg}` }
  }
  if (!execution.success) {
    const fc = execution.failureClass ?? classifyExecutionFailure(execution.error)
    if (ENVIRONMENTAL_FAILURE_CLASSES.has(fc)) {
      return { result: null, execution: null, executionError: `${fc}: ${execution.error ?? ''}` }
    }
  }
  const result = await session.submitResponse(replyText, {
    generatedSql: opts.generatedSql,
    executionResult: execution,
    provider: opts.provider,
    deliveryOpts: opts.deliveryOpts,
  })
  return { result, execution, executionError: null }
}

/**
 * Run one scripted conversation to its end + report how it went. Owns the loop;
 * never raises for agent failures (an exception from the responder ends the
 * attempt with `error` set). `AuthenticationAbort` propagates (the whole run
 * is over). A wall-clock timeout ends the attempt with `error` + `timeout`
 * (the host's `onTimeout` did close+respawn for the next attempt).
 * @param case_ - the validated case.
 * @param opts - run id, responder, attempt number, executor, judge, DELIVERY tunables, timeout.
 * @returns the attempt.
 */
export async function driveSession(case_: EvalCase, opts: DriveOptions): Promise<MultiTurnAttempt> {
  const runId = opts.runId
  const attempt = opts.attempt ?? null
  const attemptNo = attempt ?? 0
  const sid = sessionId(runId, case_.case_id, attempt)
  const session = new MultiTurnSession(case_, sid, runId)
  const timeoutMs = opts.timeoutMs ?? null
  const onTimeout = opts.onTimeout ?? null
  const executeSql = opts.executeSql ?? null
  const provider = opts.provider ?? null
  const deliveryOpts = opts.deliveryOpts

  for (let turnIndex = 0; turnIndex < MAX_TURNS_PER_ATTEMPT; turnIndex++) {
    const prompt = session.nextInput()
    const request = {
      sessionId: sid,
      caseId: case_.case_id,
      scopeId: case_.input.scope_id,
      turnIndex,
      message: prompt,
    }
    let reply
    try {
      reply = await raceTimeout(opts.responder(request), timeoutMs, async () => {
        if (onTimeout !== null) await onTimeout(sid, attempt, turnIndex)
      })
    } catch (err) {
      if (err instanceof AuthenticationAbort) throw err
      if (err instanceof WallClockTimeout) {
        return buildAttempt(attemptNo, session.state, turnIndex + 1, session.streak, {
          verdict: null, diagnostic: null, submission: null, error: `wall-clock timeout on turn ${turnIndex} (no mid-turn cancel; runtime closed+respawned)`, timeout: true, l1: null,
        })
      }
      const { name, msg } = describeError(err)
      return buildAttempt(attemptNo, session.state, turnIndex + 1, session.streak, {
        verdict: null, diagnostic: null, submission: null, error: `agent responder raised ${name}: ${msg}`, timeout: false, l1: null,
      })
    }

    const submission = await submitTurn(session, reply.reply, { generatedSql: reply.generatedSql, executeSql, provider, deliveryOpts })
    if (submission.executionError !== null) {
      return buildAttempt(attemptNo, session.state, turnIndex + 1, session.streak, {
        verdict: null, diagnostic: null, submission, error: `SQL execution failed on turn ${turnIndex}: ${submission.executionError}`, timeout: false, l1: null,
      })
    }
    const result = submission.result
    if (result.status !== 'continue') {
      return buildAttempt(attemptNo, session.state, turnIndex + 1, result.streak, {
        verdict: result.verdict, diagnostic: result.diagnostic, submission, error: null, timeout: false, l1: result.l1,
      })
    }
  }
  return buildAttempt(attemptNo, session.state, MAX_TURNS_PER_ATTEMPT, session.streak, {
    verdict: null, diagnostic: null, submission: null, error: `session did not end within ${MAX_TURNS_PER_ATTEMPT} turns — driver and state machine disagree`, timeout: false, l1: null,
  })
}

/**
 * The verdict a pass_k case earns (SPEC §6.5). On failure takes the **first
 * non-passing** attempt's verdict, NOT the last (the last is the obvious choice
 * and is wrong — a 2-of-3 case whose 3rd attempt passed would be recorded
 * `pass`, hiding exactly the flakiness pass_k exists to expose).
 * @param resultPassed - whether every attempt passed.
 * @param attempts - the attempts.
 * @returns the case verdict.
 */
export function passKVerdict(resultPassed: boolean, attempts: readonly MultiTurnAttempt[]): Verdict | null {
  if (resultPassed) return 'pass'
  for (const a of attempts) {
    if (a.verdict !== 'pass') return a.verdict ?? 'fail'
  }
  return 'fail'
}

/** Options for {@link runMultiTurnCase}. */
export interface RunMultiTurnCaseOptions {
  readonly runId: string
  readonly responder: Responder
  readonly passK?: number
  readonly executeSql?: CaseSqlExecutor | null
  readonly provider?: JudgeProvider | null
  readonly deliveryOpts?: DeliveryOpts
  readonly timeoutMs?: number | null
  readonly onTimeout?: ((sessionId: string, attempt: number | null, turnIndex: number) => Promise<void>) | null
}

/**
 * Drive a case `pass_k` times + apply pass_k. `passed` = every attempt reached
 * `pass` (an `error` is not `pass`). Owns the latency clock for the whole
 * `pass_k` run. Fills `lastSubmission` from the last scored attempt.
 * @param case_ - the validated case.
 * @param opts - run id, responder, pass_k, executor, judge, DELIVERY tunables, timeout.
 * @returns the case result.
 */
export async function runMultiTurnCase(case_: EvalCase, opts: RunMultiTurnCaseOptions): Promise<MultiTurnCaseResult> {
  const passK = opts.passK ?? DEFAULT_PASS_K
  if (passK < 1) throw new Error(`pass_k must be >= 1, got ${passK}`)
  const started = monotonicMs()
  const attempts: MultiTurnAttempt[] = []
  let lastSubmission: TurnSubmission | null = null
  for (let attemptNo = 1; attemptNo <= passK; attemptNo++) {
    const attempt = await driveSession(case_, {
      runId: opts.runId,
      responder: opts.responder,
      attempt: attemptNo,
      executeSql: opts.executeSql ?? null,
      provider: opts.provider ?? null,
      ...(opts.deliveryOpts === undefined ? {} : { deliveryOpts: opts.deliveryOpts }),
      timeoutMs: opts.timeoutMs ?? null,
      onTimeout: opts.onTimeout ?? null,
    })
    attempt.attempt = attemptNo
    attempts.push(attempt)
    if (attempt.submission !== null) lastSubmission = attempt.submission
  }
  const passed = attempts.length > 0 && attempts.every(a => a.error === null && a.verdict === 'pass')
  const verdict = passKVerdict(passed, attempts)
  return {
    caseId: case_.case_id,
    passK,
    passed,
    verdict,
    attempts,
    latencyMs: Math.round(monotonicMs() - started),
    lastSubmission,
  }
}

/** A wall-clock timeout (H2 mitigation): the responder did not settle within `timeoutMs`. */
class WallClockTimeout extends Error {
  readonly isTimeout = true
  constructor(ms: number) {
    super(`wall-clock timeout after ${ms}ms`)
    this.name = 'WallClockTimeout'
  }
}

/** Monotonic milliseconds (rbi `time.monotonic`; `process.hrtime.bigint` is monotonic + zero-import). */
function monotonicMs(): number {
  return Number(process.hrtime.bigint()) / 1e6
}

/**
 * `Promise.race` wall-clock timeout (H2 mitigation). No mid-turn cancel on the
 * wire — abandoning a turn means closing the runtime. On timeout: `onTimeout`
 * (close+respawn for the next attempt) then reject with `WallClockTimeout` so
 * `driveSession` marks the attempt errored. If the responder resolves/rejects
 * first, the timer is cleared and that result propagates (`AuthenticationAbort`
 * propagates → ends the run).
 * @param promise - the responder promise.
 * @param timeoutMs - the wall-clock bound, or null to disable.
 * @param onTimeout - the host's close+respawn.
 */
function raceTimeout<T>(promise: Promise<T>, timeoutMs: number | null, onTimeout: () => Promise<void>): Promise<T> {
  if (timeoutMs === null) return promise
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      // Swallow respawn errors: the runtime is already considered dead for this
      // attempt (it timed out); a respawn failure cannot change this attempt's
      // outcome, and the next attempt spawns a fresh runtime.
      void onTimeout().catch((_respawnError: unknown) => {}).finally(() => {
        reject(new WallClockTimeout(timeoutMs))
      })
    }, timeoutMs)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}
