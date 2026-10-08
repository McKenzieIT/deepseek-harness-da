import { describe, test, expect, afterEach, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { apply } from '../src/llm-wiring-plugin.ts'

describe('CL8 — enrichment-llm-wiring provider/model resolution', () => {
  const savedProvider = process.env.ENRICHMENT_LLM_PROVIDER
  const savedModel = process.env.ENRICHMENT_LLM_MODEL

  afterEach(() => {
    delete process.env.ENRICHMENT_LLM_PROVIDER
    delete process.env.ENRICHMENT_LLM_MODEL
    if (savedProvider !== undefined) process.env.ENRICHMENT_LLM_PROVIDER = savedProvider
    if (savedModel !== undefined) process.env.ENRICHMENT_LLM_MODEL = savedModel
  })

  /** Minimal ctx mock capturing apply()'s schema.setLlmCall + logger.info/warn. */
  function mockApplyCtx(): { ctx: Context; logged: string[]; warned: string[]; setLlmCall: ReturnType<typeof vi.fn> } {
    const logged: string[] = []
    const warned: string[] = []
    const setLlmCall = vi.fn()
    const ctx = {
      schema: { setLlmCall },
      logger: {
        info: (m: string) => { logged.push(m) },
        warn: (m: string) => { warned.push(m) },
      },
    } as unknown as Context
    return { ctx, logged, warned, setLlmCall }
  }

  test('no config + no env → apply warns + skips wire (CB-1a α graceful degrade)', () => {
    const { ctx, warned, setLlmCall } = mockApplyCtx()
    expect(() => { apply(ctx, {}) }).not.toThrow()
    expect(setLlmCall).not.toHaveBeenCalled()
    expect(warned).toHaveLength(1)
    expect(warned[0]).toContain('enrichment-llm-wiring: no provider/model configured')
    expect(warned[0]).toContain('deterministic-only')
  })

  test('config.provider set but model unset → warns + skips wire (!model branch)', () => {
    const { ctx, warned, setLlmCall } = mockApplyCtx()
    expect(() => { apply(ctx, { provider: 'x' }) }).not.toThrow()
    expect(setLlmCall).not.toHaveBeenCalled()
    expect(warned).toHaveLength(1)
    expect(warned[0]).toContain('enrichment-llm-wiring: no provider/model configured')
    expect(warned[0]).toContain('deterministic-only')
  })

  test('config.model set but provider unset → warns + skips wire (!provider branch)', () => {
    const { ctx, warned, setLlmCall } = mockApplyCtx()
    expect(() => { apply(ctx, { model: 'm' }) }).not.toThrow()
    expect(setLlmCall).not.toHaveBeenCalled()
    expect(warned).toHaveLength(1)
    expect(warned[0]).toContain('enrichment-llm-wiring: no provider/model configured')
    expect(warned[0]).toContain('deterministic-only')
  })

  test('config.provider/model override env (no silent vendor fallback)', () => {
    process.env.ENRICHMENT_LLM_PROVIDER = 'envprov'
    process.env.ENRICHMENT_LLM_MODEL = 'envmodel'
    const { ctx, logged, setLlmCall } = mockApplyCtx()
    apply(ctx, { provider: 'cfgprov', model: 'cfgmodel' })
    expect(setLlmCall).toHaveBeenCalledTimes(1)
    expect(logged[0]).toContain('cfgprov/cfgmodel')
    expect(logged[0]).not.toContain('aga')
    expect(logged[0]).not.toContain('qwen3.7-max')
  })

  test('env vars used when config empty', () => {
    process.env.ENRICHMENT_LLM_PROVIDER = 'envprov'
    process.env.ENRICHMENT_LLM_MODEL = 'envmodel'
    const { ctx, logged, setLlmCall } = mockApplyCtx()
    apply(ctx, {})
    expect(setLlmCall).toHaveBeenCalledTimes(1)
    expect(logged[0]).toContain('envprov/envmodel')
  })
})
