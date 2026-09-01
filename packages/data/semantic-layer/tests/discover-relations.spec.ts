/**
 * discoverRelations Service method + on-write hook (B3) — `ctx.schema`
 * enrichment entry. G3: discoverRelations delegates to the substrate
 * `enrichAllDwsTables`; the on-write hook fires after syncWrite/updateTableMeta
 * (gated by autoEnrich). No Tier-2 audit for the enrichment itself (auto-derived).
 */
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import yaml from 'js-yaml'
import { SemanticLayerService, type Tier2Recorder } from '../src/index.ts'
import { dumpYaml } from '../src/io.ts'
import type { TableDefinition, TableMeta } from '../src/types.ts'

const dimDoc = (name: string, pk: string): TableDefinition => ({
  table_name: name, table_comment: '', description: `${name} 维度表`, alt_labels: [], domains: [],
  granularity: '', engine: 'maxcompute',
  columns: [{ name: pk, type: 'string', comment: 'pk', role: 'dimension' }, { name: `${pk}_name`, type: 'string', comment: 'name', role: 'dimension' }],
  metrics: {}, partitions: [], confirmation: { status: 'draft', confirmed_by: '', confirmed_at: '' },
  coverage: null, supersedes: [], disambiguation: null, kind: 'dim', primary_key: [pk], primary_key_unique: null,
  duplicate_sample: [], label_columns: [`${pk}_name`], freshness: 'static_reference', dimension_refs: [],
} as TableDefinition)

const dwsDoc = (name: string, cols: Array<{ name: string; comment?: string }>): TableDefinition => ({
  table_name: name, table_comment: '', description: `${name} dws`, alt_labels: [], domains: [],
  granularity: '', engine: 'maxcompute',
  columns: cols.map(c => ({ name: c.name, type: 'string', comment: c.comment ?? '', role: 'dimension' })),
  metrics: {}, partitions: [], confirmation: { status: 'draft', confirmed_by: '', confirmed_at: '' },
  coverage: null, supersedes: [], disambiguation: null, kind: 'dws', primary_key: [], primary_key_unique: null,
  duplicate_sample: [], label_columns: [], freshness: '', dimension_refs: [],
} as TableDefinition)

function newLayer(...dws: Array<{ name: string; cols: Array<{ name: string; comment?: string }> }>): string {
  const dir = mkdtempSync(join(tmpdir(), 'k11-b3-'))
  writeFileSync(join(dir, 'config.yaml'), 'project:\n  name: t\n  scope_id: t\n')
  mkdirSync(join(dir, 'tables'), { recursive: true })
  writeFileSync(join(dir, 'tables', 'dim_server.yaml'), dumpYaml(dimDoc('dim_server', 'server_id')))
  for (const d of dws) writeFileSync(join(dir, 'tables', `${d.name}.yaml`), dumpYaml(dwsDoc(d.name, d.cols)))
  return dir
}
function readRefs(dir: string, name: string): unknown[] {
  const f = readFileSync(join(dir, 'tables', `${name}.yaml`), 'utf-8')
  return ((yaml.load(f) as Record<string, unknown>).dimension_refs as unknown[]) ?? []
}

const noopRecorder: Tier2Recorder = { recordTier2Write: () => 'log-id' }

describe('ctx.schema.discoverRelations (B3)', () => {
  let dir: string
  beforeEach(() => {}) // dir set per-test below
  afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })

  test('discoverRelations writes dimension_refs into DWS tables (deterministic round, no llmCall)', async () => {
    dir = newLayer({ name: 'dws_pay', cols: [{ name: 'server_id', comment: '区服ID' }] })
    const ctx = new Context()
    const schema = new SemanticLayerService(ctx, { semanticRoot: dir })
    const res = await schema.discoverRelations()
    expect(res.written).toBe(1)
    expect(res.enriched).toBe(1)
    expect(readRefs(dir, 'dws_pay')).toHaveLength(1)
  })

  test('discoverRelations with tables? filter enriches only the named tables', async () => {
    dir = newLayer({ name: 'dws_a', cols: [{ name: 'server_id' }] }, { name: 'dws_b', cols: [{ name: 'server_id' }] })
    const ctx = new Context()
    const schema = new SemanticLayerService(ctx, { semanticRoot: dir })
    const res = await schema.discoverRelations({ tables: ['dws_a'] })
    expect(res.written).toBe(1)
    expect(readRefs(dir, 'dws_a')).toHaveLength(1)
    expect(readRefs(dir, 'dws_b')).toHaveLength(0)
  })
})

describe('ctx.schema on-write hook (B3, G3 auto-trigger)', () => {
  let dir: string
  beforeEach(() => {})
  afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })

  test('syncWrite of a DWS triggers the on-write hook -> dimension_refs written', async () => {
    dir = newLayer()
    const ctx = new Context()
    ctx.provide('audit', noopRecorder as never)
    const schema = new SemanticLayerService(ctx, { semanticRoot: dir })
    const meta: TableMeta = {
      table_name: 'dws_pay', comment: 'pay',
      partitions: [{ name: 'ds', type: 'string' }],
      columns: [{ name: 'server_id', type: 'string', comment: '区服ID' }, { name: 'pay_amt', type: 'double', comment: '金额' }],
    }
    const res = await schema.syncWrite([meta])
    expect(res.written).toBe(1)
    // hook fired: the just-written DWS now has dimension_refs (deterministic: server_id matches dim_server PK)
    expect(readRefs(dir, 'dws_pay')).toHaveLength(1)
  })

  test('autoEnrich=false suppresses the on-write hook', async () => {
    dir = newLayer()
    const ctx = new Context()
    ctx.provide('audit', noopRecorder as never)
    const schema = new SemanticLayerService(ctx, { semanticRoot: dir, autoEnrich: false })
    const meta: TableMeta = { table_name: 'dws_pay', comment: 'pay', partitions: [], columns: [{ name: 'server_id', type: 'string', comment: '区服ID' }] }
    await schema.syncWrite([meta])
    expect(readRefs(dir, 'dws_pay')).toHaveLength(0) // hook suppressed
  })
})
