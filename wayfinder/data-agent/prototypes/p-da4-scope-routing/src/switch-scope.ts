/**
 * `switch_scope` tool — single-scope switch for the main agent.
 *
 * Side effects on successful switch:
 * 1. `ctx.scopes.setActive(scope_id)` — triggers `scopes/active-changed` event
 * 2. Semantic layer auto-delegates to the new scope (P1 pipe)
 * 3. Phase-gate state reset: clears scope-sensitive state (last_sql,
 *    candidate_tables, event_params, partition_cols, definition_loaded) so the
 *    pipeline starts fresh for the new scope's conventions.
 * 4. F2 same-source gate reset (last_sql = null → fresh GENERATION allowed).
 *
 * Phase-gate reset scope: the phase-gate listens on `scopes/active-changed`
 * (wired in phase-gate.ts, not here) and calls `resetScopeSensitiveState`.
 * This tool only triggers the switch; the phase-gate owns its own cleanup.
 *
 * When to NOT reset the full phase position: if the model switches scope
 * mid-INTERPRETATION (rare but valid — e.g. "compare X63 vs K11"), the phase
 * stays INTERPRETATION. Only the scope-sensitive DATA (cached SQL, tables, params)
 * is cleared. Phase position resets on new-question (F4 idle→running), not on
 * scope switch.
 *
 * @module @deepseek-ai/dsh-tool-scope-routing/switch-scope
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export interface SwitchScopeResult {
  readonly ok: boolean
  readonly scope_id?: string
  readonly scope_name?: string
  readonly previous_scope_id?: string
  readonly error?: string
}

export function registerSwitchScope(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'switch_scope',
    description:
      'Switch the active data scope to a different game/product. After switching, '
      + 'all subsequent data operations (search, load definitions, generate SQL, '
      + 'execute queries) will use the new scope\'s semantic layer and conventions. '
      + 'Use list_scopes first if unsure which scope to switch to.',
    parameters: {
      scope_id: {
        type: 'string',
        description: 'The scope id to switch to (from list_scopes).',
        required: true,
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          scope_id: { type: 'string' },
          scope_name: { type: 'string' },
          previous_scope_id: { type: 'string' },
          error: { type: 'string' },
        },
      },
      render: (_args, value) => {
        const v = value as unknown as SwitchScopeResult
        if (!v.ok) return [{ type: 'text', text: `switch_scope failed: ${v.error}` }]
        const prev = v.previous_scope_id ? ` (was: ${v.previous_scope_id})` : ''
        return [{ type: 'text', text: `Switched to scope ${v.scope_name ?? v.scope_id}${prev}` }]
      },
    },
    async execute(args, exec) {
      if (exec.signal.aborted) throw new Error('switch_scope aborted')

      const scopeId = args.scope_id as string
      const scopes = ctx.get('scopes')
      if (!scopes) {
        return { ok: false, error: 'scope registry not mounted' } satisfies SwitchScopeResult as any
      }

      const target = scopes.get(scopeId)
      if (!target) {
        return {
          ok: false,
          error: `scope "${scopeId}" not found. Use list_scopes to see available scopes.`,
        } satisfies SwitchScopeResult as any
      }

      const previousId = scopes.activeId()

      // setActive triggers `scopes/active-changed` → semantic-layer repoints +
      // phase-gate resets scope-sensitive state (listener in phase-gate plugin).
      await scopes.setActive(scopeId)

      const name = typeof target.metadata?.['name'] === 'string'
        ? target.metadata['name'] as string
        : scopeId

      return {
        ok: true,
        scope_id: scopeId,
        scope_name: name,
        previous_scope_id: previousId,
      } satisfies SwitchScopeResult as any
    },
  }))
}
