export {
  buildGraphSnapshot,
  snapshotLevel0,
  snapshotLevel1,
  snapshotLevel2,
  snapshotLevel3,
} from './graph-snapshot.ts'

export {
  extractQueryTerms,
  computeQueryCoverage,
  strategyB,
  hardSwitch,
  continuousBlend,
  runRetrieval,
} from './blending.ts'

export {
  computeRetrievalMetrics,
  aggregateMetrics,
} from './metrics.ts'

export {
  runExperiment,
  formatComparisonTable,
} from './harness.ts'

export type {
  ConceptDef,
  GraphSnapshotConfig,
  GraphSnapshot,
  GraphSnapshotStats,
  BlendingMode,
  BlendingConfig,
  RetrievalCandidate,
  CaseRetrievalResult,
  ExperimentConfig,
  AggregateMetrics,
  ExperimentResult,
  ComparisonTable,
  ExperimentOptions,
} from './types.ts'
