import { test, expect } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import {
  apply,
  presentDecompositionResult,
  type PresentDecompositionResult,
} from '../src/index.ts'

interface ToolDef {
  readonly name: string
  readonly description: string
  readonly parameters: {
    readonly type: 'object'
    readonly properties: Record<string, unknown>
    readonly required?: readonly string[]
  }
  readonly output: {
    readonly schema: unknown
    readonly render: (args: unknown, value: PresentDecompositionResult) => readonly { readonly type: 'text'; readonly text: string }[]
  }
  readonly execute: (
    args: Record<string, unknown>,
    exec: { readonly signal: AbortSignal },
  ) => Promise<PresentDecompositionResult>
}

function registerTool(): ToolDef {
  let def: ToolDef | undefined
  const ctx = {
    tools: {
      register: (d: ToolDef) => { def = d },
    },
  } as unknown as Context
  apply(ctx, {})
  if (def === undefined) throw new Error('apply did not register a tool')
  return def
}

const SAMPLE_ARGS = {
  summary: 'Daily active users by region for the last 7 days',
  metrics: [{ name: 'DAU', value: 'COUNT(DISTINCT user_id)', unit: 'users' }],
  dimensions: ['region', 'date'],
  time_range: 'last 7 days',
}

test('apply registers present_decomposition with correct parameters', () => {
  const def = registerTool()
  expect(def.name).toBe('present_decomposition')
  expect(def.description).toContain('decomposition')
  expect(def.parameters.type).toBe('object')
  expect(def.parameters.required).toContain('summary')
  expect(def.parameters.required).toContain('metrics')
  expect(def.parameters.required).toContain('dimensions')
  expect(def.parameters.required).toContain('time_range')
  expect(def.output).toBeDefined()
})

test('execute returns presented payload with required fields', async () => {
  const def = registerTool()
  const out = await def.execute(SAMPLE_ARGS, { signal: new AbortController().signal })
  expect(out.presented).toBe(true)
  expect(out.summary).toBe(SAMPLE_ARGS.summary)
  expect(out.metrics).toEqual(SAMPLE_ARGS.metrics)
  expect(out.dimensions).toEqual(SAMPLE_ARGS.dimensions)
  expect(out.time_range).toBe('last 7 days')
  expect(out.source).toBeUndefined()
  expect(out.filters).toBeUndefined()
  expect(out.confidence).toBeUndefined()
})

test('execute passes through optional fields', async () => {
  const def = registerTool()
  const out = await def.execute(
    { ...SAMPLE_ARGS, source: 'dws_user_di', filters: ['region = "US"'], confidence: 0.95 },
    { signal: new AbortController().signal },
  )
  expect(out.source).toBe('dws_user_di')
  expect(out.filters).toEqual(['region = "US"'])
  expect(out.confidence).toBe(0.95)
})

test('execute rejects empty summary', async () => {
  const def = registerTool()
  await expect(
    def.execute({ ...SAMPLE_ARGS, summary: '' }, { signal: new AbortController().signal }),
  ).rejects.toThrow(/summary/i)
  await expect(
    def.execute({ ...SAMPLE_ARGS, summary: '   ' }, { signal: new AbortController().signal }),
  ).rejects.toThrow(/summary/i)
})

test('execute rejects empty metrics array', async () => {
  const def = registerTool()
  await expect(
    def.execute({ ...SAMPLE_ARGS, metrics: [] }, { signal: new AbortController().signal }),
  ).rejects.toThrow(/at least 1 metric/i)
})

test('execute rejects metric with empty name', async () => {
  const def = registerTool()
  await expect(
    def.execute({ ...SAMPLE_ARGS, metrics: [{ name: '', value: 'SUM(x)' }] }, { signal: new AbortController().signal }),
  ).rejects.toThrow(/metric.*name/i)
})

test('execute rejects metric with empty value', async () => {
  const def = registerTool()
  await expect(
    def.execute({ ...SAMPLE_ARGS, metrics: [{ name: 'Revenue', value: '   ' }] }, { signal: new AbortController().signal }),
  ).rejects.toThrow(/metric.*value/i)
})

test('execute rejects confidence out of range', async () => {
  const def = registerTool()
  await expect(
    def.execute({ ...SAMPLE_ARGS, confidence: 1.5 }, { signal: new AbortController().signal }),
  ).rejects.toThrow(/confidence.*between 0 and 1/i)
  await expect(
    def.execute({ ...SAMPLE_ARGS, confidence: -0.1 }, { signal: new AbortController().signal }),
  ).rejects.toThrow(/confidence.*between 0 and 1/i)
})

test('execute accepts confidence at boundaries (0 and 1)', async () => {
  const def = registerTool()
  const out0 = await def.execute({ ...SAMPLE_ARGS, confidence: 0 }, { signal: new AbortController().signal })
  expect(out0.confidence).toBe(0)
  const out1 = await def.execute({ ...SAMPLE_ARGS, confidence: 1 }, { signal: new AbortController().signal })
  expect(out1.confidence).toBe(1)
})

test('execute rejects on aborted signal', async () => {
  const def = registerTool()
  const ac = new AbortController()
  ac.abort()
  await expect(
    def.execute(SAMPLE_ARGS, { signal: ac.signal }),
  ).rejects.toThrow(/abort/i)
})

test('render formats decomposition as readable text', () => {
  const def = registerTool()
  const out = def.output.render({}, {
    presented: true,
    summary: 'DAU by region',
    metrics: [{ name: 'DAU', value: 'COUNT(DISTINCT user_id)', unit: 'users' }],
    dimensions: ['region'],
    time_range: 'last 7 days',
  })
  expect(out[0]?.type).toBe('text')
  expect(out[0]?.text).toContain('DAU by region')
  expect(out[0]?.text).toContain('last 7 days')
  expect(out[0]?.text).toContain('region')
  expect(out[0]?.text).toContain('DAU')
  expect(out[0]?.text).toContain('(users)')
})

test('render includes optional fields when present', () => {
  const def = registerTool()
  const out = def.output.render({}, {
    presented: true,
    summary: 'Revenue',
    metrics: [{ name: 'revenue', value: 'SUM(amount)' }],
    dimensions: ['channel'],
    time_range: '2024-Q1',
    source: 'dws_order_di',
    filters: ['status = "paid"'],
    confidence: 0.88,
  })
  const text = out[0]?.text ?? ''
  expect(text).toContain('dws_order_di')
  expect(text).toContain('status = "paid"')
  expect(text).toContain('0.88')
})

test('render fallback for presented:false', () => {
  const def = registerTool()
  const out = def.output.render({}, { presented: false, summary: '', metrics: [], dimensions: [], time_range: '' })
  expect(out[0]?.text).toBe('No decomposition to present.')
})

test('presentDecompositionResult pure core works correctly', () => {
  const result = presentDecompositionResult(
    'Test summary',
    [{ name: 'metric1', value: 'val1' }],
    ['dim1'],
    'last 30 days',
  )
  expect(result).toEqual({
    presented: true,
    summary: 'Test summary',
    metrics: [{ name: 'metric1', value: 'val1' }],
    dimensions: ['dim1'],
    time_range: 'last 30 days',
  })
})

test('presentDecompositionResult rejects empty summary', () => {
  expect(() => presentDecompositionResult('', [{ name: 'a', value: 'b' }], [], '')).toThrow(/summary/i)
  expect(() => presentDecompositionResult('   ', [{ name: 'a', value: 'b' }], [], '')).toThrow(/summary/i)
})

test('presentDecompositionResult rejects empty metrics', () => {
  expect(() => presentDecompositionResult('valid', [], [], 'last 7d')).toThrow(/at least 1 metric/i)
})

test('presentDecompositionResult rejects confidence out of range', () => {
  expect(() => presentDecompositionResult('s', [{ name: 'a', value: 'b' }], [], 't', undefined, undefined, 2.0)).toThrow(/confidence/i)
  expect(() => presentDecompositionResult('s', [{ name: 'a', value: 'b' }], [], 't', undefined, undefined, -1)).toThrow(/confidence/i)
})
