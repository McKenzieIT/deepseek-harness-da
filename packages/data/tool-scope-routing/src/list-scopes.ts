import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ScopeSummary } from './types.ts'

export interface ListScopesResult {
  readonly ok: boolean
  readonly scopes: readonly ScopeSummary[]
  readonly active_scope_id: string | undefined
}

function extractAliases(metadata: Readonly<Record<string, unknown>> | undefined): readonly string[] {
  if (!metadata) return []
  const raw = metadata['aliases']
  if (Array.isArray(raw)) return raw.filter((a): a is string => typeof a === 'string')
  return []
}

function extractName(metadata: Readonly<Record<string, unknown>> | undefined, id: string): string {
  if (!metadata) return id
  const name = metadata['name']
  return typeof name === 'string' ? name : id
}

function extractDescription(metadata: Readonly<Record<string, unknown>> | undefined): string {
  if (!metadata) return ''
  const desc = metadata['description']
  return typeof desc === 'string' ? desc : ''
}

interface ScopeRegistryLike {
  list(): readonly { readonly id: string; readonly metadata?: Readonly<Record<string, unknown>> }[]
  activeId(): string | undefined
}

export function listScopesResult(ctx: Context): ListScopesResult {
  const scopes = ctx.get('scopes') as ScopeRegistryLike | undefined
  if (!scopes) {
    return { ok: true, scopes: [], active_scope_id: undefined }
  }

  const activeId = scopes.activeId()
  const all = scopes.list()

  const summaries: ScopeSummary[] = all.map((s) => ({
    id: s.id,
    name: extractName(s.metadata, s.id),
    description: extractDescription(s.metadata),
    aliases: extractAliases(s.metadata),
    is_active: s.id === activeId,
  }))

  return { ok: true, scopes: summaries, active_scope_id: activeId }
}

export function registerListScopes(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'list_scopes',
    description:
      'List all available data scopes (games/products) with their descriptions. '
      + 'Use this to see what scopes you can switch to. '
      + 'Each scope has its own semantic layer, event definitions, and query conventions.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          scopes: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                name: { type: 'string', required: true },
                description: { type: 'string', required: true },
                aliases: { type: 'array', items: { type: 'string' } },
                is_active: { type: 'boolean', required: true },
              },
            },
          },
          active_scope_id: { type: 'string' },
        },
      },
      render: (_args, value) => {
        const v = value as unknown as ListScopesResult
        if (v.scopes.length === 0) {
          return [{ type: 'text', text: 'No scopes registered.' }]
        }
        const lines = v.scopes.map(s =>
          `${s.is_active ? '▶ ' : '  '}${s.name} (${s.id}): ${s.description}`,
        )
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(_args, exec) {
      if (exec.signal.aborted) throw new Error('list_scopes aborted')
      return listScopesResult(ctx) as never
    },
  }))
}
