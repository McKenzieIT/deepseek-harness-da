// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: anchors the LocaleNamespaceMap augmentation below to the slots
// package's base types (so the merge resolves) and satisfies knip that the
// devDependency is used.
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import { TableCard } from './TableCard.tsx'
import { en, zh, type TableKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The table card copy: banners, export actions, chart toolbar, sort hints. */
    'present.table': TableKey
  }
}

/** Namespace owning the table card copy. */
const NS = 'present.table'

export const inject = ['slots', 'locale'] as const

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-present-table: dictionaries')
  ctx.slots.inject('tool.call.toolview', () =>
    ctx.slots.register({ name: 'tool.call.toolview', key: 'present_table', locale: NS }, TableCard))
}
