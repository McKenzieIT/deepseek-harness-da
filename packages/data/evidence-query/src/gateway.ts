import type { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import type {} from './index.ts'
import type {
  EnrichedCoverageStats,
  GapAnalysisResult,
  EvalResultFilters,
  EvalResultQueryResult,
  EvalRunHistoryFilters,
  EvalRunHistoryResult,
  AssetHealthReport,
  ProposedRelation,
  ReachabilityDeltaResult,
  EvalDeltaReport,
  EvalDeltaFilters,
} from './types.ts'

/** EvidenceQueryGateway */
export class EvidenceQueryGateway extends TypertRemoteService {
  static inject = ['evidenceQuery']

  constructor(ctx: Context) {
    super(ctx, 'evidenceQueryGateway', { namespace: 'evidenceQuery' })
  }

  /**
   *  EvidenceQueryGateway.coverageQuery
   * @returns the result
   */
  @Remote('coverageQuery')
  coverageQuery(): EnrichedCoverageStats {
    return this.ctx.evidenceQuery.coverageQuery()
  }

  /**
   *  EvidenceQueryGateway.gapAnalysis
   * @param assetId - assetId
   * @returns the result
   */
  @Remote('gapAnalysis')
  gapAnalysis(assetId: string): GapAnalysisResult {
    return this.ctx.evidenceQuery.gapAnalysis(assetId)
  }

  /**
   *  EvidenceQueryGateway.reachabilityDelta
   * @param newRelation - newRelation
   * @returns the result
   */
  @Remote('reachabilityDelta')
  reachabilityDelta(newRelation: ProposedRelation): ReachabilityDeltaResult {
    return this.ctx.evidenceQuery.reachabilityDelta(newRelation)
  }

  /**
   *  EvidenceQueryGateway.evalResultQuery
   * @param filters - filters
   * @returns the result
   */
  @Remote('evalResultQuery')
  evalResultQuery(filters: EvalResultFilters): EvalResultQueryResult {
    return this.ctx.evidenceQuery.evalResultQuery(filters)
  }

  /**
   * EvidenceQueryGateway.evalRunHistory
   * @param filters - bounded run-history filters
   * @returns newest matching run summaries
   * @throws When limit is not a positive integer or exceeds the server maximum.
   */
  @Remote('evalRunHistory')
  evalRunHistory(filters: EvalRunHistoryFilters): EvalRunHistoryResult {
    return this.ctx.evidenceQuery.evalRunHistory(filters)
  }

  /**
   *  EvidenceQueryGateway.assetHealth
   * @param assetId - assetId
   * @returns the result
   */
  @Remote('assetHealth')
  assetHealth(assetId: string): AssetHealthReport | null {
    return this.ctx.evidenceQuery.assetHealth(assetId)
  }

  /**
   *  EvidenceQueryGateway.beforeAfterDelta
   * @param runIdA - runIdA
   * @param runIdB - runIdB
   * @param filters - optional asset, domain, and scope filters
   * @returns the result
   * @throws When an asset filter lacks a complete case-to-asset mapping.
   */
  @Remote('beforeAfterDelta')
  beforeAfterDelta(runIdA: string, runIdB: string, filters?: EvalDeltaFilters): EvalDeltaReport {
    return this.ctx.evidenceQuery.beforeAfterDelta(runIdA, runIdB, filters)
  }

  /**
   *  EvidenceQueryGateway.getEvalRunCount
   * @returns the result
   */
  @Remote('getEvalRunCount')
  getEvalRunCount(): number {
    return this.ctx.evidenceQuery.getEvalStore().getRunIds().length
  }

  /**
   *  EvidenceQueryGateway.getRecentPassRates
   * @param n - n
   * @returns the result
   */
  @Remote('getRecentPassRates')
  getRecentPassRates(n?: number): number[] {
    const store = this.ctx.evidenceQuery.getEvalStore()
    const runIds = store.getRunIds()
    const recent = runIds.slice(-(n ?? 5))
    return recent.map((runId) => {
      const records = store.getByRunId(runId)
      if (records.length === 0) return 0
      const passed = records.filter(r => r.status === 'pass').length
      return passed / records.length
    })
  }
}

export default EvidenceQueryGateway
