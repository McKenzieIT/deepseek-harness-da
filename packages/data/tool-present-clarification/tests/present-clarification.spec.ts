/**
 * present_clarification tool — registration (defineTool + ctx.tools.register)
 * + the presentation core. Proves the self-evolution #2a clarification tool
 * mirrors the `tool-load-table-definition` registration shape (defineTool +
 * ctx.tools.register + a pure, testable core), returns the
 * presented+question+options payload the UI displays, and rejects an empty
 * question (the one required parameter).
 *
 * The tool itself is a pure presentation recorder — it records the question +
 * options and returns them. The actual turn HALT is the phase-gate's job
 * (`captureToolData` in `packages/data/phase-gate/src/phase-gate.ts` detects
 * the `present_clarification` call → `awaiting_clarification=true`; Task 6
 * wires the HALT on that flag, in any phase). So this tool has NO service
 * dependency — `inject=['tools']` only, and `execute` never probes `ctx.schema`
 * / `ctx.audit` / `ctx.identity`.
 *
 * Run: `pnpm vitest run packages/data/tool-present-clarification`
 * (the root `pnpm test` globs all `*.spec.ts` files).
 */
import { test, expect } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import {
  apply,
  presentClarificationResult,
  type PresentClarificationResult,
} from '../src/index.ts'

/** The subset of the registered tool definition the tests exercise. */
interface ToolDef {
  readonly name: string
  readonly description: string
  // defineTool compiles the input property map to a JSON-Schema object via
  // parameterSchemaSpecToJsonSchema: properties live under .properties and
  // requiredness under the top-level .required array (the per-property
  // `required:true` annotation is NOT kept on the property node).
  readonly parameters: {
    readonly type: 'object'
    readonly properties: {
      readonly question: { readonly type: 'string'; readonly description: string }
      readonly options: { readonly type: 'array'; readonly items: { readonly type: 'string' }; readonly description: string }
    }
    readonly required?: readonly string[]
  }
  readonly output: {
    readonly schema: unknown
    readonly render: (args: unknown, value: PresentClarificationResult) => readonly { readonly type: 'text'; readonly text: string }[]
  }
  readonly execute: (
    args: { readonly question: string; readonly options?: readonly string[] },
    exec: { readonly signal: AbortSignal },
  ) => Promise<PresentClarificationResult>
}

/** Capture the tool definition the plugin registers, without a Cordis context. */
function registerTool(): ToolDef {
  let def: ToolDef | undefined
  const ctx = {
    tools: {
      register: (d: ToolDef) => {
        def = d
      },
    },
  } as unknown as Context
  apply(ctx, {})
  if (def === undefined) {
    throw new Error('apply did not register a tool')
  }
  return def
}

test('S1 apply registers present_clarification (name + description + parameters + output)', () => {
  const def = registerTool()
  expect(def.name).toBe('present_clarification')
  expect(def.description).toContain('clarifying question')
  // parameters compile to a JSON-Schema object (defineTool transforms the
  // input property map via parameterSchemaSpecToJsonSchema): properties live
  // under .properties and requiredness under the top-level .required array.
  expect(def.parameters.type).toBe('object')
  expect(def.parameters.properties.question.type).toBe('string')
  expect(def.parameters.properties.question.description.length).toBeGreaterThan(0)
  expect(def.parameters.required).toContain('question')
  expect(def.parameters.properties.options.type).toBe('array')
  expect(def.parameters.properties.options.items.type).toBe('string')
  expect(def.parameters.properties.options.description.length).toBeGreaterThan(0)
  expect(def.output).toBeDefined()
  expect(def.output.schema).toBeDefined()
  expect(typeof def.execute).toBe('function')
})

test('S2 execute({question}) returns {presented:true, question} with no options', async () => {
  const def = registerTool()
  const out = await def.execute(
    { question: 'Which ODPS project does dws_pay_order_di live in?' },
    { signal: new AbortController().signal },
  )
  expect(out.presented).toBe(true)
  expect(out.question).toBe('Which ODPS project does dws_pay_order_di live in?')
  expect(out.options).toBeUndefined()
})

test('S3 execute({question, options}) echoes the options through', async () => {
  const def = registerTool()
  const out = await def.execute(
    { question: 'Which project?', options: ['proj_a', 'proj_b'] },
    { signal: new AbortController().signal },
  )
  expect(out.presented).toBe(true)
  expect(out.question).toBe('Which project?')
  expect(out.options).toEqual(['proj_a', 'proj_b'])
})

test('S4 execute - empty question is rejected (the one required parameter)', async () => {
  const def = registerTool()
  await expect(
    def.execute({ question: '' }, { signal: new AbortController().signal }),
  ).rejects.toThrow(/question/i)
  await expect(
    def.execute({ question: '   ' }, { signal: new AbortController().signal }),
  ).rejects.toThrow(/question/i)
})

test('S5 execute - aborted signal throws before presenting', async () => {
  const def = registerTool()
  const ac = new AbortController()
  ac.abort()
  await expect(
    def.execute({ question: 'q?' }, { signal: ac.signal }),
  ).rejects.toThrow(/abort/i)
})

test('S6 render formats the question as a readable text block', () => {
  const def = registerTool()
  const out = def.output.render({}, { presented: true, question: 'Which project?' })
  expect(out[0]?.type).toBe('text')
  expect(out[0]?.text).toContain('Which project?')
})

test('S7 render includes options when present', () => {
  const def = registerTool()
  const out = def.output.render(
    {},
    { presented: true, question: 'Which project?', options: ['proj_a', 'proj_b'] },
  )
  expect(out[0]?.text).toContain('proj_a')
  expect(out[0]?.text).toContain('proj_b')
})

test('S8 presentClarificationResult - pure core returns the presented payload', () => {
  expect(presentClarificationResult('Which project?')).toEqual({ presented: true, question: 'Which project?' })
  expect(presentClarificationResult('Which project?', ['a', 'b'])).toEqual({
    presented: true,
    question: 'Which project?',
    options: ['a', 'b'],
  })
})

test('S9 presentClarificationResult - empty/whitespace question throws (programming error)', () => {
  expect(() => presentClarificationResult('')).toThrow(/question/i)
  expect(() => presentClarificationResult('   ')).toThrow(/question/i)
})

test('S10 render - presented:false uses the neutral fallback', () => {
  const def = registerTool()
  const out = def.output.render({}, { presented: false, question: '' })
  expect(out[0]?.text).toBe('No clarification to present.')
})
