import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import * as PresetAutojoin from '../src/index.ts'
import type { AutojoinPresetService } from '../src/index.ts'

/**
 * A plain mock satisfying {@link AutojoinPresetService}, for the listener
 * logic tests. The listener IS the `agent/created` handler (the factory
 * `apply` registers via `ctx.on('agent/created', createAutojoinListener(…))`),
 * so driving it directly exercises the exact resolve→mount→skip path the
 * event would drive — without the Cordis event/scope machinery, which the
 * repo's test-invariants host gates behind a built cordis vendor.
 */
function mockPresets(overrides: Partial<AutojoinPresetService> = {}): AutojoinPresetService & {
  resolve: ReturnType<typeof vi.fn>
  mount: ReturnType<typeof vi.fn>
  composedPreset: ReturnType<typeof vi.fn>
} {
  return {
    resolve: overrides.resolve ?? vi.fn().mockResolvedValue({ id: 'data-agent' }),
    mount: overrides.mount ?? vi.fn().mockResolvedValue(undefined),
    composedPreset: overrides.composedPreset ?? vi.fn().mockReturnValue(undefined),
  } as AutojoinPresetService & {
    resolve: ReturnType<typeof vi.fn>
    mount: ReturnType<typeof vi.fn>
    composedPreset: ReturnType<typeof vi.fn>
  }
}

describe('preset-autojoin listener logic (the agent/created handler)', () => {
  it('resolves the default preset and mounts it on the agent context (agent/created → presets.mount with default id)', async () => {
    const presets = mockPresets()
    const listener = PresetAutojoin.createAutojoinListener(presets)
    const agentCtx = new Context()

    await listener({ agent: { ctx: agentCtx } })

    expect(presets.composedPreset).toHaveBeenCalledWith(agentCtx)
    expect(presets.resolve).toHaveBeenCalledWith(undefined)
    expect(presets.mount).toHaveBeenCalledWith(agentCtx, 'data-agent')
  })

  it('skips joining when no default is configured (resolve throws)', async () => {
    const presets = mockPresets({ resolve: vi.fn().mockRejectedValue(new Error('unknown preset')) })
    const listener = PresetAutojoin.createAutojoinListener(presets)
    const agentCtx = new Context()

    await listener({ agent: { ctx: agentCtx } })

    expect(presets.composedPreset).toHaveBeenCalledWith(agentCtx)
    expect(presets.resolve).toHaveBeenCalledWith(undefined)
    expect(presets.mount).not.toHaveBeenCalled()
  })

  it('skips an agent whose setup already joined a preset (idempotent, no double-bind)', async () => {
    const presets = mockPresets({ composedPreset: vi.fn().mockReturnValue('data-agent') })
    const listener = PresetAutojoin.createAutojoinListener(presets)
    const agentCtx = new Context()

    await listener({ agent: { ctx: agentCtx } })

    expect(presets.composedPreset).toHaveBeenCalledWith(agentCtx)
    expect(presets.resolve).not.toHaveBeenCalled()
    expect(presets.mount).not.toHaveBeenCalled()
  })

  it('propagates a mount failure so the dispatch reports it and the agent runs bare', async () => {
    const mountError = new Error('broken composition')
    const presets = mockPresets({ mount: vi.fn().mockRejectedValue(mountError) })
    const listener = PresetAutojoin.createAutojoinListener(presets)
    const agentCtx = new Context()

    await expect(listener({ agent: { ctx: agentCtx } })).rejects.toBe(mountError)
    expect(presets.mount).toHaveBeenCalledWith(agentCtx, 'data-agent')
  })
})

describe('preset-autojoin plugin export shape', () => {
  it('is a Loader-safe function-plugin (no default export; name + inject declared)', () => {
    expect('default' in PresetAutojoin).toBe(false)
    expect(PresetAutojoin.name).toBe('preset-autojoin')
    expect(PresetAutojoin.inject).toEqual(['agentPresets'])
    expect(typeof PresetAutojoin.apply).toBe('function')
    expect(typeof PresetAutojoin.createAutojoinListener).toBe('function')
  })
})
