/**
 * Text similarity for the two fuzzy sites in the eval. The two are deliberately
 * separate (P11b decision 2): the **derailment** check is rbi's
 * `_turn_matches_expectation` (token + char-trigram overlap, take the max,
 * `≥ 0.35` — deliberately lenient because the agent may paraphrase and the
 * terminal assertions carry the real signal), while the **DELIVERY** fuzzy
 * layer (da-fresh; rbi-eval has no DELIVERY dimension) hardens the short-answer
 * false-positive the prototype surfaced (`gameX` vs `gameA` shared 2/3 trigrams
 * and passed): for a short expected (≤ `shortTrigramFloor` trigrams, i.e. ≤5
 * chars) it requires **token-containment** (every expected token is a substring
 * of the reply — `gameX` lacks `gamea` → fail; `the game is gamea` contains it
 * → pass), and for a longer expected it keeps the trigram overlap threshold.
 *
 * Naming note: rbi's `_turn_matches_expectation` calls `_char_ngrams(text, 3)`
 * — **trigrams** (n=3) — but names the variable `bigrams`; the research doc and
 * G2 ticket say "token/bigram", which is imprecise. This module follows the
 * source (trigrams, n=3).
 *
 * @module @deepseek-ai/dsh-eval/text_sim
 */

/** rbi's deliberate leniency threshold for the non-terminal derailment check (CJK char-trigrams). */
const DERAILMENT_THRESHOLD = 0.35

/**
 * English (whitespace-delimited Latin) derailment preset. Word-level token
 * overlap is denser than char-trigrams for space-delimited prose, so the
 * derailment bar is raised to 0.55 for Latin text (vs the 0.35 CJK default).
 */
export const ENGLISH_DERAILMENT_THRESHOLD = 0.55

/** ≤ this many char-trigrams in the expected (i.e. ≤5 chars) ⇒ DELIVERY uses token-containment. */
const SHORT_TRIGRAM_FLOOR = 3

/** DELIVERY trigram-overlap threshold for longer expected answers. */
const DELIVERY_THRESHOLD = 0.35

/**
 * Extract character n-grams from text (lowercased + trimmed). For text shorter
 * than `n` the whole string is the sole gram (mirrors rbi `_char_ngrams`); for
 * an empty string the set is empty.
 * @param text - the text to gram.
 * @param n - the gram length (3 for the trigram used here).
 * @returns the set of char n-grams.
 */
export function charNgrams(text: string, n: number): Set<string> {
  const t = text.toLowerCase().trim()
  if (t.length < n) return t.length > 0 ? new Set([t]) : new Set()
  const s = new Set<string>()
  for (let i = 0; i <= t.length - n; i++) s.add(t.slice(i, i + n))
  return s
}

/** Tunable knobs for {@link turnMatchesExpectation}; defaults preserve rbi's 0.35 calibration. */
export interface TurnMatchOpts {
  /**
   * `max(token overlap, char-trigram overlap) ≥` this ⇒ on-script. Default 0.35
   * (rbi's CJK char-trigram calibration); use {@link ENGLISH_DERAILMENT_THRESHOLD}
   * (0.55) or {@link derailmentThresholdFor} for whitespace-delimited Latin text.
   */
  readonly derailmentThreshold?: number
}

/**
 * rbi's non-terminal derailment check: `max(token overlap, char-trigram
 * overlap) ≥ derailmentThreshold` (default 0.35). Token overlap is
 * substring-containment (a token is matched if it appears in the actual
 * reply); trigram overlap is the intersection over the expected trigram set.
 * Deliberately lenient — the terminal L1/DELIVERY assertions carry the real
 * pass/fail signal. Pass `opts.derailmentThreshold` (e.g.
 * {@link ENGLISH_DERAILMENT_THRESHOLD} or {@link derailmentThresholdFor}) to
 * recalibrate for non-CJK text; absent, the rbi 0.35 default is used.
 * @param actualReply - the agent's reply this turn.
 * @param expectedContent - the scripted assistant turn content.
 * @param opts - optional tunables (testing / language preset).
 * @returns whether the reply is broadly on-script.
 */
export function turnMatchesExpectation(actualReply: string, expectedContent: string, opts?: TurnMatchOpts): boolean {
  const actualLower = String(actualReply).toLowerCase().trim()
  const expectedLower = String(expectedContent).toLowerCase().trim()
  if (actualLower === expectedLower) return true
  if (expectedLower.length === 0) return true

  const expectedTokens = new Set(expectedLower.split(/\s+/).filter(t => t.length >= 2))
  let tokenRatio = 0
  if (expectedTokens.size > 0) {
    let matched = 0
    for (const t of expectedTokens) if (actualLower.includes(t)) matched++
    tokenRatio = matched / expectedTokens.size
  }

  // expected is non-empty (passed the check above) ⇒ charNgrams yields ≥1 gram.
  const expectedTrigrams = charNgrams(expectedLower, 3)
  const actualTrigrams = charNgrams(actualLower, 3)
  let inter = 0
  for (const g of expectedTrigrams) if (actualTrigrams.has(g)) inter++
  const trigramRatio = inter / expectedTrigrams.size

  const threshold = opts?.derailmentThreshold ?? DERAILMENT_THRESHOLD
  return Math.max(tokenRatio, trigramRatio) >= threshold
}

/**
 * Pick a derailment threshold for the expected content. Returns
 * {@link ENGLISH_DERAILMENT_THRESHOLD} (0.55) when the expected is
 * whitespace-delimited Latin (space-separated words that are mostly ASCII
 * letters — char-trigrams are a poor proxy for word-level similarity there, so
 * the bar is raised) and the rbi CJK default (0.35) otherwise (unspaced CJK,
 * single words, or non-Latin scripts).
 * @param expected - the scripted assistant turn content.
 * @returns the derailment threshold to thread to {@link turnMatchesExpectation}.
 */
export function derailmentThresholdFor(expected: string): number {
  const t = expected.toLowerCase().trim()
  if (t.length === 0) return DERAILMENT_THRESHOLD
  const hasSpace = /\s/.test(t)
  const asciiLetters = (t.match(/[a-z]/g) ?? []).length
  const isLatin = asciiLetters / t.length >= 0.5
  return hasSpace && isLatin ? ENGLISH_DERAILMENT_THRESHOLD : DERAILMENT_THRESHOLD
}

/** Tunable knobs for {@link deliveryFuzzyMatch}; all default to rbi/decision-2 values. */
export interface DeliveryFuzzyOpts {
  /** ≤ this many char-trigrams in the expected ⇒ token-containment. Default 3 (≤5 chars). */
  readonly shortTrigramFloor?: number
  /** Trigram-overlap threshold for longer expected answers. Default 0.35. */
  readonly threshold?: number
}

/**
 * DELIVERY fuzzy match (da-fresh, decision 2). For a **short** expected
 * (≤ `shortTrigramFloor` trigrams) every expected token (len≥2) must be a
 * substring of the reply (token-containment: `gameX` lacks `gamea` → fail;
 * `the game is gamea` → pass); for a longer expected, char-trigram overlap
 * `≥ threshold` (paraphrase tolerance for prose). Trivial equality and an empty
 * expected always match.
 * @param actualReply - the agent's `finalResponse`.
 * @param expectedContent - the expected DELIVERY answer text.
 * @param opts - optional tunables (testing).
 * @returns whether the DELIVERY answer is acceptable.
 */
export function deliveryFuzzyMatch(actualReply: string, expectedContent: string, opts?: DeliveryFuzzyOpts): boolean {
  const actualLower = String(actualReply).toLowerCase().trim()
  const expectedLower = String(expectedContent).toLowerCase().trim()
  if (actualLower === expectedLower) return true
  if (expectedLower.length === 0) return true

  const floor = opts?.shortTrigramFloor ?? SHORT_TRIGRAM_FLOOR
  const expectedTrigrams = charNgrams(expectedLower, 3)

  if (expectedTrigrams.size <= floor) {
    const expectedTokens = new Set(expectedLower.split(/\s+/).filter(t => t.length >= 2))
    if (expectedTokens.size > 0) {
      for (const t of expectedTokens) if (!actualLower.includes(t)) return false
      return true
    }
    // No len≥2 tokens (e.g. a single CJK char): fall through to trigram overlap.
  }

  // expected is non-empty ⇒ expectedTrigrams has ≥1 gram (no division by zero).
  const threshold = opts?.threshold ?? DELIVERY_THRESHOLD
  const actualTrigrams = charNgrams(actualLower, 3)
  let inter = 0
  for (const g of expectedTrigrams) if (actualTrigrams.has(g)) inter++
  return inter / expectedTrigrams.size >= threshold
}
