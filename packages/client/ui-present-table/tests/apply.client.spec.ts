import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-present-table/client'

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
  return { ctx, slots }
}

describe('ui-present-table apply', () => {
  it('declares only the slots service', () => {
    expect(inject).toEqual(['slots'])
  })

  it('registers the present_table keyed toolview', async () => {
    const { ctx, slots } = await bench()
    await ctx.plugin({ inject: [...inject], apply }).await()
    await new Promise((r) => { setTimeout(r, 0) })
    const entries = slots.entries('tool.call.toolview')
    const entry = entries.find(e => e.options.key === 'present_table')
    expect(entry).toBeDefined()
  })

  it('removes the entry on teardown', async () => {
    const { ctx, slots } = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    await new Promise((r) => { setTimeout(r, 0) })
    expect(slots.entries('tool.call.toolview').find(e => e.options.key === 'present_table')).toBeDefined()
    await fiber.dispose()
    expect(slots.entries('tool.call.toolview').find(e => e.options.key === 'present_table')).toBeUndefined()
  })
})
