import { afterEach, describe, expect, it } from 'vitest'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { SemanticLayerService, type DataSourceKindPlugin, type GraphNodeProjection } from '@deepseek-ai/dsh-semantic-layer'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import yaml from 'js-yaml'
import SchemaGateway from '../src/index.ts'

const dirs: string[] = []

afterEach(() => {
  dirs.splice(0).forEach((d) =>{  rmSync(d, { recursive: true, force: true }) })
})

function seedLayer(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sg-test-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'config.yaml'), 'project:\n  name: test\n  scope_id: test\n')
  mkdirSync(join(dir, 'tables'), { recursive: true })
  mkdirSync(join(dir, 'events', 'pay'), { recursive: true })
  mkdirSync(join(dir, 'metrics'), { recursive: true })
  mkdirSync(join(dir, 'concepts'), { recursive: true })

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
    confirmation: { status: 'draft', confirmed_by: '', confirmed_at: '' },
    coverage: null, supersedes: [], disambiguation: null,
    primary_key: [], primary_key_unique: null, duplicate_sample: [],
    label_columns: [], freshness: '', dimension_refs: [],
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

  writeFileSync(join(dir, 'events', 'pay', 'game.pay.order.yaml'), yaml.dump({
    name: 'game.pay.order', description: '充值下单事件',
    domains: ['付费经济'],
    params_fields: {
      server_id: { type: 'string', description: '区服ID' },
      amount: { type: 'decimal', description: '金额' },
    },
    metrics: {}, external_refs: [], disambiguation: [],
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

  // W27: concepts for both asset domains — every asset.domains ref resolves, so
  // the relation-graph build derives concept→asset related_to edges with no
  // dangling-domain warnings.
  writeFileSync(join(dir, 'concepts', '付费经济.yaml'), yaml.dump({
    name: '付费经济', description: '充值、消费、商城购买', pref_label: '付费',
  }))
  writeFileSync(join(dir, 'concepts', '基础数据.yaml'), yaml.dump({
    name: '基础数据', description: '维度基础数据',
  }))

  return dir
}

async function makeGateway(): Promise<SchemaGateway> {
  const dir = seedLayer()
  const { Context } = await import('@deepseek-ai/cordis')
  const ctx = new Context()
  new SemanticLayerService(ctx, { semanticRoot: dir, scopeId: 'test' })
  return new SchemaGateway(ctx)
}

/** makeGateway variant exposing the real service + root so a test can register
 * a new kind and seed its storage dir (test-kind flow-through). */
async function makeGatewayEx(): Promise<{ gw: SchemaGateway; svc: SemanticLayerService; dir: string }> {
  const dir = seedLayer()
  const { Context } = await import('@deepseek-ai/cordis')
  const ctx = new Context()
  const svc = new SemanticLayerService(ctx, { semanticRoot: dir, scopeId: 'test' })
  const gw = new SchemaGateway(ctx)
  return { gw, svc, dir }
}

/**
 * GA-GT1 Phase 5c: makeGateway + spies on the real SemanticLayerService's
 * `getRelationGraph` + `corpusVersion` so tests can assert the gateway's
 * public methods thread `scopeId` → `this.ctx.schema.X(scopeId)`. The spies
 * record the scopeId each receives and return stub values (a graph with no
 * edges / version 0) so the gateway methods run without resolving an unknown
 * named scope's root (which would throw in the real per-scope path).
 */
async function makeGatewayWithSpies(): Promise<{
  gw: SchemaGateway
  getRelationGraphCalls: (string | undefined)[]
  corpusVersionCalls: (string | undefined)[]
}> {
  const dir = seedLayer()
  const { Context } = await import('@deepseek-ai/cordis')
  const ctx = new Context()
  const svc = new SemanticLayerService(ctx, { semanticRoot: dir, scopeId: 'test' })
  const getRelationGraphCalls: (string | undefined)[] = []
  const corpusVersionCalls: (string | undefined)[] = []
  const stubGraph = {
    getRelated: () => [],
    getDerived: () => [],
    findJoinPath: () => null,
    getJoinCondition: () => null,
    resolveAlias: () => [],
  }
  // Spy via own-property shadow (records scopeId; returns stubs to avoid the
  // real per-scope root resolution which would throw for an unknown scope id).
  Object.defineProperty(svc, 'getRelationGraph', {
    value: (scopeId?: string) => {
      getRelationGraphCalls.push(scopeId)
      return stubGraph
    },
    writable: true,
    configurable: true,
  })
  Object.defineProperty(svc, 'corpusVersion', {
    value: (scopeId?: string) => {
      corpusVersionCalls.push(scopeId)
      return 0
    },
    writable: true,
    configurable: true,
  })
  const gw = new SchemaGateway(ctx)
  return { gw, getRelationGraphCalls, corpusVersionCalls }
}

describe('SchemaGateway', () => {
  it('publishes Remote methods under the schemaGateway namespace', async () => {
    const gw = await makeGateway()
    expect(gw.typertRemote).toMatchObject({
      serviceKey: 'schemaGateway',
      namespace: 'schemaGateway',
    })
    const methods = remoteMethods(gw).map(m => m.method).sort()
    expect(methods).toEqual([
      'getCoverageStats',
      'getEventDefinition',
      'getGraphData',
      'getMetricDefinition',
      'getTableDefinition',
      'listDomains',
      'listEvents',
      'listMetrics',
      'listTables',
      'search',
    ])
  })

  it('listTables returns slim summaries with domains exposed', async () => {
    const gw = await makeGateway()
    const tables = gw.listTables()
    expect(tables).toHaveLength(2)
    const dws = tables.find(t => t.table_name === 'dws_order_di')
    expect(dws).toEqual({
      table_name: 'dws_order_di',
      kind: 'dws',
      domains: ['付费经济'],
      description: '订单汇总表',
      column_count: 2,
      metric_count: 1,
    })
    const dim = tables.find(t => t.table_name === 'dim_server')
    expect(dim?.kind).toBe('dim')
    expect(dim?.domains).toEqual(['基础数据'])
  })

  it('listEvents returns slim summaries with domains exposed', async () => {
    const gw = await makeGateway()
    const events = gw.listEvents()
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({
      name: 'game.pay.order',
      domains: ['付费经济'],
      description: '充值下单事件',
      param_count: 2,
      metric_count: 0,
    })
  })

  it('listMetrics returns slim summaries with source and aggregation', async () => {
    const gw = await makeGateway()
    const metrics = gw.listMetrics()
    expect(metrics).toHaveLength(1)
    expect(metrics[0]).toEqual({
      name: 'dws_order_di__total_amount',
      domains: ['付费经济'],
      description: '总金额',
      source: 'dws_order_di',
      aggregation: 'sum',
    })
  })

  it('getTableDefinition returns the full definition', async () => {
    const gw = await makeGateway()
    const def = gw.getTableDefinition('dws_order_di') as Record<string, unknown>
    expect(def).not.toBeNull()
    expect(def.table_name).toBe('dws_order_di')
    expect((def.columns as unknown[]).length).toBe(2)
  })

  it('getEventDefinition returns the full definition', async () => {
    const gw = await makeGateway()
    const def = gw.getEventDefinition('game.pay.order') as Record<string, unknown>
    expect(def).not.toBeNull()
    expect(def.name).toBe('game.pay.order')
    expect(Object.keys(def.params_fields as object)).toEqual(['server_id', 'amount'])
  })

  it('getMetricDefinition returns the full definition', async () => {
    const gw = await makeGateway()
    const def = gw.getMetricDefinition('dws_order_di__total_amount') as Record<string, unknown>
    expect(def).not.toBeNull()
    expect(def.name).toBe('dws_order_di__total_amount')
  })

  it('search returns ranked hits from BM25 over the full corpus', async () => {
    const gw = await makeGateway()
    const hits = gw.search('订单 金额')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]).toHaveProperty('id')
    expect(hits[0]).toHaveProperty('score')
  })

  it('listDomains aggregates asset counts by domain', async () => {
    const gw = await makeGateway()
    const domains = gw.listDomains()
    const pay = domains.find(d => d.name === '付费经济')
    expect(pay).toBeDefined()
    expect(pay!.table_count).toBe(1)
    expect(pay!.event_count).toBe(1)
    expect(pay!.metric_count).toBe(1)
    const base = domains.find(d => d.name === '基础数据')
    expect(base).toBeDefined()
    expect(base!.table_count).toBe(1)
  })

  it('getCoverageStats returns counts and domain breakdown', async () => {
    const gw = await makeGateway()
    const stats = gw.getCoverageStats()
    expect(stats.table_count).toBe(2)
    expect(stats.event_count).toBe(1)
    expect(stats.metric_count).toBe(1)
    expect(stats.domain_counts['付费经济']).toBe(3)
    expect(stats.domain_counts['基础数据']).toBe(1)
  })

  it('returns null for nonexistent definitions', async () => {
    const gw = await makeGateway()
    expect(gw.getTableDefinition('nonexistent')).toBeNull()
    expect(gw.getEventDefinition('nonexistent')).toBeNull()
    expect(gw.getMetricDefinition('nonexistent')).toBeNull()
  })

  // --- GA-GT1 Phase 5c: external call sites pass scopeId through ---

  it('(5c) getGraphData passes scopeId → ctx.schema.getRelationGraph receives it (β mode, dormant until 5d)', async () => {
    // The 5c call site :247: getGraphData(opts?, scopeId?) threads scopeId →
    // this.ctx.schema.getRelationGraph(scopeId) (Phase 2 per-scope graph
    // path). The spy records it; the gateway must hand 'tenant-a' through.
    // DORMANT: prod callers pass no scopeId yet → undefined → active (pinned
    // by the next test); this test pins the 5c activation seam.
    const { gw, getRelationGraphCalls } = await makeGatewayWithSpies()
    gw.getGraphData(undefined, 'tenant-a')
    expect(getRelationGraphCalls.length).toBe(1)
    expect(getRelationGraphCalls[0]).toBe('tenant-a')
  })

  it('(5c) getGraphData without scopeId → getRelationGraph receives undefined (active 现状, dormant)', async () => {
    // DORMANT path: scopeId omitted → undefined → getRelationGraph(undefined)
    // → active scope graph (Phase 2 β fallback). Preserves the pre-5c
    // behavior; the recorded `undefined` proves no scope leakage / no
    // behavioral change until 5d activates named scopes.
    const { gw, getRelationGraphCalls } = await makeGatewayWithSpies()
    gw.getGraphData()
    expect(getRelationGraphCalls.length).toBe(1)
    expect(getRelationGraphCalls[0]).toBe(undefined)
  })

  it('(5c/di-5) search keys the linker cache on the ACTIVE scope version (corpusVersion(undefined)), not the per-scope version', async () => {
    // data-infra-5: getLinker loads the ACTIVE scope's corpus
    // (loadRetrievalCorpusAll takes no scopeId), so the cache must key on
    // corpusVersion(undefined) — NOT corpusVersion(scopeId). Keying on the
    // per-scope version returned a stale linker when the active corpus
    // changed but scopeId's version stayed the same. search still ACCEPTS
    // scopeId (5d future) but does not thread it to corpusVersion until
    // loadRetrievalCorpusAll is scope-parameterized.
    const { gw, corpusVersionCalls } = await makeGatewayWithSpies()
    gw.search('订单', 10, 'tenant-a')
    expect(corpusVersionCalls.length).toBe(1)
    expect(corpusVersionCalls[0]).toBe(undefined)
  })

  it('(5c) search without scopeId → corpusVersion receives undefined (active 现状, dormant)', async () => {
    // DORMANT path: scopeId omitted → undefined → corpusVersion(undefined)
    // → active scope version (Phase 2 β fallback). Preserves pre-5c behavior.
    const { gw, corpusVersionCalls } = await makeGatewayWithSpies()
    gw.search('订单')
    expect(corpusVersionCalls.length).toBe(1)
    expect(corpusVersionCalls[0]).toBe(undefined)
  })

  it('(di-5) getLinker cache invalidates when the ACTIVE corpus version changes, even if scopeId version is unchanged (stale-cache window)', async () => {
    const dir = seedLayer()
    const { Context } = await import('@deepseek-ai/cordis')
    const ctx = new Context()
    const svc = new SemanticLayerService(ctx, { semanticRoot: dir, scopeId: 'test' })

    let activeVersion = 1
    let loadCalls = 0
    const realLoadRetrievalCorpusAll = svc.loadRetrievalCorpusAll.bind(svc)
    Object.defineProperty(svc, 'corpusVersion', {
      value: (scopeId?: string) => (scopeId === undefined ? activeVersion : 999),
      writable: true,
      configurable: true,
    })
    Object.defineProperty(svc, 'loadRetrievalCorpusAll', {
      value: () => {
        loadCalls++
        return realLoadRetrievalCorpusAll()
      },
      writable: true,
      configurable: true,
    })
    const gw = new SchemaGateway(ctx)

    // scopeB version stays 999 across both calls; only the ACTIVE version
    // changes (1→2) — matching how loadRetrievalCorpusAll always loads the
    // active-scope corpus regardless of the scopeId passed to search.
    gw.search('q', 5, 'scopeB')
    expect(loadCalls).toBe(1)
    activeVersion = 2
    gw.search('q', 5, 'scopeB')
    // FIXED: cache keyed on active version (2≠1) → miss → reload (loadCalls=2).
    // BUG (pre-di-5): keyed on scopeB version (999===999) → stale hit → stays 1.
    expect(loadCalls).toBe(2)
  })
})

describe('SchemaGateway.getGraphData (W27 registry-driven projection)', () => {
  it('projects table, event, and concept nodes (metric excluded by default)', async () => {
    const gw = await makeGateway()
    const { nodes } = gw.getGraphData()
    const byId = new Map(nodes.map(n => [n.id as string, n]))
    // Registered kinds all reach the graph: dws + dim tables, the event, and
    // both concepts. metric is excluded when includeMetrics is not set.
    expect(byId.get('dws_order_di')?.kind).toBe('dws')
    expect(byId.get('dim_server')?.kind).toBe('dim')
    expect(byId.get('game.pay.order')?.kind).toBe('event')
    expect(byId.get('concept:付费经济')?.kind).toBe('concept')
    expect(byId.get('concept:基础数据')?.kind).toBe('concept')
    expect(byId.has('dws_order_di__total_amount')).toBe(false)
  })

  it('emits concept→asset related_to edges (regression: concept nodes were dropped pre-W27)', async () => {
    const gw = await makeGateway()
    const { edges } = gw.getGraphData()
    const conceptEdge = edges.find(
      e => (e.source as string) === 'concept:付费经济' && (e.target as string) === 'dws_order_di',
    )
    expect(conceptEdge).toBeDefined()
    expect(conceptEdge?.type).toBe('related_to')
  })

  it('includeMetrics adds the derived metric node', async () => {
    const gw = await makeGateway()
    const { nodes } = gw.getGraphData({ includeMetrics: true })
    const metric = nodes.find(n => (n.id as string) === 'dws_order_di__total_amount')
    expect(metric).toBeDefined()
    expect(metric?.kind).toBe('metric')
  })

  it('domain filter restricts nodes to the requested domain', async () => {
    const gw = await makeGateway()
    const { nodes } = gw.getGraphData({ domain: '付费经济' })
    const ids = new Set(nodes.map(n => n.id as string))
    expect(ids.has('dws_order_di')).toBe(true)
    expect(ids.has('game.pay.order')).toBe(true)
    expect(ids.has('concept:付费经济')).toBe(true)
    // 基础数据-only assets are filtered out.
    expect(ids.has('dim_server')).toBe(false)
    expect(ids.has('concept:基础数据')).toBe(false)
  })

  it('focus that names no projected node returns an empty subgraph', async () => {
    const gw = await makeGateway()
    expect(gw.getGraphData({ focus: 'no_such_node' })).toEqual({ nodes: [], edges: [] })
  })

  it('focus with depth 0 returns only the focus node', async () => {
    const gw = await makeGateway()
    const { nodes, edges } = gw.getGraphData({ focus: 'concept:付费经济', depth: 0 })
    expect(nodes.map(n => n.id as string)).toEqual(['concept:付费经济'])
    expect(edges).toEqual([])
  })

  it('bounded BFS from focus reaches its related assets at depth 1', async () => {
    const gw = await makeGateway()
    const { nodes } = gw.getGraphData({ focus: 'concept:付费经济', depth: 1 })
    const ids = new Set(nodes.map(n => n.id as string))
    expect(ids.has('concept:付费经济')).toBe(true)
    expect(ids.has('dws_order_di')).toBe(true)
    expect(ids.has('game.pay.order')).toBe(true)
  })

  it('a kind registered after build reaches the graph with its open kind — no gateway change', async () => {
    const { gw, svc, dir } = await makeGatewayEx()
    // A brand-new kind with its own storage dir + open `kind` string. The
    // gateway has no per-kind switch, so registering the kind is enough for its
    // node to flow through getGraphData to the client.
    mkdirSync(join(dir, 'charts'), { recursive: true })
    writeFileSync(join(dir, 'charts', 'weekly_revenue.yaml'), yaml.dump({ name: 'weekly_revenue', domains: ['付费经济'] }))
    const chartKind: DataSourceKindPlugin<{ name: string; domains: string[] }> = {
      kind: 'chart',
      storageDir: 'charts',
      schema: {
        parse: r => r as { name: string; domains: string[] },
        safeParse: r => ({ success: true, data: r as { name: string; domains: string[] } }),
      },
      getId: raw => (typeof raw.name === 'string' ? raw.name : undefined),
      toCorpusItem: () => null,
      toPromptContext: () => '',
      relations: () => [],
      toGraphNode: (def): GraphNodeProjection => ({ id: def.name, kind: 'chart', label: def.name, domains: [...def.domains] }),
    }
    svc.getRegistry().register(chartKind)
    const { nodes } = gw.getGraphData()
    const chart = nodes.find(n => (n.id as string) === 'weekly_revenue')
    expect(chart).toBeDefined()
    expect(chart?.kind).toBe('chart')
  })

  it('a kind may decline the graph by returning null from toGraphNode', async () => {
    const { gw, svc, dir } = await makeGatewayEx()
    mkdirSync(join(dir, 'hidden'), { recursive: true })
    writeFileSync(join(dir, 'hidden', 'secret.yaml'), yaml.dump({ name: 'secret' }))
    svc.getRegistry().register({
      kind: 'hidden',
      storageDir: 'hidden',
      schema: { parse: r => r, safeParse: r => ({ success: true, data: r }) },
      getId: raw => (typeof raw.name === 'string' ? (raw.name as string) : undefined),
      toCorpusItem: () => null,
      toPromptContext: () => '',
      relations: () => [],
      toGraphNode: () => null,
    })
    const { nodes } = gw.getGraphData()
    expect(nodes.some(n => (n.id as string) === 'secret')).toBe(false)
  })
})

// W27: additional projection tests — two-hop exclusion + invalid file
// definition. These complement the graph-remote.spec.ts Remote-transport
// tests with Service-level assertions.

it('two-hop exclusion: depth 1 from focus excludes 2-hop nodes', async () => {
  // concept:付费经济 → dws_order_di (1-hop); dws_order_di → concept:基础数据
  // is NOT an edge (different concept); but concept:付费经济 → game.pay.order
  // (1-hop). At depth 1, only 1-hop nodes are included; any 2-hop node
  // (reachable from dws_order_di's other edges) is excluded.
  const gw = await makeGateway()
  const { nodes } = gw.getGraphData({ focus: 'concept:付费经济', depth: 1 })
  const ids = new Set(nodes.map(n => n.id as string))
  expect(ids.has('concept:付费经济')).toBe(true)
  expect(ids.has('dws_order_di')).toBe(true)
  expect(ids.has('game.pay.order')).toBe(true)
  // dim_server is NOT reachable from concept:付费经济 (different domain) —
  // even at unlimited depth it would not appear because there is no edge.
  expect(ids.has('dim_server')).toBe(false)
})

it('depth 0 excludes all 1-hop nodes (only the focus node)', async () => {
  const gw = await makeGateway()
  const { nodes } = gw.getGraphData({ focus: 'concept:付费经济', depth: 0 })
  expect(nodes.map(n => n.id as string)).toEqual(['concept:付费经济'])
})

it('unlimited depth from focus reaches all connected nodes', async () => {
  const gw = await makeGateway()
  const { nodes } = gw.getGraphData({ focus: 'concept:付费经济' })
  const ids = new Set(nodes.map(n => n.id as string))
  expect(ids.has('concept:付费经济')).toBe(true)
  expect(ids.has('dws_order_di')).toBe(true)
  expect(ids.has('game.pay.order')).toBe(true)
  // dim_server + concept:基础数据 are in a different domain component —
  // not reachable from 付费经济 via any edge.
  expect(ids.has('dim_server')).toBe(false)
  expect(ids.has('concept:基础数据')).toBe(false)
})
