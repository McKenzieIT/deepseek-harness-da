/**
 * Scope-routing tool package entry — registers list_scopes, switch_scope,
 * delegate_query tools + installs the harness scope-hint system-prompt section.
 *
 * ## Plugin Mount
 *
 * Mounted as a preset row in the data-agent bundle config:
 * ```yaml
 * # apps/cli/config/agent-presets/data-agent/agent.cordis.yml
 * - name: '@deepseek-ai/dsh-tool-scope-routing'
 *   config: {}
 * ```
 *
 * ## Inject Requirements
 *
 * - `tools`: for registering the 3 model-facing tools
 * - `systemPrompt`: for the scope-hint section injection
 * - `scopes` (optional): the scope-registry service (tools gracefully degrade without it)
 *
 * ## Phase-gate Tool Whitelist Integration
 *
 * The routing tools must be added to PHASE_TOOLS in phase-gate/types.ts:
 * - `list_scopes` → UNIVERSAL_TOOLS (safe in any phase, read-only)
 * - `switch_scope` → UNIVERSAL_TOOLS (routing is orthogonal to phase progression)
 * - `delegate_query` → UNDERSTANDING_TOOLS only (the main agent dispatches
 *   before/during UNDERSTANDING; once in GENERATION/EXECUTION/INTERPRETATION
 *   the scope is locked for that question)
 *
 * WAIT — reconsider. G-DA5 says "LLM 判断每条消息是否需要切换; 不切换=沿用当前".
 * The model might realize mid-GENERATION that it needs a different scope (e.g.
 * after search_data_sources returns nothing because wrong scope). But
 * switch_scope in GENERATION would dirty the state. Compromise:
 *
 * - `list_scopes` → UNIVERSAL (read-only, always safe)
 * - `switch_scope` → UNDERSTANDING only (scope must be locked before GENERATION)
 * - `delegate_query` → UNDERSTANDING only (subagent runs full pipeline; calling
 *   it mid-GENERATION would be semantically wrong)
 *
 * If the model needs to switch after UNDERSTANDING, the phase-gate fallback
 * mechanism (GENERATION fails → fallback to UNDERSTANDING) gives it another chance.
 *
 * @module @deepseek-ai/dsh-tool-scope-routing
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { registerListScopes } from './list-scopes.ts'
import { registerSwitchScope } from './switch-scope.ts'
import { registerDelegateQuery } from './delegate-query.ts'
import { installScopeHint } from './scope-hint.ts'

export const name = 'tool-scope-routing'
export const inject = ['tools', 'systemPrompt']

export interface Config {}
export const Config: z<Config> = z.object({})

export function apply(ctx: Context, _config: Config = {}): void {
  registerListScopes(ctx)
  registerSwitchScope(ctx)
  registerDelegateQuery(ctx)
  installScopeHint(ctx)
}

// Re-export for testing
export { listScopesResult } from './list-scopes.ts'
export { matchAliases, type ScopeAliasEntry } from './aliases.ts'
export type { ScopeSummary, DelegateQueryResult, QueryOutcome, AliasMatchResult } from './types.ts'
