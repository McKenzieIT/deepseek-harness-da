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
