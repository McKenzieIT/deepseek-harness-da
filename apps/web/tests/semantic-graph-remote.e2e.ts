/**
 * `schemaGateway.getGraphData` across the real Remote boundary: a Loader-composed
 * Host (Semantic Layer + Schema Gateway + Typert gateway + Connection) answers a
 * Loader-composed Client `ctx.remote.schemaGateway.getGraphData(query, scopeId)`
 * call that travels through the package's GENERATED codecs and the Connection
 * Fetch carrier.
 *
 * This is the only coverage of the wire half: serialization of the open `kind`
 * strings and branded `SemanticGraphNodeId`s, the two-argument Client arity, and
 * `RemoteResult` wrapping of both success and Host failure. The in-process
 * `packages/data/schema-gateway/tests/graph-remote.spec.ts` covers projection
 * logic and reaches none of it. Keyless: no model, no API key, no network — the
 * carrier is a counting `fetch` over the Host's own shared API handler. The
 * generated codecs are build artifacts, so this file belongs to the web lane
 * (`pnpm run test:web` builds first).
 *
 * Host faces are ordinary source imports, which places the file in
 * `tsconfig.host.json` (and in `apps/web/tsconfig.json`'s exclude list). The
 * Client faces and the generated codecs arrive through RUNTIME specifiers the
 * compiler cannot follow: no single program holds both faces (TS6307), and a
 * statically resolved `/client` import here would pull the whole Client project
 * into the Host build graph — the rule this directory's README states. Runtime
 * resolution still goes through the same tsconfig paths, so both halves share
 * one Cordis copy and meet only as carrier JSON. Their types are mirrored below;
 * a drift surfaces as a failed decode or a missing member, never a silent pass.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway'
import * as hostConnection from '@deepseek-ai/dsh-client-connection'
import SemanticLayerService, { type DataSourceKindPlugin } from '@deepseek-ai/dsh-semantic-layer'
import SchemaGateway from '@deepseek-ai/dsh-schema-gateway'
import { REPO_ROOT } from './support.ts'

/** One graph node as it arrives Client-side: ids and kinds are plain JSON strings after decoding. */
interface WireNode {
  readonly id: string
  readonly kind: string
  readonly label: string
  readonly domains: readonly string[]
}

/** One graph edge as it arrives Client-side. */
interface WireEdge {
  readonly source: string
  readonly target: string
  readonly type: string
}

/** The generated Client codec's result for `getGraphData`. */
type WireResult =
  | { readonly ok: true; readonly value: { readonly nodes: readonly WireNode[]; readonly edges: readonly WireEdge[] } }
  | { readonly ok: false; readonly error: { readonly message: string } }

/** Mirrors the `ctx.remote` augmentation `@deepseek-ai/dsh-api-gateway/client` declares. */
interface ClientRemote {
  $mount(contribution: unknown): Promise<void>
  readonly schemaGateway: {
    getGraphData(query: unknown, scopeId: string | undefined): Promise<WireResult>
  }
}

/** Mirrors the `installConnection` entry of `@deepseek-ai/dsh-client-connection/client`. */
interface ClientConnectionFace {
  installConnection(ctx: Context, options: {
    readonly transport: {
      fetch(url: string, init: RequestInit): Promise<Response>
      openStream(endpoint: string, payload: unknown, signal: AbortSignal): AsyncIterable<unknown>
    }
  }): void
}

/**
 * Load one generated Typert artifact by absolute path. The `./typert` and
 * `./remote` package entries resolve only from inside the owning package, and
 * they are build outputs rather than source: naming the file states the artifact
 * dependency and fails with the command that satisfies it.
 * @param file - artifact filename under the Schema Gateway's `lib/`.
 * @returns the artifact's module namespace.
 */
async function generatedCodec(file: string): Promise<Record<string, unknown>> {
  const path = join(REPO_ROOT, 'packages/data/schema-gateway/lib', file)
  if (!existsSync(path)) {
    throw new Error(`generated Typert artifact missing: ${path} — run \`pnpm run build\` (\`pnpm run test:web\` does this first)`)
  }
  return await import(pathToFileURL(path).href) as Record<string, unknown>
}

/** A chart: an open kind, unknown to the Schema Gateway, with its own relation type. */
interface ChartDefinition {
  readonly name: string
  readonly target: string
}

const chartKind: DataSourceKindPlugin<ChartDefinition> = {
  kind: 'chart',
  storageDir: 'charts',
  schema: {
    parse(raw) {
      const record = raw as Record<string, unknown>
      if (typeof record.name !== 'string' || typeof record.target !== 'string') {
        throw new Error('chart: name and target are required')
      }
      return { name: record.name, target: record.target }
    },
    safeParse(raw) {
      try {
        return { success: true, data: this.parse(raw) }
      } catch (error) {
        return { success: false, error }
      }
    },
  },
  getId: raw => (typeof raw.name === 'string' ? `chart:${raw.name}` : undefined),
  toCorpusItem: () => null,
  toPromptContext: def => def.name,
  // `target` is the canonical node id of the table this chart visualizes.
  relations: def => [{ type: 'visualizes', target: def.target }],
  toGraphNode: def => ({ id: `chart:${def.name}`, kind: 'chart', label: def.name, domains: ['economy'] }),
}

/** A semantic layer holding one of every projected kind plus the open chart kind. */
function seedSemanticLayer(): string {
  const root = mkdtempSync(join(process.env.DSH_TEST_TMPDIR ?? tmpdir(), 'w27-graph-wire-'))
  for (const dir of ['tables', 'concepts', 'charts', join('events', 'economy')]) {
    mkdirSync(join(root, dir), { recursive: true })
  }
  writeFileSync(join(root, 'config.yaml'), 'project:\n  name: wire\n  scope_id: wire\n')
  // A dws table whose inline metric derives the `metric` node.
  writeFileSync(join(root, 'tables', 'orders.yaml'), [
    'table_name: orders', 'kind: dws', 'domains: [economy]', 'columns: []',
    'metrics:', '  total:', '    expression: SUM(amount)', '',
  ].join('\n'))
  writeFileSync(join(root, 'tables', 'dim_region.yaml'), [
    'table_name: dim_region', 'kind: dim', 'domains: [economy]', 'columns: []',
    'primary_key: [region_id]', 'label_columns: [region_name]', '',
  ].join('\n'))
  writeFileSync(join(root, 'events', 'economy', 'order.paid.yaml'),
    'name: order.paid\ndomains: [economy]\ndescription: paid order\n')
  writeFileSync(join(root, 'concepts', 'economy.yaml'), 'name: economy\ndescription: economy domain\n')
  writeFileSync(join(root, 'charts', 'revenue.yaml'), 'name: revenue\ntarget: orders\n')
  return root
}

const host = new Context()
const client = new Context()
let requests = 0

/** Drive one Loader tree from an explicit module map and assert every entry mounted. */
async function load(ctx: Context, modules: Map<string, unknown>, config: Record<string, unknown> = {}): Promise<void> {
  await ctx.plugin(Loader)
  ctx.loader.internal = {
    version: 'v2',
    async import(name: string) {
      const module = modules.get(name)
      if (module === undefined) throw new Error(`Unexpected Loader module: ${name}`)
      return module
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  for (const name of modules.keys()) await ctx.loader.create({ name, config: config[name] })
  await ctx.loader.await()
  expect([...ctx.loader.entries()].filter(entry => !entry.disabled && !entry.fiber)).toEqual([])
}

/** The Client Remote namespace, readable only after the Client gateway mounts. */
function remote(): ClientRemote {
  return (client as unknown as { readonly remote: ClientRemote }).remote
}

beforeAll(async () => {
  const root = seedSemanticLayer()
  // Generated codecs: the Host contribution the Typert registry serves, and the
  // Client contribution `ctx.remote` mounts.
  const hostCodec = await generatedCodec('typert.host.js')
  const clientCodec = await generatedCodec('typert.remote-client.js')
  const records = new Map<unknown, unknown>()
  await load(host, new Map<string, unknown>([
    ['credentials-fixture', {
      apply(ctx: Context) {
        ctx.provide('credentials', {
          async modifyRecord(key: unknown, mutate: (value: unknown) => Promise<unknown>) {
            const next = await mutate(records.get(key))
            if (next !== undefined) records.set(key, next)
            return next
          },
        } as never)
      },
    }],
    ['connection', hostConnection],
    ['typert', TypertRegistry],
    ['schema', SemanticLayerService],
    ['schemaGateway', SchemaGateway],
    ['gateway', TypertGatewayService],
    ['generated-host', {
      inject: ['typert'],
      apply(ctx: Context) { ctx.effect(() => ctx.typert.register(hostCodec.TYPERT as never)) },
    }],
    ['chart-contributor', {
      inject: ['schema'],
      apply(ctx: Context) { ctx.effect(() => ctx.schema.getRegistry().register(chartKind)) },
    }],
  ]), { schema: { semanticRoot: root } })

  const handler = host.connection.createSharedFetchHandler('/api')
  const clientConnection = await import('@deepseek-ai/dsh-client-connection'.concat('/client')) as ClientConnectionFace
  const clientGateway = await import('@deepseek-ai/dsh-api-gateway'.concat('/client')) as unknown
  await load(client, new Map<string, unknown>([
    ['typert', TypertRegistry],
    ['connection', {
      apply(ctx: Context) {
        clientConnection.installConnection(ctx, {
          transport: {
            fetch: async (url, init) => {
              requests++
              return handler.fetch(new Request(url, init))
            },
            openStream: async function* (endpoint, payload, signal) {
              yield* await host.typertGateway.wireStream.open(endpoint, payload as never, signal)
            },
          },
        })
      },
    }],
    ['gateway', clientGateway],
    ['generated-client', {
      inject: ['remote'],
      async apply() { await remote().$mount(clientCodec.default) },
    }],
  ]))
}, 120_000)

afterAll(async () => {
  await client.fiber.dispose()
  await host.fiber.dispose()
})

it('returns table, event, metric, concept, and open-kind nodes through the generated Remote codec', async () => {
  const result = await remote().schemaGateway.getGraphData({ includeMetrics: true }, undefined)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.message)
  // The carrier was used: this is a decoded wire response, not an in-process call.
  expect(requests).toBeGreaterThan(0)

  const kindById = Object.fromEntries(result.value.nodes.map(node => [node.id, node.kind]))
  expect(kindById).toMatchObject({
    orders: 'dws',
    dim_region: 'dim',
    'order.paid': 'event',
    orders__total: 'metric',
    'concept:economy': 'concept',
    // A kind the Schema Gateway never heard of survives the wire with its own
    // `kind` string; no closed union narrows it away.
    'chart:revenue': 'chart',
  })
  // Open relation types survive too, on declared and derived edges alike.
  expect(result.value.edges).toContainEqual({ source: 'chart:revenue', target: 'orders', type: 'visualizes' })
  expect(result.value.edges).toContainEqual({ source: 'concept:economy', target: 'orders', type: 'related_to' })
  expect(result.value.edges).toContainEqual({ source: 'orders__total', target: 'orders', type: 'derived_from' })
}, 120_000)

it('omits metric nodes by default and honours the bounded focus query over the wire', async () => {
  const defaults = await remote().schemaGateway.getGraphData(undefined, undefined)
  if (!defaults.ok) throw new Error(defaults.error.message)
  expect(defaults.value.nodes.some(node => node.kind === 'metric')).toBe(false)

  // Depth 1 from the chart reaches the table it visualizes and the concept that
  // groups it; `dim_region` and `order.paid` sit two hops away through the
  // concept and stay out.
  const focused = await remote().schemaGateway.getGraphData({ focus: 'chart:revenue', depth: 1 }, undefined)
  if (!focused.ok) throw new Error(focused.error.message)
  expect(focused.value.nodes.map(node => node.id).sort()).toEqual(['chart:revenue', 'concept:economy', 'orders'])

  const missing = await remote().schemaGateway.getGraphData({ focus: 'no_such_node' }, undefined)
  expect(missing).toEqual({ ok: true, value: { nodes: [], edges: [] } })
}, 120_000)

it('wraps a Host failure in the generated result contract instead of throwing Client-side', async () => {
  // A mounted scope registry that resolves nothing: the Semantic Layer refuses
  // to fall back to the active scope, and the Remote result carries the reason.
  const scopes = { active: () => undefined, activeId: () => undefined, get: () => undefined }
  const scopeFiber = host.plugin((ctx: Context) => { ctx.provide('scopes', scopes) })
  await scopeFiber
  try {
    const result = await remote().schemaGateway.getGraphData(undefined, 'unknown-scope')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected a Remote failure')
    expect(result.error.message).toContain('unknown-scope')
  } finally {
    await scopeFiber.dispose()
  }
}, 120_000)
