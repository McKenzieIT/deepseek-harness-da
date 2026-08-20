import { describe, expect, it } from 'vitest'
import { DEFAULT_PASS_K, driveSession, passKVerdict, runMultiTurnCase, sessionId } from '../src/multi_turn.ts'
import { AuthenticationAbort } from '../src/judge.ts'
import { buildAgentResponder } from '../src/adapter.ts'
import { makeCase, makeStubExecute, runResult, StubHarness } from './helpers.ts'
import type { EvalCase } from '../src/eval_case.ts'
import type { AgentTurnReply, AgentTurnRequest, CaseSqlExecutor, ExecutionResult, MultiTurnAttempt, Responder } from '../src/types.ts'

const deliveryCase = (): EvalCase => makeCase({ case_id: 'd', input: { question: 'q?' }, expected: { answer: 'ok', delivery_match: 'fuzzy' } })
const execCase = (): EvalCase => makeCase({ case_id: 'e', input: { question: 'q?' }, expected: { result_value: { value: 'gameA' }, match_mode: 'scalar_exact' } })
const SQL = 'SELECT game FROM rev LIMIT 1'
const okExec = makeStubExecute(new Map([['SELECT game FROM rev LIMIT 1', { rows: [{ game: 'gameA' }], columns: ['game'] }]]))

const reply = (text: string, sql: string | null = null): AgentTurnReply => ({ reply: text, generatedSql: sql, generatedBehavior: null })
const responderOf = (replies: Record<string, AgentTurnReply> | ((req: AgentTurnRequest) => AgentTurnReply)): Responder => {
  if (typeof replies === 'function') return async req => replies(req)
  return async req => replies[req.message] ?? reply('?')
}

describe('sessionId (rbi R1: one place that decides session-id format)', () => {
  it('base form (attempt null/default)', () => {
    expect(sessionId('r', 'c')).toBe('r:c')
    expect(sessionId('r', 'c', null)).toBe('r:c')
  })
  it('attempt-suffixed (pass_k needs per-attempt sessions)', () => {
    expect(sessionId('r', 'c', 1)).toBe('r:c:1')
    expect(sessionId('r', 'c', 7)).toBe('r:c:7')
  })
})

describe('passKVerdict (SPEC §6.5; first non-pass, not last)', () => {
  const a = (verdict: MultiTurnAttempt['verdict']): MultiTurnAttempt => ({ attempt: 1, verdict, state: 'completed', turnsTaken: 1, streak: 0, diagnostic: null, submission: null, error: null, timeout: false, l1: null })
  it('pass when resultPassed', () => {
    expect(passKVerdict(true, [a('pass'), a('pass')])).toBe('pass')
  })
  it('fail when no attempts (resultPassed=false but empty)', () => {
    expect(passKVerdict(false, [])).toBe('fail')
  })
  it("the first non-pass attempt's verdict when it is null (→ 'fail')", () => {
    expect(passKVerdict(false, [a(null), a('pass')])).toBe('fail')
  })
  it("the first non-pass attempt's verdict when it is 'partial'", () => {
    expect(passKVerdict(false, [a('partial'), a('pass')])).toBe('partial')
  })
  it("the first non-pass attempt's verdict when it is 'fail'", () => {
    expect(passKVerdict(false, [a('pass'), a('fail'), a('pass')])).toBe('fail')
  })
})

describe('driveSession · attempt resolution + 64-turn guard', () => {
  it('attempt omitted ⇒ attemptNo 0 + base session id (the ?? null / ?? 0 branches)', async () => {
    const r = await driveSession(deliveryCase(), { runId: 'r', responder: responderOf({ 'q?': reply('the answer is ok') }) })
    expect(r.attempt).toBe(0)
    expect(r.verdict).toBe('pass')
  })
  it('a session that never terminates within MAX_TURNS_PER_ATTEMPT → guard error', async () => {
    // 64 user turns + 64 assistant turns; the responder always matches → 64 continues → the loop ends before the terminal question.
    const turns: { role: 'user' | 'assistant'; content: string }[] = []
    for (let i = 0; i < 64; i++) { turns.push({ role: 'user', content: 'u' }); turns.push({ role: 'assistant', content: 'a' }) }
    const case_ = makeCase({ case_id: 'loop', input: { question: 'terminal?', turns }, expected: { answer: 'a', delivery_match: 'fuzzy' } })
    const r = await driveSession(case_, { runId: 'r', responder: responderOf({ u: reply('a') }), attempt: 1 })
    expect(r.error).toContain('did not end within 64 turns')
    expect(r.verdict).toBeNull()
  })
})

describe('driveSession · responder-throw paths', () => {
  it('an AuthenticationAbort from the responder propagates (the whole run is over)', async () => {
    const responder: Responder = async () => { throw new AuthenticationAbort('agent auth') }
    await expect(driveSession(deliveryCase(), { runId: 'r', responder, attempt: 1 })).rejects.toBeInstanceOf(AuthenticationAbort)
  })
  it('a non-Error throw from the responder → "agent responder raised Error: …" (describeError non-Error branch)', async () => {
    const responder: Responder = async () => { throw 'a string error' }
    const r = await driveSession(deliveryCase(), { runId: 'r', responder, attempt: 1 })
    expect(r.error).toContain('agent responder raised Error: a string error')
    expect(r.timeout).toBe(false)
  })
})

describe('driveSession · SQL execution failure classification (decision 3)', () => {
  it('executeSql null ⇒ skip exec (the executeSql !== null false branch); DELIVERY still scored', async () => {
    const r = await driveSession(deliveryCase(), { runId: 'r', responder: responderOf({ 'q?': reply('the answer is ok', SQL) }), executeSql: null, attempt: 1 })
    expect(r.verdict).toBe('pass') // DELIVERY matches; no execution attempted (no executor)
  })
  it('a non-Error throw from executeSql → execution_error (describeError non-Error branch in submitTurn)', async () => {
    const exec: CaseSqlExecutor = async () => { throw 'exec boom' }
    const r = await driveSession(execCase(), { runId: 'r', responder: responderOf({ 'q?': reply('r', SQL) }), executeSql: exec, attempt: 1 })
    expect(r.error).toContain('SQL execution failed on turn 0: Error: exec boom')
  })
  it('an environmental failure (timeout/patience/infrastructure) → execution_error (refuse, not scored)', async () => {
    const exec = returnsFailed('ODPS: timeout waiting', 'timeout')
    const r = await driveSession(execCase(), { runId: 'r', responder: responderOf({ 'q?': reply('r', SQL) }), executeSql: exec, attempt: 1 })
    expect(r.error).toContain('SQL execution failed on turn 0: timeout: ODPS: timeout waiting')
  })
  it('a scoreable failure (syntax_error) → NOT an execution_error; the turn is scored (sql_executable fail)', async () => {
    const exec = returnsFailed('ODPS: syntax error near foo', 'syntax_error')
    const r = await driveSession(execCase(), { runId: 'r', responder: responderOf({ 'q?': reply('r', SQL) }), executeSql: exec, attempt: 1 })
    expect(r.error).toBeNull()
    expect(r.verdict).toBe('fail') // sql_executable failed (agent SQL wrong = score)
    expect(r.l1?.assertions.sql_executable?.failureClass).toBe('syntax_error')
  })
  it('executeSql throws AuthenticationAbort → submitTurn rethrows (the err instanceof AuthenticationAbort true-branch)', async () => {
    const exec: CaseSqlExecutor = async () => { throw new AuthenticationAbort('exec auth') }
    await expect(driveSession(execCase(), { runId: 'r', responder: responderOf({ 'q?': reply('r', SQL) }), executeSql: exec, attempt: 1 })).rejects.toBeInstanceOf(AuthenticationAbort)
  })
  it('an environmental failure with a null error → executionError with empty error (the ?? "" branch)', async () => {
    const exec: CaseSqlExecutor = async () => ({ success: false, rows: [], rowCount: 0, error: null, failureClass: 'timeout' })
    const r = await driveSession(execCase(), { runId: 'r', responder: responderOf({ 'q?': reply('r', SQL) }), executeSql: exec, attempt: 1 })
    expect(r.error).toBe('SQL execution failed on turn 0: timeout: ')
  })
  it('a failed execution with failureClass null is defensively re-classified (rbi-aligned: do not trust the executor)', async () => {
    const exec: CaseSqlExecutor = async () => ({ success: false, rows: [], rowCount: 0, error: 'ODPS: timeout waiting', failureClass: null })
    const r = await driveSession(execCase(), { runId: 'r', responder: responderOf({ 'q?': reply('r', SQL) }), executeSql: exec, attempt: 1 })
    expect(r.error).toBe('SQL execution failed on turn 0: timeout: ODPS: timeout waiting')
  })
})

describe('driveSession · wall-clock timeout + respawn-error swallowing', () => {
  it('an onTimeout that throws is swallowed (the respawn is best-effort); the attempt still times out', async () => {
    const harness = new StubHarness({ hangUntilRespawn: true, script: () => runResult('ok') })
    let onTimeoutCalls = 0
    const onTimeout = async () => { onTimeoutCalls++; throw new Error('respawn failed') }
    const r = await driveSession(deliveryCase(), { runId: 'r', responder: buildAgentResponder(harness), timeoutMs: 20, onTimeout, attempt: 1 })
    expect(r.timeout).toBe(true)
    expect(r.error).toContain('wall-clock timeout')
    expect(onTimeoutCalls).toBe(1)
  })
  it('a responder that resolves before the wall-clock bound → no timeout (covers the .then resolve handler)', async () => {
    const r = await driveSession(deliveryCase(), { runId: 'r', responder: responderOf({ 'q?': reply('the answer is ok') }), timeoutMs: 1000, attempt: 1 })
    expect(r.verdict).toBe('pass')
    expect(r.timeout).toBe(false)
  })
  it('a responder that rejects (non-timeout) under a wall-clock bound → agent-raised (covers the .then reject handler)', async () => {
    const responder: Responder = async () => { throw new Error('responder boom') }
    const r = await driveSession(deliveryCase(), { runId: 'r', responder, timeoutMs: 1000, attempt: 1 })
    expect(r.error).toContain('agent responder raised Error: responder boom')
    expect(r.timeout).toBe(false)
  })
  it('a wall-clock timeout with onTimeout null → still times out (covers the onTimeout !== null false-branch in the wrapper)', async () => {
    const harness = new StubHarness({ hangUntilRespawn: true, script: () => runResult('ok') })
    const r = await driveSession(deliveryCase(), { runId: 'r', responder: buildAgentResponder(harness), timeoutMs: 20, attempt: 1 })
    expect(r.timeout).toBe(true)
  })
})

describe('runMultiTurnCase · options defaults + pass_k guard', () => {
  it('defaults (executeSql/provider/timeoutMs/onTimeout omitted) + pass_k=3 all pass', async () => {
    // Only runId + responder provided; all optional fields take their `?? null` default branches.
    const r = await runMultiTurnCase(deliveryCase(), { runId: 'r', responder: responderOf({ 'q?': reply('the answer is ok') }) })
    expect(r.passed).toBe(true)
    expect(r.passK).toBe(DEFAULT_PASS_K)
    expect(r.attempts.length).toBe(3)
  })
  it('pass_k < 1 → throws', async () => {
    await expect(runMultiTurnCase(deliveryCase(), { runId: 'r', responder: responderOf({ 'q?': reply('ok') }), passK: 0 })).rejects.toThrow(/pass_k/)
  })
  it('honors explicit executeSql + a matching EXECUTION case', async () => {
    const r = await runMultiTurnCase(execCase(), { runId: 'r', responder: buildAgentResponder(new StubHarness({ script: () => runResult('gameA', { sql: SQL }) })), executeSql: okExec, passK: 1 })
    expect(r.verdict).toBe('pass')
  })
})

/** Build a `CaseSqlExecutor` that always returns a failed `ExecutionResult` with the given failure class. */
function returnsFailed(error: string, failureClass: ExecutionResult['failureClass']): CaseSqlExecutor {
  return async () => ({ success: false, rows: [], rowCount: 0, error, failureClass })
}
