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
  /** Default candidate count when the call omits `top_k` (P13b engine default 5). */
  readonly topK?: number
}

/** Runtime configuration schema for the search_data_sources plugin. */
export const Config: z<Config> = z.object({
  topK: z.number().default(5),
})

/** A ranked candidate data source returned to the model. */
export interface SearchHit {
  readonly id: string
  readonly score: number
  readonly description?: string
  readonly mode: string
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
  }
}

/**
 * Minimal structural shape tool-search probes for the D2e enriched corpus
 * (`ctx.schema` when the semantic-layer provider is mounted). Avoids a static
 * dep on `@deepseek-ai/dsh-semantic-layer`: `ctx.get('schema')` returns the
 * `SemanticLayerService` when mounted, `undefined` when not (bundle opt-in).
 * The returned corpus items are `DataSourceDoc`-shaped (params_fields +
 * terminology slang packed into `description`; NOT domain — see D2e).
 */
interface SchemaCorpusSource {
  loadRetrievalCorpus(): readonly DataSourceDoc[]
}

/**
 * D2e: cache of enriched `Bm25Linker`s keyed by schema instance — built once
 * per `ctx.schema` (lazy on first execute) so the 1966-event corpus is tokenized
 * once, not per query. `WeakMap` so a replaced/unmounted schema is GC'd
 * (mirrors the lazy-build intent without holding a stale provider).
 */
const enrichedLinkers = new WeakMap<SchemaCorpusSource, Bm25Linker>()

/**
 * Get (or build+cache) the enriched `Bm25Linker` for a schema instance.
 * @param schema - the `ctx.schema` source whose `loadRetrievalCorpus()` feeds the corpus.
 * @returns a cached `Bm25Linker` over the schema's enriched corpus.
 */
function getEnrichedLinker(schema: SchemaCorpusSource): Bm25Linker {
  let linker = enrichedLinkers.get(schema)
  if (linker === undefined) {
    linker = new Bm25Linker(schema.loadRetrievalCorpus())
    enrichedLinkers.set(schema, linker)
  }
  return linker
}

export function apply(ctx: Context, config: Config = {}): void {
  const defaultTopK = config.topK ?? 5
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
        description: 'Maximum number of candidate data sources to return. Defaults to 5.',
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
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.candidates.length === 0
          ? 'No matching data sources found.'
          : value.candidates
            .map((c, i) => `${i + 1}. ${c.id} (score ${c.score.toFixed(3)})`
              + (c.description !== undefined ? ` - ${c.description}` : ''))
            .join('\n'),
      }],
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
      const retrieval = ctx.get('retrieval') as RetrievalService | undefined
      if (retrieval !== undefined) {
        const hits = await retrieval.retrieve(args.query, { topK, mode: 'hybrid' })
        return { candidates: hits.map(projectHit) }
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
      const schemaProbe = ctx.get('schema') as { loadRetrievalCorpus?: unknown } | undefined
      if (schemaProbe !== undefined && typeof schemaProbe.loadRetrievalCorpus === 'function') {
        const schema = schemaProbe as SchemaCorpusSource
        return { candidates: searchDataSources(getEnrichedLinker(schema), args.query, topK) }
      }
      return { candidates: searchDataSources(linker, args.query, topK) }
    },
  }))
}
