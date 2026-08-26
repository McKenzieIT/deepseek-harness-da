import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-suggest-followups/client'
import type { FollowupChipsInjected } from '@deepseek-ai/dsh-client-ui-suggest-followups/client'

interface StoredEntry {
  options: { key?: string }
  inject?: (...args: never[]) => Record<string, unknown>
}

async function bench(sessions?: unknown) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  slots.register(
    { name: 'root', children: { 'conversation.chat.node': { kind: 'keyed', scope: 'session' } } } as never,
    () => null,
  )
  slots.register(
    {
      name: 'conversation.chat.node',
      key: 'tool-call',
      children: { 'tool.call.toolview': { kind: 'keyed', scope: 'session' } },
    } as never,
    () => null,
  )
  ctx.provide('sessions', (sessions ?? { scope: () => undefined }) as never)
  return { ctx, slots }
}

function getEntry(slots: SlotRegistry): StoredEntry {
  const entries = slots.entries('tool.call.toolview') as StoredEntry[]
  return entries.find(e => e.options.key === 'suggest_followups')!
}

describe('ui-suggest-followups apply', () => {
  it('declares slots and sessions services', () => {
    expect(inject).toEqual(['slots', 'sessions'])
  })

  it('registers the suggest_followups keyed toolview', async () => {
    const { ctx, slots } = await bench()
    await ctx.plugin({ inject: [...inject], apply }).await()
    await new Promise((r) => { setTimeout(r, 0) })
    expect(getEntry(slots)).toBeDefined()
  })

  it('removes the entry on teardown', async () => {
    const { ctx, slots } = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    await new Promise((r) => { setTimeout(r, 0) })
    expect(getEntry(slots)).toBeDefined()
    await fiber.dispose()
    const entries = slots.entries('tool.call.toolview') as StoredEntry[]
    expect(entries.find(e => e.options.key === 'suggest_followups')).toBeUndefined()
  })

  it('inject face submit is a no-op when scope returns undefined', async () => {
    const { ctx, slots } = await bench({ scope: () => undefined })
    await ctx.plugin({ inject: [...inject], apply }).await()
    await new Promise((r) => { setTimeout(r, 0) })
    const entry = getEntry(slots)
    const face = entry.inject!('session-1' as never) as FollowupChipsInjected
    expect(() => face.submit('hello')).not.toThrow()
  })

  it('inject face submit is a no-op when conversation is undefined', async () => {
    const { ctx, slots } = await bench({ scope: () => ({ get: () => undefined }) })
    await ctx.plugin({ inject: [...inject], apply }).await()
    await new Promise((r) => { setTimeout(r, 0) })
    const entry = getEntry(slots)
    const face = entry.inject!('session-1' as never) as FollowupChipsInjected
    expect(() => face.submit('hello')).not.toThrow()
  })

  it('inject face submit calls conversation.send', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const { ctx, slots } = await bench({ scope: () => ({ get: () => ({ send }) }) })
    await ctx.plugin({ inject: [...inject], apply }).await()
    await new Promise((r) => { setTimeout(r, 0) })
    const entry = getEntry(slots)
    const face = entry.inject!('session-1' as never) as FollowupChipsInjected
    face.submit('按地区细分')
    expect(send).toHaveBeenCalledWith('按地区细分')
  })
})
