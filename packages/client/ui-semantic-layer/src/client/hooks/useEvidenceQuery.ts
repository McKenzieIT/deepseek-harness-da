/**
 * Hook consuming the EvidenceQueryClient. Fetches coverage on mount;
 * exposes lazy methods for gap analysis, eval results, delta, and health.
 *
 * `loading` is derived from an in-flight `pendingCount` counter (not a single
 * boolean) so concurrent fetches (coverage on mount + gap/eval on asset
 * selection) do not prematurely flip loading to false while one is still
 * pending.
 */
import { useState, useCallback, useEffect } from 'react'
import type {
  EnrichedCoverageStats,
  GapAnalysisResult,
  EvalResultQueryResult,
  EvalResultFilters,
  AssetHealthReport,
  ProposedRelation,
  ReachabilityDeltaResult,
  EvalDeltaReport,
} from '../types.ts'

/** Injected evidence-query client face (passed from plugin apply). */
export interface EvidenceQueryClient {
  coverageQuery(): Promise<EnrichedCoverageStats>
  gapAnalysis(assetId: string): Promise<GapAnalysisResult>
  reachabilityDelta(relation: ProposedRelation): Promise<ReachabilityDeltaResult>
  evalResultQuery(filters: EvalResultFilters): Promise<EvalResultQueryResult>
  assetHealth(assetId: string): Promise<AssetHealthReport | null>
  beforeAfterDelta(runIdA: string, runIdB: string): Promise<EvalDeltaReport>
  triggerEvalRun?(assetId?: string): Promise<string>
  getEvalRunCount?(): Promise<number>
  getRecentPassRates?(n?: number): Promise<number[]>
}

/** State shape for the evidence query hook. */
export interface EvidenceQueryState {
  coverage: EnrichedCoverageStats | null
  gapAnalysis: GapAnalysisResult | null
  evalResults: EvalResultQueryResult | null
  assetHealth: AssetHealthReport | null
  reachabilityDelta: ReachabilityDeltaResult | null
  evalDelta: EvalDeltaReport | null
  loading: boolean
  /** Number of in-flight fetches; `loading` is `pendingCount > 0`. */
  pendingCount: number
  error: string | null
}

const INITIAL_STATE: EvidenceQueryState = {
  coverage: null,
  gapAnalysis: null,
  evalResults: null,
  assetHealth: null,
  reachabilityDelta: null,
  evalDelta: null,
  loading: false,
  pendingCount: 0,
  error: null,
}

/** Begin a fetch: bump the in-flight counter; loading follows it. */
function beginFetch(s: EvidenceQueryState): EvidenceQueryState {
  const pendingCount = s.pendingCount + 1
  return { ...s, pendingCount, loading: true, error: null }
}

/** Finish a fetch on success: apply the data patch and decrement the counter. */
function finishFetch(s: EvidenceQueryState, patch: Partial<EvidenceQueryState>): EvidenceQueryState {
  const pendingCount = Math.max(0, s.pendingCount - 1)
  return { ...s, ...patch, pendingCount, loading: pendingCount > 0 }
}

/** Finish a fetch on failure: decrement the counter and surface the error. */
function failFetch(s: EvidenceQueryState, err: unknown): EvidenceQueryState {
  const pendingCount = Math.max(0, s.pendingCount - 1)
  return { ...s, pendingCount, loading: pendingCount > 0, error: describeError(err) }
}

export function useEvidenceQuery(client: EvidenceQueryClient | null) {
  const [state, setState] = useState<EvidenceQueryState>(INITIAL_STATE)

  const fetchCoverage = useCallback(async () => {
    if (!client) return
    setState(beginFetch)
    try {
      const coverage = await client.coverageQuery()
      setState(s => finishFetch(s, { coverage }))
    } catch (err) {
      setState(s => failFetch(s, err))
    }
  }, [client])

  const fetchGapAnalysis = useCallback(async (assetId: string) => {
    if (!client) return
    setState(beginFetch)
    try {
      const gapAnalysis = await client.gapAnalysis(assetId)
      setState(s => finishFetch(s, { gapAnalysis }))
    } catch (err) {
      setState(s => failFetch(s, err))
    }
  }, [client])

  const fetchEvalResults = useCallback(async (filters: EvalResultFilters) => {
    if (!client) return
    setState(beginFetch)
    try {
      const evalResults = await client.evalResultQuery(filters)
      setState(s => finishFetch(s, { evalResults }))
    } catch (err) {
      setState(s => failFetch(s, err))
    }
  }, [client])

  const fetchAssetHealth = useCallback(async (assetId: string) => {
    if (!client) return
    setState(beginFetch)
    try {
      const assetHealth = await client.assetHealth(assetId)
      setState(s => finishFetch(s, { assetHealth }))
    } catch (err) {
      setState(s => failFetch(s, err))
    }
  }, [client])

  const fetchReachabilityDelta = useCallback(async (relation: ProposedRelation) => {
    if (!client) return
    setState(beginFetch)
    try {
      const reachabilityDelta = await client.reachabilityDelta(relation)
      setState(s => finishFetch(s, { reachabilityDelta }))
    } catch (err) {
      setState(s => failFetch(s, err))
    }
  }, [client])

  const fetchEvalDelta = useCallback(async (runIdA: string, runIdB: string) => {
    if (!client) return
    setState(beginFetch)
    try {
      const evalDelta = await client.beforeAfterDelta(runIdA, runIdB)
      setState(s => finishFetch(s, { evalDelta }))
    } catch (err) {
      setState(s => failFetch(s, err))
    }
  }, [client])

  const triggerEval = useCallback(async (assetId?: string): Promise<string | null> => {
    if (!client?.triggerEvalRun) return null
    try {
      return await client.triggerEvalRun(assetId)
    } catch (err) {
      setState(s => ({ ...s, error: describeError(err) }))
      return null
    }
  }, [client])

  // Fetch coverage on mount
  useEffect(() => { void fetchCoverage() }, [fetchCoverage])

  return {
    state,
    fetchCoverage,
    fetchGapAnalysis,
    fetchEvalResults,
    fetchAssetHealth,
    fetchReachabilityDelta,
    fetchEvalDelta,
    triggerEval,
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
