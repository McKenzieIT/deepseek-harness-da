import { test, expect } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import {
  apply,
  suggestFollowupsResult,
  type SuggestFollowupsResult,
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
    readonly render: (args: unknown, value: SuggestFollowupsResult) => readonly { readonly type: 'text'; readonly text: string }[]
  }
  readonly execute: (
    args: Record<string, unknown>,
    exec: { readonly signal: AbortSignal },
  ) => Promise<SuggestFollowupsResult>
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

const SAMPLE_SUGGESTIONS = [
  { label: 'By channel', value: 'Break down revenue by sales channel' },
  { label: 'Last month', value: 'Show the same metrics for last month' },
]

test('apply registers suggest_followups with correct parameters', () => {
  const def = registerTool()
  expect(def.name).toBe('suggest_followups')
  expect(def.description).toContain('follow-up')
  expect(def.parameters.type).toBe('object')
  expect(def.parameters.required).toContain('suggestions')
  expect(def.output).toBeDefined()
})

test('execute returns presented payload with suggestions', async () => {
  const def = registerTool()
  const out = await def.execute(
    { suggestions: SAMPLE_SUGGESTIONS },
    { signal: new AbortController().signal },
  )
  expect(out.presented).toBe(true)
  expect(out.suggestions).toEqual(SAMPLE_SUGGESTIONS)
})

test('execute accepts 1 suggestion (minimum)', async () => {
  const def = registerTool()
  const out = await def.execute(
    { suggestions: [{ label: 'Drill down', value: 'Show by region' }] },
    { signal: new AbortController().signal },
  )
  expect(out.presented).toBe(true)
  expect(out.suggestions).toHaveLength(1)
})

test('execute accepts 5 suggestions (maximum)', async () => {
  const def = registerTool()
  const five = Array.from({ length: 5 }, (_, i) => ({ label: `Q${i + 1}`, value: `query ${i + 1}` }))
  const out = await def.execute(
    { suggestions: five },
    { signal: new AbortController().signal },
  )
  expect(out.suggestions).toHaveLength(5)
})

test('execute rejects empty suggestions array', async () => {
  const def = registerTool()
  await expect(
    def.execute({ suggestions: [] }, { signal: new AbortController().signal }),
  ).rejects.toThrow(/at least 1/i)
})

test('execute rejects more than 5 suggestions', async () => {
  const def = registerTool()
  const six = Array.from({ length: 6 }, (_, i) => ({ label: `Q${i}`, value: `query ${i}` }))
  await expect(
    def.execute({ suggestions: six }, { signal: new AbortController().signal }),
  ).rejects.toThrow(/at most 5/i)
})

test('execute rejects suggestion with empty label', async () => {
  const def = registerTool()
  await expect(
    def.execute({ suggestions: [{ label: '', value: 'valid' }] }, { signal: new AbortController().signal }),
  ).rejects.toThrow(/label/i)
  await expect(
    def.execute({ suggestions: [{ label: '   ', value: 'valid' }] }, { signal: new AbortController().signal }),
  ).rejects.toThrow(/label/i)
})

test('execute rejects suggestion with empty value', async () => {
  const def = registerTool()
  await expect(
    def.execute({ suggestions: [{ label: 'valid', value: '' }] }, { signal: new AbortController().signal }),
  ).rejects.toThrow(/value/i)
  await expect(
    def.execute({ suggestions: [{ label: 'valid', value: '   ' }] }, { signal: new AbortController().signal }),
  ).rejects.toThrow(/value/i)
})

test('execute rejects on aborted signal', async () => {
  const def = registerTool()
  const ac = new AbortController()
  ac.abort()
  await expect(
    def.execute({ suggestions: SAMPLE_SUGGESTIONS }, { signal: ac.signal }),
  ).rejects.toThrow(/abort/i)
})

test('render formats suggestions as readable text', () => {
  const def = registerTool()
  const out = def.output.render({}, {
    presented: true,
    suggestions: [
      { label: 'By region', value: 'Break down by region' },
      { label: 'Trend', value: 'Show 30-day trend' },
    ],
  })
  expect(out[0]?.type).toBe('text')
  const text = out[0]?.text ?? ''
  expect(text).toContain('Follow-up suggestions:')
  expect(text).toContain('By region: Break down by region')
  expect(text).toContain('Trend: Show 30-day trend')
})

test('render fallback for presented:false', () => {
  const def = registerTool()
  const out = def.output.render({}, { presented: false, suggestions: [] })
  expect(out[0]?.text).toBe('No follow-up suggestions to present.')
})

test('suggestFollowupsResult pure core works correctly', () => {
  const result = suggestFollowupsResult([{ label: 'A', value: 'B' }])
  expect(result).toEqual({ presented: true, suggestions: [{ label: 'A', value: 'B' }] })
})

test('suggestFollowupsResult rejects empty array', () => {
  expect(() => suggestFollowupsResult([])).toThrow(/at least 1/i)
})

test('suggestFollowupsResult rejects more than 5', () => {
  const six = Array.from({ length: 6 }, (_, i) => ({ label: `L${i}`, value: `V${i}` }))
  expect(() => suggestFollowupsResult(six)).toThrow(/at most 5/i)
})

test('suggestFollowupsResult rejects empty label', () => {
  expect(() => suggestFollowupsResult([{ label: '', value: 'v' }])).toThrow(/label/i)
})

test('suggestFollowupsResult rejects empty value', () => {
  expect(() => suggestFollowupsResult([{ label: 'l', value: '' }])).toThrow(/value/i)
})
