/**
 * load_event_definition tool - registration (defineTool + ctx.tools.register)
 * + the schema-grounding load core + projection. Proves the third model-facing
 * tool mirrors the `tool-search-data-sources` / `tool-load-table-definition`
 * registration shape, the projection to a model-facing `EventModel`, the
 * path-traversal name guard (P6b #5 deferred follow-up), the not-mounted
 * honest fallback, and the readable render.
 *
 * Run: `pnpm vitest run packages/data/tool-load-event-definition`
 * (the root `pnpm test` globs all `*.spec.ts` files).
 */
import { afterAll, test, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { EventDefinitionSchema, type EventDefinition } from '@deepseek-ai/dsh-semantic-layer/src/types.ts'
import type { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer/src/index.ts'
import {
  apply,
  validateDefinitionName,
  loadEventDefinitionResult,
  projectEvent,
  formatEventDefinition,
  extractEventView,
  formatEventView,
  type EventViewInfo,
  type LoadEventResult,
} from '../src/index.ts'

/** A validated fixture event definition (parsed through the substrate schema). */
const FIXTURE_EVENT: EventDefinition = EventDefinitionSchema.parse({
  name: 'pay_event',
  description: '充值埋点',
  event_filter: 'action = "pay"',
  domains: ['payment'],
  params_fields: {
    game_id: { type: 'string', description: '游戏 id' },
    pay_amount: { type: 'decimal', description: '充值金额' },
  },
  metrics: {
    total_pay_amount: { expression: 'sum(pay_amount)', description: '总充值金额' },
  },
  disambiguation: [
    { event: 'pay_event', trigger: 'click pay button', distinction: 'only successful payments' },
  ],
  external_refs: [
    { dim_table: 'dim_charm_info', join_keys: [{ dws_column: 'game_id', dim_column: 'game_id' }], derivation: '' },
  ],
})

/**
 * A stub SemanticLayerService that serves one fixture event by name.
 * `semanticRoot` defaults to '' (no config.yaml to read — the event_view
 * enrichment is skipped); pass a real dir to exercise the G-DA4 enrichment.
 */
function stubSchema(
  known: Record<string, EventDefinition>,
  semanticRoot = '',
): { loadEventDefinition: (n: string) => EventDefinition | null; semanticRoot: string } {
  return {
    loadEventDefinition: (n: string) => known[n] ?? null,
    semanticRoot,
  }
}

/** The subset of the registered tool definition the tests exercise. */
interface ToolDef {
  readonly name: string
  readonly description: string
  readonly output: {
    readonly schema: unknown
    readonly render: (args: unknown, value: LoadEventResult) => readonly { readonly type: 'text'; readonly text: string }[]
  }
  readonly execute: (
    args: { readonly event_name: string },
    exec: { readonly signal: AbortSignal },
  ) => Promise<LoadEventResult>
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
  expect(validateDefinitionName('pay_event')).toBe('pay_event')
  expect(validateDefinitionName('  login.event  ')).toBe('login.event')
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

test('S2 loadEventDefinitionResult - not mounted (schema undefined)', () => {
  const r = loadEventDefinitionResult(undefined, 'pay_event')
  expect(r.found).toBe(false)
  expect(r.message).toContain('not mounted')
})

test('S3 loadEventDefinitionResult - event not found (substrate returns null)', () => {
  const r = loadEventDefinitionResult(stubSchema({}) as unknown as SemanticLayerService, 'nope')
  expect(r.found).toBe(false)
  expect(r.message).toBe('event not found: "nope"')
})

test('S4 loadEventDefinitionResult - hit returns the projected event', () => {
  const r = loadEventDefinitionResult(stubSchema({ pay_event: FIXTURE_EVENT }) as unknown as SemanticLayerService, 'pay_event')
  expect(r.found).toBe(true)
  expect(r.event).toEqual(projectEvent(FIXTURE_EVENT))
})

test('S5 loadEventDefinitionResult - invalid name rejected before substrate touch', () => {
  const r = loadEventDefinitionResult(stubSchema({ pay_event: FIXTURE_EVENT }) as unknown as SemanticLayerService, '../etc/passwd')
  expect(r.found).toBe(false)
  expect(r.message).toContain('invalid')
})

test('S6 apply registers load_event_definition (name + description + output + execute)', () => {
  const def = registerTool()
  expect(def.name).toBe('load_event_definition')
  expect(def.description).toContain('event')
  expect(def.output).toBeDefined()
  expect(typeof def.execute).toBe('function')
})

test('S7 execute returns the projected event via ctx.get(schema) when mounted', async () => {
  const def = registerTool(stubSchema({ pay_event: FIXTURE_EVENT }))
  const out = await def.execute({ event_name: 'pay_event' }, { signal: new AbortController().signal })
  expect(out.found).toBe(true)
  expect(out.event).toEqual(projectEvent(FIXTURE_EVENT))
})

test('S8 execute - not-mounted honest fallback when schema absent', async () => {
  const def = registerTool(undefined)
  const out = await def.execute({ event_name: 'pay_event' }, { signal: new AbortController().signal })
  expect(out.found).toBe(false)
  expect(out.message).toContain('not mounted')
})

test('S9 render formats a found event as a readable text block', () => {
  const def = registerTool()
  const out = def.output.render({}, { found: true, event: projectEvent(FIXTURE_EVENT) })
  expect(out[0]?.type).toBe('text')
  expect(out[0]?.text).toContain('event: pay_event')
  expect(out[0]?.text).toContain('params_fields:')
  expect(out[0]?.text).toContain('pay_amount')
  expect(out[0]?.text).toContain('metrics:')
  expect(out[0]?.text).toContain('total_pay_amount = sum(pay_amount)')
  expect(out[0]?.text).toContain('disambiguation:')
  expect(out[0]?.text).toContain('external_refs:')
})

test('S10 render formats a not-found result as the message', () => {
  const def = registerTool()
  const out = def.output.render({}, { found: false, message: 'event not found: nope' })
  expect(out[0]?.text).toBe('event not found: nope')
})

test('S11 formatEventDefinition emits params_fields + metrics + disambiguation + external_refs', () => {
  const text = formatEventDefinition(projectEvent(FIXTURE_EVENT))
  expect(text).toContain('event: pay_event')
  expect(text).toContain('event_filter: action = "pay"')
  expect(text).toContain('  - game_id string // 游戏 id')
  expect(text).toContain('  - pay_amount decimal // 充值金额')
  expect(text).toContain('  - total_pay_amount = sum(pay_amount) // 总充值金额')
  expect(text).toContain('  - pay_event (click pay button): only successful payments')
  expect(text).toContain('dim_charm_info')
})

test('S12 projectEvent drops workflow-state fields + maps params_fields/metrics to arrays', () => {
  const proj = projectEvent(FIXTURE_EVENT)
  // workflow-state fields dropped
  expect(proj).not.toHaveProperty('confirmation')
  expect(proj).not.toHaveProperty('coverage')
  // params_fields + metrics maps -> arrays of { name, ... }
  expect(Array.isArray(proj.params_fields)).toBe(true)
  expect(proj.params_fields?.[0]?.name).toBe('game_id')
  expect(Array.isArray(proj.metrics)).toBe(true)
  expect(proj.metrics?.[0]?.name).toBe('total_pay_amount')
  // disambiguation + external_refs preserved as arrays
  expect(proj.disambiguation?.length).toBe(1)
  expect(proj.external_refs?.length).toBe(1)
})

test('S13 loadEventDefinitionResult - malformed fixture (name matches, schema fails) -> found:false, no throw', () => {
  // MAJOR-2: the substrate loadEventDefinition is strict Schema.parse-on-match
  // (name matched but the YAML failed schema validation -> ZodError) and its
  // readdirSync/readFileSync can throw I/O errors. The wrapper must catch and
  // return a structured found:false with a sanitized message, never crash.
  const throwing = {
    loadEventDefinition: (n: string) => {
      if (n !== 'malformed_event') return null
      // real ZodError via the substrate schema (name matched, payload invalid)
      return EventDefinitionSchema.parse({ name: 'malformed_event', params_fields: 'not-an-object' })
    },
  } as unknown as Parameters<typeof loadEventDefinitionResult>[0]
  const r = loadEventDefinitionResult(throwing, 'malformed_event')
  expect(r.found).toBe(false)
  expect(r.message).toMatch(/^substrate error:/)
  expect(r.message).not.toContain('\n')
})

test('S14 validateDefinitionName rejects names over 200 chars (length cap)', () => {
  expect(validateDefinitionName('a'.repeat(200))).toBe('a'.repeat(200))
  expect(validateDefinitionName('a'.repeat(201))).toBeNull()
})

test('S15 projectEvent filters empty-string params_fields keys', () => {
  const def = EventDefinitionSchema.parse({
    name: 'e',
    params_fields: { '': { type: 'string' }, real: { type: 'int' } },
  })
  const proj = projectEvent(def)
  expect(proj.params_fields?.map(f => f.name)).toEqual(['real'])
})

test('S16 formatEventDefinition renders an empty-type param field without trailing space', () => {
  const def = EventDefinitionSchema.parse({
    name: 'e',
    params_fields: { c: { type: '' }, d: { type: 'int' } },
  })
  const text = formatEventDefinition(projectEvent(def))
  expect(text).toMatch(/  - c\n/)
  expect(text).not.toMatch(/  - c \n/)
  expect(text).toMatch(/  - d int/)
})

test('S17 render - found:false with no message uses the neutral fallback', () => {
  const def = registerTool()
  const out = def.output.render({}, { found: false })
  expect(out[0]?.text).toBe('No event definition to display.')
})

test('S18 projectEvent filters empty-string metric keys', () => {
  const def = EventDefinitionSchema.parse({
    name: 'e',
    metrics: { '': { expression: 'x' }, real: { expression: 'y' } },
  })
  const proj = projectEvent(def)
  expect(proj.metrics?.map(m => m.name)).toEqual(['real'])
})


test('S19 loadEventDefinitionResult - >200-char error is capped with ... (single line)', () => {
  // A-N2: lock the 200-cap + '...' truncation (the S13 ZodError is ~152 chars).
  const throwing = {
    loadEventDefinition: () => { throw new Error('x'.repeat(300)) },
  } as unknown as Parameters<typeof loadEventDefinitionResult>[0]
  const r = loadEventDefinitionResult(throwing, 'whatever')
  expect(r.found).toBe(false)
  expect(r.message).toMatch(/^substrate error:/)
  expect(r.message).toContain('...')
  expect(r.message).toBeDefined()
  expect(r.message!.length).toBeLessThanOrEqual(220)
  expect(r.message).not.toContain('\n')
})

// ── G-DA4 event_view surface + the remaining projection/format branches ────
// extractEventView reads the layer's config.yaml off disk (loadConfig ->
// readFileSync), so these fixtures materialize a real temp semantic root
// (same pattern as semantic-layer/tests/per-scope-read.spec.ts). YAML is
// written as text rather than dumped with js-yaml: the package declares no
// js-yaml dependency, and the raw text is also what the substrate really parses.

const tmpRoots: string[] = []
afterAll(() => {
  for (const root of tmpRoots) rmSync(root, { recursive: true, force: true })
})

/**
 * Materialize a temp semantic-layer root holding `configText` as its config.yaml.
 * @param configText - the raw config.yaml body; omit it for a root with NO config.yaml.
 * @returns the temp root path (removed in afterAll).
 */
function semanticRootWith(configText?: string): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-load-event-def-'))
  tmpRoots.push(root)
  if (configText !== undefined) writeFileSync(join(root, 'config.yaml'), configText, 'utf-8')
  return root
}

/**
 * A config.yaml carrying the k11 example's `event_view` shape (categorized
 * `base_columns` groups), plus entries the flattener must skip: a group that is
 * not a list, a column without a `name`, a column whose `name` is not a string,
 * and a bare scalar list entry.
 */
const CONFIG_WITH_EVENT_VIEW = `project:
  name: game_10000251
event_view:
  workspace: ieu_ods
  view_name: ods_10000251_all_view
  full_name: ieu_ods.ods_10000251_all_view
  params_extract_template: "GET_JSON_OBJECT(params, '$.{field_name}')"
  base_columns:
    identity:
      - name: role_id
        type: string
        description: 角色ID
      - name: server_id
        type: string
    event_meta:
      - name: event
        type: string
      - type: string
      - name: 42
      - bare_scalar_entry
    note: not-a-column-list
`

/** The projection `CONFIG_WITH_EVENT_VIEW` must yield (junk entries dropped). */
const EXPECTED_EVENT_VIEW: EventViewInfo = {
  full_name: 'ieu_ods.ods_10000251_all_view',
  params_extract_template: "GET_JSON_OBJECT(params, '$.{field_name}')",
  base_columns: ['role_id', 'server_id', 'event'],
}

/** A config.yaml head with a usable event_view but no base_columns section. */
const EVENT_VIEW_HEAD = `event_view:
  full_name: ieu_ods.ods_all_view
  params_extract_template: "GET_JSON_OBJECT(params, '$.{f}')"
`
/** The projection `EVENT_VIEW_HEAD` must yield (no base columns known). */
const EXPECTED_HEAD_VIEW: EventViewInfo = {
  full_name: 'ieu_ods.ods_all_view',
  params_extract_template: "GET_JSON_OBJECT(params, '$.{f}')",
  base_columns: [],
}

test('S20 formatEventView renders from_table + params_extract + base_columns', () => {
  expect(formatEventView(EXPECTED_EVENT_VIEW)).toBe([
    'event_view:',
    '  from_table: ieu_ods.ods_10000251_all_view',
    "  params_extract: GET_JSON_OBJECT(params, '$.{field_name}')",
    '  base_columns: role_id, server_id, event',
  ].join('\n'))
})

test('S21 formatEventView omits the base_columns line when no base columns are known', () => {
  expect(formatEventView(EXPECTED_HEAD_VIEW)).toBe([
    'event_view:',
    '  from_table: ieu_ods.ods_all_view',
    "  params_extract: GET_JSON_OBJECT(params, '$.{f}')",
  ].join('\n'))
})

test('S22 formatEventDefinition appends the event_view block and emits nothing for absent event fields', () => {
  // An empty projection (no name, no params_fields/metrics/disambiguation/refs)
  // renders as the event_view block alone — no `event:` line, no empty sections.
  expect(formatEventDefinition({}, EXPECTED_EVENT_VIEW)).toBe([
    'event_view:',
    '  from_table: ieu_ods.ods_10000251_all_view',
    "  params_extract: GET_JSON_OBJECT(params, '$.{field_name}')",
    '  base_columns: role_id, server_id, event',
  ].join('\n'))
})

test('S23 formatEventDefinition renders a metric with no expression/description as a bare name', () => {
  const def = EventDefinitionSchema.parse({ name: 'e', metrics: { bare_metric: {} } })
  expect(formatEventDefinition(projectEvent(def))).toBe([
    'event: e',
    'metrics:',
    '  - bare_metric',
  ].join('\n'))
})

test('S24 formatEventDefinition renders a disambiguation rule with no trigger/distinction as a bare event', () => {
  const def = EventDefinitionSchema.parse({ name: 'e', disambiguation: [{ event: 'role_online' }] })
  expect(formatEventDefinition(projectEvent(def))).toBe([
    'event: e',
    'disambiguation:',
    '  - role_online',
  ].join('\n'))
})

test('S25 formatEventDefinition renders an external_ref derivation after the join keys', () => {
  const def = EventDefinitionSchema.parse({
    name: 'e',
    external_refs: [{
      dim_table: 'dim_server',
      join_keys: [{ dws_column: 'server_id', dim_column: 'id' }, { dws_column: 'zone', dim_column: 'zone_id' }],
      derivation: 'server_id joins dim_server.id',
    }],
  })
  expect(formatEventDefinition(projectEvent(def))).toBe([
    'event: e',
    'external_refs:',
    '  - dim_server [server_id=id, zone=zone_id] // server_id joins dim_server.id',
  ].join('\n'))
})

test('S26 projectEvent drops empty metric expressions + empty disambiguation parts, keeps a derivation', () => {
  const def = EventDefinitionSchema.parse({
    name: 'e',
    metrics: { bare_metric: { expression: '', description: '总量' } },
    disambiguation: [{ event: 'role_online', trigger: '', distinction: '' }],
    external_refs: [{
      dim_table: 'dim_server',
      join_keys: [{ dws_column: 'server_id', dim_column: 'id' }],
      derivation: 'server_id joins dim_server.id',
    }],
  })
  const proj = projectEvent(def)
  // empty-string expression/trigger/distinction are omitted keys, not '' values
  expect(proj.metrics).toStrictEqual([{ name: 'bare_metric', description: '总量' }])
  expect(proj.disambiguation).toStrictEqual([{ event: 'role_online' }])
  expect(proj.external_refs).toStrictEqual([{
    dim_table: 'dim_server',
    join_keys: [{ dws_column: 'server_id', dim_column: 'id' }],
    derivation: 'server_id joins dim_server.id',
  }])
})

test('S27 loadEventDefinitionResult sanitizes a non-Error throw through String(e)', () => {
  const throwing = {
    loadEventDefinition: () => { throw 'event loader exploded (not an Error instance)' },
  } as unknown as Parameters<typeof loadEventDefinitionResult>[0]
  const r = loadEventDefinitionResult(throwing, 'pay_event')
  expect(r.found).toBe(false)
  expect(r.message).toBe('substrate error: event loader exploded (not an Error instance)')
})

test('S28 extractEventView projects full_name + params template + flattened base columns', () => {
  expect(extractEventView(semanticRootWith(CONFIG_WITH_EVENT_VIEW))).toStrictEqual(EXPECTED_EVENT_VIEW)
})

test('S29 extractEventView returns undefined when config.yaml has no usable event_view section', () => {
  expect(extractEventView(semanticRootWith('project:\n  name: game_10000251\n'))).toBeUndefined() // key absent
  expect(extractEventView(semanticRootWith('event_view:\n'))).toBeUndefined() // present but null
  expect(extractEventView(semanticRootWith('event_view: ods_10000251_all_view\n'))).toBeUndefined() // scalar, not a map
})

test('S30 extractEventView returns undefined when full_name or params_extract_template is missing or not a string', () => {
  expect(extractEventView(semanticRootWith(
    'event_view:\n  params_extract_template: "GET_JSON_OBJECT(params, \'$.{f}\')"\n',
  ))).toBeUndefined() // no full_name
  expect(extractEventView(semanticRootWith(
    'event_view:\n  full_name: 123\n  params_extract_template: "GET_JSON_OBJECT(params, \'$.{f}\')"\n',
  ))).toBeUndefined() // full_name not a string
  expect(extractEventView(semanticRootWith('event_view:\n  full_name: ieu_ods.ods_all_view\n'))).toBeUndefined() // no template
  expect(extractEventView(semanticRootWith(
    'event_view:\n  full_name: ieu_ods.ods_all_view\n  params_extract_template:\n    nested: true\n',
  ))).toBeUndefined() // template not a string
})

test('S31 extractEventView yields empty base_columns when the section is absent or not a map', () => {
  expect(extractEventView(semanticRootWith(EVENT_VIEW_HEAD))).toStrictEqual(EXPECTED_HEAD_VIEW) // absent
  expect(extractEventView(semanticRootWith(`${EVENT_VIEW_HEAD}  base_columns:\n`))).toStrictEqual(EXPECTED_HEAD_VIEW) // null
  expect(extractEventView(semanticRootWith(`${EVENT_VIEW_HEAD}  base_columns: role_id,server_id\n`)))
    .toStrictEqual(EXPECTED_HEAD_VIEW) // scalar, not a map
})

test('S32 extractEventView swallows a missing or malformed config.yaml', () => {
  expect(extractEventView(semanticRootWith())).toBeUndefined() // no config.yaml -> ENOENT from readFileSync
  expect(extractEventView(semanticRootWith('event_view: [unclosed\n'))).toBeUndefined() // YAML parse error
})

test('S33 loadEventDefinitionResult attaches the event_view read from the semantic root', () => {
  const r = loadEventDefinitionResult(
    stubSchema({ pay_event: FIXTURE_EVENT }, semanticRootWith(CONFIG_WITH_EVENT_VIEW)) as unknown as SemanticLayerService,
    'pay_event',
  )
  expect(r.found).toBe(true)
  expect(r.event).toEqual(projectEvent(FIXTURE_EVENT))
  expect(r.event_view).toStrictEqual(EXPECTED_EVENT_VIEW)
})

test('S34 execute rejects when the abort signal is already aborted (no substrate touch)', async () => {
  const controller = new AbortController()
  controller.abort()
  const def = registerTool(stubSchema({ pay_event: FIXTURE_EVENT }))
  await expect(def.execute({ event_name: 'pay_event' }, { signal: controller.signal }))
    .rejects.toThrow(/^load_event_definition aborted before loading$/)
})
