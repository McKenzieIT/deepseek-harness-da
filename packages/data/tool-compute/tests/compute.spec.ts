import { test, expect } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { CodeRunRequest, CodeRunResult } from '@deepseek-ai/dsh-code-runtime'
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

interface MockCodeRuntime {
  lastRequest: CodeRunRequest | undefined
  result: CodeRunResult
  run(request: CodeRunRequest): Promise<CodeRunResult>
}

function createMocks(): { cache: MockResultCache; runtime: MockCodeRuntime } {
  const store = new Map<string, ResultEntry>()
  const cache: MockResultCache = {
    store,
    get: id => store.get(id),
    put: (id, entry) => { store.set(id, entry) },
    has: id => store.has(id),
  }
  const runtime: MockCodeRuntime = {
    lastRequest: undefined,
    result: { value: { columns: ['result'], rows: [[1]] }, logs: [] },
    run: async (request) => {
      runtime.lastRequest = request
      return runtime.result
    },
  }
  return { cache, runtime }
}

function registerTool(cache: MockResultCache, runtime: MockCodeRuntime): ToolDef {
  let def: ToolDef | undefined
  const ctx = {
    tools: {
      register: (d: ToolDef) => { def = d },
    },
    resultCache: cache,
    codeRuntime: runtime,
  } as unknown as Context
  apply(ctx, {})
  if (def === undefined) throw new Error('apply did not register a tool')
  return def
}

test('apply registers compute tool with correct required parameters', () => {
  const { cache, runtime } = createMocks()
  const def = registerTool(cache, runtime)
  expect(def.name).toBe('compute')
  expect(def.description).toContain('pandas')
  expect(def.parameters.type).toBe('object')
  expect(def.parameters.required).toContain('result_id')
  expect(def.parameters.required).toContain('code')
  expect(def.parameters.required).toContain('description')
})

test('execute runs code and returns computed result', async () => {
  const { cache, runtime } = createMocks()
  cache.store.set('qr_abc123def456', {
    columns: ['date', 'revenue'],
    rows: [['2024-01-01', 100], ['2024-01-02', 200]],
  })
  runtime.result = {
    value: { columns: ['date', 'growth_rate'], rows: [['2024-01-02', 1.0]] },
    logs: [],
  }

  const def = registerTool(cache, runtime)
  const out = await def.execute(
    { result_id: 'qr_abc123def456', code: 'return {"columns": ["date", "growth_rate"], "rows": [["2024-01-02", 1.0]]}', description: 'Day-over-day growth rate' },
    { signal: new AbortController().signal },
  )

  expect(out.computed).toBe(true)
  expect(out.result_id).toMatch(/^cr_[a-f0-9]{12}$/)
  expect(out.description).toBe('Day-over-day growth rate')
  expect(out.row_count).toBe(1)
})

test('execute stores result in cache with cr_ prefix', async () => {
  const { cache, runtime } = createMocks()
  cache.store.set('qr_source', {
    columns: ['x'],
    rows: [[1], [2], [3]],
  })
  runtime.result = {
    value: { columns: ['x', 'x_squared'], rows: [[1, 1], [2, 4], [3, 9]] },
    logs: [],
  }

  const def = registerTool(cache, runtime)
  const out = await def.execute(
    { result_id: 'qr_source', code: 'compute squares', description: 'Squared values' },
    { signal: new AbortController().signal },
  )

  expect(cache.store.has(out.result_id)).toBe(true)
  const stored = cache.store.get(out.result_id)!
  expect(stored.columns).toEqual(['x', 'x_squared'])
  expect(stored.rows).toEqual([[1, 1], [2, 4], [3, 9]])
})

test('execute passes code to codeRuntime with data binding', async () => {
  const { cache, runtime } = createMocks()
  cache.store.set('qr_test', { columns: ['a'], rows: [[1]] })
  runtime.result = { value: { columns: ['a'], rows: [[2]] }, logs: [] }

  const def = registerTool(cache, runtime)
  await def.execute(
    { result_id: 'qr_test', code: 'my_code_here', description: 'test' },
    { signal: new AbortController().signal },
  )

  expect(runtime.lastRequest).toBeDefined()
  expect(runtime.lastRequest!.program).toBe('my_code_here')
  expect(runtime.lastRequest!.bindings).toHaveLength(1)
  expect(runtime.lastRequest!.bindings[0]!.global).toBe('data')
  expect(runtime.lastRequest!.bindings[0]!.functions).toHaveProperty('load_result')
})

test('load_result binding returns data from cache', async () => {
  const { cache, runtime } = createMocks()
  cache.store.set('qr_target', { columns: ['col1', 'col2'], rows: [['a', 1], ['b', 2]] })

  let capturedBinding: ((args: unknown) => Promise<unknown>) | undefined
  runtime.run = async (request) => {
    capturedBinding = request.bindings[0]!.functions.load_result
    return { value: { columns: ['r'], rows: [[1]] }, logs: [] }
  }

  const def = registerTool(cache, runtime)
  await def.execute(
    { result_id: 'qr_target', code: 'x', description: 'test' },
    { signal: new AbortController().signal },
  )

  expect(capturedBinding).toBeDefined()
  const result = await capturedBinding!({ result_id: 'qr_target' })
  expect(result).toEqual({ columns: ['col1', 'col2'], rows: [['a', 1], ['b', 2]] })
})

test('load_result binding throws on missing result_id', async () => {
  const { cache, runtime } = createMocks()
  cache.store.set('qr_exists', { columns: ['x'], rows: [[1]] })

  let capturedBinding: ((args: unknown) => Promise<unknown>) | undefined
  runtime.run = async (request) => {
    capturedBinding = request.bindings[0]!.functions.load_result
    return { value: { columns: ['r'], rows: [[1]] }, logs: [] }
  }

  const def = registerTool(cache, runtime)
  await def.execute(
    { result_id: 'qr_exists', code: 'x', description: 'test' },
    { signal: new AbortController().signal },
  )

  await expect(capturedBinding!({ result_id: 'qr_nonexistent' }))
    .rejects.toThrow(/not found/i)
})

test('load_result binding throws on empty result_id argument', async () => {
  const { cache, runtime } = createMocks()
  cache.store.set('qr_exists', { columns: ['x'], rows: [[1]] })

  let capturedBinding: ((args: unknown) => Promise<unknown>) | undefined
  runtime.run = async (request) => {
    capturedBinding = request.bindings[0]!.functions.load_result
    return { value: { columns: ['r'], rows: [[1]] }, logs: [] }
  }

  const def = registerTool(cache, runtime)
  await def.execute(
    { result_id: 'qr_exists', code: 'x', description: 'test' },
    { signal: new AbortController().signal },
  )

  await expect(capturedBinding!({ result_id: '' }))
    .rejects.toThrow(/non-empty/i)
  await expect(capturedBinding!(null))
    .rejects.toThrow(/non-empty/i)
})

test('execute rejects empty result_id', async () => {
  const { cache, runtime } = createMocks()
  const def = registerTool(cache, runtime)
  await expect(
    def.execute({ result_id: '', code: 'x', description: 'y' }, { signal: new AbortController().signal }),
  ).rejects.toThrow(/result_id/i)
  await expect(
    def.execute({ result_id: '   ', code: 'x', description: 'y' }, { signal: new AbortController().signal }),
  ).rejects.toThrow(/result_id/i)
})

test('execute rejects empty code', async () => {
  const { cache, runtime } = createMocks()
  cache.store.set('qr_1', { columns: ['x'], rows: [[1]] })
  const def = registerTool(cache, runtime)
  await expect(
    def.execute({ result_id: 'qr_1', code: '', description: 'y' }, { signal: new AbortController().signal }),
  ).rejects.toThrow(/code/i)
  await expect(
    def.execute({ result_id: 'qr_1', code: '   ', description: 'y' }, { signal: new AbortController().signal }),
  ).rejects.toThrow(/code/i)
})

test('execute rejects empty description', async () => {
  const { cache, runtime } = createMocks()
  cache.store.set('qr_1', { columns: ['x'], rows: [[1]] })
  const def = registerTool(cache, runtime)
  await expect(
    def.execute({ result_id: 'qr_1', code: 'x', description: '' }, { signal: new AbortController().signal }),
  ).rejects.toThrow(/description/i)
})

test('execute rejects when result_id not in cache', async () => {
  const { cache, runtime } = createMocks()
  const def = registerTool(cache, runtime)
  await expect(
    def.execute({ result_id: 'qr_missing', code: 'x', description: 'y' }, { signal: new AbortController().signal }),
  ).rejects.toThrow(/not found in cache/i)
})

test('execute propagates code runtime failure', async () => {
  const { cache, runtime } = createMocks()
  cache.store.set('qr_1', { columns: ['x'], rows: [[1]] })
  runtime.result = {
    logs: ['Traceback...'],
    error: { kind: 'exception', message: "NameError: name 'foo' is not defined" },
  }

  const def = registerTool(cache, runtime)
  await expect(
    def.execute({ result_id: 'qr_1', code: 'foo()', description: 'y' }, { signal: new AbortController().signal }),
  ).rejects.toThrow(/exception.*NameError/i)
})

test('execute propagates timeout failure', async () => {
  const { cache, runtime } = createMocks()
  cache.store.set('qr_1', { columns: ['x'], rows: [[1]] })
  runtime.result = {
    logs: [],
    error: { kind: 'timeout', message: 'CPU time limit exceeded' },
  }

  const def = registerTool(cache, runtime)
  await expect(
    def.execute({ result_id: 'qr_1', code: 'while True: pass', description: 'y' }, { signal: new AbortController().signal }),
  ).rejects.toThrow(/timeout/i)
})

test('execute rejects invalid output (not an object)', async () => {
  const { cache, runtime } = createMocks()
  cache.store.set('qr_1', { columns: ['x'], rows: [[1]] })
  runtime.result = { value: 42, logs: [] }

  const def = registerTool(cache, runtime)
  await expect(
    def.execute({ result_id: 'qr_1', code: 'return 42', description: 'y' }, { signal: new AbortController().signal }),
  ).rejects.toThrow(/columns.*rows/i)
})

test('execute rejects invalid output (missing columns)', async () => {
  const { cache, runtime } = createMocks()
  cache.store.set('qr_1', { columns: ['x'], rows: [[1]] })
  runtime.result = { value: { rows: [[1]] }, logs: [] }

  const def = registerTool(cache, runtime)
  await expect(
    def.execute({ result_id: 'qr_1', code: 'return {"rows": [[1]]}', description: 'y' }, { signal: new AbortController().signal }),
  ).rejects.toThrow(/columns/i)
})

test('execute rejects invalid output (rows not array of arrays)', async () => {
  const { cache, runtime } = createMocks()
  cache.store.set('qr_1', { columns: ['x'], rows: [[1]] })
  runtime.result = { value: { columns: ['x'], rows: [1, 2, 3] }, logs: [] }

  const def = registerTool(cache, runtime)
  await expect(
    def.execute({ result_id: 'qr_1', code: 'bad', description: 'y' }, { signal: new AbortController().signal }),
  ).rejects.toThrow(/rows/i)
})

test('execute rejects on aborted signal', async () => {
  const { cache, runtime } = createMocks()
  cache.store.set('qr_1', { columns: ['x'], rows: [[1]] })
  const def = registerTool(cache, runtime)
  const ac = new AbortController()
  ac.abort()
  await expect(
    def.execute({ result_id: 'qr_1', code: 'x', description: 'y' }, { signal: ac.signal }),
  ).rejects.toThrow(/abort/i)
})

test('execute passes abort signal to code runtime', async () => {
  const { cache, runtime } = createMocks()
  cache.store.set('qr_1', { columns: ['x'], rows: [[1]] })
  const ac = new AbortController()

  runtime.run = async (request) => {
    expect(request.signal).toBe(ac.signal)
    return { value: { columns: ['x'], rows: [[1]] }, logs: [] }
  }

  const def = registerTool(cache, runtime)
  await def.execute(
    { result_id: 'qr_1', code: 'x', description: 'y' },
    { signal: ac.signal },
  )
})

test('deterministic result_id for same code+input', async () => {
  const { cache, runtime } = createMocks()
  cache.store.set('qr_1', { columns: ['x'], rows: [[1]] })
  runtime.result = { value: { columns: ['x'], rows: [[2]] }, logs: [] }

  const def = registerTool(cache, runtime)
  const out1 = await def.execute(
    { result_id: 'qr_1', code: 'same_code', description: 'a' },
    { signal: new AbortController().signal },
  )
  const out2 = await def.execute(
    { result_id: 'qr_1', code: 'same_code', description: 'b' },
    { signal: new AbortController().signal },
  )
  expect(out1.result_id).toBe(out2.result_id)
})

test('different code produces different result_id', async () => {
  const { cache, runtime } = createMocks()
  cache.store.set('qr_1', { columns: ['x'], rows: [[1]] })
  runtime.result = { value: { columns: ['x'], rows: [[2]] }, logs: [] }

  const def = registerTool(cache, runtime)
  const out1 = await def.execute(
    { result_id: 'qr_1', code: 'code_a', description: 'y' },
    { signal: new AbortController().signal },
  )
  const out2 = await def.execute(
    { result_id: 'qr_1', code: 'code_b', description: 'y' },
    { signal: new AbortController().signal },
  )
  expect(out1.result_id).not.toBe(out2.result_id)
})

test('render formats computed result correctly', () => {
  const { cache, runtime } = createMocks()
  const def = registerTool(cache, runtime)
  const out = def.output.render({}, {
    computed: true,
    result_id: 'cr_abc123def456',
    description: 'Growth rate calculation',
    row_count: 5,
  })
  expect(out[0]?.type).toBe('text')
  expect(out[0]?.text).toContain('Growth rate calculation')
  expect(out[0]?.text).toContain('cr_abc123def456')
  expect(out[0]?.text).toContain('5 rows')
})

test('render fallback for computed:false', () => {
  const { cache, runtime } = createMocks()
  const def = registerTool(cache, runtime)
  const out = def.output.render({}, {
    computed: false,
    result_id: '',
    description: '',
    row_count: 0,
  })
  expect(out[0]?.text).toBe('Compute failed.')
})
