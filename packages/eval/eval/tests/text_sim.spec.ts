import { describe, expect, it } from 'vitest'
import { charNgrams, deliveryFuzzyMatch, derailmentThresholdFor, ENGLISH_DERAILMENT_THRESHOLD, turnMatchesExpectation } from '../src/text_sim.ts'

describe('charNgrams', () => {
  it('returns the whole string as the sole gram when shorter than n', () => {
    expect(charNgrams('ab', 3)).toEqual(new Set(['ab']))
  })
  it('returns an empty set for an empty/whitespace string', () => {
    expect(charNgrams('   ', 3).size).toBe(0)
  })
  it('returns the trigrams for a longer string', () => {
    expect(charNgrams('abcde', 3)).toEqual(new Set(['abc', 'bcd', 'cde']))
  })
})

describe('turnMatchesExpectation (derailment, rbi ≥0.35)', () => {
  it('matches on trivial equality', () => {
    expect(turnMatchesExpectation('hello', 'hello')).toBe(true)
  })
  it('an empty expected always matches', () => {
    expect(turnMatchesExpectation('anything', '')).toBe(true)
  })
  it('matches via token overlap (Latin paraphrase)', () => {
    expect(turnMatchesExpectation('the revenue trend is up', 'revenue trend')).toBe(true)
  })
  it('matches via char-trigram overlap (CJK, no spaces)', () => {
    expect(turnMatchesExpectation('收入最高的游戏是游戏a', '收入最高游戏')).toBe(true)
  })
  it('fails when both token + trigram overlap are <0.35', () => {
    expect(turnMatchesExpectation('今天天气真不错啊', '收入最高游戏')).toBe(false)
  })
  it('falls through the token guard when expected has no len≥2 tokens (single CJK char → trigram 0)', () => {
    // expected "好" has 0 tokens len≥2 → tokenRatio stays 0 → trigram ('好' vs '好好好' = 0) → false.
    expect(turnMatchesExpectation('好好好', '好')).toBe(false)
  })
  it('injecting a higher threshold (0.55) flips a 0.5-overlap reply from pass to fail', () => {
    // 2/4 char-trigrams overlap (0.5) — passes the default 0.35, fails the injected 0.55.
    const actual = '收入最高的游戏是游戏a'
    const expected = '收入最高游戏'
    expect(turnMatchesExpectation(actual, expected)).toBe(true)
    expect(turnMatchesExpectation(actual, expected, { derailmentThreshold: 0.55 })).toBe(false)
  })
  it('injecting a lower threshold (0.2) flips a 0.333-overlap reply from fail to pass', () => {
    // 2/6 char-trigrams overlap (0.333) — fails the default 0.35, passes the injected 0.2.
    const actual = 'abcxdef'
    const expected = 'abcdefgh'
    expect(turnMatchesExpectation(actual, expected)).toBe(false)
    expect(turnMatchesExpectation(actual, expected, { derailmentThreshold: 0.2 })).toBe(true)
  })
})

describe('derailmentThresholdFor (language preset)', () => {
  it('ENGLISH_DERAILMENT_THRESHOLD is 0.55', () => {
    expect(ENGLISH_DERAILMENT_THRESHOLD).toBe(0.55)
  })
  it('returns the English preset (0.55) for whitespace-delimited Latin text', () => {
    expect(derailmentThresholdFor('the revenue trend is up')).toBe(ENGLISH_DERAILMENT_THRESHOLD)
    expect(derailmentThresholdFor('Hello World Foo Bar')).toBe(ENGLISH_DERAILMENT_THRESHOLD)
  })
  it('returns the CJK default (0.35) for unspaced CJK, single words, or non-Latin', () => {
    expect(derailmentThresholdFor('收入最高游戏')).toBe(0.35)
    expect(derailmentThresholdFor('hello')).toBe(0.35)
    expect(derailmentThresholdFor('')).toBe(0.35)
  })
})

describe('deliveryFuzzyMatch (DELIVERY; short token-containment, decision 2)', () => {
  it('matches on trivial equality', () => {
    expect(deliveryFuzzyMatch('gameA', 'gameA')).toBe(true)
  })
  it('an empty expected always matches', () => {
    expect(deliveryFuzzyMatch('anything', '')).toBe(true)
  })
  it('short expected: gameX ≠ gameA (token-containment hardens the 2/3 trigram false-positive)', () => {
    expect(deliveryFuzzyMatch('gameX', 'gameA')).toBe(false)
  })
  it('short expected: a paraphrase that contains the expected token passes', () => {
    expect(deliveryFuzzyMatch('the game is gamea', 'gameA')).toBe(true)
  })
  it('longer expected: trigram overlap ≥ threshold passes (non-equal, exercises the trigram path)', () => {
    expect(deliveryFuzzyMatch('根据查询，销量第一是游戏a，其次是游戏b', '销量第一是游戏A')).toBe(true)
  })
  it('longer expected: no trigram overlap fails', () => {
    expect(deliveryFuzzyMatch('完全无关的另外一个答案内容', '销量第一是游戏A')).toBe(false)
  })
  it('short expected with no len≥2 tokens falls through to trigram overlap', () => {
    // expected "a b" splits to 1-char tokens only → token-containment skipped → trigram.
    expect(deliveryFuzzyMatch('x a b y', 'a b')).toBe(true)
  })
  it('honors a raised threshold option (high-but-not-full overlap < raised threshold)', () => {
    // 5/6 trigram overlap (0.833) < 0.99 → fail at the raised threshold; ≥0.35 at default.
    expect(deliveryFuzzyMatch('销量第一是游戏x', '销量第一是游戏A', { threshold: 0.99 })).toBe(false)
  })
})
