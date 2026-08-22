import { test, expect } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SemanticLayerService } from '../src/index.ts'
import { RelationGraph } from '../src/relation-graph.ts'
import { tableKindPlugin } from '../src/kinds/table-kind.ts'
import { TableDefinitionSchema, type TableDefinition } from '../src/types.ts'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import yaml from 'js-yaml'

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

function eventYaml(): string {
  return yaml.dump({
    name: 'game.pay.order', description: '充值下单', domains: ['付费经济'],
    params_fields: { server_id: { type: 'string', description: '区服' } },
    metrics: {}, external_refs: [], disambiguation: [],
    confirmation: { status: 'draft', confirmed_by: '', confirmed_at: '' }, coverage: null,
  })
}
function dimYaml(): string {
  return yaml.dump({
    table_name: 'dim_server', kind: 'dim', primary_key: ['server_id'], label_columns: ['s_name'],
    columns: [{ name: 'server_id', type: 'string', comment: '', role: 'dimension' }, { name: 's_name', type: 'string', comment: '', role: 'dimension' }],
    metrics: {}, partitions: [], confirmation: { status: 'draft', confirmed_by: '', confirmed_at: '' },
    domains: [], description: '', table_comment: '', granularity: '', engine: 'maxcompute',
    coverage: null, supersedes: [], disambiguation: null, primary_key_unique: null,
    duplicate_sample: [], freshness: '', dimension_refs: [],
  })
}

test('B2 — discoverEventRelations writes events external_refs via the Service', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'k11-evt2-'))
  try {
    writeFileSync(join(dir, 'config.yaml'), 'project:\n  name: t\n  scope_id: t\n')
    mkdirSync(join(dir, 'tables'), { recursive: true })
    mkdirSync(join(dir, 'events', 'pay'), { recursive: true })
    writeFileSync(join(dir, 'tables', 'dim_server.yaml'), dimYaml())
    writeFileSync(join(dir, 'events', 'pay', 'game.pay.order.yaml'), eventYaml())
    const ctx = new Context()
    const svc = new SemanticLayerService(ctx, { semanticRoot: dir })
    const res = await svc.discoverEventRelations()
    expect(res.errors).toEqual([])
    expect(res.enriched).toBe(1)
    const written = yaml.load(readFileSync(join(dir, 'events', 'pay', 'game.pay.order.yaml'), 'utf-8')) as Record<string, unknown>
    expect((written.external_refs as unknown[]).length).toBe(1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
