import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CtxQueryExecutor } from '../src/ctx_query_executor.ts'

/** Provide a stubbed `query` seam the adapter reads via `ctx.get`. */
function provideQuery(ctx: Context, query: unknown): void {
  ;(ctx as unknown as { provide: (k: string, v: unknown) => void }).provide('query', query)
}

/** A context whose `query` capability returns `outcome`, or none when omitted. */
function ctxWith(outcome?: unknown): Context {
  const ctx = new Context()
  if (outcome !== undefined) {
    provideQuery(ctx, { execute: () => Promise.resolve(outcome), attach: () => Promise.resolve(outcome) })
  }
  return ctx
}

describe('CtxQueryExecutor', () => {
  it('accepts state "completed" as a finished query', async () => {
    const out = await new CtxQueryExecutor(ctxWith({ state: 'completed', columns: ['n'], rows: [[1]], rowCount: 1 }), 's').execute('SELECT 1')
    expect(out.state).toBe('completed')
    expect(out.rows).toEqual([[1]])
  })

  it('accepts state "done" as a finished query, not an environment block', async () => {
    const out = await new CtxQueryExecutor(ctxWith({ state: 'done', columns: ['n'], rows: [[1]] }), 's').execute('SELECT 1')
    expect(out.state).toBe('completed')
    expect(out.rows).toEqual([[1]])
  })

  it('maps "running" to pending, keeping the instance id', async () => {
    const out = await new CtxQueryExecutor(ctxWith({ state: 'running', instanceId: 'i-7' }), 's').execute('SELECT 1')
    expect(out.state).toBe('pending')
    expect(out.instanceId).toBe('i-7')
  })

  it('maps "pending" to pending', async () => {
    const out = await new CtxQueryExecutor(ctxWith({ state: 'pending', instanceId: 'i-8' }), 's').execute('SELECT 1')
    expect(out.state).toBe('pending')
  })

  it('keeps the provider failureKind on a failure', async () => {
    const out = await new CtxQueryExecutor(ctxWith({ state: 'failed', error: 'boom', failureKind: 'invalid_sql' }), 's').execute('SELECT 1')
    expect(out.state).toBe('failed')
    expect(out.failureKind).toBe('invalid_sql')
    expect(out.error).toBe('boom')
  })

  it('names an unrecognized state in the error rather than dropping it silently', async () => {
    const out = await new CtxQueryExecutor(ctxWith({ state: 'wat' }), 's').execute('SELECT 1')
    expect(out.state).toBe('failed')
    expect(out.error).toContain('wat')
  })

  it('reports a missing query capability as a failure, not a hang', async () => {
    const out = await new CtxQueryExecutor(ctxWith(), 's').execute('SELECT 1')
    expect(out.state).toBe('failed')
    expect(out.error).toContain('no query provider mounted')
  })

  it('resolves a pending query when the provider can attach', async () => {
    const out = await new CtxQueryExecutor(ctxWith({ state: 'completed', columns: ['n'], rows: [[9]] }), 's').attach('i-1')
    expect(out.state).toBe('completed')
    expect(out.rows).toEqual([[9]])
  })

  it('reports attach against a missing query capability as a failure', async () => {
    const out = await new CtxQueryExecutor(ctxWith(), 's').attach('i-1')
    expect(out.state).toBe('failed')
    expect(out.error).toContain('cannot attach')
  })

  it('omits columns and rowCount the provider did not report', async () => {
    const out = await new CtxQueryExecutor(ctxWith({ state: 'completed', rows: [[1]] }), 's').execute('SELECT 1')
    expect(out.state).toBe('completed')
    expect(out.columns).toBeUndefined()
    expect(out.rowCount).toBeUndefined()
    expect(out.rows).toEqual([[1]])
  })

  it('omits rows the provider did not report', async () => {
    const out = await new CtxQueryExecutor(ctxWith({ state: 'completed', columns: ['n'] }), 's').execute('SELECT 1')
    expect(out.state).toBe('completed')
    expect(out.rows).toBeUndefined()
  })

  it('echoes back the submitted SQL when the provider does not', async () => {
    const out = await new CtxQueryExecutor(ctxWith({ state: 'completed', rows: [] }), 's').execute('SELECT 42')
    expect(out.sql).toBe('SELECT 42')
  })

  it('prefers the SQL the provider reports it executed', async () => {
    const out = await new CtxQueryExecutor(ctxWith({ state: 'completed', rows: [], sql: 'SELECT 42 /* rewritten */' }), 's').execute('SELECT 42')
    expect(out.sql).toBe('SELECT 42 /* rewritten */')
  })

  it('lets a provider error propagate so infra retry can see it', async () => {
    const ctx = new Context()
    provideQuery(ctx, { execute: () => Promise.reject(new Error('ECONNREFUSED')) })
    await expect(new CtxQueryExecutor(ctx, 's').execute('SELECT 1')).rejects.toThrow('ECONNREFUSED')
  })

  it('reports a provider that cannot attach rather than pretending it did', async () => {
    const ctx = new Context()
    provideQuery(ctx, { execute: () => Promise.resolve({ state: 'completed', rows: [] }) })
    const out = await new CtxQueryExecutor(ctx, 's').attach('i-1')
    expect(out.state).toBe('failed')
    expect(out.error).toContain('cannot attach')
  })
})
