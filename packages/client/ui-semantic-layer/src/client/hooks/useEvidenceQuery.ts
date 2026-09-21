/**
 * Hook consuming the EvidenceQueryClient. Fetches coverage on mount and exposes
 * query methods for evidence panels. `fetchEvalHistory` loads bounded run summaries and
 * derives the latest comparable pair from those returned runs, so the
 * dashboard and sidebar use the same run-selection rule. Only the latest
 * history request may publish run summaries, delta, or errors after a selection change.
 *
 * `loading` is derived from an in-flight `pendingCount` counter (not a single
 * boolean) so concurrent fetches do not prematurely clear loading while one
 * request is still pending.
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import type {
  EnrichedCoverageStats,
  GapAnalysisResult,
  EvalResultQueryResult,
  EvalResultFilters,
  EvalRunHistoryFilters,
  EvalRunHistoryResult,
  AssetHealthReport,
  ProposedRelation,
  ReachabilityDeltaResult,
  EvalDeltaReport,
  EvalDeltaFilters,
} from '../types.ts'

/** Injected evidence-query client face (passed from plugin apply). */
export interface EvidenceQueryClient {
  coverageQuery(): Promise<EnrichedCoverageStats>
  gapAnalysis(assetId: string): Promise<GapAnalysisResult>
  reachabilityDelta(relation: ProposedRelation): Promise<ReachabilityDeltaResult>
  evalResultQuery(filters: EvalResultFilters): Promise<EvalResultQueryResult>
  evalRunHistory(filters: EvalRunHistoryFilters): Promise<EvalRunHistoryResult>
  assetHealth(assetId: string): Promise<AssetHealthReport | null>
  beforeAfterDelta(runIdA: string, runIdB: string, filters?: EvalDeltaFilters): Promise<EvalDeltaReport>
  triggerEvalRun?(assetId?: string): Promise<string>
  getEvalRunCount?(): Promise<number>
  getRecentPassRates?(n?: number): Promise<number[]>
  subscribeInvalidation?(cb: () => void): () => void
}

/** State shape for the evidence query hook. */
export interface EvidenceQueryState {
  coverage: EnrichedCoverageStats | null
  gapAnalysis: GapAnalysisResult | null
  evalResults: EvalResultQueryResult | null
  evalHistory: EvalRunHistoryResult | null
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
  evalHistory: null,
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

/**
 * Read evidence-query state for one mounted consumer.
 * @param client - Evidence-query RPC client, or null when the capability is unavailable.
 * @returns State plus explicit fetch operations for each evidence view.
 */
export function useEvidenceQuery(client: EvidenceQueryClient | null): {
  state: EvidenceQueryState
  fetchCoverage: () => Promise<void>
  fetchGapAnalysis: (assetId: string) => Promise<void>
  fetchEvalResults: (filters: EvalResultFilters) => Promise<void>
  fetchEvalHistory: (filters: EvalRunHistoryFilters) => Promise<void>
  fetchAssetHealth: (assetId: string) => Promise<void>
  fetchReachabilityDelta: (relation: ProposedRelation) => Promise<void>
  fetchEvalDelta: (runIdA: string, runIdB: string) => Promise<void>
  triggerEval: (assetId?: string) => Promise<string | null>
} {
  const [state, setState] = useState<EvidenceQueryState>(INITIAL_STATE)
  const historyRequest = useRef(0)

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

  const fetchEvalHistory = useCallback(async (filters: EvalRunHistoryFilters) => {
    if (!client) return
    const request = ++historyRequest.current
    const isCurrent = () => request === historyRequest.current
    setState(beginFetch)
    try {
      const evalHistory = await client.evalRunHistory(filters)
      if (!isCurrent()) {
        setState(s => finishFetch(s, {}))
        return
      }
      const latest = evalHistory.runs[0]
      const previous = evalHistory.runs[1]
      if (latest === undefined || previous === undefined) {
        setState(s => finishFetch(s, { evalHistory, evalDelta: null }))
        return
      }

      setState(s => ({ ...s, evalHistory, evalDelta: null }))
      const deltaFilters: EvalDeltaFilters = {
        ...(evalHistory.assetFilterStatus === 'applied' && filters.assetId !== undefined
          ? { assetId: filters.assetId }
          : {}),
        ...(filters.domain === undefined ? {} : { domain: filters.domain }),
        ...(filters.scopeId === undefined ? {} : { scopeId: filters.scopeId }),
      }
      const evalDelta = await client.beforeAfterDelta(previous.runId, latest.runId, deltaFilters)
      setState(s => isCurrent() ? finishFetch(s, { evalDelta }) : finishFetch(s, {}))
    } catch (err) {
      setState(s => isCurrent() ? failFetch(s, err) : finishFetch(s, {}))
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
    setState(beginFetch)
    try {
      const runId = await client.triggerEvalRun(assetId)
      setState(s => finishFetch(s, {}))
      return runId
    } catch (err) {
      setState(s => failFetch(s, err))
      return null
    }
  }, [client])

  useEffect(() => { void fetchCoverage() }, [fetchCoverage])

  return {
    state,
    fetchCoverage,
    fetchGapAnalysis,
    fetchEvalResults,
    fetchEvalHistory,
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
