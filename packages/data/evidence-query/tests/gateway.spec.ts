import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import yaml from 'js-yaml'
import { EvidenceQueryService, EvalResultStore } from '../src/index.ts'
import { EvidenceQueryGateway } from '../src/gateway.ts'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'

const dirs: string[] = []

afterEach(() => {
  dirs.splice(0).forEach((d) =>{  rmSync(d, { recursive: true, force: true }) })
})

function seedLayer(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gw-test-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'config.yaml'), 'project:\n  name: test\n  scope_id: test\n')
  mkdirSync(join(dir, 'tables'), { recursive: true })
  mkdirSync(join(dir, 'events', 'pay'), { recursive: true })
  mkdirSync(join(dir, 'metrics'), { recursive: true })

  writeFileSync(join(dir, 'tables', 'dws_order_di.yaml'), yaml.dump({
    table_name: 'dws_order_di', kind: 'dws', description: '订单汇总表',
    table_comment: '', domains: ['付费经济'], granularity: '',
    engine: 'maxcompute',
    columns: [
      { name: 'order_id', type: 'string', comment: '订单ID', role: 'dimension' },
      { name: 'amount', type: 'decimal', comment: '金额', role: 'measure' },
    ],
    metrics: { total_amount: { expression: 'SUM(amount)', description: '总金额' } },
    partitions: [{ name: 'ds', type: 'string' }],
    confirmation: { status: 'confirmed', confirmed_by: 'admin', confirmed_at: '2026-08-01' },
    coverage: null, supersedes: [], disambiguation: null,
    primary_key: [], primary_key_unique: null, duplicate_sample: [],
    label_columns: [], freshness: '', dimension_refs: [],
  }))

  writeFileSync(join(dir, 'events', 'pay', 'game.pay.order.yaml'), yaml.dump({
    name: 'game.pay.order', description: '充值下单事件',
    domains: ['付费经济'],
    params_fields: { amount: { type: 'decimal', description: '金额' } },
    metrics: {},
    external_refs: [],
    disambiguation: [],
    confirmation: { status: 'draft', confirmed_by: '', confirmed_at: '' },
    coverage: null,
  }))

  writeFileSync(join(dir, 'metrics', 'dws_order_di__total_amount.yaml'), yaml.dump({
    kind: 'metric', name: 'dws_order_di__total_amount',
    description: '总金额', domains: ['付费经济'],
    computation: {
      sql: 'SUM(amount)',
      metadata: { aggregation: 'sum', field: 'amount', source: 'dws_order_di', time_grain: '' },
    },
    relations: [{ type: 'derived_from', target: 'dws_order_di', description: '' }],
  }))

  return dir
}

function makeGateway(evalStore?: EvalResultStore): EvidenceQueryGateway {
  const dir = seedLayer()
  const ctx = new Context()
  new SemanticLayerService(ctx, { semanticRoot: dir, scopeId: 'test' })
  new EvidenceQueryService(ctx, evalStore)
  return new EvidenceQueryGateway(ctx)
}

describe('EvidenceQueryGateway', () => {
  it('registers Remote methods matching the bridge contract', () => {
    const gw = makeGateway()
    const methods = remoteMethods(gw)
    const names = methods.map(m => m.exportName ?? m.method)
    expect(names).toContain('coverageQuery')
    expect(names).toContain('gapAnalysis')
    expect(names).toContain('reachabilityDelta')
    expect(names).toContain('evalResultQuery')
    expect(names).toContain('assetHealth')
    expect(names).toContain('beforeAfterDelta')
    expect(names).toContain('getEvalRunCount')
    expect(names).toContain('getRecentPassRates')
  })

  it('coverageQuery delegates to ctx.evidenceQuery', () => {
    const gw = makeGateway()
    const result = gw.coverageQuery()
    expect(result.table_count).toBe(1)
    expect(result.event_count).toBe(1)
    expect(result.metric_count).toBe(1)
  })

  it('gapAnalysis delegates to ctx.evidenceQuery', () => {
    const gw = makeGateway()
    const result = gw.gapAnalysis('dws_order_di')
    expect(result.sourceAssetId).toBe('dws_order_di')
  })

  it('evalResultQuery delegates to ctx.evidenceQuery', () => {
    const store = new EvalResultStore()
    store.add({ id: 'e1', assetId: 'dws_order_di', caseId: 'c1', status: 'pass', timestamp: '2026-08-24T00:00:00Z' })
    const gw = makeGateway(store)
    const result = gw.evalResultQuery({})
    expect(result.total).toBe(1)
  })

  it('beforeAfterDelta delegates to ctx.evidenceQuery', () => {
    const store = new EvalResultStore()
    store.add({ id: 'e1', assetId: 'a1', caseId: 'c1', status: 'fail', timestamp: '2026-08-24T00:00:00Z', metadata: { runId: 'run-a' } })
    store.add({ id: 'e2', assetId: 'a1', caseId: 'c1', status: 'pass', timestamp: '2026-08-24T01:00:00Z', metadata: { runId: 'run-b' } })
    const gw = makeGateway(store)
    const delta = gw.beforeAfterDelta('run-a', 'run-b')
    expect(delta.runIdA).toBe('run-a')
    expect(delta.runIdB).toBe('run-b')
    expect(delta.summary.improved).toBe(1)
  })

  it('assetHealth delegates to ctx.evidenceQuery', () => {
    const gw = makeGateway()
    const health = gw.assetHealth('dws_order_di')
    expect(health).not.toBeNull()
    expect(health!.assetId).toBe('dws_order_di')
    expect(health!.confirmationStatus).toBe('confirmed')
  })

  it('getEvalRunCount returns correct count', () => {
    const store = new EvalResultStore()
    store.add({ id: 'e1', assetId: 'a1', caseId: 'c1', status: 'pass', timestamp: '2026-08-24T00:00:00Z', metadata: { runId: 'run-1' } })
    store.add({ id: 'e2', assetId: 'a2', caseId: 'c2', status: 'fail', timestamp: '2026-08-24T00:00:00Z', metadata: { runId: 'run-1' } })
    store.add({ id: 'e3', assetId: 'a1', caseId: 'c1', status: 'pass', timestamp: '2026-08-24T01:00:00Z', metadata: { runId: 'run-2' } })
    const gw = makeGateway(store)
    expect(gw.getEvalRunCount()).toBe(2)
  })

  it('getRecentPassRates computes pass rates per run', () => {
    const store = new EvalResultStore()
    store.add({ id: 'e1', assetId: 'a1', caseId: 'c1', status: 'pass', timestamp: '2026-08-24T00:00:00Z', metadata: { runId: 'run-1' } })
    store.add({ id: 'e2', assetId: 'a2', caseId: 'c2', status: 'fail', timestamp: '2026-08-24T00:00:00Z', metadata: { runId: 'run-1' } })
    store.add({ id: 'e3', assetId: 'a1', caseId: 'c1', status: 'pass', timestamp: '2026-08-24T01:00:00Z', metadata: { runId: 'run-2' } })
    store.add({ id: 'e4', assetId: 'a2', caseId: 'c2', status: 'pass', timestamp: '2026-08-24T01:00:00Z', metadata: { runId: 'run-2' } })
    const gw = makeGateway(store)
    const rates = gw.getRecentPassRates(2)
    expect(rates).toHaveLength(2)
    expect(rates[0]).toBe(0.5) // run-1: 1/2
    expect(rates[1]).toBe(1.0) // run-2: 2/2
  })

  it('getRecentPassRates defaults to last 5 runs', () => {
    const store = new EvalResultStore()
    for (let i = 1; i <= 7; i++) {
      store.add({ id: `e${i}`, assetId: 'a1', caseId: 'c1', status: 'pass', timestamp: `2026-08-2${i}T00:00:00Z`, metadata: { runId: `run-${i}` } })
    }
    const gw = makeGateway(store)
    const rates = gw.getRecentPassRates()
    expect(rates).toHaveLength(5) // last 5 of 7
  })

  it('typertRemote binding uses evidenceQuery namespace', () => {
    const gw = makeGateway()
    expect(gw.typertRemote.namespace).toBe('evidenceQuery')
    expect(gw.typertRemote.serviceKey).toBe('evidenceQueryGateway')
  })
})
