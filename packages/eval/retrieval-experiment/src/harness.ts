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
  SnapshotLevel,
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

/** Exhaustiveness check — turns a forgotten `case` in `configForLevel`'s
 *  switch into a compile error so a future `SnapshotLevel` addition forces
 *  this switch to be updated rather than silently falling through. */
function assertNever(level: never): never {
  throw new Error(`unknown snapshot level: ${String(level)}`)
}

/**
 * Resolve the {@link GraphSnapshotConfig} for a coverage level. Replaces the
 * silent `LEVEL_CONFIGS[level] ?? {}` lookup, which treated `'L2'`/`'L3'`/typos
 * as the empty `{}` config (degrading to L1 semantics with no signal).
 *
 * `'L0'`/`'L1'` are the experiment-harness-supported levels (no runtime args).
 * `'L2'`/`'L3'` need `extraAliases`/`extraConcepts` (see `snapshotLevel2`/
 * `snapshotLevel3` in graph-snapshot.ts) which an `ExperimentConfig` cannot
 * carry, so they throw here rather than silently degrading. Typos are excluded
 * by the `SnapshotLevel` union at the type boundary; the `assertNever` arm is
 * the runtime defence for any union member this switch forgets to handle.
 * @param level - the snapshot coverage level.
 * @returns the config to hand to buildGraphSnapshot.
 */
function configForLevel(level: SnapshotLevel): GraphSnapshotConfig {
  switch (level) {
    case 'L0':
      return { stripAliases: true, stripConcepts: true }
    case 'L1':
      return {}
    case 'L2':
    case 'L3':
      throw new Error(
        `snapshot level ${level} requires runtime args (extraAliases/extraConcepts) `
        + 'not carried by ExperimentConfig — use snapshotLevel2/snapshotLevel3 from '
        + 'graph-snapshot.ts directly, not the experiment harness',
      )
    default:
      return assertNever(level)
  }
}

/**
 *  runExperiment
 * @param opts - opts
 * @returns the result
 */
export function runExperiment(opts: ExperimentOptions): ComparisonTable {
  const cases = opts.casePaths.map(loadMinimalCase)

  const snapshotCache = new Map<SnapshotLevel, GraphSnapshot>()
  function getSnapshot(level: SnapshotLevel): GraphSnapshot {
    let snap = snapshotCache.get(level)
    if (!snap) {
      const config = configForLevel(level)
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

/**
 *  formatComparisonTable
 * @param table - table
 * @returns the result
 */
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
