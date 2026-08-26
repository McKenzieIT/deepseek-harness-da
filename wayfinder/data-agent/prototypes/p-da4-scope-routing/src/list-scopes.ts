/**
 * `list_scopes` tool — enumerate available scopes with metadata for LLM routing.
 *
 * Design choice: BOTH system-prompt injection AND tool availability.
 * - System prompt: scope list is injected as a dynamic section on every turn
 *   (see scope-hint.ts). This gives the LLM passive awareness without a tool call.
 * - Tool: `list_scopes` is available for explicit enumeration (e.g. after a
 *   scope change, or if the LLM wants to confirm available options).
 *
 * The tool is lightweight — reads from the in-memory scope registry (no I/O).
 *
 * @module @deepseek-ai/dsh-tool-scope-routing/list-scopes
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ScopeSummary } from './types.ts'

export interface ListScopesResult {
  readonly ok: boolean
  readonly scopes: readonly ScopeSummary[]
  readonly active_scope_id: string | undefined
}

/** Read scope metadata aliases from a ScopeDefinition. */
function extractAliases(metadata: Readonly<Record<string, unknown>> | undefined): readonly string[] {
  if (!metadata) return []
  const raw = metadata['aliases']
  if (Array.isArray(raw)) return raw.filter((a): a is string => typeof a === 'string')
  return []
}

/** Read scope display name from metadata. */
function extractName(metadata: Readonly<Record<string, unknown>> | undefined, id: string): string {
  if (!metadata) return id
  const name = metadata['name']
  return typeof name === 'string' ? name : id
}

/** Read scope description from metadata. */
function extractDescription(metadata: Readonly<Record<string, unknown>> | undefined): string {
  if (!metadata) return ''
  const desc = metadata['description']
  return typeof desc === 'string' ? desc : ''
}

/**
 * Build the ListScopesResult from the live scope registry.
 * Exported for testing without the tool registration wrapper.
 */
export function listScopesResult(ctx: Context): ListScopesResult {
  const scopes = ctx.get('scopes')
  if (!scopes) {
    return { ok: true, scopes: [], active_scope_id: undefined }
  }

  const activeId = scopes.activeId()
  const all = scopes.list()

  const summaries: ScopeSummary[] = all.map(s => ({
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
      + 'Use this to see what scopes you can switch to or delegate queries to. '
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
      return listScopesResult(ctx) as any
    },
  }))
}
