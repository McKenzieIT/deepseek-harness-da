// @vitest-environment jsdom
// ResultService scope addressing over the runtime's real scope tag:
// TestSessions mints tagged scopes through the production createScope, so the
// service's scopeOf path runs against production resolution (no local tag probe).
import { describe, expect, it, vi } from 'vitest'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { RemoteError, TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import { DEFAULT_RESULT_CACHE_CONFIG, ResultFetchError } from '../src/client/cache.ts'
import { ResultServiceImpl } from '../src/client/service.ts'
import type { ResultService } from '../src/client/service.ts'
import type { ResultEntry } from '../src/client/types.ts'

const ENTRY: ResultEntry = {
  columns: ['a', 'b'],
  rows: [[1, 'x']],
  metadata: { sql: 'select 1', row_count: 1 },
}

/** Build a TestRemote whose only scripted namespace is `result.get`. */
function makeRemote(
  ctx: SlotTestRuntime['ctx'],
  getImpl: (rid: string) => Promise<RemoteResult<ResultEntry>>,
): { remote: TestRemote; get: ReturnType<typeof vi.fn> } {
  const get = vi.fn(async (resultId: string) => getImpl(resultId))
  const remote = new TestRemote(ctx, { result: { get } })
  return { remote, get }
}

/** Assemble the service on a real runtime with two sessions scoped. */
async function bench(getImpl: (rid: string) => Promise<RemoteResult<ResultEntry>>) {
  const runtime = await SlotTestRuntime.create()
  const { get } = makeRemote(runtime.ctx, getImpl)
  const fiber = runtime.ctx.plugin(ResultServiceImpl, { ...DEFAULT_RESULT_CACHE_CONFIG })
  await fiber.await()
  const sessionStub = {
    prompt: vi.fn(async () => ({ ok: true as const, value: { accepted: true as const } })),
    updateQueue: vi.fn(async () => ({ ok: true as const, value: { accepted: true as const } })),
    cancel: vi.fn(async () => ({ ok: true as const, value: { accepted: true as const } })),
    loadOlder: vi.fn(async () => undefined),
  }
  await runtime.sessions.add({ id: 's1', session: sessionStub })
  await runtime.sessions.add({ id: 's2', session: sessionStub })
  const scoped1 = runtime.sessions.scope('s1')!.get('results') as ResultService
  const scoped2 = runtime.sessions.scope('s2')!.get('results') as ResultService
  const root = runtime.ctx.get('results') as ResultService
  return { runtime, get, scoped1, scoped2, root }
}

describe('ResultService (scope-addressed)', () => {
  it('misses then fetches via result.get, and caches the hit (same ref, no second RPC)', async () => {
    const b = await bench(async () => ({ ok: true as const, value: ENTRY }))
    const e1 = await b.scoped1.get('qr_1')
    expect(e1).toEqual(ENTRY)
    expect(b.get).toHaveBeenCalledWith('qr_1')
    const e2 = await b.scoped1.get('qr_1')
    expect(e2).toBe(e1)
    expect(b.get).toHaveBeenCalledTimes(1)
    await b.runtime.dispose()
  })

  it('isolates sessions: the same rid under two scopes fetches twice', async () => {
    const b = await bench(async () => ({ ok: true as const, value: ENTRY }))
    await b.scoped1.get('qr_1')
    await b.scoped2.get('qr_1')
    expect(b.get).toHaveBeenCalledTimes(2)
    await b.runtime.dispose()
  })

  it('resolves a host result-not-found to undefined', async () => {
    const b = await bench(async rid => ({
      ok: false as const,
      error: new RemoteError('result-not-found', 'miss', { resultId: rid }),
    }))
    expect(await b.scoped1.get('qr_x')).toBeUndefined()
    await b.runtime.dispose()
  })

  it('propagates a non-not-found error as a ResultFetchError', async () => {
    const b = await bench(async () => ({
      ok: false as const,
      error: new RemoteError('gateway/internal', 'boom', {}),
    }))
    await expect(b.scoped1.get('qr_1')).rejects.toBeInstanceOf(ResultFetchError)
    await b.runtime.dispose()
  })

  it('invalidate (scoped) drops the caller session entry so the next read refetches', async () => {
    const b = await bench(async () => ({ ok: true as const, value: ENTRY }))
    await b.scoped1.get('qr_1')
    b.scoped1.invalidate('qr_1')
    await b.scoped1.get('qr_1')
    expect(b.get).toHaveBeenCalledTimes(2)
    await b.runtime.dispose()
  })

  it('invalidateSession drops one session but leaves another intact', async () => {
    const b = await bench(async () => ({ ok: true as const, value: ENTRY }))
    await b.scoped1.get('qr_1')
    await b.scoped2.get('qr_1')
    expect(b.get).toHaveBeenCalledTimes(2)
    b.root.invalidateSession('s1' as never)
    await b.scoped1.get('qr_1') // s1 evicted -> refetch
    expect(b.get).toHaveBeenCalledTimes(3)
    const before = b.get.mock.calls.length
    await b.scoped2.get('qr_1') // s2 intact -> hit
    expect(b.get.mock.calls.length).toBe(before)
    await b.runtime.dispose()
  })

  it('fails loudly from the root scope (no session) on get', async () => {
    const b = await bench(async () => ({ ok: true as const, value: ENTRY }))
    await expect(b.root.get('qr_1')).rejects.toThrow(/requires a session scope/)
    await b.runtime.dispose()
  })
})
