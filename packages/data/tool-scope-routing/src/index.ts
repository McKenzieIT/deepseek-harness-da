import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { registerListScopes } from './list-scopes.ts'
import { registerSwitchScope } from './switch-scope.ts'
import { installScopeHint } from './scope-hint.ts'

export const name = 'tool-scope-routing'
export const inject = ['tools', 'systemPrompt']

export interface Config {}
export const Config: z<Config> = z.object({})

export function apply(ctx: Context, _config: Config = {}): void {
  registerListScopes(ctx)
  registerSwitchScope(ctx)
  installScopeHint(ctx)
}

export { listScopesResult } from './list-scopes.ts'
export { matchAliases, type ScopeAliasEntry } from './aliases.ts'
export type { ScopeSummary, AliasMatchResult } from './types.ts'
