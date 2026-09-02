/**
 * retrieve tool - registration (defineTool + ctx.tools.register) + BM25 retrieval
 * projection + the D2e soft-fallback chain (ctx.retrieval -> ctx.schema enriched
 * Bm25Linker -> empty Bm25Linker). Mirrors tool-search-data-sources' spec (S1-S9)
 * adapted to the retrieve escape-hatch, plus two retrieve-specific tests (abort
 * guard + config topK default).
 *
 * Run: `pnpm vitest run packages/data/tool-retrieve`
 * (the root `pnpm test` globs all `*.spec.ts` files).
 */
import { test, expect } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { Bm25Linker } from '@deepseek-ai/dsh-nl2sql-engine/src/bm25-linking.ts'
import { FIXTURE_DATA_SOURCES } from '@deepseek-ai/dsh-nl2sql-engine/src/eval/cases.ts'
import { apply, retrieve, type RetrieveHit } from '../src/index.ts'

/** The subset of the registered tool definition the tests exercise. */
interface ToolDef {
  readonly name: string
  readonly description: string
  readonly output: {
    readonly schema: unknown
    readonly render: (
      args: unknown,
      value: { readonly candidates: RetrieveHit[] },
    ) => readonly { readonly type: 'text'; readonly text: string }[]
  }
  readonly execute: (
    args: { readonly query: string; readonly top_k?: number },
    exec: { readonly signal: AbortSignal; readonly scopeId?: string },
  ) => Promise<{ readonly candidates: RetrieveHit[] }>
}

/** Capture the tool definition the plugin registers, without a Cordis context. */
function registerTool(ctxGet: (key: string) => unknown = () => undefined, config: { topK?: number } = {}): ToolDef {
  let def: ToolDef | undefined
  const ctx = {
    tools: {
      register: (d: ToolDef) => {
        def = d
      },
    },
    // P5b/D2e: execute probes ctx.get('retrieval') then ctx.get('schema'); the
    // stub models "no provider registered" (returns undefined -> the sync
    // Bm25Linker path) unless a mock is supplied.
    get: ctxGet,
  } as unknown as Context
  apply(ctx, config)
  if (def === undefined) {
    throw new Error('apply did not register a tool')
  }
  return def
}

test('R1 retrieve BM25 linking - 充值 top-1 = dws_pay_order_di (per-field 权重 + CJK bigram)', () => {
  const hits = retrieve(new Bm25Linker(FIXTURE_DATA_SOURCES), '昨天充值总金额', 5)
  expect(hits.length).toBeGreaterThan(0)
  expect(hits[0]?.id).toBe('dws_pay_order_di')
})

test('R2 top_k caps the candidate count', () => {
  const hits = retrieve(new Bm25Linker(FIXTURE_DATA_SOURCES), '充值 战斗 埋点', 2)
  expect(hits.length).toBeLessThanOrEqual(2)
})

test('R3 empty corpus returns no candidates (Q1 thin default until ctx.schema mounts)', () => {
  const hits = retrieve(new Bm25Linker([]), 'anything', 5)
  expect(hits).toEqual([])
})

test('R4 apply registers retrieve (name + description + output + execute)', () => {
  const def = registerTool()
  expect(def.name).toBe('retrieve')
  expect(def.description).toMatch(/retrieve/i)
  expect(def.output).toBeDefined()
  expect(typeof def.execute).toBe('function')
})

test('R5 execute is callable and returns the candidate structure (empty thin-default corpus)', async () => {
  const def = registerTool()
  const out = await def.execute({ query: 'anything' }, { signal: new AbortController().signal })
  expect(out.candidates).toEqual([])
})

test('R6 render formats candidates as a ranked text block', () => {
  const def = registerTool()
  const hits: RetrieveHit[] = [
    { id: 'dws_pay_order_di', score: 1.234, description: '充值订单汇总表', mode: 'bm25-only' },
  ]
  const out = def.output.render({}, { candidates: hits })
  expect(out[0]?.type).toBe('text')
  expect(out[0]?.text).toContain('dws_pay_order_di')
  expect(out[0]?.text).toContain('1.234')
})

test('R7 render empty candidates -> no-match message', () => {
  const def = registerTool()
  const out = def.output.render({}, { candidates: [] })
  expect(out[0]?.text).toBe('No matching data sources found.')
})

test('R8 execute uses ctx.retrieval when registered (P5b soft-fallback swap)', async () => {
  const mockRetrieval = {
    retrieve: async () => [
      { id: 'mock.metric', score: 0.42, payload: { description: 'mock desc' }, mode: 'hybrid' },
    ],
  }
  const def = registerTool(() => mockRetrieval)
  const out = await def.execute({ query: 'q' }, { signal: new AbortController().signal })
  expect(out.candidates).toEqual([{ id: 'mock.metric', score: 0.42, description: 'mock desc', mode: 'hybrid' }])
})

test('R9 execute uses ctx.schema enriched corpus when registered (D2e schema soft-fallback)', async () => {
  // A mock ctx.schema whose loadRetrievalCorpus returns an enriched corpus
  // (params_fields packed into description, as ctx.schema would).
  const mockSchema = {
    loadRetrievalCorpus: () => [
      { id: 'recharge', description: '充值 roleId 角色id money 充值金额', metrics: {} },
      { id: 'shop.buy', description: '商城购买', metrics: {} },
    ],
  }
  const def = registerTool(key => (key === 'schema' ? mockSchema : undefined))
  // "角色" matches only via the packed params field (角色id), proving the
  // schema-sourced enriched corpus — not the empty Q1 thin default — is used.
  const out = await def.execute({ query: '角色' }, { signal: new AbortController().signal })
  expect(out.candidates.length).toBeGreaterThan(0)
  expect(out.candidates[0]?.id).toBe('recharge')
})

test('R10 execute throws when aborted before linking', async () => {
  const def = registerTool()
  const ac = new AbortController()
  ac.abort()
  await expect(def.execute({ query: 'q' }, { signal: ac.signal })).rejects.toThrow('aborted')
})

test('R11 execute applies the config topK default when top_k omitted', async () => {
  // 5 candidates all match 充值; config.topK=3 must cap the returned count.
  const mockSchema = {
    loadRetrievalCorpus: () => [
      { id: 'a', description: '充值 aa', metrics: {} },
      { id: 'b', description: '充值 bb', metrics: {} },
      { id: 'c', description: '充值 cc', metrics: {} },
      { id: 'd', description: '充值 dd', metrics: {} },
      { id: 'e', description: '充值 ee', metrics: {} },
    ],
  }
  const def = registerTool(key => (key === 'schema' ? mockSchema : undefined), { topK: 3 })
  const out = await def.execute({ query: '充值' }, { signal: new AbortController().signal })
  expect(out.candidates.length).toBeGreaterThanOrEqual(1)
  expect(out.candidates.length).toBeLessThanOrEqual(3)
})

test('R12 execute applies the default topK=20 when top_k omitted (D2h 5→20 raise, parity with search_data_sources)', async () => {
  // 25 candidates all match 充值; the D2h default topK=20 caps at 20 (not 5 —
  // the pre-D2h default). Proves the 5→20 default change took effect on the
  // shipped retrieve escape-hatch execute path (parity with search_data_sources).
  const mockSchema = {
    loadRetrievalCorpus: () => Array.from({ length: 25 }, (_, i) => ({
      id: `evt.${i}`, description: `充值 ${i}`, metrics: {},
    })),
  }
  const def = registerTool(key => (key === 'schema' ? mockSchema : undefined))
  const out = await def.execute({ query: '充值' }, { signal: new AbortController().signal })
  expect(out.candidates.length).toBe(20)
})

test('R13 (5b) execute passes exec.scopeId → getEnrichedLinker uses that scope’s corpus (per-scope isolation, dormant until 5d)', async () => {
  // A mock ctx.schema whose loadRetrievalCorpus returns a different corpus per
  // scopeId. execute must thread exec.scopeId → getEnrichedLinker(schema,
  // exec.scopeId) so tenant-a sees only its corpus. DORMANT: prod callers do
  // not set AgentOptions.scopeId yet (5d eval/CLI will) → exec.scopeId is
  // undefined → ACTIVE_SENTINEL → active path (现状); this test pins the
  // 5b activation seam so 5d wiring is already safe.
  const corpusA = [{ id: 'evt.a', description: '充值 tenantA', metrics: {} }]
  const corpusB = [{ id: 'evt.b', description: '购买 tenantB', metrics: {} }]
  const mockSchema = {
    loadRetrievalCorpus: (scopeId?: string) => (scopeId === 'tenant-b' ? corpusB : corpusA),
    corpusVersion: () => 1,
  }
  const def = registerTool(key => (key === 'schema' ? mockSchema : undefined))
  // exec.scopeId = 'tenant-a' → getEnrichedLinker(schema, 'tenant-a') → corpusA
  const outA = await def.execute({ query: '充值' }, { signal: new AbortController().signal, scopeId: 'tenant-a' })
  expect(outA.candidates.some(h => h.id === 'evt.a')).toBe(true)
  expect(outA.candidates.some(h => h.id === 'evt.b')).toBe(false)
  // exec.scopeId = 'tenant-b' → corpusB (per-scope isolation)
  const outB = await def.execute({ query: '购买' }, { signal: new AbortController().signal, scopeId: 'tenant-b' })
  expect(outB.candidates.some(h => h.id === 'evt.b')).toBe(true)
})
