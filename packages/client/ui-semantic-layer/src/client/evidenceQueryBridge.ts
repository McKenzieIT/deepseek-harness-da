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
import { unwrapRemoteResult } from './remoteResult.ts'
import type { RemoteResult } from './remoteResult.ts'

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

/**
 * Build an EvidenceQueryClient from the typed remote namespace.
 * Each method delegates to the host via RPC and unwraps the RemoteResult.
 * @param remote - remote
 * @returns the result
 */
export function buildEvidenceQueryClient(remote: EvidenceQueryRemoteNamespace): EvidenceQueryClient {
  return {
    async coverageQuery() {
      return unwrapRemoteResult(await remote.coverageQuery(), 'evidence-query')
    },
    async gapAnalysis(assetId: string) {
      return unwrapRemoteResult(await remote.gapAnalysis(assetId), 'evidence-query')
    },
    async reachabilityDelta(relation: ProposedRelation) {
      return unwrapRemoteResult(await remote.reachabilityDelta(relation), 'evidence-query')
    },
    async evalResultQuery(filters: EvalResultFilters) {
      return unwrapRemoteResult(await remote.evalResultQuery(filters), 'evidence-query')
    },
    async assetHealth(assetId: string) {
      return unwrapRemoteResult(await remote.assetHealth(assetId), 'evidence-query')
    },
    async beforeAfterDelta(runIdA: string, runIdB: string) {
      return unwrapRemoteResult(await remote.beforeAfterDelta(runIdA, runIdB), 'evidence-query')
    },
    async getEvalRunCount() {
      return unwrapRemoteResult(await remote.getEvalRunCount(), 'evidence-query')
    },
    async getRecentPassRates(n?: number) {
      return unwrapRemoteResult(await remote.getRecentPassRates(n), 'evidence-query')
    },
  }
}
