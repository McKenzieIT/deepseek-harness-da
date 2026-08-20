/**
 * D2c keep/regress baseline runner.
 *
 * Measures deterministic-prefetch recall + ambiguity over the synthetic
 * corpus/cases, using the reimplemented shipped retrieval logic (hybrid.mjs).
 * Runs three configurations to document the production default + neighbours:
 *   1. DEFAULT HYBRID   — BM25 + FakeHash + RRF            (P5b production default)
 *   2. BM25-ONLY        — InferenceError -> degradation     (FakeHash-unavailable bound)
 *   3. DEFAULT + RERANK — + FakeReranker post-RRF peer       (reranker effect)
 *
 * topK = 5 (the search_data_sources tool default). Recall:
 *   strict   = ALL gold ids in top-K (the agent gets every table it needs)
 *   loose   = ANY gold id in top-K
 *   coverage = avg |gold ∩ top-K| / |gold|
 * Ambiguity = question-level tag (intrinsic multi-plausibility), independent
 * of the retrieval result — reported as its own rate + as a recall split.
 *
 * DOCUMENTATION ONLY — synthetic corpus + BM25/FakeHash (no real embedder);
 * NOT a decision driver (the keep/regress decision is keep+defer, on the
 * asymmetry argument, not on these numbers).
 */
import { readFileSync } from 'node:fs'
import { HybridRetriever, FakeHashEmbedder, BrokenEmbedder, FakeReranker } from './hybrid.mjs'

const corpus = JSON.parse(readFileSync(new URL('./corpus.json', import.meta.url), 'utf8'))
const cases = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8'))
const TOPK = 5

async function measure(label, embedder, opts = {}) {
  const r = new HybridRetriever(corpus, embedder, opts)
  const perCase = []
  for (const c of cases) {
    const hits = await r.retrieve(c.question, { topK: TOPK })
    const topIds = hits.map((h) => h.id)
    const goldHit = c.gold.filter((g) => topIds.includes(g))
    perCase.push({
      id: c.id, question: c.question, gold: c.gold, ambiguous: c.ambiguous,
      intent: c.intent, mode: c.mode, top: topIds, goldHit,
      strict: goldHit.length === c.gold.length && c.gold.length > 0,
      loose: goldHit.length > 0,
      coverage: c.gold.length ? goldHit.length / c.gold.length : 0,
    })
  }
  const n = perCase.length
  const strict = perCase.filter((c) => c.strict).length
  const loose = perCase.filter((c) => c.loose).length
  const coverage = perCase.reduce((s, c) => s + c.coverage, 0) / n
  const ambigN = perCase.filter((c) => c.ambiguous).length
  const ambigStrict = perCase.filter((c) => c.ambiguous && c.strict).length
  const clearN = n - ambigN
  const clearStrict = perCase.filter((c) => !c.ambiguous && c.strict).length
  console.log(`\n=== ${label} (topK=${TOPK}, corpus=${corpus.length}, cases=${n}) ===`)
  console.log(`strict recall (all gold in top-${TOPK}): ${strict}/${n} = ${(strict / n * 100).toFixed(1)}%`)
  console.log(`loose recall  (any gold in top-${TOPK}): ${loose}/${n} = ${(loose / n * 100).toFixed(1)}%`)
  console.log(`gold coverage (avg):                   ${(coverage * 100).toFixed(1)}%`)
  console.log(`ambiguity rate (question-level):        ${ambigN}/${n} = ${(ambigN / n * 100).toFixed(1)}%`)
  console.log(`  strict recall | clear: ${clearStrict}/${clearN} (${clearN ? (clearStrict / clearN * 100).toFixed(1) : 0}%) | ambiguous: ${ambigStrict}/${ambigN} (${ambigN ? (ambigStrict / ambigN * 100).toFixed(1) : 0}%)`)
  console.log('per-case:')
  for (const c of perCase) {
    const mark = c.strict ? 'OK ' : c.loose ? '~  ' : 'MISS'
    console.log(`  [${mark}] ${c.id} [${c.intent}/${c.mode}${c.ambiguous ? ' AMBIG' : ''}] "${c.question}"`)
    console.log(`        gold=[${c.gold.join(',')}] top${TOPK}=[${c.top.join(',')}] hit=[${c.goldHit.join(',')}] cov=${(c.coverage * 100).toFixed(0)}%`)
  }
  return { label, n, strict, loose, coverage, ambig: ambigN, ambigStrict, clearStrict, clearN }
}

const a = await measure('DEFAULT HYBRID (BM25 + FakeHash + RRF) — P5b production default', FakeHashEmbedder)
const b = await measure('BM25-ONLY (InferenceError -> degradation)', BrokenEmbedder)
const c = await measure('DEFAULT HYBRID + FakeReranker (post-RRF peer)', FakeHashEmbedder, { reranker: FakeReranker })

console.log('\n=== SUMMARY ===')
for (const m of [a, b, c]) {
  console.log(`${m.label.split(' — ')[0]}: strict ${m.strict}/${m.n} (${(m.strict / m.n * 100).toFixed(1)}%) | loose ${m.loose}/${m.n} (${(m.loose / m.n * 100).toFixed(1)}%) | cov ${(m.coverage * 100).toFixed(1)}% | ambiguity ${m.ambig}/${m.n} (${(m.ambig / m.n * 100).toFixed(1)}%)`)
}
console.log('\nNotes:')
console.log('- Ambiguity is a QUESTION-LEVEL tag (intrinsic multi-plausibility), measured independent of retrieval.')
console.log('- Case set is a deliberately ambiguity-heavy stress test (8/25=32%), NOT representative of RBI 161 distribution.')
console.log('- Numbers are BM25(+FakeHash) over a 30-item synthetic corpus; low external validity. DOCUMENTATION ONLY, not a decision driver.')
