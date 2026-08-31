/**
 * CL4 — CJK tokenizer kana broadening. The `tokenize` regex in
 * bm25-linking.ts was broadened to include the hiragana (぀-ゟ) + katakana
 * (゠-ヿ) blocks so Japanese kana queries are not silently dropped. This spec
 * proves kana text emits unigram AND bigram tokens (the existing CJK unigram/
 * bigram logic now also covers kana).
 *
 * Run: `npx vitest run packages/data/nl2sql-engine/tests/tokenize-kana.spec.ts`
 */
import { test, expect } from 'vitest'
import { tokenize } from '../src/bm25-linking.ts'

test('CL4 — tokenize emits unigram + bigram tokens for hiragana text', () => {
  const tokens = tokenize('あいうえお')
  expect(tokens.length).toBeGreaterThan(0)
  // 5 unigrams (one per char) + 4 overlapping bigrams = 9 tokens, no ASCII
  expect(tokens).toEqual([
    'あ', 'い', 'う', 'え', 'お',
    'あい', 'いう', 'うえ', 'えお',
  ])
})

test('CL4 — tokenize emits unigram + bigram tokens for katakana text', () => {
  const tokens = tokenize('アイウエオ')
  expect(tokens.length).toBeGreaterThan(0)
  expect(tokens).toEqual([
    'ア', 'イ', 'ウ', 'エ', 'オ',
    'アイ', 'イウ', 'ウエ', 'エオ',
  ])
})

test('CL4 — tokenize does not regress for CJK ideographs', () => {
  const tokens = tokenize('日活跃用户')
  expect(tokens).toContain('日')
  expect(tokens).toContain('用户')
})
