// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
// Type-only: anchors the LocaleNamespaceMap augmentation below to the slots
// package's base types (so the merge resolves).
import type {} from '@deepseek-ai/dsh-client-ui-slots'
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

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-present-decomposition: dictionaries')
  ctx.slots.inject('tool.call.toolview', () =>
    ctx.slots.register({ name: 'tool.call.toolview', key: 'present_decomposition', locale: NS }, DecompositionCard))
}
