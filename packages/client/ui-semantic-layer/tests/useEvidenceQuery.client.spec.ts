// @vitest-environment jsdom
/**
 * usl-12: triggerEval must participate in the hook's pending/loading machinery.
 * Previously triggerEval bypassed beginFetch/finishFetch and only set
 * state.error on failure via a raw setState, so state.loading stayed false
 * while an on-demand eval trigger was in flight — inconsistent with every
 * other fetch (coverage/gap/eval/delta/health), which all route through
 * beginFetch/finishFetch/failFetch. These specs pin the loading contract for
 * the success, failure, and no-client paths.
 */
import { describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEvidenceQuery } from '../src/client/hooks/useEvidenceQuery.ts'
import type { EvidenceQueryClient } from '../src/client/hooks/useEvidenceQuery.ts'
import type { EnrichedCoverageStats } from '../src/client/types.ts'

const COVERAGE: EnrichedCoverageStats = {
  table_count: 0,
  event_count: 0,
  metric_count: 0,
  domain_counts: {},
  confirmation: { draft: 0, confirmed: 0, rejected: 0 },
}

/** A client whose only exercised methods are coverageQuery (mount) + triggerEvalRun. */
function makeClient(triggerEvalRun: (assetId?: string) => Promise<string>): EvidenceQueryClient {
  return {
    coverageQuery: vi.fn(async () => COVERAGE),
    gapAnalysis: vi.fn(),
    reachabilityDelta: vi.fn(),
    evalResultQuery: vi.fn(),
    assetHealth: vi.fn(),
    beforeAfterDelta: vi.fn(),
    triggerEvalRun,
  }
}

describe('useEvidenceQuery — triggerEval loading contract', () => {
  it('reflects an in-flight triggerEval in state.loading / pendingCount', async () => {
    let resolveTrigger: (runId: string) => void = () => {}
    const triggerEvalRun = vi.fn(() => new Promise<string>((r) => { resolveTrigger = r }))
    const client = makeClient(triggerEvalRun)
    const { result } = renderHook(() => useEvidenceQuery(client))

    // Let the mount coverage fetch settle first (loading false, pendingCount 0).
    await vi.waitFor(() => {
      expect(result.current.state.loading).toBe(false)
      expect(result.current.state.pendingCount).toBe(0)
    })

    // Kick off an on-demand eval trigger; it stays pending until we resolve.
    let triggerPromise!: Promise<string | null>
    act(() => { triggerPromise = result.current.triggerEval('a1') })

    // While the trigger is in flight, the shared loading indicator must show.
    expect(result.current.state.loading).toBe(true)
    expect(result.current.state.pendingCount).toBe(1)
    expect(triggerEvalRun).toHaveBeenCalledWith('a1')

    // Resolve the trigger; loading clears and the runId is returned.
    await act(async () => {
      resolveTrigger('run-42')
      await triggerPromise
    })
    expect(result.current.state.loading).toBe(false)
    expect(result.current.state.pendingCount).toBe(0)
    expect(await triggerPromise).toBe('run-42')
  })

  it('clears loading and surfaces the error when triggerEval fails', async () => {
    let rejectTrigger: (e: unknown) => void = () => {}
    const triggerEvalRun = vi.fn(
      () => new Promise<string>((_resolve, reject) => { rejectTrigger = reject }),
    )
    const client = makeClient(triggerEvalRun)
    const { result } = renderHook(() => useEvidenceQuery(client))
    await vi.waitFor(() => { expect(result.current.state.loading).toBe(false) })

    let triggerPromise!: Promise<string | null>
    act(() => { triggerPromise = result.current.triggerEval('a1') })

    // While the failing trigger is in flight, loading must still show.
    expect(result.current.state.loading).toBe(true)
    expect(result.current.state.pendingCount).toBe(1)

    await act(async () => {
      rejectTrigger(new Error('eval boom'))
      await triggerPromise.catch(() => {}) // triggerEval returns null on catch
    })
    expect(result.current.state.loading).toBe(false)
    expect(result.current.state.pendingCount).toBe(0)
    expect(result.current.state.error).toBe('eval boom')
    expect(await triggerPromise).toBe(null)
  })

  it('returns null without bumping loading when the client lacks triggerEvalRun', async () => {
    const client = {
      coverageQuery: vi.fn(async () => COVERAGE),
      gapAnalysis: vi.fn(),
      reachabilityDelta: vi.fn(),
      evalResultQuery: vi.fn(),
      assetHealth: vi.fn(),
      beforeAfterDelta: vi.fn(),
      // triggerEvalRun intentionally absent
    } as unknown as EvidenceQueryClient
    const { result } = renderHook(() => useEvidenceQuery(client))
    await vi.waitFor(() => { expect(result.current.state.loading).toBe(false) })

    let returned: string | null = 'unset'
    await act(async () => { returned = await result.current.triggerEval('a1') })
    expect(returned).toBe(null)
    expect(result.current.state.loading).toBe(false)
    expect(result.current.state.pendingCount).toBe(0)
    expect(result.current.state.error).toBe(null)
  })
})
