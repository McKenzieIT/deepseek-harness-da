import type { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import type {} from './index.ts'
import type {
  EnrichedCoverageStats,
  GapAnalysisResult,
  EvalResultFilters,
  EvalResultQueryResult,
  AssetHealthReport,
  ProposedRelation,
  ReachabilityDeltaResult,
  EvalDeltaReport,
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
   * @returns the result
   */
  @Remote('beforeAfterDelta')
  beforeAfterDelta(runIdA: string, runIdB: string): EvalDeltaReport {
    return this.ctx.evidenceQuery.beforeAfterDelta(runIdA, runIdB)
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
