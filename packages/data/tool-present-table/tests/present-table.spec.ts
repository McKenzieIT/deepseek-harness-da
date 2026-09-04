import { test, expect } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import {
  apply,
  presentTableResult,
  type PresentTableResult,
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
    readonly render: (args: unknown, value: PresentTableResult) => readonly { readonly type: 'text'; readonly text: string }[]
  }
  readonly execute: (
    args: Record<string, unknown>,
    exec: { readonly signal: AbortSignal },
  ) => Promise<PresentTableResult>
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

test('apply registers present_table with correct required parameters', () => {
  const def = registerTool()
  expect(def.name).toBe('present_table')
  expect(def.description).toContain('table')
  expect(def.parameters.type).toBe('object')
  expect(def.parameters.required).toContain('result_id')
  expect(def.parameters.required).toContain('title')
  expect(def.output).toBeDefined()
})

test('execute returns presented payload with required fields only', async () => {
  const def = registerTool()
  const out = await def.execute(
    { result_id: 'qr-abc-123', title: 'Daily Revenue' },
    { signal: new AbortController().signal },
  )
  expect(out.presented).toBe(true)
  expect(out.result_id).toBe('qr-abc-123')
  expect(out.title).toBe('Daily Revenue')
  expect(out.columns).toBeUndefined()
  expect(out.chart).toBeUndefined()
})

test('execute passes through all optional fields', async () => {
  const def = registerTool()
  const out = await def.execute(
    {
      result_id: 'qr-xyz',
      title: 'Users by Region',
      columns: ['region', 'count'],
      column_types: ['string', 'number'],
      sort_column: 1,
      kpi_columns: [{ column: 1, aggregation: 'sum', label: 'Total Users', format: ',.0f' }],
      chart: { type: 'bar', x_column: 0, y_columns: [1] },
    },
    { signal: new AbortController().signal },
  )
  expect(out.columns).toEqual(['region', 'count'])
  expect(out.column_types).toEqual(['string', 'number'])
  expect(out.sort_column).toBe(1)
  expect(out.kpi_columns).toEqual([{ column: 1, aggregation: 'sum', label: 'Total Users', format: ',.0f' }])
  expect(out.chart).toEqual({ type: 'bar', x_column: 0, y_columns: [1] })
})

test('execute rejects empty result_id', async () => {
  const def = registerTool()
  await expect(
    def.execute({ result_id: '', title: 'T' }, { signal: new AbortController().signal }),
  ).rejects.toThrow(/result_id/i)
  await expect(
    def.execute({ result_id: '   ', title: 'T' }, { signal: new AbortController().signal }),
  ).rejects.toThrow(/result_id/i)
})

test('execute rejects empty title', async () => {
  const def = registerTool()
  await expect(
    def.execute({ result_id: 'qr-1', title: '' }, { signal: new AbortController().signal }),
  ).rejects.toThrow(/title/i)
  await expect(
    def.execute({ result_id: 'qr-1', title: '   ' }, { signal: new AbortController().signal }),
  ).rejects.toThrow(/title/i)
})

test('execute rejects invalid chart.type', async () => {
  const def = registerTool()
  await expect(
    def.execute(
      { result_id: 'qr-1', title: 'T', chart: { type: 'pie', x_column: 0, y_columns: [1] } },
      { signal: new AbortController().signal },
    ),
  ).rejects.toThrow(/chart\.type/i)
})

test('execute rejects on aborted signal', async () => {
  const def = registerTool()
  const ac = new AbortController()
  ac.abort()
  await expect(
    def.execute({ result_id: 'qr-1', title: 'T' }, { signal: ac.signal }),
  ).rejects.toThrow(/abort/i)
})

test('render formats table summary correctly', () => {
  const def = registerTool()
  const out = def.output.render({}, {
    presented: true,
    result_id: 'qr-abc',
    title: 'Revenue',
    columns: ['date', 'amount', 'region'],
    sort_column: 1,
    chart: { type: 'line', x_column: 0, y_columns: [1] },
  })
  expect(out[0]?.type).toBe('text')
  const text = out[0]?.text ?? ''
  expect(text).toContain('Table: Revenue')
  expect(text).toContain('qr-abc')
  expect(text).toContain('3 columns')
  expect(text).toContain('sort: col 1')
  expect(text).toContain('chart: line')
})

test('render omits sort info for sort_column: -1', () => {
  const def = registerTool()
  const out = def.output.render({}, {
    presented: true,
    result_id: 'qr-1',
    title: 'T',
    sort_column: -1,
  })
  const text = out[0]?.text ?? ''
  expect(text).not.toContain('sort:')
})

test('render includes KPI details', () => {
  const def = registerTool()
  const out = def.output.render({}, {
    presented: true,
    result_id: 'qr-1',
    title: 'T',
    kpi_columns: [
      { column: 0, aggregation: 'sum', label: 'Total', format: ',.2f' },
      { column: 1, aggregation: 'avg', label: 'Average' },
    ],
  })
  const text = out[0]?.text ?? ''
  expect(text).toContain('Total: sum(col 0) [,.2f]')
  expect(text).toContain('Average: avg(col 1)')
})

test('render fallback for presented:false', () => {
  const def = registerTool()
  const out = def.output.render({}, { presented: false, result_id: '', title: '' })
  expect(out[0]?.text).toBe('No table to present.')
})

test('presentTableResult pure core works correctly', () => {
  const result = presentTableResult('qr-1', 'Title')
  expect(result).toEqual({ presented: true, result_id: 'qr-1', title: 'Title' })
})

test('presentTableResult rejects empty result_id', () => {
  expect(() => presentTableResult('', 'T')).toThrow(/result_id/i)
})

test('presentTableResult rejects empty title', () => {
  expect(() => presentTableResult('qr-1', '')).toThrow(/title/i)
})

test('presentTableResult rejects invalid chart.type', () => {
  expect(() => presentTableResult('qr-1', 'T', undefined, undefined, undefined, undefined, { type: 'pie' as unknown as 'bar', x_column: 0, y_columns: [1] })).toThrow(/chart\.type/i)
})

test('execute accepts the R4 native chart types beyond line/bar', async () => {
  const def = registerTool()
  for (const type of ['area', 'hbar', 'scatter', 'doughnut', 'bubble', 'radar', 'polarArea'] as const) {
    const out = await def.execute(
      { result_id: 'qr-1', title: 'T', chart: { type, x_column: 0, y_columns: [1] } },
      { signal: new AbortController().signal },
    )
    expect(out.chart).toEqual({ type, x_column: 0, y_columns: [1] })
  }
})

test('execute passes through chart.r_column (bubble radius column)', async () => {
  const def = registerTool()
  const out = await def.execute(
    {
      result_id: 'qr-1', title: 'T',
      chart: { type: 'bubble', x_column: 0, y_columns: [1], r_column: 2 },
    },
    { signal: new AbortController().signal },
  )
  expect(out.chart).toEqual({ type: 'bubble', x_column: 0, y_columns: [1], r_column: 2 })
})

test('presentTableResult accepts the R4 native chart types beyond line/bar', () => {
  for (const type of ['area', 'hbar', 'scatter', 'doughnut', 'bubble', 'radar', 'polarArea'] as const) {
    const result = presentTableResult('qr-1', 'T', undefined, undefined, undefined, undefined, { type, x_column: 0, y_columns: [1] })
    expect(result.chart).toEqual({ type, x_column: 0, y_columns: [1] })
  }
})

test('tool description carries the metric×dimension×grain chart-type heuristic', () => {
  const def = registerTool()
  const description = def.description
  // The heuristic anchors each native type to its data shape (R4).
  expect(description).toContain('scatter')
  expect(description).toContain('doughnut')
  expect(description).toContain('radar')
  expect(description).toContain('dimension')
})
