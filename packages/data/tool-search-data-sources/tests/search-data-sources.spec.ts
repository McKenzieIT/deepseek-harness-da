/**
 * search_data_sources tool - registration (defineTool + ctx.tools.register)
 * and BM25 schema-linking projection. Proves the FIRST model-facing tool
 * registration grounds the dsh-tools API, and that the linking logic returns
 * candidates.
 *
 * Run: `pnpm vitest run packages/data/tool-search-data-sources`
 * (the root `pnpm test` globs all `*.spec.ts` files).
 */
import { test, expect } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { Bm25Linker } from '@deepseek-ai/dsh-nl2sql-engine/src/bm25-linking.ts'
import { FIXTURE_DATA_SOURCES } from '@deepseek-ai/dsh-nl2sql-engine/src/eval/cases.ts'
import { apply, searchDataSources, type SearchHit } from '../src/index.ts'

/** The subset of the registered tool definition the tests exercise. */
interface ToolDef {
  readonly name: string
  readonly description: string
  readonly output: {
    readonly schema: unknown
    readonly render: (
      args: unknown,
      value: { readonly candidates: SearchHit[] },
    ) => readonly { readonly type: 'text'; readonly text: string }[]
  }
  readonly execute: (
    args: { readonly query: string; readonly top_k?: number },
    exec: { readonly signal: AbortSignal },
  ) => Promise<{ readonly candidates: SearchHit[] }>
}

/** Capture the tool definition the plugin registers, without a Cordis context. */
function registerTool(): ToolDef {
  let def: ToolDef | undefined
  const ctx = {
    tools: {
      register: (d: ToolDef) => {
        def = d
      },
    },
    // P5b: execute probes `ctx.get('retrieval')`; the stub models "no retrieval
    // provider registered" (returns undefined -> the sync Bm25Linker path).
    get: () => undefined,
  } as unknown as Context
  apply(ctx, {})
  if (def === undefined) {
    throw new Error('apply did not register a tool')
  }
  return def
}

test('S1 BM25 linking - 充值 top-1 = dws_pay_order_di (per-field 权重 + CJK bigram)', () => {
  const hits = searchDataSources(new Bm25Linker(FIXTURE_DATA_SOURCES), '昨天充值总金额', 5)
  expect(hits.length).toBeGreaterThan(0)
  expect(hits[0]?.id).toBe('dws_pay_order_di')
})

test('S2 top_k caps the candidate count', () => {
  const hits = searchDataSources(new Bm25Linker(FIXTURE_DATA_SOURCES), '充值 战斗 埋点', 2)
  expect(hits.length).toBeLessThanOrEqual(2)
})

test('S3 empty corpus returns no candidates (Q1 thin default until P6b ctx.schema)', () => {
  const hits = searchDataSources(new Bm25Linker([]), 'anything', 5)
  expect(hits).toEqual([])
})

test('S4 apply registers search_data_sources (name + description + output + execute)', () => {
  const def = registerTool()
  expect(def.name).toBe('search_data_sources')
  expect(def.description).toContain('data sources')
  expect(def.output).toBeDefined()
  expect(typeof def.execute).toBe('function')
})

test('S5 execute is callable and returns the candidate structure (empty thin-default corpus)', async () => {
  const def = registerTool()
  const out = await def.execute({ query: 'anything' }, { signal: new AbortController().signal })
  expect(out.candidates).toEqual([])
})

test('S6 render formats candidates as a ranked text block', () => {
  const def = registerTool()
  const hits: SearchHit[] = [
    { id: 'dws_pay_order_di', score: 1.234, description: '充值订单汇总表', mode: 'bm25-only' },
  ]
  const out = def.output.render({}, { candidates: hits })
  expect(out[0]?.type).toBe('text')
  expect(out[0]?.text).toContain('dws_pay_order_di')
  expect(out[0]?.text).toContain('1.234')
})

test('S7 render empty candidates -> no-match message', () => {
  const def = registerTool()
  const out = def.output.render({}, { candidates: [] })
  expect(out[0]?.text).toBe('No matching data sources found.')
})

test('S8 execute uses ctx.retrieval when registered (P5b soft-fallback swap)', async () => {
  let def: ToolDef | undefined
  const mockRetrieval = {
    retrieve: async () => [
      { id: 'mock.metric', score: 0.42, payload: { description: 'mock desc' }, mode: 'hybrid' },
    ],
  }
  const ctx = {
    tools: { register: (d: ToolDef) => { def = d } },
    get: () => mockRetrieval,
  } as unknown as Context
  apply(ctx, {})
  if (def === undefined) {
    throw new Error('apply did not register a tool')
  }
  const out = await def.execute({ query: 'q' }, { signal: new AbortController().signal })
  expect(out.candidates).toEqual([{ id: 'mock.metric', score: 0.42, description: 'mock desc', mode: 'hybrid' }])
})

test('S9 execute uses ctx.schema enriched corpus when registered (D2e schema soft-fallback)', async () => {
  let def: ToolDef | undefined
  // A mock ctx.schema whose loadRetrievalCorpus returns an enriched corpus
  // (params_fields packed into description, as ctx.schema would).
  const mockSchema = {
    loadRetrievalCorpus: () => [
      { id: 'recharge', description: '充值 roleId 角色id money 充值金额', metrics: {} },
      { id: 'shop.buy', description: '商城购买', metrics: {} },
    ],
  }
  const ctx = {
    tools: { register: (d: ToolDef) => { def = d } },
    // retrieval absent -> schema branch; schema present -> enriched Bm25Linker.
    get: (key: string) => (key === 'schema' ? mockSchema : undefined),
  } as unknown as Context
  apply(ctx, {})
  if (def === undefined) {
    throw new Error('apply did not register a tool')
  }
  // "角色" matches only via the packed params field (角色id), proving the
  // schema-sourced enriched corpus — not the empty Q1 thin default — is used.
  const out = await def.execute({ query: '角色' }, { signal: new AbortController().signal })
  expect(out.candidates.length).toBeGreaterThan(0)
  expect(out.candidates[0]?.id).toBe('recharge')
})

test('S10 execute rebuilds the enriched linker after a schema corpus-version bump (D2f cache-invalidation)', async () => {
  // A mock ctx.schema whose corpus + version are mutable: the version is the
  // D2f corpus-version counter the real SemanticLayerService exposes (bumped
  // by invalidateCaches on every write). Proves the cached enriched Bm25Linker
  // is dropped on a version mismatch so a mid-session event edit is seen — the
  // D2e-deferred cache-invalidation (without it, the second call returns the
  // stale v1 linker and misses the new shop.buy event).
  let version = 1
  let corpus: { id: string; description: string; metrics: Record<string, unknown> }[] = [
    { id: 'recharge', description: '充值 角色id 充值金额', metrics: {} },
  ]
  const mockSchema = {
    loadRetrievalCorpus: () => corpus,
    corpusVersion: () => version,
  }
  let def: ToolDef | undefined
  const ctx = {
    tools: { register: (d: ToolDef) => { def = d } },
    get: (key: string) => (key === 'schema' ? mockSchema : undefined),
  } as unknown as Context
  apply(ctx, {})
  if (def === undefined) {
    throw new Error('apply did not register a tool')
  }
  const exec = { signal: new AbortController().signal }
  // first call builds + caches the enriched linker from the v1 corpus
  const out1 = await def.execute({ query: '充值' }, exec)
  expect(out1.candidates.length).toBeGreaterThan(0)
  expect(out1.candidates[0]?.id).toBe('recharge')
  // shop.buy is not yet in the corpus
  const preBuy = await def.execute({ query: '购买' }, exec)
  expect(preBuy.candidates.find(c => c.id === 'shop.buy')).toBeUndefined()
  // simulate a mid-session event write: corpus changes + version bumps
  corpus = [
    { id: 'recharge', description: '充值 角色id 充值金额', metrics: {} },
    { id: 'shop.buy', description: '购买', metrics: {} },
  ]
  version = 2
  // the version bump must invalidate the cached linker -> rebuild from v2
  const out2 = await def.execute({ query: '购买' }, exec)
  expect(out2.candidates.find(c => c.id === 'shop.buy')).toBeDefined()
})

test('S11 execute applies the default topK=20 when top_k omitted (D2h 5→20 raise)', async () => {
  // 25 candidates all match 充值; the D2h default topK=20 must cap the count
  // at 20 (not 5 — the pre-D2h default — and not unbounded). Proves the 5→20
  // default change took effect on the shipped execute path.
  const mockSchema = {
    loadRetrievalCorpus: () => Array.from({ length: 25 }, (_, i) => ({
      id: `evt.${i}`, description: `充值 ${i}`, metrics: {},
    })),
  }
  let def: ToolDef | undefined
  const ctx = {
    tools: { register: (d: ToolDef) => { def = d } },
    get: (key: string) => (key === 'schema' ? mockSchema : undefined),
  } as unknown as Context
  apply(ctx, {}) // no config.topK -> default 20
  if (def === undefined) throw new Error('apply did not register a tool')
  const out = await def.execute({ query: '充值' }, { signal: new AbortController().signal })
  expect(out.candidates.length).toBe(20)
})
