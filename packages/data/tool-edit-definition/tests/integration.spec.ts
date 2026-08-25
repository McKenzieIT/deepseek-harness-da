/**
 * Integration test for `tool-edit-definition` — exercises `computeEdit` +
 * `applyPatch` end-to-end against a REAL-ish `SemanticLayerService`-shaped
 * object. Unlike the unit spec (which stubs each loader with `vi.fn`), this
 * suite uses concrete definition fixtures served through helpers that mirror
 * how the real Service parses a fresh object from YAML on every
 * `loadTableDefinition` / `loadEventDefinition` call (a deep clone, so the
 * fixture can't be mutated across calls). `computeEdit` is a pure function
 * over this interface shape — no Cordis runtime is required.
 *
 * Covers W6e acceptance scenarios:
 *  1. Patch a table definition end-to-end (columns merge + confirmation flip
 *     + domains preserved + confirmed_by preserved).
 *  2. domains union/dedup across existing + patch.
 *  3. dimension_refs merge by dim_table (existing updated, new appended).
 *  4. Patch an event definition (confirmation flips to unreviewed).
 *  5. Reject a metric edit (virtual — derived from host).
 *  6. Full audit payload: asset_name + patched_fields match Object.keys(patch).
 *
 * @module @deepseek-ai/dsh-tool-edit-definition/tests/integration
 */
import { describe, expect, it } from 'vitest'
import { computeEdit } from '../src/index.ts'
import type { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer/src/index.ts'

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Deep-clone a fixture so each `load*Definition` call returns an isolated
 *  object (mirrors the real Service, which parses a fresh object per call and
 *  never hands out a shared mutable reference). */
function clone<T>(value: T): T {
  return structuredClone(value)
}

/** A minimal `SemanticLayerService`-shaped double serving a single table. */
function createSchemaWithTable(name: string, definition: Record<string, unknown>): SemanticLayerService {
  return {
    loadTableDefinition: (n: string) => (n === name ? clone(definition) : null),
    loadEventDefinition: () => null,
    loadMetricDefinition: () => null,
  } as unknown as SemanticLayerService
}

/** A minimal `SemanticLayerService`-shaped double serving a single event. */
function createSchemaWithEvent(name: string, definition: Record<string, unknown>): SemanticLayerService {
  return {
    loadTableDefinition: () => null,
    loadEventDefinition: (n: string) => (n === name ? clone(definition) : null),
    loadMetricDefinition: () => null,
  } as unknown as SemanticLayerService
}

/** A minimal `SemanticLayerService`-shaped double serving only a metric (no
 *  host table/event — the asset resolves to a virtual metric, which must be
 *  rejected for edits). */
function createSchemaWithMetric(name: string, definition: Record<string, unknown>): SemanticLayerService {
  return {
    loadTableDefinition: () => null,
    loadEventDefinition: () => null,
    loadMetricDefinition: (n: string) => (n === name ? clone(definition) : null),
  } as unknown as SemanticLayerService
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('tool-edit-definition integration', () => {
  // 1. Patch a table definition end-to-end
  it('patches a table definition end-to-end (columns merge, confirmation flip, domains preserved)', () => {
    const schema = createSchemaWithTable('test_table', {
      table_name: 'test_table',
      description: 'old',
      columns: [{ name: 'id', type: 'bigint' }],
      domains: ['sales'],
      confirmation: { status: 'confirmed', confirmed_by: 'admin' },
    })

    const { result, merged, kind } = computeEdit(schema, 'test_table', {
      description: 'new desc',
      columns: [
        { name: 'id', type: 'bigint', description: 'primary key' },
        { name: 'amount', type: 'decimal' },
      ],
    })

    // Audit payload
    expect(result.applied).toBe(true)
    expect(result.kind).toBe('table')
    expect(kind).toBe('table')
    expect(result.asset_name).toBe('test_table')
    expect(result.patched_fields).toEqual(['description', 'columns'])

    // Patched definition (what gets persisted)
    expect(merged!.description).toBe('new desc')

    const cols = merged!.columns as Array<Record<string, unknown>>
    expect(cols).toHaveLength(2) // id updated in place, amount appended
    expect(cols[0]).toMatchObject({ name: 'id', type: 'bigint', description: 'primary key' })
    expect(cols[1]).toMatchObject({ name: 'amount', type: 'decimal' })

    // G4 Q5: status auto-set to 'unreviewed'; WARN 6: confirmed_by preserved
    const confirmation = merged!.confirmation as Record<string, unknown>
    expect(confirmation.status).toBe('unreviewed')
    expect(confirmation.confirmed_by).toBe('admin')

    // domains untouched by this patch
    expect(merged!.domains).toEqual(['sales'])
  })

  // 2. domains union/dedup
  it('unions and dedups domains across existing and patch', () => {
    const schema = createSchemaWithTable('t', {
      table_name: 't',
      domains: ['sales', 'finance'],
    })

    const { merged } = computeEdit(schema, 't', { domains: ['finance', 'marketing'] })

    expect(merged!.domains).toEqual(['sales', 'finance', 'marketing'])
  })

  // 3. dimension_refs merge by dim_table
  it('merges dimension_refs by dim_table (existing updated, new appended)', () => {
    const schema = createSchemaWithTable('dws_sales', {
      table_name: 'dws_sales',
      dimension_refs: [
        { dim_table: 'dim_user', join_keys: [{ dws_column: 'user_id', dim_column: 'id' }] },
      ],
    })

    const { merged } = computeEdit(schema, 'dws_sales', {
      dimension_refs: [
        { dim_table: 'dim_user', join_keys: [{ dws_column: 'uid', dim_column: 'id' }] },
        { dim_table: 'dim_product', join_keys: [{ dws_column: 'product_id', dim_column: 'id' }] },
      ],
    })

    const refs = merged!.dimension_refs as Array<Record<string, unknown>>
    expect(refs).toHaveLength(2)
    // dim_user updated with the new join_keys (override at the dim_ref level)
    expect(refs[0]).toMatchObject({
      dim_table: 'dim_user',
      join_keys: [{ dws_column: 'uid', dim_column: 'id' }],
    })
    // dim_product appended
    expect(refs[1]).toMatchObject({
      dim_table: 'dim_product',
      join_keys: [{ dws_column: 'product_id', dim_column: 'id' }],
    })
  })

  // 4. Patch an event definition
  it('patches an event definition and flips confirmation to unreviewed', () => {
    const schema = createSchemaWithEvent('user_login', {
      name: 'user_login',
      description: 'old',
      domains: ['auth'],
      params_fields: {},
      confirmation: { status: 'confirmed', confirmed_by: 'admin' },
    })

    const { result, merged, kind } = computeEdit(schema, 'user_login', {
      description: 'User login event',
    })

    expect(result.applied).toBe(true)
    expect(result.kind).toBe('event')
    expect(kind).toBe('event')
    expect(merged!.description).toBe('User login event')

    const confirmation = merged!.confirmation as Record<string, unknown>
    expect(confirmation.status).toBe('unreviewed')
    // WARN 6: confirmed_by preserved
    expect(confirmation.confirmed_by).toBe('admin')
  })

  // 5. Reject metric edit
  it('refuses to edit a metric (virtual — derived from host)', () => {
    const schema = createSchemaWithMetric('dws_sales__revenue', {
      kind: 'metric',
      name: 'dws_sales__revenue',
      description: 'total revenue',
    })

    const { result, merged } = computeEdit(schema, 'dws_sales__revenue', {
      description: 'attempt',
    })

    expect(result.applied).toBe(false)
    expect(result.kind).toBe('metric')
    expect(result.message).toMatch(/metric|virtual/i)
    // No merged definition — the edit was rejected before patching
    expect(merged).toBeUndefined()
  })

  // 6. Full audit payload check
  it('produces an audit payload with asset_name and patched_fields matching Object.keys(patch)', () => {
    const patch = {
      description: 'updated audit check',
      domains: ['sales', 'finance'],
    }
    const schema = createSchemaWithTable('audit_table', {
      table_name: 'audit_table',
      description: 'before',
      domains: ['sales'],
      columns: [{ name: 'id', type: 'bigint' }],
    })

    const { result } = computeEdit(schema, 'audit_table', patch)

    expect(result.applied).toBe(true)
    expect(result.asset_name).toBe('audit_table')
    expect(result.patched_fields).toEqual(Object.keys(patch))
    // explicit spelling for readability
    expect(result.patched_fields).toEqual(['description', 'domains'])
  })
})
