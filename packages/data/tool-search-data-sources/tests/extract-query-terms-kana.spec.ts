/**
 * CL4 — extractQueryTerms kana broadening. The `cjkRe` (.test) and `cjkSegs`
 * (.match) regexes in tool-search-data-sources/src/index.ts were broadened to
 * include the hiragana (぀-ゟ) + katakana (゠-ヿ) blocks so Japanese kana
 * segments are not dropped during alias-resolution term extraction. This spec
 * proves kana segments are kept (whole token + overlapping bigrams) for both
 * pure-kana and mixed kana/ASCII tokens.
 *
 * Run: `npx vitest run packages/data/tool-search-data-sources/tests/extract-query-terms-kana.spec.ts`
 */
import { test, expect } from 'vitest'
import { extractQueryTerms } from '../src/index.ts'

test('CL4 — extractQueryTerms keeps hiragana segment (whole token + bigrams)', () => {
  const terms = extractQueryTerms('あいうえお')
  expect(terms.length).toBeGreaterThan(0)
  // cjkRe now matches kana → whole token + overlapping bigrams
  expect(terms).toContain('あいうえお')
  expect(terms).toContain('あい')
  expect(terms).toContain('えお')
})

test('CL4 — extractQueryTerms keeps katakana segment (whole token + bigrams)', () => {
  const terms = extractQueryTerms('アイウエオ')
  expect(terms.length).toBeGreaterThan(0)
  expect(terms).toContain('アイウエオ')
  expect(terms).toContain('アイ')
  expect(terms).toContain('エオ')
})

test('CL4 — extractQueryTerms extracts kana segments from mixed kana/ASCII tokens', () => {
  const terms = extractQueryTerms('アイウabc')
  // mixed token → cjkSegs isolates the katakana run + emits bigrams
  expect(terms).toContain('アイウ')
  expect(terms).toContain('アイ')
  expect(terms).toContain('イウ')
  expect(terms).toContain('abc')
})

test('CL4 — extractQueryTerms does not regress for pure CJK ideograph tokens', () => {
  const terms = extractQueryTerms('日活跃用户')
  expect(terms).toContain('日活跃用户')
  expect(terms).toContain('日活')
  expect(terms).toContain('用户')
})
