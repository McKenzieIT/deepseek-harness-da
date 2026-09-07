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

/** GraphSnapshot */
export interface GraphSnapshot {
  readonly level: string
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
  readonly snapshotLevel: string
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
