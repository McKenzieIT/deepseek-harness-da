import { readFileSync } from 'node:fs'
import { load as parseYaml } from 'js-yaml'
import { buildGraphSnapshot } from './graph-snapshot.ts'
import { runRetrieval, computeQueryCoverage } from './blending.ts'
import { computeRetrievalMetrics, aggregateMetrics } from './metrics.ts'
import type {
  ExperimentOptions,
  ExperimentConfig,
  ComparisonTable,
  ExperimentResult,
  CaseRetrievalResult,
  GraphSnapshot,
  GraphSnapshotConfig,
} from './types.ts'

interface MinimalCase {
  readonly caseId: string
  readonly question: string
  readonly coveredAssets: readonly string[]
}

function loadMinimalCase(path: string): MinimalCase {
  const text = readFileSync(path, 'utf-8')
  const raw = parseYaml(text) as Record<string, unknown>
  const caseId = raw.case_id as string
  const input = raw.input as { question: string }
  const dims = raw.dimensions as { covered_assets?: string[] } | undefined
  return {
    caseId,
    question: input.question,
    coveredAssets: dims?.covered_assets ?? [],
  }
}

const LEVEL_CONFIGS: Record<string, GraphSnapshotConfig> = {
  L0: { stripAliases: true, stripConcepts: true },
  L1: {},
}

export function runExperiment(opts: ExperimentOptions): ComparisonTable {
  const cases = opts.casePaths.map(loadMinimalCase)

  const snapshotCache = new Map<string, GraphSnapshot>()
  function getSnapshot(level: string): GraphSnapshot {
    let snap = snapshotCache.get(level)
    if (!snap) {
      const config = LEVEL_CONFIGS[level] ?? {}
      snap = buildGraphSnapshot(opts.semanticRoot, config, level)
      snapshotCache.set(level, snap)
    }
    return snap
  }

  const results: ExperimentResult[] = []

  for (const config of opts.configs) {
    const snapshot = getSnapshot(config.snapshotLevel)
    const caseResults: CaseRetrievalResult[] = []

    for (const c of cases) {
      if (c.coveredAssets.length === 0) continue

      const candidates = runRetrieval(snapshot, c.question, config.topK, config.blending)
      const retrievedIds = candidates.map(r => r.id)
      const { precisionAtK, recallAtK } = computeRetrievalMetrics(retrievedIds, c.coveredAssets, config.topK)
      const queryCoverage = computeQueryCoverage(snapshot.graph, c.question)

      caseResults.push({
        caseId: c.caseId,
        query: c.question,
        coveredAssets: c.coveredAssets,
        retrievedIds,
        precisionAtK,
        recallAtK,
        queryCoverage,
      })
    }

    results.push({
      config,
      cases: caseResults,
      aggregate: aggregateMetrics(caseResults),
    })
  }

  return { results, timestamp: new Date().toISOString() }
}

function configLabel(config: ExperimentConfig): string {
  const blend = config.blending
  switch (blend.mode) {
    case 'strategy-b':
      return `${config.snapshotLevel} / strategy-b(boost=${blend.aliasBoost ?? 2.0})`
    case 'hard-switch':
      return `${config.snapshotLevel} / hard-switch(t=${blend.threshold ?? 0.5})`
    case 'continuous-blend':
      return `${config.snapshotLevel} / continuous-blend`
  }
}

export function formatComparisonTable(table: ComparisonTable): string {
  const lines: string[] = []
  const header = '| Config                                  | Mean P@K | Mean R@K | Median R@K |'
  const sep =    '|-----------------------------------------|----------|----------|------------|'
  lines.push(header, sep)

  for (const r of table.results) {
    const label = configLabel(r.config).padEnd(39)
    const mp = r.aggregate.meanPrecision.toFixed(3).padStart(8)
    const mr = r.aggregate.meanRecall.toFixed(3).padStart(8)
    const mdr = r.aggregate.medianRecall.toFixed(3).padStart(10)
    lines.push(`| ${label} | ${mp} | ${mr} | ${mdr} |`)
  }

  return lines.join('\n')
}
