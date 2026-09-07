/**
 * GA-GT3-5c — backfill `origin: deterministic` on K11 deterministic-reproducible
 * refs. TDD classification-correctness test.
 *
 * Fixture layer: a couple DIM tables + a DWS (dimension_refs) + an event
 * (external_refs) with three ref classes:
 *  (i)  deterministic-reproducible — same dim_table + join_key pair(s) the
 *       deterministic round re-derives → tagged `origin: deterministic`.
 *  (ii) manual / not-reproduced — dim_table/join_keys the deterministic round
 *       does NOT re-derive → left `undefined` (preserved as manual-tier).
 *  (iii) partially-reproducible / asymmetric — same dim_table as a discovered
 *       ref BUT the existing ref carries an extra asymmetric join_key pair the
 *       deterministic round cannot re-derive (deterministic only emits
 *       symmetric dws_column==dim_column==PK pairs). MUST stay `undefined` —
 *       tagging it would lose the asymmetric pair on the next origin-aware
 *       re-discovery (data loss). This is the CRITICAL safety assertion.
 *
 * Classification logic (data-safe "superset" criterion): an existing ref is
 * tagged `deterministic` IFF the deterministic round re-derives a ref to the
 * SAME dim_table whose join_keys are a SUPERSET of the existing ref's (every
 * existing pair is re-derived). Partial reproduction → NOT tagged (preserved).
 */
import { describe, expect, it, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import yaml from 'js-yaml'
import { dumpYaml } from '../packages/data/semantic-layer/src/io.ts'
import {
  runBackfill,
  isReproduced,
  backfillRefs,
} from './backfill-k11-deterministic-origin.ts'
import type { DimensionRef } from '../packages/data/semantic-layer/src/types.ts'

// ── Fixture builders (mirror discover-relations.spec.ts helpers) ─────────

const dimDoc = (name: string, pk: string, label: string): Record<string, unknown> => ({
  table_name: name,
  engine: 'maxcompute',
  kind: 'dim',
  table_comment: `${name} 维度表`,
  description: `${name} 维度表`,
  domains: [],
  granularity: '维表',
  columns: [
    { name: pk, type: 'string', comment: 'pk', role: 'dimension' },
    { name: label, type: 'string', comment: 'label', role: 'dimension' },
  ],
  metrics: {},
  partitions: [],
  confirmation: { status: 'draft', confirmed_by: '', confirmed_at: '' },
  coverage: null,
  supersedes: [],
  disambiguation: null,
  primary_key: [pk],
  primary_key_unique: true,
  duplicate_sample: [],
  label_columns: [label],
  freshness: 'static_reference',
  dimension_refs: [],
})

const dwsDoc = (
  name: string,
  cols: Array<{ name: string; role: string }>,
  refs: Array<Record<string, unknown>>,
): Record<string, unknown> => ({
  table_name: name,
  engine: 'maxcompute',
  table_comment: `${name} dws`,
  description: `${name} dws`,
  domains: [],
  granularity: '',
  columns: cols.map(c => ({ name: c.name, type: 'string', comment: c.name, role: c.role })),
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
  dimension_refs: refs,
})

const eventDoc = (
  name: string,
  params: Array<string>,
  refs: Array<Record<string, unknown>>,
): Record<string, unknown> => ({
  name,
  event_filter: `event = '${name}'`,
  description: `${name} event`,
  domains: [],
  params_fields: Object.fromEntries(params.map(p => [p, { type: 'string', description: p }])),
  metrics: {},
  disambiguation: [],
  external_refs: refs,
  confirmation: { status: 'draft', confirmed_by: '', confirmed_at: '' },
  coverage: null,
})

const fixtureRoots: string[] = []
afterEach(() => {
  for (const root of fixtureRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function buildFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gt3-5c-'))
  fixtureRoots.push(dir)
  writeFileSync(join(dir, 'config.yaml'), 'project:\n  name: t\n  scope_id: t\n')
  mkdirSync(join(dir, 'tables'), { recursive: true })
  // DIM inventory: user (PK user_id), city (PK city_id), region (PK region_id)
  writeFileSync(join(dir, 'tables', 'dim_fixture_user.yaml'), dumpYaml(dimDoc('dim_fixture_user', 'user_id', 'user_name')))
  writeFileSync(join(dir, 'tables', 'dim_fixture_city.yaml'), dumpYaml(dimDoc('dim_fixture_city', 'city_id', 'city_name')))
  writeFileSync(join(dir, 'tables', 'dim_fixture_region.yaml'), dumpYaml(dimDoc('dim_fixture_region', 'region_id', 'region_name')))

  // DWS with three ref classes:
  //  columns: user_id, city_id, region_name, event_name, ds(partition)
  //  deterministic round re-derives:
  //    dim_fixture_user [{user_id,user_id}]   (user_id ∈ DWS cols, not excluded)
  //    dim_fixture_city [{city_id,city_id}]   (city_id ∈ DWS cols, not excluded)
  //    dim_fixture_region → NO ref            (region_id ∉ DWS cols; only region_name)
  const dwsRefs = [
    // (i) deterministic-reproducible: same dim_table + re-derived pair → TAG
    {
      dim_table: 'dim_fixture_user',
      join_keys: [{ dws_column: 'user_id', dim_column: 'user_id' }],
      derivation: 'manual-curated user join (happens to be reproducible)',
    },
    // (ii) manual / not-reproduced: dim_table not re-derived at all → STAY undefined
    {
      dim_table: 'dim_fixture_region',
      join_keys: [{ dws_column: 'region_name', dim_column: 'region_id' }],
      derivation: 'manual-curated asymmetric region join (not reproducible)',
    },
    // (iii) partially-reproducible / asymmetric: same dim_table re-derived BUT
    //   existing carries an extra asymmetric pair the deterministic round
    //   cannot reproduce → MUST STAY undefined (safety: no misclassification)
    {
      dim_table: 'dim_fixture_city',
      join_keys: [
        { dws_column: 'city_id', dim_column: 'city_id' },
        { dws_column: 'region_name', dim_column: 'city_id' },
      ],
      derivation: 'mixed city join (one reproducible pair + one asymmetric pair)',
    },
  ]
  writeFileSync(
    join(dir, 'tables', 'dws_fixture_fact.yaml'),
    dumpYaml(
      dwsDoc(
        'dws_fixture_fact',
        [
          { name: 'user_id', role: 'dimension' },
          { name: 'city_id', role: 'dimension' },
          { name: 'region_name', role: 'dimension' },
          { name: 'event_name', role: 'dimension' },
          { name: 'ds', role: 'partition' },
        ],
        dwsRefs,
      ),
    ),
  )

  // Event with two ref classes (params_fields: user_id, difficulty, event_name):
  //  deterministic round re-derives:
  //    dim_fixture_user [{user_id,user_id}]  (user_id ∈ params)
  //    dim_fixture_city → NO ref             (city_id ∉ params)
  mkdirSync(join(dir, 'events', 'battle'), { recursive: true })
  const evtRefs = [
    // (i) deterministic-reproducible event ref → TAG
    {
      dim_table: 'dim_fixture_user',
      join_keys: [{ dws_column: 'user_id', dim_column: 'user_id' }],
      derivation: 'event user join (reproducible)',
    },
    // (ii) manual / not-reproduced event ref → STAY undefined
    {
      dim_table: 'dim_fixture_city',
      join_keys: [{ dws_column: 'event_name', dim_column: 'city_id' }],
      derivation: 'manual-curated asymmetric event join (not reproducible)',
    },
  ]
  writeFileSync(
    join(dir, 'events', 'battle', 'evt_fixture.yaml'),
    dumpYaml(eventDoc('evt_fixture', ['user_id', 'difficulty', 'event_name'], evtRefs)),
  )

  return dir
}

function readTableRefs(dir: string, name: string): Array<Record<string, unknown>> {
  const f = readFileSync(join(dir, 'tables', `${name}.yaml`), 'utf-8')
  const doc = yaml.load(f) as Record<string, unknown>
  return (doc.dimension_refs as Array<Record<string, unknown>>) ?? []
}
function readEventRefs(dir: string, name: string): Array<Record<string, unknown>> {
  const f = readFileSync(join(dir, 'events', 'battle', `${name}.yaml`), 'utf-8')
  const doc = yaml.load(f) as Record<string, unknown>
  return (doc.external_refs as Array<Record<string, unknown>>) ?? []
}

// ── Unit: classification predicate ──────────────────────────────────────

describe('isReproduced (classification predicate)', () => {
  it('returns true when the deterministic round re-derives every existing pair (superset)', () => {
    const existing: DimensionRef = {
      dim_table: 'dim_user',
      join_keys: [{ dws_column: 'user_id', dim_column: 'user_id' }],
      derivation: '',
    }
    const discovered: DimensionRef[] = [
      { dim_table: 'dim_user', join_keys: [{ dws_column: 'user_id', dim_column: 'user_id' }], derivation: '', origin: 'deterministic' },
    ]
    expect(isReproduced(existing, discovered)).toBe(true)
  })

  it('returns false when the dim_table is not reproduced at all (manual ref)', () => {
    const existing: DimensionRef = {
      dim_table: 'dim_region',
      join_keys: [{ dws_column: 'region_name', dim_column: 'region_id' }],
      derivation: '',
    }
    expect(isReproduced(existing, [])).toBe(false)
  })

  it('returns false for a partially-reproducible ref — the asymmetric pair is NOT re-derived (safety: no misclassification)', () => {
    // existing has a reproducible symmetric pair + an asymmetric pair the
    // deterministic round can never emit (deterministic only produces
    // dws_column==dim_column==PK). Superset fails → not tagged → preserved.
    const existing: DimensionRef = {
      dim_table: 'dim_city',
      join_keys: [
        { dws_column: 'city_id', dim_column: 'city_id' },
        { dws_column: 'region_name', dim_column: 'city_id' },
      ],
      derivation: '',
    }
    const discovered: DimensionRef[] = [
      { dim_table: 'dim_city', join_keys: [{ dws_column: 'city_id', dim_column: 'city_id' }], derivation: '', origin: 'deterministic' },
    ]
    expect(isReproduced(existing, discovered)).toBe(false)
  })

  it('returns true when existing has multiple pairs all re-derived', () => {
    const existing: DimensionRef = {
      dim_table: 'dim_city',
      join_keys: [
        { dws_column: 'city_id', dim_column: 'city_id' },
        { dws_column: 'city_id2', dim_column: 'city_id2' },
      ],
      derivation: '',
    }
    const discovered: DimensionRef[] = [
      {
        dim_table: 'dim_city',
        join_keys: [
          { dws_column: 'city_id', dim_column: 'city_id' },
          { dws_column: 'city_id2', dim_column: 'city_id2' },
          { dws_column: 'extra', dim_column: 'extra' },
        ],
        derivation: '',
        origin: 'deterministic',
      },
    ]
    expect(isReproduced(existing, discovered)).toBe(true)
  })
})

// ── Unit: backfillRefs (apply predicate to raw ref array) ───────────────

describe('backfillRefs', () => {
  it('tags reproduced refs and leaves non-reproduced/invalid untouched', () => {
    const rawRefs = [
      { dim_table: 'dim_user', join_keys: [{ dws_column: 'user_id', dim_column: 'user_id' }], derivation: '' },
      { dim_table: 'dim_region', join_keys: [{ dws_column: 'region_name', dim_column: 'region_id' }], derivation: '' },
      { not_a: 'valid_ref' }, // invalid → left untouched (preserved, not dropped)
    ]
    const discovered: DimensionRef[] = [
      { dim_table: 'dim_user', join_keys: [{ dws_column: 'user_id', dim_column: 'user_id' }], derivation: '', origin: 'deterministic' },
    ]
    const { refs, backfilled, stayed } = backfillRefs(rawRefs, discovered)
    expect(backfilled).toBe(1)
    // `stayed` counts VALID refs left undefined; the invalid ref is passed
    // through untouched (preserved, not counted — it is not a classifiable ref).
    expect(stayed).toBe(1)
    expect(refs[0]).toMatchObject({ dim_table: 'dim_user', origin: 'deterministic' })
    expect(refs[1]).toMatchObject({ dim_table: 'dim_region' })
    expect('origin' in (refs[1] as Record<string, unknown>)).toBe(false)
    expect(refs[2]).toEqual({ not_a: 'valid_ref' })
  })
})

// ── E2E: runBackfill on a fixture layer ──────────────────────────────────

describe('runBackfill on a fixture layer (classification correctness)', () => {
  it('tags deterministic-reproducible refs + leaves manual/partial refs undefined (no misclassification)', async () => {
    const dir = buildFixture()
    const counts = await runBackfill(dir)

    // DWS: (i) tagged, (ii) manual stayed, (iii) partial stayed (safety)
    // Event: (i) tagged, (ii) manual stayed
    expect(counts.backfilled).toBe(2)
    expect(counts.stayed).toBe(3)

    const dwsRefs = readTableRefs(dir, 'dws_fixture_fact')
    expect(dwsRefs).toHaveLength(3)
    // (i) deterministic-reproducible → tagged
    expect(dwsRefs[0]?.dim_table).toBe('dim_fixture_user')
    expect(dwsRefs[0]?.origin).toBe('deterministic')
    // (ii) manual / not-reproduced → undefined (NOT tagged)
    expect(dwsRefs[1]?.dim_table).toBe('dim_fixture_region')
    expect(dwsRefs[1]?.origin).toBeUndefined()
    // (iii) partially-reproducible / asymmetric → undefined (NOT tagged — safety)
    expect(dwsRefs[2]?.dim_table).toBe('dim_fixture_city')
    expect(dwsRefs[2]?.origin).toBeUndefined()
    // the asymmetric pair is preserved (not dropped)
    expect(dwsRefs[2]?.join_keys).toHaveLength(2)

    const evtRefs = readEventRefs(dir, 'evt_fixture')
    expect(evtRefs).toHaveLength(2)
    // (i) deterministic-reproducible event ref → tagged
    expect(evtRefs[0]?.dim_table).toBe('dim_fixture_user')
    expect(evtRefs[0]?.origin).toBe('deterministic')
    // (ii) manual / not-reproduced event ref → undefined (NOT tagged)
    expect(evtRefs[1]?.dim_table).toBe('dim_fixture_city')
    expect(evtRefs[1]?.origin).toBeUndefined()
  })
})
