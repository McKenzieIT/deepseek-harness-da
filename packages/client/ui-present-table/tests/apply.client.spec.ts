import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-present-table/client'

interface StoredEntry {
  options: { key?: string }
  locale?: string
}

interface LocaleRegistration {
  ns: string
  dict: { zh: Record<string, string>; en: Record<string, string> }
}

async function bench() {
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
  const registered: LocaleRegistration[] = []
  ctx.provide('locale', {
    register: (ns: string, dict: LocaleRegistration['dict']) => {
      registered.push({ ns, dict })
      return () => {}
    },
  } as never)
  return { ctx, slots, registered }
}

function getEntry(slots: SlotRegistry): StoredEntry {
  const entries = slots.entries('tool.call.toolview') as unknown as StoredEntry[]
  return entries.find(e => e.options.key === 'present_table')!
}

describe('ui-present-table apply', () => {
  it('declares the slots and locale services', () => {
    expect(inject).toEqual(['slots', 'locale'])
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
})
