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
import { type RetrievalService } from '@deepseek-ai/dsh-retrieval/src/index.ts'

export const name = 'tool-search-data-sources'
export const inject = ['tools']

/** Configuration for the search_data_sources tool. */
export interface Config {
  /** Default candidate count when the call omits `top_k` (D2h: raised 5→20 —
   * topK=20 helps all corpus variants per the D2g 113-gold sweep: base
   * 62.8→77.9, term-only 77.0→85.0, params+term 68.1→81.4 strict). */
  readonly topK?: number
}

/** Runtime configuration schema for the search_data_sources plugin. */
export const Config: z<Config> = z.object({
  topK: z.number().default(20),
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
}

/** Infer the data-source kind from a corpus item's payload. */
function typeOf(payload: unknown): string {
  const k = (payload as { kind?: string } | undefined)?.kind
  if (k === 'metric') return 'metric'
  if (k === 'dws' || k === 'dim') return 'table'
  const e = payload as { params_fields?: unknown; external_refs?: unknown; event_filter?: unknown } | undefined
  if (e?.params_fields !== undefined || e?.external_refs !== undefined || e?.event_filter !== undefined) return 'event'
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
  return hits.map(h => ({
    id: h.id,
    score: h.score,
    ...(h.payload?.description !== undefined ? { description: h.payload.description } : {}),
    mode: h.mode,
  }))
}

/**
 * Project a retrieval hit with an opaque payload (`unknown` at the
 * `ctx.retrieval` seam) to the model-facing candidate shape. Shared by the
 * `ctx.retrieval` async path + the sync `searchDataSources` projection so the
 * two swap paths produce identical candidate shapes.
 */
function projectHit(h: { readonly id: string; readonly score: number; readonly payload: unknown; readonly mode: string }): SearchHit {
  const description = (h.payload as { description?: string } | undefined)?.description
  return {
    id: h.id,
    score: h.score,
    ...(description !== undefined ? { description } : {}),
    mode: h.mode,
    type: typeOf(h.payload),
  }
}

function qualifyCandidates(ctx: Context, candidates: SearchHit[]): SearchHit[] {
  // C: probe ctx.query (engine-agnostic) for qualifyTable — supersedes the
  // SchemaCorpusSource.qualifyTableName path (which misread config.yaml
  // project.name = game scope id, NOT an ODPS project → DAU qualified
  // game_10000251.dws_... which ODPS could not find). Soft probe like
  // ctx.get('schema'): returns undefined when no query provider is
  // registered, so candidates stay bare (callable but unwired, no crash).
  const q = ctx.get('query') as { qualifyTable?: (tableName: string, override?: string) => string } | undefined
  const qualify = q?.qualifyTable
  if (qualify === undefined) return candidates
  // Qualify only table-kind candidates (metric/event ids are not ODPS tables;
  // `mode` is the retrieval mode, not the data-source kind, so the prior
  // `c.mode === 'event'` check never matched — every candidate was qualified,
  // and qualifyTableName silently no-op'd non-tables).
  // Task 1: pass undefined as override — SearchHit.project lands in Task 3;
  // qualifyTable falls back to Config.defaultProject (ieu_cdm).
  return candidates.map(c => c.type === 'table' ? { ...c, id: qualify(c.id) } : c)
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
  loadRetrievalCorpus(): readonly DataSourceDoc[]
  /** P3/P4: full corpus (events+tables+metrics); preferred over events-only when present. */
  loadRetrievalCorpusAll?(): readonly DataSourceDoc[]
  corpusVersion?(): number
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
}

/**
 * D2e + D2f: cache of enriched `Bm25Linker`s keyed by schema instance — built
 * once per `ctx.schema` (lazy on first execute) so the 1966-event corpus is
 * tokenized once, not per query. `WeakMap` so a replaced/unmounted schema is
 * GC'd. D2f pairs each linker with the `corpusVersion()` it was built at; a
 * mismatch (a write bumped the counter) drops the entry and rebuilds from the
 * fresh corpus — one rebuild per write burst, not per write.
 */
const enrichedLinkers = new WeakMap<SchemaCorpusSource, { linker: Bm25Linker; version: number }>()

/**
 * Get (or build+cache) the enriched `Bm25Linker` for a schema instance, rebuilding
 * when the schema's corpus-version signal advances (D2f cache-invalidation).
 * @param schema - the `ctx.schema` source whose `loadRetrievalCorpus()` feeds the corpus.
 * @returns a `Bm25Linker` over the schema's enriched corpus, rebuilt when stale.
 */
function getEnrichedLinker(schema: SchemaCorpusSource): Bm25Linker {
  const version = schema.corpusVersion?.() ?? 0
  let entry = enrichedLinkers.get(schema)
  if (entry === undefined || entry.version !== version) {
    const corpus = schema.loadRetrievalCorpusAll?.() ?? schema.loadRetrievalCorpus()
    entry = { linker: new Bm25Linker(corpus), version }
    enrichedLinkers.set(schema, entry)
  }
  return entry.linker
}

/**
 * Probe `ctx.get('schema')` for a `getRelationGraph` method and return the
 * graph if available. Structural probe — no static dep on semantic-layer.
 * Returns `undefined` when the schema is unmounted or doesn't expose a graph.
 */
function probeRelationGraph(ctx: Context): RelationGraphSource | undefined {
  const schemaProbe = ctx.get('schema') as { getRelationGraph?: unknown } | undefined
  if (schemaProbe === undefined || typeof schemaProbe.getRelationGraph !== 'function') {
    return undefined
  }
  return (schemaProbe as { getRelationGraph(): RelationGraphSource }).getRelationGraph()
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
 * @param ctx - the Cordis context (probed for `ctx.schema.getRelationGraph()`).
 * @param candidates - the BM25 search hits.
 * @param topK - max candidates to return after expansion.
 * @returns expanded candidates + join constraint strings.
 */
function applyGraphExpansionAndJoins(
  ctx: Context,
  candidates: SearchHit[],
  topK: number,
): { candidates: SearchHit[]; join_constraints: string[] } {
  const graph = probeRelationGraph(ctx)
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
      const retrieval = ctx.get('retrieval') as RetrievalService | undefined
      if (retrieval !== undefined) {
        const hits = await retrieval.retrieve(args.query, { topK, mode: 'hybrid' })
        const candidates = hits.map(projectHit)
        const { candidates: expanded, join_constraints } = applyGraphExpansionAndJoins(ctx, candidates, topK)
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
        const candidates = searchDataSources(getEnrichedLinker(schema), args.query, topK)
        const { candidates: expanded, join_constraints } = applyGraphExpansionAndJoins(ctx, candidates, topK)
        return { candidates: qualifyCandidates(ctx, expanded), ...(join_constraints.length > 0 ? { join_constraints } : {}) }
      }
      const candidates = searchDataSources(linker, args.query, topK)
      const { candidates: expanded, join_constraints } = applyGraphExpansionAndJoins(ctx, candidates, topK)
      return { candidates: qualifyCandidates(ctx, expanded), ...(join_constraints.length > 0 ? { join_constraints } : {}) }
    },
  }))
}
