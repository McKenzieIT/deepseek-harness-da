/**
 * `matchAliases` — the scope-routing alias matcher (src/aliases.ts).
 *
 * The module exports one function; `isCjk` / `isCjkAlias` / `aliasMatches` are
 * module-private, so every arm below is driven through `matchAliases`'s public
 * surface (message + scope alias entries) rather than by reaching inside.
 *
 * Covers:
 *  (a) CJK aliases match by plain containment (no word-boundary rule), across
 *      all four accepted code-point ranges: BMP CJK (U+4E00–U+9FFF), Extension A
 *      (U+3400–U+4DBF), Extension B (U+20000–U+2A6DF), and CJK Symbols &
 *      Punctuation (U+3000–U+303F).
 *  (b) ASCII aliases require word boundaries on BOTH sides: a match at index 0
 *      has no preceding character, a match mid-text inspects the following
 *      character, and an occurrence glued to a word character is skipped so the
 *      scan continues from the next index.
 *  (c) a duplicate scope id is recorded once in `scope_ids` while every matching
 *      alias is still reported.
 *
 * Run: pnpm vitest run packages/data/tool-scope-routing/tests/aliases.spec.ts
 */
import { describe, expect, it } from 'vitest'
import { matchAliases, type ScopeAliasEntry } from '../src/aliases.ts'

describe('matchAliases — CJK aliases match by containment', () => {
  it('matches a BMP CJK alias glued to an ASCII token (no word boundary required)', () => {
    const scopes: readonly ScopeAliasEntry[] = [{ id: 'genshin', aliases: ['原神'] }]
    // "原神" is immediately followed by 'A', a word character: the ASCII
    // boundary rule would reject this, CJK containment accepts it.
    expect(matchAliases('原神ARPU是多少', scopes)).toEqual({
      matched: true,
      scope_ids: ['genshin'],
      matched_aliases: ['原神'],
      is_multi_scope: false,
    })
  })

  it('recognizes Extension-A, Extension-B and CJK-punctuation aliases as CJK', () => {
    // U+3400 (Extension A), U+20000 (Extension B — a surrogate pair that the
    // for..of iteration yields as a single code point), U+3007 (CJK Symbols &
    // Punctuation). Each alias is a single character from exactly one range, so
    // that range's test is the one that decides.
    const scopes: readonly ScopeAliasEntry[] = [
      { id: 'ext-a', aliases: ['㐀'] },
      { id: 'ext-b', aliases: ['𠀀'] },
      { id: 'punct', aliases: ['〇'] },
    ]
    // Every occurrence is followed by an ASCII digit, so the ASCII boundary
    // rule would reject all three — only CJK containment matches them.
    expect(matchAliases('区服㐀1、𠀀2、〇3的数据', scopes)).toEqual({
      matched: true,
      scope_ids: ['ext-a', 'ext-b', 'punct'],
      matched_aliases: ['㐀', '𠀀', '〇'],
      is_multi_scope: true,
    })
  })

  it('reports no match when the CJK alias is absent from the message', () => {
    expect(matchAliases('今天的流水是多少', [{ id: 'genshin', aliases: ['原神'] }])).toEqual({
      matched: false,
      scope_ids: [],
      matched_aliases: [],
      is_multi_scope: false,
    })
  })
})

describe('matchAliases — ASCII aliases require word boundaries', () => {
  it('matches an alias at the start of the message and checks the following character', () => {
    // pos === 0 → there is no preceding character to test; the following
    // character is a space, which is a word boundary.
    expect(matchAliases('alpha server load', [{ id: 's1', aliases: ['alpha'] }])).toEqual({
      matched: true,
      scope_ids: ['s1'],
      matched_aliases: ['alpha'],
      is_multi_scope: false,
    })
  })

  it('skips an occurrence glued to a word character and keeps scanning for a bounded one', () => {
    const scopes: readonly ScopeAliasEntry[] = [{ id: 's1', aliases: ['alpha'] }]
    // "alphabet" contains "alpha" but is followed by 'b' → rejected, the scan
    // resumes at the next index and finds the standalone "alpha".
    expect(matchAliases('alphabet then alpha', scopes)).toEqual({
      matched: true,
      scope_ids: ['s1'],
      matched_aliases: ['alpha'],
      is_multi_scope: false,
    })
    // With no standalone occurrence left, the rescan runs out of candidates.
    expect(matchAliases('alphabet', scopes)).toEqual({
      matched: false,
      scope_ids: [],
      matched_aliases: [],
      is_multi_scope: false,
    })
  })

  it('matches case-insensitively when the alias is delimited by punctuation', () => {
    expect(matchAliases('load (ALPHA).', [{ id: 's1', aliases: ['alpha'] }])).toEqual({
      matched: true,
      scope_ids: ['s1'],
      matched_aliases: ['alpha'],
      is_multi_scope: false,
    })
  })
})

describe('matchAliases — scope id de-duplication', () => {
  it('records a repeated scope id once while reporting every matching alias', () => {
    const scopes: readonly ScopeAliasEntry[] = [
      { id: 'dup', aliases: ['alpha'] },
      { id: 'dup', aliases: ['beta'] },
    ]
    expect(matchAliases('alpha and beta', scopes)).toEqual({
      matched: true,
      scope_ids: ['dup'],
      matched_aliases: ['alpha', 'beta'],
      is_multi_scope: false,
    })
  })

  it('stops at the first matching alias of a scope (one alias reported per scope)', () => {
    const scopes: readonly ScopeAliasEntry[] = [{ id: 's1', aliases: ['alpha', 'beta'] }]
    expect(matchAliases('alpha and beta', scopes)).toEqual({
      matched: true,
      scope_ids: ['s1'],
      matched_aliases: ['alpha'],
      is_multi_scope: false,
    })
  })
})
