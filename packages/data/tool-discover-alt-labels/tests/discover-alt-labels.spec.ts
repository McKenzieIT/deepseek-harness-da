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
  readonly presentCall: (
    args: { readonly tables?: readonly string[]; readonly events?: readonly string[] },
  ) => { readonly card: string; readonly title: string; readonly kind: string }
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

// --- Contract shell: the registered tool-definition seams the suite above does
// not reach — presentCall, execute's abort guard, presentationMeta's not-ok and
// missing-counter arms, presentResult's error/singular/absent arms, the summary
// render's errors-list arms, and the substrate-error sanitizer.

/**
 * stubSchema's throwing sibling: `discoverAltLabels` rejects instead of
 * summarising, which is the only way into discoverAltLabelsResult's catch arm
 * and therefore into the error sanitizer.
 * @param failure - the value the substrate throws (an Error, or anything else)
 * @returns a SemanticLayerService double whose only method rejects
 */
function throwingSchema(failure: unknown) {
  return {
    discoverAltLabels: async () => {
      throw failure
    },
  }
}

test('render falls back to a no-result line when a failed summary carries no message', () => {
  const def = registerTool()
  const out = def.output.render({}, { ok: false })
  expect(out[0]?.text).toBe('discover_alt_labels: no result.')
})

test('render shows 0/0 when a successful summary omits enriched and written', () => {
  const def = registerTool()
  const out = def.output.render({}, { ok: true })
  expect(out[0]?.text).toBe('discover_alt_labels: enriched 0 definition(s) (written 0).')
})

test('render lists per-definition errors under a counted heading', () => {
  const def = registerTool()
  const out = def.output.render({}, {
    ok: true,
    enriched: 2,
    written: 2,
    errors: ['dws_a: llm round failed', 'social.chat: no columns'],
  })
  expect(out[0]?.text).toBe(
    'discover_alt_labels: enriched 2 definition(s) (written 2).\n'
    + 'errors (2):\n'
    + '  - dws_a: llm round failed\n'
    + '  - social.chat: no columns',
  )
})

test('render truncates the error list at 20 entries and counts the remainder', () => {
  const def = registerTool()
  const errors = Array.from({ length: 23 }, (_, i) => `def_${i + 1}: failed`)
  const lines = (def.output.render({}, { ok: true, enriched: 1, written: 1, errors })[0]?.text ?? '').split('\n')
  // 1 summary + 1 heading + 20 errors + 1 remainder line, and nothing past #20.
  expect(lines).toHaveLength(23)
  expect(lines[0]).toBe('discover_alt_labels: enriched 1 definition(s) (written 1).')
  expect(lines[1]).toBe('errors (23):')
  expect(lines[2]).toBe('  - def_1: failed')
  expect(lines[21]).toBe('  - def_20: failed')
  expect(lines[22]).toBe('  ... +3 more')
  expect(lines.join('\n')).not.toContain('def_21')
})

test('presentationMeta drops the counters entirely for a failed result', () => {
  const def = registerTool()
  const meta = def.output.presentationMeta?.({}, {
    ok: false,
    message: 'semantic-layer substrate not mounted (ctx.schema unavailable)',
  })
  expect(meta).toEqual({ ok: false })
})

test('presentationMeta defaults enriched and written to 0 when the summary omits them', () => {
  const def = registerTool()
  const meta = def.output.presentationMeta?.({}, { ok: true })
  expect(meta).toEqual({ ok: true, enriched: 0, written: 0 })
})

test('execute rejects on an already-aborted signal without calling the substrate', async () => {
  const opts: Record<string, unknown>[] = []
  const def = registerTool(stubSchema({ enriched: 9, written: 9, errors: [] }, opts))
  const ac = new AbortController()
  ac.abort()
  await expect(def.execute({}, { signal: ac.signal }))
    .rejects.toThrow(/^discover_alt_labels aborted before enriching$/)
  expect(opts).toEqual([])
})

test('presentCall pluralises the scope across the requested tables and events', () => {
  const def = registerTool()
  expect(def.presentCall({ tables: ['dws_a', 'dws_b'], events: ['social.chat'] })).toEqual({
    card: 'generic',
    title: 'Discover Alt Labels (3 definitions)',
    kind: 'search',
  })
})

test('presentCall keeps the scope singular for exactly one requested definition', () => {
  const def = registerTool()
  expect(def.presentCall({ tables: ['dws_a'] })).toEqual({
    card: 'generic',
    title: 'Discover Alt Labels (1 definition)',
    kind: 'search',
  })
})

test('presentCall reports an all-definitions scope when neither filter is given', () => {
  const def = registerTool()
  expect(def.presentCall({})).toEqual({
    card: 'generic',
    title: 'Discover Alt Labels (all definitions)',
    kind: 'search',
  })
})

test('presentResult renders no card at all for an errored tool result', () => {
  const def = registerTool()
  expect(def.presentResult?.({}, { isError: true })).toBeUndefined()
})

test('presentResult reports no new labels when the result carries no meta', () => {
  const def = registerTool()
  expect(def.presentResult?.({}, { isError: false })).toEqual({
    card: 'generic',
    title: 'No new labels discovered',
  })
})

test('presentResult ignores the enriched count carried by a not-ok meta', () => {
  const def = registerTool()
  expect(def.presentResult?.({}, { isError: false, meta: { ok: false, enriched: 7 } })).toEqual({
    card: 'generic',
    title: 'No new labels discovered',
  })
})

test('presentResult treats an ok meta with no enriched count as zero', () => {
  const def = registerTool()
  expect(def.presentResult?.({}, { isError: false, meta: { ok: true } })).toEqual({
    card: 'generic',
    title: 'No new labels discovered',
  })
})

test('presentResult keeps the title singular when one definition gained labels', () => {
  const def = registerTool()
  expect(def.presentResult?.({}, { isError: false, meta: { ok: true, enriched: 1 } })).toEqual({
    card: 'generic',
    title: '+1 definition gained new labels',
  })
})

test('substrate Error message is reported with filesystem paths replaced by <path>', async () => {
  const r = await discoverAltLabelsResult(
    throwingSchema(
      new Error('EACCES: permission denied\n\x00\topening /Users/mckenzie/.dsh/secrets/schema-token.yaml\x07'),
    ) as unknown as SemanticLayerService,
  )
  expect(r.ok).toBe(false)
  expect(r.message).toBe('substrate error: EACCES: permission denied opening <path>')
  // The leaked home directory, the secrets directory, the filename, the
  // embedded control characters (including the non-whitespace NUL and BEL that
  // a plain \s+ collapse would keep) and the run of blanks they left behind are
  // all gone — not merely "a string came back".
  expect(r.message).not.toContain('mckenzie')
  expect(r.message).not.toContain('secrets')
  expect(r.message).not.toContain('schema-token.yaml')
  expect(r.message).not.toContain('\n')
  expect(r.message).not.toContain('\t')
  expect(r.message).not.toContain('\x00')
  expect(r.message).not.toContain('\x07')
  expect(r.message).not.toContain('  ')
})

test('a non-Error substrate rejection is stringified and path-scrubbed too', async () => {
  const r = await discoverAltLabelsResult(
    throwingSchema('raw failure at config/local/creds.env') as unknown as SemanticLayerService,
  )
  expect(r.ok).toBe(false)
  expect(r.message).toBe('substrate error: raw failure at <path>')
  expect(r.message).not.toContain('creds.env')
})

test('an overlong substrate message is scrubbed first, then capped at 200 chars', async () => {
  const r = await discoverAltLabelsResult(
    throwingSchema(
      new Error(`leak /Users/mckenzie/.dsh/secrets/token.key ${'A'.repeat(250)}`),
    ) as unknown as SemanticLayerService,
  )
  expect(r.ok).toBe(false)
  // 'leak <path> ' is 12 chars, so the 200-char cap keeps 188 tail chars; the
  // path is already <path> at that point, proving scrub-before-truncate.
  expect(r.message).toBe(`substrate error: leak <path> ${'A'.repeat(188)}...`)
  expect(r.message).not.toContain('mckenzie')
  expect(r.message).not.toContain('token.key')
})
