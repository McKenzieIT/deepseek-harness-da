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
import type { Context } from '@deepseek-ai/cordis'
import {
  apply,
  validateTableName,
  discoverRelationsResult,
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

test('S12 render reports added + removed relations when before/after differ', () => {
  const def = registerTool()
  const before = [{ table: 'dws_a', refs: [{ dim_table: 'dim_old', join_keys: [{ dws_column: 'x', dim_column: 'x' }], derivation: 'old' }] }]
  const after = [{ table: 'dws_a', refs: [{ dim_table: 'dim_new', join_keys: [{ dws_column: 'y', dim_column: 'y' }], derivation: 'new' }] }]
  const out = def.output.render({}, { ok: true, enriched: 1, written: 1, errors: [], _before: before, _after: after })
  expect(out[0]?.text).toContain('removed')
  expect(out[0]?.text).toContain('dim_old')
  expect(out[0]?.text).toContain('added')
  expect(out[0]?.text).toContain('dim_new')
})

test('S13 render surfaces the substrate note when present', () => {
  const def = registerTool()
  const out = def.output.render({}, { ok: true, enriched: 0, written: 0, errors: [], note: 'no DIM tables in scope, nothing to enrich' })
  expect(out[0]?.text).toContain('no DIM')
  expect(out[0]?.text).toContain('nothing to enrich')
})

test('S14 discoverRelationsResult forwards the substrate note', async () => {
  const stub = {
    discoverRelations: async () => ({ enriched: 0, written: 0, errors: [], note: 'no DIM tables in scope, nothing to enrich' }),
  }
  const r = await discoverRelationsResult(stub as unknown as SemanticLayerService)
  expect(r.ok).toBe(true)
  expect(r.note).toBe('no DIM tables in scope, nothing to enrich')
})
