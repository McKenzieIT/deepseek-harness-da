/**
 * Model-facing `resolve_term` tool — exact alias resolution for the data agent.
 * The agent calls it to disambiguate a business term (e.g. "DAU", "付费用户")
 * into specific data-source nodes via the relation graph's SKOS reverse index.
 *
 * Replaces the prior `lookup_terminology` tool (CL-1 Phase 2: aliases live on
 * definitions, not in a flat file; resolution is graph-powered, not file-scan).
 *
 * @module @deepseek-ai/dsh-tool-resolve-term
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'tool-resolve-term'
export const inject = ['tools']

export interface Config {}
export const Config: z<Config> = z.object({})

interface RelationGraphEdge {
  readonly targetId: string
  readonly type: string
  readonly on?: string
  readonly description?: string
}

interface RelationGraphSource {
  resolveAlias(term: string): string[]
  getAliases(nodeId: string): string[]
  getRelated(sourceId: string, type?: string): readonly RelationGraphEdge[]
}

function probeGraph(ctx: Context, scopeId?: string): RelationGraphSource | undefined {
  const schema = ctx.get('schema') as { getRelationGraph?: unknown } | undefined
  if (schema === undefined || typeof schema.getRelationGraph !== 'function') return undefined
  const graph = (schema as { getRelationGraph(scopeId?: string): unknown }).getRelationGraph(scopeId) as RelationGraphSource
  if (typeof graph.resolveAlias !== 'function') return undefined
  return graph
}

export function apply(ctx: Context, _config: Config = {}): void {
  ctx.tools.register(defineTool({
    name: 'resolve_term',
    description:
      '将业务术语精确解析为数据资产（匹配 alt_labels/pref_label），返回命中节点及图上下文。'
      + '用于消歧：当你不确定一个业务概念对应哪些表/事件/指标时调用此工具。',
    parameters: {
      term: {
        type: 'string',
        required: true,
        description: '要解析的业务术语（如 "DAU"、"付费用户"、"活跃"）',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          term: { type: 'string', required: true },
          matched: { type: 'boolean', required: true },
          nodes: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                aliases: { type: 'array', required: true, items: { type: 'string' } },
                relations: {
                  type: 'array',
                  required: true,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      targetId: { type: 'string', required: true },
                      type: { type: 'string', required: true },
                      on: { type: 'string' },
                      description: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      render: (_args, value) => {
        const lines: string[] = []
        if (!value.matched) {
          lines.push(`未找到匹配 "${value.term}" 的数据资产。`)
        } else {
          lines.push(`"${value.term}" 解析到 ${value.nodes.length} 个数据资产：`)
          for (const node of value.nodes) {
            lines.push(`  • ${node.id}`)
            if (node.aliases.length > 0) {
              lines.push(`    别名: ${node.aliases.join(', ')}`)
            }
            if (node.relations.length > 0) {
              lines.push(`    关联: ${node.relations.map(r => `${r.type}→${r.targetId}`).join(', ')}`)
            }
          }
        }
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args, exec) {
      const graph = probeGraph(ctx, exec.scopeId)
      if (!graph) {
        return { term: args.term, matched: false, nodes: [] }
      }
      const nodeIds = graph.resolveAlias(args.term)
      if (nodeIds.length === 0) {
        return { term: args.term, matched: false, nodes: [] }
      }
      const MAX_RELATIONS = 10
      const nodes = nodeIds.map(id => ({
        id,
        aliases: [...graph.getAliases(id)],
        relations: graph.getRelated(id).slice(0, MAX_RELATIONS).map(r => ({
          targetId: r.targetId,
          type: r.type,
          ...(r.on ? { on: r.on } : {}),
          ...(r.description ? { description: r.description } : {}),
        })),
      }))
      return { term: args.term, matched: true, nodes }
    },
  }))
}
