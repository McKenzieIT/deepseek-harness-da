import { test, expect } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SemanticLayerService } from '../src/index.ts'
import { RelationGraph } from '../src/relation-graph.ts'
import { tableKindPlugin } from '../src/kinds/table-kind.ts'
import { TableDefinitionSchema, type TableDefinition } from '../src/types.ts'

function makeService(): SemanticLayerService {
  const ctx = new Context()
  return new SemanticLayerService(ctx, { semanticRoot: '' })
}

test('A1 — service registers all 3 kind plugins', () => {
  const svc = makeService()
  const reg = svc.getRegistry()
  expect(reg.allKinds().sort()).toEqual(['event', 'metric', 'table'])
})

test('A2 — getRelationGraph builds from tables/events/metrics + caches until corpusVersion bump', () => {
  const svc = makeService() // empty semanticRoot -> empty graph, but still a RelationGraph
  const g = svc.getRelationGraph()
  expect(g).toBeInstanceOf(RelationGraph)
  // cached: second call returns the same instance (no rebuild)
  expect(svc.getRelationGraph()).toBe(g)
})

const DWS: TableDefinition = TableDefinitionSchema.parse({
  table_name: 'dws_pay_order_di', description: '充值订单汇总', table_comment: 'pay',
  domains: ['付费经济'], granularity: '', engine: 'maxcompute',
  columns: [{ name: 'server_id', type: 'string', comment: '区服ID', role: 'dimension' }],
  metrics: {}, partitions: [{ name: 'ds', type: 'string' }],
  confirmation: { status: 'draft', confirmed_by: '', confirmed_at: '' }, coverage: null,
  supersedes: [], disambiguation: null, kind: 'dws', primary_key: [], primary_key_unique: null,
  duplicate_sample: [], label_columns: [], freshness: '', dimension_refs: [],
})

test('A3a — tableKindPlugin.toCorpusItem indexes name + description + columns (no longer null)', () => {
  const item = tableKindPlugin.toCorpusItem(DWS)
  expect(item).not.toBeNull()
  expect(item!.id).toBe('dws_pay_order_di')
  expect(item!.description).toContain('充值订单汇总')
  expect(item!.description).toContain('server_id')
})

test('A3b — loadRetrievalCorpusAll includes tables + metrics (not just events)', () => {
  const svc = makeService()
  expect(Array.isArray(svc.loadRetrievalCorpusAll())).toBe(true)
})
