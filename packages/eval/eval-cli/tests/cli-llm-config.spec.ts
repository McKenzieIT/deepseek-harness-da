/**
 * CL8 — eval-cli responder LLM config tests.
 *
 * Verifies the silent 'aga'/'qwen3.7-max' vendor fallback is gone: the CLI
 * resolver resolves provider/model from input → env-var contract and throws
 * when unconfigured (fail-loud). eval-cli's --provider/--model feeds the eval
 * responder + SQL judge (the model under test), NOT the enrichment LLM — so
 * it uses the EVAL_LLM_* env contract (not ENRICHMENT_LLM_*).
 *
 * Run: `npx vitest run packages/eval/eval-cli/tests/cli-llm-config.spec.ts`
 */
import { describe, test, expect, afterEach } from 'vitest'
import { resolveResponderLlmConfig } from '../src/main.ts'

describe('CL8 — eval-cli responder provider/model resolution', () => {
  const savedProvider = process.env.EVAL_LLM_PROVIDER
  const savedModel = process.env.EVAL_LLM_MODEL

  afterEach(() => {
    delete process.env.EVAL_LLM_PROVIDER
    delete process.env.EVAL_LLM_MODEL
    if (savedProvider !== undefined) process.env.EVAL_LLM_PROVIDER = savedProvider
    if (savedModel !== undefined) process.env.EVAL_LLM_MODEL = savedModel
  })

  test('no input + no env → throws eval-cli no responder error', () => {
    expect(() => {
      resolveResponderLlmConfig({})
    }).toThrow('eval-cli: no responder provider/model configured')
  })

  test('provider set but model unset + no env model → throws (!model branch)', () => {
    process.env.EVAL_LLM_PROVIDER = 'envprov'
    delete process.env.EVAL_LLM_MODEL
    expect(() => {
      resolveResponderLlmConfig({ provider: 'p' })
    }).toThrow('eval-cli: no responder provider/model configured')
  })

  test('model set but provider unset + no env provider → throws (!provider branch)', () => {
    delete process.env.EVAL_LLM_PROVIDER
    process.env.EVAL_LLM_MODEL = 'm'
    expect(() => {
      resolveResponderLlmConfig({ model: 'm' })
    }).toThrow('eval-cli: no responder provider/model configured')
  })

  test('env populated → resolver returns env values (no throw)', () => {
    process.env.EVAL_LLM_PROVIDER = 'envprov'
    process.env.EVAL_LLM_MODEL = 'envmodel'
    const { provider, model } = resolveResponderLlmConfig({})
    expect(provider).toBe('envprov')
    expect(model).toBe('envmodel')
  })

  test('--provider/--model override env', () => {
    process.env.EVAL_LLM_PROVIDER = 'envprov'
    process.env.EVAL_LLM_MODEL = 'envmodel'
    const { provider, model } = resolveResponderLlmConfig({ provider: 'myp', model: 'mym' })
    expect(provider).toBe('myp')
    expect(model).toBe('mym')
    expect(provider).not.toBe('envprov')
    expect(model).not.toBe('envmodel')
  })
})
