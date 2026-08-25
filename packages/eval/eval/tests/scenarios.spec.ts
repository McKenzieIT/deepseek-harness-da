import { describe, expect, it } from 'vitest'
import { runMultiTurnCase } from '../src/multi_turn.ts'
import { buildAgentResponder } from '../src/adapter.ts'
import { AuthenticationAbort } from '../src/judge.ts'
import { makeCase, makeStubExecute, makeStubJudge, runResult, runResultDerailing, StubHarness, INSTANT_JUDGE } from './helpers.ts'

const RUN_ID = 'run-demo'
const TOP1_SQL = 'SELECT game FROM rev ORDER BY amt DESC LIMIT 1'

describe('scenarios · S1 scripted multi-turn + pass_k=3 all pass', () => {
  it('MultiTurnSession + driveSession + runMultiTurnCase + pass_k + adapter + determinism', async () => {
    const case_ = makeCase({
      case_id: 's1-multiturn-pass',
      input: {
        question: '收入最高的游戏是哪个？',
        turns: [
          { role: 'user', content: '我想看最近 7 天各游戏收入' },
          { role: 'assistant', content: '好的，我来查询最近 7 天各游戏的收入数据' },
        ],
      },
      expected: { result_value: { value: 'gameA' }, match_mode: 'scalar_exact', answer: 'gameA', delivery_match: 'fuzzy' },
    })
    const harness = new StubHarness({
      script: (message) => {
        if (message === '我想看最近 7 天各游戏收入') return runResult('好的，我来查询最近 7 天各游戏的收入数据')
        if (message === '收入最高的游戏是哪个？') return runResult('收入最高是 gameA', { sql: TOP1_SQL })
        return runResult('?')
      },
    })
    const executeSql = makeStubExecute(new Map([['SELECT game FROM rev ORDER BY amt DESC LIMIT 1', { rows: [{ game: 'gameA' }], columns: ['game'] }]]))
    const res = await runMultiTurnCase(case_, { runId: RUN_ID, responder: buildAgentResponder(harness), executeSql, passK: 3 })
    expect(res.passed).toBe(true)
    expect(res.verdict).toBe('pass')
    expect(res.attempts.length).toBe(3)
    expect(res.attempts.every(a => a.verdict === 'pass' && a.error === null)).toBe(true)
  })
})

describe('scenarios · S2 non-terminal derailment (fuzzy <0.35 → streak break → derail)', () => {
  it('_turn_matches_expectation + derailment verdict mapping (pass→partial, fail→fail)', async () => {
    const case_ = makeCase({
      case_id: 's2-derail',
      input: {
        question: '收入最高的游戏是哪个？',
        turns: [
          { role: 'user', content: '我想看最近 7 天各游戏收入' },
          { role: 'assistant', content: '好的，我来查询最近 7 天各游戏的收入数据' },
        ],
      },
      expected: { result_value: { value: 'gameA' }, match_mode: 'scalar_exact', answer: 'gameA', delivery_match: 'fuzzy' },
    })
    const harness = new StubHarness({
      script: (message) => {
        if (message === '我想看最近 7 天各游戏收入') return runResult('今天天气真不错啊') // MISMATCHES scripted assistant → derail
        return runResult('收入最高是 gameA', { sql: TOP1_SQL })
      },
    })
    const executeSql = makeStubExecute(new Map([['SELECT game FROM rev ORDER BY amt DESC LIMIT 1', { rows: [{ game: 'gameA' }], columns: ['game'] }]]))
    const res = await runMultiTurnCase(case_, { runId: RUN_ID, responder: buildAgentResponder(harness), executeSql, passK: 1 })
    expect(res.attempts[0]!.diagnostic?.derailedAtTurn).toBe(1)
    expect(res.attempts[0]!.diagnostic?.terminalVerdict).toBe('fail')
    expect(res.attempts[0]!.state).toBe('terminated')
  })
})

describe('scenarios · S3 EXECUTION 5 match_mode (1:1 translation)', () => {
  const sqlMap = new Map([
    ['SELECT COUNT(*) AS c FROM users', { rows: [{ c: 12345 }], columns: ['c'] }],
    ['SELECT game, amt FROM top', { rows: [{ game: 'gameA', amt: 1000 }], columns: ['game', 'amt'] }],
    ['SELECT game FROM top3', { rows: [{ game: 'gameA' }, { game: 'gameB' }, { game: 'gameC' }], columns: ['game'] }],
    ['SELECT g FROM ranking', { rows: [{ g: 'A' }, { g: 'B' }, { g: 'C' }, { g: 'D' }], columns: ['g'] }],
  ])
  const executeSql = makeStubExecute(sqlMap)
  const sub = [
    { id: 's3-scalar', sql: 'SELECT COUNT(*) AS c FROM users', rv: { value: 12345 }, mm: 'scalar_exact' as const },
    { id: 's3-multi', sql: 'SELECT game, amt FROM top', rv: { fields: { game: 'gameA', amt: 1000 } }, mm: 'multi_scalar_exact' as const },
    { id: 's3-rowcount', sql: 'SELECT game FROM top3', rv: { min: 3, max: 5 }, mm: 'row_count_range' as const },
    { id: 's3-set', sql: 'SELECT game FROM top3', rv: { rows: [{ game: 'gameA' }, { game: 'gameB' }, { game: 'gameC' }] }, mm: 'set_equal' as const },
    { id: 's3-ordered', sql: 'SELECT g FROM ranking', rv: { rows: [{ g: 'A' }, { g: 'C' }] }, mm: 'ordered_subset' as const },
  ]
  for (const s of sub) {
    it(`${s.id} (${s.mm}) → pass`, async () => {
      const c = makeCase({ case_id: s.id, input: { question: 'q' }, expected: { result_value: s.rv, match_mode: s.mm } })
      const harness = new StubHarness({ script: () => runResult(`答: ${s.sql}`, { sql: s.sql }) })
      const res = await runMultiTurnCase(c, { runId: RUN_ID, responder: buildAgentResponder(harness), executeSql, passK: 1 })
      expect(res.verdict).toBe('pass')
    })
  }
})

describe('scenarios · S4 DELIVERY scalar_exact + fuzzy', () => {
  const emptyExec = makeStubExecute(new Map())
  it('scalar_exact (numeric parsed from finalResponse) → pass', async () => {
    const c = makeCase({ case_id: 's4-scalar', input: { question: '总用户数？' }, expected: { answer: 98765, delivery_match: 'scalar_exact' } })
    const harness = new StubHarness({ script: () => runResult('当前总用户数为 98765 人') })
    const r = await runMultiTurnCase(c, { runId: RUN_ID, responder: buildAgentResponder(harness), executeSql: emptyExec, passK: 1 })
    expect(r.verdict).toBe('pass')
  })
  it('fuzzy (text) → pass', async () => {
    const c = makeCase({ case_id: 's4-fuzzy', input: { question: '销量第一是谁？' }, expected: { answer: '销量第一是游戏A', delivery_match: 'fuzzy' } })
    const harness = new StubHarness({ script: () => runResult('根据查询，销量第一是游戏A，其次是游戏B') })
    const r = await runMultiTurnCase(c, { runId: RUN_ID, responder: buildAgentResponder(harness), executeSql: emptyExec, passK: 1 })
    expect(r.verdict).toBe('pass')
  })
})

describe('scenarios · S5 DELIVERY LLM-judge (retry/backoff + AuthenticationAbort)', () => {
  const longAnswer = '本周期内游戏收入整体呈上升趋势，其中策略类游戏增长显著，受新版本活动拉动；休闲类略有下滑，建议下周持续关注策略品类。'
  const emptyExec = makeStubExecute(new Map())
  it('retryable 2x then success → pass (backoff + JUDGE_MAX_RETRIES)', async () => {
    const c = makeCase({ case_id: 's5-retry', input: { question: '分析本周收入趋势' }, expected: { answer: longAnswer, delivery_match: 'llm_judge' } })
    const { provider, calls } = makeStubJudge([{ throw: 'retryable' }, { throw: 'retryable' }, { score: 0.85, rationale: '准确捕捉了趋势' }])
    const harness = new StubHarness({ script: () => runResult('本周策略类游戏收入上升，休闲类略降。') })
    const r = await runMultiTurnCase(c, {
      runId: RUN_ID,
      responder: buildAgentResponder(harness),
      executeSql: emptyExec,
      provider,
      deliveryOpts: { judge: INSTANT_JUDGE },
      passK: 1,
    })
    expect(r.verdict).toBe('pass')
    expect(calls.length).toBe(3)
  })
  it('auth → AuthenticationAbort terminates the run (SPEC §5.5)', async () => {
    const c = makeCase({ case_id: 's5-auth', input: { question: '分析本周收入趋势' }, expected: { answer: longAnswer, delivery_match: 'llm_judge' } })
    const { provider } = makeStubJudge([{ throw: 'auth' }])
    const harness = new StubHarness({ script: () => runResult('本周策略类游戏收入上升。') })
    await expect(
      runMultiTurnCase(c, {
        runId: RUN_ID,
        responder: buildAgentResponder(harness),
        executeSql: emptyExec,
        provider,
        deliveryOpts: { judge: INSTANT_JUDGE },
        passK: 1,
      }),
    ).rejects.toBeInstanceOf(AuthenticationAbort)
  })
})

describe('scenarios · S6 pass_k_verdict anti-flakiness (first non-pass, not last)', () => {
  it('attempt1 fail / 2-3 pass → overall fail, verdict=attempt1 (取数对但交付错 separate failure mode)', async () => {
    const case_ = makeCase({ case_id: 's6-flaky', input: { question: '收入最高游戏？' }, expected: { result_value: { value: 'gameA' }, match_mode: 'scalar_exact', answer: 'gameA', delivery_match: 'fuzzy' } })
    const harness = new StubHarness({
      script: (_message, sid) => {
        if (sid.endsWith(':1')) return runResult('数据不足，无法判断收入最高的游戏', { sql: TOP1_SQL })
        return runResult('收入最高是 gameA', { sql: TOP1_SQL })
      },
    })
    const executeSql = makeStubExecute(new Map([['SELECT game FROM rev ORDER BY amt DESC LIMIT 1', { rows: [{ game: 'gameA' }], columns: ['game'] }]]))
    const res = await runMultiTurnCase(case_, { runId: RUN_ID, responder: buildAgentResponder(harness), executeSql, passK: 3 })
    expect(res.passed).toBe(false)
    expect(res.attempts[0]!.verdict).toBe('fail')
    expect(res.attempts[1]!.verdict).toBe('pass')
    expect(res.attempts[2]!.verdict).toBe('pass')
    expect(res.verdict).toBe(res.attempts[0]!.verdict) // FIRST non-pass, not the last
  })
})

describe('scenarios · S7 Promise.race wall-clock timeout + respawn (H2)', () => {
  it('attempt1 timeout → close+respawn → 2-3 pass; respawnCount=1', async () => {
    const case_ = makeCase({ case_id: 's7-timeout', input: { question: '收入最高游戏？' }, expected: { result_value: { value: 'gameA' }, match_mode: 'scalar_exact', answer: 'gameA', delivery_match: 'fuzzy' } })
    const harness = new StubHarness({ hangUntilRespawn: true, script: () => runResult('收入最高是 gameA', { sql: TOP1_SQL }) })
    const executeSql = makeStubExecute(new Map([['SELECT game FROM rev ORDER BY amt DESC LIMIT 1', { rows: [{ game: 'gameA' }], columns: ['game'] }]]))
    let timeoutFired = 0
    const onTimeout = async () => { timeoutFired++; harness.close(); harness.respawn() }
    const res = await runMultiTurnCase(case_, {
      runId: RUN_ID,
      responder: buildAgentResponder(harness),
      executeSql,
      passK: 3,
      timeoutMs: 50,
      onTimeout,
    })
    expect(res.attempts[0]!.timeout).toBe(true)
    expect(res.attempts[0]!.error).toContain('wall-clock timeout')
    expect(res.attempts[1]!.verdict).toBe('pass')
    expect(res.attempts[2]!.verdict).toBe('pass')
    expect(harness.respawnCount).toBe(1)
    expect(timeoutFired).toBe(1)
    expect(res.passed).toBe(false)
  })
})

describe('scenarios · S8 H1 mitigation (multi-message interval handled gracefully)', () => {
  it('multi-message interval (≥2 assistant/message) no longer throws — adapter takes last reply', async () => {
    const case_ = makeCase({ case_id: 's8-h1', input: { question: '收入最高游戏？' }, expected: { result_value: { value: 'gameA' }, match_mode: 'scalar_exact', answer: 'gameA', delivery_match: 'fuzzy' } })
    const harness = new StubHarness({ script: () => runResultDerailing('收入最高是 gameA', '另外提醒：记得看下周报表') })
    const executeSql = makeStubExecute(new Map([['SELECT game FROM rev ORDER BY amt DESC LIMIT 1', { rows: [{ game: 'gameA' }], columns: ['game'] }]]))
    const res = await runMultiTurnCase(case_, { runId: RUN_ID, responder: buildAgentResponder(harness), executeSql, passK: 1 })
    // No ProtocolError — the adapter accepts multi-message intervals (four-stage agent)
    expect(res.attempts[0]!.error).toBeNull()
    // generatedSql is null (no tool/call in runResultDerailing), so EXECUTION can't score
    expect(res.attempts[0]!.verdict).not.toBe('pass')
  })
  it('validateRunResult still throws on ZERO assistant/message (real fault)', async () => {
    const case_ = makeCase({ case_id: 's8-zero', input: { question: '收入最高游戏？' }, expected: { result_value: { value: 'gameA' }, match_mode: 'scalar_exact', answer: 'gameA', delivery_match: 'fuzzy' } })
    const harness = new StubHarness({ script: () => ({ finalResponse: '', events: [{ type: 'tool/call', data: { name: 'query_data', arguments: { sql: 'SELECT 1' } } }], notifications: [] }) })
    const executeSql = makeStubExecute(new Map([['SELECT 1', { rows: [{ game: 'gameA' }], columns: ['game'] }]]))
    const res = await runMultiTurnCase(case_, { runId: RUN_ID, responder: buildAgentResponder(harness), executeSql, passK: 1 })
    expect(res.passed).toBe(false)
    expect(res.attempts[0]!.error).toContain('H1 protocol error')
    expect(res.attempts[0]!.error).toContain('got 0')
  })
})
