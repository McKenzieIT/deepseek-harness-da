// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
// Type-only: anchors the LocaleNamespaceMap augmentation below to the slots
// package's base types (so the merge resolves).
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: anchors the ui-renderer Context merge (ctx.slots: SlotRegistry)
// so the slot register/inject calls below resolve without the fork-only
// runtime's now-removed Context augmentation.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { DecompositionCard } from './DecompositionCard.tsx'
import { en, zh, type DecompositionKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The query-understanding card copy: title, confidence, metrics caption, lineage labels, warning, error box. */
    'present.decomposition': DecompositionKey
  }
}

/** Namespace owning the query-understanding card copy. */
const NS = 'present.decomposition'

export const inject = ['slots', 'locale'] as const

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-present-decomposition: dictionaries')
  ctx.slots.inject('tool.call.toolview', () =>
    ctx.slots.register({ name: 'tool.call.toolview', key: 'present_decomposition', locale: NS }, DecompositionCard))
}
