// PROTOTYPE (throwaway) — P11 eval harness · text similarity (fuzzy).
// 1:1 translation of rbi session.py _turn_matches_expectation + _char_ngrams.
// Hybrid: token overlap (Latin/whitespace, tokens len>=2, substring-contained) + char TRIGRAM overlap
// (CJK, no spaces), take the max. Threshold 0.35 — deliberately lenient: the agent may paraphrase but
// stay on-script; the terminal assertions (EXECUTION/DELIVERY) carry the real pass/fail signal.
//
// NAMING NOTE: rbi names the variable `bigrams` but calls `_char_ngrams(text, 3)` -> TRIGRAMS. The
// research doc + G2 ticket say "token/bigram" (imprecise). The SOURCE is char 3-grams. Prototype
// follows the source (trigrams, n=3); README flags this discrepancy. Extraction to its own module
// breaks what would otherwise be an import cycle (scoring -> delivery -> session -> scoring).

export function charNgrams(text, n) {
  text = text.toLowerCase().trim()
  if (text.length < n) return text ? new Set([text]) : new Set()
  const s = new Set()
  for (let i = 0; i <= text.length - n; i++) s.add(text.slice(i, i + n))
  return s
}

export function turnMatchesExpectation(actualReply, expectedContent) {
  const actualLower = String(actualReply).toLowerCase().trim()
  const expectedLower = String(expectedContent).toLowerCase().trim()

  // Trivial equality / empty-expected-always-matches.
  if (actualLower === expectedLower) return true
  if (!expectedLower) return true

  // Token overlap (Latin / mixed text with spaces). rbi: tokens len>=2, `if t in actual_lower`.
  const expectedTokens = new Set(
    expectedLower.split(/\s+/).filter((t) => t.length >= 2)
  )
  let tokenRatio = 0
  if (expectedTokens.size) {
    let matched = 0
    for (const t of expectedTokens) if (actualLower.includes(t)) matched++
    tokenRatio = matched / expectedTokens.size
  }

  // Char trigram overlap (CJK text without spaces).
  let trigramRatio = 0
  const expectedTrigrams = charNgrams(expectedLower, 3)
  if (expectedTrigrams.size) {
    const actualTrigrams = charNgrams(actualLower, 3)
    let inter = 0
    for (const g of expectedTrigrams) if (actualTrigrams.has(g)) inter++
    trigramRatio = inter / expectedTrigrams.size
  }

  return Math.max(tokenRatio, trigramRatio) >= 0.35
}
