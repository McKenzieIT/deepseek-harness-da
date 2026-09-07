import type { RelationGraph } from '@deepseek-ai/dsh-semantic-layer/src/relation-graph.ts'
import type { Bm25Linker } from '@deepseek-ai/dsh-nl2sql-engine/src/bm25-linking.ts'

/** ConceptDef */
export interface ConceptDef {
  readonly name: string
  readonly description?: string
  readonly pref_label?: string
  readonly alt_labels?: readonly string[]
}

/** GraphSnapshotConfig */
export interface GraphSnapshotConfig {
  readonly stripAliases?: boolean | undefined
  readonly stripConcepts?: boolean | undefined
  readonly extraAliases?: ReadonlyMap<string, readonly string[]> | undefined
  readonly extraConcepts?: readonly ConceptDef[] | undefined
}

/** GraphSnapshotStats */
export interface GraphSnapshotStats {
  readonly nodeCount: number
  readonly aliasCount: number
  readonly conceptCount: number
}

/**
 * The closed set of graph snapshot coverage levels. `'L0'|'L1'` are the
 * experiment-harness-supported levels (carry no runtime args); `'L2'|'L3'`
 * require runtime `extraAliases`/`extraConcepts` (see `snapshotLevel2`/
 * `snapshotLevel3` in graph-snapshot.ts) and are rejected by the experiment
 * harness. The union is closed so a typo like `'L0 '`/`'l0'`/`'L4'` fails at the
 * type boundary instead of silently degrading to the empty `{}` config.
 */
export type SnapshotLevel = 'L0' | 'L1' | 'L2' | 'L3'

/** GraphSnapshot */
export interface GraphSnapshot {
  readonly level: SnapshotLevel
  readonly graph: RelationGraph
  readonly linker: Bm25Linker
  readonly stats: GraphSnapshotStats
}

/** BlendingMode */
export type BlendingMode = 'strategy-b' | 'hard-switch' | 'continuous-blend'

/** BlendingConfig */
export interface BlendingConfig {
  readonly mode: BlendingMode
  readonly threshold?: number | undefined
  readonly aliasBoost?: number | undefined
}

/** RetrievalCandidate */
export interface RetrievalCandidate {
  readonly id: string
  readonly score: number
  readonly mode: string
}

/** CaseRetrievalResult */
export interface CaseRetrievalResult {
  readonly caseId: string
  readonly query: string
  readonly coveredAssets: readonly string[]
  readonly retrievedIds: readonly string[]
  readonly precisionAtK: number
  readonly recallAtK: number
  readonly queryCoverage: number
}

/** ExperimentConfig */
export interface ExperimentConfig {
  readonly snapshotLevel: SnapshotLevel
  readonly blending: BlendingConfig
  readonly topK: number
}

/** AggregateMetrics */
export interface AggregateMetrics {
  readonly meanPrecision: number
  readonly meanRecall: number
  readonly medianRecall: number
}

/** ExperimentResult */
export interface ExperimentResult {
  readonly config: ExperimentConfig
  readonly cases: readonly CaseRetrievalResult[]
  readonly aggregate: AggregateMetrics
}

/** ComparisonTable */
export interface ComparisonTable {
  readonly results: readonly ExperimentResult[]
  readonly timestamp: string
}

/** ExperimentOptions */
export interface ExperimentOptions {
  readonly semanticRoot: string
  readonly casePaths: readonly string[]
  readonly configs: readonly ExperimentConfig[]
}
