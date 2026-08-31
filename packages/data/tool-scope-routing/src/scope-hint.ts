import type { Context } from '@deepseek-ai/cordis'
import { matchAliases, type ScopeAliasEntry } from './aliases.ts'
import type { ScopeSummary } from './types.ts'

interface ScopeRegistryLike {
  list(): readonly { readonly id: string; readonly metadata?: Readonly<Record<string, unknown>> }[]
  activeId(): string | undefined
}

function buildScopeAwarenessSection(scopes: readonly ScopeSummary[]): string {
  if (scopes.length === 0) return ''
  if (scopes.length === 1) {
    const s = scopes[0]
    if (!s) return ''
    return `## Active Data Scope\n\nYou are querying: **${s.name}** (id: \`${s.id}\`). ${s.description}`
  }

  const active = scopes.find(s => s.is_active)
  const activeLine = active
    ? `Currently active: **${active.name}** (\`${active.id}\`).`
    : 'No scope is currently active.'

  return [
    '## Data Scopes',
    '',
    `${scopes.length} data scopes are registered. ${activeLine}`,
    'Use `list_scopes` to see all available scopes, or `switch_scope` to change the active scope.',
    'When the user\'s intent does not clearly indicate a specific scope, confirm which scope they want before proceeding.',
  ].join('\n')
}

function buildAliasHint(
  matchedScopeIds: readonly string[],
  matchedAliases: readonly string[],
  scopes: readonly ScopeSummary[],
  activeScopeId: string | undefined,
): string {
  const scopeNames = matchedScopeIds.map((id) => {
    const s = scopes.find(sc => sc.id === id)
    return s ? `${s.name} (${id})` : id
  })

  if (matchedScopeIds.length === 1) {
    const id = matchedScopeIds[0]
    if (!id || id === activeScopeId) return ''
    return [
      '## ⚡ Scope Routing Hint',
      '',
      `The user's message mentions "${matchedAliases[0]}" which matches scope **${scopeNames[0]}**.`,
      `The currently active scope is ${activeScopeId ?? '(none)'}.`,
      'Confirm with the user that they want to query this scope before switching. If they confirm (or the scope reference is unambiguous in context), use `switch_scope` to switch.',
    ].join('\n')
  }

  return [
    '## ⚡ Scope Routing Hint',
    '',
    `The user's message mentions multiple scopes: ${scopeNames.join(', ')}.`,
    'Ask the user which scope they want to query first, then use `switch_scope` to switch to it.',
  ].join('\n')
}

function buildSummaries(ctx: Context): ScopeSummary[] {
  const scopes = ctx.get('scopes') as ScopeRegistryLike | undefined
  if (!scopes) return []
  const all = scopes.list()
  const activeId = scopes.activeId()
  return all.map(s => ({
    id: s.id,
    name: (s.metadata?.['name'] as string) ?? s.id,
    description: (s.metadata?.['description'] as string) ?? '',
    aliases: (Array.isArray(s.metadata?.['aliases']) ? s.metadata?.['aliases'] : []) as string[],
    is_active: s.id === activeId,
  }))
}

export function installScopeHint(ctx: Context): void {
  ctx.systemPrompt.section({
    name: 'scope-awareness',
    order: 50,
    text: () => {
      const summaries = buildSummaries(ctx)
      if (summaries.length <= 1) return ''
      return buildScopeAwarenessSection(summaries)
    },
  })

  ctx.systemPrompt.section({
    name: 'scope-alias-hint',
    order: 51,
    text: (context: unknown) => {
      const scopes = ctx.get('scopes') as ScopeRegistryLike | undefined
      if (!scopes) return ''
      const all = scopes.list()
      if (all.length <= 1) return ''

      const ctx2 = context as { agent?: { session?: { messages?: unknown[] } } }
      const agent = ctx2?.agent
      if (!agent) return ''
      const messages = agent.session?.messages as Array<{ role: string; content: unknown }> | undefined
      if (!messages) return ''
      const lastUser = [...messages].reverse().find(m => m.role === 'user')
      if (!lastUser || typeof lastUser.content !== 'string') return ''

      const aliasEntries: ScopeAliasEntry[] = all
        .filter(s => Array.isArray(s.metadata?.['aliases']) && (s.metadata?.['aliases'] as unknown[]).length > 0)
        .map(s => ({
          id: s.id,
          aliases: s.metadata?.['aliases'] as string[],
        }))

      if (aliasEntries.length === 0) return ''

      const match = matchAliases(lastUser.content, aliasEntries)
      if (!match.matched) return ''

      const activeId = scopes.activeId()
      const summaries = buildSummaries(ctx)
      return buildAliasHint(match.scope_ids, match.matched_aliases, summaries, activeId)
    },
  })
}
