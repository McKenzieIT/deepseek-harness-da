/**
 * execute_metric tool — deterministic Level 2.5 metric execution.
 * Tests cover: 5 metric cases, metric-not-found, no-time-params rejection,
 * schema-not-mounted, query-not-mounted.
 *
 * Run: `pnpm vitest run packages/data/tool-execute-metric`
 */
import { test, expect } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import {
  apply,
  executeMetricCore,
  resolvePartitionCols,
  type ExecuteMetricResult,
} from '../src/index.ts'

/** Stub metric definitions (mirroring the eval METRIC_FIXTURE_DS payloads). */
const METRICS = [
  { name: 'dau', description: '日活', computation: { sql: 'COUNT(DISTINCT user_id)', metadata: { source: 'ods_login', aggregation: 'count_distinct', field: 'user_id', time_grain: '' } } },
  { name: 'pay_amt_sum', description: '付费总金额', computation: { sql: 'SUM(pay_amt)', metadata: { source: 'dws_pay_order_di', aggregation: 'sum', field: 'pay_amt', time_grain: '' } } },
  { name: 'pay_user_cnt', description: '付费人数', computation: { sql: 'COUNT(DISTINCT role_id)', metadata: { source: 'dws_pay_order_di', aggregation: 'count_distinct', field: 'role_id', time_grain: '' } } },
  { name: 'battle_count', description: '战斗次数', computation: { sql: 'COUNT(*)', metadata: { source: 'dws_battle_di', aggregation: 'count', field: '*', time_grain: '' } } },
  { name: 'template_metric', description: '模板指标', computation: { sql: "SELECT COUNT(DISTINCT user_id) FROM ods_login WHERE ds = '{{date}}'", metadata: { source: 'ods_login', aggregation: 'count_distinct', field: 'user_id', time_grain: '' } } },
]

function stubSchema(metrics = METRICS) {
  return {
    loadMetricDefinition(name: string) {
      return metrics.find(m => m.name === name) ?? null
    },
    loadTableDefinition(name: string) {
      if (name === 'ods_login') return { partitions: [{ name: 'ds' }] }
      if (name === 'dws_pay_order_di') return { partitions: [{ name: 'ds' }] }
      if (name === 'dws_battle_di') return { partitions: [{ name: 'ds' }] }
      return null
    },
  }
}

function stubQuery(result: { columns: string[]; rows: unknown[][]; rowCount: number }) {
  return {
    async execute(_req: { sql: string; scopeId: string }) {
      return { state: 'done', ...result }
    },
  }
}

const DEFAULT_QUERY_RESULT = { columns: ['_c0'], rows: [[42]], rowCount: 1 }

// ── 5 metric eval cases ─────────────────────────────────────────────────

test('M1 昨天DAU — bare-expr metric with date extraction', async () => {
  const r = await executeMetricCore(
    stubSchema(), stubQuery({ columns: ['cnt'], rows: [[7]], rowCount: 1 }), 'game-1',
    { metric_name: 'dau', question: '昨天DAU是多少', today: '20260820' },
  )
  expect(r.ok).toBe(true)
  expect(r.sql).toBe("SELECT COUNT(DISTINCT user_id) FROM ods_login WHERE ds = '20260819'")
  expect(r.result?.rows).toEqual([[7]])
  expect(r.metric?.name).toBe('dau')
  expect(r.metric?.source).toBe('ods_login')
})

test('M2 昨天充值总金额 — SUM bare-expr', async () => {
  const r = await executeMetricCore(
    stubSchema(), stubQuery({ columns: ['_c0'], rows: [[100000]], rowCount: 1 }), 'game-1',
    { metric_name: 'pay_amt_sum', question: '昨天充值总金额', today: '20260820' },
  )
  expect(r.ok).toBe(true)
  expect(r.sql).toBe("SELECT SUM(pay_amt) FROM dws_pay_order_di WHERE ds = '20260819'")
  expect(r.result?.rows).toEqual([[100000]])
})

test('M3 今天战斗次数 — today date extraction', async () => {
  const r = await executeMetricCore(
    stubSchema(), stubQuery({ columns: ['cnt'], rows: [[9]], rowCount: 1 }), 'game-1',
    { metric_name: 'battle_count', question: '今天战斗次数', today: '20260820' },
  )
  expect(r.ok).toBe(true)
  expect(r.sql).toBe("SELECT COUNT(*) FROM dws_battle_di WHERE ds = '20260820'")
  expect(r.result?.rows).toEqual([[9]])
})

test('M4 explicit date (YYYY-MM-DD) extraction', async () => {
  const r = await executeMetricCore(
    stubSchema(), stubQuery({ columns: ['cnt'], rows: [[11]], rowCount: 1 }), 'game-1',
    { metric_name: 'dau', question: '2026-08-15的DAU', today: '20260820' },
  )
  expect(r.ok).toBe(true)
  expect(r.sql).toBe("SELECT COUNT(DISTINCT user_id) FROM ods_login WHERE ds = '20260815'")
})

test('M5 template SQL metric with {{date}} placeholder', async () => {
  const r = await executeMetricCore(
    stubSchema(), stubQuery({ columns: ['cnt'], rows: [[50]], rowCount: 1 }), 'game-1',
    { metric_name: 'template_metric', question: '昨天DAU', today: '20260820' },
  )
  expect(r.ok).toBe(true)
  expect(r.sql).toBe("SELECT COUNT(DISTINCT user_id) FROM ods_login WHERE ds = '20260819'")
})

// ── edge cases ──────────────────────────────────────────────────────────

test('E1 metric not found — graceful error', async () => {
  const r = await executeMetricCore(
    stubSchema(), stubQuery(DEFAULT_QUERY_RESULT), 'game-1',
    { metric_name: 'nonexistent', question: '昨天DAU', today: '20260820' },
  )
  expect(r.ok).toBe(false)
  expect(r.error).toContain('not found')
})

test('E2 no time params — reject execution (prevent full-table scan)', async () => {
  const r = await executeMetricCore(
    stubSchema(), stubQuery(DEFAULT_QUERY_RESULT), 'game-1',
    { metric_name: 'dau', question: '总共有多少DAU', today: '20260820' },
  )
  expect(r.ok).toBe(false)
  expect(r.error).toContain('时间参数')
  expect(r.sql).toBeDefined()
  expect(r.metric?.name).toBe('dau')
})

test('E3 schema not mounted — graceful error', async () => {
  const r = await executeMetricCore(
    undefined, stubQuery(DEFAULT_QUERY_RESULT), 'game-1',
    { metric_name: 'dau', question: '昨天DAU', today: '20260820' },
  )
  expect(r.ok).toBe(false)
  expect(r.error).toContain('schema')
})

test('E4 query engine not mounted — graceful error', async () => {
  const r = await executeMetricCore(
    stubSchema(), undefined, 'game-1',
    { metric_name: 'dau', question: '昨天DAU', today: '20260820' },
  )
  expect(r.ok).toBe(false)
  expect(r.error).toContain('query')
})

test('E5 query execution fails — returns error', async () => {
  const failQuery = {
    async execute() {
      return { state: 'failed', error: 'TABLE_NOT_FOUND' }
    },
  }
  const r = await executeMetricCore(
    stubSchema(), failQuery, 'game-1',
    { metric_name: 'dau', question: '昨天DAU', today: '20260820' },
  )
  expect(r.ok).toBe(false)
  expect(r.error).toBe('TABLE_NOT_FOUND')
  expect(r.sql).toBeDefined()
})

// ── resolvePartitionCols ────────────────────────────────────────────────

test('P1 resolvePartitionCols from schema', () => {
  const cols = resolvePartitionCols(stubSchema(), 'ods_login')
  expect(cols).toEqual(['ds'])
})

test('P2 resolvePartitionCols falls back to [ds] when schema unavailable', () => {
  expect(resolvePartitionCols(undefined, 'ods_login')).toEqual(['ds'])
})

test('P3 resolvePartitionCols falls back to [ds] when table not found', () => {
  expect(resolvePartitionCols(stubSchema(), 'unknown_table')).toEqual(['ds'])
})

// ── apply() registration ────────────────────────────────────────────────

interface ToolDef {
  readonly name: string
  readonly description: string
  readonly execute: (
    args: { metric_name: string; question: string; today?: string },
    exec: { signal: AbortSignal },
  ) => Promise<ExecuteMetricResult>
}

test('R1 apply registers the execute_metric tool', () => {
  let def: ToolDef | undefined
  const ctx = {
    tools: { register: (d: ToolDef) => { def = d } },
    get: () => undefined,
  } as unknown as Context
  apply(ctx, {})
  expect(def).toBeDefined()
  expect(def!.name).toBe('execute_metric')
  expect(def!.description).toContain('Level 2.5')
})
