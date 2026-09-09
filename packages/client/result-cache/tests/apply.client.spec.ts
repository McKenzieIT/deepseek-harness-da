// @vitest-environment jsdom
// apply() wiring: the remote inject, ctx.results provision through the real
// scope tag (TestSessions mints scopes via production createScope), the
// connection/reset → invalidateAll flush effect (plain cordis event bus, no
// `connection` service required), and the Config bound merge.
import { describe, expect, it, vi } from 'vitest'
import { SlotTestRuntime, TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import { apply, inject } from '../src/client/index.ts'
import type { ResultService } from '../src/client/index.ts'
import type { ResultEntry } from '../src/client/types.ts'

const ENTRY: ResultEntry = { columns: ['a'], rows: [['x']] }

/** Build a TestRemote whose only scripted namespace is `result.get`. */
function makeRemote(
  ctx: SlotTestRuntime['ctx'],
  getImpl: (rid: string) => Promise<RemoteResult<ResultEntry>>,
): { remote: TestRemote; get: ReturnType<typeof vi.fn> } {
  const get = vi.fn(async (resultId: string) => getImpl(resultId))
  const remote = new TestRemote(ctx, { result: { get } })
  return { remote, get }
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

/** Mount apply() on a real runtime with `remote` provided and one session scoped. */
async function bench(getImpl: (rid: string) => Promise<RemoteResult<ResultEntry>>): Promise<{
  runtime: SlotTestRuntime
  get: ReturnType<typeof vi.fn>
  scoped: ResultService
  root: ResultService
}> {
  const runtime = await SlotTestRuntime.create()
  const { get } = makeRemote(runtime.ctx, getImpl)
  await runtime.ctx.plugin({ inject, apply }).await()
  await runtime.sessions.add({ id: 's1', session: sessionStub() })
  const scoped = runtime.sessions.scope('s1')!.get('results') as ResultService
  const root = runtime.ctx.get('results') as ResultService
  return { runtime, get, scoped, root }
}

describe('result-cache apply', () => {
  it('declares the remote inject', () => {
    expect(inject).toEqual(['remote'])
  })

  it('provides ctx.results (scope-addressed): a miss fetches via ctx.remote.result.get, a hit does not re-RPC', async () => {
    const b = await bench(async () => ({ ok: true as const, value: ENTRY }))
    const first = await b.scoped.get('qr_1')
    expect(first).toBe(ENTRY)
    expect(b.get).toHaveBeenCalledWith('qr_1')
    const second = await b.scoped.get('qr_1')
    expect(second).toBe(first)
    expect(b.get).toHaveBeenCalledTimes(1)
    await b.runtime.dispose()
  })

  it('flushes the whole cache on connection/reset (wire-derived state treated as stale)', async () => {
    const b = await bench(async () => ({ ok: true as const, value: ENTRY }))
    await b.scoped.get('qr_1') // fetch + cache
    expect(b.get).toHaveBeenCalledTimes(1)
    b.runtime.ctx.emit('connection/reset') // reconnect flush (plain cordis event bus)
    await b.scoped.get('qr_1') // cache was flushed -> miss -> refetch
    expect(b.get).toHaveBeenCalledTimes(2)
    await b.runtime.dispose()
  })

  it('merges config bounds over the defaults (apply(ctx, config))', async () => {
    const runtime = await SlotTestRuntime.create()
    const { get } = makeRemote(runtime.ctx, async () => ({ ok: true as const, value: ENTRY }))
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
