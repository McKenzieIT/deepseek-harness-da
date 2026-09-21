import { test, expect } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { PtcRunRequest, PtcRunResult, PtcRunSpec } from '@deepseek-ai/dsh-ptc-runtime'
import type { ResultEntry } from '@deepseek-ai/dsh-result-cache'
import { apply, type ComputeResult } from '../src/index.ts'

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
    readonly render: (args: unknown, value: ComputeResult) => readonly { readonly type: 'text'; readonly text: string }[]
  }
  readonly execute: (
    args: Record<string, unknown>,
    exec: { readonly signal: AbortSignal },
  ) => Promise<ComputeResult>
}

interface MockResultCache {
  store: Map<string, ResultEntry>
  get(id: string): ResultEntry | undefined
  put(id: string, entry: ResultEntry): void
  has(id: string): boolean
}

interface MockPtcRuntime {
  lastRequest: PtcRunSpec | undefined
  result: PtcRunResult
  resolve(request: PtcRunRequest): PtcRunSpec
  run(request: PtcRunSpec): Promise<PtcRunResult>
}

function createMocks(): { cache: MockResultCache; runtime: MockPtcRuntime } {
  const store = new Map<string, ResultEntry>()
  const cache: MockResultCache = {
    store,
    get: id => store.get(id),
    put: (id, entry) => { store.set(id, entry) },
    has: id => store.has(id),
  }
  const runtime: MockPtcRuntime = {
    lastRequest: undefined,
    result: { value: { columns: ['result'], rows: [[1]] }, logs: [] },
    resolve: request => ({ ...request, cwd: '/', timeoutMs: null }),
    run: async (request) => {
      runtime.lastRequest = request
      return runtime.result
    },
  }
  return { cache, runtime }
}

function registerTool(cache: MockResultCache, runtime: MockPtcRuntime): ToolDef {
  let def: ToolDef | undefined
  const ctx = {
    tools: {
      register: (d: ToolDef) => { def = d },
    },
    resultCache: cache,
    ptcRuntime: runtime,
  } as unknown as Context
  apply(ctx, {})
  if (def === undefined) throw new Error('apply did not register a tool')
  return def
}

// data-tools-present-eval-6: a jagged payload {columns:['a','b','c'], rows:[[1,2],[3,4,5]]}
// was once accepted, cached, and surfaced. The compute-result shape guard must
// reject it before it reaches the result cache.

test('rejects a jagged compute payload whose rows vary in cell count', async () => {
  const { cache, runtime } = createMocks()
  cache.store.set('qr_source', {
    columns: ['a', 'b', 'c'],
    rows: [['x', 'y', 'z']],
  })
  // columns.length is 3; the first row has 2 cells and the second has 5.
  runtime.result = {
    value: { columns: ['a', 'b', 'c'], rows: [[1, 2], [3, 4, 5]] },
    logs: [],
  }

  const def = registerTool(cache, runtime)
  await expect(
    def.execute(
      { result_id: 'qr_source', code: 'jagged', description: 'malformed' },
      { signal: new AbortController().signal },
    ),
  ).rejects.toThrow(/returned rows must each have 3 cells.*jagged payload is rejected/i)
})

test('accepts a well-formed compute payload whose rows all match columns.length', async () => {
  const { cache, runtime } = createMocks()
  cache.store.set('qr_source', {
    columns: ['a', 'b', 'c'],
    rows: [['x', 'y', 'z']],
  })
  // Every row has exactly columns.length (3) cells, so the guard does not trip.
  runtime.result = {
    value: { columns: ['a', 'b', 'c'], rows: [[1, 2, 3], [4, 5, 6]] },
    logs: [],
  }

  const def = registerTool(cache, runtime)
  const out = await def.execute(
    { result_id: 'qr_source', code: 'well_formed', description: 'aligned' },
    { signal: new AbortController().signal },
  )

  expect(out.computed).toBe(true)
  expect(out.row_count).toBe(2)
  // The well-formed payload must reach the cache (the jagged payload must not).
  const stored = cache.store.get(out.result_id)!
  expect(stored.columns).toEqual(['a', 'b', 'c'])
  expect(stored.rows).toEqual([[1, 2, 3], [4, 5, 6]])
})
