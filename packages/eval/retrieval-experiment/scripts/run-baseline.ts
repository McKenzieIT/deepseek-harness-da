/**
 * CL-5 baseline experiment: L0 vs L1 × 3 blending strategies × 120 cases.
 * Run with: npx tsx packages/eval/retrieval-experiment/scripts/run-baseline.ts
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { runExperiment, formatComparisonTable } from '../src/index.ts'
import type { ExperimentConfig } from '../src/types.ts'

const semanticRoot = join(import.meta.dirname!, '../../../../examples/k11-semantic-layer')
const casesDir = join(import.meta.dirname!, '../../../eval/eval/cases/k11-v2')

const casePaths = readdirSync(casesDir)
  .filter(f => f.endsWith('.yaml'))
  .sort()
  .map(f => join(casesDir, f))

console.log(`Cases: ${casePaths.length}`)
console.log(`Semantic root: ${semanticRoot}`)
console.log()

const topK = 20

const configs: ExperimentConfig[] = [
  // L0: pure BM25 baseline (no aliases, no concepts)
  { snapshotLevel: 'L0', blending: { mode: 'strategy-b' }, topK },
  { snapshotLevel: 'L0', blending: { mode: 'hard-switch', threshold: 0.5 }, topK },
  { snapshotLevel: 'L0', blending: { mode: 'continuous-blend' }, topK },

  // L1: current state (10 concepts, existing alt_labels)
  { snapshotLevel: 'L1', blending: { mode: 'strategy-b' }, topK },
  { snapshotLevel: 'L1', blending: { mode: 'hard-switch', threshold: 0.3 }, topK },
  { snapshotLevel: 'L1', blending: { mode: 'hard-switch', threshold: 0.5 }, topK },
  { snapshotLevel: 'L1', blending: { mode: 'hard-switch', threshold: 0.7 }, topK },
  { snapshotLevel: 'L1', blending: { mode: 'continuous-blend' }, topK },
]

console.log(`Configs: ${configs.length}`)
console.log('Running experiment...\n')

const table = runExperiment({ semanticRoot, casePaths, configs })

console.log(formatComparisonTable(table))
console.log()

// Per-strategy breakdown: original cases vs alias-dependent cases
for (const result of table.results) {
  const label = `${result.config.snapshotLevel}/${result.config.blending.mode}`
  const original = result.cases.filter(c => !c.caseId.includes('alias'))
  const alias = result.cases.filter(c => c.caseId.includes('alias'))

  const avgR = (cs: typeof original) => cs.length > 0
    ? (cs.reduce((s, c) => s + c.recallAtK, 0) / cs.length).toFixed(3)
    : 'N/A'
  const avgCov = (cs: typeof original) => cs.length > 0
    ? (cs.reduce((s, c) => s + c.queryCoverage, 0) / cs.length).toFixed(3)
    : 'N/A'

  console.log(`${label}: original R@${topK}=${avgR(original)} (n=${original.length}), alias R@${topK}=${avgR(alias)} (n=${alias.length}), avg coverage: original=${avgCov(original)}, alias=${avgCov(alias)}`)
}
