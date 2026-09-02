/**
 * V1 (G6 D4) — structured delta tests.
 *
 * Two surfaces:
 *  1. `computeStructuredDelta` pure unit tests (the 6 ticket scenarios).
 *  2. `listDeltasSince` store-level integration (delta persisted in the
 *     audit_event payload + queryable via json_extract).
 *
 * @module @deepseek-ai/dsh-audit/tests/delta
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Audit from '../src/index.ts'
import { fromPayload } from '../src/schema.ts'
import { openAuditDatabase, SQLiteAuditStore } from '../src/store.ts'
import { computeStructuredDelta } from '../src/delta.ts'
import { IdentityService } from '@deepseek-ai/dsh-identity'
import { userId, scopeId } from '@deepseek-ai/dsh-credentials'

// ── computeStructuredDelta (pure unit tests) ────────────────────────────────

describe('computeStructuredDelta', () => {
  it('single field modified → delta.modified correct', () => {
    const before = { table_name: 'tbl', description: 'old', domains: ['gaming'] }
    const after = { table_name: 'tbl', description: 'new', domains: ['gaming'] }
    const delta = computeStructuredDelta(before, after)
    expect(delta.added).toEqual({})
    expect(delta.removed).toEqual([])
    expect(delta.modified).toEqual({
      description: { from: 'old', to: 'new' },
    })
  })

  it('add alt_labels → delta.added contains alt_labels', () => {
    const before = { table_name: 'tbl', description: 'desc' }
    const after = { table_name: 'tbl', description: 'desc', alt_labels: ['label1', 'label2'] }
    const delta = computeStructuredDelta(before, after)
    // alt_labels is a NEW top-level field → added.alt_labels (the full array)
    expect(delta.added).toHaveProperty('alt_labels')
    expect(delta.added.alt_labels).toEqual(['label1', 'label2'])
    expect(delta.modified).toEqual({})
    expect(delta.removed).toEqual([])
  })

  it('remove a domain → delta.removed contains the domain', () => {
    const before = { table_name: 'tbl', domains: ['gaming', 'auth'] }
    const after = { table_name: 'tbl', domains: ['gaming'] }
    const delta = computeStructuredDelta(before, after)
    // domains is a set: removed = before − after = ['auth']
    expect(delta.removed).toContain('domains.auth')
    expect(delta.added).toEqual({}) // no domains added
    expect(delta.modified).toEqual({})
  })

  it('add a column → delta.added.columns contains the new column', () => {
    const before = {
      table_name: 'tbl',
      columns: [{ name: 'col_a', type: 'STRING' }],
    }
    const after = {
      table_name: 'tbl',
      columns: [
        { name: 'col_a', type: 'STRING' },
        { name: 'col_b', type: 'BIGINT', role: 'measure' },
      ],
    }
    const delta = computeStructuredDelta(before, after)
    expect(delta.added).toHaveProperty('columns')
    const addedCols = delta.added.columns as Record<string, unknown>
    expect(addedCols).toHaveProperty('col_b')
    expect(addedCols.col_b).toMatchObject({ name: 'col_b', type: 'BIGINT', role: 'measure' })
    expect(addedCols).not.toHaveProperty('col_a')
    expect(delta.modified).toEqual({})
    expect(delta.removed).toEqual([])
  })

  it('nested change (a column description changes) → reflected in modified.columns', () => {
    const before = {
      table_name: 'tbl',
      columns: [{ name: 'col_a', type: 'STRING', comment: 'old comment' }],
    }
    const after = {
      table_name: 'tbl',
      columns: [{ name: 'col_a', type: 'STRING', comment: 'new comment' }],
    }
    const delta = computeStructuredDelta(before, after)
    expect(delta.modified).toHaveProperty('columns')
    const colMod = delta.modified.columns as { from: Record<string, unknown>; to: Record<string, unknown> }
    expect(colMod.from).toHaveProperty('col_a')
    expect(colMod.to).toHaveProperty('col_a')
    expect((colMod.from.col_a as Record<string, unknown>).comment).toBe('old comment')
    expect((colMod.to.col_a as Record<string, unknown>).comment).toBe('new comment')
    expect(delta.added).toEqual({})
    expect(delta.removed).toEqual([])
  })

  it('empty patch (no real change) → delta all empty', () => {
    const before = { table_name: 'tbl', description: 'desc', columns: [{ name: 'id', type: 'BIGINT' }] }
    // Same content (different object identity)
    const after = { table_name: 'tbl', description: 'desc', columns: [{ name: 'id', type: 'BIGINT' }] }
    const delta = computeStructuredDelta(before, after)
    expect(delta.added).toEqual({})
    expect(delta.modified).toEqual({})
    expect(delta.removed).toEqual([])
  })

  // ── extra edge cases ──

  it('removes a column → delta.removed contains columns.<name>', () => {
    const before = {
      table_name: 'tbl',
      columns: [
        { name: 'col_a', type: 'STRING' },
        { name: 'col_b', type: 'BIGINT' },
      ],
    }
    const after = {
      table_name: 'tbl',
      columns: [{ name: 'col_a', type: 'STRING' }],
    }
    const delta = computeStructuredDelta(before, after)
    expect(delta.removed).toContain('columns.col_b')
    expect(delta.added).toEqual({})
    expect(delta.modified).toEqual({})
  })

  it('domains set semantics: add + remove simultaneously', () => {
    const before = { table_name: 'tbl', domains: ['gaming', 'auth'] }
    const after = { table_name: 'tbl', domains: ['gaming', 'analytics'] }
    const delta = computeStructuredDelta(before, after)
    // added: analytics; removed: auth
    expect(delta.added).toEqual({ domains: ['analytics'] })
    expect(delta.removed).toContain('domains.auth')
    expect(delta.removed).not.toContain('domains.gaming')
  })

  it('dimension_refs: modify join_keys on existing ref → modified.dimension_refs', () => {
    const before = {
      table_name: 'dws_pay',
      dimension_refs: [
        { dim_table: 'dim_user', join_keys: [{ dws_column: 'user_id', dim_column: 'id' }] },
      ],
    }
    const after = {
      table_name: 'dws_pay',
      dimension_refs: [
        { dim_table: 'dim_user', join_keys: [{ dws_column: 'uid', dim_column: 'id' }] },
      ],
    }
    const delta = computeStructuredDelta(before, after)
    expect(delta.modified).toHaveProperty('dimension_refs')
    const refMod = delta.modified.dimension_refs as { from: Record<string, unknown>; to: Record<string, unknown> }
    expect(refMod.from).toHaveProperty('dim_user')
    expect(refMod.to).toHaveProperty('dim_user')
  })

  it('dimension_refs: add a new ref → added.dimension_refs', () => {
    const before = {
      table_name: 'dws_pay',
      dimension_refs: [
        { dim_table: 'dim_user', join_keys: [{ dws_column: 'user_id', dim_column: 'id' }] },
      ],
    }
    const after = {
      table_name: 'dws_pay',
      dimension_refs: [
        { dim_table: 'dim_user', join_keys: [{ dws_column: 'user_id', dim_column: 'id' }] },
        { dim_table: 'dim_date', join_keys: [{ dws_column: 'dt', dim_column: 'dt' }] },
      ],
    }
    const delta = computeStructuredDelta(before, after)
    expect(delta.added).toHaveProperty('dimension_refs')
    const addedRefs = delta.added.dimension_refs as Record<string, unknown>
    expect(addedRefs).toHaveProperty('dim_date')
    expect(addedRefs).not.toHaveProperty('dim_user')
  })

  it('removes a top-level field → delta.removed contains the field name', () => {
    const before = { table_name: 'tbl', description: 'desc', granularity: 'daily' }
    const after = { table_name: 'tbl', description: 'desc' }
    const delta = computeStructuredDelta(before, after)
    expect(delta.removed).toContain('granularity')
    expect(delta.added).toEqual({})
    expect(delta.modified).toEqual({})
  })

  it('adds a top-level field → delta.added contains the field', () => {
    const before = { table_name: 'tbl', description: 'desc' }
    const after = { table_name: 'tbl', description: 'desc', granularity: 'daily' }
    const delta = computeStructuredDelta(before, after)
    expect(delta.added).toEqual({ granularity: 'daily' })
    expect(delta.removed).toEqual([])
    expect(delta.modified).toEqual({})
  })

  it('domains unchanged → omitted entirely (no added, no removed entries)', () => {
    const before = { table_name: 'tbl', domains: ['gaming', 'auth'] }
    const after = { table_name: 'tbl', domains: ['auth', 'gaming'] } // same set, different order
    const delta = computeStructuredDelta(before, after)
    expect(delta.added).toEqual({})
    expect(delta.modified).toEqual({})
    expect(delta.removed).toEqual([])
  })

  it('alt_labels set semantics: add + remove simultaneously', () => {
    const before = { table_name: 'tbl', alt_labels: ['old_label', 'shared'] }
    const after = { table_name: 'tbl', alt_labels: ['new_label', 'shared'] }
    const delta = computeStructuredDelta(before, after)
    expect(delta.added).toEqual({ alt_labels: ['new_label'] })
    expect(delta.removed).toContain('alt_labels.old_label')
    expect(delta.removed).not.toContain('alt_labels.shared')
  })
})

// ── listDeltasSince (store-level integration) ───────────────────────────────

describe('SQLiteAuditStore.listDeltasSince', () => {
  let store: SQLiteAuditStore

  beforeEach(() => {
    store = new SQLiteAuditStore(openAuditDatabase(':memory:'))
  })

  afterEach(() => store.close())

  /** Append a delta-carrying edit_definition tier-2 record (mirrors what
   *  `Audit.recordTier2Write('edit_definition', payload, { delta, asset_name, kind })`
   *  persists). */
  function appendDeltaRecord(
    ts: string,
    assetName: string,
    kind: string,
    delta: Record<string, unknown>,
    logId = `d${Math.random().toString(36).slice(2, 8)}`,
  ): void {
    store.append(fromPayload({
      log_id: logId,
      timestamp: ts,
      auto_tags: ['tool_write'],
      extra: {
        tier: 'tier-2',
        tool_name: 'edit_definition',
        payload_hash: 'deadbeef',
        payload_bytes: 42,
        delta,
        asset_name: assetName,
        kind,
      },
    }))
  }

  it('returns deltas at or after the timestamp, oldest-first', () => {
    appendDeltaRecord('2026-09-01T10:00:00.000Z', 'dws_pay', 'table', { added: { description: 'v1' }, modified: {}, removed: [] }, 'd1')
    appendDeltaRecord('2026-09-01T11:00:00.000Z', 'dws_pay', 'table', { added: { description: 'v2' }, modified: {}, removed: [] }, 'd2')
    appendDeltaRecord('2026-09-01T09:00:00.000Z', 'dws_pay', 'table', { added: { description: 'v0' }, modified: {}, removed: [] }, 'd0')

    const deltas = store.listDeltasSince('2026-09-01T10:00:00.000Z')
    expect(deltas).toHaveLength(2)
    // oldest-first
    expect(deltas[0]!.timestamp).toBe('2026-09-01T10:00:00.000Z')
    expect(deltas[1]!.timestamp).toBe('2026-09-01T11:00:00.000Z')
    // metadata extracted correctly
    expect(deltas[0]!.asset_name).toBe('dws_pay')
    expect(deltas[0]!.kind).toBe('table')
    expect(deltas[0]!.delta.added).toMatchObject({ description: 'v1' })
  })

  it('filters out non-edit_definition tool_write records (e.g. update_table_meta)', () => {
    // An update_table_meta tier-2 record (no delta, different tool_name)
    store.append(fromPayload({
      log_id: 'u1',
      timestamp: '2026-09-01T10:00:00.000Z',
      auto_tags: ['tool_write'],
      extra: { tier: 'tier-2', tool_name: 'update_table_meta', payload_hash: 'abc', payload_bytes: 5 },
    }))
    // An edit_definition record WITH delta
    appendDeltaRecord('2026-09-01T10:00:00.000Z', 'dws_pay', 'table', { added: {}, modified: {}, removed: [] }, 'd1')

    const deltas = store.listDeltasSince('2026-09-01T00:00:00.000Z')
    expect(deltas).toHaveLength(1)
    expect(deltas[0]!.asset_name).toBe('dws_pay')
  })

  it('filters out edit_definition records without a delta', () => {
    // An edit_definition record WITHOUT delta (e.g. a pre-V1 record or one
    // where before was unavailable)
    store.append(fromPayload({
      log_id: 'old1',
      timestamp: '2026-09-01T10:00:00.000Z',
      auto_tags: ['tool_write'],
      extra: { tier: 'tier-2', tool_name: 'edit_definition', payload_hash: 'abc', payload_bytes: 5 },
    }))
    appendDeltaRecord('2026-09-01T10:00:00.000Z', 'dws_pay', 'table', { added: {}, modified: {}, removed: [] }, 'd1')

    const deltas = store.listDeltasSince('2026-09-01T00:00:00.000Z')
    expect(deltas).toHaveLength(1)
    expect(deltas[0]!.asset_name).toBe('dws_pay')
  })

  it('returns an empty array when no deltas match', () => {
    appendDeltaRecord('2026-09-01T10:00:00.000Z', 'dws_pay', 'table', { added: {}, modified: {}, removed: [] })
    const deltas = store.listDeltasSince('2026-12-01T00:00:00.000Z')
    expect(deltas).toEqual([])
  })
})

// ── Audit service end-to-end (recordTier2Write + listDeltasSince) ───────────

describe('Audit.recordTier2Write + listDeltasSince (end-to-end)', () => {
  let ctx: Context

  beforeEach(async () => {
    ctx = new Context()
    await ctx.plugin(IdentityService)
    await ctx.plugin(Audit, { path: ':memory:' })
  })

  afterEach(async () => {
    await ctx.fiber.dispose()
  })

  it('recordTier2Write with delta → queryable via listDeltasSince', () => {
    const delta = computeStructuredDelta(
      { description: 'old' },
      { description: 'new' },
    )
    ctx.audit.recordTier2Write(
      'edit_definition',
      { asset_name: 'dws_pay', patch: { description: 'new' } },
      { delta, asset_name: 'dws_pay', kind: 'table', scope_id: scopeId('game-1'), user_id: userId('alice') },
    )

    const deltas = ctx.audit.store.listDeltasSince('2000-01-01T00:00:00.000Z')
    expect(deltas).toHaveLength(1)
    expect(deltas[0]!.asset_name).toBe('dws_pay')
    expect(deltas[0]!.kind).toBe('table')
    expect(deltas[0]!.delta.modified).toMatchObject({
      description: { from: 'old', to: 'new' },
    })
  })

  it('recordTier2Write without delta → not returned by listDeltasSince', () => {
    // A regular tier-2 write without a delta (e.g. update_table_meta)
    ctx.audit.recordTier2Write('update_table_meta', { table_name: 'dws_pay' }, { scope_id: scopeId('game-1') })

    const deltas = ctx.audit.store.listDeltasSince('2000-01-01T00:00:00.000Z')
    expect(deltas).toEqual([])
  })
})
