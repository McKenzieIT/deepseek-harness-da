/**
 * Model-facing `search_schema` tool — BM25 search over the semantic layer for
 * the management agent. Returns asset matches with kind and domain metadata,
 * letting the agent discover which tables/events/metrics are relevant to a
 * management question.
 *
 * Simpler than `search_data_sources` (no graph expansion, no join constraints)
 * — the management agent searches to browse/edit, not to write SQL.
 *
 * @module @deepseek-ai/dsh-tool-search-schema
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools'
import { Bm25Linker, type DataSourceDoc } from '@deepseek-ai/dsh-nl2sql-engine/src/bm25-linking.ts'

export const name = 'tool-search-schema'
export const inject = ['tools']

export interface Config {
  readonly topK?: number
}

export const Config: z<Config> = z.object({
  topK: z.number().default(20),
})

interface SchemaCorpusSource {
  loadRetrievalCorpusAll?(): readonly DataSourceDoc[]
  loadRetrievalCorpus(): readonly DataSourceDoc[]
  corpusVersion?(): number
}

export interface SearchSchemaResult {
  readonly ok: boolean
  readonly hits?: SearchSchemaHit[]
  readonly message?: string
}

export interface SearchSchemaHit {
  readonly id: string
  readonly score: number
  readonly kind?: string
  readonly domains?: string[]
  readonly description?: string
}

const linkerCache = new WeakMap<SchemaCorpusSource, { linker: Bm25Linker; version: number }>()

function getCachedLinker(schema: SchemaCorpusSource): Bm25Linker {
  const version = schema.corpusVersion?.() ?? 0
  let entry = linkerCache.get(schema)
  if (entry === undefined || entry.version !== version) {
    const corpus = schema.loadRetrievalCorpusAll?.() ?? schema.loadRetrievalCorpus()
    entry = { linker: new Bm25Linker(corpus), version }
    linkerCache.set(schema, entry)
  }
  return entry.linker
}

export function searchSchema(
  schema: SchemaCorpusSource | undefined,
  query: string,
  topK: number,
): SearchSchemaResult {
  if (schema === undefined) {
    return { ok: false, message: 'semantic-layer not mounted (ctx.schema unavailable)' }
  }
  const linker = getCachedLinker(schema)
  const hits = linker.retrieve(query, { topK, mode: 'bm25-only' })
  return {
    ok: true,
    hits: hits.map(h => {
      const p = h.payload as unknown as { kind?: string; domains?: string[]; description?: string } | undefined
      const hit: SearchSchemaHit = {
        id: h.id,
        score: h.score,
        ...(p?.kind !== undefined ? { kind: p.kind } : {}),
        ...(p?.domains !== undefined ? { domains: p.domains } : {}),
        ...(p?.description !== undefined ? { description: p.description } : {}),
      }
      return hit
    }),
  }
}

export function formatSearchSchema(value: SearchSchemaResult): string {
  if (!value.ok) return value.message ?? 'search_schema failed'
  const hits = value.hits ?? []
  if (hits.length === 0) return 'No matching assets found.'
  return hits.map((h, i) =>
    `${i + 1}. ${h.id} (score ${h.score.toFixed(3)})`
    + (h.kind !== undefined ? ` [${h.kind}]` : '')
    + (h.domains !== undefined && h.domains.length > 0 ? ` {${h.domains.join(', ')}}` : '')
    + (h.description !== undefined ? ` — ${h.description}` : ''),
  ).join('\n')
}

export function apply(ctx: Context, config: Config = {}): void {
  const defaultTopK = config.topK ?? 20

  ctx.tools.register(defineTool({
    name: 'search_schema',
    description:
      'Search the semantic layer for data assets (tables, events, metrics) '
      + 'matching a natural-language query. Returns ranked results with kind '
      + 'and domain metadata. Use this to discover what assets exist before '
      + 'inspecting them with get_definition.',
    parameters: {
      query: {
        type: 'string',
        required: true,
        description: 'Natural-language search query describing the assets to find.',
      },
      top_k: {
        type: 'number',
        description: 'Maximum number of results to return. Defaults to 20.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          hits: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                score: { type: 'number', required: true },
                kind: { type: 'string' },
                domains: { type: 'array', items: { type: 'string' } },
                description: { type: 'string' },
              },
            },
          },
          message: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatSearchSchema(value) }],
      presentationMeta: (_args, value) => ({
        hits: (value.hits ?? []).map(h => ({
          id: h.id,
          kind: h.kind,
          domains: h.domains,
          description: h.description,
        })),
        ok: value.ok,
        message: value.message,
      }),
    },
    async execute(args, exec) {
      if (exec.signal.aborted) throw new Error('search_schema aborted')
      const schema = ctx.get('schema') as SchemaCorpusSource | undefined
      return searchSchema(schema, args.query, args.top_k ?? defaultTopK)
    },
    presentCall(args): GenericCallView {
      return {
        card: 'generic',
        title: `Search: ${args.query}`,
        kind: 'search',
      }
    },
    presentResult(args, result: ToolResult): GenericResultView | undefined {
      if (result.isError) return undefined
      const meta = result.meta as { hits?: { id: string }[]; ok?: boolean } | undefined
      const count = meta?.hits?.length ?? 0
      return {
        card: 'generic',
        title: meta?.ok === false ? 'Search failed' : `${count} asset${count !== 1 ? 's' : ''} found`,
      }
    },
  }))
}
