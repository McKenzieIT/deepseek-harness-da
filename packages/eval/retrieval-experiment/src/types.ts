import type { RelationGraph } from '@deepseek-ai/dsh-semantic-layer/src/relation-graph.ts'
import type { Bm25Linker } from '@deepseek-ai/dsh-nl2sql-engine/src/bm25-linking.ts'

export interface ConceptDef {
  readonly name: string
  readonly description?: string
  readonly pref_label?: string
  readonly alt_labels?: readonly string[]
}

export interface GraphSnapshotConfig {
  readonly stripAliases?: boolean | undefined
  readonly stripConcepts?: boolean | undefined
  readonly extraAliases?: ReadonlyMap<string, readonly string[]> | undefined
  readonly extraConcepts?: readonly ConceptDef[] | undefined
}

export interface GraphSnapshotStats {
  readonly nodeCount: number
  readonly aliasCount: number
  readonly conceptCount: number
}

export interface GraphSnapshot {
  readonly level: string
  readonly graph: RelationGraph
  readonly linker: Bm25Linker
  readonly stats: GraphSnapshotStats
}

export type BlendingMode = 'strategy-b' | 'hard-switch' | 'continuous-blend'

export interface BlendingConfig {
  readonly mode: BlendingMode
  readonly threshold?: number | undefined
  readonly aliasBoost?: number | undefined
}

export interface RetrievalCandidate {
  readonly id: string
  readonly score: number
  readonly mode: string
}

export interface CaseRetrievalResult {
  readonly caseId: string
  readonly query: string
  readonly coveredAssets: readonly string[]
  readonly retrievedIds: readonly string[]
  readonly precisionAtK: number
  readonly recallAtK: number
  readonly queryCoverage: number
}

export interface ExperimentConfig {
  readonly snapshotLevel: string
  readonly blending: BlendingConfig
  readonly topK: number
}

export interface AggregateMetrics {
  readonly meanPrecision: number
  readonly meanRecall: number
  readonly medianRecall: number
}

export interface ExperimentResult {
  readonly config: ExperimentConfig
  readonly cases: readonly CaseRetrievalResult[]
  readonly aggregate: AggregateMetrics
}

export interface ComparisonTable {
  readonly results: readonly ExperimentResult[]
  readonly timestamp: string
}

export interface ExperimentOptions {
  readonly semanticRoot: string
  readonly casePaths: readonly string[]
  readonly configs: readonly ExperimentConfig[]
}
