import { test, expect } from 'vitest'
import {
  isMetricHit,
  routeMetric,
  extractTimeParams,
  buildMetricContext,
  buildTimeFilterHint,
  metricFromHit,
  type MetricDefinitionLite,
  type HostTableInfo,
} from '../src/metric-engine.ts'
import type { RetrievalHit } from '../src/bm25-linking.ts'
import { Nl2sqlEngine } from '../src/engine.ts'
import { StandInOdps, outcome } from '../src/stand-in-odps.ts'
import type { DataSourceDoc } from '../src/bm25-linking.ts'
import { ReplayLlm } from '../src/replay-llm.ts'
import { buildPrompt } from '../src/prompt.ts'

const DAU: MetricDefinitionLite = {
  name: 'dau',
  description: '日活',
  computation: { sql: 'COUNT(DISTINCT user_id)', metadata: { source: 'ods_login', aggregation: 'count_distinct', field: 'user_id', time_grain: 'daily' } },
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

test('D1 — routeMetric: metric present => level-2; none => null (M1b: Level 2.5 arm removed)', () => {
  expect(routeMetric([metricHit(DAU)])).toBe('level-2')
  expect(routeMetric([metricHit(DAU), tableHit('dws_pay')])).toBe('level-2')
  expect(routeMetric([tableHit('dws_pay')])).toBeNull()
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

test('D1 — buildMetricContext range query surfaces BETWEEN filter', () => {
  const ctx = buildMetricContext(DAU, { start_date: '20260801', end_date: '20260807' })
  expect(ctx).toContain("ds BETWEEN '20260801' AND '20260807'")
  expect(ctx).toContain('ods_login')
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
  expect(r.trace.some(t => t.step === 'llm_generate')).toBe(true) // went through the LLM loop (Level 2)
})

test('D3-e2e — pure-metric query now routes to Level 2 + calls the LLM (M1b: Level 2.5 deterministic path removed)', async () => {
  const ds: DataSourceDoc[] = [
    { id: 'dau', description: '日活 DAU', payload: { kind: 'metric', name: 'dau', computation: { sql: 'COUNT(DISTINCT user_id)', metadata: { source: 'ods_login' } } } },
  ]
  // Post-M1b a pure-metric query is no longer short-circuited; it goes through
  // Level 2 (metric context injected) + the LLM loop. The LLM MUST be called.
  const llm = new ReplayLlm({ DAU: { sql: "SELECT COUNT(DISTINCT user_id) FROM ods_login WHERE ds='20260819'" } })
  const odps = new StandInOdps({ 'FROM ods_login WHERE ds': outcome.done([{ cnt: 7 }], 'rid-dau-l2') })
  const eng = new Nl2sqlEngine({ dataSources: ds, llm, odps, partitionResolver: () => ['ds'] })
  const r = await eng.run({ question: '昨天DAU是多少', today: '20260820' })
  expect(r.ok).toBe(true)
  expect(llm.callCount).toBeGreaterThan(0) // Level 2 always calls the LLM (no deterministic bypass)
  expect(r.trace.some(t => t.step === 'llm_generate')).toBe(true)
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

// ── M1 time-filter hint tests ─────────────────────────────────────────────

test('M1 — buildTimeFilterHint: _df snapshot table → snapshot hint', () => {
  const table: HostTableInfo = { partitions: [{ name: 'ds' }], granularity: '日全量快照_df' }
  const hint = buildTimeFilterHint(table)
  expect(hint).toContain('日全量快照表')
  expect(hint).toContain('MAX_PT()')
  expect(hint).toContain('勿跨天 SUM/COUNT')
})

test('M1 — buildTimeFilterHint: _di daily table → daily partition hint', () => {
  const table: HostTableInfo = { partitions: [{ name: 'ds' }], granularity: '日增量' }
  const hint = buildTimeFilterHint(table)
  expect(hint).toContain('ds 分区过滤')
  expect(hint).toContain("WHERE ds = '...'")
})

test('M1 — buildTimeFilterHint: no ds partition → empty hint', () => {
  const table: HostTableInfo = { partitions: [{ name: 'dt' }], granularity: '日增量' }
  expect(buildTimeFilterHint(table)).toBe('')
})

test('M1 — buildTimeFilterHint: undefined partitions → empty hint', () => {
  const table: HostTableInfo = { granularity: '日全量快照' }
  expect(buildTimeFilterHint(table)).toBe('')
})

test('M1 — buildTimeFilterHint: string partition format → works', () => {
  const hint = buildTimeFilterHint(
    { partitions: ['ds'] as unknown as readonly ({ name: string } | string)[], granularity: '全量' },
  )
  expect(hint).toContain('日全量快照表')
})

test('M1 — buildMetricContext with hostTable appends time-filter hint', () => {
  const hostTable: HostTableInfo = { partitions: [{ name: 'ds' }], granularity: '日全量快照' }
  const ctx = buildMetricContext(DAU, { date: '20260819' }, hostTable)
  expect(ctx).toContain('dau')
  expect(ctx).toContain('COUNT(DISTINCT user_id)')
  expect(ctx).toContain('时间过滤：该指标基于日全量快照表')
})

test('M1 — buildMetricContext without hostTable has no hint (backward compat)', () => {
  const ctx = buildMetricContext(DAU, { date: '20260819' })
  expect(ctx).not.toContain('时间过滤')
})
