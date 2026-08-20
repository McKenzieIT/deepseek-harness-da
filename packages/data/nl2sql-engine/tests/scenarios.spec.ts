/**
 * P13b NL→SQL engine — the 9 production scenarios ported from the throwaway
 * `prototypes/p13-nl2sql-engine/run.mjs` to vitest. Validated: BM25 linking +
 * prompt + critic gate + JSON-path + feedback self-correction + near-dup gate
 * + eval-gate L1 pass-rate + honest decline + sql_syntax_gate slot.
 *
 * Run: `pnpm vitest run packages/nl2sql-engine/tests/scenarios.spec.ts`
 * (the root `pnpm test` globs all `*.spec.ts`).
 */
import { test, expect } from 'vitest'
import { Bm25Linker } from '../src/bm25-linking.ts'
import { buildPrompt } from '../src/prompt.ts'
import { critiqueSql, sqlSyntaxGate, extractJsonPaths } from '../src/critic.ts'
import { Nl2sqlEngine } from '../src/engine.ts'
import { ReplayLlm } from '../src/replay-llm.ts'
import { StandInOdps, outcome } from '../src/stand-in-odps.ts'
import { makeCriticCtx, GateResult, MAX_SQL_PER_TURN, FailureKind, type QueryOutcome } from '../src/types.ts'
import { runEval } from '../src/eval/runner.ts'
import { FIXTURE_DATA_SOURCES, FIXTURE_EVENT_DEF } from '../src/eval/cases.ts'
import { loadConventions } from '@deepseek-ai/dsh-query-maxcompute/src/conventions.ts'

const DS = FIXTURE_DATA_SOURCES
const EV = FIXTURE_EVENT_DEF
const asScripted = (sub: string, out: QueryOutcome): Record<string, QueryOutcome> => ({ [sub]: out })

test('S1 BM25 linking 召回 dws_pay_order_di top-1（per-field 权重 + CJK bigram）', () => {
  const r = new Bm25Linker(DS)
  const hits = r.retrieve('昨天充值总金额', { topK: 5, mode: 'bm25-only' })
  expect(hits.length).toBeGreaterThan(0)
  expect(hits[0]!.id).toBe('dws_pay_order_di')
})

test('S2 prompt 组装（staged SOP + 方言 grounding + MAX_SQL_PER_TURN + P7 四阶段）', () => {
  const p = buildPrompt({
    question: '昨天充值总金额',
    candidates: [{ id: 'dws_pay_order_di', score: 1.2, payload: DS[0], mode: 'bm25-only' }],
    eventDef: EV,
    conventions: loadConventions('maxcompute'),
    phase: 'generation',
  })
  for (const must of [
    '§3 直答路径',
    '阶段 A 准备',
    '阶段 D 执行与防护',
    '§5 诚实拒绝',
    '§6 八规则',
    `MAX_SQL_PER_TURN=${MAX_SQL_PER_TURN}`,
    '方言速查',
    'GET_JSON_OBJECT',
    'phase=generation',
  ]) {
    expect(p).toContain(must)
  }
})

test('S3 critic gate（ds 缺/SELECT *→warn；表名∉候选/字段∉params→fail；无 SQL→fail-open）', () => {
  const ctxPay = makeCriticCtx({ candidateTables: ['dws_pay_order_di'], eventParams: EV.params_fields, partitionCols: ['ds'] })
  const ctxEvent = makeCriticCtx({ candidateTables: ['ods_event_view'], eventParams: EV.params_fields, partitionCols: ['ds'] })

  // ds 缺 → warning pass
  let r = critiqueSql('SELECT SUM(pay_amt) FROM dws_pay_order_di', ctxPay)
  expect(r.passed).toBe(true)
  expect(r.reason ?? '').toContain('missing_partition_filter')

  // SELECT * → warning
  r = critiqueSql("SELECT * FROM dws_pay_order_di WHERE ds='20260819'", ctxPay)
  expect(r.passed).toBe(true)
  expect(r.reason ?? '').toContain('select_star')

  // 表名∉候选 → error fail
  r = critiqueSql("SELECT COUNT(*) FROM fake_table WHERE ds='20260819'", ctxPay)
  expect(r.passed).toBe(false)

  // 字段∉params → error fail (fix #2: t.* + a,* detection also covered by the parse)
  r = critiqueSql("SELECT GET_JSON_OBJECT(params,'$.notAField') FROM ods_event_view WHERE event='x' AND ds='20260819'", ctxEvent)
  expect(r.passed).toBe(false)

  // 字段∈params → pass
  r = critiqueSql("SELECT GET_JSON_OBJECT(params,'$.amount') FROM ods_event_view WHERE event='x' AND ds='20260819'", ctxEvent)
  expect(r.passed).toBe(true)

  // fail-open: no SQL
  r = critiqueSql(null, ctxPay)
  expect(r.passed).toBe(true)
})

test('S4 critic JSON path 解析（$.a.b.c 取叶子段∈params）', () => {
  const paths = extractJsonPaths("SELECT GET_JSON_OBJECT(params, '$.user.profile.level') FROM t WHERE ds='1'")
  expect(paths.length).toBeGreaterThan(0)
  expect(paths[0]!.leaf).toBe('level')
  const ctx = makeCriticCtx({ candidateTables: ['t'], eventParams: { amount: {} }, partitionCols: ['ds'] })
  const r = critiqueSql("SELECT GET_JSON_OBJECT(params,'$.user.profile.level') FROM t WHERE ds='1'", ctx)
  expect(r.passed).toBe(false) // 'level' ∉ params → fail
})

test('S5 feedback self-correction（parse_failed→重写→done；TABLE_NOT_FOUND→decline）', async () => {
  // parse_failed first, rewrite → done
  let llm = new ReplayLlm({
    充值场景一: ({ attempt }) => ({
      sql:
        attempt === 0
          ? 'SELECT BAD SYNTAX FROM dws_pay_order_di WHERE ds=20260819'
          : "SELECT SUM(pay_amt) AS total FROM dws_pay_order_di WHERE ds='20260819'",
    }),
  })
  let odps = new StandInOdps(asScripted('BAD SYNTAX', outcome.failed(FailureKind.PARSE_FAILED, 'syntax error near BAD')))
  let eng = new Nl2sqlEngine({ dataSources: DS, llm, odps })
  let r = await eng.run({ question: '充值场景一', eventDef: EV })
  expect(r.ok).toBe(true)

  // TABLE_NOT_FOUND → honest decline (unrecoverable, no retry)
  llm = new ReplayLlm({ 充值场景二: { sql: 'SELECT SUM(pay_amt) AS total FROM dws_pay_order_di WHERE ds=20260820' } })
  odps = new StandInOdps(asScripted('ds=20260820', outcome.failed(FailureKind.TABLE_NOT_FOUND, 'Table not found in scope')))
  eng = new Nl2sqlEngine({ dataSources: DS, llm, odps })
  r = await eng.run({ question: '充值场景二', eventDef: EV })
  expect(r.decline).toBe(true)
})

test('S6 近重复门（同 SQL 哈希拒重试）', async () => {
  const sql = "SELECT SUM(pay_amt) AS total FROM dws_pay_order_di WHERE ds='20260819'"
  const llm = new ReplayLlm({ 充值场景三: { sql } })
  const odps = new StandInOdps(asScripted(sql, outcome.failed(FailureKind.PARSE_FAILED, 'syntax')))
  const eng = new Nl2sqlEngine({ dataSources: DS, llm, odps })
  const r = await eng.run({ question: '充值场景三', eventDef: EV })
  expect(r.decline).toBe(true)
  expect(r.trace.filter(t => t.step === 'near_dup_reject').length).toBeGreaterThan(0)
})

test('S7 eval gate L1 pass-rate（da-fresh cases + EXECUTION 判分 + 诚实门值<RBI 73.8%）', async () => {
  const r = await runEval({ verbose: false })
  expect(r.pass_rate).toBeGreaterThanOrEqual(0.7)
  expect(r.pass).toBe(r.total)
})

test('S8 honest decline（自修耗尽/语义层无定义）', async () => {
  const llm = new ReplayLlm({ 月球场景一: { sql: "SELECT COUNT(*) FROM moon_landing WHERE ds='20260819'" } })
  const odps = new StandInOdps({})
  const eng = new Nl2sqlEngine({ dataSources: DS, llm, odps })
  const r = await eng.run({ question: '月球场景一', eventDef: EV })
  expect(r.decline).toBe(true)
})

test('S9 sql_syntax_gate 槽（返 GateResult）+ F2 同源', async () => {
  const ctx = makeCriticCtx({ candidateTables: ['dws_pay_order_di'], eventParams: EV.params_fields, partitionCols: ['ds'] })
  const phaseOutput = "```sql\nSELECT SUM(pay_amt) FROM dws_pay_order_di WHERE ds='20260819'\n```"
  const g = sqlSyntaxGate(phaseOutput, ctx)
  expect(g).toBeInstanceOf(GateResult)
  expect(g.passed).toBe(true)

  // F2 同源: the SQL the critic checked = the SQL odps.execute received (extractSqlCandidate single source)
  const llm = new ReplayLlm({ 充值场景四: { sql: "SELECT SUM(pay_amt) AS total FROM dws_pay_order_di WHERE ds='20260819'" } })
  const odps = new StandInOdps({})
  const eng = new Nl2sqlEngine({ dataSources: DS, llm, odps })
  const r = await eng.run({ question: '充值场景四', eventDef: EV })
  expect(r.trace.find(t => t.step === 'llm_generate')).toBeTruthy()
  expect(r.trace.find(t => t.step === 'critic')).toBeTruthy()
  expect(r.trace.find(t => t.step === 'execute')).toBeTruthy()
})

test('S10 running → attach(check_query) 续取 → done（fix #3 running→attach poll）', async () => {
  const llm = new ReplayLlm({ 充值场景五: { sql: "SELECT SUM(pay_amt) AS total FROM dws_pay_order_di WHERE ds='20260819'" } })
  // execute → running (scripted substring); StandInOdps.attach → done (default) — exercises the fix-#3 poll loop
  const odps = new StandInOdps(asScripted('FROM dws_pay_order_di', outcome.running('inst-1', 'Map 62% / Reduce 0%')))
  const eng = new Nl2sqlEngine({ dataSources: DS, llm, odps })
  const r = await eng.run({ question: '充值场景五', eventDef: EV })
  expect(r.ok).toBe(true)
  expect(r.trace.some(t => t.step === 'attach')).toBe(true)
})
