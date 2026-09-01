import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import yaml from 'js-yaml'
import { EvidenceQueryService, EvalResultStore } from '../src/index.ts'
import type { EvalResultRecord, ProposedRelation } from '../src/types.ts'

const dirs: string[] = []

afterEach(() => {
  dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true }))
})

/**
 * Seeds a semantic layer with:
 *  - dws_order_di (DWS, 付费经济) — has dimension_ref to dim_server
 *  - dim_server (DIM, 基础数据) — standalone
 *  - dim_item (DIM, 基础数据) — standalone, NOT joined to anything
 *  - game.pay.order (event, 付费经济) — has external_ref to dim_server
 *  - dws_order_di__total_amount (metric, 付费经济) — derived_from dws_order_di
 */
function seedLayer(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eq-test-'))
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
      { name: 'server_id', type: 'string', comment: '区服ID', role: 'dimension' },
    ],
    metrics: { total_amount: { expression: 'SUM(amount)', description: '总金额' } },
    partitions: [{ name: 'ds', type: 'string' }],
    confirmation: { status: 'confirmed', confirmed_by: 'admin', confirmed_at: '2026-08-01' },
    coverage: null, supersedes: [], disambiguation: null,
    primary_key: [], primary_key_unique: null, duplicate_sample: [],
    label_columns: [], freshness: '', dimension_refs: [
      { dim_table: 'dim_server', join_keys: [{ dws_column: 'server_id', dim_column: 'server_id' }], derivation: '' },
    ],
  }))

  writeFileSync(join(dir, 'tables', 'dim_server.yaml'), yaml.dump({
    table_name: 'dim_server', kind: 'dim', description: '区服维表',
    table_comment: '', domains: ['基础数据'], granularity: '',
    engine: 'maxcompute',
    columns: [
      { name: 'server_id', type: 'string', comment: '', role: 'dimension' },
      { name: 'server_name', type: 'string', comment: '', role: 'dimension' },
    ],
    metrics: {}, partitions: [],
    confirmation: { status: 'draft', confirmed_by: '', confirmed_at: '' },
    coverage: null, supersedes: [], disambiguation: null,
    primary_key: ['server_id'], primary_key_unique: null, duplicate_sample: [],
    label_columns: ['server_name'], freshness: 'static_reference', dimension_refs: [],
  }))

  writeFileSync(join(dir, 'tables', 'dim_item.yaml'), yaml.dump({
    table_name: 'dim_item', kind: 'dim', description: '道具维表',
    table_comment: '', domains: ['基础数据'], granularity: '',
    engine: 'maxcompute',
    columns: [
      { name: 'item_id', type: 'string', comment: '', role: 'dimension' },
      { name: 'item_name', type: 'string', comment: '', role: 'dimension' },
    ],
    metrics: {}, partitions: [],
    confirmation: { status: 'rejected', confirmed_by: 'reviewer', confirmed_at: '2026-08-02' },
    coverage: null, supersedes: [], disambiguation: null,
    primary_key: ['item_id'], primary_key_unique: null, duplicate_sample: [],
    label_columns: ['item_name'], freshness: 'static_reference', dimension_refs: [],
  }))

  writeFileSync(join(dir, 'events', 'pay', 'game.pay.order.yaml'), yaml.dump({
    name: 'game.pay.order', description: '充值下单事件',
    domains: ['付费经济'],
    params_fields: {
      server_id: { type: 'string', description: '区服ID' },
      amount: { type: 'decimal', description: '金额' },
    },
    metrics: {},
    external_refs: [
      { dim_table: 'dim_server', join_keys: [{ dws_column: 'server_id', dim_column: 'server_id' }], derivation: '' },
    ],
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

function makeService(evalStore?: EvalResultStore): EvidenceQueryService {
  const dir = seedLayer()
  const ctx = new Context()
  new SemanticLayerService(ctx, { semanticRoot: dir, scopeId: 'test' })
  return new EvidenceQueryService(ctx, evalStore)
}

// ── coverageQuery ───────────────────────────────────────────────────────

describe('EvidenceQueryService.coverageQuery', () => {
  it('returns enriched coverage stats with confirmation breakdown', () => {
    const svc = makeService()
    const stats = svc.coverageQuery()

    expect(stats.table_count).toBe(3)
    expect(stats.event_count).toBe(1)
    expect(stats.metric_count).toBe(1)
    expect(stats.domain_counts['付费经济']).toBe(3)
    expect(stats.domain_counts['基础数据']).toBe(2)
    // Confirmation breakdown: 1 confirmed (dws_order_di), 1 rejected (dim_item),
    // 2 draft (dim_server + game.pay.order)
    expect(stats.confirmation.confirmed).toBe(1)
    expect(stats.confirmation.rejected).toBe(1)
    expect(stats.confirmation.draft).toBe(2)
  })
})

// ── gapAnalysis ─────────────────────────────────────────────────────────

describe('EvidenceQueryService.gapAnalysis', () => {
  it('finds assets reachable via joins but without eval coverage', () => {
    const store = new EvalResultStore()
    // Only dws_order_di has eval coverage
    store.add({
      id: 'eval-1',
      assetId: 'dws_order_di',
      caseId: 'case-1',
      status: 'pass',
      score: 1.0,
      timestamp: '2026-08-24T00:00:00Z',
    })
    const svc = makeService(store)
    const result = svc.gapAnalysis('dws_order_di')

    expect(result.sourceAssetId).toBe('dws_order_di')
    // dim_server is reachable via join from dws_order_di but has no eval coverage
    expect(result.gaps.length).toBeGreaterThan(0)
    const dimServerGap = result.gaps.find(g => g.assetId === 'dim_server')
    expect(dimServerGap).toBeDefined()
    expect(dimServerGap!.joinPath).toEqual(['dws_order_di', 'dim_server'])
  })

  it('returns empty gaps when all reachable assets are covered', () => {
    const store = new EvalResultStore()
    store.add({ id: 'eval-1', assetId: 'dws_order_di', caseId: 'case-1', status: 'pass', timestamp: '2026-08-24T00:00:00Z' })
    store.add({ id: 'eval-2', assetId: 'dim_server', caseId: 'case-2', status: 'pass', timestamp: '2026-08-24T00:00:00Z' })
    // game.pay.order is also reachable via dim_server (bidirectional join edges)
    store.add({ id: 'eval-3', assetId: 'game.pay.order', caseId: 'case-3', status: 'pass', timestamp: '2026-08-24T00:00:00Z' })
    const svc = makeService(store)
    const result = svc.gapAnalysis('dws_order_di')

    // All reachable from dws_order_di (dim_server + game.pay.order) are covered
    expect(result.gaps.length).toBe(0)
  })

  it('returns empty gaps for an isolated asset with no join edges', () => {
    const svc = makeService()
    const result = svc.gapAnalysis('dim_item')
    // dim_item has no join edges in this dataset
    expect(result.gaps.length).toBe(0)
  })
})

// ── reachabilityDelta ───────────────────────────────────────────────────

describe('EvidenceQueryService.reachabilityDelta', () => {
  it('detects newly reachable pairs when a join relation is added', () => {
    const svc = makeService()
    const proposed: ProposedRelation = {
      sourceId: 'dws_order_di',
      targetId: 'dim_item',
      type: 'joins',
      on: 'item_id = item_id',
    }
    const result = svc.reachabilityDelta(proposed)

    expect(result.proposedRelation).toEqual(proposed)
    // After adding dws_order_di -> dim_item join, dim_item becomes reachable
    // from dws_order_di (and transitively from others connected to dws_order_di)
    expect(result.newlyReachable.length).toBeGreaterThan(0)
    const directPair = result.newlyReachable.find(p => p.from === 'dws_order_di' && p.to === 'dim_item')
    expect(directPair).toBeDefined()
  })

  it('returns empty when adding a non-join relation type', () => {
    const svc = makeService()
    const proposed: ProposedRelation = {
      sourceId: 'dws_order_di',
      targetId: 'dim_item',
      type: 'related_to',
    }
    const result = svc.reachabilityDelta(proposed)

    // BFS only traverses 'joins' edges, so related_to does not create new reachability
    expect(result.newlyReachable.length).toBe(0)
  })

  it('returns empty when the proposed join already exists', () => {
    const svc = makeService()
    // dws_order_di already joins to dim_server
    const proposed: ProposedRelation = {
      sourceId: 'dws_order_di',
      targetId: 'dim_server',
      type: 'joins',
      on: 'server_id = server_id',
    }
    const result = svc.reachabilityDelta(proposed)
    expect(result.newlyReachable.length).toBe(0)
  })
})

// ── evalResultQuery ─────────────────────────────────────────────────────

describe('EvidenceQueryService.evalResultQuery', () => {
  it('queries all results when no filters are given', () => {
    const store = new EvalResultStore()
    store.add({ id: 'e1', assetId: 'dws_order_di', caseId: 'c1', status: 'pass', timestamp: '2026-08-24T00:00:00Z' })
    store.add({ id: 'e2', assetId: 'dim_server', caseId: 'c2', status: 'fail', timestamp: '2026-08-24T00:00:00Z' })
    const svc = makeService(store)
    const result = svc.evalResultQuery({})

    expect(result.total).toBe(2)
    expect(result.results).toHaveLength(2)
  })

  it('filters by assetId', () => {
    const store = new EvalResultStore()
    store.add({ id: 'e1', assetId: 'dws_order_di', caseId: 'c1', status: 'pass', timestamp: '2026-08-24T00:00:00Z' })
    store.add({ id: 'e2', assetId: 'dim_server', caseId: 'c2', status: 'fail', timestamp: '2026-08-24T00:00:00Z' })
    const svc = makeService(store)
    const result = svc.evalResultQuery({ assetId: 'dws_order_di' })

    expect(result.total).toBe(1)
    expect(result.results[0]!.assetId).toBe('dws_order_di')
  })

  it('filters by status', () => {
    const store = new EvalResultStore()
    store.add({ id: 'e1', assetId: 'dws_order_di', caseId: 'c1', status: 'pass', timestamp: '2026-08-24T00:00:00Z' })
    store.add({ id: 'e2', assetId: 'dim_server', caseId: 'c2', status: 'fail', timestamp: '2026-08-24T00:00:00Z' })
    const svc = makeService(store)
    const result = svc.evalResultQuery({ status: 'fail' })

    expect(result.total).toBe(1)
    expect(result.results[0]!.status).toBe('fail')
  })

  it('respects limit', () => {
    const store = new EvalResultStore()
    store.add({ id: 'e1', assetId: 'a1', caseId: 'c1', status: 'pass', timestamp: '2026-08-24T00:00:00Z' })
    store.add({ id: 'e2', assetId: 'a2', caseId: 'c2', status: 'pass', timestamp: '2026-08-24T00:00:00Z' })
    store.add({ id: 'e3', assetId: 'a3', caseId: 'c3', status: 'pass', timestamp: '2026-08-24T00:00:00Z' })
    const svc = makeService(store)
    const result = svc.evalResultQuery({ limit: 2 })

    expect(result.total).toBe(3)
    expect(result.results).toHaveLength(2)
  })

  it('filters by domain via metadata', () => {
    const store = new EvalResultStore()
    store.add({ id: 'e1', assetId: 'a1', caseId: 'c1', status: 'pass', timestamp: '2026-08-24T00:00:00Z', metadata: { domain: '付费经济' } })
    store.add({ id: 'e2', assetId: 'a2', caseId: 'c2', status: 'pass', timestamp: '2026-08-24T00:00:00Z', metadata: { domain: '基础数据' } })
    const svc = makeService(store)
    const result = svc.evalResultQuery({ domain: '付费经济' })

    expect(result.total).toBe(1)
    expect(result.results[0]!.id).toBe('e1')
  })
})

// ── assetHealth ─────────────────────────────────────────────────────────

describe('EvidenceQueryService.assetHealth', () => {
  it('returns health report for a table asset', () => {
    const store = new EvalResultStore()
    store.add({ id: 'e1', assetId: 'dws_order_di', caseId: 'c1', status: 'pass', timestamp: '2026-08-24T00:00:00Z' })
    const svc = makeService(store)
    const health = svc.assetHealth('dws_order_di')

    expect(health).not.toBeNull()
    expect(health!.assetId).toBe('dws_order_di')
    expect(health!.confirmationStatus).toBe('confirmed')
    expect(health!.hasEvalCoverage).toBe(true)
    // dws_order_di joins dim_server (bidirectional) + derived_from metric (bidirectional)
    expect(health!.relationCount).toBeGreaterThan(0)
    expect(health!.lastModified).toBe('')
  })

  it('returns health report for an event asset', () => {
    const svc = makeService()
    const health = svc.assetHealth('game.pay.order')

    expect(health).not.toBeNull()
    expect(health!.assetId).toBe('game.pay.order')
    expect(health!.confirmationStatus).toBe('draft')
    expect(health!.hasEvalCoverage).toBe(false)
    // game.pay.order has external_ref to dim_server
    expect(health!.relationCount).toBeGreaterThan(0)
  })

  it('returns health report for a metric asset', () => {
    const svc = makeService()
    const health = svc.assetHealth('dws_order_di__total_amount')

    expect(health).not.toBeNull()
    expect(health!.assetId).toBe('dws_order_di__total_amount')
    expect(health!.confirmationStatus).toBe('n/a')
    expect(health!.hasEvalCoverage).toBe(false)
    // metric has derived_from relation to dws_order_di
    expect(health!.relationCount).toBeGreaterThan(0)
  })

  it('returns null for a nonexistent asset', () => {
    const svc = makeService()
    const health = svc.assetHealth('nonexistent_asset')
    expect(health).toBeNull()
  })
})

// ── EvalResultStore ─────────────────────────────────────────────────────

describe('EvalResultStore', () => {
  it('adds and queries records', () => {
    const store = new EvalResultStore()
    const record: EvalResultRecord = {
      id: 'r1', assetId: 'asset1', caseId: 'case1',
      status: 'pass', score: 0.95, timestamp: '2026-08-24T00:00:00Z',
    }
    store.add(record)
    const result = store.query({})
    expect(result.total).toBe(1)
    expect(result.results[0]).toEqual(record)
  })

  it('hasResultsFor returns true only for stored assets', () => {
    const store = new EvalResultStore()
    store.add({ id: 'r1', assetId: 'asset1', caseId: 'c1', status: 'pass', timestamp: '2026-08-24T00:00:00Z' })
    expect(store.hasResultsFor('asset1')).toBe(true)
    expect(store.hasResultsFor('asset2')).toBe(false)
  })

  it('clear removes all records', () => {
    const store = new EvalResultStore()
    store.add({ id: 'r1', assetId: 'a1', caseId: 'c1', status: 'pass', timestamp: '2026-08-24T00:00:00Z' })
    store.clear()
    expect(store.query({}).total).toBe(0)
    expect(store.hasResultsFor('a1')).toBe(false)
  })
})
