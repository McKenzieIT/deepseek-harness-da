/**
 * EvidenceQueryService — unified evidence-query backend layer.
 *
 * Serves BOTH the sidebar (B subset) and future dashboard (A full) — same
 * backend, no per-view duplication. Plain Cordis Service (consumed by W5 via
 * direct ctx access, not RPC).
 *
 * Methods:
 *  - coverageQuery() — delegates to SchemaGateway.getCoverageStats() logic +
 *    enriches with confirmation.status breakdown
 *  - gapAnalysis(assetId) — compute reachable-but-uncovered assets via RelationGraph
 *  - reachabilityDelta(newRelation) — "if we add this relation, which queries
 *    become newly answerable?" via RelationGraph BFS
 *  - evalResultQuery(filters) — query persisted eval run results (placeholder store)
 *  - assetHealth(assetId) — aggregate health report for a single asset
 *
 * @module @deepseek-ai/dsh-evidence-query
 */
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-semantic-layer'
import {
  loadTables,
  loadEvents,
  loadMetricDefinitions,
  TableDefinitionSchema,
  EventDefinitionSchema,
} from '@deepseek-ai/dsh-semantic-layer'
// Uses the declared ./src/* export path (pre-existing pattern; re-export from package root is tech debt)
import { RelationGraph } from '@deepseek-ai/dsh-semantic-layer/src/relation-graph.ts'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type {
  EnrichedCoverageStats,
  GapAnalysisResult,
  GapEntry,
  ProposedRelation,
  ReachabilityDeltaResult,
  ReachablePair,
  EvalResultFilters,
  EvalResultQueryResult,
  EvalResultRecord,
  EvalCaseFlip,
  EvalDeltaReport,
  AssetHealthReport,
} from './types.ts'

export type * from './types.ts'

const STATUS_RANK: Record<EvalResultRecord['status'], number> = { pass: 3, fail: 1, error: 0, pending: 0 }

/**
 * GA-GT1 Phase 3b (D5.2): structural interface for the optional scope-registry
 * probed via `ctx.get('scopes')` (undefined when unmounted). Declared locally
 * in evidence-query (no static dep on @deepseek-ai/dsh-scope-registry) — the
 * same structural-probe pattern as SemanticLayerService and tool-search-data-sources.
 * Only `get(id)` is needed here (the active-scope path delegates to
 * `ctx.schema.semanticRoot`, which probes `active()` itself).
 */
interface ScopeRegistryLike {
  /** Resolve a scope by id for per-request scope (undefined when not found). */
  get(id: string): { readonly id: string; readonly semanticRoot: string } | undefined
}

export interface EvidenceQueryConfig {
  readonly resultsDir?: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    evidenceQuery: EvidenceQueryService
  }
  interface Events {
    'evidence/eval-run-completed'(): void
  }
}

/**
 * In-memory eval result store. Supports both direct `add()` (for tests and
 * programmatic use) and `loadFromDirectory()` (reads W3 JSONL persistence
 * files). The `FileBackedEvalResultStore` subclass auto-loads on construction.
 */
export class EvalResultStore {
  private records: EvalResultRecord[] = []

  /** Add a record to the store. */
  add(record: EvalResultRecord): void {
    this.records.push(record)
  }

  /** Query records matching the given filters. */
  query(filters: EvalResultFilters): EvalResultQueryResult {
    let results = [...this.records]

    if (filters.assetId !== undefined) {
      results = results.filter(r => r.assetId === filters.assetId)
    }
    if (filters.status !== undefined) {
      results = results.filter(r => r.status === filters.status)
    }
    if (filters.domain !== undefined) {
      results = results.filter(r => r.metadata?.domain === filters.domain)
    }
    // GA-GT1 Phase 3b (D5.2): scopeId filter — additive on top of the
    // existing asset/status/domain/limit filters. When scopeId is undefined,
    // no filtering is applied (all scopes returned, including legacy records
    // with no scopeId — backward-compatible).
    if (filters.scopeId !== undefined) {
      results = results.filter(r => r.scopeId === filters.scopeId)
    }

    const total = results.length
    if (filters.limit !== undefined && filters.limit > 0) {
      results = results.slice(0, filters.limit)
    }

    return { results, total }
  }

  /** Check if any eval result exists for the given asset. */
  hasResultsFor(assetId: string): boolean {
    return this.records.some(r => r.assetId === assetId)
  }

  /** Get all records for a specific runId. */
  getByRunId(runId: string): EvalResultRecord[] {
    return this.records.filter(r => r.metadata?.runId === runId)
  }

  /** Get all distinct runIds in the store. */
  getRunIds(): string[] {
    const ids = new Set<string>()
    for (const r of this.records) {
      const runId = r.metadata?.runId
      if (typeof runId === 'string') ids.add(runId)
    }
    return [...ids]
  }

  /**
   * Load records from a directory of W3 JSONL persistence files.
   * Each line is a `PersistedCaseRecord`; mapped to `EvalResultRecord` via
   * the provided `caseAssetResolver` (defaults to caseId as assetId).
   *
   * GA-GT1 Phase 3b (D5.2): reads BOTH layouts — backward-compatible:
   *  - Flat: `<dir>/*.jsonl` (legacy; records get scopeId=undefined).
   *  - Per-scope: `<dir>/<scopeId>/*.jsonl` (the subdirectory name is the
   *    scopeId, tagged onto each record from that subdirectory).
   * A resultsDir with only flat files (the pre-3b layout) still works unchanged.
   */
  loadFromDirectory(dir: string, caseAssetResolver?: (caseId: string) => string): void {
    if (!existsSync(dir)) return
    const entries = readdirSync(dir, { withFileTypes: true })

    // Flat layout: <dir>/*.jsonl (legacy — scopeId=undefined, backward-compatible)
    const flatFiles = entries.filter(e => e.isFile() && e.name.endsWith('.jsonl'))
    for (const entry of flatFiles) {
      const path = join(dir, entry.name)
      const text = readFileSync(path, 'utf8')
      const lines = text.trim().split('\n').filter(Boolean)
      for (const line of lines) {
        const raw = JSON.parse(line) as PersistedCaseRecordRaw
        this.records.push(mapPersistedToEvalRecord(raw, caseAssetResolver))
      }
    }

    // Per-scope layout: <dir>/<scopeId>/*.jsonl (GA-GT1 Phase 3b D5.2)
    const scopeDirs = entries.filter(e => e.isDirectory())
    for (const entry of scopeDirs) {
      const scopeId = entry.name
      const scopeDir = join(dir, scopeId)
      const scopeFiles = readdirSync(scopeDir, { withFileTypes: true }).filter(e => e.isFile() && e.name.endsWith('.jsonl')).map(e => e.name)
      for (const file of scopeFiles) {
        const path = join(scopeDir, file)
        const text = readFileSync(path, 'utf8')
        const lines = text.trim().split('\n').filter(Boolean)
        for (const line of lines) {
          const raw = JSON.parse(line) as PersistedCaseRecordRaw
          this.records.push(mapPersistedToEvalRecord(raw, caseAssetResolver, scopeId))
        }
      }
    }
  }

  /** Clear all stored records (for testing). */
  clear(): void {
    this.records = []
  }
}

/**
 * File-backed eval result store — reads W3 JSONL persistence files on
 * construction. The directory and case-to-asset resolver are provided at
 * creation time; call `refresh()` to re-read.
 */
export class FileBackedEvalResultStore extends EvalResultStore {
  private readonly dir: string
  private readonly resolver: (caseId: string) => string

  constructor(dir: string, caseAssetResolver?: (caseId: string) => string) {
    super()
    this.dir = dir
    this.resolver = caseAssetResolver ?? (id => id)
    this.refresh()
  }

  /**
   * Re-read all persistence files from the directory.
   * Not atomic — assumes single-threaded access (no concurrent queries
   * during refresh). Safe in Node.js single-event-loop usage.
   */
  refresh(): void {
    this.clear()
    this.loadFromDirectory(this.dir, this.resolver)
  }
}

/** Raw shape of a line in W3 JSONL persistence (from `@deepseek-ai/dsh-eval/persistence`). */
interface PersistedCaseRecordRaw {
  readonly runId: string
  readonly timestamp: string
  readonly caseId: string
  readonly outcome: string
  readonly verdict: string | null
  readonly passed: boolean
  readonly passK: number
  readonly latencyMs: number
  readonly attemptsCount: number
  readonly errorsCount: number
}

/**
 * Map W3 outcome → evidence-query status.
 * The eval runner uses a 4-bucket outcome (correct/wrong/declined/unjudged)
 * while evidence-query uses (pass/fail/error/pending). Mapping:
 *   correct → pass (all attempts passed)
 *   wrong → fail (scored and failed)
 *   declined → fail (agent refused = gradeable failure from evidence perspective)
 *   unjudged → error (infra fault, not scoreable)
 * See also: `packages/eval/eval/src/runner.ts` classifyCaseOutcome.
 */
function mapOutcomeToStatus(outcome: string): EvalResultRecord['status'] {
  switch (outcome) {
    case 'correct': return 'pass'
    case 'wrong': return 'fail'
    case 'declined': return 'fail'
    case 'unjudged': return 'error'
    default: return 'pending'
  }
}

/** Map a persisted case record to an EvalResultRecord. */
function mapPersistedToEvalRecord(
  raw: PersistedCaseRecordRaw,
  resolver?: (caseId: string) => string,
  scopeId?: string,
): EvalResultRecord {
  const assetId = resolver ? resolver(raw.caseId) : raw.caseId
  return {
    id: `${raw.runId}:${raw.caseId}`,
    assetId,
    caseId: raw.caseId,
    status: mapOutcomeToStatus(raw.outcome),
    score: raw.passed ? 1.0 : 0.0,
    timestamp: raw.timestamp,
    metadata: {
      runId: raw.runId,
      outcome: raw.outcome,
      verdict: raw.verdict,
      passK: raw.passK,
      latencyMs: raw.latencyMs,
      attemptsCount: raw.attemptsCount,
      errorsCount: raw.errorsCount,
    },
    // GA-GT1 Phase 3b (D5.2): tag the scopeId onto the record when loaded from
    // a per-scope subdirectory. Flat-layout records omit the key entirely
    // (scopeId=undefined → backward-compatible with pre-3b record shape).
    ...(scopeId !== undefined ? { scopeId } : {}),
  }
}

/**
 * The evidence-query Cordis Service. Owns the `ctx.evidenceQuery` seam.
 * Requires `ctx.schema` (SemanticLayerService) to be mounted.
 */
export class EvidenceQueryService extends Service {
  static inject = ['schema']

  private readonly evalStore: EvalResultStore

  constructor(ctx: Context, configOrStore?: EvidenceQueryConfig | EvalResultStore) {
    super(ctx, 'evidenceQuery')
    if (configOrStore instanceof EvalResultStore) {
      this.evalStore = configOrStore
    } else {
      const resultsDir = configOrStore?.resultsDir
      this.evalStore = resultsDir
        ? new FileBackedEvalResultStore(resultsDir)
        : new EvalResultStore()
    }
    ctx.on('evidence/eval-run-completed', () => {
      if (this.evalStore instanceof FileBackedEvalResultStore) {
        this.evalStore.refresh()
      }
    })
  }

  /**
   * Expose the eval store for W3 wiring and testing.
   * @returns the service's eval result store.
   */
  getEvalStore(): EvalResultStore {
    return this.evalStore
  }

  /**
   * GA-GT1 Phase 3b (D5.2): resolve the semantic-layer root for a (optional)
   * scopeId. The active path's root value delegates to `ctx.schema.semanticRoot`,
   * but the 4-branch structure (undefined / registry-mounted hit / miss /
   * unmounted) is evidence-query's own local copy — semantically equivalent to
   * SemanticLayerService.resolveRoot, kept here so Phase 1/2 additive work
   * stays self-contained. Cleanup may centralize by making
   * SemanticLayerService.resolveRoot public and delegating to it.
   *
   * Branches:
   *  - scopeId undefined → `ctx.schema.semanticRoot` (active scope, current behavior).
   *  - scopeId provided + registry mounted + scope found → that scope's `semanticRoot`.
   *  - scopeId provided + registry mounted + scope NOT found → throw (fail-loud:
   *    refuse silent fallback to active scope to prevent cross-scope leak).
   *  - scopeId provided + registry unmounted → `ctx.schema.semanticRoot` (test stand-in fallback).
   * @param scopeId - optional scope id; omit for the active scope (backward-compatible).
   * @returns the resolved semantic-layer root path.
   */
  private resolveRoot(scopeId?: string): string {
    if (scopeId === undefined) return this.ctx.schema.semanticRoot
    const reg = this.ctx.get('scopes') as ScopeRegistryLike | undefined
    if (reg === undefined) return this.ctx.schema.semanticRoot // unmounted: fall back (test stand-in)
    const def = reg.get(scopeId)
    if (def !== undefined) return def.semanticRoot
    throw new Error(`ctx.evidenceQuery: scope "${scopeId}" not found in registry (intranet-security: refusing silent fallback to prevent cross-scope leak)`)
  }

  /**
   * Coverage query: delegates to the same logic as SchemaGateway.getCoverageStats()
   * but enriches with confirmation.status breakdown across all assets.
   * @param scopeId - GA-GT1 Phase 3b (D5.2): optional scope id; omit to use the active scope (backward-compatible).
   * @returns aggregated table/event/metric counts plus per-domain and confirmation-status tallies.
   */
  coverageQuery(scopeId?: string): EnrichedCoverageStats {
    const root = this.resolveRoot(scopeId)
    const tables = loadTables(root)
    const events = loadEvents(root)
    const metrics = loadMetricDefinitions(root)

    const domainCounts: Record<string, number> = {}
    const confirmation: { draft: number; confirmed: number; rejected: number } = {
      draft: 0,
      confirmed: 0,
      rejected: 0,
    }

    let tableCount = 0
    for (const t of tables) {
      const r = TableDefinitionSchema.safeParse(t.raw)
      if (!r.success) continue
      tableCount++
      const def = r.data
      for (const d of def.domains) domainCounts[d] = (domainCounts[d] ?? 0) + 1
      this.tallyConfirmation(def.confirmation.status, confirmation)
    }

    let eventCount = 0
    for (const e of events) {
      const r = EventDefinitionSchema.safeParse(e.raw)
      if (!r.success) continue
      eventCount++
      const def = r.data
      for (const d of def.domains) domainCounts[d] = (domainCounts[d] ?? 0) + 1
      this.tallyConfirmation(def.confirmation.status, confirmation)
    }

    for (const m of metrics) {
      for (const d of m.domains) domainCounts[d] = (domainCounts[d] ?? 0) + 1
    }

    return {
      table_count: tableCount,
      event_count: eventCount,
      metric_count: metrics.length,
      domain_counts: domainCounts,
      confirmation,
    }
  }

  private tallyConfirmation(
    status: string,
    acc: { draft: number; confirmed: number; rejected: number },
  ): void {
    if (status === 'confirmed') acc.confirmed++
    else if (status === 'rejected') acc.rejected++
    else acc.draft++
  }

  /**
   * Gap analysis: given an asset, compute which other assets are reachable via
   * RelationGraph joins but have no eval case coverage.
   * @param assetId - the source asset to compute reachable-but-uncovered gaps from.
   * @param scopeId - GA-GT1 Phase 3b (D5.2): optional scope id; omit to use the active scope (backward-compatible).
   * @returns the source asset plus the list of reachable assets lacking eval coverage (with join paths).
   */
  gapAnalysis(assetId: string, scopeId?: string): GapAnalysisResult {
    const graph = this.ctx.schema.getRelationGraph(scopeId)
    const reachable = this.bfsJoinReachable(graph, assetId)
    const gaps: GapEntry[] = []

    for (const [targetId, path] of reachable) {
      if (targetId === assetId) continue
      if (!this.evalStore.hasResultsFor(targetId)) {
        gaps.push({ assetId: targetId, joinPath: path })
      }
    }

    return { sourceAssetId: assetId, gaps }
  }

  /**
   * BFS over join edges from a source, returning all reachable nodes with
   * their shortest paths.
   */
  private bfsJoinReachable(graph: RelationGraph, sourceId: string): Map<string, string[]> {
    const visited = new Map<string, string[]>()
    visited.set(sourceId, [sourceId])
    const queue: string[] = [sourceId]

    while (queue.length > 0) {
      const current = queue.shift() as string
      const currentPath = visited.get(current) as string[]
      const edges = graph.getRelated(current, 'joins')
      for (const edge of edges) {
        if (visited.has(edge.targetId)) continue
        const newPath = [...currentPath, edge.targetId]
        visited.set(edge.targetId, newPath)
        queue.push(edge.targetId)
      }
    }

    return visited
  }

  /**
   * Reachability delta: "if we add this relation, which asset pairs become
   * newly reachable via joins?" Clones the current graph, adds the proposed
   * relation, and compares BFS reachability before/after.
   * @param newRelation - the proposed relation to add before recomputing reachability.
   * @param scopeId - GA-GT1 Phase 3b (D5.2): optional scope id; omit to use the active scope (backward-compatible).
   * @returns the proposed relation plus the asset pairs newly reachable via joins after adding it.
   */
  reachabilityDelta(newRelation: ProposedRelation, scopeId?: string): ReachabilityDeltaResult {
    const graph = this.ctx.schema.getRelationGraph(scopeId)

    // Compute current reachability sets for all nodes
    const allNodes = this.getAllAssetIds(scopeId)
    const beforeReachability = new Map<string, Set<string>>()
    for (const nodeId of allNodes) {
      const reachable = this.bfsJoinReachable(graph, nodeId)
      beforeReachability.set(nodeId, new Set(reachable.keys()))
    }

    // Build a new graph with the proposed relation added
    const augmentedGraph = this.buildAugmentedGraph(newRelation, scopeId)

    // Compute new reachability and diff
    const newlyReachable: ReachablePair[] = []
    for (const nodeId of allNodes) {
      const afterReachable = this.bfsJoinReachable(augmentedGraph, nodeId)
      const beforeSet = beforeReachability.get(nodeId) ?? new Set()
      for (const targetId of afterReachable.keys()) {
        if (!beforeSet.has(targetId)) {
          newlyReachable.push({ from: nodeId, to: targetId })
        }
      }
    }

    return { proposedRelation: newRelation, newlyReachable }
  }

  /**
   * Build an augmented RelationGraph with the proposed relation added.
   * Re-builds from scratch (same entries as the Service graph) plus the new relation.
   * @param newRelation - the proposed relation to add.
   * @param scopeId - GA-GT1 Phase 3b (D5.2): optional scope id for per-request scope root resolution.
   * @returns a fresh RelationGraph with all current relations plus the proposed one.
   */
  private buildAugmentedGraph(newRelation: ProposedRelation, scopeId?: string): RelationGraph {
    const root = this.resolveRoot(scopeId)
    const entries: { sourceId: string; relations: import('@deepseek-ai/dsh-semantic-layer/src/registry.ts').RelationDef[] }[] = []

    for (const t of loadTables(root)) {
      const r = TableDefinitionSchema.safeParse(t.raw)
      if (!r.success) continue
      const def = r.data
      const rels: import('@deepseek-ai/dsh-semantic-layer/src/registry.ts').RelationDef[] = []
      for (const ref of def.dimension_refs) {
        rels.push({ type: 'joins', target: ref.dim_table, on: ref.join_keys.map(k => `${k.dws_column} = ${k.dim_column}`).join(' AND ') })
      }
      entries.push({ sourceId: def.table_name, relations: rels })
    }

    for (const e of loadEvents(root)) {
      const r = EventDefinitionSchema.safeParse(e.raw)
      if (!r.success) continue
      const def = r.data
      const rels: import('@deepseek-ai/dsh-semantic-layer/src/registry.ts').RelationDef[] = []
      for (const ref of def.external_refs) {
        rels.push({ type: 'joins', target: ref.dim_table, on: ref.join_keys.map(k => `${k.dws_column} = ${k.dim_column}`).join(' AND ') })
      }
      entries.push({ sourceId: def.name, relations: rels })
    }

    for (const m of loadMetricDefinitions(root)) {
      const rels: import('@deepseek-ai/dsh-semantic-layer/src/registry.ts').RelationDef[] = []
      for (const rel of m.relations ?? []) {
        rels.push({ type: rel.type as 'joins' | 'derived_from' | 'related_to', target: rel.target })
      }
      entries.push({ sourceId: m.name, relations: rels })
    }

    // Add the proposed relation
    entries.push({
      sourceId: newRelation.sourceId,
      relations: [{
        type: newRelation.type,
        target: newRelation.targetId,
        ...(newRelation.on ? { on: newRelation.on } : {}),
      }],
    })

    const g = new RelationGraph()
    g.build(entries)
    return g
  }

  /**
   * Get all known asset ids from the semantic layer.
   * @param scopeId - GA-GT1 Phase 3b (D5.2): optional scope id for per-request scope root resolution.
   * @returns all table names, event names, and metric names in the resolved scope.
   */
  private getAllAssetIds(scopeId?: string): string[] {
    const root = this.resolveRoot(scopeId)
    const ids: string[] = []
    for (const t of loadTables(root)) {
      const r = TableDefinitionSchema.safeParse(t.raw)
      if (r.success) ids.push(r.data.table_name)
    }
    for (const e of loadEvents(root)) {
      const r = EventDefinitionSchema.safeParse(e.raw)
      if (r.success) ids.push(r.data.name)
    }
    for (const m of loadMetricDefinitions(root)) {
      ids.push(m.name)
    }
    return ids
  }

  /**
   * Eval result query: query persisted eval run results.
   * @param filters - the asset/status/domain/limit filters to apply.
   * @returns the matching eval result records plus the total count before limiting.
   */
  evalResultQuery(filters: EvalResultFilters): EvalResultQueryResult {
    return this.evalStore.query(filters)
  }

  /**
   * Before/after delta: compare two runs and return which cases flipped.
   * "Improved" = moved from fail/error → pass; "regressed" = moved from pass → fail/error.
   * @param runIdA - the baseline (before) run id.
   * @param runIdB - the comparison (after) run id.
   * @returns the run ids, the flipped cases, and improved/regressed/unchanged counts.
   */
  beforeAfterDelta(runIdA: string, runIdB: string): EvalDeltaReport {
    const recordsA = this.evalStore.getByRunId(runIdA)
    const recordsB = this.evalStore.getByRunId(runIdB)
    const mapA = new Map(recordsA.map(r => [r.caseId, r]))
    const mapB = new Map(recordsB.map(r => [r.caseId, r]))

    const flipped: EvalCaseFlip[] = []
    let improved = 0
    let regressed = 0
    let unchanged = 0

    const allCaseIds = new Set([...mapA.keys(), ...mapB.keys()])
    for (const caseId of allCaseIds) {
      const a = mapA.get(caseId)
      const b = mapB.get(caseId)
      if (!a || !b) continue

      if (a.status === b.status) {
        unchanged++
      } else {
        flipped.push({ caseId, before: a.status, after: b.status })
        if (b.status === 'pass' && a.status !== 'pass') improved++
        else if (a.status === 'pass' && b.status !== 'pass') regressed++
        else if (STATUS_RANK[b.status] > STATUS_RANK[a.status]) improved++
        else regressed++
      }
    }

    return { runIdA, runIdB, flipped, summary: { improved, regressed, unchanged } }
  }

  /**
   * Asset health: aggregate report for a single asset — confirmation status,
   * has_eval_coverage, relation_count, last_modified.
   * @param assetId - the table, event, or metric asset to report on.
   * @param scopeId - GA-GT1 Phase 3b (D5.2): optional scope id; omit to use the active scope (backward-compatible).
   * @returns the aggregate health report, or null when no table/event/metric matches assetId.
   */
  assetHealth(assetId: string, scopeId?: string): AssetHealthReport | null {
    const root = this.resolveRoot(scopeId)

    // Try to find the asset as a table
    for (const t of loadTables(root)) {
      const r = TableDefinitionSchema.safeParse(t.raw)
      if (!r.success) continue
      if (r.data.table_name === assetId) {
        const graph = this.ctx.schema.getRelationGraph(scopeId)
        const relations = graph.getRelated(assetId)
        return {
          assetId,
          confirmationStatus: r.data.confirmation.status,
          hasEvalCoverage: this.evalStore.hasResultsFor(assetId),
          relationCount: relations.length,
          lastModified: '',
        }
      }
    }

    // Try to find the asset as an event
    for (const e of loadEvents(root)) {
      const r = EventDefinitionSchema.safeParse(e.raw)
      if (!r.success) continue
      if (r.data.name === assetId) {
        const graph = this.ctx.schema.getRelationGraph(scopeId)
        const relations = graph.getRelated(assetId)
        return {
          assetId,
          confirmationStatus: r.data.confirmation.status,
          hasEvalCoverage: this.evalStore.hasResultsFor(assetId),
          relationCount: relations.length,
          lastModified: '',
        }
      }
    }

    // Try to find the asset as a metric (metrics have no confirmation field)
    for (const m of loadMetricDefinitions(root)) {
      if (m.name === assetId) {
        const graph = this.ctx.schema.getRelationGraph(scopeId)
        const relations = graph.getRelated(assetId)
        return {
          assetId,
          confirmationStatus: 'n/a',
          hasEvalCoverage: this.evalStore.hasResultsFor(assetId),
          relationCount: relations.length,
          lastModified: '',
        }
      }
    }

    return null
  }
}

export default EvidenceQueryService

export function apply(ctx: Context, config: EvidenceQueryConfig = {}): void {
  new EvidenceQueryService(ctx, config)
}

export { EvidenceQueryGateway } from './gateway.ts'
