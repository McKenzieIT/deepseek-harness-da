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
import { apply, searchDataSources, extractQueryTerms, type SearchHit } from '../src/index.ts'

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
    exec: { readonly signal: AbortSignal; readonly scopeId?: string },
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
      { id: 'mock.metric', score: 0.42, payload: { kind: 'metric', description: 'mock desc' }, mode: 'hybrid' },
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
  expect(out.candidates).toEqual([{ id: 'mock.metric', score: 0.42, description: 'mock desc', mode: 'hybrid', type: 'metric' }])
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

test('S11b (5b) execute passes exec.scopeId → getEnrichedLinker uses that scope’s corpus (per-scope isolation, dormant until 5d)', async () => {
  // A mock ctx.schema whose loadRetrievalCorpus returns a different corpus per
  // scopeId. execute must thread exec.scopeId → getEnrichedLinker(schema,
  // exec.scopeId) so tenant-a sees only its corpus. DORMANT: prod callers do
  // not set AgentOptions.scopeId yet (5d eval/CLI will) → exec.scopeId is
  // undefined → ACTIVE_SENTINEL → active path (现状); this test pins the 5b
  // activation seam so 5d wiring is already safe.
  const mockSchema = {
    loadRetrievalCorpus: (scopeId?: string) =>
      scopeId === 'tenant-b'
        ? [{ id: 'evt.b', description: '购买 tenantB', metrics: {} }]
        : [{ id: 'evt.a', description: '充值 tenantA', metrics: {} }],
    corpusVersion: () => 1,
  }
  let def: ToolDef | undefined
  const ctx = {
    tools: { register: (d: ToolDef) => { def = d } },
    get: (key: string) => (key === 'schema' ? mockSchema : undefined),
  } as unknown as Context
  apply(ctx, {})
  if (def === undefined) throw new Error('apply did not register a tool')
  // exec.scopeId = 'tenant-a' → getEnrichedLinker(schema, 'tenant-a') → corpusA
  const outA = await def.execute({ query: '充值' }, { signal: new AbortController().signal, scopeId: 'tenant-a' })
  expect(outA.candidates.some(h => h.id === 'evt.a')).toBe(true)
  expect(outA.candidates.some(h => h.id === 'evt.b')).toBe(false)
  // exec.scopeId = 'tenant-b' → corpusB (per-scope isolation)
  const outB = await def.execute({ query: '购买' }, { signal: new AbortController().signal, scopeId: 'tenant-b' })
  expect(outB.candidates.some(h => h.id === 'evt.b')).toBe(true)
})

test('S12 qualifyCandidates passes payload.project as override to qualifyTable (per-table override #3a)', async () => {
  // Self-evolution #3a: a table candidate whose payload carries a per-table
  // `project` override must hand that project to `ctx.query.qualifyTable` as
  // the 2nd arg so the override wins over Config.defaultProject. The override
  // originates on the table definition (TableDefinitionSchema.project) and is
  // carried through projectHit → SearchHit.project → qualifyCandidates.
  const qualifyCalls: Array<[string, string | undefined]> = []
  const mockQuery = {
    qualifyTable: (tableName: string, override?: string) => {
      qualifyCalls.push([tableName, override])
      return `qualified.${tableName}`
    },
  }
  const mockRetrieval = {
    retrieve: async () => [
      { id: 'dws_pay_order_di', score: 0.9, payload: { kind: 'dws', project: 'ieu_ods', description: '充值订单汇总表' }, mode: 'hybrid' },
    ],
  }
  let def: ToolDef | undefined
  const ctx = {
    tools: { register: (d: ToolDef) => { def = d } },
    get: (key: string) => (key === 'query' ? mockQuery : key === 'retrieval' ? mockRetrieval : undefined),
  } as unknown as Context
  apply(ctx, {})
  if (def === undefined) throw new Error('apply did not register a tool')
  const out = await def.execute({ query: '充值' }, { signal: new AbortController().signal })
  // qualifyTable received the per-table override 'ieu_ods' as the 2nd arg
  expect(qualifyCalls).toEqual([['dws_pay_order_di', 'ieu_ods']])
  // the qualified id uses the override project, and the candidate carries project
  expect(out.candidates[0]?.id).toBe('qualified.dws_pay_order_di')
  expect(out.candidates[0]?.project).toBe('ieu_ods')
})

test('S13 qualifyCandidates passes undefined override when payload has no project (default project #3a)', async () => {
  // When the table definition declares no per-table project, qualifyCandidates
  // must pass `undefined` as the override so qualifyTable falls back to
  // Config.defaultProject (ieu_cdm) — not a stale or empty string override.
  const qualifyCalls: Array<[string, string | undefined]> = []
  const mockQuery = {
    qualifyTable: (tableName: string, override?: string) => {
      qualifyCalls.push([tableName, override])
      return `qualified.${tableName}`
    },
  }
  const mockRetrieval = {
    retrieve: async () => [
      { id: 'dws_pay_order_di', score: 0.9, payload: { kind: 'dws', description: '充值订单汇总表' }, mode: 'hybrid' },
    ],
  }
  let def: ToolDef | undefined
  const ctx = {
    tools: { register: (d: ToolDef) => { def = d } },
    get: (key: string) => (key === 'query' ? mockQuery : key === 'retrieval' ? mockRetrieval : undefined),
  } as unknown as Context
  apply(ctx, {})
  if (def === undefined) throw new Error('apply did not register a tool')
  const out = await def.execute({ query: '充值' }, { signal: new AbortController().signal })
  // qualifyTable received undefined override → falls back to defaultProject
  expect(qualifyCalls).toEqual([['dws_pay_order_di', undefined]])
  expect(out.candidates[0]?.id).toBe('qualified.dws_pay_order_di')
  // no project key on the candidate (payload had none)
  expect(out.candidates[0]?.project).toBeUndefined()
})

// --- CL-6: extractQueryTerms tokenizer fix ---

test('S14 extractQueryTerms generates bigrams for mixed CJK/ASCII tokens (CL-6 tokenizer fix)', () => {
  const terms = extractQueryTerms('这个月氪金超过500元的玩家有多少')
  expect(terms).toContain('氪金')
  expect(terms).toContain('玩家')
})

test('S15 extractQueryTerms handles pure ASCII terms with CJK suffix', () => {
  const terms = extractQueryTerms('ARPPU是多少')
  expect(terms.some(t => t.toLowerCase() === 'arppu')).toBe(true)
  expect(terms).toContain('是多')
  expect(terms).toContain('多少')
})

test('S16 extractQueryTerms still works for pure CJK tokens', () => {
  const terms = extractQueryTerms('日活跃用户')
  expect(terms).toContain('日活跃用户')
  expect(terms).toContain('日活')
  expect(terms).toContain('活跃')
  expect(terms).toContain('跃用')
  expect(terms).toContain('用户')
})

// --- CL-6: continuous-blend mode ---

test('S17 continuous-blend introduces graph-only candidates not in BM25 results', async () => {
  const mockSchema = {
    loadRetrievalCorpus: () => [
      { id: 'dws_pay_order_di', description: '充值订单汇总表', metrics: {} },
      { id: 'dws_active_user_di', description: '日活跃用户统计表', metrics: {} },
    ],
  }
  const mockGraph = {
    getRelationGraph: () => ({
      findJoinPath: () => null,
      getJoinCondition: () => null,
      getRelated: () => [],
      getDerived: () => [],
      resolveAlias: (term: string) => {
        if (term === '付费' || term === '充值') return ['dws_pay_order_di']
        if (term === '留存') return ['dws_retention_di']
        return []
      },
    }),
  }
  let def: ToolDef | undefined
  const ctx = {
    tools: { register: (d: ToolDef) => { def = d } },
    get: (key: string) => (key === 'schema' ? { ...mockSchema, ...mockGraph } : undefined),
  } as unknown as Context
  apply(ctx, { blendingMode: 'continuous-blend' })
  if (def === undefined) throw new Error('apply did not register a tool')
  const out = await def.execute({ query: '付费留存' }, { signal: new AbortController().signal })
  const ids = out.candidates.map((c: SearchHit) => c.id)
  expect(ids).toContain('dws_retention_di')
  expect(out.candidates.find((c: SearchHit) => c.id === 'dws_retention_di')?.mode).toBe('graph-only')
})

test('S18 continuous-blend degrades to BM25 when graph has no resolveAlias', async () => {
  const mockSchema = {
    loadRetrievalCorpus: () => [
      { id: 'dws_pay_order_di', description: '充值订单汇总表', metrics: {} },
    ],
  }
  const mockGraph = {
    getRelationGraph: () => ({
      findJoinPath: () => null,
      getJoinCondition: () => null,
      getRelated: () => [],
      getDerived: () => [],
    }),
  }
  let def: ToolDef | undefined
  const ctx = {
    tools: { register: (d: ToolDef) => { def = d } },
    get: (key: string) => (key === 'schema' ? { ...mockSchema, ...mockGraph } : undefined),
  } as unknown as Context
  apply(ctx, { blendingMode: 'continuous-blend' })
  if (def === undefined) throw new Error('apply did not register a tool')
  const out = await def.execute({ query: '充值' }, { signal: new AbortController().signal })
  expect(out.candidates.length).toBeGreaterThan(0)
  expect(out.candidates[0]?.id).toBe('dws_pay_order_di')
})

test('S19 default blendingMode=continuous-blend uses applyContinuousBlend', async () => {
  const mockSchema = {
    loadRetrievalCorpus: () => [
      { id: 'dws_pay_order_di', description: '充值订单汇总表', metrics: {} },
    ],
  }
  const mockGraph = {
    getRelationGraph: () => ({
      findJoinPath: () => null,
      getJoinCondition: () => null,
      getRelated: () => [],
      getDerived: () => [],
      resolveAlias: (term: string) => {
        if (term === '充值') return ['dws_pay_order_di']
        return []
      },
    }),
  }
  let def: ToolDef | undefined
  const ctx = {
    tools: { register: (d: ToolDef) => { def = d } },
    get: (key: string) => (key === 'schema' ? { ...mockSchema, ...mockGraph } : undefined),
  } as unknown as Context
  apply(ctx, {})
  if (def === undefined) throw new Error('apply did not register a tool')
  const out = await def.execute({ query: '充值' }, { signal: new AbortController().signal })
  expect(out.candidates.length).toBeGreaterThan(0)
  const hit = out.candidates[0]!
  expect(hit.id).toBe('dws_pay_order_di')
  expect(hit.mode).toBe('blended')
})

// --- GA-GT1 Phase 5c: external getRelationGraph call site passes exec.scopeId ---

test('S20 (5c) execute passes exec.scopeId → ctx.schema.getRelationGraph receives it (per-scope, dormant until 5d)', async () => {
  // The 5c call site: probeRelationGraph threads exec.scopeId →
  // schema.getRelationGraph(scopeId) (Phase 2 per-scope graph path). A mock
  // schema records every scopeId it receives; execute must hand it
  // exec.scopeId='tenant-a' so 5d wiring (agent.options.scopeId) activates
  // per-scope graph isolation without further code change here. DORMANT:
  // prod callers do not set AgentOptions.scopeId yet → exec.scopeId is
  // undefined → active path (pinned by S21); this test pins the 5c seam.
  const getRelationGraphCalls: (string | undefined)[] = []
  const mockSchema = {
    loadRetrievalCorpus: () => [
      { id: 'recharge', description: '充值', metrics: {} },
    ],
    getRelationGraph: (scopeId?: string) => {
      getRelationGraphCalls.push(scopeId)
      // stub graph: no expand/alias edges, so candidates stay BM25-only
      return {
        findJoinPath: () => null,
        getJoinCondition: () => null,
        getRelated: () => [],
        getDerived: () => [],
        resolveAlias: () => [],
      }
    },
  }
  let def: ToolDef | undefined
  const ctx = {
    tools: { register: (d: ToolDef) => { def = d } },
    get: (key: string) => (key === 'schema' ? mockSchema : undefined),
  } as unknown as Context
  apply(ctx, {})
  if (def === undefined) throw new Error('apply did not register a tool')
  const out = await def.execute({ query: '充值' }, { signal: new AbortController().signal, scopeId: 'tenant-a' })
  expect(out.candidates.length).toBeGreaterThan(0)
  // getRelationGraph received 'tenant-a' on EVERY call (probeRelationGraph in
  // execute + applyGraphExpansionAndJoins both thread exec.scopeId).
  expect(getRelationGraphCalls.length).toBeGreaterThan(0)
  expect(getRelationGraphCalls.every(s => s === 'tenant-a')).toBe(true)
})

test('S21 (5c) execute without scopeId → getRelationGraph receives undefined (active 现状, dormant)', async () => {
  // DORMANT path: exec.scopeId omitted → undefined → getRelationGraph(undefined)
  // → active scope graph (Phase 2 β fallback). Preserves the pre-5c behavior;
  // the recorded `undefined` proves the call site degrades to active (no scope
  // leakage, no behavioral change) until 5d activates named scopes.
  const getRelationGraphCalls: (string | undefined)[] = []
  const mockSchema = {
    loadRetrievalCorpus: () => [
      { id: 'recharge', description: '充值', metrics: {} },
    ],
    getRelationGraph: (scopeId?: string) => {
      getRelationGraphCalls.push(scopeId)
      return {
        findJoinPath: () => null,
        getJoinCondition: () => null,
        getRelated: () => [],
        getDerived: () => [],
        resolveAlias: () => [],
      }
    },
  }
  let def: ToolDef | undefined
  const ctx = {
    tools: { register: (d: ToolDef) => { def = d } },
    get: (key: string) => (key === 'schema' ? mockSchema : undefined),
  } as unknown as Context
  apply(ctx, {})
  if (def === undefined) throw new Error('apply did not register a tool')
  // no scopeId on exec → undefined threaded through
  const out = await def.execute({ query: '充值' }, { signal: new AbortController().signal })
  expect(out.candidates.length).toBeGreaterThan(0)
  expect(getRelationGraphCalls.length).toBeGreaterThan(0)
  expect(getRelationGraphCalls.every(s => s === undefined)).toBe(true)
})
