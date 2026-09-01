/**
 * Enrichment (B1/B2) tests — discoverRelationsFor (deterministic PK-name round
 * + LLM round, merged) + enrichAllDwsTables (writes dimension_refs back).
 * G3 §1 two-round strategy; §3 LLM results merged with deterministic.
 */
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import yaml from 'js-yaml'
import {
  discoverRelationsDeterministic,
  mergeRefs,
  discoverRelationsFor,
  enrichAllDwsTables,
  buildLlmPrompt,
  discoverEventRelationsDeterministic,
  buildEventLlmPrompt,
  enrichAllEvents,
  parseLlmRefs,
  type DimInventoryEntry,
} from '../src/enrichment.ts'
import { dumpYaml } from '../src/io.ts'
import { type TableDefinition, type EventDefinition, DimensionRefSchema, EventDefinitionSchema } from '../src/types.ts'

function dws(over: Partial<TableDefinition> = {}): TableDefinition {
  return {
    table_name: 'dws_pay_order_di',
    table_comment: 'pay',
    description: 'pay orders dws',
    domains: ['付费经济'],
    granularity: '',
    engine: 'maxcompute',
    columns: [
      { name: 'order_id', type: 'string', comment: '', role: 'dimension' },
      { name: 'role_id', type: 'string', comment: '角色ID', role: 'dimension' },
      { name: 'server_id', type: 'string', comment: '区服ID', role: 'dimension' },
    ],
    metrics: {},
    partitions: [],
    confirmation: { status: 'draft', confirmed_by: '', confirmed_at: '' },
    coverage: null,
    supersedes: [],
    disambiguation: null,
    kind: 'dws',
    primary_key: [],
    primary_key_unique: null,
    duplicate_sample: [],
    label_columns: [],
    freshness: '',
    alt_labels: [],
    dimension_refs: [],
    ...over,
  } as TableDefinition
}

const DIM_SERVER: DimInventoryEntry = { table_name: 'dim_10000251_server_info', primary_key: ['server_id'], description: '区服维度表' }
const DIM_ROLE: DimInventoryEntry = { table_name: 'dim_10000251_role_info', primary_key: ['role_id'], description: '角色维度表' }
const DIM_EMPTY: DimInventoryEntry = { table_name: 'dim_10000251_x', primary_key: [], description: 'no pk' }

describe('discoverRelationsDeterministic', () => {
  test('matches DWS columns to DIM primary_key by exact name', () => {
    const refs = discoverRelationsDeterministic(dws(), [DIM_SERVER, DIM_ROLE])
    expect(refs).toHaveLength(2)
    const byDim = Object.fromEntries(refs.map(r => [r.dim_table, r]))
    expect(byDim.dim_10000251_server_info!.join_keys).toEqual([{ dws_column: 'server_id', dim_column: 'server_id' }])
    expect(byDim.dim_10000251_role_info!.join_keys).toEqual([{ dws_column: 'role_id', dim_column: 'role_id' }])
  })

  test('derivation marks the match as deterministic', () => {
    const [r] = discoverRelationsDeterministic(dws(), [DIM_SERVER])
    expect(r!.derivation).toContain('确定性')
    expect(r!.derivation).toContain('server_id')
    expect(r!.origin).toBe('deterministic')
  })

  test('dims with empty primary_key are skipped', () => {
    const refs = discoverRelationsDeterministic(dws(), [DIM_EMPTY, DIM_SERVER])
    expect(refs).toHaveLength(1)
    expect(refs[0]!.dim_table).toBe('dim_10000251_server_info')
  })

  test('composite PK matches only the columns present in the DWS', () => {
    const dim: DimInventoryEntry = { table_name: 'dim_c', primary_key: ['server_id', 'missing_col'], description: '' }
    const [r] = discoverRelationsDeterministic(dws(), [dim])
    expect(r!.join_keys).toEqual([{ dws_column: 'server_id', dim_column: 'server_id' }])
  })

  test('emitted refs validate against DimensionRefSchema', () => {
    for (const r of discoverRelationsDeterministic(dws(), [DIM_SERVER, DIM_ROLE])) {
      expect(DimensionRefSchema.safeParse(r).success).toBe(true)
    }
  })
})

describe('mergeRefs', () => {
  test('dedupes by dim_table, unions join_keys', () => {
    const det = [{ dim_table: 'dim_s', join_keys: [{ dws_column: 'server_id', dim_column: 'server_id' }], derivation: '确定性', origin: 'deterministic' as const }]
    const llm = [
      { dim_table: 'dim_s', join_keys: [{ dws_column: 'srv_id', dim_column: 'server_id' }], derivation: 'llm: 语义匹配', origin: 'llm' as const },
      { dim_table: 'dim_new', join_keys: [{ dws_column: 'x', dim_column: 'x' }], derivation: 'llm only', origin: 'llm' as const },
    ]
    const merged = mergeRefs(det, llm)
    expect(merged).toHaveLength(2)
    const s = merged.find(m => m.dim_table === 'dim_s')!
    expect(s.join_keys).toHaveLength(2)
    expect(s.derivation).toBe('llm: 语义匹配') // LLM derivation preferred over deterministic
    expect(s.origin).toBe('llm')
  })

  test('keeps deterministic ref when LLM has nothing for that dim', () => {
    const merged = mergeRefs([{ dim_table: 'd', join_keys: [{ dws_column: 'a', dim_column: 'a' }], derivation: '确定性', origin: 'deterministic' as const }], [])
    expect(merged).toHaveLength(1)
    expect(merged[0]!.join_keys).toHaveLength(1)
    expect(merged[0]!.origin).toBe('deterministic')
  })

  test('origin=undefined (legacy) is not overridden by llm', () => {
    const legacy = [{ dim_table: 'dim_s', join_keys: [{ dws_column: 'a', dim_column: 'a' }], derivation: 'curated by analyst' }]
    const llm = [{ dim_table: 'dim_s', join_keys: [{ dws_column: 'b', dim_column: 'b' }], derivation: 'llm suggested', origin: 'llm' as const }]
    const merged = mergeRefs(legacy, llm)
    expect(merged).toHaveLength(1)
    expect(merged[0]!.derivation).toBe('curated by analyst') // legacy (undefined origin) not overridden
    expect(merged[0]!.origin).toBeUndefined()
    expect(merged[0]!.join_keys).toHaveLength(2) // join_keys still unioned
  })

  test('origin=manual is not overridden by llm or deterministic', () => {
    const manual = [{ dim_table: 'dim_s', join_keys: [{ dws_column: 'a', dim_column: 'a' }], derivation: 'manual', origin: 'manual' as const }]
    const llm = [{ dim_table: 'dim_s', join_keys: [{ dws_column: 'a', dim_column: 'a' }], derivation: 'llm says', origin: 'llm' as const }]
    const merged = mergeRefs(manual, llm)
    expect(merged[0]!.derivation).toBe('manual')
    expect(merged[0]!.origin).toBe('manual')
  })

  test('origin=deterministic is overridden by llm', () => {
    const det = [{ dim_table: 'dim_s', join_keys: [{ dws_column: 'a', dim_column: 'a' }], derivation: 'det', origin: 'deterministic' as const }]
    const llm = [{ dim_table: 'dim_s', join_keys: [{ dws_column: 'a', dim_column: 'a' }], derivation: 'llm', origin: 'llm' as const }]
    const merged = mergeRefs(det, llm)
    expect(merged[0]!.derivation).toBe('llm')
    expect(merged[0]!.origin).toBe('llm')
  })

  test('origin=llm is overridden by manual', () => {
    const llm = [{ dim_table: 'dim_s', join_keys: [{ dws_column: 'a', dim_column: 'a' }], derivation: 'llm', origin: 'llm' as const }]
    const manual = [{ dim_table: 'dim_s', join_keys: [{ dws_column: 'a', dim_column: 'a' }], derivation: 'manual', origin: 'manual' as const }]
    const merged = mergeRefs(llm, manual)
    expect(merged[0]!.derivation).toBe('manual')
    expect(merged[0]!.origin).toBe('manual')
  })
})

describe('discoverRelationsFor', () => {
  test('without llmCall -> deterministic round only', async () => {
    const refs = await discoverRelationsFor(dws(), [DIM_SERVER])
    expect(refs).toHaveLength(1)
    expect(refs[0]!.dim_table).toBe('dim_10000251_server_info')
  })

  test('with mock llmCall -> merges LLM refs with deterministic', async () => {
    const llmCall = async () => JSON.stringify([
      { dim_table: 'dim_10000251_server_info', join_keys: [{ dws_column: 'srv_id', dim_column: 'server_id' }], derivation: 'llm semantic' },
      { dim_table: 'dim_10000251_charm_info', join_keys: [{ dws_column: 'charm_id', dim_column: 'charm_id' }], derivation: 'llm new' },
    ])
    const refs = await discoverRelationsFor(dws(), [DIM_SERVER], llmCall)
    expect(refs).toHaveLength(2)
    const s = refs.find(r => r.dim_table === 'dim_10000251_server_info')!
    expect(s.join_keys).toHaveLength(2) // deterministic server_id + llm srv_id
  })

  test('llmCall throwing -> graceful, deterministic round returned', async () => {
    const llmCall = async () => { throw new Error('boom') }
    const refs = await discoverRelationsFor(dws(), [DIM_SERVER], llmCall)
    expect(refs).toHaveLength(1)
    expect(refs[0]!.derivation).toContain('确定性')
    expect(refs[0]!.origin).toBe('deterministic')
  })

  test('llmCall returning invalid JSON -> graceful, deterministic round returned', async () => {
    const llmCall = async () => 'not json {{{'
    const refs = await discoverRelationsFor(dws(), [DIM_SERVER], llmCall)
    expect(refs).toHaveLength(1)
  })

  test('buildLlmPrompt includes target columns + dim inventory', () => {
    const prompt = buildLlmPrompt(dws(), [DIM_SERVER])
    expect(prompt).toContain('dws_pay_order_di')
    expect(prompt).toContain('server_id')
    expect(prompt).toContain('dim_10000251_server_info')
  })
})

describe('enrichAllDwsTables', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'k11-enrich-'))
    writeFileSync(join(dir, 'config.yaml'), 'project:\n  name: t\n  scope_id: t\n')
    mkdirSync(join(dir, 'tables'), { recursive: true })
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  test('writes dimension_refs into DWS tables, preserves other fields (physical types)', async () => {
    // DWS with a physical type spelling (BIGINT) that canonicalizes to int on parse;
    // the write must preserve BIGINT verbatim (writeTable writes the passed raw+refs).
    const raw = dumpYaml(dws({ columns: [{ name: 'server_id', type: 'BIGINT', comment: '区服ID', role: 'dimension' }, { name: 'role_id', type: 'string', comment: '', role: 'dimension' }] }))
    writeFileSync(join(dir, 'tables', 'dws_pay_order_di.yaml'), raw)
    // a DIM to match
    const dim = { table_name: 'dim_server', kind: 'dim', primary_key: ['server_id'], label_columns: ['server_name'], columns: [{ name: 'server_id', type: 'string', comment: '', role: 'dimension' }], metrics: {}, partitions: [], confirmation: { status: 'draft', confirmed_by: '', confirmed_at: '' }, domains: [], description: '', table_comment: '', granularity: '', engine: 'maxcompute', coverage: null, supersedes: [], disambiguation: null, primary_key_unique: null, alt_labels: [], duplicate_sample: [], freshness: '', dimension_refs: [] } as TableDefinition
    writeFileSync(join(dir, 'tables', 'dim_server.yaml'), dumpYaml(dim))

    const res = await enrichAllDwsTables(dir)
    expect(res.errors).toEqual([])
    expect(res.enriched).toBe(1)
    const written = yaml.load(readFileSync(join(dir, 'tables', 'dws_pay_order_di.yaml'), 'utf-8')) as Record<string, unknown>
    expect(Array.isArray(written.dimension_refs)).toBe(true)
    expect((written.dimension_refs as unknown[]).length).toBe(1)
    // physical type preserved (not canonicalized to int)
    const cols = written.columns as Array<{ type: string }>
    expect(cols[0]!.type).toBe('BIGINT')
  })

  test('skips DIM tables (only enriches DWS)', async () => {
    writeFileSync(join(dir, 'tables', 'dim_server.yaml'), dumpYaml({ table_name: 'dim_server', kind: 'dim', primary_key: ['server_id'], label_columns: ['server_name'], columns: [{ name: 'server_id', type: 'string', comment: '', role: 'dimension' }], metrics: {}, partitions: [], confirmation: { status: 'draft', confirmed_by: '', confirmed_at: '' }, domains: [], description: '', table_comment: '', granularity: '', engine: 'maxcompute', coverage: null, supersedes: [], disambiguation: null, primary_key_unique: null, alt_labels: [], duplicate_sample: [], freshness: '', dimension_refs: [] } as TableDefinition))
    const res = await enrichAllDwsTables(dir)
    expect(res.enriched).toBe(0)
  })

  test('tables? filter enriches only the named DWS tables', async () => {
    const dimDoc = { table_name: 'dim_s', kind: 'dim' as const, primary_key: ['server_id'], label_columns: ['s_name'], columns: [{ name: 'server_id', type: 'string', comment: '', role: 'dimension' }, { name: 's_name', type: 'string', comment: '', role: 'dimension' }], metrics: {}, partitions: [], confirmation: { status: 'draft', confirmed_by: '', confirmed_at: '' }, domains: [], description: '', table_comment: '', granularity: '', engine: 'maxcompute', coverage: null, supersedes: [], disambiguation: null, primary_key_unique: null, alt_labels: [], duplicate_sample: [], freshness: '', dimension_refs: [] } as TableDefinition
    writeFileSync(join(dir, 'tables', 'dim_s.yaml'), dumpYaml(dimDoc))
    writeFileSync(join(dir, 'tables', 'dws_a.yaml'), dumpYaml(dws({ table_name: 'dws_a', columns: [{ name: 'server_id', type: 'string', comment: '', role: 'dimension' }] })))
    writeFileSync(join(dir, 'tables', 'dws_b.yaml'), dumpYaml(dws({ table_name: 'dws_b', columns: [{ name: 'server_id', type: 'string', comment: '', role: 'dimension' }] })))
    const res = await enrichAllDwsTables(dir, undefined, ['dws_a'])
    expect(res.written).toBe(1)
    const a = yaml.load(readFileSync(join(dir, 'tables', 'dws_a.yaml'), 'utf-8')) as Record<string, unknown>
    const b = yaml.load(readFileSync(join(dir, 'tables', 'dws_b.yaml'), 'utf-8')) as Record<string, unknown>
    expect((a.dimension_refs as unknown[]).length).toBe(1)
    expect((b.dimension_refs as unknown[]).length).toBe(0) // filtered out -> untouched
  })

  test('mergeExisting=true preserves curated refs the deterministic round does not rediscover', async () => {
    const dimServer = { table_name: 'dim_server', kind: 'dim' as const, primary_key: ['server_id'], label_columns: ['s_name'], columns: [{ name: 'server_id', type: 'string', comment: '', role: 'dimension' }, { name: 's_name', type: 'string', comment: '', role: 'dimension' }], metrics: {}, partitions: [], confirmation: { status: 'draft', confirmed_by: '', confirmed_at: '' }, domains: [], description: '', table_comment: '', granularity: '', engine: 'maxcompute', coverage: null, supersedes: [], disambiguation: null, primary_key_unique: null, alt_labels: [], duplicate_sample: [], freshness: '', dimension_refs: [] } as TableDefinition
    writeFileSync(join(dir, 'tables', 'dim_server.yaml'), dumpYaml(dimServer))
    const curated = { ...dws({ table_name: 'dws_pay', columns: [{ name: 'server_id', type: 'string', comment: '区服ID', role: 'dimension' }] }), dimension_refs: [{ dim_table: 'dim_other', join_keys: [{ dws_column: 'other_id', dim_column: 'other_id' }], derivation: 'curated by analyst' }] }
    writeFileSync(join(dir, 'tables', 'dws_pay.yaml'), dumpYaml(curated))
    const res = await enrichAllDwsTables(dir, undefined, ['dws_pay'], true)
    expect(res.written).toBe(1)
    const out = yaml.load(readFileSync(join(dir, 'tables', 'dws_pay.yaml'), 'utf-8')) as Record<string, unknown>
    const dimTables = (out.dimension_refs as Array<{ dim_table: string }>).map(r => r.dim_table).sort()
    expect(dimTables).toEqual(['dim_other', 'dim_server']) // curated dim_other preserved + dim_server rediscovered
  })
})

function event(over: Partial<EventDefinition> = {}): EventDefinition {
  return EventDefinitionSchema.parse({
    name: 'game.pay.order',
    description: '玩家充值下单',
    domains: ['付费经济'],
    params_fields: {
      role_id: { type: 'string', description: '角色ID' },
      server_id: { type: 'string', description: '区服ID' },
      amount: { type: 'int', description: '金额' },
    },
    metrics: {}, external_refs: [], disambiguation: [],
    confirmation: { status: 'draft', confirmed_by: '', confirmed_at: '' }, coverage: null,
    ...over,
  })
}

function dimServerYaml(): string {
  return dumpYaml({
    table_name: 'dim_server', kind: 'dim', primary_key: ['server_id'], label_columns: ['s_name'],
    columns: [{ name: 'server_id', type: 'string', comment: '', role: 'dimension' }, { name: 's_name', type: 'string', comment: '', role: 'dimension' }],
    metrics: {}, partitions: [], confirmation: { status: 'draft', confirmed_by: '', confirmed_at: '' },
    domains: [], description: '', table_comment: '', granularity: '', engine: 'maxcompute',
    coverage: null, supersedes: [], disambiguation: null, primary_key_unique: null,
    alt_labels: [], duplicate_sample: [], freshness: '', dimension_refs: [],
  } as TableDefinition)
}

describe('enrichAllEvents', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'k11-evt-'))
    writeFileSync(join(dir, 'config.yaml'), 'project:\n  name: t\n  scope_id: t\n')
    mkdirSync(join(dir, 'tables'), { recursive: true })
    mkdirSync(join(dir, 'events', 'pay'), { recursive: true })
    writeFileSync(join(dir, 'tables', 'dim_server.yaml'), dimServerYaml())
    writeFileSync(join(dir, 'events', 'pay', 'game.pay.order.yaml'), dumpYaml(event()))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  test('writes external_refs into events, preserves other fields', async () => {
    const res = await enrichAllEvents(dir)
    expect(res.errors).toEqual([])
    expect(res.enriched).toBe(1)
    const written = yaml.load(readFileSync(join(dir, 'events', 'pay', 'game.pay.order.yaml'), 'utf-8')) as Record<string, unknown>
    expect(Array.isArray(written.external_refs)).toBe(true)
    expect((written.external_refs as unknown[]).length).toBe(1)
    expect(written.description).toBe('玩家充值下单')
  })

  test('with mock llmCall -> merges LLM refs with deterministic', async () => {
    const llmCall = async () => JSON.stringify([
      { dim_table: 'dim_server', join_keys: [{ dws_column: 'srv_id', dim_column: 'server_id' }], derivation: 'llm semantic' },
    ])
    const res = await enrichAllEvents(dir, llmCall)
    expect(res.enriched).toBe(1)
    const written = yaml.load(readFileSync(join(dir, 'events', 'pay', 'game.pay.order.yaml'), 'utf-8')) as Record<string, unknown>
    const s = (written.external_refs as Array<{ dim_table: string; join_keys: unknown[] }>).find(r => r.dim_table === 'dim_server')!
    expect(s.join_keys).toHaveLength(2)
  })

  test('events? filter enriches only named events', async () => {
    const res = await enrichAllEvents(dir, undefined, ['nonexistent.event'])
    expect(res.written).toBe(0)
  })
})

describe('discoverEventRelationsDeterministic', () => {
  test('matches event param fields to DIM primary_key by exact name', () => {
    const refs = discoverEventRelationsDeterministic(event(), [DIM_SERVER, DIM_ROLE])
    expect(refs).toHaveLength(2)
    const byDim = Object.fromEntries(refs.map(r => [r.dim_table, r]))
    expect(byDim.dim_10000251_server_info!.join_keys).toEqual([{ dws_column: 'server_id', dim_column: 'server_id' }])
  })

  test('derivation marks the match as deterministic', () => {
    const [r] = discoverEventRelationsDeterministic(event(), [DIM_SERVER])
    expect(r!.derivation).toContain('确定性')
    expect(r!.origin).toBe('deterministic')
  })
})

describe('buildEventLlmPrompt', () => {
  test('includes event name + params + dim inventory', () => {
    const p = buildEventLlmPrompt(event(), [DIM_SERVER])
    expect(p).toContain('game.pay.order')
    expect(p).toContain('server_id')
    expect(p).toContain('dim_10000251_server_info')
  })
})

describe('parseLlmRefs', () => {
  test('stamps origin=llm on all parsed refs', () => {
    const refs = parseLlmRefs('[{"dim_table":"d","join_keys":[{"dws_column":"a","dim_column":"a"}],"derivation":"test"}]')
    expect(refs).toHaveLength(1)
    expect(refs[0]!.origin).toBe('llm')
  })
})

describe('mergeRefs — empty derivation fill', () => {
  test('fills empty derivation from added ref even when origin priority is not higher', () => {
    const baseline = [{ dim_table: 'dim_s', join_keys: [{ dws_column: 'a', dim_column: 'a' }], derivation: '', origin: 'llm' as const }]
    const added = [{ dim_table: 'dim_s', join_keys: [{ dws_column: 'a', dim_column: 'a' }], derivation: 'filled by lower', origin: 'deterministic' as const }]
    const merged = mergeRefs(baseline, added)
    expect(merged[0]!.derivation).toBe('filled by lower')
    expect(merged[0]!.origin).toBe('deterministic')
  })
})
