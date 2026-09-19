import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-present-decomposition/client'
import { apply as hostApply } from '../src/index.ts'

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
  const slots = ctx.get('slots') as unknown as SlotRegistry
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
  return entries.find(e => e.options.key === 'present_decomposition')!
}

describe('ui-present-decomposition apply', () => {
  it('declares the slots and locale services', () => {
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('registers the present_decomposition keyed toolview with its locale namespace', async () => {
    const { ctx, slots, registered } = await bench()
    await ctx.plugin({ inject: [...inject], apply }).await()
    await new Promise((r) => { setTimeout(r, 0) })
    const entry = getEntry(slots)
    expect(entry).toBeDefined()
    expect(entry.locale).toBe('present.decomposition')
    expect(registered).toHaveLength(1)
    expect(registered[0]!.ns).toBe('present.decomposition')
    expect(registered[0]!.dict.zh['cardTitle']).toBe('查询理解')
    expect(registered[0]!.dict.en['cardTitle']).toBe('Query understanding')
  })

  it('removes the entry on teardown', async () => {
    const { ctx, slots } = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    await new Promise((r) => { setTimeout(r, 0) })
    expect(slots.entries('tool.call.toolview').find(e => e.options.key === 'present_decomposition')).toBeDefined()
    await fiber.dispose()
    expect(slots.entries('tool.call.toolview').find(e => e.options.key === 'present_decomposition')).toBeUndefined()
  })
})

describe('ui-present-decomposition Host entry', () => {
  it('loads onto a Host tree as an inert plugin that contributes no service', async () => {
    // The query-understanding card is browser-only: the toolview slot entry and
    // the present.decomposition dictionaries are contributed by the ./client
    // half. The root (Host/Node) entry exists purely so the package composes
    // into a Host tree — loading it must leave that tree without the client
    // half's services, and tearing it down must not fail.
    const ctx = new Context()
    const fiber = ctx.plugin({ apply: hostApply })
    await fiber.await()
    expect(ctx.get('slots')).toBeUndefined()
    expect(ctx.get('locale')).toBeUndefined()
    await fiber.dispose()
    expect(ctx.get('slots')).toBeUndefined()
  })
})
