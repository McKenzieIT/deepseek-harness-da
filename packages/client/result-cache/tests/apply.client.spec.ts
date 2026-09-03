// @vitest-environment jsdom
// apply() wiring: the connection inject, ctx.results provision through the
// real scope tag (TestSessions mints scopes via production createScope), the
// connection/reset → invalidateAll flush effect, and the Config bound merge.
import { describe, expect, it, vi } from 'vitest'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import type { IApiClient, RpcResult } from '@deepseek-ai/dsh-api-remotes/client'
import { apply, inject } from '../src/client/index.ts'
import type { ResultService } from '../src/client/index.ts'
import type { ResultEntry } from '../src/client/types.ts'

const ENTRY: ResultEntry = { columns: ['a'], rows: [['x']] }

/** Build a mock IApiClient whose only live surface is `results.get`. */
function makeApi(getImpl: (rid: string) => Promise<RpcResult<ResultEntry>>): { api: IApiClient; get: ReturnType<typeof vi.fn> } {
  const get = vi.fn(async (payload: { resultId: string }) => ({
    rpcId: 'rpc-1' as never,
    result: await getImpl(payload.resultId),
  }))
  return { api: { results: { get } } as unknown as IApiClient, get }
}

/** A session stub with the surface the runtime's add() requires. */
function sessionStub(): Record<string, ReturnType<typeof vi.fn>> {
  return {
    prompt: vi.fn(async () => ({ ok: true as const, value: { accepted: true as const } })),
    updateQueue: vi.fn(async () => ({ ok: true as const, value: { accepted: true as const } })),
    cancel: vi.fn(async () => ({ ok: true as const, value: { accepted: true as const } })),
    loadOlder: vi.fn(async () => undefined),
  }
}

/** Mount apply() on a real runtime with `connection` provided and one session scoped. */
async function bench(getImpl: (rid: string) => Promise<RpcResult<ResultEntry>>): Promise<{
  runtime: SlotTestRuntime
  get: ReturnType<typeof vi.fn>
  scoped: ResultService
  root: ResultService
}> {
  const runtime = await SlotTestRuntime.create()
  const { api, get } = makeApi(getImpl)
  runtime.ctx.provide('connection', { api } as never)
  await runtime.ctx.plugin({ inject, apply }).await()
  await runtime.sessions.add({ id: 's1', session: sessionStub() })
  const scoped = runtime.sessions.scope('s1')!.get('results') as ResultService
  const root = runtime.ctx.get('results') as ResultService
  return { runtime, get, scoped, root }
}

describe('result-cache apply', () => {
  it('declares the connection inject', () => {
    expect(inject).toEqual(['connection'])
  })

  it('provides ctx.results (scope-addressed): a miss fetches via connection.api.results.get, a hit does not re-RPC', async () => {
    const b = await bench(async () => ({ ok: true as const, value: ENTRY }))
    const first = await b.scoped.get('qr_1')
    expect(first).toBe(ENTRY)
    expect(b.get).toHaveBeenCalledWith({ resultId: 'qr_1' }, undefined)
    const second = await b.scoped.get('qr_1')
    expect(second).toBe(first)
    expect(b.get).toHaveBeenCalledTimes(1)
    await b.runtime.dispose()
  })

  it('flushes the whole cache on connection/reset (wire-derived state treated as stale)', async () => {
    const b = await bench(async () => ({ ok: true as const, value: ENTRY }))
    await b.scoped.get('qr_1') // fetch + cache
    expect(b.get).toHaveBeenCalledTimes(1)
    b.runtime.ctx.emit('connection/reset') // reconnect flush
    await b.scoped.get('qr_1') // cache was flushed -> miss -> refetch
    expect(b.get).toHaveBeenCalledTimes(2)
    await b.runtime.dispose()
  })

  it('merges config bounds over the defaults (apply(ctx, config))', async () => {
    const runtime = await SlotTestRuntime.create()
    const { api, get } = makeApi(async () => ({ ok: true as const, value: ENTRY }))
    runtime.ctx.provide('connection', { api } as never)
    // maxEntrySize: 1 -> ENTRY (~36 bytes) is oversized -> never cached -> refetch each read
    await runtime.ctx.plugin({ inject, apply: (ctx) => { apply(ctx, { maxEntrySize: 1 }) } }).await()
    await runtime.sessions.add({ id: 's1', session: sessionStub() })
    const scoped = runtime.sessions.scope('s1')!.get('results') as ResultService
    await scoped.get('qr_1')
    await scoped.get('qr_1') // oversized -> never cached -> refetch
    expect(get).toHaveBeenCalledTimes(2)
    await runtime.dispose()
  })

  it('fails loudly from the root scope (no session) on get', async () => {
    const b = await bench(async () => ({ ok: true as const, value: ENTRY }))
    await expect(b.root.get('qr_1')).rejects.toThrow(/requires a session scope/)
    await b.runtime.dispose()
  })
})
