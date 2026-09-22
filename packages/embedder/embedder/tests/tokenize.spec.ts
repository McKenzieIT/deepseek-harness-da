/**
 * tokenize — the CJK-run length boundary.
 *
 * A CJK run of one character has no adjacent pair, so it emits that character
 * as a UNIGRAM; runs of two or more emit every adjacent pair as a bigram. Both
 * arms are load-bearing for retrieval: dropping the unigram would make a
 * single-character term (`日`) tokenize to nothing, so BM25 would score it zero
 * and the FakeHash projection would hash an empty token set — a query that
 * silently matches nothing.
 *
 * The ASCII/bigram shapes are pinned by the FakeHash provider's suite
 * (packages/embedder/embedder-fakehash/tests/fakehash.spec.ts); these specs
 * pin the run-length arms and the flush boundaries between them.
 *
 * Run: `pnpm vitest run packages/embedder/embedder`
 */
import { expect, test } from 'vitest'
import { tokenize } from '@deepseek-ai/dsh-embedder'

test('empty input yields no tokens', () => {
  expect(tokenize('')).toEqual([])
})

test('a lone CJK character emits itself as a unigram', () => {
  expect(tokenize('日')).toEqual(['日'])
})

test('a two-character CJK run emits one bigram, not two unigrams', () => {
  expect(tokenize('日活')).toEqual(['日活'])
})

test('a one-character CJK run flushed by an ASCII neighbour still emits a unigram', () => {
  expect(tokenize('日DAU')).toEqual(['日', 'dau'])
  expect(tokenize('DAU日')).toEqual(['dau', '日'])
})

test('a separator flushes each CJK run on its own length', () => {
  expect(tokenize('日 活跃')).toEqual(['日', '活跃'])
})
