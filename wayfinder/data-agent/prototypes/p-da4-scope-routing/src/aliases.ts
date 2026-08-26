/**
 * Scope alias matching — word-boundary case-insensitive matching against scope
 * metadata aliases. The ScopeDefinition metadata gains an `aliases` field:
 *
 * ```yaml
 * # ~/.dsh/data/scopes.yaml
 * scopes:
 *   '10000251':
 *     semanticRoot: ./examples/k11-semantic-layer
 *     metadata:
 *       name: K11 大逃杀
 *       description: K11 大逃杀手游事件分析
 *       aliases: [K11, 大逃杀, k11]
 *   '10000334':
 *     semanticRoot: ./examples/x63-semantic-layer
 *     metadata:
 *       name: X63 射击
 *       description: X63 射击手游事件分析（司测）
 *       aliases: [X63, x63, 射击]
 * ```
 *
 * Matching algorithm: word-boundary case-insensitive substring. An alias matches
 * if it appears in the user message bounded by non-alphanumeric chars (or
 * string boundaries). Chinese aliases match as exact substrings (no word-boundary
 * — CJK characters are their own word boundaries).
 *
 * @module @deepseek-ai/dsh-tool-scope-routing/aliases
 */

import type { AliasMatchResult } from './types.ts'

/** Characters that constitute word boundaries for latin aliases. */
const WORD_BOUNDARY = /[^a-zA-Z0-9_]/

/** Check if a character is CJK (Chinese/Japanese/Korean). */
function isCjk(char: string): boolean {
  const code = char.codePointAt(0) ?? 0
  return (code >= 0x4E00 && code <= 0x9FFF)
    || (code >= 0x3400 && code <= 0x4DBF)
    || (code >= 0x20000 && code <= 0x2A6DF)
    || (code >= 0x3000 && code <= 0x303F)
}

/** Check if an alias is predominantly CJK. */
function isCjkAlias(alias: string): boolean {
  return [...alias].some(isCjk)
}

/**
 * Test whether `alias` appears in `text` at a word boundary (latin) or as an
 * exact substring (CJK). Case-insensitive for latin.
 */
function aliasMatches(text: string, alias: string): boolean {
  if (isCjkAlias(alias)) {
    return text.includes(alias)
  }
  const lowerText = text.toLowerCase()
  const lowerAlias = alias.toLowerCase()
  let idx = 0
  while (true) {
    const pos = lowerText.indexOf(lowerAlias, idx)
    if (pos === -1) return false
    const before = pos === 0 || WORD_BOUNDARY.test(lowerText[pos - 1])
    const afterPos = pos + lowerAlias.length
    const after = afterPos >= lowerText.length || WORD_BOUNDARY.test(lowerText[afterPos])
    if (before && after) return true
    idx = pos + 1
  }
}

export interface ScopeAliasEntry {
  readonly id: string
  readonly aliases: readonly string[]
}

/**
 * Match a user message against all registered scope aliases.
 * @param message - the user's natural-language message.
 * @param scopes - all registered scopes with their aliases.
 * @returns match result with matched scope_ids and alias strings.
 */
export function matchAliases(message: string, scopes: readonly ScopeAliasEntry[]): AliasMatchResult {
  const matched_scope_ids: string[] = []
  const matched_aliases: string[] = []

  for (const scope of scopes) {
    for (const alias of scope.aliases) {
      if (aliasMatches(message, alias)) {
        if (!matched_scope_ids.includes(scope.id)) {
          matched_scope_ids.push(scope.id)
        }
        matched_aliases.push(alias)
        break
      }
    }
  }

  return {
    matched: matched_scope_ids.length > 0,
    scope_ids: matched_scope_ids,
    matched_aliases,
    is_multi_scope: matched_scope_ids.length > 1,
  }
}
