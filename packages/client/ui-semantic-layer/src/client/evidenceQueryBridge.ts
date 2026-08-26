/**
 * Client-side evidence-query RPC bridge. Constructs an EvidenceQueryClient
 * from the Typert Remote namespace `ctx.remote.evidenceQuery`, unwrapping
 * RemoteResult into plain values (throws on failure).
 *
 * Pattern mirrors how ui-reference consumes ctx.remote.fileReferences:
 * inject the remote namespace, wrap each method to unwrap RemoteResult.
 */
import type { EvidenceQueryClient } from './hooks/useEvidenceQuery.ts'
import type {
  EnrichedCoverageStats,
  GapAnalysisResult,
  EvalResultQueryResult,
  EvalResultFilters,
  AssetHealthReport,
  ProposedRelation,
  ReachabilityDeltaResult,
  EvalDeltaReport,
} from './types.ts'

interface RemoteResult<T> {
  ok: boolean
  value?: T
  error?: unknown
}

interface EvidenceQueryRemoteNamespace {
  coverageQuery(): Promise<RemoteResult<EnrichedCoverageStats>>
  gapAnalysis(assetId: string): Promise<RemoteResult<GapAnalysisResult>>
  reachabilityDelta(newRelation: ProposedRelation): Promise<RemoteResult<ReachabilityDeltaResult>>
  evalResultQuery(filters: EvalResultFilters): Promise<RemoteResult<EvalResultQueryResult>>
  assetHealth(assetId: string): Promise<RemoteResult<AssetHealthReport | null>>
  beforeAfterDelta(runIdA: string, runIdB: string): Promise<RemoteResult<EvalDeltaReport>>
  getEvalRunCount(): Promise<RemoteResult<number>>
  getRecentPassRates(n?: number): Promise<RemoteResult<number[]>>
}

function unwrap<T>(result: RemoteResult<T>): T {
  if (!result.ok) throw new Error(`evidence-query RPC failed: ${String(result.error ?? 'unknown')}`)
  return result.value as T
}

/**
 * Build an EvidenceQueryClient from the typed remote namespace.
 * Each method delegates to the host via RPC and unwraps the RemoteResult.
 */
export function buildEvidenceQueryClient(remote: EvidenceQueryRemoteNamespace): EvidenceQueryClient {
  return {
    async coverageQuery() {
      return unwrap(await remote.coverageQuery())
    },
    async gapAnalysis(assetId: string) {
      return unwrap(await remote.gapAnalysis(assetId))
    },
    async reachabilityDelta(relation: ProposedRelation) {
      return unwrap(await remote.reachabilityDelta(relation))
    },
    async evalResultQuery(filters: EvalResultFilters) {
      return unwrap(await remote.evalResultQuery(filters))
    },
    async assetHealth(assetId: string) {
      return unwrap(await remote.assetHealth(assetId))
    },
    async beforeAfterDelta(runIdA: string, runIdB: string) {
      return unwrap(await remote.beforeAfterDelta(runIdA, runIdB))
    },
    async getEvalRunCount() {
      return unwrap(await remote.getEvalRunCount())
    },
    async getRecentPassRates(n?: number) {
      return unwrap(await remote.getRecentPassRates(n))
    },
  }
}
