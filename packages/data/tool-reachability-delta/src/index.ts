/**
 * Model-facing `reachability_delta` tool — computes how many new asset pairs
 * become reachable via joins if a proposed relation is added to the knowledge
 * graph. Use to assess the impact of adding a new relation.
 *
 * @module @deepseek-ai/dsh-tool-reachability-delta
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, ToolResult, JsonValue } from '@deepseek-ai/dsh-tools'

export const name = 'tool-reachability-delta'
export const inject = ['tools']

export interface Config {}
export const Config: z<Config> = z.object({})

export interface ProposedRelation {
  sourceId: string
  targetId: string
  type: 'joins' | 'derived_from' | 'related_to'
  on?: string
}

export interface ReachablePair {
  from: string
  to: string
}

export interface ReachabilityDeltaResult {
  proposedRelation: ProposedRelation
  newlyReachable: ReachablePair[]
}

export interface ReachabilityDeltaToolResult {
  ok: boolean
  proposedRelation: { sourceId: string; targetId: string; type: string; on?: string }
  newlyReachableCount: number
  newlyReachable: Array<{ from: string; to: string }>
  message: string | null
}

/** Service seam for evidence-query's reachabilityDelta RPC. */
export interface EvidenceQueryService {
  reachabilityDelta(newRelation: ProposedRelation): ReachabilityDeltaResult | Promise<ReachabilityDeltaResult>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    evidenceQuery?: EvidenceQueryService
  }
}

export function formatReachabilityDelta(value: ReachabilityDeltaToolResult): string {
  if (!value.ok) return value.message ?? 'reachability_delta failed'

  const lines: string[] = []
  const rel = value.proposedRelation
  lines.push(`Proposed relation: ${rel.sourceId} —[${rel.type}]→ ${rel.targetId}`)
  if (rel.on) lines.push(`  Join condition: ${rel.on}`)
  lines.push(`\nNewly reachable pairs: ${value.newlyReachableCount}`)

  if (value.newlyReachable.length > 0) {
    const display = value.newlyReachable.slice(0, 20)
    for (const pair of display) {
      lines.push(`  ${pair.from} ↔ ${pair.to}`)
    }
    if (value.newlyReachable.length > 20) {
      lines.push(`  ... +${value.newlyReachable.length - 20} more`)
    }
  } else {
    lines.push('  (no new pairs — all paths already exist)')
  }

  return lines.join('\n')
}

/** Project ReachabilityDeltaToolResult into a JsonValue-compatible record for persistence. */
export function projectMeta(v: ReachabilityDeltaToolResult): { [key: string]: JsonValue } {
  const meta: { [key: string]: JsonValue } = {
    ok: v.ok,
    newlyReachableCount: v.newlyReachableCount,
    message: v.message,
  }
  meta.proposedRelation = {
    sourceId: v.proposedRelation.sourceId,
    targetId: v.proposedRelation.targetId,
    type: v.proposedRelation.type,
    ...(v.proposedRelation.on != null ? { on: v.proposedRelation.on } : {}),
  }
  meta.newlyReachable = v.newlyReachable.map(p => ({ from: p.from, to: p.to }))
  return meta
}

export function apply(ctx: Context, _config: Config = {}): void {
  ctx.tools.register(defineTool({
    name: 'reachability_delta',
    description:
      'Compute reachability delta: if a proposed relation is added, which asset pairs become newly reachable via joins? '
      + 'Use to assess the impact of adding a new relation to the knowledge graph.',
    parameters: {
      source_id: {
        type: 'string',
        description: 'Source asset ID for the proposed relation',
        required: true,
      },
      target_id: {
        type: 'string',
        description: 'Target asset ID for the proposed relation',
        required: true,
      },
      type: {
        type: 'string',
        description: 'Relation type (joins | derived_from | related_to)',
        required: true,
      },
      on: {
        type: 'string',
        description: 'Join condition expression (for joins type)',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean', required: true },
          newlyReachableCount: { type: 'number' },
          message: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatReachabilityDelta(value as unknown as ReachabilityDeltaToolResult) }],
      presentationMeta: (_args, value) => {
        const v = value as unknown as ReachabilityDeltaToolResult
        return projectMeta(v)
      },
    },
    async execute(args, exec) {
      if (exec.signal.aborted) throw new Error('reachability_delta aborted')

      const evidenceQuery = ctx.get('evidenceQuery') as EvidenceQueryService | undefined

      if (!evidenceQuery) {
        return {
          ok: false,
          proposedRelation: {
            sourceId: args.source_id,
            targetId: args.target_id,
            type: args.type,
            ...(args.on != null ? { on: args.on } : {}),
          },
          newlyReachableCount: 0,
          newlyReachable: [],
          message: 'evidenceQuery service not mounted',
        } as unknown as ReachabilityDeltaToolResult
      }

      const proposed: ProposedRelation = {
        sourceId: args.source_id,
        targetId: args.target_id,
        type: args.type as ProposedRelation['type'],
        ...(args.on != null ? { on: args.on } : {}),
      }

      const result = await evidenceQuery.reachabilityDelta(proposed)

      return {
        ok: true,
        proposedRelation: result.proposedRelation,
        newlyReachableCount: result.newlyReachable.length,
        newlyReachable: result.newlyReachable,
        message: null,
      } as unknown as ReachabilityDeltaToolResult
    },
    presentCall(): GenericCallView {
      return {
        card: 'generic',
        title: 'Reachability Delta',
        kind: 'search',
      }
    },
    presentResult(_args, result: ToolResult): GenericResultView | undefined {
      if (result.isError) return undefined
      const meta = result.meta as Record<string, unknown> | undefined
      if (!meta) return { card: 'generic', title: 'Reachability result unavailable' }

      if (!meta.ok) {
        return { card: 'generic', title: 'evidenceQuery service not mounted' }
      }

      const count = meta.newlyReachableCount as number
      return {
        card: 'generic',
        title: `${count} newly reachable pair${count === 1 ? '' : 's'}`,
      }
    },
  }))
}
