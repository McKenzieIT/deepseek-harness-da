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
  loadRetrievalCorpusAll?(scopeId?: string): readonly DataSourceDoc[]
  loadRetrievalCorpus(scopeId?: string): readonly DataSourceDoc[]
  /** Phase 3 (D5.1): corpus-version signal for stale-cache invalidation per scope. */
  corpusVersion?(scopeId?: string): number
  /** GA-GT1 Phase 5a: per-scope root-resolution seam for the #19/#22
   *  root-check fix (5b adds `root` to the per-scope cache entry + checks
   *  `entry.root === root` — parity with Phase 2 I-1). Optional so a schema
   *  without it degrades via `?.` (build-once, D2e behavior). */
  resolveScopeRoot?(scopeId?: string): string
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

/**
 * Phase 3 (D5.1): sentinel key for the active scope (scopeId omitted) in the
 * per-scope linker cache. A `symbol` cannot collide with any real string
 * scopeId (`Map` distinguishes by type + reference), so the active-scope entry
 * can never shadow or be shadowed by a named scope.
 */
const ACTIVE_SENTINEL = Symbol('active-scope')

/**
 * D5.1 + GA-GT1 Phase 5b: per-scope + version-keyed cache of `Bm25Linker`s.
 * The outer `WeakMap` keys by schema instance (GC'd when unmounted); the
 * inner `Map` keys by scopeId (active scope uses `ACTIVE_SENTINEL`). Each
 * entry pairs the linker with the `corpusVersion(scopeId)` it was built at AND
 * the `resolveScopeRoot(scopeId)` it was built under; a mismatch on EITHER
 * (a write bumped the counter for that scope, OR the scope was re-registered
 * onto a different root) drops + rebuilds only that scope's entry — fixing
 * stale-on-write, isolating scopes (one scope's rebuild does not evict
 * another's cached linker), AND closing the #19 re-registration cross-tenant
 * leak (a scope re-registered to a different, never-written root keeps version
 * 0===0; without the root check the cache would HIT and serve the OLD root's
 * linker — parity with Phase 2 I-1 `graphCacheByScope`). Phase 3 ships the
 * per-scope keying as dormant capacity (`searchSchema`/execute did not pass
 * scopeId — Phase 4/5); the corpusVersion check is live now on the active
 * path. Phase 5b adds the root field + check + wires `exec.scopeId` through
 * `searchSchema`/execute (5b: dormant — prod callers do not set
 * AgentOptions.scopeId yet; 5d eval/CLI will).
 */
const linkerCache = new WeakMap<SchemaCorpusSource, Map<string | symbol, { linker: Bm25Linker; version: number; root: string | undefined }>>()

/**
 * Get (or build+cache) the `Bm25Linker` for a schema instance + scope,
 * rebuilding when the schema's corpus-version signal advances OR the scope's
 * root changes (D5.1 + GA-GT1 Phase 5b cache-invalidation). `scopeId` is
 * optional (undefined → active scope). GA-GT1 Phase 5b wires `exec.scopeId`
 * through `searchSchema` to here (dormant until 5d — prod callers do not set
 * `AgentOptions.scopeId` yet; `exec.scopeId` undefined → `ACTIVE_SENTINEL` →
 * the active path, unchanged).
 *
 * GA-GT1 Phase 5b (#19): the root check closes the re-registration
 * cross-tenant leak. `resolveScopeRoot?.(scopeId)` is `undefined` when the
 * schema has no `resolveScopeRoot` (mock / pre-5a schema) → `root=undefined`
 * → `entry.root === root` is `undefined===undefined` → true → degrades to
 * version-only (the pre-5b contract, preserved). A real
 * `SemanticLayerService` exposes `resolveScopeRoot` → `root` is a real path
 * → the check activates (parity with Phase 2 I-1 `graphCacheByScope` + the
 * 3a `enrichedLinkers` root guard).
 */
function getCachedLinker(schema: SchemaCorpusSource, scopeId?: string): Bm25Linker {
  const key = scopeId ?? ACTIVE_SENTINEL
  let byScope = linkerCache.get(schema)
  if (byScope === undefined) {
    byScope = new Map()
    linkerCache.set(schema, byScope)
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

export function searchSchema(
  schema: SchemaCorpusSource | undefined,
  query: string,
  topK: number,
  /** GA-GT1 Phase 5b: optional tenant/scope id; undefined → active scope
   *  (dormant until 5d — prod callers do not set AgentOptions.scopeId yet;
   *  5d eval/CLI config scopeId activates per-scope isolation). Threaded
   *  through to `getCachedLinker(schema, scopeId)` whose root-check makes the
   *  per-scope path safe (#19). */
  scopeId?: string,
): SearchSchemaResult {
  if (schema === undefined) {
    return { ok: false, message: 'semantic-layer not mounted (ctx.schema unavailable)' }
  }
  const linker = getCachedLinker(schema, scopeId)
  const hits = linker.retrieve(query, { topK, mode: 'bm25-only' })
  return {
    ok: true,
    hits: hits.map((h) => {
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
          ...(h.kind !== undefined ? { kind: h.kind } : {}),
          ...(h.domains !== undefined ? { domains: h.domains } : {}),
          ...(h.description !== undefined ? { description: h.description } : {}),
        })),
        ok: value.ok,
        ...(value.message !== undefined ? { message: value.message } : {}),
      }),
    },
    execute(args, exec) {
      if (exec.signal.aborted) throw new Error('search_schema aborted')
      const schema = ctx.get('schema') as SchemaCorpusSource | undefined
      // GA-GT1 Phase 5b: thread `exec.scopeId` through `searchSchema` →
      // `getCachedLinker` (dormant until 5d — prod callers do not set
      // AgentOptions.scopeId yet → exec.scopeId is undefined → ACTIVE_SENTINEL
      // → active path, 現状; 5d eval/CLI config scopeId activates per-scope
      // isolation). The 5b root-check makes this safe: a scope re-registered
      // onto a different root no longer leaks the OLD root's linker across
      // tenants (#19).
      return Promise.resolve(searchSchema(schema, args.query, args.top_k ?? defaultTopK, exec.scopeId))
    },
    presentCall(args): GenericCallView {
      return {
        card: 'generic',
        title: `Search: ${args.query}`,
        kind: 'search',
      }
    },
    presentResult(_args, result: ToolResult): GenericResultView | undefined {
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
