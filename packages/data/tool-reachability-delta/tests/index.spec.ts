import { describe, it, expect, vi } from 'vitest'
import { apply, formatReachabilityDelta, projectMeta } from '../src/index.ts'

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
    expect(registered[0]!.name).toBe('reachability_delta')
  })

  it('execute delegates to evidenceQuery.reachabilityDelta', async () => {
    const { ctx, registered, evidenceQuery } = createMockCtx({ hasEvidenceQuery: true })
    apply(ctx as never)

    const tool = registered[0]!
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
    expect(result.message).toBeUndefined()
  })

  it('execute without on parameter omits it from the proposed relation', async () => {
    const { ctx, registered, evidenceQuery } = createMockCtx({ hasEvidenceQuery: true })
    apply(ctx as never)

    const tool = registered[0]!
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

    const tool = registered[0]!
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
      }
      const meta = projectMeta(result)
      expect(meta.ok).toBe(true)
      expect(meta.newlyReachableCount).toBe(1)
      expect(meta.proposedRelation).toEqual({ sourceId: 'a', targetId: 'b', type: 'joins', on: 'x' })
      expect(meta.newlyReachable).toEqual([{ from: 'a', to: 'c' }])
    })
  })
})

/**
 * Presentation/wiring face of the registered definition. `defineTool` wraps the
 * tool-owned presenters behind a soft argument validation, so every call below
 * passes schema-valid arguments — invalid ones short-circuit to `undefined`
 * inside the wrapper and would never reach the tool's own code.
 */
interface ToolContract {
  name: string
  output: {
    render: (args: unknown, value: unknown) => { type: string; text: string }[]
    presentationMeta: (args: unknown, value: unknown) => Record<string, unknown>
  }
  execute: (args: Record<string, unknown>, exec: { signal: { aborted: boolean } }) => Promise<Record<string, unknown>>
  presentCall: (args: unknown) => unknown
  presentResult: (args: unknown, result: { isError?: boolean; meta?: unknown }) => unknown
}

function registerContract(opts: { hasEvidenceQuery?: boolean } = {}): ToolContract {
  const { ctx, registered } = createMockCtx(opts)
  apply(ctx as never)
  return registered[0]! as unknown as ToolContract
}

/** Schema-valid call arguments; `on` is the only optional parameter. */
const CALL_ARGS = { source_id: 'asset_orders', target_id: 'asset_customers', type: 'joins' }

describe('tool-reachability-delta contract shell', () => {
  describe('output.render', () => {
    // `newlyReachableCount` (5) deliberately differs from `newlyReachable.length`
    // (2) so the summary line pins the counter field rather than the array size.
    it('renders the relation header, join condition, counter and pair list', () => {
      const tool = registerContract({ hasEvidenceQuery: true })

      const blocks = tool.output.render(CALL_ARGS, {
        ok: true,
        proposedRelation: {
          sourceId: 'asset_orders',
          targetId: 'asset_customers',
          type: 'joins',
          on: 'orders.customer_id = customers.id',
        },
        newlyReachableCount: 5,
        newlyReachable: [
          { from: 'asset_orders', to: 'asset_addresses' },
          { from: 'asset_line_items', to: 'asset_customers' },
        ],
      })

      expect(blocks).toStrictEqual([{
        type: 'text',
        text: [
          'Proposed relation: asset_orders —[joins]→ asset_customers',
          '  Join condition: orders.customer_id = customers.id',
          '',
          'Newly reachable pairs: 5',
          '  asset_orders ↔ asset_addresses',
          '  asset_line_items ↔ asset_customers',
        ].join('\n'),
      }])
    })

    it('renders the no-new-pairs notice when nothing becomes reachable', () => {
      const tool = registerContract({ hasEvidenceQuery: true })

      const blocks = tool.output.render(CALL_ARGS, {
        ok: true,
        proposedRelation: { sourceId: 'asset_a', targetId: 'asset_b', type: 'related_to' },
        newlyReachableCount: 0,
        newlyReachable: [],
      })

      expect(blocks).toStrictEqual([{
        type: 'text',
        text: [
          'Proposed relation: asset_a —[related_to]→ asset_b',
          '',
          'Newly reachable pairs: 0',
          '  (no new pairs — all paths already exist)',
        ].join('\n'),
      }])
    })

    it('renders the default failure text when a failed value carries no message', () => {
      const tool = registerContract({ hasEvidenceQuery: true })

      const blocks = tool.output.render(CALL_ARGS, {
        ok: false,
        proposedRelation: { sourceId: 'asset_a', targetId: 'asset_b', type: 'joins' },
        newlyReachableCount: 0,
        newlyReachable: [],
      })

      expect(blocks).toStrictEqual([{ type: 'text', text: 'reachability_delta failed' }])
    })
  })

  describe('output.presentationMeta', () => {
    // Same asymmetry as above: counter 5 vs two pairs, and each pair's from/to
    // differ, so a swapped field mapping cannot pass.
    it('projects a successful value with its join condition into the meta record', () => {
      const tool = registerContract({ hasEvidenceQuery: true })

      const meta = tool.output.presentationMeta(CALL_ARGS, {
        ok: true,
        proposedRelation: {
          sourceId: 'asset_orders',
          targetId: 'asset_customers',
          type: 'joins',
          on: 'orders.customer_id = customers.id',
        },
        newlyReachableCount: 5,
        newlyReachable: [
          { from: 'asset_orders', to: 'asset_addresses' },
          { from: 'asset_line_items', to: 'asset_customers' },
        ],
      })

      expect(meta).toStrictEqual({
        ok: true,
        newlyReachableCount: 5,
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
      })
    })

    it('carries the failure message and omits an absent join condition', () => {
      const tool = registerContract({ hasEvidenceQuery: false })

      const meta = tool.output.presentationMeta(CALL_ARGS, {
        ok: false,
        proposedRelation: { sourceId: 'asset_x', targetId: 'asset_y', type: 'derived_from' },
        newlyReachableCount: 0,
        newlyReachable: [],
        message: 'evidenceQuery service not mounted',
      })

      expect(meta).toStrictEqual({
        ok: false,
        newlyReachableCount: 0,
        message: 'evidenceQuery service not mounted',
        proposedRelation: { sourceId: 'asset_x', targetId: 'asset_y', type: 'derived_from' },
        newlyReachable: [],
      })
    })
  })

  describe('execute guard paths', () => {
    it('rejects with the abort message when the signal is already aborted', async () => {
      const tool = registerContract({ hasEvidenceQuery: true })

      await expect(tool.execute(CALL_ARGS, { signal: { aborted: true } }))
        .rejects.toThrowError(new Error('reachability_delta aborted'))
    })

    it('echoes the join condition in the not-mounted result when one was supplied', async () => {
      const tool = registerContract({ hasEvidenceQuery: false })

      const result = await tool.execute(
        { source_id: 'asset_x', target_id: 'asset_y', type: 'joins', on: 'x.id = y.x_id' },
        { signal: { aborted: false } },
      )

      expect(result).toStrictEqual({
        ok: false,
        proposedRelation: { sourceId: 'asset_x', targetId: 'asset_y', type: 'joins', on: 'x.id = y.x_id' },
        newlyReachableCount: 0,
        newlyReachable: [],
        message: 'evidenceQuery service not mounted',
      })
    })
  })

  describe('presentCall', () => {
    it('presents a generic search card while the call is pending', () => {
      const tool = registerContract({ hasEvidenceQuery: true })

      expect(tool.presentCall(CALL_ARGS)).toStrictEqual({
        card: 'generic',
        title: 'Reachability Delta',
        kind: 'search',
      })
    })
  })

  describe('presentResult', () => {
    it('presents nothing for an errored result', () => {
      const tool = registerContract({ hasEvidenceQuery: true })

      expect(tool.presentResult(CALL_ARGS, { isError: true, meta: { ok: true, newlyReachableCount: 7 } }))
        .toBeUndefined()
    })

    it('presents an unavailable card when the result carries no meta', () => {
      const tool = registerContract({ hasEvidenceQuery: true })

      expect(tool.presentResult(CALL_ARGS, {})).toStrictEqual({
        card: 'generic',
        title: 'Reachability result unavailable',
      })
    })

    it('presents the not-mounted card when meta reports failure', () => {
      const tool = registerContract({ hasEvidenceQuery: false })

      expect(tool.presentResult(CALL_ARGS, { meta: { ok: false, newlyReachableCount: 0 } })).toStrictEqual({
        card: 'generic',
        title: 'evidenceQuery service not mounted',
      })
    })

    it('titles the exact pair count, pluralised, when several pairs become reachable', () => {
      const tool = registerContract({ hasEvidenceQuery: true })

      expect(tool.presentResult(CALL_ARGS, { meta: { ok: true, newlyReachableCount: 7 } })).toStrictEqual({
        card: 'generic',
        title: '7 newly reachable pairs',
      })
    })

    it('titles a single newly reachable pair in the singular', () => {
      const tool = registerContract({ hasEvidenceQuery: true })

      expect(tool.presentResult(CALL_ARGS, { meta: { ok: true, newlyReachableCount: 1 } })).toStrictEqual({
        card: 'generic',
        title: '1 newly reachable pair',
      })
    })
  })
})
