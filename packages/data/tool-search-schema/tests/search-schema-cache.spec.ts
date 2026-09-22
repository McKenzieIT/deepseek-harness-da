/**
 * search_schema — D5.1 (Phase 3) cache-invalidation test. tool-search-schema
 * had no prior spec; this adds the minimum required coverage: a corpusVersion
 * bump (a write) invalidates the cached `Bm25Linker` so the next search sees
 * the fresh corpus (non-stale) — the D2f/D5.1 stale-on-write fix, exercised
 * through the public `searchSchema` API (no need to export the internal
 * `getCachedLinker`). Per-scope keying was dormant capacity until GA-GT1 Phase 5b wired
 * `exec.scopeId` through `searchSchema` -> `getCachedLinker` (dormant until 5d
 * — prod callers do not set `AgentOptions.scopeId` yet; 5d eval/CLI config
 * scopeId activates per-scope isolation, made safe by the 5b root-check);
 * the per-scope contract is parity-proven by tool-retrieve's
 * enriched-linker.spec.ts (same code shape).
 *
 * The suites appended after the cache cases close the rest of the package: the
 * `formatSearchSchema` projection and the Cordis tool-contract shell `apply`
 * registers (`output.render`, `output.presentationMeta`, `execute` incl. its
 * abort guard and its not-mounted degradation, `presentCall`,
 * `presentResult`). They live in this file rather than a second spec because
 * they reuse the same corpus-stub shape as the cache cases; the `registerTool`
 * harness captures the registered definition without standing up a real Cordis
 * container, mirroring
 * `packages/data/tool-get-coverage/tests/get-coverage.spec.ts`.
 *
 * Run: `pnpm vitest run packages/data/tool-search-schema`
 */
import { describe, expect, it, test } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { type DataSourceDoc } from '@deepseek-ai/dsh-nl2sql-engine/src/bm25-linking.ts'
import {
  apply,
  formatSearchSchema,
  searchSchema,
  type Config,
  type SearchSchemaHit,
  type SearchSchemaResult,
} from '../src/index.ts'

/** Minimal structural mock satisfying `SchemaCorpusSource` (no static dep on
 *  semantic-layer). `corpus`/`version` are closed-over `let`s so a test can
 *  simulate a mid-session write (mutate corpus + bump version). */
interface MockSchema {
  loadRetrievalCorpus: (scopeId?: string) => readonly DataSourceDoc[]
  corpusVersion: (scopeId?: string) => number
}

/** GA-GT1 Phase 5b (#19): root-check regression mock — implements
 *  `resolveScopeRoot` (the 5a seam) so the per-scope cache entry's `root`
 *  field is exercised. `rootForA` is a closed-over `let` so a test can
 *  simulate a re-registration onto a different, never-written root
 *  (corpusVersion stays 0===0 — the leak condition the root check closes,
 *  parity with Phase 2 I-1 graphCacheByScope). */
interface RootCheckSchema {
  loadRetrievalCorpus: (scopeId?: string) => readonly DataSourceDoc[]
  corpusVersion: (scopeId?: string) => number
  resolveScopeRoot: (scopeId?: string) => string
}

test('SSC1 corpusVersion bump rebuilds the cached linker (non-stale cache, D5.1)', () => {
  let version = 1
  let corpus: DataSourceDoc[] = [
    { id: 'recharge', description: '充值 roleId 角色id 充值金额' },
  ]
  const schema: MockSchema = {
    loadRetrievalCorpus: () => corpus,
    corpusVersion: () => version,
  }
  // first search builds + caches the linker from the v1 corpus
  const r1 = searchSchema(schema, '充值', 5)
  expect(r1.ok).toBe(true)
  expect(r1.hits?.some(h => h.id === 'recharge')).toBe(true)
  // shop.buy is not yet in the corpus
  const preBuy = searchSchema(schema, '购买', 5)
  expect(preBuy.hits?.some(h => h.id === 'shop.buy')).toBe(false)
  // simulate a mid-session event write: corpus changes + version bumps
  corpus = [
    { id: 'recharge', description: '充值 roleId 角色id 充值金额' },
    { id: 'shop.buy', description: '购买' },
  ]
  version = 2
  // the version bump must invalidate the cached linker -> rebuild from v2
  const r2 = searchSchema(schema, '购买', 5)
  expect(r2.hits?.some(h => h.id === 'shop.buy')).toBe(true)
})

// ── GA-GT1 Phase 5b: #19 root-check regression + backward-compat ──────────

test('SSC2 (#19) root-check: re-registering scope with a different root rebuilds the linker (no cross-tenant leak)', () => {
  // I-1 isomorphic (parity with semantic-layer graphCacheByScope + the 3a
  // tool-retrieve/tool-search-data-sources enrichedLinkers root checks): a
  // scope re-registered to a different, never-written root keeps
  // corpusVersion 0===0. WITHOUT the root check, the cache would HIT
  // (version 0===0) and serve the OLD root's linker → cross-tenant leak.
  // The `entry.root === root` check makes the entry MISS → rebuild from the
  // new root's corpus. 5b adds `root` to the `linkerCache` per-scope entry +
  // checks it, mirroring Phase 2 I-1. `searchSchema` threads scopeId through
  // to `getCachedLinker(schema, scopeId)` (the 5b execute-passthrough seam).
  const corpusK11: DataSourceDoc[] = [{ id: 'k11.evt', description: '充值 K11' }]
  const corpusX63: DataSourceDoc[] = [{ id: 'x63.evt', description: '购买 X63' }]
  let rootForA = '/roots/k11'
  const schema: RootCheckSchema = {
    loadRetrievalCorpus: () => (rootForA === '/roots/k11' ? corpusK11 : corpusX63),
    corpusVersion: () => 0, // both roots never written → 0===0 (the leak condition)
    resolveScopeRoot: () => rootForA,
  }
  // Register 'A' → root1; build + cache {linker: l1, version: 0, root: root1}
  const r1 = searchSchema(schema, '充值', 5, 'A')
  expect(r1.ok).toBe(true)
  expect(r1.hits?.some(h => h.id === 'k11.evt')).toBe(true)  // K11 content
  expect(r1.hits?.some(h => h.id === 'x63.evt')).toBe(false) // X63 not present
  // Re-register 'A' → root2 (same id, different tenant content); version still 0.
  rootForA = '/roots/x63'
  // WITHOUT root check: version 0===0 → HIT → serve l1 (K11) → cross-tenant leak.
  // WITH root check: root1≠root2 → MISS → rebuild l2 from root2's corpus (X63).
  const r2 = searchSchema(schema, '购买', 5, 'A')
  expect(r2.ok).toBe(true)
  expect(r2.hits?.some(h => h.id === 'x63.evt')).toBe(true)  // X63 content (rebuilt from root2)
  expect(r2.hits?.some(h => h.id === 'k11.evt')).toBe(false)  // K11-only content gone
})

test('SSC3 (5b backward-compat) no resolveScopeRoot → root=undefined → version-only degradation (现状)', () => {
  // A schema WITHOUT resolveScopeRoot (the 5a seam) degrades via `?.`:
  // root=undefined, the entry stores root: undefined, and the hit check
  // `entry.root === root` becomes `undefined === undefined` → true → version-
  // only behavior (the pre-5b contract, unchanged). MockSchema (no
  // resolveScopeRoot) exercises this degradation so the 5b change is additive.
  // `searchSchema` returns a fresh result object each call (the cache is on
  // the underlying linker), so cache-hit is proven via a corpus-load counter:
  // a HIT loads the corpus ONCE across two identical calls; a MISS would
  // load it twice.
  const corpus: DataSourceDoc[] = [{ id: 'evt.x', description: '充值' }]
  let corpusLoads = 0
  const schema: MockSchema = {
    loadRetrievalCorpus: () => { corpusLoads++; return corpus },
    corpusVersion: () => 1,
  }
  const r1 = searchSchema(schema, '充值', 5)
  expect(r1.ok).toBe(true)
  expect(corpusLoads).toBe(1) // first call builds + caches
  const r2 = searchSchema(schema, '充值', 5) // same scope, same version, root undefined===undefined
  expect(r2.ok).toBe(true)
  expect(corpusLoads).toBe(1) // cache hit: no rebuild, corpus not re-loaded (version-only degradation, 現状 preserved)
  // content identical (same cached linker served both calls)
  expect(r2.hits).toEqual(r1.hits)
})

// ── formatSearchSchema — the text projection ────────────────────────────────

describe('formatSearchSchema', () => {
  it('renders a not-ok result as its failure message', () => {
    expect(formatSearchSchema({ ok: false, message: 'semantic-layer not mounted (ctx.schema unavailable)' }))
      .toBe('semantic-layer not mounted (ctx.schema unavailable)')
  })

  it('renders a not-ok result without a message as the generic failure text', () => {
    expect(formatSearchSchema({ ok: false })).toBe('search_schema failed')
  })

  it('renders an ok result with an empty hit list as the no-match text', () => {
    expect(formatSearchSchema({ ok: true, hits: [] })).toBe('No matching assets found.')
  })

  it('renders an ok result carrying no hits key as the no-match text', () => {
    expect(formatSearchSchema({ ok: true })).toBe('No matching assets found.')
  })

  it('renders hits as a 1-based ranked list, appending only the metadata each hit carries', () => {
    // Distinct scores (all needing a different number of padded decimals),
    // one fully annotated hit, one bare hit, and one hit whose domain list is
    // present but EMPTY — the three shapes that drive every optional slot.
    const hits: SearchSchemaHit[] = [
      { id: 'dws_pay_order_di', score: 1.23456, kind: 'table', domains: ['pay', 'core'], description: '充值订单汇总表' },
      { id: 'evt_bare_signal', score: 0.5 },
      { id: 'evt_no_domains', score: 0.25, kind: 'event', domains: [], description: '无域事件' },
    ]
    expect(formatSearchSchema({ ok: true, hits })).toBe(
      '1. dws_pay_order_di (score 1.235) [table] {pay, core} — 充值订单汇总表\n'
      + '2. evt_bare_signal (score 0.500)\n'
      + '3. evt_no_domains (score 0.250) [event] — 无域事件',
    )
  })
})

// ── The registered-tool harness ─────────────────────────────────────────────

/** The subset of the registered tool definition the suites below exercise. */
interface ToolDef {
  readonly name: string
  readonly description: string
  readonly output: {
    readonly schema: unknown
    readonly render: (
      args: unknown,
      value: unknown,
    ) => readonly { readonly type: string; readonly text: string }[]
    readonly presentationMeta: (args: unknown, value: unknown) => unknown
  }
  readonly execute: (
    args: { readonly query: string; readonly top_k?: number },
    exec: { readonly signal: AbortSignal; readonly scopeId?: string },
  ) => Promise<SearchSchemaResult>
  readonly presentCall: (args?: unknown) => unknown
  readonly presentResult: (
    args: unknown,
    result: { readonly isError?: boolean; readonly meta?: unknown },
  ) => unknown
}

/**
 * Capture the tool definition `apply` registers — no real Cordis container.
 * `services` is the `ctx.get(key)` lookup table; a key absent from it returns
 * `undefined`, which models "that service is not mounted".
 *
 * `config` omitted calls `apply(ctx)` with no second argument so the shipped
 * `config: Config = {}` default (and with it the `config.topK ?? 20` fallback)
 * is the one under test; pass a `config` to pin the configured-topK path.
 */
function registerTool(services: Record<string, unknown> = {}, config?: Config): ToolDef {
  let def: ToolDef | undefined
  const ctx = {
    tools: { register: (d: ToolDef) => { def = d } },
    get: (key: string) => services[key],
  } as unknown as Context
  if (config === undefined) apply(ctx)
  else apply(ctx, config)
  if (def === undefined) throw new Error('apply did not register a tool')
  return def
}

/**
 * A corpus doc carrying the `kind`/`domains` metadata `searchSchema` projects
 * off every hit's payload — `Bm25Linker` hands the corpus doc itself back as
 * the hit payload, so annotating the doc is how a corpus source exposes the
 * kind/domain facets the tool advertises.
 */
interface EnrichedDoc extends DataSourceDoc {
  readonly kind?: string
  readonly domains?: string[]
}

/** Two docs sharing the ASCII token `pay` so one query retrieves both: the
 *  first fully annotated, the second bare (id only, no description) so the
 *  projection's "facet absent" arms are exercised in the same call. */
const ENRICHED_CORPUS: readonly EnrichedDoc[] = [
  { id: 'pay_order_table', description: '充值订单汇总表', kind: 'table', domains: ['pay', 'core'] },
  { id: 'pay_bare_asset' },
]

/** A fresh `ctx.schema` stub over `ENRICHED_CORPUS` per case — the module-level
 *  linker cache is a `WeakMap` keyed by the schema instance, so a new object
 *  per case keeps the cases independent. Deliberately exposes NO
 *  `corpusVersion` (a pre-D5.1 schema), so `corpusVersion?.(scopeId) ?? 0`
 *  degrades to version 0. */
function enrichedSchema(): { loadRetrievalCorpus: () => readonly EnrichedDoc[] } {
  return { loadRetrievalCorpus: () => ENRICHED_CORPUS }
}

/** A `ctx.schema` stub whose corpus holds 25 docs that all match 充值 — more
 *  than any topK under test, so the returned count is decided by the cap
 *  alone, not by how many docs happen to match. */
function bulkSchema(): { loadRetrievalCorpus: () => readonly DataSourceDoc[] } {
  return {
    loadRetrievalCorpus: () => Array.from({ length: 25 }, (_, i) => ({ id: `evt_${i}`, description: `充值 ${i}` })),
  }
}

// ── apply / the registered tool shell ───────────────────────────────────────

describe('apply', () => {
  it('registers search_schema with a description, output schema and presenters', () => {
    const def = registerTool()
    expect(def.name).toBe('search_schema')
    expect(def.description).toContain('Search the semantic layer for data assets')
    expect(def.output.schema).toBeDefined()
    expect(typeof def.output.render).toBe('function')
    expect(typeof def.output.presentationMeta).toBe('function')
    expect(typeof def.execute).toBe('function')
    expect(typeof def.presentCall).toBe('function')
    expect(typeof def.presentResult).toBe('function')
  })
})

describe('search_schema output.render', () => {
  it('renders an ok result as the formatted ranked text block', () => {
    const def = registerTool()
    expect(def.output.render({ query: '充值' }, {
      ok: true,
      hits: [{ id: 'dws_pay_order_di', score: 2.5, kind: 'table', domains: ['pay'], description: '充值订单汇总表' }],
    })).toEqual([{ type: 'text', text: '1. dws_pay_order_di (score 2.500) [table] {pay} — 充值订单汇总表' }])
  })

  it('renders a not-ok result as its failure message', () => {
    const def = registerTool()
    expect(def.output.render({ query: '充值' }, {
      ok: false,
      message: 'semantic-layer not mounted (ctx.schema unavailable)',
    })).toEqual([{ type: 'text', text: 'semantic-layer not mounted (ctx.schema unavailable)' }])
  })
})

describe('search_schema output.presentationMeta', () => {
  it('projects each hit with the facets it carries, dropping the score and the absent facets', () => {
    const def = registerTool()
    expect(def.output.presentationMeta({ query: '充值' }, {
      ok: true,
      hits: [
        { id: 'dws_pay_order_di', score: 2.5, kind: 'table', domains: ['pay', 'core'], description: '充值订单汇总表' },
        { id: 'evt_bare_signal', score: 0.5 },
      ],
    })).toStrictEqual({
      ok: true,
      hits: [
        { id: 'dws_pay_order_di', kind: 'table', domains: ['pay', 'core'], description: '充值订单汇总表' },
        { id: 'evt_bare_signal' },
      ],
    })
  })

  it('projects a not-ok result as its message over an empty hit list', () => {
    const def = registerTool()
    expect(def.output.presentationMeta({ query: '充值' }, {
      ok: false,
      message: 'semantic-layer not mounted (ctx.schema unavailable)',
    })).toStrictEqual({
      ok: false,
      hits: [],
      message: 'semantic-layer not mounted (ctx.schema unavailable)',
    })
  })
})

describe('search_schema execute', () => {
  it('rejects with the abort message when the signal is already aborted', async () => {
    const def = registerTool({ schema: enrichedSchema() })
    const controller = new AbortController()
    controller.abort()
    await expect(def.execute({ query: 'pay' }, { signal: controller.signal }))
      .rejects.toThrow(new Error('search_schema aborted'))
  })

  it('resolves to the not-mounted failure when ctx.schema is unavailable', async () => {
    const def = registerTool()
    await expect(def.execute({ query: 'pay' }, { signal: new AbortController().signal }))
      .resolves.toStrictEqual({ ok: false, message: 'semantic-layer not mounted (ctx.schema unavailable)' })
  })

  it('projects every hit from the mounted ctx.schema corpus, keeping only the facets its payload carries', async () => {
    const def = registerTool({ schema: enrichedSchema() })
    const out = await def.execute({ query: 'pay' }, { signal: new AbortController().signal })
    expect(out.ok).toBe(true)
    // BM25 decides the score, so each hit's score is asserted on its own and
    // then normalised to 0; every other slot — including the ABSENCE of
    // kind/domains/description on the bare doc — is pinned by toStrictEqual.
    const byId = new Map((out.hits ?? []).map((h): [string, SearchSchemaHit] => [h.id, h]))
    const enriched = byId.get('pay_order_table')
    expect(enriched?.score).toBeGreaterThan(0)
    expect({ ...enriched, score: 0 }).toStrictEqual({
      id: 'pay_order_table',
      score: 0,
      kind: 'table',
      domains: ['pay', 'core'],
      description: '充值订单汇总表',
    })
    const bare = byId.get('pay_bare_asset')
    expect(bare?.score).toBeGreaterThan(0)
    expect({ ...bare, score: 0 }).toStrictEqual({ id: 'pay_bare_asset', score: 0 })
  })

  it('caps the hits at the default topK of 20 when top_k is omitted', async () => {
    // 25 docs all match, so 20 can only come from the registered default —
    // not from the Bm25Linker's own retrieve default of 5, and not unbounded.
    const def = registerTool({ schema: bulkSchema() })
    const out = await def.execute({ query: '充值' }, { signal: new AbortController().signal })
    expect(out.hits).toHaveLength(20)
  })

  it('caps the hits at the configured topK when top_k is omitted', async () => {
    const def = registerTool({ schema: bulkSchema() }, { topK: 4 })
    const out = await def.execute({ query: '充值' }, { signal: new AbortController().signal })
    expect(out.hits).toHaveLength(4)
  })

  it('lets an explicit top_k argument win over the configured default', async () => {
    const def = registerTool({ schema: bulkSchema() }, { topK: 4 })
    const out = await def.execute({ query: '充值', top_k: 2 }, { signal: new AbortController().signal })
    expect(out.hits).toHaveLength(2)
  })

  it('threads exec.scopeId through to the per-scope corpus load (dormant until 5d)', async () => {
    const schema = {
      loadRetrievalCorpus: (scopeId?: string): readonly DataSourceDoc[] => (scopeId === 'tenant-b'
        ? [{ id: 'evt_b', description: '购买 tenantB' }]
        : [{ id: 'evt_a', description: '充值 tenantA' }]),
    }
    const def = registerTool({ schema })
    const outA = await def.execute({ query: '充值' }, { signal: new AbortController().signal, scopeId: 'tenant-a' })
    expect((outA.hits ?? []).map(h => h.id)).toEqual(['evt_a'])
    const outB = await def.execute({ query: '购买' }, { signal: new AbortController().signal, scopeId: 'tenant-b' })
    expect((outB.hits ?? []).map(h => h.id)).toEqual(['evt_b'])
  })
})

describe('search_schema presentCall', () => {
  it('presents a generic search card titled with the query', () => {
    const def = registerTool()
    expect(def.presentCall({ query: '昨天充值总金额' })).toStrictEqual({
      card: 'generic',
      title: 'Search: 昨天充值总金额',
      kind: 'search',
    })
  })
})

describe('search_schema presentResult', () => {
  it('presents nothing for an errored call', () => {
    const def = registerTool()
    expect(def.presentResult({ query: '充值' }, { isError: true })).toBeUndefined()
  })

  it('presents the failure card when the meta reports a failed search', () => {
    const def = registerTool()
    expect(def.presentResult({ query: '充值' }, { meta: { ok: false, hits: [] } }))
      .toStrictEqual({ card: 'generic', title: 'Search failed' })
  })

  it('presents a zero count when the result carries no presentation meta', () => {
    const def = registerTool()
    expect(def.presentResult({ query: '充值' }, {}))
      .toStrictEqual({ card: 'generic', title: '0 assets found' })
  })

  it('presents the singular asset noun for exactly one hit', () => {
    const def = registerTool()
    expect(def.presentResult({ query: '充值' }, { meta: { ok: true, hits: [{ id: 'pay_order_table' }] } }))
      .toStrictEqual({ card: 'generic', title: '1 asset found' })
  })

  it('presents the hit count with the plural asset noun for several hits', () => {
    const def = registerTool()
    expect(def.presentResult({ query: '充值' }, {
      meta: { ok: true, hits: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
    })).toStrictEqual({ card: 'generic', title: '3 assets found' })
  })
})
