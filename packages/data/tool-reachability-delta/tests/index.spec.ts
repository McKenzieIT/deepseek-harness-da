import { describe, it, expect, vi } from 'vitest'
import { apply, formatReachabilityDelta, projectMeta } from '../src/index'

interface ToolDef {
  name: string
  execute: (args: Record<string, unknown>, exec: { signal: { aborted: boolean } }) => Promise<Record<string, unknown>>
}

function createMockCtx(opts: { hasEvidenceQuery?: boolean } = {}) {
  const registered: ToolDef[] = []

  const evidenceQuery = opts.hasEvidenceQuery
    ? {
      reachabilityDelta: vi.fn().mockReturnValue({
        proposedRelation: {
          sourceId: 'asset_orders',
          targetId: 'asset_customers',
          type: 'joins',
          on: 'orders.customer_id = customers.id',
        },
        newlyReachable: [
          { from: 'asset_orders', to: 'asset_addresses' },
          { from: 'asset_line_items', to: 'asset_customers' },
        ],
      }),
    }
    : undefined

  const ctx = {
    tools: {
      register: vi.fn((toolDef: ToolDef) => {
        registered.push(toolDef)
      }),
    },
    get: vi.fn((key: string) => {
      if (key === 'evidenceQuery') return evidenceQuery
      return undefined
    }),
  }

  return { ctx, registered, evidenceQuery }
}

describe('tool-reachability-delta', () => {
  it('registers the tool on apply', () => {
    const { ctx, registered } = createMockCtx({ hasEvidenceQuery: true })
    apply(ctx as never)

    expect(ctx.tools.register).toHaveBeenCalledTimes(1)
    expect(registered).toHaveLength(1)
    expect(registered[0].name).toBe('reachability_delta')
  })

  it('execute delegates to evidenceQuery.reachabilityDelta', async () => {
    const { ctx, registered, evidenceQuery } = createMockCtx({ hasEvidenceQuery: true })
    apply(ctx as never)

    const tool = registered[0]
    const exec = { signal: { aborted: false } }
    const args = {
      source_id: 'asset_orders',
      target_id: 'asset_customers',
      type: 'joins',
      on: 'orders.customer_id = customers.id',
    }

    const result = await tool.execute(args, exec)

    expect(evidenceQuery!.reachabilityDelta).toHaveBeenCalledWith({
      sourceId: 'asset_orders',
      targetId: 'asset_customers',
      type: 'joins',
      on: 'orders.customer_id = customers.id',
    })
    expect(result.ok).toBe(true)
    expect(result.newlyReachableCount).toBe(2)
    expect(result.newlyReachable).toEqual([
      { from: 'asset_orders', to: 'asset_addresses' },
      { from: 'asset_line_items', to: 'asset_customers' },
    ])
    expect(result.message).toBeNull()
  })

  it('execute without on parameter omits it from the proposed relation', async () => {
    const { ctx, registered, evidenceQuery } = createMockCtx({ hasEvidenceQuery: true })
    apply(ctx as never)

    const tool = registered[0]
    const exec = { signal: { aborted: false } }
    const args = {
      source_id: 'asset_a',
      target_id: 'asset_b',
      type: 'related_to',
    }

    await tool.execute(args, exec)

    expect(evidenceQuery!.reachabilityDelta).toHaveBeenCalledWith({
      sourceId: 'asset_a',
      targetId: 'asset_b',
      type: 'related_to',
    })
  })

  it('returns not-configured result when evidenceQuery is absent', async () => {
    const { ctx, registered } = createMockCtx({ hasEvidenceQuery: false })
    apply(ctx as never)

    const tool = registered[0]
    const exec = { signal: { aborted: false } }
    const args = {
      source_id: 'asset_x',
      target_id: 'asset_y',
      type: 'derived_from',
    }

    const result = await tool.execute(args, exec)

    expect(result.ok).toBe(false)
    expect(result.message).toBe('evidenceQuery service not mounted')
    expect(result.newlyReachableCount).toBe(0)
    expect(result.newlyReachable).toEqual([])
    expect(result.proposedRelation).toEqual({
      sourceId: 'asset_x',
      targetId: 'asset_y',
      type: 'derived_from',
    })
  })

  describe('formatReachabilityDelta', () => {
    it('formats a successful result', () => {
      const result = {
        ok: true,
        proposedRelation: { sourceId: 'a', targetId: 'b', type: 'joins', on: 'a.id = b.a_id' },
        newlyReachableCount: 2,
        newlyReachable: [{ from: 'a', to: 'c' }, { from: 'd', to: 'b' }],
        message: null,
      }
      const output = formatReachabilityDelta(result)
      expect(output).toContain('Proposed relation: a —[joins]→ b')
      expect(output).toContain('Join condition: a.id = b.a_id')
      expect(output).toContain('Newly reachable pairs: 2')
      expect(output).toContain('a ↔ c')
      expect(output).toContain('d ↔ b')
    })

    it('formats a failed result', () => {
      const result = {
        ok: false,
        proposedRelation: { sourceId: 'x', targetId: 'y', type: 'joins' },
        newlyReachableCount: 0,
        newlyReachable: [],
        message: 'evidenceQuery service not mounted',
      }
      const output = formatReachabilityDelta(result)
      expect(output).toBe('evidenceQuery service not mounted')
    })

    it('shows truncation notice for >20 pairs', () => {
      const pairs = Array.from({ length: 25 }, (_, i) => ({ from: `a${i}`, to: `b${i}` }))
      const result = {
        ok: true,
        proposedRelation: { sourceId: 'x', targetId: 'y', type: 'joins' },
        newlyReachableCount: 25,
        newlyReachable: pairs,
        message: null,
      }
      const output = formatReachabilityDelta(result)
      expect(output).toContain('... +5 more')
    })
  })

  describe('projectMeta', () => {
    it('projects result to JsonValue record', () => {
      const result = {
        ok: true,
        proposedRelation: { sourceId: 'a', targetId: 'b', type: 'joins', on: 'x' },
        newlyReachableCount: 1,
        newlyReachable: [{ from: 'a', to: 'c' }],
        message: null,
      }
      const meta = projectMeta(result)
      expect(meta.ok).toBe(true)
      expect(meta.newlyReachableCount).toBe(1)
      expect(meta.proposedRelation).toEqual({ sourceId: 'a', targetId: 'b', type: 'joins', on: 'x' })
      expect(meta.newlyReachable).toEqual([{ from: 'a', to: 'c' }])
    })
  })
})
