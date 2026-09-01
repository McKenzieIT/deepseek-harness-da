/**
 * P14b post-retrieval ontology enrichment — granularity detection and soft rerank.
 *
 * Trend intent detection via regex keyword matching + soft rerank that boosts
 * `_di` (daily increment) candidates ×1.5 for trend queries without removing
 * any candidates.
 *
 * @module @deepseek-ai/dsh-nl2sql-engine/src/granularity
 */

import type { RetrievalHit } from './bm25-linking.ts'

const TREND_PATTERNS: RegExp[] = [
  /趋势|变化|逐日|每天|近\d+天|日均|环比|同比|每周|每月|增长|下降|走势/,
  // eslint-disable-next-line @stylistic/max-len
  /\btrend\b|\bchange\b|\bdaily\b|\bweekly\b|\bmonthly\b|\bgrowth\b|\bdecline\b|over\s+time|week[\s-]over[\s-]week|month[\s-]over[\s-]month/i,
]

/**
 * Detect whether a question expresses trend intent (time-series / temporal
 * comparison). Uses a regex keyword list from P14 grilling resolution.
 * @param question - the natural-language question to classify.
 * @returns true when the question expresses trend/time-series intent.
 */
export function detectTrendIntent(question: string): boolean {
  return TREND_PATTERNS.some(p => p.test(question))
}

const DI_SUFFIX = /_di$/

/**
 * Soft rerank: when `isTrend` is true, boost `_di` candidates' scores by ×1.5
 * and re-sort descending. No candidates are removed (soft prefer only).
 * When `isTrend` is false, returns candidates unchanged.
 * @param candidates - the BM25 retrieval hits to rerank.
 * @param isTrend - whether trend intent was detected (enables _di boosting).
 * @returns the (possibly boosted + re-sorted) candidate list, or the input unchanged when not a trend query.
 */
export function rerankByGranularity(candidates: readonly RetrievalHit[], isTrend: boolean): readonly RetrievalHit[] {
  if (!isTrend) return candidates
  const boosted = candidates.map((c) => {
    if (DI_SUFFIX.test(c.id)) {
      return { ...c, score: c.score * 1.5 }
    }
    return c
  })
  return boosted.slice().sort((a, b) => b.score - a.score)
}
