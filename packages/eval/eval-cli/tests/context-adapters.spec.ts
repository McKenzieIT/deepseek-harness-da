/**
 * The four adapter classes in `src/context.ts` that bridge a Cordis `ctx` to the
 * engine / eval-runner ports. Each is driven against a real `Context` with the
 * one service it reads stubbed via `ctx.provide(...)` — the same seam
 * eval-runner-service.spec.ts uses to drive the real engine (its adapter reads
 * `ctx.llm.stream` at src/index.ts:115, identically to CtxLlmAdapter here).
 *
 *  - `CtxLlmAdapter` is the one with real branching: a thinking model puts SQL in
 *    either the text block or the reasoning block, and this adapter has to pick.
 *    Every branch of `completeWithReasoning` is pinned — SQL in text, a ```sql
 *    fence inside reasoning, bare SQL in reasoning, conversational text with
 *    unrelated reasoning, text with no reasoning, and the empty-response warn.
 *  - `CtxOdpsAdapter` / `CtxQueryExecutor` both decline with a named failure when
 *    no query provider is mounted, and otherwise thread `{scopeId, mode:'fast'}`
 *    through to the provider; the outcome remap is `toEngineOutcome`'s job (tested
 *    in context-pure), so here we pin the no-provider guard, the scopeId
 *    threading, and — for CtxQueryExecutor — the done/completed success shapes and
 *    the thrown-error catch (Error and non-Error alike).
 *  - `LlmJudgeExecutor` parses a single number out of the judge LLM's reply,
 *    clamps it to [0,1], treats an unparseable reply as 0, and reports a thrown
 *    LLM as {score:0, error}.
 *
 * Run: npx vitest run packages/eval/eval-cli/tests/context-adapters.spec.ts
 */
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import {
  CtxLlmAdapter,
  CtxOdpsAdapter,
  CtxQueryExecutor,
  LlmJudgeExecutor,
} from '../src/context.ts'

/** A stub `ctx.llm.stream` yielding a text block and/or a reasoning block, then finish. */
function streamOf(parts: { text?: string; reasoning?: string }) {
  const chunks: StreamChunk[] = []
  let index = 0
  if (parts.text !== undefined) {
    chunks.push({ type: 'block-start', index, blockType: 'text' })
    chunks.push({ type: 'text-delta', index, text: parts.text })
    chunks.push({ type: 'block-end', index, block: { type: 'text', text: parts.text } })
    index++
  }
  if (parts.reasoning !== undefined) {
    chunks.push({ type: 'block-start', index, blockType: 'reasoning' })
    chunks.push({ type: 'reasoning-delta', index, text: parts.reasoning })
    chunks.push({ type: 'block-end', index, block: { type: 'reasoning', text: parts.reasoning } })
    index++
  }
  chunks.push({ type: 'finish', reason: { kind: 'stop' } })
  return async function* (): AsyncIterable<StreamChunk> {
    for (const chunk of chunks) yield chunk
  }
}

/** A `Context` whose `llm` service streams the given blocks. */
function llmCtx(parts: { text?: string; reasoning?: string }): Context {
  const ctx = new Context()
  ;(ctx as unknown as { provide(k: string, v: unknown): void }).provide('llm', { stream: streamOf(parts) })
  return ctx
}

/** A `Context` whose `llm.stream` throws `value` when called — models a transport failure. */
function throwingLlmCtx(value: unknown): Context {
  const ctx = new Context()
  ;(ctx as unknown as { provide(k: string, v: unknown): void }).provide('llm', {
    stream: () => { throw value },
  })
  return ctx
}

/** A `Context` whose `query` service is the given stub. */
function queryCtx(query: unknown): Context {
  const ctx = new Context()
  ;(ctx as unknown as { provide(k: string, v: unknown): void }).provide('query', query)
  return ctx
}

const adapter = (ctx: Context) => new CtxLlmAdapter(ctx, 'aga', 'qwen3.7-max')

describe('CtxLlmAdapter.generate', () => {
  it('throws when the engine passed no prompt', async () => {
    await expect(adapter(llmCtx({ text: 'x' })).generate({ question: 'q' }))
      .rejects.toThrow('CtxLlmAdapter: engine did not pass a prompt')
  })

  it('throws when the engine passed an empty prompt', async () => {
    await expect(adapter(llmCtx({ text: 'x' })).generate({ question: 'q', prompt: '' }))
      .rejects.toThrow('CtxLlmAdapter: engine did not pass a prompt')
  })

  it('returns the resolved text as sql for a real prompt', async () => {
    const out = await adapter(llmCtx({ text: 'SELECT 1 AS total' })).generate({ question: 'q', prompt: 'ask' })
    expect(out).toEqual({ sql: 'SELECT 1 AS total' })
  })
})

describe('CtxLlmAdapter.completeText', () => {
  it('returns just the text, dropping the reasoning', async () => {
    expect(await adapter(llmCtx({ text: 'SELECT 2' })).completeText('p')).toBe('SELECT 2')
  })
})

describe('CtxLlmAdapter.completeWithReasoning — SQL is in the text block', () => {
  it('returns the text verbatim when it already looks like SQL', async () => {
    expect(await adapter(llmCtx({ text: 'SELECT 1 FROM t' })).completeWithReasoning('p'))
      .toEqual({ text: 'SELECT 1 FROM t', reasoning: null })
  })
})

describe('CtxLlmAdapter.completeWithReasoning — text is prose, SQL is in the reasoning', () => {
  it('extracts a ```sql fenced block out of the reasoning', async () => {
    const reasoning = 'Let me think.\n```sql\nSELECT 3 FROM pay\n```\nDone.'
    expect(await adapter(llmCtx({ text: '这是你要的查询：', reasoning })).completeWithReasoning('p'))
      .toEqual({ text: 'SELECT 3 FROM pay\n', reasoning })
  })

  it('takes bare SQL from the reasoning when there is no fence', async () => {
    const reasoning = 'SELECT 4 FROM dws_pay_day'
    expect(await adapter(llmCtx({ text: 'here is the answer', reasoning })).completeWithReasoning('p'))
      .toEqual({ text: 'SELECT 4 FROM dws_pay_day', reasoning })
  })

  it('keeps the conversational text when the reasoning is not SQL either', async () => {
    expect(await adapter(llmCtx({ text: 'I need more detail', reasoning: 'user asked something vague' })).completeWithReasoning('p'))
      .toEqual({ text: 'I need more detail', reasoning: 'user asked something vague' })
  })

  it('keeps the text when there is no reasoning block at all', async () => {
    expect(await adapter(llmCtx({ text: 'no sql here' })).completeWithReasoning('p'))
      .toEqual({ text: 'no sql here', reasoning: null })
  })
})

describe('CtxLlmAdapter.completeWithReasoning — no text block', () => {
  it('extracts a fenced block from reasoning-only output', async () => {
    const reasoning = 'thinking\n```sql\nSELECT 5\n```'
    expect(await adapter(llmCtx({ reasoning })).completeWithReasoning('p'))
      .toEqual({ text: 'SELECT 5\n', reasoning })
  })

  it('returns the whole reasoning when it is unfenced', async () => {
    expect(await adapter(llmCtx({ reasoning: 'SELECT 6 FROM t' })).completeWithReasoning('p'))
      .toEqual({ text: 'SELECT 6 FROM t', reasoning: 'SELECT 6 FROM t' })
  })

  it('warns and returns an empty result when the model emitted nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(await adapter(llmCtx({})).completeWithReasoning('p')).toEqual({ text: '', reasoning: null })
      expect(warn).toHaveBeenCalledWith('eval-cli: LLM returned no content (no text blocks, no reasoning)')
    } finally {
      warn.mockRestore()
    }
  })
})

describe('CtxOdpsAdapter', () => {
  it('declines execute with permission_denied when no query provider is mounted', async () => {
    const out = await new CtxOdpsAdapter(new Context(), 'k11').execute('SELECT 1')
    expect(out).toEqual({ state: 'failed', failureKind: 'permission_denied', error: 'no query provider mounted', sql: 'SELECT 1' })
  })

  it('declines attach with permission_denied when no query provider is mounted', async () => {
    const out = await new CtxOdpsAdapter(new Context(), 'k11').attach('inst-1')
    expect(out).toEqual({ state: 'failed', failureKind: 'permission_denied', error: 'no query provider mounted', sql: '' })
  })

  it('threads sql + scopeId + mode and the abort signal into the provider, then remaps the outcome', async () => {
    const seen: Array<{ req: unknown; signal: unknown }> = []
    const signal = new AbortController().signal
    const ctx = queryCtx({
      execute: async (req: unknown, sig: unknown) => { seen.push({ req, signal: sig }); return { state: 'completed', rows: [{ n: 1 }], instanceId: 'i-9', sql: 'SELECT 1' } },
      attach: async () => ({ state: 'completed' }),
    })
    const out = await new CtxOdpsAdapter(ctx, 'scope-x').execute('SELECT 1', { signal })
    expect(seen).toEqual([{ req: { sql: 'SELECT 1', scopeId: 'scope-x', mode: 'fast' }, signal }])
    expect(out).toEqual({ state: 'done', rows: [{ n: 1 }], result_id: 'i-9', sql: 'SELECT 1' })
  })

  it('remaps a provider attach outcome', async () => {
    const ctx = queryCtx({
      execute: async () => ({ state: 'completed' }),
      attach: async (id: string) => ({ state: 'pending', instanceId: id, stage: 'Running', sql: 'SELECT 2' }),
    })
    expect(await new CtxOdpsAdapter(ctx, 'k11').attach('inst-77'))
      .toEqual({ state: 'running', instance_id: 'inst-77', stage: 'Running', sql: 'SELECT 2' })
  })
})

describe('CtxQueryExecutor', () => {
  it('returns a failure result when no query provider is mounted', async () => {
    expect(await new CtxQueryExecutor(new Context(), 'k11').execute('SELECT 1'))
      .toEqual({ success: false, rows: [], row_count: 0, error: 'no query provider mounted' })
  })

  it('threads scopeId and returns rows on a done outcome', async () => {
    const seen: unknown[] = []
    const ctx = queryCtx({ execute: async (req: unknown) => { seen.push(req); return { state: 'done', rows: [{ a: 1 }, { a: 2 }] } } })
    const out = await new CtxQueryExecutor(ctx, 'scope-y').execute('SELECT a FROM t')
    expect(seen).toEqual([{ sql: 'SELECT a FROM t', scopeId: 'scope-y', mode: 'fast' }])
    expect(out).toEqual({ success: true, rows: [{ a: 1 }, { a: 2 }], row_count: 2, error: null })
  })

  it('treats a completed outcome as success too, defaulting absent rows to empty', async () => {
    const ctx = queryCtx({ execute: async () => ({ state: 'completed' }) })
    expect(await new CtxQueryExecutor(ctx, 'k11').execute('SELECT 1'))
      .toEqual({ success: true, rows: [], row_count: 0, error: null })
  })

  it('reports the provider error string on a non-success outcome', async () => {
    const ctx = queryCtx({ execute: async () => ({ state: 'failed', error: 'ODPS-1: boom' }) })
    expect(await new CtxQueryExecutor(ctx, 'k11').execute('SELECT 1'))
      .toEqual({ success: false, rows: [], row_count: 0, error: 'ODPS-1: boom' })
  })

  it('falls back to a generic message when a non-success outcome carries no error', async () => {
    const ctx = queryCtx({ execute: async () => ({ state: 'failed' }) })
    expect(await new CtxQueryExecutor(ctx, 'k11').execute('SELECT 1'))
      .toEqual({ success: false, rows: [], row_count: 0, error: 'query failed' })
  })

  it('catches a thrown Error and reports its message', async () => {
    const ctx = queryCtx({ execute: async () => { throw new Error('connection reset') } })
    expect(await new CtxQueryExecutor(ctx, 'k11').execute('SELECT 1'))
      .toEqual({ success: false, rows: [], row_count: 0, error: 'connection reset' })
  })

  it('catches a thrown non-Error and stringifies it', async () => {
    const ctx = queryCtx({ execute: async () => { throw 'raw failure' } })
    expect(await new CtxQueryExecutor(ctx, 'k11').execute('SELECT 1'))
      .toEqual({ success: false, rows: [], row_count: 0, error: 'raw failure' })
  })
})

describe('LlmJudgeExecutor', () => {
  const judge = (ctx: Context) => new LlmJudgeExecutor(adapter(ctx))

  it('parses a plain number and passes it through', async () => {
    const out = await judge(llmCtx({ text: '0.85' })).judge({ points: ['x'] }, 'the answer', 'the question')
    expect(out).toEqual({ score: 0.85, rationale: '0.85' })
  })

  it('clamps a number above 1 down to 1', async () => {
    expect((await judge(llmCtx({ text: 'Score: 1.5' })).judge('exp', 'act', 'q')).score).toBe(1)
  })

  it('scores an unparseable reply as 0', async () => {
    const out = await judge(llmCtx({ text: 'not a number' })).judge('exp', 'act', 'q')
    expect(out.score).toBe(0)
    expect(out.rationale).toBe('not a number')
  })

  it('reports a thrown Error as score 0 with the error message and empty rationale', async () => {
    expect(await judge(throwingLlmCtx(new Error('judge llm down'))).judge('exp', 'act', 'q'))
      .toEqual({ score: 0, rationale: '', error: 'judge llm down' })
  })

  it('stringifies a thrown non-Error from the judge LLM', async () => {
    expect(await judge(throwingLlmCtx('raw judge failure')).judge('exp', 'act', 'q'))
      .toEqual({ score: 0, rationale: '', error: 'raw judge failure' })
  })
})
