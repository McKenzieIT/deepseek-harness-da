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

  test('opts.provider set but model unset + no env model → throws enrichment-llm-wiring (!model branch)', async () => {
    process.env.ENRICHMENT_LLM_PROVIDER = 'x'
    delete process.env.ENRICHMENT_LLM_MODEL
    // opts provider 'p' wins; model missing everywhere → throws via !model.
    await expect(expandQuery(ctxWithLlm(), 'q', { provider: 'p' })).rejects.toThrow('enrichment-llm-wiring')
  })

  test('opts.model set but provider unset + no env provider → throws enrichment-llm-wiring (!provider branch)', async () => {
    delete process.env.ENRICHMENT_LLM_PROVIDER
    process.env.ENRICHMENT_LLM_MODEL = 'm'
    // opts model 'm' wins; provider missing everywhere → throws via !provider.
    await expect(expandQuery(ctxWithLlm(), 'q', { model: 'm' })).rejects.toThrow('enrichment-llm-wiring')
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

  /** A ctx whose ctx.get('llm') streams the given chunks (or throws). */
  function ctxStreaming(stream: (options: unknown) => AsyncIterable<unknown>): Context {
    return { get: (key: string) => (key === 'llm' ? { stream } : undefined) } as unknown as Context
  }

  test('non-empty text stream → the assembled expansion (reasoning dropped, newlines collapsed)', async () => {
    process.env.ENRICHMENT_LLM_PROVIDER = 'envprov'
    process.env.ENRICHMENT_LLM_MODEL = 'envmodel'
    // Two text deltas on index 0 accumulate into one text block; the reasoning
    // block on index 1 must be filtered out of the BM25 query, and the newline
    // inside the text must collapse to a space (BM25 takes a single line).
    const stream = async function* (): AsyncIterable<unknown> {
      yield { type: 'text-delta', index: 0, text: 'ARPPU 人均付费\n' }
      yield { type: 'text-delta', index: 0, text: 'pay_amt acc_summary' }
      yield { type: 'reasoning-delta', index: 1, text: '先想一下这个指标' }
    }
    const out = await expandQuery(ctxStreaming(stream), 'ARPPU是多少')
    expect(out).toBe('ARPPU 人均付费 pay_amt acc_summary')
  })

  test('LLM stream error mid-stream → degrades to the original question', async () => {
    process.env.ENRICHMENT_LLM_PROVIDER = 'envprov'
    process.env.ENRICHMENT_LLM_MODEL = 'envmodel'
    // The partial delta is discarded: a broken expansion round-trip must not
    // leak a truncated query into BM25 — the original question is used instead.
    const stream = async function* (): AsyncIterable<unknown> {
      yield { type: 'text-delta', index: 0, text: '钻石 产出量' }
      throw new Error('llm transport reset')
    }
    const out = await expandQuery(ctxStreaming(stream), '钻石的总产出量')
    expect(out).toBe('钻石的总产出量')
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

describe('P15a — config.queryExpansion gates the LLM rewrite', () => {
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
    readonly execute: (
      args: { readonly query: string; readonly top_k?: number },
      exec: { readonly signal: AbortSignal },
    ) => Promise<{ readonly candidates: SearchHit[] }>
  }

  /**
   * Register the tool over a ctx whose `llm` rewrites every question to
   * `dws_expanded_target` and whose `schema` corpus contains only that id — so
   * the returned candidate list alone reveals whether expansion ran, without
   * spying on the LLM.
   */
  function registerWithExpandingLlm(config: Parameters<typeof apply>[1]): ToolDef {
    const stream = async function* (): AsyncIterable<unknown> {
      yield { type: 'text-delta', index: 0, text: 'dws_expanded_target' }
    }
    const mockSchema = {
      loadRetrievalCorpus: () => [
        { id: 'dws_expanded_target', description: 'reachable only via the rewritten query', metrics: {} },
      ],
    }
    let def: ToolDef | undefined
    const ctx = {
      tools: { register: (d: ToolDef) => { def = d } },
      get: (key: string) => (key === 'llm' ? { stream } : key === 'schema' ? mockSchema : undefined),
    } as unknown as Context
    apply(ctx, config)
    if (def === undefined) throw new Error('apply did not register a tool')
    return def
  }

  test('default queryExpansion → BM25 searches the LLM-expanded query', async () => {
    process.env.ENRICHMENT_LLM_PROVIDER = 'envprov'
    process.env.ENRICHMENT_LLM_MODEL = 'envmodel'
    const def = registerWithExpandingLlm({})
    // 'zzz' matches nothing in the corpus; the rewritten 'dws_expanded_target' does.
    const out = await def.execute({ query: 'zzz' }, { signal: new AbortController().signal })
    expect(out.candidates.map(c => c.id)).toEqual(['dws_expanded_target'])
  })

  test('queryExpansion=false → BM25 searches the original query (LLM never consulted)', async () => {
    process.env.ENRICHMENT_LLM_PROVIDER = 'envprov'
    process.env.ENRICHMENT_LLM_MODEL = 'envmodel'
    const def = registerWithExpandingLlm({ queryExpansion: false })
    // Expansion is skipped, so BM25 still sees 'zzz' -> no candidate at all.
    const out = await def.execute({ query: 'zzz' }, { signal: new AbortController().signal })
    expect(out.candidates).toEqual([])
  })
})
