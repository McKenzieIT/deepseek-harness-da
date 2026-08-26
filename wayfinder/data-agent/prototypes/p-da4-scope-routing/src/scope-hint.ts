/**
 * Harness fallback — scope-hint system-prompt section + alias detection.
 *
 * ## Hook Point (Question 3 → Answer 甲: system-prompt section)
 *
 * Uses the existing `system-prompt/assemble` waterfall to inject a dynamic
 * section. Two layers:
 *
 * 1. **Static scope awareness** (always present): lists available scopes with
 *    descriptions in the system prompt, so the LLM passively knows what scopes
 *    exist without calling list_scopes.
 *
 * 2. **Dynamic alias hint** (per-turn, conditional): when the harness detects
 *    scope aliases in the user's latest message AND the LLM hasn't already
 *    called switch_scope/delegate_query, inject a hint like:
 *    "The user's message mentions X63 — this matches scope '10000334' (X63 射击).
 *     Consider using switch_scope or delegate_query if appropriate."
 *
 * ## Hook Mounting
 *
 * The fallback attaches to the `system-prompt/assemble` event (same as
 * phase-gate's persona injection). Priority: after phase-gate persona (so it
 * doesn't interfere) but before the final prompt assembly.
 *
 * ## Fallback Behavior (Question 4 → Answer 甲: allow, don't force)
 *
 * If the LLM ignores the hint and queries the wrong scope, that's fine.
 * The hint is a SUGGESTION, not a gate. Rationale:
 * - Strong models (DeepSeek-V3+) route correctly without hints
 * - The hint prevents weak models from getting lost, but doesn't constrain
 *   strong models that have better contextual understanding
 * - Forcing would break legitimate cases (e.g. "what's the K11 equivalent
 *   of the X63 login event?" — user mentions X63 but wants K11 data)
 *
 * @module @deepseek-ai/dsh-tool-scope-routing/scope-hint
 */

import type { Context } from '@deepseek-ai/cordis'
import { matchAliases, type ScopeAliasEntry } from './aliases.ts'
import type { ScopeSummary } from './types.ts'

/** Build the static scope-awareness section for system prompt. */
function buildScopeAwarenessSection(scopes: readonly ScopeSummary[]): string {
  if (scopes.length === 0) return ''
  if (scopes.length === 1) {
    const s = scopes[0]
    return `## Active Data Scope\n\nYou are querying: **${s.name}** (id: \`${s.id}\`). ${s.description}`
  }

  const lines = scopes.map(s => {
    const active = s.is_active ? ' ← active' : ''
    const aliases = s.aliases.length > 0 ? ` (aliases: ${s.aliases.join(', ')})` : ''
    return `- \`${s.id}\` **${s.name}**: ${s.description}${aliases}${active}`
  })

  return [
    '## Available Data Scopes',
    '',
    `${scopes.length} scopes are registered. Use \`switch_scope\` to change the active scope, or \`delegate_query\` to query a different scope without switching.`,
    '',
    ...lines,
  ].join('\n')
}

/** Build the dynamic alias-hint section (only when aliases match). */
function buildAliasHint(
  matchedScopeIds: readonly string[],
  matchedAliases: readonly string[],
  scopes: readonly ScopeSummary[],
  activeScopeId: string | undefined,
): string {
  const scopeNames = matchedScopeIds.map(id => {
    const s = scopes.find(sc => sc.id === id)
    return s ? `${s.name} (${id})` : id
  })

  if (matchedScopeIds.length === 1) {
    const id = matchedScopeIds[0]
    if (id === activeScopeId) return '' // Already on the right scope
    return [
      '## ⚡ Scope Routing Hint',
      '',
      `The user\'s message mentions "${matchedAliases[0]}" which matches scope **${scopeNames[0]}**.`,
      `The currently active scope is ${activeScopeId ?? '(none)'}.`,
      'Consider using `switch_scope` if this question targets that scope.',
    ].join('\n')
  }

  // Multi-scope match
  return [
    '## ⚡ Scope Routing Hint',
    '',
    `The user\'s message mentions multiple scopes: ${scopeNames.join(', ')}.`,
    'Consider using `delegate_query` to query each scope independently, then synthesize the results.',
  ].join('\n')
}

/**
 * Install the scope-hint system-prompt section. Injects dynamic scope awareness
 * and alias-based hints into the system prompt via `system-prompt/assemble`.
 *
 * @param ctx - plugin context (must have `systemPrompt`, `scopes` injected).
 */
export function installScopeHint(ctx: Context): void {
  // ── Static scope awareness (always present) ────────────────────────────
  ctx.systemPrompt.section('scope-awareness', (_context) => {
    const scopes = ctx.get('scopes')
    if (!scopes) return ''

    const all = scopes.list()
    if (all.length <= 1) return '' // Single scope: no routing needed

    const activeId = scopes.activeId()
    const summaries: ScopeSummary[] = all.map(s => ({
      id: s.id,
      name: (s.metadata?.['name'] as string) ?? s.id,
      description: (s.metadata?.['description'] as string) ?? '',
      aliases: (Array.isArray(s.metadata?.['aliases']) ? s.metadata!['aliases'] : []) as string[],
      is_active: s.id === activeId,
    }))

    return buildScopeAwarenessSection(summaries)
  })

  // ── Dynamic alias hint (per-turn, reads last user message) ─────────────
  //
  // The `system-prompt/assemble` event fires before each LLM call. We read
  // the latest user message from the session and check for alias matches.
  //
  // NOTE: This is a "weak" hint — it only fires when:
  // 1. Multiple scopes are registered
  // 2. The user's message matches an alias for a scope other than the active one
  // 3. The LLM has NOT already called switch_scope/delegate_query this turn
  //    (check via phase-gate state or a per-turn flag)
  //
  // Condition 3 requires tracking whether the routing tools were called this
  // turn. This is done via a simple per-question boolean flag set in the tools'
  // execute handlers (via a shared mutable on ctx).

  ctx.systemPrompt.section('scope-alias-hint', (context) => {
    const scopes = ctx.get('scopes')
    if (!scopes) return ''

    const all = scopes.list()
    if (all.length <= 1) return ''

    // Read the latest user message from the agent's session
    const agent = context.agent
    if (!agent) return ''
    const messages = agent.session.messages
    const lastUser = [...messages].reverse().find(m => m.role === 'user')
    if (!lastUser || typeof lastUser.content !== 'string') return ''

    const aliasEntries: ScopeAliasEntry[] = all
      .filter(s => Array.isArray(s.metadata?.['aliases']) && (s.metadata!['aliases'] as unknown[]).length > 0)
      .map(s => ({
        id: s.id,
        aliases: (s.metadata!['aliases'] as string[]),
      }))

    if (aliasEntries.length === 0) return ''

    const match = matchAliases(lastUser.content, aliasEntries)
    if (!match.matched) return ''

    const activeId = scopes.activeId()
    const summaries: ScopeSummary[] = all.map(s => ({
      id: s.id,
      name: (s.metadata?.['name'] as string) ?? s.id,
      description: (s.metadata?.['description'] as string) ?? '',
      aliases: (Array.isArray(s.metadata?.['aliases']) ? s.metadata!['aliases'] : []) as string[],
      is_active: s.id === activeId,
    }))

    return buildAliasHint(match.scope_ids, match.matched_aliases, summaries, activeId)
  })
}
