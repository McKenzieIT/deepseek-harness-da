#!/usr/bin/env node
// PROTOTYPE (throwaway) — P11 eval harness · demo driver. See README.md.
// `node run.mjs --demo` auto-runs all 8 scenarios (S1-S8) + prints full eval state after each.
// `node run.mjs` interactive menu.
// Green = every scenario's assertions hold; a failure throws + exits non-zero (red).

import { createInterface } from 'node:readline/promises'
import { makeCase } from './eval_case.mjs'
import { runMultiTurnCase } from './multi_turn.mjs'
import { buildAgentResponder } from './adapter.mjs'
import {
  StubHarness, runResult, runResultDerailing, makeStubExecute, makeStubJudgeProvider,
} from './harness-stub.mjs'
import { AuthenticationAbort } from './judge.mjs'

const banner = (s) => console.log(`\n${'═'.repeat(72)}\n  ${s}\n${'═'.repeat(72)}`)
function assert(cond, msg) { if (!cond) throw new Error(`ASSERT FAIL: ${msg}`) }
function assertEq(a, b, msg) {
  if (a !== b) throw new Error(`ASSERT FAIL: ${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
}

const RUN_ID = 'run-demo'
const TOP1_SQL = 'SELECT game FROM rev ORDER BY amt DESC LIMIT 1'

// ──────────────────────────────────────────────────────────────────────────────
// S1 · scripted multi-turn + pass_k=3 all pass
// nails: MultiTurnSession + drive_session + run_multi_turn_case + pass_k + adapter (finalResponse +
// SQL from events) + dsh-llm-replay determinism (3 identical attempts)
async function s1() {
  banner('S1 · scripted multi-turn (2 scripted turns) + pass_k=3 all pass')
  const case_ = makeCase({
    case_id: 's1-multiturn-pass',
    input: {
      question: '收入最高的游戏是哪个？',
      turns: [
        { role: 'user', content: '我想看最近 7 天各游戏收入' },
        { role: 'assistant', content: '好的，我来查询最近 7 天各游戏的收入数据' },
      ],
    },
    expected: {
      result_value: { value: 'gameA' }, match_mode: 'scalar_exact',
      answer: 'gameA', delivery_match: 'fuzzy',
    },
  })
  const harness = new StubHarness({
    script: (message) => {
      if (message === '我想看最近 7 天各游戏收入')
        return runResult('好的，我来查询最近 7 天各游戏的收入数据') // non-terminal, no SQL
      if (message === '收入最高的游戏是哪个？')
        return runResult('收入最高的游戏是 gameA', { sql: TOP1_SQL })
      return runResult('?')
    },
  })
  const executeSql = makeStubExecute(new Map([
    [TOP1_SQL, { rows: [{ game: 'gameA' }], columns: ['game'] }],
  ]))
  const res = await runMultiTurnCase(case_, { runId: RUN_ID, responder: buildAgentResponder(harness), executeSql, passK: 3 })
  console.log('passed:', res.passed, '| verdict:', res.verdict, '| attempts:', res.attempts.map((a) => `${a.attempt}:${a.verdict ?? 'err'}`))
  console.log('attempts[0] l1 assertions:', JSON.stringify(res.attempts[0].l1?.assertions))
  assertEq(res.passed, true, 'S1 passed')
  assertEq(res.verdict, 'pass', 'S1 verdict=pass')
  assertEq(res.attempts.length, 3, 'S1 pass_k=3')
  assert(res.attempts.every((a) => a.verdict === 'pass' && a.error == null), 'S1 all 3 attempts pass (determinism)')
  console.log('✓ S1 green: scripted multi-turn state machine + drive_session + pass_k + adapter + dsh-llm-replay determinism')
}

// ──────────────────────────────────────────────────────────────────────────────
// S2 · non-terminal derailment (_turn_matches_expectation fuzzy <0.35)
async function s2() {
  banner('S2 · non-terminal derailment (agent reply fuzzy <0.35 -> streak break -> derail)')
  const case_ = makeCase({
    case_id: 's2-derail',
    input: {
      question: '收入最高的游戏是哪个？',
      turns: [
        { role: 'user', content: '我想看最近 7 天各游戏收入' },
        { role: 'assistant', content: '好的，我来查询最近 7 天各游戏的收入数据' },
      ],
    },
    expected: {
      result_value: { value: 'gameA' }, match_mode: 'scalar_exact',
      answer: 'gameA', delivery_match: 'fuzzy',
    },
  })
  const harness = new StubHarness({
    script: (message) => {
      if (message === '我想看最近 7 天各游戏收入')
        return runResult('今天天气真不错啊') // MISMATCHES scripted assistant -> derail
      return runResult('收入最高是 gameA', { sql: TOP1_SQL })
    },
  })
  const executeSql = makeStubExecute(new Map([[TOP1_SQL, { rows: [{ game: 'gameA' }], columns: ['game'] }]]))
  const res = await runMultiTurnCase(case_, { runId: RUN_ID, responder: buildAgentResponder(harness), executeSql, passK: 1 })
  console.log('passed:', res.passed, '| verdict:', res.verdict)
  console.log('attempts[0] diagnostic:', JSON.stringify(res.attempts[0].diagnostic))
  assertEq(res.attempts[0].diagnostic.derailed_at_turn, 1, 'S2 derailed at turn 1')
  assertEq(res.attempts[0].diagnostic.terminal_verdict, 'fail', 'S2 derail verdict=fail')
  assertEq(res.attempts[0].state, 'terminated', 'S2 state=terminated')
  console.log('✓ S2 green: _turn_matches_expectation fuzzy + derailment verdict mapping (pass->partial, fail->fail)')
}

// ──────────────────────────────────────────────────────────────────────────────
// S3 · EXECUTION 5 match_mode (each 1:1 translation)
async function s3() {
  banner('S3 · EXECUTION 5 match_mode (scalar_exact / multi_scalar_exact / row_count_range / set_equal / ordered_subset)')
  const sqlMap = new Map([
    ['SELECT COUNT(*) AS c FROM users', { rows: [{ c: 12345 }], columns: ['c'] }],
    ['SELECT game, amt FROM top', { rows: [{ game: 'gameA', amt: 1000 }], columns: ['game', 'amt'] }],
    ['SELECT game FROM top3', { rows: [{ game: 'gameA' }, { game: 'gameB' }, { game: 'gameC' }], columns: ['game'] }],
    ['SELECT g FROM ranking', { rows: [{ g: 'A' }, { g: 'B' }, { g: 'C' }, { g: 'D' }], columns: ['g'] }],
  ])
  const executeSql = makeStubExecute(sqlMap)
  const sub = [
    { id: 's3-scalar', q: '总用户数？', sql: 'SELECT COUNT(*) AS c FROM users', rv: { value: 12345 }, mm: 'scalar_exact' },
    { id: 's3-multi', q: 'top1 游戏与金额？', sql: 'SELECT game, amt FROM top', rv: { fields: { game: 'gameA', amt: 1000 } }, mm: 'multi_scalar_exact' },
    { id: 's3-rowcount', q: '前 3 名有？', sql: 'SELECT game FROM top3', rv: { min: 3, max: 5 }, mm: 'row_count_range' },
    { id: 's3-set', q: '前 3 名集合？', sql: 'SELECT game FROM top3', rv: { rows: [{ game: 'gameA' }, { game: 'gameB' }, { game: 'gameC' }] }, mm: 'set_equal' },
    { id: 's3-ordered', q: '前 2 名顺序？', sql: 'SELECT g FROM ranking', rv: { rows: [{ g: 'A' }, { g: 'C' }] }, mm: 'ordered_subset' },
  ]
  for (const s of sub) {
    const c = makeCase({ case_id: s.id, input: { question: s.q, turns: [] }, expected: { result_value: s.rv, match_mode: s.mm } })
    const harness = new StubHarness({ script: () => runResult(`答: ${s.sql}`, { sql: s.sql }) })
    const res = await runMultiTurnCase(c, { runId: RUN_ID, responder: buildAgentResponder(harness), executeSql, passK: 1 })
    console.log(`${s.id}: ${res.verdict} | result_match=${JSON.stringify(res.attempts[0].l1?.assertions?.result_match)}`)
    assertEq(res.verdict, 'pass', `S3 ${s.id} verdict=pass`)
  }
  console.log('✓ S3 green: 5 match_mode 1:1 translation (checkResultMatch) + ctx.query.execute stub + fixture loading')
}

// ──────────────────────────────────────────────────────────────────────────────
// S4 · DELIVERY scalar_exact + fuzzy (two deterministic layers)
async function s4() {
  banner('S4 · DELIVERY scalar_exact (numeric) + fuzzy (text)')
  const emptyExec = makeStubExecute(new Map())
  // scalar_exact DELIVERY (numeric answer parsed from finalResponse; no EXECUTION)
  const cNum = makeCase({
    case_id: 's4-delivery-scalar', input: { question: '总用户数？', turns: [] },
    expected: { result_value: null, match_mode: null, answer: 98765, delivery_match: 'scalar_exact' },
  })
  const hNum = new StubHarness({ script: () => runResult('当前总用户数为 98765 人') })
  const rNum = await runMultiTurnCase(cNum, { runId: RUN_ID, responder: buildAgentResponder(hNum), executeSql: emptyExec, passK: 1 })
  console.log('scalar_exact DELIVERY:', rNum.verdict, '|', JSON.stringify(rNum.attempts[0].l1?.assertions?.delivery))
  assertEq(rNum.verdict, 'pass', 'S4 scalar_exact DELIVERY pass')
  // fuzzy DELIVERY (text answer; token overlap via substring-contained)
  const cTxt = makeCase({
    case_id: 's4-delivery-fuzzy', input: { question: '销量第一是谁？', turns: [] },
    expected: { result_value: null, match_mode: null, answer: '销量第一是游戏A', delivery_match: 'fuzzy' },
  })
  const hTxt = new StubHarness({ script: () => runResult('根据查询，销量第一是游戏A，其次是游戏B') })
  const rTxt = await runMultiTurnCase(cTxt, { runId: RUN_ID, responder: buildAgentResponder(hTxt), executeSql: emptyExec, passK: 1 })
  console.log('fuzzy DELIVERY:', rTxt.verdict, '|', JSON.stringify(rTxt.attempts[0].l1?.assertions?.delivery))
  assertEq(rTxt.verdict, 'pass', 'S4 fuzzy DELIVERY pass')
  console.log('✓ S4 green: DELIVERY scalar_exact (parse number from finalResponse) + fuzzy (token/trigram >=0.35)')
}

// ──────────────────────────────────────────────────────────────────────────────
// S5 · DELIVERY LLM-judge (stub injected LLMProvider) — retry/backoff success + auth abort
async function s5() {
  banner('S5 · DELIVERY LLM-judge (stub LLMProvider): retryable 2x then success + AuthenticationAbort')
  const longAnswer = '本周期内游戏收入整体呈上升趋势，其中策略类游戏增长显著，受新版本活动拉动；休闲类略有下滑，建议下周持续关注策略品类。'
  const emptyExec = makeStubExecute(new Map())
  // Sub-case A: retryable twice then success -> backoff+JUDGE_MAX_RETRIES handles -> pass
  const cA = makeCase({
    case_id: 's5-judge-retry', input: { question: '分析本周收入趋势', turns: [] },
    expected: { result_value: null, match_mode: null, answer: longAnswer, delivery_match: 'llm_judge' },
  })
  const { provider: provA, calls: callsA } = makeStubJudgeProvider([
    { throw: 'retryable' }, { throw: 'retryable' }, { score: 0.85, rationale: '准确捕捉了趋势与品类差异' },
  ])
  const hA = new StubHarness({ script: () => runResult('本周策略类游戏收入上升，休闲类略降，受活动拉动。') })
  const rA = await runMultiTurnCase(cA, { runId: RUN_ID, responder: buildAgentResponder(hA), executeSql: emptyExec, provider: provA, passK: 1 })
  console.log('judge retry path:', rA.verdict, '| judge calls:', callsA.length, '|', JSON.stringify(rA.attempts[0].l1?.assertions?.delivery?.judge))
  assertEq(rA.verdict, 'pass', 'S5-A judge retry-then-success pass')
  assertEq(callsA.length, 3, 'S5-A judge called 3x (1 initial + 2 retries = JUDGE_MAX_RETRIES=2)')
  // Sub-case B: auth failure -> AuthenticationAbort terminates the run (SPEC §5.5)
  const cB = makeCase({
    case_id: 's5-judge-auth-abort', input: { question: '分析本周收入趋势', turns: [] },
    expected: { result_value: null, match_mode: null, answer: longAnswer, delivery_match: 'llm_judge' },
  })
  const { provider: provB } = makeStubJudgeProvider([{ throw: 'auth' }])
  const hB = new StubHarness({ script: () => runResult('本周策略类游戏收入上升。') })
  let aborted = false
  try {
    await runMultiTurnCase(cB, { runId: RUN_ID, responder: buildAgentResponder(hB), executeSql: emptyExec, provider: provB, passK: 1 })
  } catch (err) {
    aborted = err instanceof AuthenticationAbort
    console.log('judge auth path: threw AuthenticationAbort:', aborted, '|', err.message)
  }
  assert(aborted, 'S5-B judge auth -> AuthenticationAbort terminates the run (SPEC §5.5)')
  console.log('✓ S5 green: LLM-judge injection + retry/backoff + classify_error + AuthenticationAbort')
}

// ──────────────────────────────────────────────────────────────────────────────
// S6 · pass_k_verdict anti-flakiness (attempt 1 fail, 2-3 pass -> overall fail, verdict=attempt1's)
async function s6() {
  banner('S6 · pass_k_verdict anti-flakiness (attempt1 fail / 2-3 pass -> overall fail, verdict=FIRST non-pass)')
  const case_ = makeCase({
    case_id: 's6-flaky', input: { question: '收入最高游戏？', turns: [] },
    expected: { result_value: { value: 'gameA' }, match_mode: 'scalar_exact', answer: 'gameA', delivery_match: 'fuzzy' },
  })
  const harness = new StubHarness({
    script: (message, sid) => {
      // sessionId = `${RUN_ID}:${case_id}:${attempt}` -> branch on attempt suffix.
      // attempt1: wrong DELIVERY text (no overlap with gameA -> fuzzy fail) but SQL correct
      // (EXECUTION pass) -> demonstrates "取数对但交付错" as a separate failure mode (G2 Q1).
      // (gameX would NOT fail — trigrams gameX/gameA overlap 2/3 >=0.35, too lenient for short tokens.)
      if (sid.endsWith(':1')) return runResult('数据不足，无法判断收入最高的游戏', { sql: TOP1_SQL })
      return runResult('收入最高是 gameA', { sql: TOP1_SQL })
    },
  })
  const executeSql = makeStubExecute(new Map([[TOP1_SQL, { rows: [{ game: 'gameA' }], columns: ['game'] }]]))
  const res = await runMultiTurnCase(case_, { runId: RUN_ID, responder: buildAgentResponder(harness), executeSql, passK: 3 })
  console.log('passed:', res.passed, '| verdict:', res.verdict, '| attempts:', res.attempts.map((a) => `${a.attempt}:${a.verdict}`))
  assertEq(res.passed, false, 'S6 passed=false (1 of 3 failed)')
  assertEq(res.attempts[0].verdict, 'fail', 'S6 attempt1=fail (DELIVERY wrong text, EXECUTION right -> separate failure mode)')
  assertEq(res.attempts[1].verdict, 'pass', 'S6 attempt2=pass')
  assertEq(res.attempts[2].verdict, 'pass', 'S6 attempt3=pass')
  assertEq(res.verdict, res.attempts[0].verdict, 'S6 verdict=FIRST non-pass attempt (not last)')
  assert(res.verdict === 'fail', 'S6 verdict=fail (exposes flakiness, not hidden by last attempt pass)')
  console.log('✓ S6 green: pass_k_verdict takes FIRST non-pass attempt (anti-flakiness; not last)')
}

// ──────────────────────────────────────────────────────────────────────────────
// S7 · Promise.race wall-clock timeout + runtime close/respawn (H2 mitigation)
async function s7() {
  banner('S7 · Promise.race wall-clock timeout + runtime close/respawn (H2: no mid-turn cancel)')
  const case_ = makeCase({
    case_id: 's7-timeout', input: { question: '收入最高游戏？', turns: [] },
    expected: { result_value: { value: 'gameA' }, match_mode: 'scalar_exact', answer: 'gameA', delivery_match: 'fuzzy' },
  })
  const harness = new StubHarness({
    hangUntilRespawn: true,
    script: () => runResult('收入最高是 gameA', { sql: TOP1_SQL }),
  })
  const executeSql = makeStubExecute(new Map([[TOP1_SQL, { rows: [{ game: 'gameA' }], columns: ['game'] }]]))
  let timeoutFired = 0
  const onTimeout = async () => { timeoutFired++; harness.close(); harness.respawn() }
  const res = await runMultiTurnCase(case_, {
    runId: RUN_ID, responder: buildAgentResponder(harness), executeSql, passK: 3,
    timeoutMs: 50, onTimeout,
  })
  console.log('passed:', res.passed, '| verdict:', res.verdict)
  console.log('attempts:', res.attempts.map((a) => (a.timeout ? `${a.attempt}:TIMEOUT` : `${a.attempt}:${a.verdict}`)))
  console.log('harness.respawnCount:', harness.respawnCount, '| onTimeout fired:', timeoutFired)
  assertEq(res.attempts[0].timeout, true, 'S7 attempt1 timed out')
  assert(res.attempts[0].error?.includes('wall-clock timeout'), 'S7 attempt1 error=wall-clock timeout')
  assertEq(res.attempts[1].verdict, 'pass', 'S7 attempt2 pass (after respawn)')
  assertEq(res.attempts[2].verdict, 'pass', 'S7 attempt3 pass')
  assertEq(harness.respawnCount, 1, 'S7 runtime respawned once after timeout')
  assertEq(res.passed, false, 'S7 overall fail (attempt1 errored -> not all pass)')
  console.log('✓ S7 green: Promise.race wall-clock timeout + runtime close/respawn (H2 mitigation)')
}

// ──────────────────────────────────────────────────────────────────────────────
// S8 · H1 mitigation — derailing interval (>=2 assistant/messages) -> ProtocolError
async function s8() {
  banner('S8 · H1 mitigation (research Claim H1): derailing interval -> ProtocolError')
  const case_ = makeCase({
    case_id: 's8-h1', input: { question: '收入最高游戏？', turns: [] },
    expected: { result_value: { value: 'gameA' }, match_mode: 'scalar_exact', answer: 'gameA', delivery_match: 'fuzzy' },
  })
  const harness = new StubHarness({
    script: () => runResultDerailing('收入最高是 gameA', '另外提醒：记得看下周报表'),
  })
  const executeSql = makeStubExecute(new Map([[TOP1_SQL, { rows: [{ game: 'gameA' }], columns: ['game'] }]]))
  const res = await runMultiTurnCase(case_, { runId: RUN_ID, responder: buildAgentResponder(harness), executeSql, passK: 1 })
  console.log('passed:', res.passed, '| attempts[0].error:', res.attempts[0].error)
  assert(res.attempts[0].error?.includes('H1 protocol error'), 'S8 H1 protocol error raised')
  assert(res.attempts[0].error?.includes('got 2'), 'S8 error reports 2 assistant/messages')
  assertEq(res.passed, false, 'S8 overall fail (H1 fault -> attempt error)')
  console.log('✓ S8 green: H1 mitigation (validateRunResult asserts exactly 1 assistant/message; derailing -> ProtocolError)')
}

const scenarios = [
  { n: '1', title: 'scripted multi-turn + pass_k=3 all pass', run: s1 },
  { n: '2', title: 'non-terminal derailment (fuzzy <0.35)', run: s2 },
  { n: '3', title: 'EXECUTION 5 match_mode (1:1 translation)', run: s3 },
  { n: '4', title: 'DELIVERY scalar_exact + fuzzy', run: s4 },
  { n: '5', title: 'DELIVERY LLM-judge (stub: retry/backoff + AuthenticationAbort)', run: s5 },
  { n: '6', title: 'pass_k_verdict anti-flakiness (first non-pass)', run: s6 },
  { n: '7', title: 'Promise.race wall-clock timeout + respawn (H2)', run: s7 },
  { n: '8', title: 'H1 mitigation (derailing interval -> ProtocolError)', run: s8 },
]

async function main() {
  if (process.argv.slice(2).includes('--demo')) {
    let passed = 0
    for (const s of scenarios) {
      try { await s.run(); passed++ }
      catch (e) { console.error(`\n✗ ${s.title}: ${e.message}`); console.error(e.stack); process.exit(1) }
    }
    banner(`demo complete · ${passed}/${scenarios.length} scenarios green · PROTOTYPE validated`)
    return
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  while (true) {
    console.log('\nP11 eval harness prototype — pick a scenario (a=all, q to quit):')
    for (const s of scenarios) console.log(`  ${s.n}: ${s.title}`)
    const ans = (await rl.question('> ')).trim()
    if (ans === 'q' || ans === 'quit') break
    if (ans === 'a') {
      for (const s of scenarios) { try { await s.run() } catch (e) { console.error(`✗ ${s.title}: ${e.message}`) } }
      continue
    }
    const s = scenarios.find((x) => x.n === ans)
    if (s) { try { await s.run() } catch (e) { console.error(`✗ ${e.message}`) } }
    else console.log('unknown — try again')
  }
  rl.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
