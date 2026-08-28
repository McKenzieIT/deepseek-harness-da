import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-suggest-followups/client'
import type { FollowupChipsInjected } from '@deepseek-ai/dsh-client-ui-suggest-followups/client'

interface StoredEntry {
  options: { key?: string }
  locale?: string
  inject?: (...args: never[]) => Record<string, unknown>
}

interface LocaleRegistration {
  ns: string
  dict: { zh: Record<string, string>; en: Record<string, string> }
}

async function bench(sessions?: unknown, locale?: unknown) {
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
  const registered: LocaleRegistration[] = []
  ctx.provide('locale', (locale ?? {
    register: (ns: string, dict: LocaleRegistration['dict']) => {
      registered.push({ ns, dict })
      return () => {}
    },
  }) as never)
  return { ctx, slots, registered }
}

function getEntry(slots: SlotRegistry): StoredEntry {
  const entries = slots.entries('tool.call.toolview') as unknown as StoredEntry[]
  return entries.find(e => e.options.key === 'suggest_followups')!
}

describe('ui-suggest-followups apply', () => {
  it('declares slots, sessions, and locale services', () => {
    expect(inject).toEqual(['slots', 'sessions', 'locale'])
  })

  it('registers the suggest_followups keyed toolview with its locale namespace', async () => {
    const { ctx, slots } = await bench()
    await ctx.plugin({ inject: [...inject], apply }).await()
    await new Promise((r) => { setTimeout(r, 0) })
    const entry = getEntry(slots)
    expect(entry).toBeDefined()
    expect(entry.locale).toBe('suggest.followups')
  })

  it('registers the suggest.followups dictionaries with matching key sets', async () => {
    const { ctx, registered } = await bench()
    await ctx.plugin({ inject: [...inject], apply }).await()
    await new Promise((r) => { setTimeout(r, 0) })
    expect(registered).toHaveLength(1)
    expect(registered[0]!.ns).toBe('suggest.followups')
    expect(Object.keys(registered[0]!.dict.zh).sort()).toEqual(Object.keys(registered[0]!.dict.en).sort())
    expect(registered[0]!.dict.zh['caption']).toBe('继续追问')
  })

  it('removes the entry on teardown', async () => {
    const { ctx, slots } = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    await new Promise((r) => { setTimeout(r, 0) })
    expect(getEntry(slots)).toBeDefined()
    await fiber.dispose()
    const entries = slots.entries('tool.call.toolview') as unknown as StoredEntry[]
    expect(entries.find(e => e.options.key === 'suggest_followups')).toBeUndefined()
  })

  it('inject face submit is a no-op when scope returns undefined', async () => {
    const { ctx, slots } = await bench({ scope: () => undefined })
    await ctx.plugin({ inject: [...inject], apply }).await()
    await new Promise((r) => { setTimeout(r, 0) })
    const entry = getEntry(slots)
    const face = entry.inject!('session-1' as never) as unknown as FollowupChipsInjected
    expect(() => { face.submit('hello') }).not.toThrow()
  })

  it('inject face submit is a no-op when conversation is undefined', async () => {
    const { ctx, slots } = await bench({ scope: () => ({ get: () => undefined }) })
    await ctx.plugin({ inject: [...inject], apply }).await()
    await new Promise((r) => { setTimeout(r, 0) })
    const entry = getEntry(slots)
    const face = entry.inject!('session-1' as never) as unknown as FollowupChipsInjected
    expect(() => { face.submit('hello') }).not.toThrow()
  })

  it('inject face submit calls conversation.send', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const { ctx, slots } = await bench({ scope: () => ({ get: () => ({ send }) }) })
    await ctx.plugin({ inject: [...inject], apply }).await()
    await new Promise((r) => { setTimeout(r, 0) })
    const entry = getEntry(slots)
    const face = entry.inject!('session-1' as never) as unknown as FollowupChipsInjected
    face.submit('按地区细分')
    expect(send).toHaveBeenCalledWith('按地区细分')
  })
})
