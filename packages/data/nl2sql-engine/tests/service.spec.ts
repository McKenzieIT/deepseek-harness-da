/**
 * Nl2sqlEngineService — D2 (GA-GT1 Phase 6): `getConventions` per-request-scope
 * resolution. The previous implementation cached
 * `ctx.query.getConventions()` in the constructor and returned the frozen
 * value, so a singleton `ctx.query` made every tenant/scope share one
 * conventions set (cross-line coupling). Phase 6 removes the construction-time
 * cache and resolves per-call from `ctx.query.getConventions(scopeId)`.
 *
 * Covers:
 *  (a) no construction-time cache — a later mutation to
 *      `ctx.query.getConventions`'s return is reflected (per-call);
 *  (b) `scopeId` is threaded through to `ctx.query.getConventions(scopeId)`;
 *  (c) `scopeId=undefined` yields the provider singleton conventions (current
 *      behavior preserved — dormant seam);
 *  (d) construction does NOT call `ctx.query.getConventions` at all (the cache
 *      was removed — a query that throws on getConventions must not fail
 *      construction).
 *
 * Run: `pnpm vitest run packages/data/nl2sql-engine/tests/service.spec.ts`
 */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { Nl2sqlEngineService } from '../src/index.ts'
import type { EngineConventions } from '@deepseek-ai/dsh-query'

/** Build a minimal EngineConventions with the given engine name. */
function mkConv(engine: string): EngineConventions {
  return {
    engine,
    key_differences: [],
    functions: [],
    cast_map: [],
    sql_templates: [],
  }
}

/** A stub `ctx.query` whose `getConventions` returns a mutable holder value. */
function makeStubQuery(holder: { current: EngineConventions }) {
  return {
    getConventions(_scopeId?: string): EngineConventions {
      return holder.current
    },
  }
}

/** A stub `ctx.query` that records every received scopeId. */
function makeRecordingQuery(seen: Array<string | undefined>): { getConventions(scopeId?: string): EngineConventions } {
  return {
    getConventions(scopeId?: string): EngineConventions {
      seen.push(scopeId)
      return mkConv('maxcompute')
    },
  }
}

/** Provide a value on a fresh Cordis Context under the given service key. */
function provide(ctx: Context, key: string, value: unknown): void {
  ;(ctx as unknown as { provide: (k: string, v: unknown) => void }).provide(key, value)
}

describe('Nl2sqlEngineService.getConventions — D2 per-call resolution (Phase 6)', () => {
  it('(a) does NOT construction-time cache: a later mutation to ctx.query.getConventions is reflected', () => {
    // Arrange: a mock query whose getConventions reads from a mutable holder.
    const holder = { current: mkConv('maxcompute') }
    const ctx = new Context()
    provide(ctx, 'query', makeStubQuery(holder))
    const svc = new Nl2sqlEngineService(ctx, {})

    // Act 1: initial conventions — the singleton's maxcompute set.
    const first = svc.getConventions()
    expect(first.engine).toBe('maxcompute')

    // Mutate what ctx.query.getConventions returns (simulating per-scope
    // resolution — a future provider would return a different set per scope).
    holder.current = mkConv('postgres')

    // Act 2: call again — must reflect the NEW value, NOT the value frozen at
    // construction (the old construction-time cache would still return 'maxcompute').
    const second = svc.getConventions()
    expect(second.engine).toBe('postgres')
    expect(second).not.toBe(first)
  })

  it('(b) threads scopeId through to ctx.query.getConventions', () => {
    const received: Array<string | undefined> = []
    const ctx = new Context()
    provide(ctx, 'query', makeRecordingQuery(received))
    const svc = new Nl2sqlEngineService(ctx, {})

    svc.getConventions('tenant-a')
    svc.getConventions('tenant-b')
    svc.getConventions()

    // The scopeId is forwarded end-to-end to ctx.query.getConventions (the
    // dormant seam — current providers ignore it, but the wiring is in place).
    expect(received).toEqual(['tenant-a', 'tenant-b', undefined])
  })

  it('(c) scopeId=undefined yields the provider singleton conventions (current behavior preserved)', () => {
    const singleton = mkConv('maxcompute')
    const received: Array<string | undefined> = []
    const ctx = new Context()
    provide(ctx, 'query', {
      getConventions(scopeId?: string): EngineConventions {
        received.push(scopeId)
        return singleton
      },
    })
    const svc = new Nl2sqlEngineService(ctx, {})

    const out = svc.getConventions()

    // Same object identity as the provider's singleton (no copy/cache).
    expect(out).toBe(singleton)
    // ctx.query.getConventions was called with undefined (no scopeId passed).
    expect(received).toEqual([undefined])
  })

  it('(d) construction does NOT call ctx.query.getConventions (cache removed)', () => {
    // A query that THROWS on getConventions must not fail construction — proving
    // the construction-time cache (`this.conventions = ctx.query.getConventions()`)
    // was removed. Only the per-call getConventions() would surface the throw.
    const ctx = new Context()
    provide(ctx, 'query', {
      getConventions(): EngineConventions {
        throw new Error('should not be called at construction')
      },
    })

    // Construction does NOT call ctx.query.getConventions — if it did, this
    // line would throw 'should not be called at construction'. It must not.
    const svc = new Nl2sqlEngineService(ctx, {})

    // The per-call path surfaces the provider's throw (not a silent stale cache).
    expect(() => svc.getConventions()).toThrow('should not be called at construction')
  })
})

// nl2sql-7: Nl2sqlEngineService.getConventions reads `ctx.query.getConventions`
// at call time but the class declared no `inject = ['query']`, so Cordis had no
// static ordering guarantee — a caller invoking getConventions before ctx.query
// is registered would throw with no framework-level wait. AGENTS.md: a Service
// that reads another service on `ctx` declares it in `inject`.
describe('Nl2sqlEngineService — inject declaration (nl2sql-7)', () => {
  it('declares ctx.query as a dependency (inject includes "query")', () => {
    expect(Nl2sqlEngineService.inject).toContain('query')
  })
})
