/**
 * Model-facing `search_data_sources` tool - the UNDERSTANDING-phase entry to
 * BM25 schema-linking. The agent calls it to learn which data sources (DWS
 * tables / event ODS tables) match a natural-language question before it
 * writes SQL.
 *
 * P13b deferred sub-item: this is the FIRST model-facing tool registration in
 * the data-agent effort, so it grounds the `@deepseek-ai/dsh-tools`
 * tool-registration API (`defineTool` + `ctx.tools.register`) for every later
 * data-agent tool (load_table_definition / load_event_definition / query_data
 * / critique_sql / evaluate_sql_quality / present_*).
 *
 * Q1 thin default (P13b grilling Q1): the BM25 linker is the local
 * `Bm25Linker` exported from `@deepseek-ai/dsh-nl2sql-engine` - the same
 * building block the engine uses. `ctx.nl2sql` exposes only `getConventions`
 * (no retrieval method), so the tool calls `Bm25Linker` directly. The corpus
 * is empty until the P6b `ctx.schema` substrate ships; an empty corpus returns
 * no candidates, which is an honest "callable but unwired" state, not a broken
 * mount (the preset's own note: an unregistered whitelisted tool is simply
 * uncallable). Two additive swaps land later, both leaving this tool's
 * contract unchanged:
 *  - P5b ships `ctx.retrieval` -> the engine's `RetrievalLinker` swaps to it;
 *    this tool may then call `ctx.retrieval` instead of the local `Bm25Linker`.
 *  - P6b ships `ctx.schema` -> the corpus is sourced from `ctx.schema.discover`
 *    instead of the empty default.
 *
 * @module @deepseek-ai/dsh-tool-search-data-sources
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { Bm25Linker, type RetrievalLinker, type RetrievalHit, type DataSourceDoc } from '@deepseek-ai/dsh-nl2sql-engine/src/bm25-linking.ts'
import { type RetrievalService as _RetrievalService } from '@deepseek-ai/dsh-retrieval/src/index.ts'
import { expandQuery } from './expand-query.ts'

export const name = 'tool-search-data-sources'
export const inject = ['tools']

/** Configuration for the search_data_sources tool. */
export interface Config {
  /** Default candidate count when the call omits `top_k` (D2h: raised 5→20 —
   * topK=20 helps all corpus variants per the D2g 113-gold sweep: base
   * 62.8→77.9, term-only 77.0→85.0, params+term 68.1→81.4 strict). */
  readonly topK?: number
  /** Enable LLM query expansion before BM25 retrieval (P15a). */
  readonly queryExpansion?: boolean
  /** LLM provider route for query expansion (CL8: empty default; resolved from
   *  env `ENRICHMENT_LLM_PROVIDER` when omitted; P15a). */
  readonly expansionProvider?: string
  /** LLM model id for query expansion (CL8: empty default; resolved from env
   *  `ENRICHMENT_LLM_MODEL` when omitted; P15a). */
  readonly expansionModel?: string
  /** Blending mode for alias-graph fusion (CL-6). `strategy-b` = boost existing
   *  BM25 candidates; `continuous-blend` = coverage-weighted BM25+graph merge
   *  that introduces new candidates from the alias graph. */
  readonly blendingMode?: 'strategy-b' | 'continuous-blend'
}

/** Runtime configuration schema for the search_data_sources plugin. */
export const Config: z<Config> = z.object({
  topK: z.number().default(20),
  queryExpansion: z.boolean().default(true),
  expansionProvider: z.string().default(''),
  expansionModel: z.string().default(''),
  blendingMode: z.string().default('continuous-blend') as z<'strategy-b' | 'continuous-blend'>,
})

/** A ranked candidate data source returned to the model. */
export interface SearchHit {
  readonly id: string
  readonly score: number
  readonly description?: string
  readonly mode: string
  /** Data-source kind: 'metric' | 'table' | 'event' | 'source'. Lets the model
   *  distinguish a metric candidate (id = `<table>__<key>`, NOT a loadable table)
   *  from a table/event — so it routes metrics to GENERATION context, not
   *  load_table_definition (which returns not-found on a metric name). */
  readonly type?: string
  /** Per-table engine project override (self-evolution #3a). Carried from
   *  `TableDefinitionSchema.project` on the hit payload through `projectHit` so
   *  `qualifyCandidates` can hand it to `ctx.query.qualifyTable(id, project)` —
   *  the override wins over `Config.defaultProject`. Absent on non-table kinds
   *  and when the table definition declares no project (falls back to default). */
  readonly project?: string
}

/** Infer the data-source kind from a corpus item's payload. */
function typeOf(payload: unknown): string {
  // RetrievalHit.payload is a CorpusItem ({id, description?, payload?}) — the
  // data-source definition is the NESTED payload.payload (isMetricHit reads
  // hit.payload?.payload?.kind). Read the inner kind; fall back to event
  // fields; else 'source'.
  type Inner = { kind?: string; params_fields?: unknown; external_refs?: unknown; event_filter?: unknown }
  const outer = payload as { kind?: string; payload?: Inner } | undefined
  const inner = outer?.payload
  const k = outer?.kind ?? inner?.kind
  if (k === 'metric') return 'metric'
  if (k === 'dws' || k === 'dim') return 'table'
  if (inner?.params_fields !== undefined || inner?.external_refs !== undefined || inner?.event_filter !== undefined) return 'event'
  return 'source'
}

/**
 * Project BM25 retrieval hits to the model-facing candidate shape (drops the
 * opaque `payload`). Exported so the projection + BM25 linking are testable
 * without a Cordis context. `Bm25Linker` is the Q1 thin default; swap to
 * `ctx.retrieval` when P5b ships (contract unchanged).
 *
 * @param linker The BM25/retrieval linker whose corpus is searched; the Q1
 * thin default is `Bm25Linker`, swapped to `ctx.retrieval` when P5b ships.
 * @param query The natural-language data question to link against the
 * data-source corpus.
 * @param topK Maximum number of candidate data sources to return.
 * @returns Ranked candidate data sources projected to the model-facing
 * `SearchHit` shape (drops the opaque `payload`).
 */
export function searchDataSources(
  linker: RetrievalLinker,
  query: string,
  topK: number,
): SearchHit[] {
  const hits: readonly RetrievalHit[] = linker.retrieve(query, { topK, mode: 'bm25-only' })
  // Use projectHit (not a hand-rolled {id,score,description,mode}) so the
  // schema/thin-default paths also extract `type` (metric/table/event) and
  // `project` (per-table override) — otherwise qualifyCandidates skips
  // qualification (c.type === 'table' guard fails) and the model sees bare
  // un-typed ids, breaking C's qualify + #1's type labeling on these paths.
  return hits.map(projectHit)
}

/**
 * Project a retrieval hit with an opaque payload (`unknown` at the
 * `ctx.retrieval` seam) to the model-facing candidate shape. Shared by the
 * `ctx.retrieval` async path + the sync `searchDataSources` projection so the
 * two swap paths produce identical candidate shapes.
 */
function projectHit(h: { readonly id: string; readonly score: number; readonly payload: unknown; readonly mode: string }): SearchHit {
  const description = (h.payload as { description?: string } | undefined)?.description
  // #3a: extract the per-table project override from the payload
  // (TableDefinitionSchema.project). Guarded typeof check so a missing or
  // non-string project yields `undefined` → no `project` key on the SearchHit
  // (toEqual stays exact for payloads without project, e.g. S8/S9).
  // project may be on the CorpusItem wrapper (test mocks) or the nested
  // TableDefinition (real RetrievalHit.payload = {payload: TableDefinition});
  // read both layers.
  const outer = h.payload as { project?: unknown; payload?: { project?: unknown } } | undefined
  const projectRaw = outer?.project ?? outer?.payload?.project
  const project = typeof projectRaw === 'string' && projectRaw.length > 0 ? projectRaw : undefined
  return {
    id: h.id,
    score: h.score,
    ...(description !== undefined ? { description } : {}),
    mode: h.mode,
    type: typeOf(h.payload),
    ...(project !== undefined ? { project } : {}),
  }
}

function qualifyCandidates(ctx: Context, candidates: SearchHit[]): SearchHit[] {
  // C: probe ctx.query (engine-agnostic) for qualifyTable — supersedes the
  // SchemaCorpusSource.qualifyTableName path (which misread config.yaml
  // project.name = game scope id, NOT an engine project → DAU qualified
  // game_10000251.dws_... which the engine could not find). Soft probe like
  // ctx.get('schema'): returns undefined when no query provider is
  // registered, so candidates stay bare (callable but unwired, no crash).
  const q = ctx.get('query') as { qualifyTable?: (tableName: string, override?: string) => string } | undefined
  // Bind to q: qualifyTable reads `this.cfg.defaultProject`, so an unbound
  // method reference loses `this` → `this.cfg` undefined → 'reading cfg' crash.
  const qualify = q?.qualifyTable?.bind(q)
  if (qualify === undefined) return candidates
  // Qualify only table-kind candidates (metric/event ids are not engine tables;
  // `mode` is the retrieval mode, not the data-source kind, so the prior
  // `c.mode === 'event'` check never matched — every candidate was qualified,
  // and qualifyTableName silently no-op'd non-tables).
  // #3a: pass the per-table project override (SearchHit.project, extracted by
  // projectHit from TableDefinitionSchema.project) as the 2nd arg so it wins
  // over Config.defaultProject (ieu_cdm). `undefined` when the table declares
  // no project → qualifyTable falls back to defaultProject; non-table kinds
  // are not qualified at all (skipped by the type guard above).
  return candidates.map(c => c.type === 'table' ? { ...c, id: qualify(c.id, c.project) } : c)
}

/**
 * Minimal structural shape tool-search probes for the D2e enriched corpus
 * (`ctx.schema` when the semantic-layer provider is mounted). Avoids a static
 * dep on `@deepseek-ai/dsh-semantic-layer`: `ctx.get('schema')` returns the
 * `SemanticLayerService` when mounted, `undefined` when not (bundle opt-in).
 * The returned corpus items are `DataSourceDoc`-shaped (params_fields +
 * terminology slang packed into `description`; NOT domain — see D2e).
 *
 * D2f: `corpusVersion()` is the cache-invalidation signal — a monotonic counter
 * the SemanticLayerService exposes (bumped by `invalidateCaches` on every write:
 * writeEventYaml / writeTable / updateTableMeta / syncWriteDefinitions). Probed
 * structurally (no static dep) so the cached enriched `Bm25Linker` rebuilds
 * after a mid-session event edit instead of staying stale until reboot.
 * Optional: a schema without it degrades to build-once (D2e behavior).
 */
interface SchemaCorpusSource {
  loadRetrievalCorpus(scopeId?: string): readonly DataSourceDoc[]
  /** P3/P4: full corpus (events+tables+metrics); preferred over events-only when present. */
  loadRetrievalCorpusAll?(scopeId?: string): readonly DataSourceDoc[]
  /** Phase 3 (D5.1): corpus-version signal for stale-cache invalidation per scope. */
  corpusVersion?(scopeId?: string): number
  /** GA-GT1 Phase 5a: per-scope root-resolution seam for the #19/#22
   *  root-check fix (5b adds `root` to the per-scope cache entry + checks
   *  `entry.root === root` — parity with Phase 2 I-1). Optional so a schema
   *  without it degrades via `?.` (build-once, D2e behavior). */
  resolveScopeRoot?(scopeId?: string): string
}

/**
 * Structural edge shape (matches semantic-layer RelationEdge). Avoids a static
 * dep on `@deepseek-ai/dsh-semantic-layer` — same structural-typing discipline
 * as `SchemaCorpusSource`.
 */
interface RelationGraphEdge {
  readonly targetId: string
  readonly type: string
  readonly on?: string
  readonly description?: string
}

/**
 * Structural shape for the ontology relation graph. Probed via
 * `ctx.get('schema')?.getRelationGraph?.()` — avoids a static dep on
 * `@deepseek-ai/dsh-semantic-layer` (same pattern as `SchemaCorpusSource`).
 * The `SemanticLayerService.getRelationGraph()` method returns a `RelationGraph`
 * instance satisfying this interface.
 */
interface RelationGraphSource {
  findJoinPath(sourceId: string, targetId: string): string[] | null
  getJoinCondition(sourceId: string, targetId: string): string | null
  getRelated(sourceId: string, type?: string): readonly RelationGraphEdge[]
  getDerived(sourceId: string): readonly RelationGraphEdge[]
  resolveAlias?(term: string): string[]
}

/** CL-1 Phase 2: configurable alias-resolution boost factor for rank fusion. */
const ALIAS_BOOST = 2.0

/**
 * CL-1 Phase 2: always-fused hybrid — resolve query terms via the graph's
 * alias index, boost alias-matched candidates, fuse with BM25 results.
 * When the graph has no `resolveAlias` method (pre-CL-1 graph), returns
 * candidates unchanged (soft fallback).
 */
function applyAliasFusion(
  graph: RelationGraphSource | undefined,
  candidates: SearchHit[],
  query: string,
): SearchHit[] {
  if (!graph || typeof graph.resolveAlias !== 'function') return candidates
  const terms = extractQueryTerms(query)
  if (terms.length === 0) return candidates

  const aliasHits = new Map<string, number>()
  for (const term of terms) {
    const nodeIds = graph.resolveAlias(term)
    for (const id of nodeIds) {
      aliasHits.set(id, (aliasHits.get(id) ?? 0) + 1)
    }
  }
  if (aliasHits.size === 0) return candidates

  const boosted = candidates.map((c) => {
    const hitCount = aliasHits.get(c.id)
    if (hitCount === undefined) return c
    const capped = Math.min(hitCount, 2)
    return { ...c, score: c.score * ALIAS_BOOST * capped, mode: 'alias-boosted' as const }
  })

  // Alias-resolved candidates (not in BM25) get a score competitive with
  // mid-range BM25 candidates so they survive the downstream topK cap in
  // applyGraphExpansionAndJoins. Without this, alias-resolved score
  // (ALIAS_BOOST=2.0) is 15-20× below BM25 scores (30-40) in the 4692-item
  // production corpus, and graph expansion drops them at the topK slice.
  const medianBm25 = candidates.length > 0
    ? candidates[Math.floor(candidates.length / 2)]?.score ?? ALIAS_BOOST
    : ALIAS_BOOST
  const seen = new Set(boosted.map(c => c.id))
  for (const [id, hitCount] of aliasHits) {
    if (seen.has(id)) continue
    const capped = Math.min(hitCount, 2)
    boosted.push({ id, score: Math.max(ALIAS_BOOST * capped, medianBm25), mode: 'alias-resolved' })
    seen.add(id)
  }

  boosted.sort((a, b) => b.score - a.score)
  return boosted
}

/**
 * Extract meaningful terms from a query for alias resolution.
 * Splits on whitespace/punctuation, keeps tokens ≥ 2 chars.
 * For CJK continuous text, emits overlapping bigrams ("日活跃用户" → "日活",
 * "活跃", "跃用", "用户"). For mixed CJK/ASCII tokens (e.g. "氪金超过500元"),
 * segments at CJK/non-CJK boundaries and generates bigrams per CJK segment —
 * the prior version checked the whole token with a CJK-only regex, causing
 * mixed tokens to skip bigram generation entirely (39% of K11 queries hit).
 */
export function extractQueryTerms(query: string): string[] {
  const tokens = query
    .split(/[\s,，。？！?!、;；：:()（）\[\]【】{}]+/)
    .filter(t => t.length >= 2)
  const out: string[] = []
  const cjkRe = /^[一-鿿㐀-䶿぀-ゟ゠-ヿ]+$/
  for (const t of tokens) {
    if (cjkRe.test(t)) {
      out.push(t)
      if (t.length >= 3) {
        for (let i = 0; i < t.length - 1; i++) {
          out.push(t.slice(i, i + 2))
        }
      }
    } else {
      out.push(t)
      const asciiTokens = t.match(/[A-Za-z_][A-Za-z0-9_]*/g)
      if (asciiTokens) {
        for (const at of asciiTokens) {
          if (at.length >= 2) out.push(at.toLowerCase())
        }
      }
      const cjkSegs = t.match(/[一-鿿㐀-䶿぀-ゟ゠-ヿ]+/g)
      if (cjkSegs) {
        for (const seg of cjkSegs) {
          if (seg.length >= 2) out.push(seg)
          if (seg.length >= 3) {
            for (let i = 0; i < seg.length - 1; i++) {
              out.push(seg.slice(i, i + 2))
            }
          }
        }
      }
    }
  }
  return out
}

/**
 * CL-5→CL-6: continuous-blend — coverage-weighted BM25 + graph fusion that
 * introduces NEW candidates from the alias graph (unlike `applyAliasFusion`
 * which only boosts existing BM25 hits). Drop-in replacement for
 * `applyAliasFusion` when `config.blendingMode === 'continuous-blend'`.
 *
 * Scoring: final = (1 - coverage) × bm25_norm + coverage × graph_norm,
 * where coverage = fraction of query terms resolving to at least one alias.
 * At coverage=0, degrades to pure BM25; at coverage=1, degrades to pure graph.
 */
function applyContinuousBlend(
  graph: RelationGraphSource | undefined,
  candidates: SearchHit[],
  query: string,
): SearchHit[] {
  if (!graph || typeof graph.resolveAlias !== 'function') return candidates
  const terms = extractQueryTerms(query)
  if (terms.length === 0) return candidates

  let termHits = 0
  for (const term of terms) {
    if (graph.resolveAlias(term).length > 0) termHits++
  }
  const coverage = termHits / terms.length

  const graphHits = new Map<string, number>()
  for (const term of terms) {
    for (const id of graph.resolveAlias(term)) {
      graphHits.set(id, (graphHits.get(id) ?? 0) + 1)
    }
  }
  if (graphHits.size === 0) return candidates

  const maxBm25 = candidates[0]?.score ?? 1
  const maxGraph = Math.max(...graphHits.values(), 1)

  const merged = new Map<string, SearchHit>()
  for (const c of candidates) {
    const bm25Component = (1 - coverage) * (c.score / maxBm25)
    const graphComponent = coverage * ((graphHits.get(c.id) ?? 0) / maxGraph)
    merged.set(c.id, { ...c, score: bm25Component + graphComponent, mode: graphComponent > 0 ? 'blended' : c.mode })
  }

  // Graph-only candidates (not in BM25) get a floor score at the BM25 median
  // so they survive the downstream topK cap in applyGraphExpansionAndJoins.
  // Without this floor, graph-only scores (coverage × hitCount/maxGraph) are
  // always below BM25 scores when coverage < 0.5, causing alias-resolved
  // candidates to be dropped by the topK slice — effectively disabling alias
  // resolution in the 4692-item production corpus.
  const midIdx = Math.floor(candidates.length / 2)
  const medianBm25Norm = candidates.length > 0
    ? (1 - coverage) * ((candidates[midIdx]?.score ?? maxBm25) / maxBm25)
    : 0.5
  for (const [id, hitCount] of graphHits) {
    if (merged.has(id)) continue
    const graphScore = coverage * (hitCount / maxGraph)
    merged.set(id, { id, score: Math.max(graphScore, medianBm25Norm), mode: 'graph-only' })
  }

  const result = [...merged.values()]
  result.sort((a, b) => b.score - a.score)
  return result
}

/**
 * Phase 3 (D5.1): sentinel key for the active scope (scopeId omitted) in the
 * per-scope linker cache. A `symbol` is impossible to collide with any real
 * string scopeId (`Map` distinguishes by type + reference), so the active-scope
 * entry can never shadow or be shadowed by a named scope.
 */
const ACTIVE_SENTINEL = Symbol('active-scope')

/**
 * D2e + D2f + D5.1 + GA-GT1 Phase 5b: per-scope + version-keyed cache of
 * enriched `Bm25Linker`s. The outer `WeakMap` keys by schema instance (GC'd
 * when unmounted); the inner `Map` keys by scopeId (active scope uses
 * `ACTIVE_SENTINEL`). Each entry pairs the linker with the
 * `corpusVersion(scopeId)` it was built at AND the `resolveScopeRoot(scopeId)`
 * it was built under; a mismatch on EITHER (a write bumped the counter for
 * that scope, OR the scope was re-registered onto a different root) drops the
 * entry and rebuilds from the fresh corpus — one rebuild per write burst,
 * not per write, one scope's rebuild does not evict another's cached linker,
 * AND a re-registration onto a different never-written root no longer leaks
 * the OLD root's linker across tenants (#19, parity with Phase 2 I-1
 * `graphCacheByScope`). Phase 3 ships the per-scope keying as dormant
 * capacity (execute does not yet pass scopeId — that is Phase 4/5); the
 * corpusVersion check is live now on the active path. Phase 5b adds the root
 * field + check + wires `exec.scopeId` through execute (5b: dormant — prod
 * callers do not set AgentOptions.scopeId yet; 5d eval/CLI will).
 */
const enrichedLinkers = new WeakMap<
  SchemaCorpusSource,
  Map<string | symbol, { linker: Bm25Linker; version: number; root: string | undefined }>
>()

/**
 * Get (or build+cache) the enriched `Bm25Linker` for a schema instance + scope,
 * rebuilding when the schema's corpus-version signal advances OR the scope's
 * root changes (D2f/D5.1 + GA-GT1 Phase 5b cache-invalidation). `scopeId` is
 * optional (undefined → active scope). GA-GT1 Phase 5b wires `exec.scopeId`
 * through to here (dormant until 5d — prod callers do not set
 * `AgentOptions.scopeId` yet; `exec.scopeId` undefined → `ACTIVE_SENTINEL` →
 * the active path, unchanged).
 *
 * GA-GT1 Phase 5b (#19): the root check closes the re-registration
 * cross-tenant leak. `resolveScopeRoot?.(scopeId)` is `undefined` when the
 * schema has no `resolveScopeRoot` (mock / pre-5a schema) → `root=undefined`
 * → `entry.root === root` is `undefined===undefined` → true → degrades to
 * version-only (the pre-5b contract, preserved). A real
 * `SemanticLayerService` exposes `resolveScopeRoot` → `root` is a real path
 * → the check activates, so a scope re-registered onto a different,
 * never-written root (version 0===0) MISSES + rebuilds from the new root's
 * corpus instead of serving the OLD root's linker (parity with Phase 2 I-1
 * `graphCacheByScope`).
 *
 * @param schema - the `ctx.schema` source whose `loadRetrievalCorpus(scopeId?)` feeds the corpus.
 * @param scopeId - optional tenant/scope id; undefined falls back to the active scope.
 * @returns a `Bm25Linker` over the schema's enriched corpus for that scope, rebuilt when stale.
 */
export function getEnrichedLinker(schema: SchemaCorpusSource, scopeId?: string): Bm25Linker {
  const key = scopeId ?? ACTIVE_SENTINEL
  let byScope = enrichedLinkers.get(schema)
  if (byScope === undefined) {
    byScope = new Map()
    enrichedLinkers.set(schema, byScope)
  }
  const version = schema.corpusVersion?.(scopeId) ?? 0
  // GA-GT1 Phase 5b (#19): resolve the scope's root via the 5a seam + check
  // it on hit. `resolveScopeRoot?.()` is `undefined` when the schema has no
  // resolveScopeRoot (mock / pre-5a schema) → root=undefined → entry.root
  // (undefined) === root (undefined) → degrades to version-only (现状). A
  // real SemanticLayerService exposes resolveScopeRoot → root is a real path
  // → the check activates, closing the re-registration cross-tenant leak
  // (parity with Phase 2 I-1 graphCacheByScope).
  const root = schema.resolveScopeRoot?.(scopeId)
  const entry = byScope.get(key)
  if (entry !== undefined && entry.version === version && entry.root === root) {
    return entry.linker
  }
  const corpus = schema.loadRetrievalCorpusAll?.(scopeId) ?? schema.loadRetrievalCorpus(scopeId)
  const linker = new Bm25Linker(corpus)
  byScope.set(key, { linker, version, root })
  return linker
}

/**
 * Probe `ctx.get('schema')` for a `getRelationGraph` method and return the
 * graph if available. Structural probe — no static dep on semantic-layer.
 * Returns `undefined` when the schema is unmounted or doesn't expose a graph.
 *
 * GA-GT1 Phase 5c: threads `scopeId` through to
 * `getRelationGraph(scopeId)` (the Phase 2 per-scope graph path). The
 * structural cast declares `scopeId?: string` to match the real
 * `SemanticLayerService.getRelationGraph(scopeId?)` signature; `undefined`
 * → active scope (现状, preserved). Dormant until 5d — prod callers do not
 * set `AgentOptions.scopeId` yet, so `exec.scopeId` is `undefined` here.
 *
 * @param ctx - the Cordis context (probed for `ctx.schema.getRelationGraph`).
 * @param scopeId - optional tenant/scope id; undefined falls back to the active scope.
 */
function probeRelationGraph(ctx: Context, scopeId?: string): RelationGraphSource | undefined {
  const schemaProbe = ctx.get('schema') as { getRelationGraph?: unknown } | undefined
  if (schemaProbe === undefined || typeof schemaProbe.getRelationGraph !== 'function') {
    return undefined
  }
  return (schemaProbe as { getRelationGraph(scopeId?: string): RelationGraphSource }).getRelationGraph(scopeId)
}

/**
 * Graph-expanded recall + join constraint extraction. After BM25 hits, expands
 * via 1-hop `joins` + `derived_from` neighbors (same logic as
 * `expandCandidates` in ontology.ts), then builds join constraint strings for
 * every candidate pair the graph connects.
 *
 * When the relation graph is unavailable (schema unmounted / no
 * `getRelationGraph`), returns the original candidates unchanged with no join
 * constraints (soft fallback).
 *
 * @param ctx - the Cordis context (probed for `ctx.schema.getRelationGraph(scopeId)`).
 * @param candidates - the BM25 search hits.
 * @param topK - max candidates to return after expansion.
 * @param scopeId - optional tenant/scope id forwarded to `getRelationGraph`
 *  (Phase 5c); `undefined` → active scope graph (现状, preserved).
 * @returns expanded candidates + join constraint strings.
 */
function applyGraphExpansionAndJoins(
  ctx: Context,
  candidates: SearchHit[],
  topK: number,
  scopeId?: string,
): { candidates: SearchHit[]; join_constraints: string[] } {
  const graph = probeRelationGraph(ctx, scopeId)
  if (graph === undefined) {
    return { candidates, join_constraints: [] }
  }

  // Graph-expanded recall: for each BM25 hit, add 1-hop `joins` + `derived_from`
  // neighbors not already in hits, with score = original hit's score * 0.5,
  // mode = 'graph-expand'. Cap total at topK.
  const seen = new Set(candidates.map(c => c.id))
  const expanded: SearchHit[] = [...candidates]
  for (const hit of candidates) {
    if (expanded.length >= topK) break
    for (const edge of graph.getRelated(hit.id, 'joins')) {
      if (seen.has(edge.targetId)) continue
      if (expanded.length >= topK) break
      seen.add(edge.targetId)
      expanded.push({ id: edge.targetId, score: hit.score * 0.5, mode: 'graph-expand' })
    }
    for (const edge of graph.getDerived(hit.id)) {
      if (seen.has(edge.targetId)) continue
      if (expanded.length >= topK) break
      seen.add(edge.targetId)
      expanded.push({ id: edge.targetId, score: hit.score * 0.5, mode: 'graph-expand' })
    }
  }
  const finalCandidates = expanded.slice(0, topK)

  // Build join constraints: for each pair of final candidates where the graph
  // has a join path, extract the join condition string chain.
  const joinConstraints: string[] = []
  const ids = finalCandidates.map(c => c.id)
  for (let i = 0; i < ids.length; i++) {
    const a = ids[i]
    if (a === undefined) continue
    for (let j = i + 1; j < ids.length; j++) {
      const b = ids[j]
      if (b === undefined) continue
      const path = graph.findJoinPath(a, b)
      if (path === null || path.length < 2) continue
      const segs: string[] = []
      for (let k = 0; k < path.length - 1; k++) {
        const src = path[k]
        const dst = path[k + 1]
        if (src === undefined || dst === undefined) continue
        const on = graph.getJoinCondition(src, dst)
        if (on) segs.push(`${src} JOIN ${dst} ON ${on}`)
      }
      if (segs.length > 0) joinConstraints.push(segs.join(' ⟶ '))
    }
  }

  return { candidates: finalCandidates, join_constraints: joinConstraints }
}

export function apply(ctx: Context, config: Config = {}): void {
  const defaultTopK = config.topK ?? 20
  const expansionEnabled = config.queryExpansion !== false
  const expansionProvider = config.expansionProvider
  const expansionModel = config.expansionModel
  const blend = (config.blendingMode ?? 'continuous-blend') === 'continuous-blend'
    ? applyContinuousBlend
    : applyAliasFusion
  // Q1 thin default: empty corpus until P6b `ctx.schema` ships. With no
  // corpus, BM25 returns no candidates - callable but unwired, not a broken
  // mount. Swap to ctx.schema.discover when P6b ships.
  const linker: RetrievalLinker = new Bm25Linker([])

  ctx.tools.register(defineTool({
    name: 'search_data_sources',
    description:
      'Find the data sources (DWS tables / event ODS tables) relevant to a '
      + 'natural-language question, via BM25 schema-linking over the semantic '
      + 'layer. Call this in the UNDERSTANDING phase to learn which tables and '
      + 'events can answer the question before writing SQL. Returns ranked '
      + 'candidate data sources with id, score, and description.',
    parameters: {
      query: {
        type: 'string',
        required: true,
        description: 'The natural-language data question to link against the data-source corpus.',
      },
      top_k: {
        type: 'number',
        description: 'Maximum number of candidate data sources to return. Defaults to 20.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          candidates: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                score: { type: 'number', required: true },
                description: { type: 'string' },
                mode: { type: 'string', required: true },
                type: { type: 'string' },
                project: { type: 'string' },
              },
            },
          },
          join_constraints: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
      render: (_args, value) => {
        const lines: string[] = []
        if (value.candidates.length === 0) {
          lines.push('No matching data sources found.')
        } else {
          lines.push(
            ...value.candidates.map((c, i) =>
              `${i + 1}. ${c.id} (score ${c.score.toFixed(3)})`
              + (c.type !== undefined ? ` [${c.type}]` : '')
              + (c.description !== undefined ? ` - ${c.description}` : '')
              + (c.mode === 'graph-expand' ? ' [graph-expand]' : '')),
          )
        }
        if (value.join_constraints !== undefined && value.join_constraints.length > 0) {
          lines.push('')
          lines.push('Join constraints:')
          for (const jc of value.join_constraints) {
            lines.push(`  • ${jc}`)
          }
        }
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args, exec) {
      if (exec.signal.aborted) {
        throw new Error('search_data_sources aborted before linking')
      }
      const topK = args.top_k ?? defaultTopK
      // P15a: LLM query expansion — rewrite the query for better BM25 recall.
      // Soft-probe ctx.llm (same discipline as schema/retrieval): skip when no
      // LLM provider is mounted or when expansion is disabled via config.
      // CL8: expandQuery throws when provider/model are unconfigured (opts →
      // env); degrade to the original question + warn so BM25 linking proceeds
      // while the misconfig is surfaced loudly (no silent vendor fallback).
      let query = args.query
      if (expansionEnabled) {
        try {
          query = await expandQuery(ctx, args.query, { provider: expansionProvider, model: expansionModel, signal: exec.signal })
        } catch (e) {
          if (e instanceof Error && e.message.includes('enrichment-llm-wiring')) {
            console.warn('enrichment-llm-wiring: no provider/model configured; skipping query expansion')
            query = args.query
          } else {
            throw e
          }
        }
      }
      // P5b soft-fallback swap: when the `ctx.retrieval` seam is registered
      // (opt-in; the bundle mounts `dsh-retrieval-inproc`), use the real async
      // hybrid provider; otherwise the sync local `Bm25Linker` (Q1 thin
      // default). `ctx.get('retrieval')` is the safe probe — it returns
      // `undefined` when no provider is registered (a direct `ctx.retrieval`
      // access would throw). `inject` stays `['tools']` (NOT `'retrieval'`) so
      // the tool loads without a retrieval provider; P13b 9/9 + this tool's
      // 7/7 stay green (tests register no retrieval -> `get` returns undefined
      // -> the sync Bm25Linker path). Seam contract + P13b engine logic
      // unchanged.
      // C: qualifyCandidates now probes ctx.query (engine-agnostic) for
      // qualifyTable, so the schema probe here is only for the D2e enriched
      // corpus path below (no longer "for qualify").
      const schema = ctx.get('schema') as SchemaCorpusSource | undefined
      const retrieval = ctx.get('retrieval')
      const graph = probeRelationGraph(ctx, exec.scopeId)
      if (retrieval !== undefined) {
        const hits = await retrieval.retrieve(query, { topK, mode: 'hybrid' })
        const candidates = blend(graph, hits.map(projectHit), args.query)
        const { candidates: expanded, join_constraints } = applyGraphExpansionAndJoins(ctx, candidates, topK, exec.scopeId)
        return { candidates: qualifyCandidates(ctx, expanded), ...(join_constraints.length > 0 ? { join_constraints } : {}) }
      }
      // D2e: schema-sourced enriched corpus (dormant until ctx.schema mounts).
      // When the semantic-layer provider is mounted, build/cache an enriched
      // Bm25Linker (events' params_fields + terminology slang packed into the
      // indexed description; NOT domain — probe refuted domain) and use it;
      // otherwise the empty Q1 thin default (callable but unwired). Like the
      // retrieval soft-fallback, `inject` stays `['tools']` (NOT `'schema'`)
      // so the tool loads without a schema provider; `ctx.get` returns
      // `undefined` when none is registered. The defensive `typeof` probe
      // guards a non-schema object resolving to the 'schema' name.
      if (schema !== undefined && typeof schema.loadRetrievalCorpus === 'function') {
        // GA-GT1 Phase 5b: thread `exec.scopeId` through to getEnrichedLinker
        // (dormant until 5d — prod callers do not set AgentOptions.scopeId yet
        // → exec.scopeId is undefined → ACTIVE_SENTINEL → active path, 現状;
        // 5d eval/CLI config scopeId activates per-scope isolation). The 5b
        // root-check makes this safe: a scope re-registered onto a different
        // root no longer leaks the OLD root's linker across tenants (#19).
        const candidates = blend(graph, searchDataSources(getEnrichedLinker(schema, exec.scopeId), query, topK), args.query)
        const { candidates: expanded, join_constraints } = applyGraphExpansionAndJoins(ctx, candidates, topK, exec.scopeId)
        return { candidates: qualifyCandidates(ctx, expanded), ...(join_constraints.length > 0 ? { join_constraints } : {}) }
      }
      const candidates = blend(graph, searchDataSources(linker, query, topK), args.query)
      const { candidates: expanded, join_constraints } = applyGraphExpansionAndJoins(ctx, candidates, topK, exec.scopeId)
      return { candidates: qualifyCandidates(ctx, expanded), ...(join_constraints.length > 0 ? { join_constraints } : {}) }
    },
  }))
}
