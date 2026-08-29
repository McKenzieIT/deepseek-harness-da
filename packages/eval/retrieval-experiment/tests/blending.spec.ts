import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { dump as dumpYaml } from 'js-yaml'
import { buildGraphSnapshot } from '../src/graph-snapshot.ts'
import {
  extractQueryTerms,
  computeQueryCoverage,
  strategyB,
  hardSwitch,
  continuousBlend,
  runRetrieval,
} from '../src/blending.ts'
import type { GraphSnapshot } from '../src/types.ts'

let root: string
let snapL0: GraphSnapshot
let snapL1: GraphSnapshot

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'blending-exp-'))
  mkdirSync(join(root, 'tables'), { recursive: true })
  mkdirSync(join(root, 'events', 'core'), { recursive: true })
  mkdirSync(join(root, 'concepts'), { recursive: true })

  writeFileSync(join(root, 'tables', 'dws_pay.yaml'), dumpYaml({
    table_name: 'dws_pay',
    kind: 'dws',
    description: '付费订单日表',
    alt_labels: ['付费', '充值', '氪金'],
    pref_label: '付费表',
    domains: ['付费经济'],
    columns: [{ name: 'order_id', type: 'string', comment: '订单号' }],
  }))

  writeFileSync(join(root, 'tables', 'dws_active.yaml'), dumpYaml({
    table_name: 'dws_active',
    kind: 'dws',
    description: '活跃用户汇总',
    alt_labels: ['日活', 'DAU'],
    domains: ['用户生命周期'],
    columns: [{ name: 'role_id', type: 'string', comment: '角色' }],
  }))

  writeFileSync(join(root, 'events', 'core', 'login.yaml'), dumpYaml({
    name: 'login',
    description: '用户登录事件',
    alt_labels: ['登录', '上线'],
    domains: ['用户生命周期'],
    params_fields: { role_id: { type: 'string', description: '角色ID' } },
  }))

  writeFileSync(join(root, 'concepts', '付费经济.yaml'), dumpYaml({
    name: '付费经济',
    description: '充值消费',
    pref_label: '付费经济',
    alt_labels: ['充值消费'],
  }))

  writeFileSync(join(root, 'concepts', '用户生命周期.yaml'), dumpYaml({
    name: '用户生命周期',
    description: '用户全生命周期',
    pref_label: '用户生命周期',
    alt_labels: [],
  }))

  snapL0 = buildGraphSnapshot(root, { stripAliases: true, stripConcepts: true }, 'L0')
  snapL1 = buildGraphSnapshot(root, {}, 'L1')
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('extractQueryTerms', () => {
  it('splits CJK text into tokens and bigrams', () => {
    const terms = extractQueryTerms('日活跃用户')
    expect(terms).toContain('日活跃用户')
    expect(terms).toContain('日活')
    expect(terms).toContain('活跃')
    expect(terms).toContain('用户')
  })

  it('handles mixed text', () => {
    const terms = extractQueryTerms('DAU 日活')
    expect(terms).toContain('DAU')
    expect(terms).toContain('日活')
  })
})

describe('computeQueryCoverage', () => {
  it('returns >0 when aliases match query terms', () => {
    const cov = computeQueryCoverage(snapL1.graph, '日活用户')
    expect(cov).toBeGreaterThan(0)
  })

  it('returns 0 on L0 graph (no aliases)', () => {
    const cov = computeQueryCoverage(snapL0.graph, '日活用户')
    expect(cov).toBe(0)
  })

  it('returns 0 for unrelated query', () => {
    const cov = computeQueryCoverage(snapL1.graph, 'completely unrelated query xyz')
    expect(cov).toBe(0)
  })
})

describe('strategyB', () => {
  it('returns candidates with alias-boosted scores when aliases present', () => {
    const candidates = strategyB(snapL1, '付费充值订单', 10, { mode: 'strategy-b' })
    expect(candidates.length).toBeGreaterThan(0)
    const payHit = candidates.find(c => c.id === 'dws_pay')
    expect(payHit).toBeDefined()
  })

  it('falls back to pure BM25 on L0 graph', () => {
    const candidates = strategyB(snapL0, '付费订单', 10, { mode: 'strategy-b' })
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.every(c => c.mode !== 'alias-boosted')).toBe(true)
  })
})

describe('hardSwitch', () => {
  it('returns subgraph candidates when coverage >= threshold', () => {
    const candidates = hardSwitch(snapL1, '付费充值', 10, { mode: 'hard-switch', threshold: 0.1 })
    expect(candidates.length).toBeGreaterThan(0)
    const modes = new Set(candidates.map(c => c.mode))
    expect(modes.has('subgraph-direct') || modes.has('subgraph-neighbor')).toBe(true)
  })

  it('returns BM25 candidates when coverage < threshold', () => {
    const candidates = hardSwitch(snapL1, 'completely unrelated query', 10, { mode: 'hard-switch', threshold: 0.5 })
    const modes = new Set(candidates.map(c => c.mode))
    expect(modes.has('subgraph-direct')).toBe(false)
  })
})

describe('continuousBlend', () => {
  it('returns candidates that blend BM25 and graph scores', () => {
    const candidates = continuousBlend(snapL1, '付费订单', 10, { mode: 'continuous-blend' })
    expect(candidates.length).toBeGreaterThan(0)
  })

  it('at zero coverage (L0), returns BM25-dominated results', () => {
    const candidates = continuousBlend(snapL0, '付费订单', 10, { mode: 'continuous-blend' })
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.every(c => c.mode === 'bm25-only' || c.mode === 'graph-expand')).toBe(true)
  })
})

describe('runRetrieval', () => {
  it('dispatches to the correct blending variant', () => {
    const b = runRetrieval(snapL1, '付费', 5, { mode: 'strategy-b' })
    const h = runRetrieval(snapL1, '付费', 5, { mode: 'hard-switch', threshold: 0.1 })
    const c = runRetrieval(snapL1, '付费', 5, { mode: 'continuous-blend' })
    expect(b.length).toBeGreaterThan(0)
    expect(h.length).toBeGreaterThan(0)
    expect(c.length).toBeGreaterThan(0)
  })
})
