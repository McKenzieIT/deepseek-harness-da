/**
 * Tests for the query-engine Service Definition (`ctx.query`).
 *
 * `QueryEngine` is abstract: `execute`/`attach`/`cancel`/`getProgress` have no
 * base body, so the only base-class behavior to pin is the ONE non-abstract
 * seam method with a default implementation — `getConventions`. Its default
 * MUST refuse loudly: the nl2sql prompt injects the returned convention set
 * verbatim as its dialect grounding, so a default that returned an empty set
 * would silently ground the model on no dialect instead of surfacing the
 * missing provider override (src/index.ts `getConventions` doc comment).
 *
 * Provider behavior (MaxCompute / Postgres) lives with those packages; here we
 * pin only the abstract seam's registration plus the not-implemented default.
 *
 * Run: `pnpm vitest run packages/query/query`
 */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { QueryEngine } from '@deepseek-ai/dsh-query'
import type { InstanceId, QueryOutcome, QueryRequest } from '@deepseek-ai/dsh-query'

/** The exact refusal a provider author must read when the override is missing. */
const NOT_IMPLEMENTED = 'QueryEngine.getConventions: not implemented; override in a concrete provider subclass'

/**
 * Minimal concrete engine: implements exactly the four abstract operations and
 * deliberately does NOT override `getConventions`, so every assertion below
 * observes the inherited default rather than a provider's dialect.
 */
class UngroundedEngine extends QueryEngine {
  execute(request: QueryRequest): Promise<QueryOutcome> {
    return Promise.resolve({ state: 'completed', sql: request.sql, rowCount: 0 })
  }

  attach(instanceId: InstanceId): Promise<QueryOutcome> {
    return Promise.resolve({ state: 'completed', sql: 'select 1', instanceId })
  }

  cancel(): Promise<void> {
    return Promise.resolve()
  }

  getProgress(instanceId: InstanceId): Promise<QueryOutcome> {
    return Promise.resolve({ state: 'pending', sql: 'select 1', instanceId, stage: 'running' })
  }
}

describe('QueryEngine seam', () => {
  it('registers a concrete subclass as ctx.query', async () => {
    const ctx = new Context()
    await ctx.plugin(UngroundedEngine)
    expect(ctx.query).toBeInstanceOf(UngroundedEngine)
  })

  it('refuses getConventions by default instead of returning an empty dialect', async () => {
    const ctx = new Context()
    await ctx.plugin(UngroundedEngine)
    let returned: unknown = 'never assigned'
    expect(() => {
      returned = ctx.query.getConventions()
    }).toThrow(new Error(NOT_IMPLEMENTED))
    // A default that resolved to any value (even an empty convention set) would
    // reach this assignment and ground the prompt on a dialect nobody loaded.
    expect(returned).toBe('never assigned')
  })

  it('refuses regardless of the dormant per-scope key', async () => {
    const ctx = new Context()
    await ctx.plugin(UngroundedEngine)
    expect(() => ctx.query.getConventions('game_10000251')).toThrow(new Error(NOT_IMPLEMENTED))
  })
})
