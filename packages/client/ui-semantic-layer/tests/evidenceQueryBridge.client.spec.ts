/**
 * W11: evidence-query client RPC bridge tests. Verifies that
 * buildEvidenceQueryClient correctly wraps the Remote namespace methods
 * and unwraps RemoteResult into plain values / throws on failure.
 */
import { describe, expect, it, vi } from 'vitest'
import { buildEvidenceQueryClient } from '../src/client/evidenceQueryBridge.ts'
import type { EnrichedCoverageStats, GapAnalysisResult, EvalDeltaReport } from '../src/client/types.ts'

function ok<T>(value: T) { return { ok: true, value } }
function fail(error: string) { return { ok: false, error } }

function makeRemoteStub() {
  const coverage: EnrichedCoverageStats = {
    table_count: 10, event_count: 5, metric_count: 3,
    domain_counts: { '付费经济': 5 },
    confirmation: { draft: 3, confirmed: 10, rejected: 2 },
  }
  return {
    coverageQuery: vi.fn().mockResolvedValue(ok(coverage)),
    gapAnalysis: vi.fn().mockResolvedValue(ok({ sourceAssetId: 'a1', gaps: [] } satisfies GapAnalysisResult)),
    reachabilityDelta: vi.fn().mockResolvedValue(ok({ proposedRelation: { sourceId: 's', targetId: 't', type: 'joins' as const }, newlyReachable: [] })),
    evalResultQuery: vi.fn().mockResolvedValue(ok({ results: [], total: 0 })),
    assetHealth: vi.fn().mockResolvedValue(ok(null)),
    beforeAfterDelta: vi.fn().mockResolvedValue(ok({ runIdA: 'r1', runIdB: 'r2', flipped: [], summary: { improved: 0, regressed: 0, unchanged: 5 } } satisfies EvalDeltaReport)),
    getEvalRunCount: vi.fn().mockResolvedValue(ok(7)),
    getRecentPassRates: vi.fn().mockResolvedValue(ok([0.8, 0.9, 1.0])),
  }
}

describe('buildEvidenceQueryClient', () => {
  it('wraps coverageQuery and unwraps RemoteResult', async () => {
    const remote = makeRemoteStub()
    const client = buildEvidenceQueryClient(remote)
    const result = await client.coverageQuery()
    expect(result.table_count).toBe(10)
    expect(remote.coverageQuery).toHaveBeenCalledOnce()
  })

  it('wraps gapAnalysis with assetId parameter', async () => {
    const remote = makeRemoteStub()
    const client = buildEvidenceQueryClient(remote)
    const result = await client.gapAnalysis('dws_order_di')
    expect(result.sourceAssetId).toBe('a1')
    expect(remote.gapAnalysis).toHaveBeenCalledWith('dws_order_di')
  })

  it('wraps reachabilityDelta with relation parameter', async () => {
    const remote = makeRemoteStub()
    const client = buildEvidenceQueryClient(remote)
    const relation = { sourceId: 'a', targetId: 'b', type: 'joins' as const }
    await client.reachabilityDelta(relation)
    expect(remote.reachabilityDelta).toHaveBeenCalledWith(relation)
  })

  it('wraps evalResultQuery with filters', async () => {
    const remote = makeRemoteStub()
    const client = buildEvidenceQueryClient(remote)
    const filters = { assetId: 'x', limit: 5 }
    const result = await client.evalResultQuery(filters)
    expect(result.total).toBe(0)
    expect(remote.evalResultQuery).toHaveBeenCalledWith(filters)
  })

  it('wraps assetHealth — returns null for nonexistent', async () => {
    const remote = makeRemoteStub()
    const client = buildEvidenceQueryClient(remote)
    const result = await client.assetHealth('nonexistent')
    expect(result).toBeNull()
  })

  it('wraps beforeAfterDelta with two runIds', async () => {
    const remote = makeRemoteStub()
    const client = buildEvidenceQueryClient(remote)
    const result = await client.beforeAfterDelta('r1', 'r2')
    expect(result.summary.unchanged).toBe(5)
    expect(remote.beforeAfterDelta).toHaveBeenCalledWith('r1', 'r2')
  })

  it('wraps getEvalRunCount', async () => {
    const remote = makeRemoteStub()
    const client = buildEvidenceQueryClient(remote)
    const count = await client.getEvalRunCount!()
    expect(count).toBe(7)
  })

  it('wraps getRecentPassRates with optional n', async () => {
    const remote = makeRemoteStub()
    const client = buildEvidenceQueryClient(remote)
    const rates = await client.getRecentPassRates!(5)
    expect(rates).toEqual([0.8, 0.9, 1.0])
    expect(remote.getRecentPassRates).toHaveBeenCalledWith(5)
  })

  it('throws on Remote failure', async () => {
    const remote = makeRemoteStub()
    remote.coverageQuery.mockResolvedValue(fail('network timeout'))
    const client = buildEvidenceQueryClient(remote)
    await expect(client.coverageQuery()).rejects.toThrow('evidence-query RPC failed')
  })
})
