/**
 * load_table_definition tool - registration (defineTool + ctx.tools.register)
 * + the schema-grounding load core + projection. Proves the second model-facing
 * tool mirrors the `tool-search-data-sources` registration shape, the projection
 * to a model-facing `TableModel`, the path-traversal name guard (P6b #5 deferred
 * follow-up), the not-mounted honest fallback, and the readable render.
 *
 * Run: `pnpm vitest run packages/data/tool-load-table-definition`
 * (the root `pnpm test` globs all `*.spec.ts` files).
 */
import { test, expect } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { TableDefinitionSchema, type TableDefinition } from '@deepseek-ai/dsh-semantic-layer/src/types.ts'
import type { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer/src/index.ts'
import {
  apply,
  validateDefinitionName,
  loadTableDefinitionResult,
  projectTable,
  formatTableDefinition,
  type LoadTableResult,
} from '../src/index.ts'

/** A validated fixture table definition (parsed through the substrate schema). */
const FIXTURE_TABLE: TableDefinition = TableDefinitionSchema.parse({
  table_name: 'dws_pay_order_di',
  table_comment: '充值订单汇总表',
  description: 'Per-day pay-order aggregates',
  domains: ['payment', 'game'],
  kind: 'dws',
  granularity: 'day',
  freshness: 'T+1',
  primary_key: ['dt', 'game_id'],
  label_columns: ['game_name'],
  columns: [
    { name: 'dt', type: 'string', comment: 'stat date', role: 'dimension' },
    { name: 'game_id', type: 'string', comment: 'game id', role: 'dimension' },
    { name: 'pay_amount', type: 'decimal', comment: '充值金额', role: 'measure' },
  ],
  partitions: [{ name: 'dt', type: 'string' }],
  metrics: {
    total_pay_amount: { expression: 'sum(pay_amount)', description: '总充值金额' },
  },
  dimension_refs: [
    { dim_table: 'dim_charm_info', join_keys: [{ dws_column: 'game_id', dim_column: 'game_id' }], derivation: '' },
  ],
})

/** A stub SemanticLayerService that serves one fixture table by name. */
function stubSchema(known: Record<string, TableDefinition>): { loadTableDefinition: (n: string) => TableDefinition | null } {
  return {
    loadTableDefinition: (n: string) => known[n] ?? null,
  }
}

/** The subset of the registered tool definition the tests exercise. */
interface ToolDef {
  readonly name: string
  readonly description: string
  readonly output: {
    readonly schema: unknown
    readonly render: (args: unknown, value: LoadTableResult) => readonly { readonly type: 'text'; readonly text: string }[]
  }
  readonly execute: (
    args: { readonly table_name: string },
    exec: { readonly signal: AbortSignal },
  ) => Promise<LoadTableResult>
}

/** Capture the tool definition the plugin registers, without a Cordis context. */
function registerTool(schema?: unknown): ToolDef {
  let def: ToolDef | undefined
  const ctx = {
    tools: {
      register: (d: ToolDef) => {
        def = d
      },
    },
    get: () => schema,
  } as unknown as Context
  apply(ctx, {})
  if (def === undefined) {
    throw new Error('apply did not register a tool')
  }
  return def
}

test('S1 validateDefinitionName rejects path-traversal + empty, accepts plain names', () => {
  expect(validateDefinitionName('dws_pay_order_di')).toBe('dws_pay_order_di')
  expect(validateDefinitionName('  dim_charm_info  ')).toBe('dim_charm_info')
  expect(validateDefinitionName('foo.bar')).toBe('foo.bar') // single interior dot allowed
  // rejected: empty, separators, parent-dir, current-dir, NUL
  expect(validateDefinitionName('')).toBeNull()
  expect(validateDefinitionName('   ')).toBeNull()
  expect(validateDefinitionName('../etc/passwd')).toBeNull()
  expect(validateDefinitionName('a/b')).toBeNull()
  expect(validateDefinitionName('a\\b')).toBeNull()
  expect(validateDefinitionName('..')).toBeNull()
  expect(validateDefinitionName('.')).toBeNull()
  expect(validateDefinitionName('foo..bar')).toBeNull()
  expect(validateDefinitionName('bad\x00name')).toBeNull()
})

test('S2 loadTableDefinitionResult - not mounted (schema undefined)', () => {
  const r = loadTableDefinitionResult(undefined, 'dws_pay_order_di')
  expect(r.found).toBe(false)
  expect(r.message).toContain('not mounted')
})

test('S3 loadTableDefinitionResult - table not found (substrate returns null)', () => {
  const r = loadTableDefinitionResult(stubSchema({}) as unknown as SemanticLayerService, 'nope')
  expect(r.found).toBe(false)
  expect(r.message).toBe('table not found: "nope"')
})

test('S4 loadTableDefinitionResult - hit returns the projected table', () => {
  const r = loadTableDefinitionResult(stubSchema({ dws_pay_order_di: FIXTURE_TABLE }) as unknown as SemanticLayerService, 'dws_pay_order_di')
  expect(r.found).toBe(true)
  expect(r.table).toEqual(projectTable(FIXTURE_TABLE))
})

test('S5 loadTableDefinitionResult - invalid name rejected before substrate touch', () => {
  const r = loadTableDefinitionResult(stubSchema({ dws_pay_order_di: FIXTURE_TABLE }) as unknown as SemanticLayerService, '../etc/passwd')
  expect(r.found).toBe(false)
  expect(r.message).toContain('invalid')
})

test('S6 apply registers load_table_definition (name + description + output + execute)', () => {
  const def = registerTool()
  expect(def.name).toBe('load_table_definition')
  expect(def.description).toContain('table definition')
  expect(def.output).toBeDefined()
  expect(typeof def.execute).toBe('function')
})

test('S7 execute returns the projected table via ctx.get(schema) when mounted', async () => {
  const def = registerTool(stubSchema({ dws_pay_order_di: FIXTURE_TABLE }))
  const out = await def.execute({ table_name: 'dws_pay_order_di' }, { signal: new AbortController().signal })
  expect(out.found).toBe(true)
  expect(out.table).toEqual(projectTable(FIXTURE_TABLE))
})

test('S8 execute - not-mounted honest fallback when schema absent', async () => {
  const def = registerTool(undefined)
  const out = await def.execute({ table_name: 'dws_pay_order_di' }, { signal: new AbortController().signal })
  expect(out.found).toBe(false)
  expect(out.message).toContain('not mounted')
})

test('S9 render formats a found table as a readable text block', () => {
  const def = registerTool()
  const out = def.output.render({}, { found: true, table: projectTable(FIXTURE_TABLE) })
  expect(out[0]?.type).toBe('text')
  expect(out[0]?.text).toContain('dws_pay_order_di')
  expect(out[0]?.text).toContain('columns:')
  expect(out[0]?.text).toContain('pay_amount')
  expect(out[0]?.text).toContain('partitions:')
  expect(out[0]?.text).toContain('metrics:')
  expect(out[0]?.text).toContain('total_pay_amount = sum(pay_amount)')
  expect(out[0]?.text).toContain('dimension_refs:')
})

test('S10 render formats a not-found result as the message', () => {
  const def = registerTool()
  const out = def.output.render({}, { found: false, message: 'table not found: nope' })
  expect(out[0]?.text).toBe('table not found: nope')
})

test('S11 formatTableDefinition emits columns + partitions + metrics + dimension_refs', () => {
  const text = formatTableDefinition(projectTable(FIXTURE_TABLE))
  expect(text).toContain('table: dws_pay_order_di')
  expect(text).toContain('domains: payment, game')
  expect(text).toContain('engine: maxcompute')
  expect(text).toContain('primary_key: dt, game_id')
  expect(text).toContain('  - pay_amount decimal (measure) // 充值金额')
  expect(text).toContain('  - dt string')
  expect(text).toContain('  - total_pay_amount = sum(pay_amount) // 总充值金额')
  expect(text).toContain('dim_charm_info')
})

test('S12 projectTable drops workflow-state fields + maps the metrics map to an array', () => {
  const proj = projectTable(FIXTURE_TABLE)
  // workflow-state fields dropped
  expect(proj).not.toHaveProperty('confirmation')
  expect(proj).not.toHaveProperty('coverage')
  expect(proj).not.toHaveProperty('supersedes')
  // metrics map -> array of { name, ... }
  expect(Array.isArray(proj.metrics)).toBe(true)
  expect(proj.metrics?.[0]?.name).toBe('total_pay_amount')
  // columns + partitions preserved
  expect(proj.columns?.length).toBe(3)
  expect(proj.partitions?.length).toBe(1)
})

test('S13 loadTableDefinitionResult - malformed fixture (name matches, schema fails) -> found:false, no throw', () => {
  // MAJOR-2: the substrate loadTableDefinition is strict Schema.parse-on-match
  // (table_name matched but the YAML failed schema validation -> ZodError) and
  // readdirSync/readFileSync can throw I/O errors. The wrapper must catch and
  // return a structured found:false with a sanitized message, never crash.
  const throwing = {
    loadTableDefinition: (n: string) => {
      if (n !== 'malformed_table') return null
      // real ZodError via the substrate schema (name matched, payload invalid)
      return TableDefinitionSchema.parse({ table_name: 'malformed_table', columns: 'not-an-array' })
    },
  } as unknown as Parameters<typeof loadTableDefinitionResult>[0]
  const r = loadTableDefinitionResult(throwing, 'malformed_table')
  expect(r.found).toBe(false)
  expect(r.message).toMatch(/^substrate error:/)
  expect(r.message).not.toContain('\n') // single line — no raw multi-line ZodError dump
})

test('S14 validateDefinitionName rejects names over 200 chars (length cap)', () => {
  expect(validateDefinitionName('a'.repeat(200))).toBe('a'.repeat(200))
  expect(validateDefinitionName('a'.repeat(201))).toBeNull()
})

test('S15 projectTable filters empty-string metric keys', () => {
  const def = TableDefinitionSchema.parse({
    table_name: 't',
    metrics: { '': { expression: 'x' }, real: { expression: 'y' } },
  })
  const proj = projectTable(def)
  expect(proj.metrics?.map(m => m.name)).toEqual(['real'])
})

test('S16 formatTableDefinition renders an empty-type column without trailing space', () => {
  const def = TableDefinitionSchema.parse({
    table_name: 't',
    columns: [{ name: 'c', type: '' }, { name: 'd', type: 'int' }],
  })
  const text = formatTableDefinition(projectTable(def))
  expect(text).toMatch(/  - c\n/)
  expect(text).not.toMatch(/  - c \n/)
  expect(text).toMatch(/  - d int/)
})

test('S17 render - found:false with no message uses the neutral fallback', () => {
  const def = registerTool()
  const out = def.output.render({}, { found: false })
  expect(out[0]?.text).toBe('No table definition to display.')
})

test('S18 loadTableDefinitionResult - I/O error redacts the path + stays single-line', () => {
  // MAJOR-2: an I/O throw (e.g. ENOENT carrying a server path) must be caught
  // and the path redacted — never leak the raw path or a multi-line message.
  const throwing = {
    loadTableDefinition: () => {
      throw new Error("ENOENT: no such file or directory, open '/secret/semantic/tables/x.yaml'")
    },
  } as unknown as Parameters<typeof loadTableDefinitionResult>[0]
  const r = loadTableDefinitionResult(throwing, 'whatever')
  expect(r.found).toBe(false)
  expect(r.message).toMatch(/^substrate error:/)
  expect(r.message).toContain('<path>')
  expect(r.message).not.toContain('/secret')
  expect(r.message).not.toContain('\n')
})


test('S19 loadTableDefinitionResult - >200-char error is capped with ... (single line)', () => {
  // A-N2: the S13 ZodError message is ~152 chars, so the 200-cap + '...' truncation
  // is unexercised. Inject a >200-char error to lock the cap + marker + single-line.
  const throwing = {
    loadTableDefinition: () => { throw new Error('x'.repeat(300)) },
  } as unknown as Parameters<typeof loadTableDefinitionResult>[0]
  const r = loadTableDefinitionResult(throwing, 'whatever')
  expect(r.found).toBe(false)
  expect(r.message).toMatch(/^substrate error:/)
  expect(r.message).toContain('...')
  expect(r.message).toBeDefined()
  expect(r.message!.length).toBeLessThanOrEqual(220)
  expect(r.message).not.toContain('\n')
})
