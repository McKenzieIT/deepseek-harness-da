/** Loader composition + generated Remote codecs over Connection's Fetch carrier. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway'
import * as clientGateway from '@deepseek-ai/dsh-api-gateway/client'
import * as hostConnection from '@deepseek-ai/dsh-client-connection'
import { installConnection } from '@deepseek-ai/dsh-client-connection/client'
import SemanticLayerService, { type DataSourceKindPlugin } from '@deepseek-ai/dsh-semantic-layer'
import { z } from 'zod'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import SchemaGateway from '../src/index.ts'
// Explicit artifact imports: the codecs must come from the owner generator,
// not the source-plane RemoteMock namespace substitute.
import { TYPERT } from '../lib/typert.host.js'
import schemaGatewayRemote from '../lib/typert.remote-client.js'
import type {} from '@deepseek-ai/dsh-schema-gateway/remote'

const definition = z.object({ name: z.string(), target: z.string(), visible: z.boolean().default(true) })
const chartKind: DataSourceKindPlugin<z.infer<typeof definition>> = {
  kind: 'chart', storageDir: 'charts', schema: definition,
  getId: raw => typeof raw.name === 'string' ? raw.name : undefined,
  toCorpusItem: () => null, toPromptContext: () => '',
  relations: def => [{ type: 'visualizes', target: def.target, description: 'Chart source' }],
  toGraphNode: def => def.visible ? { id: `chart:${def.name}`, kind: 'chart', label: def.name, domains: ['economy'] } : null,
}

async function load(ctx: Context, modules: Map<string, unknown>, config: Record<string, unknown> = {}): Promise<void> {
  await ctx.plugin(Loader)
  ctx.loader.internal = {
    version: 'v2',
    async import(name: string) {
      if (!modules.has(name)) throw new Error(`Unexpected Loader module: ${name}`)
      return modules.get(name)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  for (const name of modules.keys()) await ctx.loader.create({ name, config: config[name] })
  await ctx.loader.await()
  expect([...ctx.loader.entries()].filter(entry => !entry.disabled && !entry.fiber)).toEqual([])
}

describe('registered graph through generated Remote', () => {
  const host = new Context()
  const client = new Context()
  let contribution: { fiber?: { dispose(): Promise<void> }; options: { name?: string } }
  let requests = 0
  const contributor = {
    inject: ['schema'],
    apply(ctx: Context) { ctx.effect(() => ctx.schema.getRegistry().register(chartKind)) },
  }

  beforeAll(async () => {
    const root = mkdtempSync(join(process.env.DSH_TEST_TMPDIR ?? tmpdir(), 'w27-graph-remote-'))
    for (const dir of ['tables', 'charts']) mkdirSync(join(root, dir))
    writeFileSync(join(root, 'tables', 'orders.yaml'), 'table_name: orders\nkind: dws\ndomains: [economy]\ncolumns: []\n')
    writeFileSync(join(root, 'tables', 'other.yaml'), 'table_name: other\nkind: dim\ndomains: [other]\ncolumns: []\n')
    writeFileSync(join(root, 'charts', 'first.yaml'), 'name: first\ntarget: orders\n')
    writeFileSync(join(root, 'charts', 'second.yaml'), 'name: second\ntarget: first\n')
    writeFileSync(join(root, 'charts', 'hidden.yaml'), 'name: hidden\ntarget: orders\nvisible: false\n')
    writeFileSync(join(root, 'charts', 'dangling.yaml'), 'name: dangling\ntarget: hidden\n')
    writeFileSync(join(root, 'charts', 'cross.yaml'), 'name: cross\ntarget: other\n')
    writeFileSync(join(root, 'charts', 'malformed.yaml'), 'name: [\n')
    writeFileSync(join(root, 'charts', 'array.yaml'), '- name: array\n  target: orders\n')
    writeFileSync(join(root, 'charts', 'invalid.yaml'), 'name: rejected\ntarget: 42\n')
    const records = new Map<unknown, unknown>()
    await load(host, new Map<string, unknown>([
      ['credentials-fixture', { apply(ctx: Context) {
        ctx.provide('credentials', { async modifyRecord(key: unknown, mutate: (value: unknown) => Promise<unknown>) {
          const next = await mutate(records.get(key)); if (next !== undefined) records.set(key, next); return next
        } } as never)
      } }],
      ['connection', hostConnection], ['typert', TypertRegistry],
      ['schema', SemanticLayerService], ['schemaGateway', SchemaGateway],
      ['gateway', TypertGatewayService],
      ['generated-host', { inject: ['typert'], apply(ctx: Context) { ctx.effect(() => ctx.typert.register(TYPERT as never)) } }],
      ['chart-contributor', contributor],
    ]), { schema: { semanticRoot: root } })
    contribution = [...host.loader.entries()].find(entry => entry.options.name === 'chart-contributor')!
    const handler = host.connection.createSharedFetchHandler('/api')
    await load(client, new Map<string, unknown>([
      ['typert', TypertRegistry],
      ['connection', { apply(ctx: Context) {
        installConnection(ctx, { transport: {
          fetch: async (url, init) => { requests++; return handler.fetch(new Request(url, init)) },
          openStream: async function* (endpoint, payload, signal) {
            yield* await host.typertGateway.wireStream.open(endpoint, payload, signal)
          },
        } })
      } }],
      ['gateway', clientGateway],
      ['generated-client', { inject: ['remote'], async apply(ctx: Context) { await ctx.remote.$mount(schemaGatewayRemote) } }],
    ]))
  })

  afterAll(async () => { await client.fiber.dispose(); await host.fiber.dispose() })

  it('projects a new relation, maps canonical targets and bounds traversal after decoding', async () => {
    const result = await client.remote.schemaGateway.getGraphData({ focus: 'chart:first', depth: 1 }, undefined)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.message)
    expect(result.value.nodes.map(node => node.id).sort()).toEqual(['chart:first', 'chart:second', 'orders'])
    expect(result.value.edges).toContainEqual({ source: 'chart:first', target: 'orders', type: 'visualizes' })
    expect(requests).toBeGreaterThan(0)
    const fromOrders = await client.remote.schemaGateway.getGraphData({ focus: 'orders', depth: 1 }, undefined)
    if (!fromOrders.ok) throw new Error(fromOrders.error.message)
    expect(fromOrders.value.nodes.map(node => node.id).sort()).toEqual(['chart:first', 'orders'])
  })

  it('isolates invalid files, null projections and cross-domain endpoints', async () => {
    const result = await client.remote.schemaGateway.getGraphData({ domain: 'economy' }, undefined)
    if (!result.ok) throw new Error(result.error.message)
    expect(result.value.nodes.map(node => node.id).sort()).toEqual(['chart:cross', 'chart:dangling', 'chart:first', 'chart:second', 'orders'])
    expect(result.value.edges.every(edge =>
      result.value.nodes.some(node => node.id === edge.source)
      && result.value.nodes.some(node => node.id === edge.target),
    )).toBe(true)
    expect(result.value.edges.some(edge => edge.source === 'chart:dangling' || edge.source === 'chart:cross')).toBe(false)
    for (const focus of ['missing', 'other']) {
      const focused = await client.remote.schemaGateway.getGraphData({ domain: 'economy', focus }, undefined)
      expect(focused).toEqual({ ok: true, value: { nodes: [], edges: [] } })
    }
  })

  it('withdraws only the contributor and reloads with the registry still alive', async () => {
    const registry = host.schema.getRegistry()
    const cached = host.schema.getRelationGraph()
    await contribution.fiber!.dispose()
    expect(host.schema.getRegistry()).toBe(registry)
    expect(registry.getKind('chart')).toBeUndefined()
    expect(host.schema.getRelationGraph()).not.toBe(cached)
    const result = await client.remote.schemaGateway.getGraphData({ focus: 'orders', depth: 1 }, undefined)
    if (!result.ok) throw new Error(result.error.message)
    expect(result.value.nodes.map(node => node.id)).toEqual(['orders'])
    // Reload: re-register the chart kind via a fresh host fiber. The
    // registry is retained (same object); the onChange listener wired in the
    // service constructor invalidates the graph cache so the reloaded kind's
    // nodes/edges flow through getGraphData without a restart. The
    // registry.spec.ts disposer test covers the same contract at the unit level.
    const reload = host.plugin(contributor)
    await reload
    const reloaded = await client.remote.schemaGateway.getGraphData({ focus: 'orders', depth: 1 }, undefined)
    if (!reloaded.ok) throw new Error(reloaded.error.message)
    expect(reloaded.value.nodes.map(node => node.id).sort()).toEqual(['chart:first', 'orders'])
    await reload.dispose()
  })

  it('returns Host failures through the generated result contract', async () => {
    const scopes = { active: () => undefined, activeId: () => undefined, get: () => undefined }
    const scopeFiber = host.plugin((ctx: Context) => { ctx.provide('scopes', scopes) })
    await scopeFiber
    try {
      const result = await client.remote.schemaGateway.getGraphData(undefined, 'unknown-scope')
      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('Expected Remote failure')
      expect(result.error.message).toContain('unknown-scope')
    } finally { await scopeFiber.dispose() }
  })
})
