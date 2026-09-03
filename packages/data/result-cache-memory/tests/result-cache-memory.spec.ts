import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool, type JsonValue } from '@deepseek-ai/dsh-tools'
import type { ResultEntry } from '@deepseek-ai/dsh-result-cache'
import { apply, generateQueryResultId, MemoryResultCache } from '@deepseek-ai/dsh-result-cache-memory'

const testSignal = new AbortController().signal

async function setup() {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(apply)
  return ctx
}

function queryDataTool(result: Record<string, JsonValue>) {
  return defineTool({
    name: 'query_data',
    description: 'execute SQL',
    parameters: {
      sql: { type: 'string', required: true },
      scope_id: { type: 'string', required: true },
    },
    output: {
      schema: { type: 'object', additionalProperties: true, properties: { state: { type: 'string' } } },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute() {
      return result
    },
  })
}

describe('MemoryResultCache (direct)', () => {
  it('get returns undefined for missing id', async () => {
    const ctx = new Context()
    const cache = new MemoryResultCache(ctx)
    expect(cache.get('qr_nonexistent')).toBeUndefined()
  })

  it('has returns false for missing id', async () => {
    const ctx = new Context()
    const cache = new MemoryResultCache(ctx)
    expect(cache.has('qr_nonexistent')).toBe(false)
  })

  it('put then get returns the entry', async () => {
    const ctx = new Context()
    const cache = new MemoryResultCache(ctx)
    const entry: ResultEntry = {
      columns: ['a', 'b'],
      rows: [[1, 'x'], [2, 'y']],
      metadata: { sql: 'SELECT a, b FROM t' },
    }
    cache.put('qr_abc123', entry)
    expect(cache.get('qr_abc123')).toEqual(entry)
    expect(cache.has('qr_abc123')).toBe(true)
  })

  it('put is idempotent for the same entry', async () => {
    const ctx = new Context()
    const cache = new MemoryResultCache(ctx)
    const entry: ResultEntry = {
      columns: ['col'],
      rows: [['val']],
    }
    cache.put('qr_dup', entry)
    cache.put('qr_dup', entry)
    expect(cache.get('qr_dup')).toEqual(entry)
  })

  it('put throws on conflicting entry for existing id', async () => {
    const ctx = new Context()
    const cache = new MemoryResultCache(ctx)
    cache.put('cr_conflict', { columns: ['a'], rows: [[1]] })
    expect(() =>{  cache.put('cr_conflict', { columns: ['b'], rows: [[2]] }) }).toThrow(
      /cannot overwrite result_id "cr_conflict" with a different entry/,
    )
  })
})

describe('generateQueryResultId', () => {
  it('produces a qr_ prefix with a 12-char hex hash', () => {
    const id = generateQueryResultId('SELECT 1')
    expect(id).toMatch(/^qr_[0-9a-f]{12}$/)
  })

  it('is deterministic for the same SQL', () => {
    expect(generateQueryResultId('SELECT x FROM t')).toBe(generateQueryResultId('SELECT x FROM t'))
  })

  it('differs for different SQL', () => {
    expect(generateQueryResultId('SELECT a')).not.toBe(generateQueryResultId('SELECT b'))
  })
})

describe('tools/post-execute hook', () => {
  it('captures completed query_data results and injects result_id', async () => {
    const ctx = await setup()
    ctx.tools.register(queryDataTool({
      state: 'completed',
      sql: 'SELECT x FROM t WHERE ds=1',
      columns: ['x'],
      rows: [[42]],
      rowCount: 1,
    }))

    const result = await ctx.tools.execute({
      signal: testSignal,
      callId: CallId('c1'),
      name: 'query_data',
      arguments: { sql: 'SELECT x FROM t WHERE ds=1', scope_id: 'game-1' },
    })

    expect(result.isError).toBe(false)
    const value = result.value as Record<string, unknown>
    expect(value.result_id).toMatch(/^qr_[0-9a-f]{12}$/)

    const cached = ctx.resultCache.get(value.result_id as string)
    expect(cached).toBeDefined()
    expect(cached!.columns).toEqual(['x'])
    expect(cached!.rows).toEqual([[42]])
    expect(cached!.metadata?.sql).toBe('SELECT x FROM t WHERE ds=1')
  })

  it('overwrites (no isError) when the same SQL re-runs with changed rows', async () => {
    const ctx = await setup()
    const sql = 'SELECT x FROM t WHERE ds=1'
    // first run: row [42]
    ctx.tools.register(queryDataTool({ state: 'completed', sql, columns: ['x'], rows: [[42]], rowCount: 1 }))
    const r1 = await ctx.tools.execute({ signal: testSignal, callId: CallId('re-1'), name: 'query_data', arguments: { sql, scope_id: 'game-1' } })
    expect(r1.isError).toBe(false)
    const id1 = (r1.value as Record<string, unknown>).result_id as string
    expect(ctx.resultCache.get(id1)?.rows).toEqual([[42]])

    // second run, SAME sql, DIFFERENT rows (data changed)
    ctx.tools.register(queryDataTool({ state: 'completed', sql, columns: ['x'], rows: [[99]], rowCount: 1 }))
    const r2 = await ctx.tools.execute({ signal: testSignal, callId: CallId('re-2'), name: 'query_data', arguments: { sql, scope_id: 'game-1' } })
    expect(r2.isError).toBe(false)               // D8-2: must NOT error
    const id2 = (r2.value as Record<string, unknown>).result_id as string
    expect(id2).toBe(id1)                          // same SQL -> same qr_ id
    expect(ctx.resultCache.get(id2)?.rows).toEqual([[99]])  // fresh, not stale
  })

  it('does not capture failed query_data results', async () => {
    const ctx = await setup()
    ctx.tools.register(queryDataTool({
      state: 'failed',
      sql: 'SELECT bad',
      error: 'TABLE_NOT_FOUND',
      failureKind: 'not_found',
    }))

    const result = await ctx.tools.execute({
      signal: testSignal,
      callId: CallId('c2'),
      name: 'query_data',
      arguments: { sql: 'SELECT bad', scope_id: 'game-1' },
    })

    expect(result.isError).toBe(false)
    const value = result.value as Record<string, unknown>
    expect(value.result_id).toBeUndefined()
  })

  it('does not capture pending query_data results', async () => {
    const ctx = await setup()
    ctx.tools.register(queryDataTool({
      state: 'pending',
      sql: 'SELECT slow',
      instanceId: 'inst-1',
    }))

    const result = await ctx.tools.execute({
      signal: testSignal,
      callId: CallId('c3'),
      name: 'query_data',
      arguments: { sql: 'SELECT slow', scope_id: 'game-1' },
    })

    expect(result.isError).toBe(false)
    const value = result.value as Record<string, unknown>
    expect(value.result_id).toBeUndefined()
  })

  it('does not interfere with non-query_data tools', async () => {
    const ctx = await setup()
    ctx.tools.register(defineTool({
      name: 'other_tool',
      description: 'unrelated',
      parameters: {},
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute() { return 'hello' },
    }))

    const result = await ctx.tools.execute({
      signal: testSignal,
      callId: CallId('c4'),
      name: 'other_tool',
      arguments: {},
    })

    expect(result.isError).toBe(false)
    expect(result.value).toBe('hello')
  })

  it('stores metadata including truncated and row_count', async () => {
    const ctx = await setup()
    ctx.tools.register(queryDataTool({
      state: 'completed',
      sql: 'SELECT * FROM big_table',
      columns: ['id', 'name'],
      rows: [[1, 'a'], [2, 'b']],
      rowCount: 10000,
      truncated: true,
    }))

    const result = await ctx.tools.execute({
      signal: testSignal,
      callId: CallId('c5'),
      name: 'query_data',
      arguments: { sql: 'SELECT * FROM big_table', scope_id: 'game-1' },
    })

    const value = result.value as Record<string, unknown>
    const cached = ctx.resultCache.get(value.result_id as string)
    expect(cached!.metadata?.truncated).toBe(true)
    expect(cached!.metadata?.row_count).toBe(10000)
  })

  it('ctx.resultCache.put stores compute-derived results with cr_ prefix', async () => {
    const ctx = await setup()

    const entry: ResultEntry = {
      columns: ['metric', 'value'],
      rows: [['dau', 1500], ['mau', 8000]],
      metadata: { sql: 'derived from qr_abc' },
    }
    ctx.resultCache.put('cr_compute123', entry)

    expect(ctx.resultCache.get('cr_compute123')).toEqual(entry)
    expect(ctx.resultCache.has('cr_compute123')).toBe(true)
  })
})

describe('query_data → resultCache → compute integration', () => {
  it('compute can retrieve data stored by query_data post-execute hook', async () => {
    const ctx = await setup()

    const completedRows: JsonValue[][] = [['2024-01-01', 100], ['2024-01-02', 200]]
    const completedColumns = ['date', 'dau']
    const sql = 'SELECT date, dau FROM t_dau WHERE ds >= 20240101'

    ctx.tools.register(queryDataTool({
      state: 'completed',
      sql,
      columns: completedColumns,
      rows: completedRows,
      rowCount: 2,
    }))

    const queryResult = await ctx.tools.execute({
      signal: testSignal,
      callId: CallId('int-1'),
      name: 'query_data',
      arguments: { sql, scope_id: 'game-1' },
    })

    expect(queryResult.isError).toBe(false)
    const queryValue = queryResult.value as Record<string, unknown>
    const resultId = queryValue.result_id as string
    expect(resultId).toBeDefined()
    expect(resultId).toMatch(/^qr_[0-9a-f]{12}$/)

    // Simulate what compute tool does: ctx.resultCache.has + ctx.resultCache.get
    expect(ctx.resultCache.has(resultId)).toBe(true)
    const cached = ctx.resultCache.get(resultId)!
    expect(cached.columns).toEqual(completedColumns)
    expect(cached.rows).toEqual(completedRows)
    expect(cached.metadata?.sql).toBe(sql)
  })

  it('deterministic result_id: same SQL produces same cache key', async () => {
    const ctx = await setup()
    const sql = 'SELECT x FROM t'

    ctx.tools.register(queryDataTool({
      state: 'completed',
      sql,
      columns: ['x'],
      rows: [[1]],
      rowCount: 1,
    }))

    const r1 = await ctx.tools.execute({
      signal: testSignal,
      callId: CallId('det-1'),
      name: 'query_data',
      arguments: { sql, scope_id: 'game-1' },
    })

    const id1 = (r1.value as Record<string, unknown>).result_id as string
    expect(id1).toBe(generateQueryResultId(sql))
  })
})
