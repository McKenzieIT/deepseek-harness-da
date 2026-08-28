/**
 * In-memory, session-scoped implementation of the `@deepseek-ai/dsh-result-cache`
 * storage seam. Stores entries in a `Map` keyed by `result_id`, and hooks
 * `tools/post-execute` to capture `query_data` completed results automatically.
 *
 * Prefixes:
 * - `qr_` — query-engine results (auto-captured from `query_data`)
 * - `cr_` — compute-derived results (stored via explicit `put`)
 *
 * @module @deepseek-ai/dsh-result-cache-memory
 */

import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { ResultCache, type ResultEntry } from '@deepseek-ai/dsh-result-cache'
import type { PostToolDecision } from '@deepseek-ai/dsh-tools'

export const name = 'result-cache-memory'
export const inject = ['tools']

/**
 * In-memory result cache. Entries are session-scoped (GC'd with the plugin
 * context). The `tools/post-execute` hook auto-captures completed `query_data`
 * results under deterministic `qr_<hash>` ids so the model can reference them
 * in subsequent `present_table` calls.
 */
export class MemoryResultCache extends ResultCache {
  private readonly store = new Map<string, ResultEntry>()

  get(resultId: string): ResultEntry | undefined {
    return this.store.get(resultId)
  }

  put(resultId: string, entry: ResultEntry): void {
    const existing = this.store.get(resultId)
    if (existing !== undefined && resultId.startsWith('cr_')) {
      // cr_ (compute-derived) ids are immutable-once-written: a different entry
      // under an existing cr_ id is a deterministic-compute contract violation.
      if (!entriesEqual(existing, entry)) {
        throw new Error(
          `resultCache: cannot overwrite result_id "${resultId}" with a different entry (immutable)`,
        )
      }
      return
    }
    // qr_ (query) ids are SQL-derived; rows can change between executions
    // (time-windowed/real-time queries), so overwrite with the latest entry
    // (idempotent when unchanged). Never throws — the post-execute hook runs
    // inside execute's outer try/catch, and a throw would turn a successful
    // query into isError and serve stale rows under the returned result_id.
    this.store.set(resultId, entry)
  }

  has(resultId: string): boolean {
    return this.store.has(resultId)
  }
}

function entriesEqual(a: ResultEntry, b: ResultEntry): boolean {
  if (a === b) return true
  if (a.columns.length !== b.columns.length) return false
  for (let i = 0; i < a.columns.length; i++) {
    if (a.columns[i] !== b.columns[i]) return false
  }
  if (a.rows.length !== b.rows.length) return false
  for (let i = 0; i < a.rows.length; i++) {
    const ra = a.rows[i] as unknown[]
    const rb = b.rows[i] as unknown[]
    if (ra.length !== rb.length) return false
    for (let j = 0; j < ra.length; j++) {
      if (ra[j] !== rb[j] && JSON.stringify(ra[j]) !== JSON.stringify(rb[j])) return false
    }
  }
  return true
}

/**
 * Generate a deterministic result_id from the SQL string.
 * @param sql - the SQL string to hash.
 * @returns `qr_<12-char hex hash>`
 */
export function generateQueryResultId(sql: string): string {
  const hash = createHash('sha256').update(sql).digest('hex').slice(0, 12)
  return `qr_${hash}`
}

export function apply(ctx: Context): void {
  const cache = new MemoryResultCache(ctx)

  ctx.on('tools/post-execute', async (exec, result, next): Promise<PostToolDecision> => {
    if (exec.name !== 'query_data') return next()

    const decision = await next()
    if (decision.kind !== 'accept') return decision

    if (result.isError) return decision

    const value = (result as { value?: Record<string, unknown> }).value
    if (value === null || value === undefined) return decision
    if (value.state !== 'completed') return decision

    const columns = value.columns as string[] | undefined
    const rows = value.rows as unknown[][] | undefined
    const sql = value.sql as string | undefined
    if (columns === undefined || rows === undefined || sql === undefined) return decision

    const resultId = generateQueryResultId(sql)
    const entry: ResultEntry = {
      columns,
      rows,
      metadata: {
        sql,
        ...(value.truncated !== undefined ? { truncated: value.truncated as boolean } : {}),
        ...(value.rowCount !== undefined ? { row_count: value.rowCount as number } : {}),
      },
    }

    cache.put(resultId, entry)

    const augmentedValue = { ...value, result_id: resultId }
    return { kind: 'accept', value: augmentedValue }
  })
}
