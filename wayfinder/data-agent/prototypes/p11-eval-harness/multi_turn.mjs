// PROTOTYPE (throwaway) — P11 eval harness · multi-turn orchestration — the "监考老师" (rbi multi_turn.py).
// 1:1 re-expression of rbi orchestration/multi_turn.py design:
//   - AgentResponder INJECTED (D9: evaluator must not construct the agent under test; rbi-eval never
//     drives the system under evaluation — it is handed a collaborator).
//   - submitTurn owns execution+submission in ONE place (rbi A2: the duplicate was the root cause).
//   - driveSession owns the loop; never raises for agent failures (one unreachable agent does not abort
//     a batch); AuthenticationAbort is the exception (whole run over, SPEC §5.5).
//   - runMultiTurnCase applies pass_k (DEFAULT_PASS_K=3, SPEC §6.5: pass^k, must pass every time).
//   - passKVerdict takes the FIRST non-passing attempt's verdict, NOT the last (anti-flakiness).
//
// DA ADAPTATIONS:
//   - responder wraps TS SDK DeepSeekHarness.run() (adapter.mjs): reply=finalResponse, generatedSql
//     pulled from the tool/call event (TS SDK RunResult has no generatedSql field — rbi extract_reply
//     concatenates TEXT events + picks up sql; da takes finalResponse + parses events for SQL).
//   - executeSql = ctx.query.execute stub (locked #5): the EVAL re-runs the agent's generated SQL for a
//     deterministic actual result set (G2 "跑 da 自己的 ODPS"); the agent's trace tool/result is not
//     trusted for execution determinism.
//   - provider = injected LLM-judge stub (locked #4): threaded to scoreDa's DELIVERY llm_judge layer.
//   - async throughout (scoreDa's DELIVERY LLM-judge is async; rbi is sync — da reality).
//   - Promise.race wall-clock timeout (H2 mitigation, G2): no mid-turn cancel on the wire -> abandoning
//     a turn means closing the runtime. On timeout -> attempt error + onTimeout (close+respawn).

import { MultiTurnSession, MAX_TURNS_PER_ATTEMPT } from './session.mjs'
import { AuthenticationAbort } from './judge.mjs'

export const DEFAULT_PASS_K = 3

const ENVIRONMENTAL_FAILURE_CLASSES = new Set(['infrastructure', 'timeout', 'patience'])
// rbi: failure classes meaning the WAREHOUSE did not answer (SPEC §5.2) — a turn that hit one was not
// evaluated, so it is refused + resubmittable rather than scored. Only syntax_error/guard_rejected are
// statements about the SQL under test. Production needs full classify_execution_failure (surfaced finding).

export function sessionId(runId, caseId, attempt = null) {
  // rbi _session_id: the ONE place that decides session-id format. pass_k needs per-attempt sessions;
  // a single drive has no repetition to number.
  const base = `${runId}:${caseId}`
  return attempt == null ? base : `${base}:${attempt}`
}

export class AgentTurnRequest {
  constructor({ session_id, case_id, scope_id, turn_index, message }) {
    Object.assign(this, { session_id, case_id, scope_id, turn_index, message })
  }
}
export class AgentTurnReply {
  constructor({ reply, generated_sql = null, generated_behavior = null }) {
    Object.assign(this, { reply, generated_sql, generated_behavior })
  }
}

export async function submitTurn(session, replyText, { generatedSql, generatedBehavior, executeSql, provider }) {
  // rbi submit_turn: execute the reply's SQL (if any) then hand the turn to the session.
  // Returns on execution failure; never raises for it (constraint ①) — except AuthenticationAbort
  // (the one exception; a credential failure ends the whole run, SPEC §5.5).
  // On execution failure the session is NOT advanced (constraint ②) — the turn is unjudged, not failed.
  let execution = null
  if (executeSql && generatedSql) {
    try {
      execution = await executeSql(generatedSql)
    } catch (err) {
      if (err instanceof AuthenticationAbort) throw err
      return { result: null, execution: null, execution_error: `${err.constructor.name}: ${err.message ?? err}` }
    }
    // Environmental failure (warehouse didn't answer) -> refusal, not a score. Simplified: a returned
    // {success:false, failure_class environmental} -> execution_error; a returned {success:false} with no
    // environmental class (e.g. semantic error) is SCOREABLE (agent's SQL wrong -> result_match on empty
    // rows -> fail). Production needs full classify_execution_failure to split syntax_error from infra.
    if (execution && !execution.success && execution.failure_class &&
        ENVIRONMENTAL_FAILURE_CLASSES.has(execution.failure_class)) {
      return { result: null, execution: null, execution_error: `${execution.failure_class}: ${execution.error}` }
    }
  }
  const result = await session.submit_response(replyText, {
    generatedSql, generatedBehavior, executionResult: execution, provider,
  })
  return { result, execution, execution_error: null }
}

export async function driveSession(case_, opts) {
  const {
    runId, responder, attempt = null, executeSql = null, provider = null,
    timeoutMs = null, onTimeout = null,
  } = opts
  const sid = sessionId(runId, case_.case_id, attempt)
  const session = new MultiTurnSession(case_, sid, runId)

  for (let turn_index = 0; turn_index < MAX_TURNS_PER_ATTEMPT; turn_index++) {
    const prompt = session.next_input()
    const request = new AgentTurnRequest({
      session_id: sid, case_id: case_.case_id, scope_id: case_.input.scope_id,
      turn_index, message: prompt,
    })
    let reply
    try {
      reply = await raceTimeout(responder(request), timeoutMs, async () => {
        if (onTimeout) await onTimeout(sid, attempt, turn_index)
      })
    } catch (err) {
      if (err instanceof AuthenticationAbort) throw err
      if (err?.isTimeout) {
        return {
          attempt: attempt ?? 0, verdict: null, state: session.state,
          turns_taken: turn_index + 1, streak: session.streak,
          error: `wall-clock timeout on turn ${turn_index} (no mid-turn cancel; runtime closed+respawned)`,
          timeout: true,
        }
      }
      return {
        attempt: attempt ?? 0, verdict: null, state: session.state,
        turns_taken: turn_index + 1, streak: session.streak,
        error: `agent responder raised ${err.constructor.name}: ${err.message ?? err}`,
      }
    }

    const submission = await submitTurn(session, reply.reply, {
      generatedSql: reply.generated_sql, generatedBehavior: reply.generated_behavior,
      executeSql, provider,
    })
    if (submission.execution_error != null) {
      // Constraint ①: returned as a value -> attempt ends UNJUDGED, pass_k loop keeps going.
      return {
        attempt: attempt ?? 0, verdict: null, state: session.state,
        turns_taken: turn_index + 1, streak: session.streak,
        error: `SQL execution failed on turn ${turn_index}: ${submission.execution_error}`,
        submission,
      }
    }
    const result = submission.result
    if (result.status !== 'continue') {
      return {
        attempt: attempt ?? 0, verdict: result.verdict, state: session.state,
        turns_taken: turn_index + 1, streak: result.streak ?? session.streak,
        diagnostic: result.diagnostic, submission, l1: result.l1,
      }
    }
  }
  return {
    attempt: attempt ?? 0, verdict: null, state: session.state,
    turns_taken: MAX_TURNS_PER_ATTEMPT, streak: session.streak,
    error: `session did not end within ${MAX_TURNS_PER_ATTEMPT} turns — driver and state machine disagree`,
  }
}

export function passKVerdict(resultPassed, attempts) {
  // rbi pass_k_verdict (SPEC §6.5): on failure takes the FIRST non-passing attempt's verdict, NOT the
  // last. The last is the obvious-looking choice and is WRONG — a 2-of-3 case whose 3rd attempt passed
  // would be recorded pass, hiding exactly the flakiness pass_k exists to expose.
  if (resultPassed) return 'pass'
  const failed = attempts.find((a) => a.verdict !== 'pass')
  return (failed && failed.verdict) || 'fail'
}

export async function runMultiTurnCase(case_, opts) {
  const {
    runId, responder, passK = DEFAULT_PASS_K, executeSql = null, provider = null,
    timeoutMs = null, onTimeout = null,
  } = opts
  if (passK < 1) throw new Error(`pass_k must be >= 1, got ${passK}`)
  const started = monotonicMs()
  const attempts = []
  let lastSubmission = null
  for (let attemptNo = 1; attemptNo <= passK; attemptNo++) {
    const attempt = await driveSession(case_, {
      runId, responder, attempt: attemptNo, executeSql, provider, timeoutMs, onTimeout,
    })
    attempt.attempt = attemptNo
    attempts.push(attempt)
    if (attempt.submission) lastSubmission = attempt.submission
  }
  // rbi: passed = pass^k — every attempt must reach 'pass' (error is not 'pass').
  const passed = attempts.length > 0 && attempts.every((a) => a.error == null && a.verdict === 'pass')
  const verdict = passKVerdict(passed, attempts)
  return {
    case_id: case_.case_id, pass_k: passK, passed, verdict, attempts,
    latency_ms: Math.round(monotonicMs() - started), last_submission: lastSubmission,
  }
}

// --- timing (rbi time.monotonic; proto uses process.hrtime.bigint ms, monotonic) ---
function monotonicMs() { return Number(process.hrtime.bigint()) / 1e6 }

// Promise.race wall-clock timeout (H2 mitigation). No mid-turn cancel on the wire — abandoning a turn
// means closing the runtime. On timeout: onTimeout (close+respawn for the next attempt) then reject
// with isTimeout so driveSession marks the attempt errored. If the responder resolves/rejects first,
// the timer is cleared and that result propagates (AuthenticationAbort propagates -> ends the run).
async function raceTimeout(promise, timeoutMs, onTimeout) {
  if (!timeoutMs) return await promise
  return new Promise((resolve, reject) => {
    const timer = setTimeout(async () => {
      try { if (onTimeout) await onTimeout() } catch { /* swallow respawn errors */ }
      const e = new Error(`wall-clock timeout after ${timeoutMs}ms`)
      e.isTimeout = true
      reject(e)
    }, timeoutMs)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) }
    )
  })
}
