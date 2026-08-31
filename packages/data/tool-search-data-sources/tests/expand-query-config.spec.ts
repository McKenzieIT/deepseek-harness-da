/**
 * CL8 — expandQuery provider/model resolution tests.
 *
 * Verifies the silent 'aga'/'qwen-flash' vendor fallback is gone: expandQuery
 * resolves provider/model from opts → env-var contract and throws when
 * unconfigured (the call site in index.ts catches + degrades with a warn).
 *
 * Run: `npx vitest run packages/data/tool-search-data-sources/tests/expand-query-config.spec.ts`
 */
import { describe, test, expect, afterEach, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { expandQuery } from '../src/expand-query.ts'
import { apply } from '../src/index.ts'
import type { SearchHit } from '../src/index.ts'

describe('CL8 — expandQuery provider/model resolution', () => {
  const savedProvider = process.env.ENRICHMENT_LLM_PROVIDER
  const savedModel = process.env.ENRICHMENT_LLM_MODEL

  afterEach(() => {
    delete process.env.ENRICHMENT_LLM_PROVIDER
    delete process.env.ENRICHMENT_LLM_MODEL
    if (savedProvider !== undefined) process.env.ENRICHMENT_LLM_PROVIDER = savedProvider
    if (savedModel !== undefined) process.env.ENRICHMENT_LLM_MODEL = savedModel
  })

  /** A ctx whose ctx.get('llm') returns a stream-capturing mock LLM. */
  function ctxWithLlm(): Context {
    const stream = async function* (): AsyncIterable<unknown> {
      // yield nothing → expandQuery returns the original question
    }
    return {
      get: (key: string) => (key === 'llm' ? { stream } : undefined),
    } as unknown as Context
  }

  /** A ctx whose ctx.get('llm') returns a mock that captures stream options. */
  function ctxWithCapturingLlm(): { ctx: Context; captured: unknown[] } {
    const captured: unknown[] = []
    const stream = async function* (options: unknown): AsyncIterable<unknown> {
      captured.push(options)
    }
    return {
      ctx: { get: (key: string) => (key === 'llm' ? { stream } : undefined) } as unknown as Context,
      captured,
    }
  }

  test('no opts + no env → expandQuery throws enrichment-llm-wiring error', async () => {
    const ctx = ctxWithLlm()
    await expect(expandQuery(ctx, 'ARPPU是多少')).rejects.toThrow('enrichment-llm-wiring: no provider/model configured')
  })

  test('opts.provider/model are used (NOT the vendor defaults aga/qwen-flash)', async () => {
    process.env.ENRICHMENT_LLM_PROVIDER = 'envprov'
    process.env.ENRICHMENT_LLM_MODEL = 'envmodel'
    const { ctx, captured } = ctxWithCapturingLlm()
    const out = await expandQuery(ctx, 'ARPPU是多少', { provider: 'myp', model: 'mym' })
    expect(captured.length).toBe(1)
    const opts = captured[0] as { provider: string; model: string }
    expect(opts.provider).toBe('myp')
    expect(opts.model).toBe('mym')
    expect(opts.provider).not.toBe('aga')
    expect(opts.model).not.toBe('qwen-flash')
    // empty stream → returns original question
    expect(out).toBe('ARPPU是多少')
  })

  test('env vars used when opts empty', async () => {
    process.env.ENRICHMENT_LLM_PROVIDER = 'envprov'
    process.env.ENRICHMENT_LLM_MODEL = 'envmodel'
    const { ctx, captured } = ctxWithCapturingLlm()
    await expandQuery(ctx, 'ARPPU是多少')
    const opts = captured[0] as { provider: string; model: string }
    expect(opts.provider).toBe('envprov')
    expect(opts.model).toBe('envmodel')
  })

  test('no LLM mounted → returns original question (no throw)', async () => {
    const ctx = { get: () => undefined } as unknown as Context
    const out = await expandQuery(ctx, 'ARPPU是多少')
    expect(out).toBe('ARPPU是多少')
  })
})

describe('CL8 — index.ts execute degrades on missing provider/model', () => {
  const savedProvider = process.env.ENRICHMENT_LLM_PROVIDER
  const savedModel = process.env.ENRICHMENT_LLM_MODEL

  afterEach(() => {
    delete process.env.ENRICHMENT_LLM_PROVIDER
    delete process.env.ENRICHMENT_LLM_MODEL
    if (savedProvider !== undefined) process.env.ENRICHMENT_LLM_PROVIDER = savedProvider
    if (savedModel !== undefined) process.env.ENRICHMENT_LLM_MODEL = savedModel
  })

  /** The subset of the registered tool definition these tests exercise. */
  interface ToolDef {
    readonly name: string
    readonly execute: (
      args: { readonly query: string; readonly top_k?: number },
      exec: { readonly signal: AbortSignal },
    ) => Promise<{ readonly candidates: SearchHit[] }>
  }

  /**
   * Register the tool with a ctx that HAS ctx.llm mounted (so expandQuery gets
   * past the llm probe) but no provider/model config + no env → expandQuery
   * throws the config error → the call-site catch degrades + warns.
   */
  function registerToolWithLlm(): ToolDef {
    let def: ToolDef | undefined
    // ctx.llm present (stream is a function) so expandQuery proceeds to the
    // resolver, which throws (no provider/model). stream is never called.
    const ctx = {
      tools: { register: (d: ToolDef) => { def = d } },
      get: (key: string) => (key === 'llm' ? { stream: () => {} } : undefined),
    } as unknown as Context
    apply(ctx, {})
    if (def === undefined) throw new Error('apply did not register a tool')
    return def
  }

  test('execute degrades to original query + warns when provider/model unconfigured', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const def = registerToolWithLlm()
      // expansionEnabled defaults true; expandQuery throws the config error;
      // the index.ts catch degrades to args.query + console.warn.
      const out = await def.execute({ query: 'ARPPU是多少' }, { signal: new AbortController().signal })
      // BM25 on the empty thin-default corpus returns no candidates, but the
      // pipeline did NOT crash — it degraded.
      expect(out.candidates).toEqual([])
      expect(warnSpy).toHaveBeenCalledWith('enrichment-llm-wiring: no provider/model configured; skipping query expansion')
    } finally {
      warnSpy.mockRestore()
    }
  })
})
