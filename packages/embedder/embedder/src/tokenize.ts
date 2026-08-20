/**
 * Shared CJK-aware tokenizer (rbi `embedder.tokenize` fallback mirror).
 *
 * ASCII runs → lowercased words; CJK runs → unigrams + bigrams. Used by the
 * FakeHash embedder (hash projection) and the in-process retrieval provider
 * (BM25 corpus + query). A production tokenizer (nodejieba) is a deferred
 * upgrade; this fallback is deterministic + zero-dependency (P5 prototype
 * + P13b `bm25-linking.ts` use the same shape).
 *
 * @module @deepseek-ai/dsh-embedder/src/tokenize
 */
export function tokenize(text: string): string[] {
  if (!text) return []
  const tokens: string[] = []
  let cjk = ''
  let asc = ''
  const flushCjk = () => {
    if (!cjk) return
    if (cjk.length === 1) tokens.push(cjk)
    else for (let i = 0; i < cjk.length - 1; i++) tokens.push(cjk.slice(i, i + 2))
    cjk = ''
  }
  const flushAsc = () => {
    if (asc) {
      tokens.push(asc.toLowerCase())
      asc = ''
    }
  }
  for (const ch of text) {
    const cc = ch.codePointAt(0) ?? 0
    const isCjk = cc >= 0x4e00 && cc <= 0x9fff
    const isAlnum = /[a-z0-9]/i.test(ch)
    if (isCjk) {
      flushAsc()
      cjk += ch
    } else if (isAlnum) {
      flushCjk()
      asc += ch
    } else {
      flushCjk()
      flushAsc()
    }
  }
  flushCjk()
  flushAsc()
  return tokens
}
