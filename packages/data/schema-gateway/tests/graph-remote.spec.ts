/**
 * W27 graph projection through the real `@Remote('getGraphData')` Schema
 * Gateway service method. Tests the Remote-assembly logic (registry-driven
 * projection, canonical target mapping, bounded traversal, invalid-file
 * isolation, disposer cache invalidation, error propagation) by calling the
 * real `SchemaGateway.getGraphData` directly — the method IS the
 * `@Remote('getGraphData')` implementation, so this exercises the real Remote
 * service, not fake component data.
 *
 * Host-only faces: `SchemaGateway` + `SemanticLayerService` from host package
 * entry points — fits `tsconfig.host.json` (neutral `.spec.ts` suffix, no
 * `/client` imports → no TS6307 cross-program error). The wire-transport
 * (Fetch carrier) is covered by the e2e scaffold at `apps/web/tests/`; this
 * test focuses on the Remote service logic.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SemanticLayerService, type DataSourceKindPlugin } from '@deepseek-ai/dsh-semantic-layer'
import { z } from 'zod'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import SchemaGateway from '../src/index.ts'

const dirs: string[] = []

afterEach(() => {
  dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true }))
})

/** Chart kind plugin — an open kind with its own `visualizes` relation type. */
const chartDefinition = z.object({
  name: z.string(),
  target: z.string(),
  visible: z.boolean().default(true),
})

const chartKind: DataSourceKindPlugin<z.infer<typeof chartDefinition>> = {
  kind: 'chart',
  storageDir: 'charts',
  schema: chartDefinition,
  getId: raw => typeof raw.name === 'string' ? raw.name : undefined,
  toCorpusItem: () => null,
  toPromptContext: () => '',
  relations: def => [{ type: 'visualizes', target: def.target, description: 'Chart source' }],
  toGraphNode: def => def.visible
    ? { id: `chart:${def.name}`, kind: 'chart', label: def.name, domains: ['economy'] }
    : null,
}

/** Seed a semantic-layer root with tables + chart files for W27 graph tests. */
function seedGraphRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'w27-graph-remote-'))
  dirs.push(root)
  for (const dir of ['tables', 'charts']) mkdirSync(join(root, dir))
  // Tables — `orders` (economy, dws) + `other` (other-domain, dim with required PK).
  writeFileSync(join(root, 'tables', 'orders.yaml'),
    'table_name: orders\nkind: dws\ndomains: [economy]\ncolumns: []\n')
  writeFileSync(join(root, 'tables', 'other.yaml'),
    'table_name: other\nkind: dim\ndomains: [other]\ncolumns: []\nprimary_key: [other_id]\nlabel_columns: [other_name]\n')
  // Charts — open kind with `visualizes` relation + canonical target mapping.
  writeFileSync(join(root, 'charts', 'first.yaml'), 'name: first\ntarget: orders\n')
  writeFileSync(join(root, 'charts', 'second.yaml'), 'name: second\ntarget: first\n')
  writeFileSync(join(root, 'charts', 'hidden.yaml'), 'name: hidden\ntarget: orders\nvisible: false\n')
  writeFileSync(join(root, 'charts', 'dangling.yaml'), 'name: dangling\ntarget: hidden\n')
  writeFileSync(join(root, 'charts', 'cross.yaml'), 'name: cross\ntarget: other\n')
  // Invalid files — must be isolated (not abort the graph build).
  writeFileSync(join(root, 'charts', 'malformed.yaml'), 'name: [\n')
  writeFileSync(join(root, 'charts', 'array.yaml'), '- name: array\n  target: orders\n')
  writeFileSync(join(root, 'charts', 'invalid.yaml'), 'name: rejected\ntarget: 42\n')
  return root
}

/** Build a real SchemaGateway + SemanticLayerService with the chart kind registered. */
function makeGraphGateway(): { gw: SchemaGateway; svc: SemanticLayerService; ctx: Context } {
  const root = seedGraphRoot()
  const ctx = new Context()
  const svc = new SemanticLayerService(ctx, { semanticRoot: root, scopeId: '' })
  svc.getRegistry().register(chartKind)
  const gw = new SchemaGateway(ctx)
  return { gw, svc, ctx }
}

describe('SchemaGateway.getGraphData through real @Remote service (W27)', () => {
  it('projects an open kind with `visualizes` relation + canonical target mapping + bounded traversal', () => {
    const { gw } = makeGraphGateway()
    // focus chart:first, depth 1 — reaches chart:first, chart:second (→first),
    // and orders (chart:first → orders via `visualizes`).
    const result = gw.getGraphData({ focus: 'chart:first', depth: 1 })
    expect(result.nodes.map(n => n.id as string).sort()).toEqual(['chart:first', 'chart:second', 'orders'])
    expect(result.edges).toContainEqual({
      source: 'chart:first', target: 'orders', type: 'visualizes',
    })
    // Canonical target mapping: chart:second → `first` (bare name) is
    // resolved to `chart:first` (prefixed id) so the edge flows through the
    // bounded BFS instead of being dropped as an unknown target.
    expect(result.edges).toContainEqual({
      source: 'chart:second', target: 'chart:first', type: 'visualizes',
    })

    // Reverse traversal from `orders` depth 1 reaches chart:first only.
    const fromOrders = gw.getGraphData({ focus: 'orders', depth: 1 })
    expect(fromOrders.nodes.map(n => n.id as string).sort()).toEqual(['chart:first', 'orders'])
  })

  it('isolates invalid files, null projections, and cross-domain targets under domain filter', () => {
    const { gw } = makeGraphGateway()
    const result = gw.getGraphData({ domain: 'economy' })
    // All economy-domain chart nodes + orders table appear; the `other` table
    // (domain: other) is excluded; hidden chart (null projection) is excluded.
    expect(result.nodes.map(n => n.id as string).sort()).toEqual([
      'chart:cross', 'chart:dangling', 'chart:first', 'chart:second', 'orders',
    ])
    // Every edge has both endpoints in the projected node set — no dangling
    // edges to null-projected (hidden) or cross-domain (other) targets.
    expect(result.edges.every(edge =>
      result.nodes.some(n => n.id === edge.source)
      && result.nodes.some(n => n.id === edge.target),
    )).toBe(true)
    // chart:dangling → hidden (null-projected) and chart:cross → other
    // (cross-domain) produce NO edges — their targets are not projected nodes.
    expect(result.edges.some(e => (e.source as string) === 'chart:dangling')).toBe(false)
    expect(result.edges.some(e => (e.source as string) === 'chart:cross')).toBe(false)
    // Focus on a missing or other-domain node returns an empty subgraph.
    expect(gw.getGraphData({ domain: 'economy', focus: 'missing' })).toEqual({ nodes: [], edges: [] })
    expect(gw.getGraphData({ domain: 'economy', focus: 'other' })).toEqual({ nodes: [], edges: [] })
  })

  it('invalidates the graph cache on contributor dispose and reloads with the registry alive', async () => {
    const root = seedGraphRoot()
    const ctx = new Context()
    const svc = new SemanticLayerService(ctx, { semanticRoot: root, scopeId: '' })
    const gw = new SchemaGateway(ctx)

    // Register the chart kind via a fiber-tracked effect so it can be disposed.
    const chartFiber = ctx.plugin((ctx: Context) => {
      ctx.effect(() => svc.getRegistry().register(chartKind))
    })
    await chartFiber

    // Verify chart nodes are present.
    const withChart = gw.getGraphData({ focus: 'orders', depth: 1 })
    expect(withChart.nodes.map(n => n.id as string).sort()).toEqual(['chart:first', 'orders'])

    // The graph is now cached. Capture it to verify cache invalidation.
    const registry = svc.getRegistry()
    const cached = svc.getRelationGraph()

    // Dispose the chart contributor fiber — the onChange listener (wired in
    // the constructor via ctx.effect) must fire and invalidate the cache.
    await chartFiber.dispose()
    expect(svc.getRegistry()).toBe(registry)
    expect(registry.getKind('chart')).toBeUndefined()
    // The graph object changed — cache was invalidated and rebuilt.
    expect(svc.getRelationGraph()).not.toBe(cached)

    // After dispose, chart nodes are gone.
    const withoutChart = gw.getGraphData({ focus: 'orders', depth: 1 })
    expect(withoutChart.nodes.map(n => n.id as string)).toEqual(['orders'])

    // Reload: re-register the chart kind — the onChange listener fires again,
    // the cache is invalidated, and the chart nodes flow through without a
    // restart (the registry object is retained, same as the dispose case).
    const reload = ctx.plugin((ctx: Context) => {
      ctx.effect(() => svc.getRegistry().register(chartKind))
    })
    await reload
    const reloaded = gw.getGraphData({ focus: 'orders', depth: 1 })
    expect(reloaded.nodes.map(n => n.id as string).sort()).toEqual(['chart:first', 'orders'])
    await reload.dispose()
  })

  it('propagates Host scope-resolution failures (unknown scope throws)', async () => {
    const root = seedGraphRoot()
    const ctx = new Context()
    new SemanticLayerService(ctx, { semanticRoot: root, scopeId: '' })
    const gw = new SchemaGateway(ctx)

    // Provide a scopes service that returns undefined for any scope id —
    // resolveRoot('unknown-scope') must throw (intranet-security: refuse
    // silent fallback to prevent cross-tenant corpus leak).
    const scopes = {
      active: () => undefined,
      activeId: () => undefined,
      get: () => undefined,
    }
    const scopeFiber = ctx.plugin((ctx: Context) => { ctx.provide('scopes', scopes) })
    await scopeFiber
    try {
      // The @Remote('getGraphData') service method throws — in the real wire
      // transport the client codec catches this and wraps it into
      // `{ ok: false, error: { message } }`; calling the method directly
      // surfaces the throw. The error message identifies the unknown scope.
      expect(() => gw.getGraphData(undefined, 'unknown-scope')).toThrow('unknown-scope')
    } finally {
      await scopeFiber.dispose()
    }
  })
})
