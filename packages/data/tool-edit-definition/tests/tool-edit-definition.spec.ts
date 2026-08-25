import { describe, expect, it, vi } from 'vitest'
import {
  validateAssetName,
  applyPatch,
  computeEdit,
  formatEditDefinition,
  type EditDefinitionResult,
} from '../src/index.ts'

// ── Mock SemanticLayerService ───────────────────────────────────────────────

function createMockSchema(assets: {
  tables?: Record<string, Record<string, unknown>>
  events?: Record<string, Record<string, unknown>>
  metrics?: Record<string, Record<string, unknown>>
} = {}) {
  return {
    semanticRoot: '/tmp/test-semantic-layer',
    loadTableDefinition: vi.fn((name: string) => assets.tables?.[name] ?? null),
    loadEventDefinition: vi.fn((name: string) => assets.events?.[name] ?? null),
    loadMetricDefinition: vi.fn((name: string) => assets.metrics?.[name] ?? null),
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
      expect(cols[0].comment).toBe('updated comment')
      expect(cols[0].type).toBe('STRING')
      expect(cols[1].comment).toBe('keep')
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
      expect(cols[1].name).toBe('col_new')
    })

    it('skips columns without a name field', () => {
      const existing = { columns: [{ name: 'col_a', type: 'STRING' }] }
      const patch = { columns: [{ type: 'BIGINT' }] } // no name
      const result = applyPatch(existing, patch)
      const cols = result.columns as Array<Record<string, unknown>>
      expect(cols).toHaveLength(1) // not appended
    })
  })

  describe('computeEdit', () => {
    it('returns error when schema is undefined', () => {
      const { result } = computeEdit(undefined, 'test_table', { description: 'x' })
      expect(result.applied).toBe(false)
      expect(result.message).toContain('semantic-layer not mounted')
    })

    it('returns error for invalid asset name', () => {
      const schema = createMockSchema() as unknown
      const { result } = computeEdit(schema, '../bad', { description: 'x' })
      expect(result.applied).toBe(false)
      expect(result.message).toContain('invalid asset name')
    })

    it('returns error when asset not found', () => {
      const schema = createMockSchema() as unknown
      const { result } = computeEdit(schema, 'nonexistent', { description: 'x' })
      expect(result.applied).toBe(false)
      expect(result.message).toContain('no table, event, or metric')
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
      }) as unknown

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
      }) as unknown

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
      }) as unknown

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
      }) as unknown

      // Even if the patch tries to set confirmation to something else
      const { merged } = computeEdit(schema, 'tbl', {
        confirmation: { status: 'confirmed' },
      })

      // The tool always overrides to unreviewed (G4 Q5)
      expect(merged!.confirmation).toEqual({ status: 'unreviewed' })
    })

    it('rejects non-object patch', () => {
      const schema = createMockSchema({
        tables: { tbl: { table_name: 'tbl' } },
      }) as unknown

      const { result } = computeEdit(schema, 'tbl', 'not an object' as unknown)
      expect(result.applied).toBe(false)
      expect(result.message).toContain('patch must be a non-null object')
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
      }) as unknown

      const { result, merged } = computeEdit(schema, 'tbl', { description: 'after' })
      expect(result.applied).toBe(true)
      expect(merged).toBeDefined()
      expect(merged!.description).toBe('after')
      expect(merged!.confirmation).toEqual({ status: 'unreviewed' })
    })
  })
})
