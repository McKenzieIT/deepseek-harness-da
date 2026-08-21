/**
 * Model-facing `retrieve` tool — the on-demand retrieval escape-hatch for the
 * data agent. The pipeline prefetches data-source candidates in the
 * UNDERSTANDING phase (`search_data_sources`); `retrieve` is the additive
 * escape-hatch the agent calls when it detects the prefetch missed (ambiguous
 * NL, a business synonym the prefetch did not bridge). Per the
 * retrieval-consumer-model prescription — (c) guided-agentic-hybrid: (a) the
 * deterministic prefetch is the default path, (b) `retrieve` is the additive
 * escape-hatch plugin, NOT a parallel default. The persona (P7b) teaches
 * "prefer the prefetched context; call retrieve only when the gap is obvious"
 * to avoid double-retrieval redundancy (the agent re-fetching what the pipeline
 * already surfaced).
 *
 * D2c-impl ships the tool ADDITIVE + DORMANT (mirrors D2e's dormant-until-mount
 * + P5b's opt-in seam): the package registers `retrieve` via `defineTool` +
 * `ctx.tools.register` when a preset mounts it; default boot does NOT mount it
 * (pipeline-only current state, no regression). Activation — uncomment the
 * preset row + add `retrieve` to the phase-gate whitelist + land the persona
 * that teaches when to call it — is the P7b / follow-up gate. Shipping is
 * additive/reversible: unmount / unship if D2c-revisit regresses (the D2c
 * asymmetric argument — keep is cheap + reversible; regress needs ≥85-90%
 * strict + <15% ambiguity that only a real embedder can reach).
 *
 * Internally `retrieve` uses the SAME soft-fallback chain as
 * `search_data_sources` (D2e): `ctx.get('retrieval')` (P5b seam, async hybrid
 * when a user mounts a real embedder) → else `ctx.get('schema')` (D2e enriched
 * Bm25Linker, params_fields + terminology slang packed into `description`) →
 * else the empty Q1-thin `Bm25Linker` (callable but unwired). It does NOT
 * mount FakeHash (D2d: FakeHash hybrid strictly < BM25-only; mounting it
 * regresses prefetch 41.9%→32.3%, self-inflicted) and does NOT default a
 * FakeReranker (D2d F2: harmful on implicit cases, 64%<84%); the reranker peer
 * stays injectable for a real cross-encoder a user self-deploys. The hybrid
 * plane stays for a real embedder (D2c-revisit).
 *
 * Grounded by P13b `search_data_sources` (the first model-facing tool — the
 * `defineTool` + `ctx.tools.register` registration shape) + D2e (the schema
 * soft-fallback + cached enriched `Bm25Linker`). The retrieve-tool's recall ==
 * `search_data_sources`'s recall (same linker, same corpus); the D2e-measured
 * floor (54.8% strict / 58.1% loose once `ctx.schema` mounts the enriched
 * corpus) applies — no new measurement is needed here.
 *
 * @module @deepseek-ai/dsh-tool-retrieve
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { Bm25Linker, type RetrievalLinker, type RetrievalHit, type DataSourceDoc } from '@deepseek-ai/dsh-nl2sql-engine/src/bm25-linking.ts'
import { type RetrievalService } from '@deepseek-ai/dsh-retrieval/src/index.ts'

export const name = 'tool-retrieve'
export const inject = ['tools']

/** Configuration for the retrieve tool. */
export interface Config {
  /** Default candidate count when the call omits `top_k` (parity with search_data_sources). */
  readonly topK?: number
}

/** Runtime configuration schema for the retrieve tool. */
export const Config: z<Config> = z.object({
  topK: z.number().default(5),
})

/** A ranked candidate returned to the model (mirrors search_data_sources' SearchHit). */
export interface RetrieveHit {
  readonly id: string
  readonly score: number
  readonly description?: string
  readonly mode: string
}

/**
 * Project BM25 retrieval hits to the model-facing candidate shape (drops the
 * opaque `payload`). Exported so the projection + BM25 linking are testable
 * without a Cordis context. `Bm25Linker` is the Q1-thin default; swapped to
 * `ctx.retrieval` when P5b ships (contract unchanged). Mirrors
 * search_data_sources' `searchDataSources`.
 *
 * @param linker The BM25/retrieval linker whose corpus is searched.
 * @param query The natural-language query to retrieve data-source context for.
 * @param topK Maximum number of candidate data sources to return.
 * @returns Ranked candidate data sources projected to the model-facing shape.
 */
export function retrieve(
  linker: RetrievalLinker,
  query: string,
  topK: number,
): RetrieveHit[] {
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
 * `ctx.retrieval` async path + the sync `retrieve` projection so the two swap
 * paths produce identical candidate shapes. Mirrors search_data_sources.
 */
function projectHit(h: { readonly id: string; readonly score: number; readonly payload: unknown; readonly mode: string }): RetrieveHit {
  const description = (h.payload as { description?: string } | undefined)?.description
  return {
    id: h.id,
    score: h.score,
    ...(description !== undefined ? { description } : {}),
    mode: h.mode,
  }
}

/**
 * Minimal structural shape `retrieve` probes for the D2e enriched corpus
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
 * per `ctx.schema` (lazy on first execute) so the corpus is tokenized once, not
 * per query. `WeakMap` so a replaced/unmounted schema is GC'd (mirrors the
 * lazy-build intent without holding a stale provider).
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
  // Q1-thin default: empty corpus until `ctx.schema` mounts. With no corpus,
  // BM25 returns no candidates — callable but unwired, not a broken mount
  // (mirrors search_data_sources).
  const linker: RetrievalLinker = new Bm25Linker([])

  ctx.tools.register(defineTool({
    name: 'retrieve',
    description:
      'Retrieve relevant data-source context on demand — the escape-hatch for '
      + 'when the prefetched UNDERSTANDING context has a visible gap (an '
      + 'ambiguous question, or a business synonym the prefetch did not '
      + 'bridge). Prefer the context already surfaced by search_data_sources; '
      + 'call this only when the gap is obvious, with a refined query. Returns '
      + 'ranked candidate data sources with id, score, and description.',
    parameters: {
      query: {
        type: 'string',
        required: true,
        description: 'The natural-language query to retrieve data-source context for. Refine the prefetch query when it missed (a synonym, a more specific phrasing).',
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
        throw new Error('retrieve aborted before linking')
      }
      const topK = args.top_k ?? defaultTopK
      // P5b soft-fallback swap (mirrors search_data_sources): when the
      // `ctx.retrieval` seam is registered (opt-in; the bundle mounts
      // `dsh-retrieval-inproc` + a real embedder), use the real async hybrid
      // provider; otherwise the sync local `Bm25Linker` (Q1-thin default).
      // `ctx.get('retrieval')` is the safe probe — it returns `undefined` when
      // no provider is registered (a direct `ctx.retrieval` access would
      // throw). `inject` stays `['tools']` (NOT `'retrieval'`) so the tool
      // loads without a retrieval provider. D2d: do NOT mount FakeHash here —
      // the soft-fallback keeps the default on BM25-only (~41.9% real default;
      // FakeHash hybrid would regress to 32.3%). The hybrid plane waits for a
      // real embedder (D2c-revisit). Reranker peer is NOT defaulted (D2d F2:
      // FakeReranker harms implicit cases); it stays injectable for a real
      // cross-encoder a user self-deploys.
      const retrieval = ctx.get('retrieval') as RetrievalService | undefined
      if (retrieval !== undefined) {
        const hits = await retrieval.retrieve(args.query, { topK, mode: 'hybrid' })
        return { candidates: hits.map(projectHit) }
      }
      // D2e: schema-sourced enriched corpus (dormant until ctx.schema mounts).
      // When the semantic-layer provider is mounted, build/cache an enriched
      // Bm25Linker (params_fields + terminology slang packed into the indexed
      // description; NOT domain — probe refuted domain) and use it; otherwise
      // the empty Q1-thin default (callable but unwired). Like the retrieval
      // soft-fallback, `inject` stays `['tools']` (NOT `'schema'`) so the tool
      // loads without a schema provider; `ctx.get` returns `undefined` when none
      // is registered. The defensive `typeof` probe guards a non-schema object
      // resolving to the 'schema' name.
      const schemaProbe = ctx.get('schema') as { loadRetrievalCorpus?: unknown } | undefined
      if (schemaProbe !== undefined && typeof schemaProbe.loadRetrievalCorpus === 'function') {
        const schema = schemaProbe as SchemaCorpusSource
        return { candidates: retrieve(getEnrichedLinker(schema), args.query, topK) }
      }
      return { candidates: retrieve(linker, args.query, topK) }
    },
  }))
}
