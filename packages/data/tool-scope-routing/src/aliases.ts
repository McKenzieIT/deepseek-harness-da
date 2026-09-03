import type { AliasMatchResult } from './types.ts'

const WORD_BOUNDARY = /[^a-zA-Z0-9_]/

function isCjk(char: string): boolean {
  const code = char.codePointAt(0) ?? 0
  return (code >= 0x4E00 && code <= 0x9FFF)
    || (code >= 0x3400 && code <= 0x4DBF)
    || (code >= 0x20000 && code <= 0x2A6DF)
    || (code >= 0x3000 && code <= 0x303F)
}

function isCjkAlias(alias: string): boolean {
  for (const char of alias) {
    if (isCjk(char)) return true
  }
  return false
}

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
    const charBefore = pos > 0 ? lowerText[pos - 1] : undefined
    const before = pos === 0 || (charBefore !== undefined && WORD_BOUNDARY.test(charBefore))
    const afterPos = pos + lowerAlias.length
    const charAfter = afterPos < lowerText.length ? lowerText[afterPos] : undefined
    const after = afterPos >= lowerText.length || (charAfter !== undefined && WORD_BOUNDARY.test(charAfter))
    if (before && after) return true
    idx = pos + 1
  }
}

export interface ScopeAliasEntry {
  readonly id: string
  readonly aliases: readonly string[]
}

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
