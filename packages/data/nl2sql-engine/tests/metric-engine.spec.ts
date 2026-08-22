import { test, expect } from 'vitest'
import {
  isMetricHit,
  routeMetric,
  extractTimeParams,
  buildExecutableSQL,
  buildMetricContext,
  metricFromHit,
  type MetricDefinitionLite,
} from '../src/metric-engine.ts'
import type { RetrievalHit } from '../src/bm25-linking.ts'
import { Nl2sqlEngine } from '../src/engine.ts'
import { StandInOdps, outcome } from '../src/stand-in-odps.ts'
import { FailureKind } from '../src/types.ts'
import type { DataSourceDoc } from '../src/bm25-linking.ts'
import { ReplayLlm } from '../src/replay-llm.ts'
import { buildPrompt } from '../src/prompt.ts'
import type { RelationGraphLike, RelationGraphEdge } from '../src/ontology.ts'

const DAU: MetricDefinitionLite = {
  name: 'dau',
  description: '日活',
  computation: { sql: 'COUNT(DISTINCT user_id)', metadata: { source: 'ods_login', aggregation: 'count_distinct', field: 'user_id', time_grain: 'daily' } },
}
const DAU_TMPL: MetricDefinitionLite = {
  name: 'dau_t',
  description: '日活',
  computation: { sql: "SELECT COUNT(DISTINCT user_id) FROM ods_login WHERE ds = '{{date}}'", metadata: { source: 'ods_login' } },
}
function metricHit(m: MetricDefinitionLite): RetrievalHit {
  return { id: m.name, score: 1, payload: { id: m.name, payload: { ...m, kind: 'metric' } }, mode: 'bm25-only' }
}
function tableHit(id: string): RetrievalHit {
  return { id, score: 1, payload: { id, payload: { kind: 'dws' } }, mode: 'bm25-only' }
}

test('D1 — isMetricHit detects metric corpus items', () => {
  expect(isMetricHit(metricHit(DAU))).toBe(true)
  expect(isMetricHit(tableHit('dws_pay'))).toBe(false)
})

test('D1 — metricFromHit returns the metric def for a metric hit (null otherwise)', () => {
  expect(metricFromHit(metricHit(DAU))?.name).toBe('dau')
  expect(metricFromHit(tableHit('dws_pay'))).toBeNull()
})

test('D1 — routeMetric: 1 metric + 0 other -> level-2.5; metric + table -> level-2; none -> null', () => {
  expect(routeMetric([metricHit(DAU)])).toBe('level-2.5')
  expect(routeMetric([metricHit(DAU), tableHit('dws_pay')])).toBe('level-2')
  expect(routeMetric([tableHit('dws_pay')])).toBeNull()
})

test('D1 — buildExecutableSQL wraps a bare expr with FROM + ds filter', () => {
  const sql = buildExecutableSQL(DAU, extractTimeParams('昨天DAU', '20260820'), ['ds'])
  expect(sql).toBe("SELECT COUNT(DISTINCT user_id) FROM ods_login WHERE ds = '20260819'")
})

test('D1 — buildExecutableSQL substitutes {{date}} in a template sql', () => {
  const sql = buildExecutableSQL(DAU_TMPL, { date: '20260819' }, ['ds'])
  expect(sql).toBe("SELECT COUNT(DISTINCT user_id) FROM ods_login WHERE ds = '20260819'")
})

test('D1 — buildExecutableSQL omits WHERE when source has no ds partition', () => {
  const sql = buildExecutableSQL(DAU, { date: '20260819' }, [])
  expect(sql).toBe('SELECT COUNT(DISTINCT user_id) FROM ods_login')
})

test('D1 — extractTimeParams: 昨天/今天/前天/上周/本月/指定日期/none', () => {
  expect(extractTimeParams('昨天的DAU', '20260820')).toEqual({ date: '20260819' })
  expect(extractTimeParams('今天的DAU', '20260820')).toEqual({ date: '20260820' })
  expect(extractTimeParams('前天DAU', '20260820')).toEqual({ date: '20260818' })
  const week = extractTimeParams('上周DAU', '20260820')
  expect(week.start_date).toBeDefined()
  expect(week.end_date).toBeDefined()
  const month = extractTimeParams('本月DAU', '20260820')
  expect(month.start_date).toBe('20260801')
  expect(month.end_date).toBe('20260820')
  expect(extractTimeParams('2026-08-15的DAU', '20260820')).toEqual({ date: '20260815' })
  expect(extractTimeParams('DAU是多少', '20260820')).toEqual({})
})

test('D1 — buildMetricContext renders a context line', () => {
  const ctx = buildMetricContext(DAU, { date: '20260819' })
  expect(ctx).toContain('dau')
  expect(ctx).toContain('COUNT(DISTINCT user_id)')
  expect(ctx).toContain('ods_login')
})

const DAU_DS: DataSourceDoc[] = [
  { id: 'dau', description: '日活 DAU', payload: { kind: 'metric', name: 'dau', computation: { sql: 'COUNT(DISTINCT user_id)', metadata: { source: 'ods_login' } } } },
]

test('D2-e2e — pure-metric query executes via Level 2.5 without an LLM call', async () => {
  const llm = new ReplayLlm({}) // default generate returns a SQL; must NEVER be called on the L2.5 path
  const odps = new StandInOdps({ "FROM ods_login WHERE ds = '20260819'": outcome.done([{ cnt: 7 }], 'rid-dau') })
  const eng = new Nl2sqlEngine({ dataSources: DAU_DS, llm, odps, partitionResolver: () => ['ds'] })
  const r = await eng.run({ question: '昨天DAU是多少', today: '20260820' })
  expect(r.ok).toBe(true)
  expect(r.sql).toBe("SELECT COUNT(DISTINCT user_id) FROM ods_login WHERE ds = '20260819'")
  expect(llm.callCount).toBe(0) // Level 2.5 bypasses the LLM entirely
  expect(r.trace.some(t => t.step === 'metric_level25')).toBe(true)
})

test('D2-e2e — metric execution failure => honest decline (no LLM self-correction)', async () => {
  const llm = new ReplayLlm({})
  const odps = new StandInOdps({ 'FROM ods_login': outcome.failed(FailureKind.SEMANTIC_MISMATCH, 'no such table') })
  const eng = new Nl2sqlEngine({ dataSources: DAU_DS, llm, odps, partitionResolver: () => ['ds'] })
  const r = await eng.run({ question: '昨天DAU是多少', today: '20260820' })
  expect(r.decline).toBe(true)
})

test('D2-e2e — pure-metric query stays Level 2.5 even with a graph (derived_from expansion does not flip routing)', async () => {
  // A graph whose derived_from edge (dau -> ods_login) would, pre-fix, add ods_login
  // as a candidate and flip routeMetric to 'level-2'. Routing is computed from the
  // pre-expansion BM25 hits, so this stays 'level-2.5' (deterministic, 0 LLM calls).
  const graph: RelationGraphLike = {
    findJoinPath: () => null,
    getJoinCondition: () => null,
    getRelated: () => [],
    getDerived: (id: string): readonly RelationGraphEdge[] => id === 'dau' ? [{ targetId: 'ods_login', type: 'derived_from' }] : [],
  }
  const llm = new ReplayLlm({})
  const odps = new StandInOdps({ "FROM ods_login WHERE ds = '20260819'": outcome.done([{ cnt: 7 }], 'rid-dau2') })
  const eng = new Nl2sqlEngine({ dataSources: DAU_DS, llm, odps, partitionResolver: () => ['ds'], graph })
  const r = await eng.run({ question: '昨天DAU是多少', today: '20260820' })
  expect(r.ok).toBe(true)
  expect(r.trace.some(t => t.step === 'metric_level25')).toBe(true)
  expect(llm.callCount).toBe(0)
})

test('D3-e2e — mixed query (metric + table) routes to Level 2 + augments candidates so the source table is accepted', async () => {
  const ds: DataSourceDoc[] = [
    { id: 'dau', description: '日活 DAU', payload: { kind: 'metric', name: 'dau', computation: { sql: 'COUNT(DISTINCT user_id)', metadata: { source: 'ods_login' } } } },
    { id: 'dws_pay_order_di', description: '付费订单 DWS pay_amt role_id', payload: { kind: 'dws' } },
  ]
  // scripted LLM joins the metric's source ods_login (NOT a candidate pre-augmentation)
  const llm = new ReplayLlm({ 付费用户: { sql: "SELECT COUNT(DISTINCT p.user_id) AS cnt FROM dws_pay_order_di p JOIN ods_login o ON p.user_id=o.user_id WHERE p.ds='20260819' AND p.pay_amt>0" } })
  const odps = new StandInOdps({ 'COUNT(DISTINCT p.user_id)': outcome.done([{ cnt: 3 }], 'rid-mix') })
  const eng = new Nl2sqlEngine({ dataSources: ds, llm, odps, partitionResolver: () => ['ds'] })
  const r = await eng.run({ question: '付费用户中等级>50的DAU', today: '20260820' })
  expect(r.ok).toBe(true)
  expect(r.trace.some(t => t.step === 'metric_level25')).toBe(false) // NOT Level 2.5 (mixed)
  expect(r.trace.some(t => t.step === 'llm_generate')).toBe(true)   // went through the LLM loop
})

test('D3 — buildPrompt renders the metric-context section when metricContext is provided', () => {
  const p = buildPrompt({
    question: '付费用户中等级>50的DAU',
    candidates: [{ id: 'dau', score: 1, payload: { id: 'dau' }, mode: 'bm25-only' }],
    eventDef: null, conventions: null, phase: 'generation',
    metricContext: "- dau = SELECT COUNT(DISTINCT user_id) FROM ods_login WHERE ds = '20260819'（日活）",
  })
  expect(p).toContain('已知指标定义（请基于此规则构建查询）')
  expect(p).toContain('COUNT(DISTINCT user_id)')
})
