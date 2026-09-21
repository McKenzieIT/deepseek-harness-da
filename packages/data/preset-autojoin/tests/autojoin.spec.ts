import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Events } from '@deepseek-ai/cordis'
import * as PresetAutojoin from '../src/index.ts'
import type { AutojoinPresetService } from '../src/index.ts'

/**
 * The `agent/created` payload. The wrapper reads only `agent.ctx` (plus the
 * optional `agent.id` for the switch-state log line), so the tests below
 * dispatch a stand-in agent rather than standing up a real one.
 */
type AgentCreatedPayload = Parameters<Events['agent/created']>[0]

/**
 * Let every already-queued microtask run. The `agent/created` dispatch is
 * fire-and-forget, so the listener's resolve→mount chain settles after `emit`
 * returns; a macrotask turn drains it deterministically (the doubles below
 * resolve without I/O), which keeps these tests free of polling or retries.
 */
function flushMicrotasks(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

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

  it('reports a mount failure on the agent logger at ERROR before re-throwing it', async () => {
    const mountError = new Error('service leaked to the root realm')
    const presets = mockPresets({ mount: vi.fn().mockRejectedValue(mountError) })
    const listener = PresetAutojoin.createAutojoinListener(presets)
    const error = vi.fn()
    const agent = { ctx: { logger: { error } } as unknown as Context }

    await expect(listener({ agent })).rejects.toBe(mountError)

    // ERROR, not WARN: the fire-and-forget dispatch's own rejection report is
    // filtered at the default INFO threshold, so this call is the only signal.
    expect(error).toHaveBeenCalledWith(mountError)
  })
})

describe('preset-autojoin switch-state instrumentation', () => {
  it('records an in-flight switch under the agent session id when one is pending', async () => {
    const pendingSwitch = vi.fn().mockReturnValue(Promise.resolve({ id: 'data-agent' }))
    const presets = Object.assign(mockPresets(), { pendingSwitch })
    const debug = vi.fn()
    const listener = PresetAutojoin.createAutojoinListener(presets, { debug })
    const agent = { ctx: new Context(), id: 'session-7' }

    await listener({ agent })

    expect(pendingSwitch).toHaveBeenCalledWith('session-7')
    expect(debug).toHaveBeenCalledWith(
      'preset-autojoin: pendingSwitch=%s for session %s',
      'in-flight',
      'session-7',
    )
  })

  it('records a settled switch state when the roster has no switch pending for the session', async () => {
    const pendingSwitch = vi.fn().mockReturnValue(undefined)
    const presets = Object.assign(mockPresets(), { pendingSwitch })
    const debug = vi.fn()
    const listener = PresetAutojoin.createAutojoinListener(presets, { debug })
    const agent = { ctx: new Context(), id: 'session-9' }

    await listener({ agent })

    expect(pendingSwitch).toHaveBeenCalledWith('session-9')
    expect(debug).toHaveBeenCalledWith(
      'preset-autojoin: pendingSwitch=%s for session %s',
      'settled',
      'session-9',
    )
  })

  it('records settled for an unknown session when the roster exposes no pendingSwitch probe', async () => {
    const debug = vi.fn()
    const presets = mockPresets()
    const listener = PresetAutojoin.createAutojoinListener(presets, { debug })
    const agentCtx = new Context()

    // A roster without the probe (and an agent carrying neither session nor id)
    // must still join — the instrumentation is an observation, not a gate.
    await listener({ agent: { ctx: agentCtx } })

    expect(debug).toHaveBeenCalledWith(
      'preset-autojoin: pendingSwitch=%s for session %s',
      'settled',
      'unknown',
    )
    expect(presets.mount).toHaveBeenCalledWith(agentCtx, 'data-agent')
  })
})

describe('preset-autojoin apply (the agent/created wiring)', () => {
  it('joins the deployment default to an agent published on agent/created', async () => {
    const presets = mockPresets()
    const hostCtx = new Context()
    hostCtx.provide('agentPresets', presets as unknown as Context['agentPresets'])
    PresetAutojoin.apply(hostCtx)
    const agentCtx = { logger: { error: vi.fn() } } as unknown as Context

    hostCtx.emit('agent/created', { agent: { ctx: agentCtx } } as unknown as AgentCreatedPayload)
    await flushMicrotasks()

    expect(presets.resolve).toHaveBeenCalledWith(undefined)
    expect(presets.mount).toHaveBeenCalledWith(agentCtx, 'data-agent')
  })

  it('keeps a mount failure off the unhandled-rejection path (the dispatch does not await listeners)', async () => {
    const mountError = new Error('broken composition')
    const presets = mockPresets({ mount: vi.fn().mockRejectedValue(mountError) })
    const hostCtx = new Context()
    hostCtx.provide('agentPresets', presets as unknown as Context['agentPresets'])
    PresetAutojoin.apply(hostCtx)
    const error = vi.fn()
    const agentCtx = { logger: { error } } as unknown as Context
    const unhandled: unknown[] = []
    const capture = (reason: unknown): void => { unhandled.push(reason) }
    process.on('unhandledRejection', capture)
    try {
      hostCtx.emit('agent/created', { agent: { ctx: agentCtx } } as unknown as AgentCreatedPayload)
      await flushMicrotasks()
    } finally {
      process.off('unhandledRejection', capture)
    }

    expect(presets.mount).toHaveBeenCalledWith(agentCtx, 'data-agent')
    // The listener logged the failure and re-threw; the wiring's catch absorbs
    // the re-throw so a fire-and-forget dispatch cannot crash the process.
    expect(error).toHaveBeenCalledWith(mountError)
    expect(unhandled).toEqual([])
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
