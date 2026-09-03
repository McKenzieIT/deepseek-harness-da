// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionId, ISessions } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: anchors the LocaleNamespaceMap augmentation below to the slots
// package's base types (so the merge resolves) and satisfies knip that the
// devDependency is used.
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import { TableCard } from './TableCard.tsx'
import type { FetchResultEntry, TableCardInjected } from './TableCard.tsx'
import { en, zh, type TableKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The table card copy: banners, export actions, chart toolbar, sort hints. */
    'present.table': TableKey
  }
}

/** Namespace owning the table card copy. */
const NS = 'present.table'

/**
 * The `ctx.results` face this plugin consumes — a local mirror of the
 * result-cache `ResultService` (reached through the scoped ctx), kept local so
 * this plugin carries no cross-package type reference. The shape is
 * structurally identical to the result-cache service, so the runtime value
 * assigns without coercion.
 */
interface TableResultsFace {
  get(rid: string): Promise<FetchResultEntry | undefined>
  invalidate(rid: string): void
}

export const inject = ['slots', 'sessions', 'locale'] as const

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-present-table: dictionaries')
  const sessions: ISessions = ctx.sessions

  ctx.slots.inject('tool.call.toolview', () =>
    ctx.slots.register(
      {
        name: 'tool.call.toolview',
        key: 'present_table',
        locale: NS,
        // The result-store hot cache (ctx.results), reached through the scoped
        // ctx so get/invalidate resolve the caller's session. Optional chaining:
        // when the result-cache plugin is absent the service is undefined, so
        // fetchResult yields undefined (→ TSV fallback) and invalidateResult is
        // a no-op — the card degrades to its pre-R5 same-turn TSV path. (R5
        // fresh-vs-folded: invalidation is the consumer's job on an observed
        // fresh same-turn query_data, wired in TableCard via freshSeq.)
        inject: (sessionId: SessionId): TableCardInjected => ({
          // Resolve the result-cache service per call (fresh if the session or
          // plugin set changes between renders). `get` always returns a Promise:
          // a missing service degrades to a resolved `undefined` (not-found →
          // TSV fallback) rather than throwing on `.then`.
          fetchResult: (rid: string) => {
            const r = sessions.scope(sessionId)?.get('results') as TableResultsFace | undefined
            return r?.get(rid) ?? Promise.resolve(undefined)
          },
          invalidateResult: (rid: string) => {
            const r = sessions.scope(sessionId)?.get('results') as TableResultsFace | undefined
            r?.invalidate(rid)
          },
        }),
      },
      TableCard,
    ))
}

export type { TableCardInjected }
