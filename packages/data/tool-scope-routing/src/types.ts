export interface ScopeSummary {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly aliases: readonly string[]
  readonly is_active: boolean
}

export interface AliasMatchResult {
  readonly matched: boolean
  readonly scope_ids: readonly string[]
  readonly matched_aliases: readonly string[]
  readonly is_multi_scope: boolean
}
