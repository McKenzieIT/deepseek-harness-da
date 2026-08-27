/**
 * query_data tool - registration (defineTool + ctx.tools.register) and the
 * 3-state EXECUTION flow (completed rows / pending poll / failed surface).
 * Proves the agent-facing query consumer over the `ctx.query` seam.
 *
 * Run: `pnpm vitest run packages/query/query-tool`
 * (the root `pnpm test` globs all `*.spec.ts` files.)
 */
import { test, expect } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { InstanceId, QueryEngine, QueryOutcome, QueryRequest } from '@deepseek-ai/dsh-query/src/index.ts'
import { apply, executeQuery, projectOutcome, resolveConfig, type QueryDataResult } from '../src/index.ts'

/** The subset of the registered tool definition the tests exercise. */
interface ToolDef {
  readonly name: string
  readonly description: string
  readonly output: {
    readonly schema: unknown
    readonly render: (args: unknown, value: QueryDataResult) => readonly { readonly type: 'text'; readonly text: string }[]
  }
  readonly execute: (
    args: { readonly sql: string; readonly scope_id: string },
    exec: { readonly signal: AbortSignal },
  ) => Promise<QueryDataResult>
}

/** Stub QueryEngine: a canned-outcome queue for execute + getProgress. */
class StubQuery {
  readonly calls: string[] = []
  private readonly executeQueue: QueryOutcome[]
  private readonly pollQueue: QueryOutcome[]
  constructor(opts: { execute?: QueryOutcome[]; poll?: QueryOutcome[] } = {}) {
    this.executeQueue = opts.execute ?? []
    this.pollQueue = opts.poll ?? []
  }
  async execute(req: QueryRequest, _signal?: AbortSignal): Promise<QueryOutcome> {
    this.calls.push(`execute:${req.sql}`)
    return this.executeQueue.shift() ?? { state: 'completed', sql: req.sql }
  }
  async getProgress(id: InstanceId): Promise<QueryOutcome> {
    this.calls.push(`progress:${id}`)
    return this.pollQueue.shift() ?? { state: 'pending', sql: '' }
  }
  async attach(_id: InstanceId): Promise<QueryOutcome> {
    return { state: 'completed', sql: '' }
  }
  async cancel(_id: InstanceId): Promise<void> {}
}

const signal = (): AbortSignal => new AbortController().signal

const completed: QueryOutcome = {
  state: 'completed',
  sql: 'SELECT 1',
  columns: ['dau'],
  rows: [[4336]],
  rowCount: 1,
}

/** Capture the tool definition the plugin registers, without a Cordis context. */
function registerTool(): ToolDef {
  let def: ToolDef | undefined
  const ctx = {
    tools: { register: (d: ToolDef) => { def = d } },
    // execute probes `ctx.get('query')`; the stub models "no query provider
    // registered" (returns undefined -> the no-engine error path).
    get: () => undefined,
  } as unknown as Context
  apply(ctx, {})
  if (def === undefined) {
    throw new Error('apply did not register a tool')
  }
  return def
}

/** Capture the tool definition with a stub query engine wired through ctx.get. */
function registerToolWithQuery(q: StubQuery): ToolDef {
  let def: ToolDef | undefined
  const ctx = {
    tools: { register: (d: ToolDef) => { def = d } },
    get: () => q,
  } as unknown as Context
  apply(ctx, {})
  if (def === undefined) {
    throw new Error('apply did not register a tool')
  }
  return def
}

test('S1 apply registers query_data (name + description + output + execute)', () => {
  const def = registerTool()
  expect(def.name).toBe('query_data')
  expect(def.description).toContain('EXECUTION')
  expect(def.output).toBeDefined()
  expect(typeof def.execute).toBe('function')
})

test('S2 executeQuery completed -> rows', async () => {
  const q = new StubQuery({ execute: [completed] })
  const r = await executeQuery(
    q as unknown as QueryEngine,
    { sql: 'SELECT 1', scope_id: '10000251' },
    { signal: signal() },
    resolveConfig(),
  )
  expect(r.state).toBe('completed')
  expect(r.columns).toEqual(['dau'])
  expect(r.rows?.[0]?.[0]).toBe(4336)
  expect(r.rowCount).toBe(1)
  expect(q.calls).toEqual(['execute:SELECT 1'])
})

test('S3 executeQuery pending -> polls getProgress to completed', async () => {
  const q = new StubQuery({
    execute: [{ state: 'pending', instanceId: 'job-1', sql: 'SELECT 1', stage: 'running', elapsedMs: 100 }],
    poll: [
      { state: 'pending', instanceId: 'job-1', sql: '', stage: 'running', elapsedMs: 200 },
      completed,
    ],
  })
  const r = await executeQuery(
    q as unknown as QueryEngine,
    { sql: 'SELECT 1', scope_id: 's' },
    { signal: signal() },
    resolveConfig({ pollIntervalMs: 0 }),
  )
  expect(r.state).toBe('completed')
  expect(r.rows?.[0]?.[0]).toBe(4336)
  expect(q.calls).toEqual(['execute:SELECT 1', 'progress:job-1', 'progress:job-1'])
})

test('S4 executeQuery pending budget exhausted -> honest pending (no silent completed)', async () => {
  const q = new StubQuery({
    execute: [{ state: 'pending', instanceId: 'job-2', sql: 'SELECT 1', stage: 'running', elapsedMs: 10 }],
    poll: [{ state: 'pending', instanceId: 'job-2', sql: '', stage: 'running', elapsedMs: 20 }],
  })
  const r = await executeQuery(
    q as unknown as QueryEngine,
    { sql: 'SELECT 1', scope_id: 's' },
    { signal: signal() },
    resolveConfig({ maxPolls: 2, pollIntervalMs: 0 }),
  )
  expect(r.state).toBe('pending')
  expect(r.instanceId).toBe('job-2')
  expect(q.calls.filter(c => c.startsWith('progress')).length).toBe(2)
})

test('S5 executeQuery failed -> surfaces error + failureKind', async () => {
  const q = new StubQuery({
    execute: [{ state: 'failed', sql: 'SELECT X', error: 'bad table', failureKind: 'semantic' }],
  })
  const r = await executeQuery(
    q as unknown as QueryEngine,
    { sql: 'SELECT X', scope_id: 's' },
    { signal: signal() },
    resolveConfig(),
  )
  expect(r.state).toBe('failed')
  expect(r.error).toBe('bad table')
  expect(r.failureKind).toBe('semantic')
})

test('S6 projectOutcome drops executionMeta, keeps 3-state fields', () => {
  const p = projectOutcome({
    state: 'completed',
    sql: 'S',
    columns: ['c'],
    rows: [[1]],
    rowCount: 1,
    executionMeta: { durationMs: 9, instanceId: 'i', costCheck: 'passed', timedOut: false },
  })
  expect(p).toEqual({ state: 'completed', sql: 'S', columns: ['c'], rows: [[1]], rowCount: 1 })
})

test('S7 apply def.execute -> no query engine -> throws a helpful error', async () => {
  const def = registerTool()
  await expect(
    def.execute({ sql: 'SELECT 1', scope_id: 's' }, { signal: signal() }),
  ).rejects.toThrow(/no query engine registered/)
})

test('S8 apply def.execute -> completed through the apply path (ctx.get stub)', async () => {
  const q = new StubQuery({ execute: [completed] })
  const def = registerToolWithQuery(q)
  const r = await def.execute({ sql: 'SELECT 1', scope_id: 's' }, { signal: signal() })
  expect(r.state).toBe('completed')
  expect(r.rows?.[0]?.[0]).toBe(4336)
})

test('S9 render completed -> TSV table with columns + rows + count', () => {
  const def = registerTool()
  const out = def.output.render(
    { sql: 'SELECT 1', scope_id: 's' },
    { state: 'completed', sql: 'SELECT 1', columns: ['dau'], rows: [[4336], [7]], rowCount: 2 },
  )
  expect(out[0]?.type).toBe('text')
  expect(out[0]?.text).toContain('dau')
  expect(out[0]?.text).toContain('4336')
  expect(out[0]?.text).toContain('2 rows')
})

test('S9b render completed with result_id -> includes result_id line', () => {
  const def = registerTool()
  const out = def.output.render(
    { sql: 'SELECT 1', scope_id: 's' },
    { state: 'completed', sql: 'SELECT 1', columns: ['dau'], rows: [[4336]], rowCount: 1, result_id: 'qr_abc123def456' },
  )
  expect(out[0]?.text).toContain('result_id: qr_abc123def456')
  expect(out[0]?.text).toContain('dau')
  expect(out[0]?.text).toContain('4336')
})

test('S10 render completed display-caps rows (maxDisplayRows)', () => {
  let def: ToolDef | undefined
  const ctx = {
    tools: { register: (d: ToolDef) => { def = d } },
    get: () => undefined,
  } as unknown as Context
  apply(ctx, { maxDisplayRows: 1 })
  if (def === undefined) throw new Error('apply did not register a tool')
  const out = def.output.render(
    { sql: 'S', scope_id: 's' },
    { state: 'completed', sql: 'S', columns: ['c'], rows: [[1], [2], [3]], rowCount: 3 },
  )
  expect(out[0]?.text).toContain('2 more rows elided')
  expect(out[0]?.text).toContain('3 rows')
})

test('S11 render failed -> error text', () => {
  const def = registerTool()
  const out = def.output.render(
    { sql: 'S', scope_id: 's' },
    { state: 'failed', sql: 'S', error: 'bad table', failureKind: 'semantic' },
  )
  expect(out[0]?.text).toContain('Query failed (semantic): bad table')
})

test('S12 render pending -> still-running text', () => {
  const def = registerTool()
  const out = def.output.render(
    { sql: 'S', scope_id: 's' },
    { state: 'pending', sql: 'S', instanceId: 'job-9', stage: 'running', elapsedMs: 500 },
  )
  expect(out[0]?.text).toContain('still running')
  expect(out[0]?.text).toContain('job-9')
  expect(out[0]?.text).toContain('still pending')
})
