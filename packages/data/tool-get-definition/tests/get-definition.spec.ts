/**
 * get_definition tool — the whole contract surface of the package:
 *   - `validateAssetName`  the path-traversal / length guard (called directly,
 *     never re-implemented in the test),
 *   - `getDefinitionResult`  the not-mounted fallback, the invalid-name refusal,
 *     and the table → event → metric → concept probe order,
 *   - `formatGetDefinition`  the model-facing text projection,
 *   - `output.render` / `output.presentationMeta`  the registered projections
 *     (the latter is the only door to the private `projectDefinitionMeta`),
 *   - `execute`  ok / aborted / semantic-layer-unmounted,
 *   - `presentCall` / `presentResult`  the pending + completed card contracts.
 *
 * The last block grounds the injected stubs against the REAL
 * `SemanticLayerService` over a private `mkdtemp` semantic root, so a stub whose
 * method names or null-contract drifted from the substrate cannot pass silently.
 *
 * Run: `pnpm vitest run packages/data/tool-get-definition/tests`
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools'
import { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer/src/index.ts'
import {
  apply,
  formatGetDefinition,
  getDefinitionResult,
  validateAssetName,
  type GetDefinitionResult,
} from '../src/index.ts'

/** The single declared parameter of `get_definition`. */
interface GetDefinitionArgs {
  readonly name: string
}

/** The subset of the registered tool definition these tests exercise. */
interface ToolDef {
  readonly name: string
  readonly description: string
  readonly output: {
    readonly schema: unknown
    readonly render: (
      args: GetDefinitionArgs,
      value: GetDefinitionResult,
    ) => readonly { readonly type: string; readonly text: string }[]
    readonly presentationMeta: (args: GetDefinitionArgs, value: GetDefinitionResult) => unknown
  }
  readonly execute: (
    args: GetDefinitionArgs,
    exec: { readonly signal: AbortSignal },
  ) => Promise<GetDefinitionResult>
  readonly presentCall: (args: GetDefinitionArgs) => GenericCallView | undefined
  readonly presentResult: (args: GetDefinitionArgs, result: ToolResult) => GenericResultView | undefined
}

/**
 * Capture the tool definition `apply` registers, without booting a Cordis
 * container. `services` is the `ctx.get(key)` lookup table; a key that is absent
 * yields `undefined`, which models "that service is not mounted".
 */
function registerTool(services: Record<string, unknown> = {}): ToolDef {
  let def: ToolDef | undefined
  const ctx = {
    tools: { register: (d: ToolDef) => { def = d } },
    get: (key: string) => services[key],
  } as unknown as Context
  apply(ctx, {})
  if (def === undefined) throw new Error('apply did not register a tool')
  return def
}

/** Definitions a {@link stubSchema} serves, keyed by asset kind then name. */
interface KnownAssets {
  readonly tables?: Record<string, Record<string, unknown>>
  readonly events?: Record<string, Record<string, unknown>>
  readonly metrics?: Record<string, Record<string, unknown>>
  readonly concepts?: Record<string, Record<string, unknown>>
}

/**
 * A `ctx.schema` stand-in that serves the four substrate loaders from an
 * in-memory table and records every probe, so the probe ORDER and the
 * "validation happens before the substrate is touched" contract are observable.
 * Grounded against the real service by the last describe block.
 */
function stubSchema(known: KnownAssets = {}): { schema: SemanticLayerService; probes: string[] } {
  const probes: string[] = []
  const schema = {
    loadTableDefinition: (n: string) => { probes.push(`table:${n}`); return known.tables?.[n] ?? null },
    loadEventDefinition: (n: string) => { probes.push(`event:${n}`); return known.events?.[n] ?? null },
    loadMetricDefinition: (n: string) => { probes.push(`metric:${n}`); return known.metrics?.[n] ?? null },
    loadConceptDefinition: (n: string) => { probes.push(`concept:${n}`); return known.concepts?.[n] ?? null },
  } as unknown as SemanticLayerService
  return { schema, probes }
}

const TABLE_DEF = { table_name: 'dws_pay_order_di', kind: 'dws' }
const EVENT_DEF = { name: 'recharge', description: '充值事件' }
const METRIC_DEF = { name: 'dws_pay_order_di__total_pay_amount', kind: 'metric' }
const CONCEPT_DEF = { name: 'payment', description: '支付域' }

/** The exact pretty-printed text `formatGetDefinition` emits for TABLE_DEF. */
const TABLE_DEF_TEXT = '[table] {\n  "table_name": "dws_pay_order_di",\n  "kind": "dws"\n}'

/** A complete `ToolResult` for the presenter, with the `meta` under test. */
function toolResult(isError: boolean, meta?: ToolResult['meta']): ToolResult {
  return { content: [], isError, ...(meta !== undefined ? { meta } : {}) }
}

describe('validateAssetName', () => {
  it('returns the trimmed name for a plain asset name', () => {
    expect(validateAssetName('dws_pay_order_di')).toBe('dws_pay_order_di')
    expect(validateAssetName('  dim_charm_info \t')).toBe('dim_charm_info')
    // a single interior dot is a legal asset name (only `..` and a bare `.` are refused)
    expect(validateAssetName('foo.bar')).toBe('foo.bar')
  })

  it('refuses an empty or whitespace-only name', () => {
    expect(validateAssetName('')).toBeNull()
    expect(validateAssetName('   ')).toBeNull()
    expect(validateAssetName('\t\n ')).toBeNull()
  })

  it('refuses a name carrying a path separator or a NUL byte', () => {
    expect(validateAssetName('a/b')).toBeNull()
    expect(validateAssetName('a\\b')).toBeNull()
    expect(validateAssetName('bad\x00name')).toBeNull()
  })

  it('refuses parent-directory traversal and the bare current directory', () => {
    expect(validateAssetName('../etc/passwd')).toBeNull()
    expect(validateAssetName('..')).toBeNull()
    expect(validateAssetName('foo..bar')).toBeNull()
    // '.' trips neither the separator class nor `..`; the explicit equality arm catches it
    expect(validateAssetName('.')).toBeNull()
  })

  it('accepts exactly 200 characters and refuses 201', () => {
    expect(validateAssetName('a'.repeat(200))).toBe('a'.repeat(200))
    expect(validateAssetName('a'.repeat(201))).toBeNull()
  })
})

describe('getDefinitionResult', () => {
  it('reports the semantic layer as unmounted when ctx.schema is absent', () => {
    expect(getDefinitionResult(undefined, 'dws_pay_order_di')).toEqual({
      found: false,
      message: 'semantic-layer not mounted (ctx.schema unavailable)',
    })
  })

  it('refuses an invalid asset name before touching the substrate', () => {
    const { schema, probes } = stubSchema({ tables: { dws_pay_order_di: TABLE_DEF } })
    expect(getDefinitionResult(schema, '../etc/passwd')).toEqual({
      found: false,
      message: 'invalid asset name: "../etc/passwd"',
    })
    expect(probes).toEqual([])
  })

  it('returns the table definition on the first probe', () => {
    const { schema, probes } = stubSchema({ tables: { dws_pay_order_di: TABLE_DEF } })
    const r = getDefinitionResult(schema, '  dws_pay_order_di  ')
    expect(r).toEqual({ found: true, kind: 'table', definition: TABLE_DEF })
    // the trimmed name is what reaches the substrate
    expect(probes).toEqual(['table:dws_pay_order_di'])
  })

  it('falls through to the event definition when no table matches', () => {
    const { schema, probes } = stubSchema({ events: { recharge: EVENT_DEF } })
    expect(getDefinitionResult(schema, 'recharge')).toEqual({
      found: true,
      kind: 'event',
      definition: EVENT_DEF,
    })
    expect(probes).toEqual(['table:recharge', 'event:recharge'])
  })

  it('falls through to the metric definition when no table or event matches', () => {
    const name = 'dws_pay_order_di__total_pay_amount'
    const { schema, probes } = stubSchema({ metrics: { [name]: METRIC_DEF } })
    expect(getDefinitionResult(schema, name)).toEqual({
      found: true,
      kind: 'metric',
      definition: METRIC_DEF,
    })
    expect(probes).toEqual([`table:${name}`, `event:${name}`, `metric:${name}`])
  })

  it('falls through to the concept definition as the last probe', () => {
    const { schema, probes } = stubSchema({ concepts: { payment: CONCEPT_DEF } })
    expect(getDefinitionResult(schema, 'payment')).toEqual({
      found: true,
      kind: 'concept',
      definition: CONCEPT_DEF,
    })
    expect(probes).toEqual(['table:payment', 'event:payment', 'metric:payment', 'concept:payment'])
  })

  it('reports all four kinds as missing when every probe returns null', () => {
    const { schema, probes } = stubSchema()
    expect(getDefinitionResult(schema, 'ghost_asset')).toEqual({
      found: false,
      message: 'no table, event, metric, or concept named "ghost_asset" found',
    })
    expect(probes).toEqual([
      'table:ghost_asset',
      'event:ghost_asset',
      'metric:ghost_asset',
      'concept:ghost_asset',
    ])
  })
})

describe('formatGetDefinition', () => {
  it('renders a hit as the kind tag plus the two-space pretty-printed definition', () => {
    expect(formatGetDefinition({ found: true, kind: 'table', definition: TABLE_DEF }))
      .toBe(TABLE_DEF_TEXT)
  })

  it('renders a miss as the carried message verbatim', () => {
    expect(formatGetDefinition({ found: false, message: 'no table, event, metric, or concept named "x" found' }))
      .toBe('no table, event, metric, or concept named "x" found')
  })

  it('renders a miss with no message as the neutral fallback', () => {
    expect(formatGetDefinition({ found: false })).toBe('not found')
  })
})

describe('apply / tool registration', () => {
  it('registers get_definition with its model-facing name and description', () => {
    const def = registerTool()
    expect(def.name).toBe('get_definition')
    expect(def.description).toContain('table, event, metric, or concept')
    expect(def.description).toContain('search_schema')
    expect(def.output.schema).toBeDefined()
    expect(typeof def.execute).toBe('function')
  })
})

describe('output.render', () => {
  it('projects a hit to a single text block carrying the formatted definition', () => {
    const def = registerTool()
    expect(def.output.render(
      { name: 'dws_pay_order_di' },
      { found: true, kind: 'table', definition: TABLE_DEF },
    )).toEqual([{ type: 'text', text: TABLE_DEF_TEXT }])
  })

  it('projects a miss to a single text block carrying the message', () => {
    const def = registerTool()
    expect(def.output.render(
      { name: 'ghost_asset' },
      { found: false, message: 'no table, event, metric, or concept named "ghost_asset" found' },
    )).toEqual([{ type: 'text', text: 'no table, event, metric, or concept named "ghost_asset" found' }])
  })
})

describe('output.presentationMeta', () => {
  it('projects a miss to found:false plus the message', () => {
    const def = registerTool()
    const meta = def.output.presentationMeta(
      { name: 'ghost_asset' },
      { found: false, message: 'no table, event, metric, or concept named "ghost_asset" found' },
    )
    expect(meta).toEqual({
      found: false,
      message: 'no table, event, metric, or concept named "ghost_asset" found',
    })
  })

  it('omits the message key entirely for a miss that carries none', () => {
    const def = registerTool()
    const meta = def.output.presentationMeta({ name: 'ghost_asset' }, { found: false })
    expect(meta).toEqual({ found: false })
    expect(Object.keys(meta as Record<string, unknown>)).toEqual(['found'])
  })

  it('projects a hit to found:true plus kind and definition', () => {
    const def = registerTool()
    const meta = def.output.presentationMeta(
      { name: 'dws_pay_order_di' },
      { found: true, kind: 'table', definition: TABLE_DEF },
    )
    expect(meta).toEqual({ found: true, kind: 'table', definition: TABLE_DEF })
    expect(Object.keys(meta as Record<string, unknown>)).toEqual(['found', 'kind', 'definition'])
  })

  it('omits the kind and definition keys for a hit that carries neither', () => {
    const def = registerTool()
    const meta = def.output.presentationMeta({ name: 'dws_pay_order_di' }, { found: true })
    expect(meta).toEqual({ found: true })
    expect(Object.keys(meta as Record<string, unknown>)).toEqual(['found'])
  })
})

describe('execute', () => {
  it('resolves the definition read through ctx.get("schema")', async () => {
    const { schema, probes } = stubSchema({ tables: { dws_pay_order_di: TABLE_DEF } })
    const def = registerTool({ schema })
    const out = await def.execute(
      { name: 'dws_pay_order_di' },
      { signal: new AbortController().signal },
    )
    expect(out).toEqual({ found: true, kind: 'table', definition: TABLE_DEF })
    expect(probes).toEqual(['table:dws_pay_order_di'])
  })

  it('rejects with "get_definition aborted" before touching the semantic layer when the signal is already aborted', async () => {
    const { schema, probes } = stubSchema({ tables: { dws_pay_order_di: TABLE_DEF } })
    const def = registerTool({ schema })
    const controller = new AbortController()
    controller.abort()
    const err: unknown = await def
      .execute({ name: 'dws_pay_order_di' }, { signal: controller.signal })
      .then(() => undefined, (e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe('get_definition aborted')
    expect(probes).toEqual([])
  })

  it('resolves the unmounted fallback when no schema service is registered', async () => {
    const def = registerTool()
    const out = await def.execute(
      { name: 'dws_pay_order_di' },
      { signal: new AbortController().signal },
    )
    expect(out).toEqual({
      found: false,
      message: 'semantic-layer not mounted (ctx.schema unavailable)',
    })
  })
})

describe('presentCall', () => {
  it('presents a pending read card titled with the requested asset name', () => {
    const def = registerTool()
    expect(def.presentCall({ name: 'dws_pay_order_di' })).toEqual({
      card: 'generic',
      title: 'Definition: dws_pay_order_di',
      kind: 'read',
    })
  })
})

describe('presentResult', () => {
  it('presents nothing for a failed call so the error card stands', () => {
    const def = registerTool()
    expect(def.presentResult({ name: 'dws_pay_order_di' }, toolResult(true))).toBeUndefined()
  })

  it('presents a not-found card when the result carries no meta', () => {
    const def = registerTool()
    expect(def.presentResult({ name: 'ghost_asset' }, toolResult(false))).toEqual({
      card: 'generic',
      title: 'Not found: ghost_asset',
    })
  })

  it('presents a not-found card when meta reports found:false', () => {
    const def = registerTool()
    expect(def.presentResult({ name: 'ghost_asset' }, toolResult(false, { found: false }))).toEqual({
      card: 'generic',
      title: 'Not found: ghost_asset',
    })
  })

  it('titles a hit with the kind and the name meta carries', () => {
    const def = registerTool()
    expect(def.presentResult(
      { name: 'requested_name' },
      toolResult(false, { found: true, kind: 'table', name: 'meta_name' }),
    )).toEqual({ card: 'generic', title: 'table: meta_name' })
  })

  it('falls back to "asset" and the requested name when meta carries neither', () => {
    const def = registerTool()
    expect(def.presentResult(
      { name: 'requested_name' },
      toolResult(false, { found: true }),
    )).toEqual({ card: 'generic', title: 'asset: requested_name' })
  })
})

describe('getDefinitionResult against the real SemanticLayerService', () => {
  let root: string

  beforeEach(() => {
    // Private temp root (never a predictable shared path); removed in afterEach.
    root = mkdtempSync(join(tmpdir(), 'dsh-get-definition-'))
    writeFileSync(join(root, 'config.yaml'), 'project:\n  name: t\n  scope_id: t\n')
    mkdirSync(join(root, 'tables'), { recursive: true })
    writeFileSync(join(root, 'tables', 'dws_pay_order_di.yaml'), [
      'table_name: dws_pay_order_di',
      'table_comment: 充值订单汇总表',
      'kind: dws',
      'columns:',
      '  - name: pay_amount',
      '    type: decimal',
      '    comment: 充值金额',
      '    role: measure',
      'metrics:',
      '  total_pay_amount:',
      '    expression: sum(pay_amount)',
      '    description: 总充值金额',
      '',
    ].join('\n'))
    // loadEvents scans events/<domain>/<file>.yaml
    mkdirSync(join(root, 'events', 'payment'), { recursive: true })
    writeFileSync(join(root, 'events', 'payment', 'recharge.yaml'), 'name: recharge\ndescription: 充值事件\n')
    mkdirSync(join(root, 'concepts'), { recursive: true })
    writeFileSync(join(root, 'concepts', 'payment.yaml'), 'name: payment\ndescription: 支付域\n')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  /**
   * A real service over the fixture root — proves the four loader names and
   * their null contract the stubs above emulate are the substrate's real shape.
   */
  function realSchema(): SemanticLayerService {
    return new SemanticLayerService(new Context(), { semanticRoot: root })
  }

  it('resolves a YAML table from the real substrate as kind "table"', () => {
    const r = getDefinitionResult(realSchema(), 'dws_pay_order_di')
    expect(r.found).toBe(true)
    expect(r.kind).toBe('table')
    expect(r.definition?.table_name).toBe('dws_pay_order_di')
  })

  it('resolves a YAML event from the real substrate as kind "event"', () => {
    const r = getDefinitionResult(realSchema(), 'recharge')
    expect(r.found).toBe(true)
    expect(r.kind).toBe('event')
    expect(r.definition?.name).toBe('recharge')
  })

  it('resolves a host-embedded metric from the real substrate as kind "metric"', () => {
    const r = getDefinitionResult(realSchema(), 'dws_pay_order_di__total_pay_amount')
    expect(r.found).toBe(true)
    expect(r.kind).toBe('metric')
    expect(r.definition?.name).toBe('dws_pay_order_di__total_pay_amount')
  })

  it('resolves a YAML concept from the real substrate as kind "concept"', () => {
    const r = getDefinitionResult(realSchema(), 'payment')
    expect(r.found).toBe(true)
    expect(r.kind).toBe('concept')
    expect(r.definition?.name).toBe('payment')
  })

  it('reports an absent name as missing across all four real loaders', () => {
    expect(getDefinitionResult(realSchema(), 'ghost_asset')).toEqual({
      found: false,
      message: 'no table, event, metric, or concept named "ghost_asset" found',
    })
  })
})
