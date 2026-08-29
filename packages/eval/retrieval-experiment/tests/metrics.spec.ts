import { describe, expect, it } from 'vitest'
import { computeRetrievalMetrics, aggregateMetrics } from '../src/metrics.ts'

describe('computeRetrievalMetrics', () => {
  it('computes correct precision and recall for a known case', () => {
    const retrieved = ['a', 'b', 'c', 'd', 'e']
    const covered = ['a', 'c', 'f']
    const { precisionAtK, recallAtK } = computeRetrievalMetrics(retrieved, covered, 5)
    expect(precisionAtK).toBeCloseTo(2 / 5)
    expect(recallAtK).toBeCloseTo(2 / 3)
  })

  it('returns recall=1 when covered_assets is empty (vacuously true)', () => {
    const { precisionAtK, recallAtK } = computeRetrievalMetrics(['a', 'b'], [], 5)
    expect(precisionAtK).toBe(0)
    expect(recallAtK).toBe(1)
  })

  it('returns both 0 when retrieved is empty', () => {
    const { precisionAtK, recallAtK } = computeRetrievalMetrics([], ['a', 'b'], 5)
    expect(precisionAtK).toBe(0)
    expect(recallAtK).toBe(0)
  })

  it('handles perfect retrieval', () => {
    const { precisionAtK, recallAtK } = computeRetrievalMetrics(['a', 'b'], ['a', 'b'], 2)
    expect(precisionAtK).toBe(1)
    expect(recallAtK).toBe(1)
  })

  it('truncates to K when retrieved has more items', () => {
    const retrieved = ['a', 'x', 'y', 'b']
    const covered = ['a', 'b']
    const { precisionAtK, recallAtK } = computeRetrievalMetrics(retrieved, covered, 2)
    expect(precisionAtK).toBeCloseTo(1 / 2)
    expect(recallAtK).toBeCloseTo(1 / 2)
  })
})

describe('aggregateMetrics', () => {
  it('computes mean and median for multiple cases', () => {
    const cases = [
      { caseId: 'a', query: '', coveredAssets: [], retrievedIds: [], precisionAtK: 0.2, recallAtK: 0.5, queryCoverage: 0 },
      { caseId: 'b', query: '', coveredAssets: [], retrievedIds: [], precisionAtK: 0.4, recallAtK: 0.7, queryCoverage: 0 },
      { caseId: 'c', query: '', coveredAssets: [], retrievedIds: [], precisionAtK: 0.6, recallAtK: 0.9, queryCoverage: 0 },
    ]
    const agg = aggregateMetrics(cases)
    expect(agg.meanPrecision).toBeCloseTo(0.4)
    expect(agg.meanRecall).toBeCloseTo(0.7)
    expect(agg.medianRecall).toBeCloseTo(0.7)
  })

  it('returns zeros for empty input', () => {
    const agg = aggregateMetrics([])
    expect(agg.meanPrecision).toBe(0)
    expect(agg.meanRecall).toBe(0)
    expect(agg.medianRecall).toBe(0)
  })

  it('median handles even-count correctly', () => {
    const cases = [
      { caseId: 'a', query: '', coveredAssets: [], retrievedIds: [], precisionAtK: 0, recallAtK: 0.2, queryCoverage: 0 },
      { caseId: 'b', query: '', coveredAssets: [], retrievedIds: [], precisionAtK: 0, recallAtK: 0.8, queryCoverage: 0 },
    ]
    const agg = aggregateMetrics(cases)
    expect(agg.medianRecall).toBeCloseTo(0.5)
  })
})
