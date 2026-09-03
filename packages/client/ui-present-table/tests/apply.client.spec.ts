import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-present-table/client'
import type { TableCardInjected } from '@deepseek-ai/dsh-client-ui-present-table/client'

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
  return entries.find(e => e.options.key === 'present_table')!
}

describe('ui-present-table apply', () => {
  it('declares the slots, sessions, and locale services', () => {
    expect(inject).toEqual(['slots', 'sessions', 'locale'])
  })

  it('registers the present_table keyed toolview with its locale namespace', async () => {
    const { ctx, slots } = await bench()
    await ctx.plugin({ inject: [...inject], apply }).await()
    await new Promise((r) => { setTimeout(r, 0) })
    const entry = getEntry(slots)
    expect(entry).toBeDefined()
    expect(entry.locale).toBe('present.table')
  })

  it('registers the present.table dictionaries with matching key sets', async () => {
    const { ctx, registered } = await bench()
    await ctx.plugin({ inject: [...inject], apply }).await()
    await new Promise((r) => { setTimeout(r, 0) })
    expect(registered).toHaveLength(1)
    expect(registered[0]!.ns).toBe('present.table')
    expect(Object.keys(registered[0]!.dict.zh).sort()).toEqual(Object.keys(registered[0]!.dict.en).sort())
    expect(registered[0]!.dict.zh['expired']).toBe('数据已过期')
  })

  it('removes the entry on teardown', async () => {
    const { ctx, slots } = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    await new Promise((r) => { setTimeout(r, 0) })
    expect(getEntry(slots)).toBeDefined()
    await fiber.dispose()
    const entries = slots.entries('tool.call.toolview') as unknown as StoredEntry[]
    expect(entries.find(e => e.options.key === 'present_table')).toBeUndefined()
  })

  it('inject face fetchResult resolves undefined when the results service is absent (no result-cache)', async () => {
    const { ctx, slots } = await bench({ scope: () => undefined })
    await ctx.plugin({ inject: [...inject], apply }).await()
    await new Promise((r) => { setTimeout(r, 0) })
    const entry = getEntry(slots)
    const face = entry.inject!('session-1' as never) as unknown as TableCardInjected
    // A missing service degrades to a resolved undefined (not-found → TSV
    // fallback), never a throw — the component's `.then` stays safe.
    await expect(face.fetchResult('qr_1')).resolves.toBeUndefined()
  })

  it('inject face fetchResult calls the scoped results service and invalidateResult drops the entry', async () => {
    const get = vi.fn().mockResolvedValue({ columns: ['a'], rows: [['1']], metadata: { row_count: 1 } })
    const invalidate = vi.fn()
    const { ctx, slots } = await bench({ scope: () => ({ get: () => ({ get, invalidate }) }) })
    await ctx.plugin({ inject: [...inject], apply }).await()
    await new Promise((r) => { setTimeout(r, 0) })
    const entry = getEntry(slots)
    const face = entry.inject!('session-1' as never) as unknown as TableCardInjected
    await face.fetchResult('qr_1')
    expect(get).toHaveBeenCalledWith('qr_1')
    face.invalidateResult('qr_1')
    expect(invalidate).toHaveBeenCalledWith('qr_1')
  })
})
