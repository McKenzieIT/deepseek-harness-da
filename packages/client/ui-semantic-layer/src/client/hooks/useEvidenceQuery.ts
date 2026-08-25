/**
 * Hook consuming the EvidenceQueryClient. Fetches coverage on mount;
 * exposes lazy methods for gap analysis, eval results, delta, and health.
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
}

/** State shape for the evidence query hook. */
export interface EvidenceQueryState {
  coverage: EnrichedCoverageStats | null
  gapAnalysis: GapAnalysisResult | null
  evalResults: EvalResultQueryResult | null
  assetHealth: AssetHealthReport | null
  delta: ReachabilityDeltaResult | null
  evalDelta: EvalDeltaReport | null
  loading: boolean
  error: string | null
}

const INITIAL_STATE: EvidenceQueryState = {
  coverage: null,
  gapAnalysis: null,
  evalResults: null,
  assetHealth: null,
  delta: null,
  evalDelta: null,
  loading: false,
  error: null,
}

export function useEvidenceQuery(client: EvidenceQueryClient | null) {
  const [state, setState] = useState<EvidenceQueryState>(INITIAL_STATE)

  const fetchCoverage = useCallback(async () => {
    if (!client) return
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const coverage = await client.coverageQuery()
      setState(s => ({ ...s, coverage, loading: false }))
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: describeError(err) }))
    }
  }, [client])

  const fetchGapAnalysis = useCallback(async (assetId: string) => {
    if (!client) return
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const gapAnalysis = await client.gapAnalysis(assetId)
      setState(s => ({ ...s, gapAnalysis, loading: false }))
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: describeError(err) }))
    }
  }, [client])

  const fetchEvalResults = useCallback(async (filters: EvalResultFilters) => {
    if (!client) return
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const evalResults = await client.evalResultQuery(filters)
      setState(s => ({ ...s, evalResults, loading: false }))
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: describeError(err) }))
    }
  }, [client])

  const fetchAssetHealth = useCallback(async (assetId: string) => {
    if (!client) return
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const assetHealth = await client.assetHealth(assetId)
      setState(s => ({ ...s, assetHealth, loading: false }))
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: describeError(err) }))
    }
  }, [client])

  const fetchDelta = useCallback(async (relation: ProposedRelation) => {
    if (!client) return
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const delta = await client.reachabilityDelta(relation)
      setState(s => ({ ...s, delta, loading: false }))
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: describeError(err) }))
    }
  }, [client])

  const fetchEvalDelta = useCallback(async (runIdA: string, runIdB: string) => {
    if (!client) return
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const evalDelta = await client.beforeAfterDelta(runIdA, runIdB)
      setState(s => ({ ...s, evalDelta, loading: false }))
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: describeError(err) }))
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
    fetchDelta,
    fetchEvalDelta,
    triggerEval,
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
