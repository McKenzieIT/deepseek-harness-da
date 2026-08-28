/**
 * FakeHash embedder provider — pure-logic unit specs (no Cordis context).
 *
 * The Service wrapper (`FakeHashEmbedder.embed` = `texts.map(hashVec)`) is
 * trivial; these specs pin the hash projection + tokenizer + recall reranker
 * behavior that the retrieval provider's hybrid mechanism depends on.
 *
 * Run: `pnpm vitest run packages/embedder/embedder-fakehash`
 */
import { test, expect } from 'vitest'
import { tokenize, hashVec } from '../src/index.ts'

test('tokenize: ASCII words lowercased + CJK bigrams', () => {
  expect(tokenize('hello world')).toEqual(['hello', 'world'])
  expect(tokenize('DAU 日活')).toEqual(['dau', '日活'])
  expect(tokenize('营收总额')).toEqual(['营收', '收总', '总额']) // 4 CJK -> 3 bigrams
  expect(tokenize('')).toEqual([])
})

test('hashVec: dim + L2-normalized + deterministic', () => {
  const v = hashVec('营收', 256)
  expect(v.length).toBe(256)
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
  expect(norm).toBeCloseTo(1, 6) // L2-normalized for non-empty text
  expect(hashVec('营收', 256)).toEqual(v) // deterministic
})

test('hashVec: distinct texts produce distinct vectors', () => {
  expect(hashVec('营收', 64)).not.toEqual(hashVec('充值', 64))
})
