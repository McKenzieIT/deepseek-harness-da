import { describe, expect, it } from 'vitest'
import { NarrationGate, type SessionEventLike } from '../src/client/narration-gate.ts'

// Minimal fake event source: captures the listener the NarrationGate
// subscribes with, so the test can drive `handleEvent` directly through the
// public subscribe contract (no test-only seams in production code).
function createGate() {
  let listener: ((event: SessionEventLike) => void) | null = null
  const eventSource = {
    subscribe: (l: (event: SessionEventLike) => void) => {
      listener = l
      return () => { listener = null }
    },
  }
  const gate = new NarrationGate({ eventSource })
  const emit = (event: SessionEventLike) => listener?.(event)
  return { gate, emit }
}

function toolResultEvent(added: unknown[]): SessionEventLike {
  return {
    type: 'tool/result',
    seq: 1,
    time: 0,
    data: {
      meta: { added },
      message: { name: 'discover_relations' },
    },
  }
}

describe('NarrationGate — node id resolution (ucl-8)', () => {
  it('picks the first string among id/table/dim_table, not the first truthy value', () => {
    const { gate, emit } = createGate()
    // item.id is a truthy NUMBER; item.table is the string. The node branch
    // accepts this item (typeof item.table === 'string'), but the old
    // `(item.id ?? item.table ?? item.dim_table) as string` keeps the number
    // id and casts the lie. The id must be the string 'real-table'.
    emit(toolResultEvent([{ id: 42, table: 'real-table' }]))

    const pending = gate.getPending()
    const addNodes = pending.find(u => u.type === 'add_nodes')
    expect(addNodes).toBeDefined()
    expect(addNodes!.items[0]!.id).toBe('real-table')

    gate.dispose()
  })

  it('uses item.id when it is already a string', () => {
    const { gate, emit } = createGate()
    emit(toolResultEvent([{ id: 'node-1', table: 'ignored' }]))

    const addNodes = gate.getPending().find(u => u.type === 'add_nodes')
    expect(addNodes!.items[0]!.id).toBe('node-1')

    gate.dispose()
  })

  it('falls back to dim_table when neither id nor table is a string', () => {
    const { gate, emit } = createGate()
    emit(toolResultEvent([{ id: 7, table: 9, dim_table: 'dim-t' }]))

    const addNodes = gate.getPending().find(u => u.type === 'add_nodes')
    expect(addNodes!.items[0]!.id).toBe('dim-t')

    gate.dispose()
  })
})
