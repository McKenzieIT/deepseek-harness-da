/**
 * Type definitions for the evidence-query backend layer.
 *
 * These types serve BOTH the sidebar (B subset) and future dashboard (A full)
 * — same backend, no per-view duplication.
 *
 * @module @deepseek-ai/dsh-evidence-query/types
 */

// ── CoverageQuery ───────────────────────────────────────────────────────

/** Confirmation status breakdown: how many assets are in each status. */
export interface ConfirmationBreakdown {
  readonly draft: number
  readonly confirmed: number
  readonly rejected: number
}

/** Enriched coverage statistics (SchemaGateway.getCoverageStats + confirmation breakdown). */
export interface EnrichedCoverageStats {
  readonly table_count: number
  readonly event_count: number
  readonly metric_count: number
  readonly domain_counts: Readonly<Record<string, number>>
  readonly confirmation: ConfirmationBreakdown
}

// ── GapAnalysis ─────────────────────────────────────────────────────────

/** A gap entry: an asset reachable via joins but lacking eval coverage. */
export interface GapEntry {
  /** The asset id that is reachable but uncovered. */
  readonly assetId: string
  /** The join path from the queried asset to this gap entry. */
  readonly joinPath: readonly string[]
}

/** Result of gapAnalysis(assetId). */
export interface GapAnalysisResult {
  /** The source asset that was queried. */
  readonly sourceAssetId: string
  /** Assets reachable via join edges but without eval coverage. */
  readonly gaps: readonly GapEntry[]
}

// ── ReachabilityDelta ───────────────────────────────────────────────────

/** A proposed relation to evaluate for reachability impact. */
export interface ProposedRelation {
  readonly sourceId: string
  readonly targetId: string
  readonly type: 'joins' | 'derived_from' | 'related_to'
  readonly on?: string
}

/** A newly reachable pair discovered by adding the proposed relation. */
export interface ReachablePair {
  readonly from: string
  readonly to: string
}

/** Result of reachabilityDelta(newRelation). */
export interface ReachabilityDeltaResult {
  /** The proposed relation that was evaluated. */
  readonly proposedRelation: ProposedRelation
  /** Pairs of assets that become newly reachable (via joins) after adding the relation. */
  readonly newlyReachable: readonly ReachablePair[]
}

// ── EvalResultQuery ─────────────────────────────────────────────────────

/** Filters for querying eval results. */
export interface EvalResultFilters {
  /** Filter by asset id (table_name, event name, or metric name). */
  readonly assetId?: string
  /** Filter by eval run status. */
  readonly status?: 'pass' | 'fail' | 'error' | 'pending'
  /** Filter by domain. */
  readonly domain?: string
  /** Maximum number of results to return. */
  readonly limit?: number
  /** GA-GT1 Phase 3b (D5.2): filter by scope id. Additive — undefined returns
   * records from all scopes (including legacy records with no scopeId). */
  readonly scopeId?: string
}

/**
 * A Typert-safe arbitrary-JSON value. `Record<string, unknown>` carries an
 * `unknown` index signature that the Typert analyzer rejects at a `@Remote`
 * boundary ("Remote boundary contains unconstrained unknown data"); this
 * recursive JSON union is constrained (no `unknown`/`any`) yet permissive
 * enough to carry every metadata field an eval result record persists
 * (runId, outcome, domain, passK, latencyMs, …). Mirrors the `Json` type
 * in `@deepseek-ai/dsh-schema-gateway`.
 */
export type Json = string | number | boolean | null | readonly Json[] | { readonly [key: string]: Json }

/** A single persisted eval result record. */
export interface EvalResultRecord {
  readonly id: string
  readonly assetId: string
  readonly caseId: string
  readonly status: 'pass' | 'fail' | 'error' | 'pending'
  readonly score?: number
  readonly timestamp: string
  readonly metadata?: Readonly<Record<string, Json>>
  /** GA-GT1 Phase 3b (D5.2): the scope id this record belongs to. Optional —
   * undefined for legacy flat-layout records (no per-scope subdirectory).
   * camelCase, consistent with assetId/caseId. */
  readonly scopeId?: string
}

/** Result of evalResultQuery(filters). */
export interface EvalResultQueryResult {
  readonly results: readonly EvalResultRecord[]
  readonly total: number
}

// ── EvalDelta ───────────────────────────────────────────────────────────

/** A flip: one case whose status changed between two runs. */
export interface EvalCaseFlip {
  readonly caseId: string
  readonly before: EvalResultRecord['status']
  readonly after: EvalResultRecord['status']
}

/** Delta report between two eval runs (as seen through the evidence-query layer). */
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

// ── AssetHealth ─────────────────────────────────────────────────────────

/** Aggregate health report for a single asset. */
export interface AssetHealthReport {
  /** The asset id queried. */
  readonly assetId: string
  /** Confirmation status of the asset (draft/confirmed/rejected). */
  readonly confirmationStatus: string
  /** Whether eval coverage exists for this asset. */
  readonly hasEvalCoverage: boolean
  /** Number of relations this asset participates in. */
  readonly relationCount: number
  /** ISO timestamp of last modification (empty string if unknown). */
  readonly lastModified: string
}
