import type { AggregateMetrics, CaseRetrievalResult } from './types.ts'

export function computeRetrievalMetrics(
  retrievedIds: readonly string[],
  coveredAssets: readonly string[],
  k: number,
): { precisionAtK: number; recallAtK: number } {
  if (coveredAssets.length === 0) {
    return { precisionAtK: 0, recallAtK: 1 }
  }
  const topK = retrievedIds.slice(0, k)
  const coveredSet = new Set(coveredAssets)
  let hits = 0
  for (const id of topK) {
    if (coveredSet.has(id)) hits++
  }
  return {
    precisionAtK: k > 0 ? hits / k : 0,
    recallAtK: hits / coveredAssets.length,
  }
}

export function aggregateMetrics(cases: readonly CaseRetrievalResult[]): AggregateMetrics {
  if (cases.length === 0) {
    return { meanPrecision: 0, meanRecall: 0, medianRecall: 0 }
  }
  const precisions = cases.map(c => c.precisionAtK)
  const recalls = cases.map(c => c.recallAtK)
  const meanPrecision = precisions.reduce((a, b) => a + b, 0) / precisions.length
  const meanRecall = recalls.reduce((a, b) => a + b, 0) / recalls.length
  const sorted = [...recalls].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const medianRecall = sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0)
  return { meanPrecision, meanRecall, medianRecall }
}
