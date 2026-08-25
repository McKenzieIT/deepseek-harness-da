/**
 * Local types for the semantic layer UI. Re-declares evidence-query shapes to
 * avoid an import-time dependency on the Host-only packages (the browser
 * bundle cannot inline Host code). Wire shapes are identical; the Remote face
 * delivers them as plain JSON.
 */

export type AssetKind = 'table' | 'event' | 'metric'
export type TableKind = 'dws' | 'dim' | 'dwd' | 'ods' | 'ads' | string
export type ConfirmationStatus = 'draft' | 'confirmed'

export interface ConfirmationBreakdown {
  readonly draft: number
  readonly confirmed: number
  readonly rejected: number
}

export interface EnrichedCoverageStats {
  readonly table_count: number
  readonly event_count: number
  readonly metric_count: number
  readonly domain_counts: Readonly<Record<string, number>>
  readonly confirmation: ConfirmationBreakdown
}

export interface GapEntry {
  readonly assetId: string
  readonly joinPath: readonly string[]
}

export interface GapAnalysisResult {
  readonly sourceAssetId: string
  readonly gaps: readonly GapEntry[]
}

export interface ProposedRelation {
  readonly sourceId: string
  readonly targetId: string
  readonly type: 'joins' | 'derived_from' | 'related_to'
  readonly on?: string
}

export interface ReachablePair {
  readonly from: string
  readonly to: string
}

export interface ReachabilityDeltaResult {
  readonly proposedRelation: ProposedRelation
  readonly newlyReachable: readonly ReachablePair[]
}

export interface EvalResultFilters {
  readonly assetId?: string
  readonly status?: 'pass' | 'fail' | 'error' | 'pending'
  readonly domain?: string
  readonly limit?: number
}

export interface EvalResultRecord {
  readonly id: string
  readonly assetId: string
  readonly caseId: string
  readonly status: 'pass' | 'fail' | 'error' | 'pending'
  readonly score?: number
  readonly timestamp: string
  readonly metadata?: Readonly<Record<string, unknown>>
}

export interface EvalResultQueryResult {
  readonly results: readonly EvalResultRecord[]
  readonly total: number
}

export interface AssetHealthReport {
  readonly assetId: string
  readonly confirmationStatus: string
  readonly hasEvalCoverage: boolean
  readonly relationCount: number
  readonly lastModified: string
}

/** Eval case flip between two runs (from beforeAfterDelta). */
export interface EvalCaseFlip {
  readonly caseId: string
  readonly before: 'pass' | 'fail' | 'error' | 'pending'
  readonly after: 'pass' | 'fail' | 'error' | 'pending'
}

/** Before/after delta report between two eval runs. */
export interface EvalDeltaReport {
  readonly runIdA: string
  readonly runIdB: string
  readonly flipped: readonly EvalCaseFlip[]
  readonly summary: {
    readonly improved: number
    readonly regressed: number
    readonly unchanged: number
  }
}
