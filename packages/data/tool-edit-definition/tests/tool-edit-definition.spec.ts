import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  apply,
  validateAssetName,
  applyPatch,
  computeEdit,
  formatEditDefinition,
  type EditDefinitionResult,
} from '../src/index.ts'
import type { Context } from '@deepseek-ai/cordis'
import type { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer/src/index.ts'
import { dumpYaml, getCorpusVersion } from '@deepseek-ai/dsh-semantic-layer/src/io.ts'

// ── Mock SemanticLayerService ───────────────────────────────────────────────

function createMockSchema(assets: {
  tables?: Record<string, Record<string, unknown>>
  events?: Record<string, Record<string, unknown>>
  metrics?: Record<string, Record<string, unknown>>
  concepts?: Record<string, Record<string, unknown>>
} = {}) {
  return {
    semanticRoot: '/tmp/test-semantic-layer',
    loadTableDefinition: vi.fn((name: string) => assets.tables?.[name] ?? null),
    loadEventDefinition: vi.fn((name: string) => assets.events?.[name] ?? null),
    loadMetricDefinition: vi.fn((name: string) => assets.metrics?.[name] ?? null),
    loadConceptDefinition: vi.fn((name: string) => assets.concepts?.[name] ?? null),
    updateTableMeta: vi.fn().mockResolvedValue({ ok: true, table_name: 'test' }),
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('tool-edit-definition', () => {
  describe('validateAssetName', () => {
    it('accepts valid names', () => {
      expect(validateAssetName('dws_user_daily')).toBe('dws_user_daily')
      expect(validateAssetName('  padded  ')).toBe('padded')
    })

    it('rejects empty', () => {
      expect(validateAssetName('')).toBeNull()
      expect(validateAssetName('   ')).toBeNull()
    })

    it('rejects path traversal', () => {
      expect(validateAssetName('../etc/passwd')).toBeNull()
      expect(validateAssetName('foo/bar')).toBeNull()
      expect(validateAssetName('foo\\bar')).toBeNull()
    })

    it('rejects dot-only', () => {
      expect(validateAssetName('.')).toBeNull()
    })

    it('rejects names exceeding 200 chars', () => {
      expect(validateAssetName('a'.repeat(201))).toBeNull()
      expect(validateAssetName('a'.repeat(200))).toBe('a'.repeat(200))
    })
  })

  describe('applyPatch', () => {
    it('shallow-merges top-level fields', () => {
      const existing = { table_name: 'tbl', description: 'old', domains: ['d1'] }
      const patch = { description: 'new', granularity: 'daily' }
      const result = applyPatch(existing, patch)
      expect(result.description).toBe('new')
      expect(result.granularity).toBe('daily')
      expect(result.table_name).toBe('tbl')
      expect(result.domains).toEqual(['d1'])
    })

    it('merges columns by name (existing updated)', () => {
      const existing = {
        table_name: 'tbl',
        columns: [
          { name: 'col_a', type: 'STRING', role: 'dimension', comment: 'old' },
          { name: 'col_b', type: 'BIGINT', role: 'measure', comment: 'keep' },
        ],
      }
      const patch = {
        columns: [
          { name: 'col_a', comment: 'updated comment' },
        ],
      }
      const result = applyPatch(existing, patch)
      const cols = result.columns as Array<Record<string, unknown>>
      expect(cols).toHaveLength(2)
      expect(cols[0]!.comment).toBe('updated comment')
      expect(cols[0]!.type).toBe('STRING')
      expect(cols[1]!.comment).toBe('keep')
    })

    it('merges columns by name (new column appended)', () => {
      const existing = {
        columns: [{ name: 'col_a', type: 'STRING' }],
      }
      const patch = {
        columns: [{ name: 'col_new', type: 'BIGINT', role: 'measure' }],
      }
      const result = applyPatch(existing, patch)
      const cols = result.columns as Array<Record<string, unknown>>
      expect(cols).toHaveLength(2)
      expect(cols[1]!.name).toBe('col_new')
    })

    it('skips columns without a name field', () => {
      const existing = { columns: [{ name: 'col_a', type: 'STRING' }] }
      const patch = { columns: [{ type: 'BIGINT' }] } // no name
      const result = applyPatch(existing, patch)
      const cols = result.columns as Array<Record<string, unknown>>
      expect(cols).toHaveLength(1) // not appended
    })

    // WARN 7: dimension_refs smart-merge by dim_table
    it('merges dimension_refs by dim_table (existing updated)', () => {
      const existing = {
        table_name: 'dws_user_daily',
        dimension_refs: [
          { dim_table: 'dim_user', join_keys: ['user_id'], derivation: 'pk' },
        ],
      }
      const patch = {
        dimension_refs: [
          { dim_table: 'dim_user', join_keys: ['uid'] }, // override join_keys
        ],
      }
      const result = applyPatch(existing, patch)
      const refs = result.dimension_refs as Array<Record<string, unknown>>
      expect(refs).toHaveLength(1)
      expect(refs[0]!.dim_table).toBe('dim_user')
      expect(refs[0]!.join_keys).toEqual(['uid'])
      // derivation preserved from existing (not in patch)
      expect(refs[0]!.derivation).toBe('pk')
    })

    it('merges dimension_refs by dim_table (new ref appended)', () => {
      const existing = {
        dimension_refs: [{ dim_table: 'dim_user', join_keys: ['user_id'] }],
      }
      const patch = {
        dimension_refs: [{ dim_table: 'dim_date', join_keys: ['dt'] }],
      }
      const result = applyPatch(existing, patch)
      const refs = result.dimension_refs as Array<Record<string, unknown>>
      expect(refs).toHaveLength(2)
      expect(refs[1]!.dim_table).toBe('dim_date')
    })

    it('skips dimension_refs without a dim_table field', () => {
      const existing = {
        dimension_refs: [{ dim_table: 'dim_user', join_keys: ['user_id'] }],
      }
      const patch = { dimension_refs: [{ join_keys: ['x'] }] } // no dim_table
      const result = applyPatch(existing, patch)
      const refs = result.dimension_refs as Array<Record<string, unknown>>
      expect(refs).toHaveLength(1) // not appended
    })

    // WARN 7: domains union with dedup
    it('unions domains with dedup (preserving existing order)', () => {
      const existing = { table_name: 'tbl', domains: ['gaming', 'auth'] }
      const patch = { domains: ['auth', 'analytics', 'gaming'] }
      const result = applyPatch(existing, patch)
      expect(result.domains).toEqual(['gaming', 'auth', 'analytics'])
    })

    it('handles domains union when patch adds only new entries', () => {
      const existing = { domains: ['a', 'b'] }
      const patch = { domains: ['c', 'd'] }
      const result = applyPatch(existing, patch)
      expect(result.domains).toEqual(['a', 'b', 'c', 'd'])
    })

    // CL-2: alt_labels is the concept-side string array — unioned with dedup
    // exactly like domains, not replaced.
    it('unions alt_labels with dedup (preserving existing order)', () => {
      const existing = { name: 'dau', alt_labels: ['dau', 'DAU'] }
      const patch = { alt_labels: ['DAU', 'daily active users'] }
      const result = applyPatch(existing, patch)
      expect(result.alt_labels).toEqual(['dau', 'DAU', 'daily active users'])
      expect(result.name).toBe('dau')
    })

    it('keeps non-object entries out of a by-name array merge', () => {
      // A nameless/odd entry on either side is not mergeable: existing
      // non-objects are dropped from the merged array and patch non-objects
      // are skipped rather than appended.
      const existing = { columns: [null, { name: 'col_a', type: 'STRING' }] }
      const patch = { columns: [null, 'bogus', { name: 'col_a', comment: 'updated' }] }
      const result = applyPatch(existing, patch)
      expect(result.columns).toEqual([{ name: 'col_a', type: 'STRING', comment: 'updated' }])
    })
  })

  describe('computeEdit', () => {
    it('returns error when schema is undefined', () => {
      const { result } = computeEdit(undefined, 'test_table', { description: 'x' })
      expect(result.applied).toBe(false)
      expect(result.message).toContain('semantic-layer not mounted')
    })

    it('returns error for invalid asset name', () => {
      const schema = createMockSchema() as unknown as SemanticLayerService
      const { result } = computeEdit(schema, '../bad', { description: 'x' })
      expect(result.applied).toBe(false)
      expect(result.message).toContain('invalid asset name')
    })

    it('returns error when asset not found', () => {
      const schema = createMockSchema() as unknown as SemanticLayerService
      const { result } = computeEdit(schema, 'nonexistent', { description: 'x' })
      expect(result.applied).toBe(false)
      expect(result.message).toContain('no table, event, metric, or concept')
    })

    it('successfully patches a table definition', () => {
      const schema = createMockSchema({
        tables: {
          dws_user_daily: {
            table_name: 'dws_user_daily',
            description: 'old desc',
            domains: ['gaming'],
            columns: [{ name: 'user_id', type: 'STRING', role: 'dimension' }],
            confirmation: { status: 'confirmed' },
          },
        },
      }) as unknown as SemanticLayerService

      const { result, merged, kind } = computeEdit(schema, 'dws_user_daily', {
        description: 'Daily user metrics',
        domains: ['gaming', 'analytics'],
      })

      expect(result.applied).toBe(true)
      expect(result.kind).toBe('table')
      expect(result.patched_fields).toEqual(['description', 'domains'])
      expect(kind).toBe('table')
      expect(merged!.description).toBe('Daily user metrics')
      expect(merged!.domains).toEqual(['gaming', 'analytics'])
      // G4 Q5: confirmation set to unreviewed
      expect(merged!.confirmation).toEqual({ status: 'unreviewed' })
    })

    it('successfully patches an event definition', () => {
      const schema = createMockSchema({
        events: {
          user_login: {
            name: 'user_login',
            description: 'old',
            domains: ['auth'],
            params_fields: [],
            confirmation: { status: 'confirmed' },
          },
        },
      }) as unknown as SemanticLayerService

      const { result, merged, kind } = computeEdit(schema, 'user_login', {
        description: 'User login event',
      })

      expect(result.applied).toBe(true)
      expect(result.kind).toBe('event')
      expect(result.patched_fields).toEqual(['description'])
      expect(kind).toBe('event')
      expect(merged!.description).toBe('User login event')
      expect(merged!.confirmation).toEqual({ status: 'unreviewed' })
    })

    it('refuses to directly edit a metric (virtual)', () => {
      const schema = createMockSchema({
        metrics: {
          dws_user_daily__dau: {
            name: 'dws_user_daily__dau',
            aggregation: 'count_distinct',
          },
        },
      }) as unknown as SemanticLayerService

      const { result } = computeEdit(schema, 'dws_user_daily__dau', {
        description: 'attempt',
      })

      expect(result.applied).toBe(false)
      expect(result.kind).toBe('metric')
      expect(result.message).toContain('virtual')
    })

    it('sets confirmation.status to unreviewed regardless of patch content', () => {
      const schema = createMockSchema({
        tables: {
          tbl: {
            table_name: 'tbl',
            description: '',
            confirmation: { status: 'confirmed', confirmed_by: 'human' },
          },
        },
      }) as unknown as SemanticLayerService

      // Even if the patch tries to set confirmation to something else. Note:
      // the patch's `confirmation` replaces the existing one in applyPatch
      // (confirmation is not smart-merged), so `confirmed_by` is lost here.
      // The WARN 6 fix only preserves fields that survive applyPatch — see
      // the next test for the preservation case.
      const { merged } = computeEdit(schema, 'tbl', {
        confirmation: { status: 'confirmed' },
      })

      // The tool always overrides status to unreviewed (G4 Q5)
      expect(merged!.confirmation).toEqual({ status: 'unreviewed' })
    })

    // WARN 6: confirmation clobber fix — preserve existing confirmation
    // metadata (confirmed_by, reviewed_at, …) when the patch does NOT touch
    // the confirmation field. Only the status is flipped.
    it('preserves existing confirmation metadata when patch omits confirmation', () => {
      const schema = createMockSchema({
        tables: {
          tbl: {
            table_name: 'tbl',
            description: '',
            confirmation: {
              status: 'confirmed',
              confirmed_by: 'analyst@example.com',
              reviewed_at: '2026-08-20T10:00:00Z',
            },
          },
        },
      }) as unknown as SemanticLayerService

      const { merged } = computeEdit(schema, 'tbl', { description: 'updated desc' })

      // Only status is flipped; confirmed_by + reviewed_at survive
      expect(merged!.confirmation).toEqual({
        status: 'unreviewed',
        confirmed_by: 'analyst@example.com',
        reviewed_at: '2026-08-20T10:00:00Z',
      })
    })

    it('preserves existing confirmation metadata for events too', () => {
      const schema = createMockSchema({
        events: {
          user_login: {
            name: 'user_login',
            description: 'old',
            confirmation: { status: 'confirmed', confirmed_by: 'human' },
          },
        },
      }) as unknown as SemanticLayerService

      const { merged } = computeEdit(schema, 'user_login', { description: 'new' })

      expect(merged!.confirmation).toEqual({
        status: 'unreviewed',
        confirmed_by: 'human',
      })
    })

    it('rejects non-object patch', () => {
      const schema = createMockSchema({
        tables: { tbl: { table_name: 'tbl' } },
      }) as unknown as SemanticLayerService

      const { result } = computeEdit(schema, 'tbl', 'not an object' as unknown as Record<string, unknown>)
      expect(result.applied).toBe(false)
      expect(result.message).toContain('patch must be a non-null object')
    })

    // CL-2: concepts resolve after table/event/metric and ARE editable
    // (description/pref_label overwrite, alt_labels union).
    it('patches a concept definition without stamping a confirmation block', () => {
      const schema = createMockSchema({
        concepts: {
          dau: { name: 'dau', pref_label: 'DAU', description: 'old', alt_labels: ['dau'] },
        },
      }) as unknown as SemanticLayerService

      const { result, merged, before, kind } = computeEdit(schema, 'dau', {
        description: 'Daily Active Users',
        alt_labels: ['DAU'],
      })

      expect(result).toEqual({
        applied: true,
        asset_name: 'dau',
        kind: 'concept',
        patched_fields: ['description', 'alt_labels'],
      })
      expect(kind).toBe('concept')
      expect(merged).toEqual({
        name: 'dau',
        pref_label: 'DAU',
        description: 'Daily Active Users',
        alt_labels: ['dau', 'DAU'],
      })
      // Concepts have no confirmation lifecycle — unlike tables/events nothing
      // is flipped to 'unreviewed'.
      expect(merged!.confirmation).toBeUndefined()
      // The before-image is the untouched definition (snapshot/delta source).
      expect(before).toEqual({ name: 'dau', pref_label: 'DAU', description: 'old', alt_labels: ['dau'] })
    })
  })

  describe('formatEditDefinition', () => {
    it('formats a successful edit', () => {
      const result: EditDefinitionResult = {
        applied: true,
        asset_name: 'dws_user_daily',
        kind: 'table',
        patched_fields: ['description', 'domains'],
      }
      const text = formatEditDefinition(result)
      expect(text).toContain('[table]')
      expect(text).toContain('dws_user_daily')
      expect(text).toContain('description, domains')
    })

    it('formats a failed edit', () => {
      const result: EditDefinitionResult = {
        applied: false,
        asset_name: 'missing',
        kind: 'unknown',
        patched_fields: [],
        message: 'not found',
      }
      expect(formatEditDefinition(result)).toBe('not found')
    })

    it('falls back to a generic message when a failed edit carries none', () => {
      const result: EditDefinitionResult = {
        applied: false,
        asset_name: 'missing',
        kind: 'unknown',
        patched_fields: [],
      }
      expect(formatEditDefinition(result)).toBe('edit failed')
    })
  })

  describe('audit integration', () => {
    it('records audit with correct params for table edits via updateTableMeta', () => {
      // The audit for table edits is handled inside updateTableMeta (which calls
      // recordTier2Write internally). We verify computeEdit produces the right
      // merged data that would be passed to updateTableMeta.
      const schema = createMockSchema({
        tables: {
          tbl: {
            table_name: 'tbl',
            description: 'before',
            columns: [],
          },
        },
      }) as unknown as SemanticLayerService

      const { result, merged } = computeEdit(schema, 'tbl', { description: 'after' })
      expect(result.applied).toBe(true)
      expect(merged).toBeDefined()
      expect(merged!.description).toBe('after')
      expect(merged!.confirmation).toEqual({ status: 'unreviewed' })
    })
  })
})

// ── Cordis tool contract (defineTool shell) ─────────────────────────────────
//
// `apply` itself — and with it the registered name / description /
// output.schema — is already exercised by the tool-catalog generator spec.
// What follows pins the parts nothing else runs: `output.render`,
// `output.presentationMeta`, `execute` (abort, not-found, table, event,
// concept, write-failure, thrown write, missing before-image) and the two
// presenters. No Cordis container is started: `ctx` is a stub carrying only
// the seams the tool reads (`ctx.tools.register`, `ctx.schema`, `ctx.audit`),
// mirroring packages/data/tool-search-data-sources/tests.

/** The subset of the registered tool definition these tests exercise. */
interface ToolDef {
  readonly name: string
  readonly description: string
  readonly output: {
    readonly schema: unknown
    readonly render: (args: unknown, value: unknown) => readonly { readonly type: string; readonly text: string }[]
    readonly presentationMeta?: (args: unknown, value: unknown) => unknown
  }
  readonly execute: (
    args: { readonly asset_name: string; readonly patch: Record<string, unknown> },
    exec: { readonly signal: AbortSignal },
  ) => Promise<EditDefinitionResult>
  readonly presentCall: (args: unknown) => unknown
  readonly presentResult: (args: unknown, result: { readonly isError?: boolean; readonly meta?: unknown }) => unknown
}

/** `ctx.audit` double: the snapshot store plus the tier-2 delta recorder. */
function createMockAudit() {
  return {
    store: { recordSnapshot: vi.fn() },
    recordTier2Write: vi.fn(),
  }
}

type MockAudit = ReturnType<typeof createMockAudit>

/** Capture the definition `apply` registers, without starting Cordis. */
function registerTool(schema: unknown, audit: MockAudit = createMockAudit()): { def: ToolDef; audit: MockAudit } {
  let def: ToolDef | undefined
  const ctx = {
    tools: { register: (d: ToolDef) => { def = d } },
    schema,
    audit,
  } as unknown as Context
  apply(ctx, {})
  if (def === undefined) throw new Error('apply did not register a tool')
  return { def, audit }
}

/** A live (non-aborted) execution context. */
function runContext(): { signal: AbortSignal } {
  return { signal: new AbortController().signal }
}

/** A confirmed table definition, fresh per call so `before` stays pristine. */
function tableBefore(): Record<string, unknown> {
  return {
    table_name: 'dws_user_daily',
    description: 'old desc',
    domains: ['gaming'],
    confirmation: { status: 'confirmed', confirmed_by: 'analyst@example.com' },
  }
}

describe('edit_definition tool contract', () => {
  describe('output projection', () => {
    it('renders the one-line summary of an applied edit', () => {
      const { def } = registerTool(createMockSchema())
      expect(def.output.render({ asset_name: 'dws_user_daily', patch: {} }, {
        applied: true,
        asset_name: 'dws_user_daily',
        kind: 'table',
        patched_fields: ['description', 'domains'],
      })).toEqual([{ type: 'text', text: '[table] dws_user_daily: patched fields: description, domains' }])
    })

    it('renders the failure message of a rejected edit', () => {
      const { def } = registerTool(createMockSchema())
      expect(def.output.render({ asset_name: 'ghost', patch: {} }, {
        applied: false,
        asset_name: 'ghost',
        kind: 'unknown',
        patched_fields: [],
        message: 'no table, event, metric, or concept named "ghost" found',
      })).toEqual([{ type: 'text', text: 'no table, event, metric, or concept named "ghost" found' }])
    })

    it('hands the whole result to the UI as presentation meta', () => {
      const { def } = registerTool(createMockSchema())
      const value: EditDefinitionResult = {
        applied: true,
        asset_name: 'dws_user_daily',
        kind: 'table',
        patched_fields: ['description'],
      }
      expect(def.output.presentationMeta?.({ asset_name: 'dws_user_daily', patch: {} }, value)).toBe(value)
    })
  })

  describe('execute', () => {
    it('rejects with the tool-specific abort message when the signal is already aborted', async () => {
      const { def, audit } = registerTool(createMockSchema({ tables: { dws_user_daily: tableBefore() } }))
      const controller = new AbortController()
      controller.abort()

      await expect(def.execute(
        { asset_name: 'dws_user_daily', patch: { description: 'never applied' } },
        { signal: controller.signal },
      )).rejects.toThrow(new Error('edit_definition aborted'))

      expect(audit.store.recordSnapshot).not.toHaveBeenCalled()
      expect(audit.recordTier2Write).not.toHaveBeenCalled()
    })

    it('returns the not-found result without writing or auditing', async () => {
      const { def, audit } = registerTool(createMockSchema())

      const out = await def.execute({ asset_name: 'ghost', patch: { description: 'x' } }, runContext())

      expect(out).toEqual({
        applied: false,
        asset_name: 'ghost',
        kind: 'unknown',
        patched_fields: [],
        message: 'no table, event, metric, or concept named "ghost" found',
      })
      expect(audit.store.recordSnapshot).not.toHaveBeenCalled()
      expect(audit.recordTier2Write).not.toHaveBeenCalled()
    })

    it('persists a table edit as a partial override and records snapshot + structured delta', async () => {
      const schema = createMockSchema({ tables: { dws_user_daily: tableBefore() } })
      const { def, audit } = registerTool(schema)

      const out = await def.execute(
        { asset_name: 'dws_user_daily', patch: { description: 'Daily user metrics' } },
        runContext(),
      )

      expect(out).toEqual({
        applied: true,
        asset_name: 'dws_user_daily',
        kind: 'table',
        patched_fields: ['description'],
      })
      // D3-3 (TOCTOU): the substrate receives the patch plus the confirmation
      // flip — never the full merged dict rebuilt from the stale read.
      expect(schema.updateTableMeta).toHaveBeenCalledWith('dws_user_daily', {
        description: 'Daily user metrics',
        confirmation: { status: 'unreviewed', confirmed_by: 'analyst@example.com' },
      })
      // W11 S1: the undo snapshot is the BEFORE image, not the merged result.
      expect(audit.store.recordSnapshot).toHaveBeenCalledTimes(1)
      expect(audit.store.recordSnapshot).toHaveBeenCalledWith('dws_user_daily', 'table', dumpYaml(tableBefore()))
      // …which is why the expected payload still carries the pre-edit description.
      expect(dumpYaml(tableBefore())).toContain('old desc')
      expect(dumpYaml(tableBefore())).not.toContain('Daily user metrics')
      // V1 (G6 D4): structured delta co-located with the tier-2 row, with the
      // automatic confirmation flip stripped as noise.
      expect(audit.recordTier2Write).toHaveBeenCalledWith(
        'edit_definition',
        { asset_name: 'dws_user_daily', patch: { description: 'Daily user metrics' } },
        {
          delta: {
            added: {},
            modified: { description: { from: 'old desc', to: 'Daily user metrics' } },
            removed: [],
          },
          asset_name: 'dws_user_daily',
          kind: 'table',
        },
      )
    })

    it('reports a refused table write with the substrate error and skips the delta audit', async () => {
      const schema = {
        ...createMockSchema({ tables: { dws_user_daily: tableBefore() } }),
        updateTableMeta: vi.fn().mockResolvedValue({ ok: false, error: 'permission denied' }),
      }
      const { def, audit } = registerTool(schema)

      const out = await def.execute({ asset_name: 'dws_user_daily', patch: { description: 'x' } }, runContext())

      expect(out).toEqual({
        applied: false,
        asset_name: 'dws_user_daily',
        kind: 'table',
        patched_fields: [],
        message: 'write failed: permission denied',
      })
      expect(audit.recordTier2Write).not.toHaveBeenCalled()
    })

    it('reports a thrown write as a write error carrying the resolved kind', async () => {
      const schema = {
        ...createMockSchema({ tables: { dws_user_daily: tableBefore() } }),
        updateTableMeta: vi.fn().mockRejectedValue(new Error('EACCES: disk is read-only')),
      }
      const { def, audit } = registerTool(schema)

      const out = await def.execute({ asset_name: 'dws_user_daily', patch: { description: 'x' } }, runContext())

      expect(out).toEqual({
        applied: false,
        asset_name: 'dws_user_daily',
        kind: 'table',
        patched_fields: [],
        message: 'write error: EACCES: disk is read-only',
      })
      expect(audit.recordTier2Write).not.toHaveBeenCalled()
    })

    it('persists an event edit through updateEventMeta, stamping an unconfirmed event', async () => {
      const schema = {
        ...createMockSchema({ events: { user_login: { name: 'user_login', description: 'old', domains: ['auth'] } } }),
        updateEventMeta: vi.fn().mockResolvedValue({ ok: true }),
      }
      const { def, audit } = registerTool(schema)

      const out = await def.execute(
        { asset_name: 'user_login', patch: { description: 'User login event' } },
        runContext(),
      )

      expect(out).toEqual({
        applied: true,
        asset_name: 'user_login',
        kind: 'event',
        patched_fields: ['description'],
      })
      // A13: mirrors the table branch — partial override, not the merged dict.
      // The event carried no confirmation block, so only the status appears.
      expect(schema.updateEventMeta).toHaveBeenCalledWith('user_login', {
        description: 'User login event',
        confirmation: { status: 'unreviewed' },
      })
      expect(audit.store.recordSnapshot).toHaveBeenCalledWith(
        'user_login',
        'event',
        dumpYaml({ name: 'user_login', description: 'old', domains: ['auth'] }),
      )
      expect(audit.recordTier2Write).toHaveBeenCalledWith(
        'edit_definition',
        { asset_name: 'user_login', patch: { description: 'User login event' } },
        {
          delta: {
            added: {},
            modified: { description: { from: 'old', to: 'User login event' } },
            removed: [],
          },
          asset_name: 'user_login',
          kind: 'event',
        },
      )
    })

    it('reports a refused event write with the substrate error and skips the delta audit', async () => {
      const schema = {
        ...createMockSchema({ events: { user_login: { name: 'user_login', description: 'old' } } }),
        updateEventMeta: vi.fn().mockResolvedValue({ ok: false, error: 'event yaml is locked' }),
      }
      const { def, audit } = registerTool(schema)

      const out = await def.execute({ asset_name: 'user_login', patch: { description: 'x' } }, runContext())

      expect(out).toEqual({
        applied: false,
        asset_name: 'user_login',
        kind: 'event',
        patched_fields: [],
        message: 'write failed: event yaml is locked',
      })
      expect(audit.recordTier2Write).not.toHaveBeenCalled()
    })

    it('writes a concept edit into <semanticRoot>/concepts and bumps the corpus version', async () => {
      const root = mkdtempSync(join(tmpdir(), 'edit-definition-concept-'))
      try {
        const before = { name: 'dau', pref_label: 'DAU', description: 'old', alt_labels: ['dau'] }
        const schema = { ...createMockSchema({ concepts: { dau: before } }), semanticRoot: root }
        const { def, audit } = registerTool(schema)
        expect(getCorpusVersion(root)).toBe(0)

        const out = await def.execute(
          { asset_name: 'dau', patch: { description: 'Daily Active Users', alt_labels: ['DAU', '日活'] } },
          runContext(),
        )

        expect(out).toEqual({
          applied: true,
          asset_name: 'dau',
          kind: 'concept',
          patched_fields: ['description', 'alt_labels'],
        })
        // Concepts are written whole (no updateConceptMeta substrate): the YAML
        // on disk is the merged definition, alt_labels unioned.
        expect(readFileSync(join(root, 'concepts', 'dau.yaml'), 'utf8')).toBe(dumpYaml({
          name: 'dau',
          pref_label: 'DAU',
          description: 'Daily Active Users',
          alt_labels: ['dau', 'DAU', '日活'],
        }))
        // data-tools-discovery-3: the corpus-version signal advances so the
        // BM25 caches and alias graph rebuild.
        expect(getCorpusVersion(root)).toBe(1)
        expect(audit.store.recordSnapshot).toHaveBeenCalledWith('dau', 'concept', dumpYaml(before))
        expect(audit.recordTier2Write).toHaveBeenCalledWith(
          'edit_definition',
          { asset_name: 'dau', patch: { description: 'Daily Active Users', alt_labels: ['DAU', '日活'] } },
          {
            delta: {
              added: { alt_labels: ['DAU', '日活'] },
              modified: { description: { from: 'old', to: 'Daily Active Users' } },
              removed: [],
            },
            asset_name: 'dau',
            kind: 'concept',
          },
        )
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })

    it('writes without snapshot or delta when the resolved definition has no before image', async () => {
      // The loader contract is `Definition | null` and the resolver guard is
      // `!== null`, so a loader answering `undefined` still resolves as
      // "found" while leaving `before` undefined. Pins the fail-open shape:
      // the business write still happens, but there is nothing to snapshot or
      // diff, so neither audit seam is touched.
      const schema = {
        ...createMockSchema(),
        loadTableDefinition: vi.fn(() => undefined),
        updateTableMeta: vi.fn().mockResolvedValue({ ok: true }),
      }
      const { def, audit } = registerTool(schema)

      const out = await def.execute({ asset_name: 'phantom', patch: { description: 'x' } }, runContext())

      expect(out).toEqual({
        applied: true,
        asset_name: 'phantom',
        kind: 'table',
        patched_fields: ['description'],
      })
      expect(schema.updateTableMeta).toHaveBeenCalledWith('phantom', {
        description: 'x',
        confirmation: { status: 'unreviewed' },
      })
      expect(audit.store.recordSnapshot).not.toHaveBeenCalled()
      expect(audit.recordTier2Write).not.toHaveBeenCalled()
    })
  })

  describe('presenters', () => {
    it('presents the pending call as a generic edit card naming the asset', () => {
      const { def } = registerTool(createMockSchema())
      expect(def.presentCall({ asset_name: 'dws_user_daily', patch: { description: 'x' } })).toEqual({
        card: 'generic',
        title: 'Edit: dws_user_daily',
        kind: 'edit',
      })
    })

    it('presents no card for an errored result', () => {
      const { def } = registerTool(createMockSchema())
      expect(def.presentResult({ asset_name: 'dws_user_daily', patch: {} }, { isError: true })).toBeUndefined()
    })

    it('presents a failure card when the result carries no applied meta', () => {
      const { def } = registerTool(createMockSchema())
      expect(def.presentResult({ asset_name: 'dws_user_daily', patch: {} }, {})).toEqual({
        card: 'generic',
        title: 'Edit failed: dws_user_daily',
      })
      expect(def.presentResult({ asset_name: 'ghost', patch: {} }, {
        meta: { applied: false, asset_name: 'ghost', kind: 'unknown', patched_fields: [] },
      })).toEqual({
        card: 'generic',
        title: 'Edit failed: ghost',
      })
    })

    it('presents the edited kind, asset and patched fields on success', () => {
      const { def } = registerTool(createMockSchema())
      expect(def.presentResult({ asset_name: 'dws_user_daily', patch: {} }, {
        meta: {
          applied: true,
          asset_name: 'dws_user_daily',
          kind: 'table',
          patched_fields: ['description', 'domains'],
        },
      })).toEqual({
        card: 'generic',
        title: 'Edited table: dws_user_daily [description, domains]',
      })
    })
  })
})
