/**
 * discover_alt_labels tool — registration + pure logic core tests.
 * Mirrors tool-discover-relations test pattern.
 */
import { test, expect } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import {
  apply,
  validateName,
  discoverAltLabelsResult,
  type DiscoverAltLabelsResult,
} from '../src/index.ts'
import type { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer/src/index.ts'

function stubSchema(summary: { enriched: number; written: number; errors: string[] }, optsSink?: Record<string, unknown>[]) {
  return {
    discoverAltLabels: async (opts: { tables?: readonly string[]; events?: readonly string[] } = {}) => {
      if (optsSink !== undefined) optsSink.push({ ...opts })
      return { ...summary }
    },
  }
}

interface ToolDef {
  readonly name: string
  readonly description: string
  readonly output: {
    readonly schema: unknown
    readonly render: (args: unknown, value: DiscoverAltLabelsResult) => readonly { readonly type: 'text'; readonly text: string }[]
    readonly presentationMeta?: (args: unknown, value: DiscoverAltLabelsResult) => { ok: boolean; enriched?: number; written?: number }
  }
  readonly execute: (
    args: { readonly tables?: string[]; readonly events?: string[] },
    exec: { readonly signal: AbortSignal },
  ) => Promise<DiscoverAltLabelsResult>
  readonly presentResult?: (args: unknown, result: { readonly isError?: boolean; readonly content?: readonly { readonly type: 'text'; readonly text: string }[]; readonly meta?: { ok?: boolean; enriched?: number; written?: number } }) => { readonly card: string; readonly title: string } | undefined
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

test('validateName accepts plain names, rejects traversal + empty', () => {
  expect(validateName('dws_pay_order_di')).toBe('dws_pay_order_di')
  expect(validateName('  social.chat  ')).toBe('social.chat')
  expect(validateName('')).toBeNull()
  expect(validateName('../etc/passwd')).toBeNull()
  expect(validateName('a/b')).toBeNull()
  expect(validateName('a\\b')).toBeNull()
  expect(validateName('..')).toBeNull()
  expect(validateName('bad\x00name')).toBeNull()
  expect(validateName('a'.repeat(201))).toBeNull()
})

test('discoverAltLabelsResult - not mounted', async () => {
  const r = await discoverAltLabelsResult(undefined)
  expect(r.ok).toBe(false)
  expect(r.message).toContain('not mounted')
})

test('discoverAltLabelsResult - no filter calls discoverAltLabels({})', async () => {
  const opts: Record<string, unknown>[] = []
  const r = await discoverAltLabelsResult(stubSchema({ enriched: 3, written: 5, errors: [] }, opts) as unknown as SemanticLayerService)
  expect(r.ok).toBe(true)
  expect(r.enriched).toBe(3)
  expect(r.written).toBe(5)
  expect(opts).toEqual([{}])
})

test('discoverAltLabelsResult - tables + events filter forwarded', async () => {
  const opts: Record<string, unknown>[] = []
  const r = await discoverAltLabelsResult(
    stubSchema({ enriched: 1, written: 1, errors: [] }, opts) as unknown as SemanticLayerService,
    ['dws_a', ' dws_b '],
    ['social.chat'],
  )
  expect(r.ok).toBe(true)
  expect(opts[0]).toEqual({ tables: ['dws_a', 'dws_b'], events: ['social.chat'] })
})

test('discoverAltLabelsResult - invalid table name rejected', async () => {
  const opts: Record<string, unknown>[] = []
  const r = await discoverAltLabelsResult(
    stubSchema({ enriched: 0, written: 0, errors: [] }, opts) as unknown as SemanticLayerService,
    ['good', '../bad'],
  )
  expect(r.ok).toBe(false)
  expect(r.message).toContain('invalid')
  expect(opts).toEqual([])
})

test('discoverAltLabelsResult - invalid event name rejected', async () => {
  const opts: Record<string, unknown>[] = []
  const r = await discoverAltLabelsResult(
    stubSchema({ enriched: 0, written: 0, errors: [] }, opts) as unknown as SemanticLayerService,
    undefined,
    ['ok', 'a/b'],
  )
  expect(r.ok).toBe(false)
  expect(r.message).toContain('invalid')
  expect(opts).toEqual([])
})

test('apply registers discover_alt_labels', () => {
  const def = registerTool()
  expect(def.name).toBe('discover_alt_labels')
  expect(def.description).toContain('alt_labels')
  expect(typeof def.execute).toBe('function')
})

test('execute returns summary when schema mounted', async () => {
  const def = registerTool(stubSchema({ enriched: 4, written: 6, errors: ['e1'] }))
  const out = await def.execute({}, { signal: new AbortController().signal })
  expect(out.ok).toBe(true)
  expect(out.enriched).toBe(4)
  expect(out.written).toBe(6)
  expect(out.errors).toEqual(['e1'])
})

test('execute - not-mounted fallback', async () => {
  const def = registerTool(undefined)
  const out = await def.execute({}, { signal: new AbortController().signal })
  expect(out.ok).toBe(false)
  expect(out.message).toContain('not mounted')
})

test('render formats successful summary', () => {
  const def = registerTool()
  const out = def.output.render({}, { ok: true, enriched: 5, written: 8, errors: [] })
  expect(out[0]?.text).toContain('5')
  expect(out[0]?.text).toContain('8')
})

test('render formats not-mounted message', () => {
  const def = registerTool()
  const out = def.output.render({}, { ok: false, message: 'semantic-layer substrate not mounted' })
  expect(out[0]?.text).toContain('not mounted')
})

test('presentResult title reflects enriched count (pin: stable across regex→meta refactor)', () => {
  // The result carries BOTH content (rendered text — current presentResult regex-matches it)
  // AND meta (structured — fixed presentResult reads it). Same title either way.
  const def = registerTool()
  const value: DiscoverAltLabelsResult = { ok: true, enriched: 5, written: 3 }
  const content = def.output.render({}, value)
  const meta = { ok: true, enriched: 5, written: 3 }
  const result = { isError: false, content, meta }
  const view = def.presentResult?.({}, result)
  expect(view?.title).toBe('+5 definitions gained new labels')
})

test('presentResult title is "No new labels discovered" when enriched=0', () => {
  const def = registerTool()
  const value: DiscoverAltLabelsResult = { ok: true, enriched: 0, written: 0 }
  const content = def.output.render({}, value)
  const meta = { ok: true, enriched: 0, written: 0 }
  const result = { isError: false, content, meta }
  const view = def.presentResult?.({}, result)
  expect(view?.title).toBe('No new labels discovered')
})

test('presentationMeta returns structured { ok, enriched, written } from the result', () => {
  const def = registerTool()
  const value: DiscoverAltLabelsResult = { ok: true, enriched: 5, written: 3 }
  const meta = def.output.presentationMeta?.({}, value)
  expect(meta).toEqual({ ok: true, enriched: 5, written: 3 })
})
