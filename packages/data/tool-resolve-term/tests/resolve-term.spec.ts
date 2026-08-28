/**
 * CL-1 Phase 2: resolve_term tool tests.
 */
import { test, expect } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply } from '../src/index.ts'

function createMockGraph(data: { nodeId: string; aliases: string[]; relations: { targetId: string; type: string; on?: string }[] }[]) {
  const aliasIndex = new Map<string, string[]>()
  const nodeAliases = new Map<string, string[]>()
  const nodeRelations = new Map<string, { targetId: string; type: string; on?: string }[]>()

  for (const node of data) {
    nodeAliases.set(node.nodeId, node.aliases)
    nodeRelations.set(node.nodeId, node.relations)
    for (const alias of node.aliases) {
      const key = alias.toLowerCase().trim()
      const list = aliasIndex.get(key) ?? []
      if (!list.includes(node.nodeId)) list.push(node.nodeId)
      aliasIndex.set(key, list)
    }
  }

  return {
    resolveAlias(term: string): string[] {
      return aliasIndex.get(term.toLowerCase().trim()) ?? []
    },
    getAliases(nodeId: string): string[] {
      return nodeAliases.get(nodeId) ?? []
    },
    getRelated(sourceId: string): { targetId: string; type: string; on?: string }[] {
      return nodeRelations.get(sourceId) ?? []
    },
  }
}

interface ToolDef {
  readonly name: string
  readonly execute: (args: { term: string }, exec: { signal: AbortSignal }) => Promise<{
    term: string
    matched: boolean
    nodes: { id: string; aliases: string[]; relations: { targetId: string; type: string; on?: string }[] }[]
  }>
}

function registerTool(schemaValue?: unknown): ToolDef {
  let def: ToolDef | undefined
  const ctx = {
    tools: { register: (d: ToolDef) => { def = d } },
    get: (key: string) => (key === 'schema' ? schemaValue : undefined),
  } as unknown as Context
  apply(ctx)
  if (def === undefined) throw new Error('apply did not register a tool')
  return def
}

test('resolve_term — matched term returns nodes with aliases and relations', async () => {
  const graph = createMockGraph([
    {
      nodeId: 'dws_active_user_di',
      aliases: ['DAU', '日活'],
      relations: [{ targetId: 'dim_user', type: 'joins', on: 'role_id = role_id' }],
    },
    {
      nodeId: 'role.online',
      aliases: ['DAU', '在线'],
      relations: [{ targetId: 'dim_server', type: 'joins', on: 'server_id = server_id' }],
    },
  ])

  const tool = registerTool({ getRelationGraph: () => graph })
  const result = await tool.execute({ term: 'DAU' }, { signal: new AbortController().signal })
  expect(result.matched).toBe(true)
  expect(result.nodes).toHaveLength(2)
  expect(result.nodes[0]!.id).toBe('dws_active_user_di')
  expect(result.nodes[0]!.aliases).toContain('DAU')
  expect(result.nodes[0]!.relations).toHaveLength(1)
  expect(result.nodes[0]!.relations[0]!.targetId).toBe('dim_user')
  expect(result.nodes[1]!.id).toBe('role.online')
})

test('resolve_term — case insensitive matching', async () => {
  const graph = createMockGraph([
    { nodeId: 'dws_pay_order_di', aliases: ['ARPPU'], relations: [] },
  ])
  const tool = registerTool({ getRelationGraph: () => graph })
  const result = await tool.execute({ term: 'arppu' }, { signal: new AbortController().signal })
  expect(result.matched).toBe(true)
  expect(result.nodes[0]!.id).toBe('dws_pay_order_di')
})

test('resolve_term — unmatched term returns empty', async () => {
  const graph = createMockGraph([
    { nodeId: 'A', aliases: ['alpha'], relations: [] },
  ])
  const tool = registerTool({ getRelationGraph: () => graph })
  const result = await tool.execute({ term: 'nonexistent' }, { signal: new AbortController().signal })
  expect(result.matched).toBe(false)
  expect(result.nodes).toHaveLength(0)
})

test('resolve_term — no schema mounted returns unmatched', async () => {
  const tool = registerTool(undefined)
  const result = await tool.execute({ term: 'DAU' }, { signal: new AbortController().signal })
  expect(result.matched).toBe(false)
  expect(result.nodes).toHaveLength(0)
})

test('resolve_term — graph without resolveAlias returns unmatched', async () => {
  const graph = { getRelated: () => [] }
  const tool = registerTool({ getRelationGraph: () => graph })
  const result = await tool.execute({ term: 'DAU' }, { signal: new AbortController().signal })
  expect(result.matched).toBe(false)
  expect(result.nodes).toHaveLength(0)
})

test('resolve_term — tool is registered with correct name', () => {
  const tool = registerTool(undefined)
  expect(tool.name).toBe('resolve_term')
})
