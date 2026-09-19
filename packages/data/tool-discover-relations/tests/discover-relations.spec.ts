/**
 * discover_relations tool (B4) — registration (defineTool + ctx.tools.register)
 * + the enrichment core that probes `ctx.schema`. Mirrors
 * `tool-load-table-definition`: pure logic testable with a schema double, a
 * path-traversal name guard on the model-supplied `tables`, the not-mounted
 * honest fallback, and a readable summary render.
 *
 * Run: `pnpm vitest run packages/data/tool-discover-relations`
 */
import { test, expect } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools'
import {
  apply,
  validateTableName,
  discoverRelationsResult,
  formatDiscoverRelations,
  type DiscoverRelationsResult,
} from '../src/index.ts'
import type { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer/src/index.ts'

/** A stub SemanticLayerService that records the discoverRelations opts + returns a summary. */
function stubSchema(summary: { enriched: number; written: number; errors: string[] }, optsSink?: { tables?: string[] }[]) {
  return {
    discoverRelations: async (opts: { tables?: readonly string[] } = {}) => {
      if (optsSink !== undefined) optsSink.push({ ...(opts.tables !== undefined ? { tables: [...opts.tables] } : {}) })
      return { ...summary }
    },
  }
}

interface ToolDef {
  readonly name: string
  readonly description: string
  readonly output: {
    readonly schema: unknown
    readonly render: (args: unknown, value: DiscoverRelationsResult) => readonly { readonly type: 'text'; readonly text: string }[]
  }
  readonly execute: (
    args: { readonly tables?: string[] },
    exec: { readonly signal: AbortSignal },
  ) => Promise<DiscoverRelationsResult>
}

function registerTool(schema?: unknown): ToolDef {
  let def: ToolDef | undefined
  const ctx = {
    tools: { register: (d: ToolDef) => { def = d } },
    get: () => schema,
  } as unknown as Context
  apply(ctx, {})
  if (def === undefined) throw new Error('apply did not register a tool')
  return def
}

test('S1 validateTableName accepts plain names, rejects path-traversal + empty', () => {
  expect(validateTableName('dws_pay_order_di')).toBe('dws_pay_order_di')
  expect(validateTableName('  dim_charm_info  ')).toBe('dim_charm_info')
  expect(validateTableName('foo.bar')).toBe('foo.bar')
  expect(validateTableName('')).toBeNull()
  expect(validateTableName('   ')).toBeNull()
  expect(validateTableName('../etc/passwd')).toBeNull()
  expect(validateTableName('a/b')).toBeNull()
  expect(validateTableName('a\\b')).toBeNull()
  expect(validateTableName('..')).toBeNull()
  expect(validateTableName('foo..bar')).toBeNull()
  expect(validateTableName('bad\x00name')).toBeNull()
  expect(validateTableName('a'.repeat(201))).toBeNull()
})

test('S2 discoverRelationsResult - not mounted (schema undefined)', async () => {
  const r = await discoverRelationsResult(undefined)
  expect(r.ok).toBe(false)
  expect(r.message).toContain('not mounted')
})

test('S3 discoverRelationsResult - no tables filter calls discoverRelations({}) + returns summary', async () => {
  const opts: { tables?: string[] }[] = []
  const r = await discoverRelationsResult(stubSchema({ enriched: 5, written: 8, errors: [] }, opts) as unknown as SemanticLayerService)
  expect(r.ok).toBe(true)
  expect(r.enriched).toBe(5)
  expect(r.written).toBe(8)
  expect(r.errors).toEqual([])
  expect(opts).toEqual([{}])
})

test('S4 discoverRelationsResult - tables filter forwarded validated', async () => {
  const opts: { tables?: string[] }[] = []
  const r = await discoverRelationsResult(stubSchema({ enriched: 1, written: 1, errors: [] }, opts) as unknown as SemanticLayerService, ['dws_a', ' dws_b '])
  expect(r.ok).toBe(true)
  expect(opts[0]?.tables).toEqual(['dws_a', 'dws_b']) // trimmed
})

test('S5 discoverRelationsResult - invalid table name rejected before substrate touch', async () => {
  const opts: { tables?: string[] }[] = []
  const r = await discoverRelationsResult(stubSchema({ enriched: 0, written: 0, errors: [] }, opts) as unknown as SemanticLayerService, ['good', '../bad'])
  expect(r.ok).toBe(false)
  expect(r.message).toContain('invalid')
  expect(opts).toEqual([]) // substrate never called
})

test('S6 apply registers discover_relations (name + description + output + execute)', () => {
  const def = registerTool()
  expect(def.name).toBe('discover_relations')
  expect(def.description).toContain('relation')
  expect(def.output).toBeDefined()
  expect(typeof def.execute).toBe('function')
})

test('S7 execute returns the summary via ctx.get(schema) when mounted', async () => {
  const def = registerTool(stubSchema({ enriched: 3, written: 10, errors: ['e1'] }))
  const out = await def.execute({}, { signal: new AbortController().signal })
  expect(out.ok).toBe(true)
  expect(out.enriched).toBe(3)
  expect(out.written).toBe(10)
  expect(out.errors).toEqual(['e1'])
})

test('S8 execute - not-mounted honest fallback when schema absent', async () => {
  const def = registerTool(undefined)
  const out = await def.execute({}, { signal: new AbortController().signal })
  expect(out.ok).toBe(false)
  expect(out.message).toContain('not mounted')
})

test('S9 render formats a successful summary', () => {
  const def = registerTool()
  const out = def.output.render({}, { ok: true, enriched: 5, written: 8, errors: [] })
  expect(out[0]?.type).toBe('text')
  expect(out[0]?.text).toContain('5')
  expect(out[0]?.text).toContain('8')
})

test('S10 render formats errors when present', () => {
  const def = registerTool()
  const out = def.output.render({}, { ok: true, enriched: 0, written: 2, errors: ['dws_x: boom'] })
  expect(out[0]?.text).toContain('dws_x: boom')
})

test('S11 render formats the not-mounted message', () => {
  const def = registerTool()
  const out = def.output.render({}, { ok: false, message: 'semantic-layer substrate not mounted' })
  expect(out[0]?.text).toContain('not mounted')
})

test('S12 render shows added/removed diff when before/after snapshots differ [GA-GT3-6b]', () => {
  // GA-GT3-6b: formatDiscoverRelations renders an agent-visible add/remove
  // diff (computeAddedRelations + computeRemovedRelations via _before/_after)
  // so the agent sees exactly which dimension_refs changed, not just counts.
  const before = [
    { table: 'dws_a', refs: [{ dim_table: 'dim_old', join_keys: [{ dws_column: 'old_id', dim_column: 'old_id' }], derivation: 'old' }] },
  ]
  const after = [
    { table: 'dws_a', refs: [{ dim_table: 'dim_new', join_keys: [{ dws_column: 'new_id', dim_column: 'new_id' }], derivation: 'new' }] },
  ]
  const value = {
    ok: true,
    enriched: 1,
    written: 1,
    errors: [],
    _before: before,
    _after: after,
  } as DiscoverRelationsResult
  const out = formatDiscoverRelations(value)
  expect(out).toContain('added (')
  expect(out).toContain('removed (')
  expect(out).toContain('dim_new')
  expect(out).toContain('dim_old')
})

test('S13 render shows a note line when result carries a note [GA-GT3-6b]', () => {
  const value = {
    ok: true,
    enriched: 0,
    written: 0,
    errors: [],
    note: 'no DIM tables in scope, nothing to enrich',
  } as DiscoverRelationsResult
  const out = formatDiscoverRelations(value)
  expect(out).toContain('note:')
  expect(out).toContain('no DIM tables in scope, nothing to enrich')
})

// ───────────────────────────────────────────────────────────────────────────
// The rest of the Cordis tool contract. S1–S13 above drive the enrichment core
// over a schema double with no `semanticRoot`, so they never reach: the
// substrate-error sanitizer (the catch arm), the relation snapshot itself (the
// real `loadTables` + `TableDefinitionSchema` scan), the >20-entry render
// tails, `output.presentationMeta`, the aborted `execute`, and the
// `presentCall` / `presentResult` cards. S14+ below cover exactly those.
// ───────────────────────────────────────────────────────────────────────────

/**
 * A {@link stubSchema} variant whose `discoverRelations` rejects — the only door
 * to the catch arm and, through it, the private `sanitizeError`. `failure` is
 * re-thrown verbatim so one test can drive the `Error` arm and another the
 * non-`Error` (`String(e)`) arm.
 */
function failingSchema(failure: unknown) {
  return {
    discoverRelations: async () => {
      throw failure
    },
  }
}

/**
 * A {@link stubSchema} variant that also exposes `semanticRoot`, so the relation
 * snapshot runs the REAL `loadTables` + `TableDefinitionSchema` over a fixture
 * layer. `mutate` runs inside `discoverRelations`, i.e. between the before and
 * after snapshots — that is how a substrate write becomes a visible diff.
 */
function rootedSchema(
  root: string,
  summary: { enriched: number; written: number; errors: string[] },
  mutate?: () => void,
) {
  const base = stubSchema(summary)
  return {
    semanticRoot: root,
    discoverRelations: async (opts: { tables?: readonly string[] } = {}) => {
      mutate?.()
      return base.discoverRelations(opts)
    },
  }
}

/** Write one table definition YAML into `<root>/tables/<file>`. */
function writeTable(root: string, file: string, lines: readonly string[]): void {
  writeFileSync(join(root, 'tables', file), `${lines.join('\n')}\n`)
}

/**
 * Run `body` against a private throwaway semantic layer (never a predictable
 * shared path), removed afterwards even when the body throws.
 */
async function withTempLayer(body: (root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'dsh-discover-relations-'))
  mkdirSync(join(root, 'tables'), { recursive: true })
  try {
    await body(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

/**
 * The presentation half of the same registered definition {@link registerTool}
 * returns; {@link ToolDef} above models only the parts S6–S11 need.
 */
interface PresentationToolDef extends ToolDef {
  readonly output: ToolDef['output'] & {
    readonly presentationMeta: (args: unknown, value: DiscoverRelationsResult) => unknown
  }
  readonly presentCall: (args: { readonly tables?: readonly string[] }) => GenericCallView
  readonly presentResult: (args: unknown, result: ToolResult) => GenericResultView | undefined
}

/** {@link registerTool}, narrowed to the presentation half of the contract. */
function registerPresentationTool(schema?: unknown): PresentationToolDef {
  return registerTool(schema) as PresentationToolDef
}

/** A completed {@link ToolResult} carrying only what `presentResult` reads. */
function completed(fields: { readonly isError?: boolean; readonly meta?: unknown }): ToolResult {
  return {
    content: [],
    isError: fields.isError ?? false,
    ...(fields.meta !== undefined ? { meta: fields.meta } : {}),
  } as unknown as ToolResult
}

/** `count` dimension refs named `<prefix>_00 .. <prefix>_NN` on one join key. */
function manyRefs(count: number, prefix: string) {
  return Array.from({ length: count }, (_, i) => ({
    dim_table: `${prefix}_${String(i).padStart(2, '0')}`,
    join_keys: [{ dws_column: 'id', dim_column: 'id' }],
    derivation: '',
  }))
}

test('S14 substrate Error is collapsed to one line with filesystem paths redacted', async () => {
  const boom = new Error('discover failed\u0007\n  at /home/dsh/workspace/semantic/tables/dws_pay_order_di.yaml')
  const r = await discoverRelationsResult(failingSchema(boom) as unknown as SemanticLayerService)
  expect(r.ok).toBe(false)
  // Exact: the BEL + newline became one space, the whole path became <path>.
  expect(r.message).toBe('substrate error: discover failed at <path>')
  expect(r.message).not.toContain('dws_pay_order_di')
  expect(r.message).not.toContain('/home')
  expect(r.message).not.toContain('\n')
})

test('S15 a non-Error substrate rejection is stringified and redacted too', async () => {
  const r = await discoverRelationsResult(
    failingSchema('EACCES: /etc/dsh/tokens/admin.key not readable') as unknown as SemanticLayerService,
  )
  expect(r.ok).toBe(false)
  expect(r.message).toBe('substrate error: EACCES: <path> not readable')
  expect(r.message).not.toContain('admin.key')
})

test('S16 a long substrate message is bounded to 200 chars plus an ellipsis', async () => {
  const r = await discoverRelationsResult(
    failingSchema(new Error('x'.repeat(250))) as unknown as SemanticLayerService,
  )
  expect(r.message).toBe(`substrate error: ${'x'.repeat(200)}...`)
})

test('S17 discoverRelationsResult forwards the substrate note when present [GA-GT3-6b]', async () => {
  const summary = { enriched: 0, written: 0, errors: [], note: 'DIM inventory empty, nothing to join' }
  const r = await discoverRelationsResult(stubSchema(summary) as unknown as SemanticLayerService)
  expect(r.ok).toBe(true)
  expect(r.note).toBe('DIM inventory empty, nothing to join')
})

test('S18 relation snapshots diff a real semantic layer across the substrate write', async () => {
  await withTempLayer(async (root) => {
    // Sorted by filename, so the snapshot order is dim_broken, dws_a, dws_gone.
    // dim_broken is a DIM without primary_key/label_columns: TableDefinitionSchema
    // rejects it, and the scan must skip it instead of poisoning the snapshot.
    writeTable(root, 'dim_broken.yaml', ['table_name: dim_broken', 'kind: dim'])
    const dwsA = (secondRef: readonly string[]): readonly string[] => [
      'table_name: dws_a',
      'kind: dws',
      'dimension_refs:',
      '  - dim_table: dim_kept',
      '    join_keys:',
      '      - dws_column: kept_id',
      '        dim_column: kept_id',
      '    derivation: legacy',
      ...secondRef,
    ]
    writeTable(root, 'dws_a.yaml', dwsA([
      '  - dim_table: dim_gone',
      '    join_keys:',
      '      - dws_column: gone_id',
      '        dim_column: gone_id',
    ]))
    writeTable(root, 'dws_gone.yaml', [
      'table_name: dws_gone',
      'kind: dws',
      'dimension_refs:',
      '  - dim_table: dim_x',
      '    join_keys:',
      '      - dws_column: x_id',
      '        dim_column: x_id',
    ])

    const schema = rootedSchema(root, { enriched: 2, written: 2, errors: [] }, () => {
      // The "write" the substrate would have performed: dws_a swaps dim_gone for
      // dim_new (dim_kept survives), dws_gone disappears, dws_c appears.
      writeTable(root, 'dws_a.yaml', dwsA([
        '  - dim_table: dim_new',
        '    join_keys:',
        '      - dws_column: new_id',
        '        dim_column: new_id',
      ]))
      unlinkSync(join(root, 'tables', 'dws_gone.yaml'))
      writeTable(root, 'dws_c.yaml', [
        'table_name: dws_c',
        'kind: dws',
        'dimension_refs:',
        '  - dim_table: dim_c',
        '    join_keys:',
        '      - dws_column: c_id',
        '        dim_column: c_id',
      ])
    })

    const r = await discoverRelationsResult(schema as unknown as SemanticLayerService)
    expect(r.ok).toBe(true)
    expect(r._before).toEqual([
      {
        table: 'dws_a',
        refs: [
          { dim_table: 'dim_kept', join_keys: [{ dws_column: 'kept_id', dim_column: 'kept_id' }], derivation: 'legacy' },
          { dim_table: 'dim_gone', join_keys: [{ dws_column: 'gone_id', dim_column: 'gone_id' }], derivation: '' },
        ],
      },
      {
        table: 'dws_gone',
        refs: [{ dim_table: 'dim_x', join_keys: [{ dws_column: 'x_id', dim_column: 'x_id' }], derivation: '' }],
      },
    ])
    expect(r._after).toEqual([
      {
        table: 'dws_a',
        refs: [
          { dim_table: 'dim_kept', join_keys: [{ dws_column: 'kept_id', dim_column: 'kept_id' }], derivation: 'legacy' },
          { dim_table: 'dim_new', join_keys: [{ dws_column: 'new_id', dim_column: 'new_id' }], derivation: '' },
        ],
      },
      {
        table: 'dws_c',
        refs: [{ dim_table: 'dim_c', join_keys: [{ dws_column: 'c_id', dim_column: 'c_id' }], derivation: '' }],
      },
    ])
    // dim_kept is in both snapshots, so it appears in NEITHER list; dws_c has no
    // before entry and dws_gone has no after entry, and both still diff.
    expect(formatDiscoverRelations(r).split('\n')).toEqual([
      'discover_relations: enriched 2 DWS table(s) (written 2).',
      'added (2):',
      '  - dws_a → dim_new [{"dws_column":"new_id","dim_column":"new_id"}]',
      '  - dws_c → dim_c [{"dws_column":"c_id","dim_column":"c_id"}]',
      'removed (2):',
      '  - dws_a → dim_gone [{"dws_column":"gone_id","dim_column":"gone_id"}]',
      '  - dws_gone → dim_x [{"dws_column":"x_id","dim_column":"x_id"}]',
    ])
  })
})

test('S19 a tables filter narrows the relation snapshot to the named tables', async () => {
  await withTempLayer(async (root) => {
    writeTable(root, 'dws_a.yaml', [
      'table_name: dws_a',
      'dimension_refs:',
      '  - dim_table: dim_a',
      '    join_keys:',
      '      - dws_column: a_id',
      '        dim_column: a_id',
    ])
    writeTable(root, 'dws_b.yaml', [
      'table_name: dws_b',
      'dimension_refs:',
      '  - dim_table: dim_b',
      '    join_keys:',
      '      - dws_column: b_id',
      '        dim_column: b_id',
    ])
    const r = await discoverRelationsResult(
      rootedSchema(root, { enriched: 1, written: 1, errors: [] }) as unknown as SemanticLayerService,
      ['dws_a'],
    )
    const onlyA = [{
      table: 'dws_a',
      refs: [{ dim_table: 'dim_a', join_keys: [{ dws_column: 'a_id', dim_column: 'a_id' }], derivation: '' }],
    }]
    expect(r._before).toEqual(onlyA) // dws_b is out of scope, so it is absent
    expect(r._after).toEqual(onlyA)
  })
})

test('S21 render falls back to a sentinel sentence when a failed result carries no message', () => {
  expect(formatDiscoverRelations({ ok: false })).toBe('discover_relations: no result.')
})

test('S22 render reports zero counts when the substrate summary omits them', () => {
  expect(formatDiscoverRelations({ ok: true }))
    .toBe('discover_relations: enriched 0 DWS table(s) (written 0).')
})

test('S23 render caps the added / removed / errors lists at 20 entries each', () => {
  const value = {
    ok: true,
    enriched: 1,
    written: 1,
    errors: Array.from({ length: 21 }, (_, i) => `err_${String(i).padStart(2, '0')}`),
    _before: [{ table: 'dws_x', refs: manyRefs(21, 'dim_rm') }],
    _after: [{ table: 'dws_x', refs: manyRefs(21, 'dim_add') }],
  } as DiscoverRelationsResult
  const out = formatDiscoverRelations(value)
  const lines = out.split('\n')
  expect(lines).toHaveLength(67) // 1 counts + 3 * (1 header + 20 rows + 1 tail)
  expect(lines[1]).toBe('added (21):')
  expect(lines[21]).toBe('  - dws_x → dim_add_19 [{"dws_column":"id","dim_column":"id"}]')
  expect(lines[22]).toBe('  ... +1 more')
  expect(lines[23]).toBe('removed (21):')
  expect(lines[43]).toBe('  - dws_x → dim_rm_19 [{"dws_column":"id","dim_column":"id"}]')
  expect(lines[44]).toBe('  ... +1 more')
  expect(lines[45]).toBe('errors (21):')
  expect(lines[65]).toBe('  - err_19')
  expect(lines[66]).toBe('  ... +1 more')
  // The 21st entry of each list is summarized, never printed.
  expect(out).not.toContain('dim_add_20')
  expect(out).not.toContain('dim_rm_20')
  expect(out).not.toContain('err_20')
})

test('S24 presentationMeta reports ok:false for a failed result', () => {
  expect(registerPresentationTool().output.presentationMeta({}, { ok: false, message: 'not mounted' }))
    .toEqual({ ok: false })
})

test('S25 presentationMeta reports ok:false when the before snapshot is missing', () => {
  const value = { ok: true, enriched: 1, written: 1, _after: [] } as DiscoverRelationsResult
  expect(registerPresentationTool().output.presentationMeta({}, value)).toEqual({ ok: false })
})

test('S26 presentationMeta reports ok:false when the after snapshot is missing', () => {
  const value = { ok: true, enriched: 1, written: 1, _before: [] } as DiscoverRelationsResult
  expect(registerPresentationTool().output.presentationMeta({}, value)).toEqual({ ok: false })
})

test('S27 presentationMeta projects counts, both snapshots, and the diff', () => {
  const before = [{ table: 'dws_a', refs: [] }]
  const after = [{
    table: 'dws_a',
    refs: [{ dim_table: 'dim_u', join_keys: [{ dws_column: 'uid', dim_column: 'uid' }], derivation: 'pk-name' }],
  }]
  const value = { ok: true, enriched: 4, written: 6, _before: before, _after: after } as DiscoverRelationsResult
  expect(registerPresentationTool().output.presentationMeta({}, value)).toEqual({
    ok: true,
    enriched: 4,
    written: 6,
    before,
    after,
    added: [{
      table: 'dws_a',
      dim_table: 'dim_u',
      join_keys: [{ dws_column: 'uid', dim_column: 'uid' }],
      derivation: 'pk-name',
    }],
    removed: [],
  })
})

test('S28 presentationMeta reports zero counts when the summary omits them', () => {
  const value = { ok: true, _before: [], _after: [] } as DiscoverRelationsResult
  expect(registerPresentationTool().output.presentationMeta({}, value)).toEqual({
    ok: true,
    enriched: 0,
    written: 0,
    before: [],
    after: [],
    added: [],
    removed: [],
  })
})

test('S29 execute refuses an already-aborted call without touching the substrate', async () => {
  const opts: { tables?: string[] }[] = []
  const def = registerTool(stubSchema({ enriched: 1, written: 1, errors: [] }, opts))
  const controller = new AbortController()
  controller.abort()
  await expect(def.execute({}, { signal: controller.signal }))
    .rejects.toThrow('discover_relations aborted before enriching')
  expect(opts).toEqual([])
})

test('S30 presentCall labels an unfiltered call "all tables"', () => {
  expect(registerPresentationTool().presentCall({}))
    .toEqual({ card: 'generic', title: 'Discover Relations (all tables)', kind: 'search' })
})

test('S31 presentCall labels an empty tables filter "all tables" too', () => {
  expect(registerPresentationTool().presentCall({ tables: [] }))
    .toEqual({ card: 'generic', title: 'Discover Relations (all tables)', kind: 'search' })
})

test('S32 presentCall is singular for a one-table filter', () => {
  expect(registerPresentationTool().presentCall({ tables: ['dws_pay_order_di'] }))
    .toEqual({ card: 'generic', title: 'Discover Relations (1 table)', kind: 'search' })
})

test('S33 presentCall is plural for a multi-table filter', () => {
  expect(registerPresentationTool().presentCall({ tables: ['dws_a', 'dws_b'] }))
    .toEqual({ card: 'generic', title: 'Discover Relations (2 tables)', kind: 'search' })
})

test('S34 presentResult keeps the pending card for a failed call', () => {
  expect(registerPresentationTool().presentResult({}, completed({ isError: true }))).toBeUndefined()
})

test('S35 presentResult reports failure when the result carries no meta', () => {
  expect(registerPresentationTool().presentResult({}, completed({})))
    .toEqual({ card: 'generic', title: 'Relations discovery failed' })
})

test('S36 presentResult reports failure when meta says the run was not ok', () => {
  expect(registerPresentationTool().presentResult({}, completed({ meta: { ok: false } })))
    .toEqual({ card: 'generic', title: 'Relations discovery failed' })
})

test('S37 presentResult is singular for exactly one discovered relation', () => {
  expect(registerPresentationTool().presentResult({}, completed({ meta: { ok: true, enriched: 1, added: [{}] } })))
    .toEqual({ card: 'generic', title: '+1 relation discovered' })
})

test('S38 presentResult is plural for several discovered relations', () => {
  expect(registerPresentationTool().presentResult({}, completed({ meta: { ok: true, enriched: 2, added: [{}, {}] } })))
    .toEqual({ card: 'generic', title: '+2 relations discovered' })
})

test('S39 presentResult falls back to the enriched count when nothing was added', () => {
  expect(registerPresentationTool().presentResult({}, completed({ meta: { ok: true, enriched: 3, added: [] } })))
    .toEqual({ card: 'generic', title: '3 tables enriched (no new relations)' })
})

test('S40 presentResult is singular for a single enriched table', () => {
  expect(registerPresentationTool().presentResult({}, completed({ meta: { ok: true, enriched: 1, added: [] } })))
    .toEqual({ card: 'generic', title: '1 table enriched (no new relations)' })
})

test('S41 presentResult reports zero enriched tables when meta omits both counts', () => {
  expect(registerPresentationTool().presentResult({}, completed({ meta: { ok: true } })))
    .toEqual({ card: 'generic', title: '0 tables enriched (no new relations)' })
})
