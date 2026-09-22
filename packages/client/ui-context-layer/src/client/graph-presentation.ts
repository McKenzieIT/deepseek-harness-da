/**
 * Client presentation registry for open semantic-graph node kinds (W27).
 *
 * Known kinds resolve to a localized label + palette color; an UNKNOWN kind
 * falls back to a generic accessible presentation — the raw kind string as its
 * label and a neutral color — so a kind registered on the Host reaches the UI
 * without a client change, is never dropped, and never crashes rendering. The
 * graph core stays free of business fields: it consumes only the node `kind`
 * key through this registry.
 */
import type { ContextLayerKey, ContextLayerTranslate } from './locales.ts'
import { nodeKindColor } from './graph-styles.ts'

/** Localized-label key per known node kind (open kinds fall back to the raw kind). */
const KIND_LABEL_KEYS: Record<string, ContextLayerKey> = {
  dws: 'kind.dws',
  dim: 'kind.dim',
  event: 'kind.event',
  metric: 'kind.metric',
  concept: 'kind.concept',
}

/** Presentation for one node kind: an accessible label + a fill color. */
export interface NodeKindPresentation {
  /** Accessible label — a localized name for known kinds, else the raw kind string. */
  readonly label: string
  /** Base fill color (neutral for unknown kinds). */
  readonly color: string
}

/**
 * Resolve the presentation for an open node kind. Known kinds get a localized
 * label and palette color; an unknown kind falls back to the raw kind string as
 * an accessible label plus the generic color — never dropped, never a crash
 * (W27: own-property lookup — a plain `KIND_LABEL_KEYS[kind]` would return the
 * truthy `Object.prototype.constructor` for `kind='constructor'`, surfacing an
 * undefined label through `t(key)`).
 * @param kind - the open node kind string.
 * @param t - the context-layer translator.
 * @returns the label + color for this kind.
 */
export function nodeKindPresentation(kind: string, t: ContextLayerTranslate): NodeKindPresentation {
  const key: ContextLayerKey | undefined = Object.hasOwn(KIND_LABEL_KEYS, kind) ? KIND_LABEL_KEYS[kind] : undefined
  return { label: key ? t(key) : kind, color: nodeKindColor(kind) }
}
