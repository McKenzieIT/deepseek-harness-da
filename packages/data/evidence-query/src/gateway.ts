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

export class EvidenceQueryGateway extends TypertRemoteService {
  static inject = ['evidenceQuery']

  constructor(ctx: Context) {
    super(ctx, 'evidenceQueryGateway', { namespace: 'evidenceQuery' })
  }

  @Remote('coverageQuery')
  coverageQuery(): EnrichedCoverageStats {
    return this.ctx.evidenceQuery.coverageQuery()
  }

  @Remote('gapAnalysis')
  gapAnalysis(assetId: string): GapAnalysisResult {
    return this.ctx.evidenceQuery.gapAnalysis(assetId)
  }

  @Remote('reachabilityDelta')
  reachabilityDelta(newRelation: ProposedRelation): ReachabilityDeltaResult {
    return this.ctx.evidenceQuery.reachabilityDelta(newRelation)
  }

  @Remote('evalResultQuery')
  evalResultQuery(filters: EvalResultFilters): EvalResultQueryResult {
    return this.ctx.evidenceQuery.evalResultQuery(filters)
  }

  @Remote('assetHealth')
  assetHealth(assetId: string): AssetHealthReport | null {
    return this.ctx.evidenceQuery.assetHealth(assetId)
  }

  @Remote('beforeAfterDelta')
  beforeAfterDelta(runIdA: string, runIdB: string): EvalDeltaReport {
    return this.ctx.evidenceQuery.beforeAfterDelta(runIdA, runIdB)
  }

  @Remote('getEvalRunCount')
  getEvalRunCount(): number {
    return this.ctx.evidenceQuery.getEvalStore().getRunIds().length
  }

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
