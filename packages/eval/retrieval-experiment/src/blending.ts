import type { RelationGraph } from '@deepseek-ai/dsh-semantic-layer/src/relation-graph.ts'
import type { RetrievalHit } from '@deepseek-ai/dsh-nl2sql-engine/src/bm25-linking.ts'
import { expandCandidates } from '@deepseek-ai/dsh-nl2sql-engine/src/ontology.ts'
import type { GraphSnapshot, BlendingConfig, RetrievalCandidate } from './types.ts'

const DEFAULT_ALIAS_BOOST = 2.0

/**
 * Extract meaningful terms from a query for alias resolution.
 * Improved over tool-search-data-sources: handles mixed CJK/ASCII content
 * by splitting at CJK/non-CJK boundaries before generating bigrams.
 */
export function extractQueryTerms(query: string): string[] {
  const tokens = query
    .split(/[\s,，。？！?!、;；：:()（）\[\]【】{}]+/)
    .filter(t => t.length >= 2)
  const out: string[] = []
  const cjkRe = /^[一-鿿㐀-䶿]+$/
  for (const t of tokens) {
    if (cjkRe.test(t)) {
      out.push(t)
      if (t.length >= 3) {
        for (let i = 0; i < t.length - 1; i++) {
          out.push(t.slice(i, i + 2))
        }
      }
    } else {
      out.push(t)
      const asciiTokens = t.match(/[A-Za-z_][A-Za-z0-9_]*/g)
      if (asciiTokens) {
        for (const at of asciiTokens) {
          if (at.length >= 2) out.push(at.toLowerCase())
        }
      }
      const cjkSegs = t.match(/[一-鿿㐀-䶿]+/g)
      if (cjkSegs) {
        for (const seg of cjkSegs) {
          if (seg.length >= 2) out.push(seg)
          if (seg.length >= 3) {
            for (let i = 0; i < seg.length - 1; i++) {
              out.push(seg.slice(i, i + 2))
            }
          }
        }
      }
    }
  }
  return out
}

/**
 * Fraction of query terms that resolve to at least one node via the graph's
 * alias index. 0 = no alias coverage, 1 = every term hits.
 */
export function computeQueryCoverage(graph: RelationGraph, query: string): number {
  const terms = extractQueryTerms(query)
  if (terms.length === 0) return 0
  let hits = 0
  for (const term of terms) {
    if (graph.resolveAlias(term).length > 0) hits++
  }
  return hits / terms.length
}

function projectCandidate(h: RetrievalHit): RetrievalCandidate {
  return { id: h.id, score: h.score, mode: h.mode }
}

/**
 * Strategy B (current production behavior): BM25 + alias boost fusion +
 * graph expansion. Control group for the experiment.
 */
export function strategyB(
  snapshot: GraphSnapshot,
  query: string,
  topK: number,
  config: BlendingConfig,
): RetrievalCandidate[] {
  const boost = config.aliasBoost ?? DEFAULT_ALIAS_BOOST
  const hits = snapshot.linker.retrieve(query, { topK, mode: 'bm25-only' })
  const boosted = applyAliasFusion(snapshot.graph, hits, query, boost)
  const expanded = expandCandidates(
    boosted,
    snapshot.graph,
    topK,
  )
  return expanded.map(projectCandidate)
}

function applyAliasFusion(
  graph: RelationGraph,
  candidates: readonly RetrievalHit[],
  query: string,
  boost: number,
): RetrievalHit[] {
  const terms = extractQueryTerms(query)
  if (terms.length === 0) return [...candidates]

  const aliasHits = new Map<string, number>()
  for (const term of terms) {
    for (const id of graph.resolveAlias(term)) {
      aliasHits.set(id, (aliasHits.get(id) ?? 0) + 1)
    }
  }
  if (aliasHits.size === 0) return [...candidates]

  const out: RetrievalHit[] = candidates.map((c) => {
    const hitCount = aliasHits.get(c.id)
    if (hitCount === undefined) return c
    const capped = Math.min(hitCount, 2)
    return { ...c, score: c.score * boost * capped, mode: 'alias-boosted' }
  })

  const seen = new Set(out.map(c => c.id))
  for (const [id, hitCount] of aliasHits) {
    if (seen.has(id)) continue
    const capped = Math.min(hitCount, 2)
    out.push({ id, score: boost * capped, payload: undefined, mode: 'alias-resolved' })
    seen.add(id)
  }

  out.sort((a, b) => b.score - a.score)
  return out
}

/**
 * Hard switch: if query coverage >= threshold, return subgraph-only candidates;
 * otherwise return pure BM25 candidates. No fusion.
 */
export function hardSwitch(
  snapshot: GraphSnapshot,
  query: string,
  topK: number,
  config: BlendingConfig,
): RetrievalCandidate[] {
  const threshold = config.threshold ?? 0.5
  const coverage = computeQueryCoverage(snapshot.graph, query)

  if (coverage >= threshold) {
    return subgraphCandidates(snapshot.graph, query, topK)
  }
  const hits = snapshot.linker.retrieve(query, { topK, mode: 'bm25-only' })
  const expanded = expandCandidates(
    [...hits],
    snapshot.graph,
    topK,
  )
  return expanded.map(projectCandidate)
}

function subgraphCandidates(
  graph: RelationGraph,
  query: string,
  topK: number,
): RetrievalCandidate[] {
  const terms = extractQueryTerms(query)
  const nodeScores = new Map<string, number>()

  for (const term of terms) {
    for (const id of graph.resolveAlias(term)) {
      nodeScores.set(id, (nodeScores.get(id) ?? 0) + 1)
    }
  }

  const seen = new Set(nodeScores.keys())
  const neighbors: { id: string; score: number }[] = []
  for (const [id, score] of nodeScores) {
    for (const edge of graph.getRelated(id)) {
      if (seen.has(edge.targetId)) continue
      seen.add(edge.targetId)
      neighbors.push({ id: edge.targetId, score: score * 0.5 })
    }
  }

  const all = [
    ...[...nodeScores.entries()].map(([id, score]) => ({ id, score, mode: 'subgraph-direct' as const })),
    ...neighbors.map(n => ({ ...n, mode: 'subgraph-neighbor' as const })),
  ]
  all.sort((a, b) => b.score - a.score)
  return all.slice(0, topK)
}

/**
 * Continuous blend: final_score = coverage × graph_score + (1 - coverage) × bm25_score.
 * Coverage is the fraction of query terms resolved by aliases.
 */
export function continuousBlend(
  snapshot: GraphSnapshot,
  query: string,
  topK: number,
  _config: BlendingConfig,
): RetrievalCandidate[] {
  const coverage = computeQueryCoverage(snapshot.graph, query)

  const bm25Hits = snapshot.linker.retrieve(query, { topK: topK * 2, mode: 'bm25-only' })
  const maxBm25 = bm25Hits[0]?.score ?? 1

  const graphHits = new Map<string, number>()
  const terms = extractQueryTerms(query)
  for (const term of terms) {
    for (const id of snapshot.graph.resolveAlias(term)) {
      graphHits.set(id, (graphHits.get(id) ?? 0) + 1)
    }
  }
  const maxGraph = Math.max(...graphHits.values(), 1)

  const merged = new Map<string, { score: number; mode: string }>()

  for (const h of bm25Hits) {
    const bm25Component = (1 - coverage) * (h.score / maxBm25)
    const graphComponent = coverage * ((graphHits.get(h.id) ?? 0) / maxGraph)
    merged.set(h.id, { score: bm25Component + graphComponent, mode: graphComponent > 0 ? 'blended' : 'bm25-only' })
  }

  for (const [id, hitCount] of graphHits) {
    if (merged.has(id)) continue
    const graphComponent = coverage * (hitCount / maxGraph)
    merged.set(id, { score: graphComponent, mode: 'graph-only' })
  }

  const sorted = [...merged.entries()]
    .map(([id, { score, mode }]) => ({ id, score, mode }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)

  const asHits: RetrievalHit[] = sorted.map(s => ({ id: s.id, score: s.score, payload: undefined, mode: s.mode }))
  const expanded = expandCandidates(
    asHits,
    snapshot.graph,
    topK,
  )
  return expanded.map(projectCandidate)
}

/**
 * Unified retrieval entry point — dispatches to the appropriate blending variant.
 */
export function runRetrieval(
  snapshot: GraphSnapshot,
  query: string,
  topK: number,
  config: BlendingConfig,
): RetrievalCandidate[] {
  switch (config.mode) {
    case 'strategy-b': return strategyB(snapshot, query, topK, config)
    case 'hard-switch': return hardSwitch(snapshot, query, topK, config)
    case 'continuous-blend': return continuousBlend(snapshot, query, topK, config)
  }
}
