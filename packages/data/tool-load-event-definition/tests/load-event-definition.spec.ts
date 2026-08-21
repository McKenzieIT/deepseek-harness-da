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
import { test, expect } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { EventDefinitionSchema, type EventDefinition } from '@deepseek-ai/dsh-semantic-layer/src/types.ts'
import {
  apply,
  validateDefinitionName,
  loadEventDefinitionResult,
  projectEvent,
  formatEventDefinition,
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

/** A stub SemanticLayerService that serves one fixture event by name. */
function stubSchema(known: Record<string, EventDefinition>): { loadEventDefinition: (n: string) => EventDefinition | null } {
  return {
    loadEventDefinition: (n: string) => known[n] ?? null,
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
  const r = loadEventDefinitionResult(stubSchema({}), 'nope')
  expect(r.found).toBe(false)
  expect(r.message).toBe('event not found: "nope"')
})

test('S4 loadEventDefinitionResult - hit returns the projected event', () => {
  const r = loadEventDefinitionResult(stubSchema({ pay_event: FIXTURE_EVENT }), 'pay_event')
  expect(r.found).toBe(true)
  expect(r.event).toEqual(projectEvent(FIXTURE_EVENT))
})

test('S5 loadEventDefinitionResult - invalid name rejected before substrate touch', () => {
  const r = loadEventDefinitionResult(stubSchema({ pay_event: FIXTURE_EVENT }), '../etc/passwd')
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
