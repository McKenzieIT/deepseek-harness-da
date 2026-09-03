import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export interface SwitchScopeResult {
  readonly ok: boolean
  readonly scope_id?: string
  readonly scope_name?: string
  readonly previous_scope_id?: string
  readonly error?: string
}

interface ScopeRegistryLike {
  get(id: string): { readonly id: string; readonly metadata?: Readonly<Record<string, unknown>> } | undefined
  activeId(): string | undefined
  setActive(id: string): Promise<void>
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

      const scopeId = args.scope_id
      const scopes = ctx.get('scopes') as ScopeRegistryLike | undefined
      if (!scopes) {
        return { ok: false, error: 'scope registry not mounted' } satisfies SwitchScopeResult as never
      }

      const target = scopes.get(scopeId)
      if (!target) {
        return {
          ok: false,
          error: `scope "${scopeId}" not found. Use list_scopes to see available scopes.`,
        } satisfies SwitchScopeResult as never
      }

      const previousId = scopes.activeId()
      await scopes.setActive(scopeId)

      const name = typeof target.metadata?.['name'] === 'string'
        ? target.metadata['name']
        : scopeId

      return {
        ok: true,
        scope_id: scopeId,
        scope_name: name,
        previous_scope_id: previousId ?? '',
      } satisfies SwitchScopeResult as never
    },
  }))
}
