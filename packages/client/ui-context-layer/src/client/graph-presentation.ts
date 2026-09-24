/**
 * Client presentation registry for the open semantic-graph node and relation
 * kinds (W27).
 *
 * `SemanticGraphNode.kind` and `SemanticGraphEdge.type` are open strings, so a
 * kind the Host registers after this package built still reaches the UI. Every
 * kind resolves to a complete presentation here — accessible label, icon,
 * canvas style, and detail rows. A kind with no dedicated entry resolves
 * through the generic fallback, which keeps the raw projected kind string as
 * its accessible label and still produces detail rows, so an unregistered kind
 * is never dropped and never crashes rendering.
 *
 * `createGraphPresentationRegistry()` is the registration seam: `registerNode`
 * and `registerRelation` add a dedicated presentation for one kind and return
 * its disposer, so a new kind gains a label, icon, style, and detail renderer
 * without editing the graph core. The core (`ContextLayerGraph`,
 * `graph-styles`, `graph-animations`) consumes only the resolved presentation
 * and never reads a table, metric, or concept business field.
 *
 * The registry is a per-handle object, not module state: the plugin creates one
 * handle in `apply` and threads the read face to components as an ordinary
 * prop, and a test creates its own handle instead of mutating a shared one. The
 * kind tables are `Map`s, so a lookup for a prototype member name (`toString`,
 * `constructor`, `__proto__`) can never return an inherited member.
 */
import type { SemanticGraphEdge, SemanticGraphNode } from '@deepseek-ai/dsh-schema-gateway/types'
import type { ContextLayerKey, ContextLayerTranslate } from './locales.ts'
import {
  GENERIC_EDGE_COLOR,
  GENERIC_NODE_COLOR,
  evalBorderColor,
} from './graph-styles.ts'

/** Badge glyph for a node kind with no dedicated presentation. */
export const GENERIC_NODE_ICON = '◌'

/** Badge glyph for a relation kind with no dedicated presentation. */
export const GENERIC_RELATION_ICON = '→'

/** One labeled row of a node's or relation's detail view. */
export interface GraphDetailRow {
  /** Stable row id — a matching key for React keys and tests, never localized text. */
  readonly id: string
  /** Localized row heading. */
  readonly label: string
  /** Row value: projected data verbatim, localized copy only for enumerations. */
  readonly value: string
}

/** Canvas style a node kind contributes, plus the graph-wide eval decoration. */
export interface NodeKindStyle {
  /** Circle fill from the kind's palette entry. */
  readonly fill: string
  /** Border from the node's eval pass rate, neutral when it has none. */
  readonly stroke: string
  /** Border width: thicker when the node carries an eval pass rate. */
  readonly lineWidth: number
}

/** Canvas style a relation kind contributes. */
export interface RelationKindStyle {
  /** Line stroke from the kind's palette entry. */
  readonly stroke: string
  /** Line width. */
  readonly lineWidth: number
  /** Dash pattern; an empty array draws a solid line. */
  readonly lineDash: readonly number[]
}

/** Extra detail rows a node kind contributes beyond the generic ones. */
export type NodeDetailRenderer = (node: SemanticGraphNode, t: ContextLayerTranslate) => readonly GraphDetailRow[]

/** Extra detail rows a relation kind contributes beyond the generic ones. */
export type RelationDetailRenderer = (edge: SemanticGraphEdge, t: ContextLayerTranslate) => readonly GraphDetailRow[]

/** A node kind's dedicated presentation, as a registrant declares it. */
export interface NodeKindSpec {
  /** Dictionary key of the kind's localized name. */
  readonly labelKey: ContextLayerKey
  /** Single-glyph badge for the kind. */
  readonly icon: string
  /** Circle fill; the stroke carries the graph-wide eval decoration instead. */
  readonly fill: string
  /** Detail rows for this kind; omitted leaves the generic rows alone. */
  readonly detail?: NodeDetailRenderer
}

/** A relation kind's dedicated presentation, as a registrant declares it. */
export interface RelationKindSpec {
  /** Dictionary key of the kind's localized name. */
  readonly labelKey: ContextLayerKey
  /** Single-glyph badge for the kind. */
  readonly icon: string
  /** Line stroke. */
  readonly stroke: string
  /** Line width. */
  readonly lineWidth: number
  /** Dash pattern; an empty array draws a solid line. */
  readonly lineDash: readonly number[]
  /** Detail rows for this kind; omitted leaves the generic rows alone. */
  readonly detail?: RelationDetailRenderer
}

/** The resolved presentation of one node. */
export interface NodePresentation {
  /** The raw projected kind, verbatim. */
  readonly kind: string
  /** True when no dedicated presentation is registered for this kind. */
  readonly generic: boolean
  /** Accessible label: the kind's localized name, else the raw kind string. */
  readonly label: string
  /** Badge glyph. */
  readonly icon: string
  /** Canvas style. */
  readonly style: NodeKindStyle
  /** Detail rows, generic rows first. Never empty. */
  readonly detail: readonly GraphDetailRow[]
}

/** The resolved presentation of one relation. */
export interface RelationPresentation {
  /** The raw projected relation kind, verbatim. */
  readonly type: string
  /** True when no dedicated presentation is registered for this kind. */
  readonly generic: boolean
  /** Accessible label: the kind's localized name, else the raw kind string. */
  readonly label: string
  /** Badge glyph. */
  readonly icon: string
  /** Canvas style. */
  readonly style: RelationKindStyle
  /** Detail rows, generic rows first. Never empty. */
  readonly detail: readonly GraphDetailRow[]
}

/**
 * The read face components receive: resolve one node or relation to its
 * presentation. Plain callbacks, so no component ever holds the registration
 * seam.
 */
export interface GraphPresentationReader {
  /**
   * Resolve a node's presentation.
   * @param node - the projected graph node.
   * @param t - the context-layer translator.
   * @returns the node's label, icon, style, and detail rows.
   */
  readonly resolveNode: (node: SemanticGraphNode, t: ContextLayerTranslate) => NodePresentation
  /**
   * Resolve a relation's presentation.
   * @param edge - the projected graph edge.
   * @param t - the context-layer translator.
   * @returns the relation's label, icon, style, and detail rows.
   */
  readonly resolveRelation: (edge: SemanticGraphEdge, t: ContextLayerTranslate) => RelationPresentation
}

/** The read face plus the registration seam. */
export interface GraphPresentationRegistry extends GraphPresentationReader {
  /**
   * Register a dedicated presentation for one node kind, replacing any entry
   * already held for that kind.
   * @param kind - the open node kind string.
   * @param spec - the kind's label key, icon, fill, and optional detail renderer.
   * @returns a disposer that restores the previous entry, or the generic fallback when there was none.
   */
  readonly registerNode: (kind: string, spec: NodeKindSpec) => () => void
  /**
   * Register a dedicated presentation for one relation kind, replacing any
   * entry already held for that kind.
   * @param type - the open relation kind string.
   * @param spec - the kind's label key, icon, stroke, width, dash, and optional detail renderer.
   * @returns a disposer that restores the previous entry, or the generic fallback when there was none.
   */
  readonly registerRelation: (type: string, spec: RelationKindSpec) => () => void
}

/** Solid line, the default dash for a relation that declares none. */
const SOLID: readonly number[] = []

/** The node kinds the Semantic Layer ships; every other kind falls back. */
const BUILT_IN_NODE_KINDS: readonly (readonly [string, NodeKindSpec])[] = [
  ['dws', { labelKey: 'kind.dws', icon: '▦', fill: '#1890ff' }],
  ['dim', { labelKey: 'kind.dim', icon: '◫', fill: '#52c41a' }],
  ['event', { labelKey: 'kind.event', icon: '⚡', fill: '#fa8c16' }],
  ['metric', { labelKey: 'kind.metric', icon: '∑', fill: '#722ed1' }],
  ['concept', { labelKey: 'kind.concept', icon: '◈', fill: '#eb2f96', detail: conceptDetail }],
]

/** The relation kinds the Semantic Layer ships; every other kind falls back. */
const BUILT_IN_RELATION_KINDS: readonly (readonly [string, RelationKindSpec])[] = [
  ['joins', { labelKey: 'relation.joins', icon: '⋈', stroke: 'rgba(0,0,0,0.45)', lineWidth: 1, lineDash: SOLID, detail: joinsDetail }],
  ['derived_from', { labelKey: 'relation.derivedFrom', icon: '↦', stroke: '#722ed1', lineWidth: 1, lineDash: [6, 4] }],
  ['related_to', { labelKey: 'relation.relatedTo', icon: '↭', stroke: '#eb2f96', lineWidth: 1, lineDash: [2, 3] }],
]

/** Prefix the Host mints onto a `concept` node id (`concept:<name>`). */
const CONCEPT_ID_PREFIX = 'concept:'

/**
 * Detail rows for a `concept` node: the concept name the Host encoded in the
 * node id. Yields no row when the id does not carry the prefix, which keeps the
 * generic rows as the whole detail rather than showing a mislabeled id.
 * @param node - the projected concept node.
 * @param t - the context-layer translator.
 * @returns the concept-name row, or none.
 */
function conceptDetail(node: SemanticGraphNode, t: ContextLayerTranslate): readonly GraphDetailRow[] {
  if (!node.id.startsWith(CONCEPT_ID_PREFIX)) return []
  return [{ id: 'conceptName', label: t('node.detail.conceptName'), value: node.id.slice(CONCEPT_ID_PREFIX.length) }]
}

/**
 * Detail rows for a `joins` relation: the join condition expression, verbatim.
 * @param edge - the projected joins edge.
 * @param t - the context-layer translator.
 * @returns the join-condition row, or none when the edge carries no condition.
 */
function joinsDetail(edge: SemanticGraphEdge, t: ContextLayerTranslate): readonly GraphDetailRow[] {
  if (edge.on === undefined) return []
  return [{ id: 'on', label: t('relation.detail.on'), value: edge.on }]
}

/**
 * Generic node detail rows, present for every kind: the raw projected kind.
 * This is what keeps detail reachable for a kind with no dedicated entry.
 * @param node - the projected graph node.
 * @param t - the context-layer translator.
 * @returns the kind row.
 */
function genericNodeDetail(node: SemanticGraphNode, t: ContextLayerTranslate): readonly GraphDetailRow[] {
  return [{ id: 'kind', label: t('node.detail.kind'), value: node.kind }]
}

/**
 * Generic relation detail rows, present for every kind: the raw projected
 * relation kind and the target node id.
 * @param edge - the projected graph edge.
 * @param t - the context-layer translator.
 * @returns the kind and target rows.
 */
function genericRelationDetail(edge: SemanticGraphEdge, t: ContextLayerTranslate): readonly GraphDetailRow[] {
  return [
    { id: 'type', label: t('relation.detail.type'), value: edge.type },
    { id: 'target', label: t('relation.detail.target'), value: edge.target },
  ]
}

/**
 * Create a presentation registry seeded with the built-in node and relation
 * kinds. Each handle is independent: a registration on one never reaches
 * another, so a test never has to undo shared state.
 * @returns a registry exposing the read face and the registration seam.
 */
export function createGraphPresentationRegistry(): GraphPresentationRegistry {
  const nodeKinds = new Map<string, NodeKindSpec>(BUILT_IN_NODE_KINDS)
  const relationKinds = new Map<string, RelationKindSpec>(BUILT_IN_RELATION_KINDS)

  /**
   * Install one table entry and return the disposer that restores the prior
   * state. Restoring rather than deleting keeps a disposer from erasing a
   * built-in entry that the registration replaced.
   * @param table - the kind table to write.
   * @param key - the kind the entry covers.
   * @param spec - the entry to install.
   * @returns the disposer.
   */
  function install<Spec>(table: Map<string, Spec>, key: string, spec: Spec): () => void {
    const previous = table.get(key)
    table.set(key, spec)
    return () => {
      if (previous === undefined) table.delete(key)
      else table.set(key, previous)
    }
  }

  return {
    registerNode: (kind, spec) => install(nodeKinds, kind, spec),
    registerRelation: (type, spec) => install(relationKinds, type, spec),

    resolveNode(node, t) {
      const spec = nodeKinds.get(node.kind)
      const generic = spec === undefined
      const extra = spec?.detail?.(node, t) ?? []
      return {
        kind: node.kind,
        generic,
        label: spec === undefined ? node.kind : t(spec.labelKey),
        icon: spec?.icon ?? GENERIC_NODE_ICON,
        style: {
          fill: spec?.fill ?? GENERIC_NODE_COLOR,
          stroke: evalBorderColor(node.evalPassRate),
          lineWidth: node.evalPassRate === undefined ? 1 : 3,
        },
        detail: [...genericNodeDetail(node, t), ...extra],
      }
    },

    resolveRelation(edge, t) {
      const spec = relationKinds.get(edge.type)
      const generic = spec === undefined
      const extra = spec?.detail?.(edge, t) ?? []
      return {
        type: edge.type,
        generic,
        label: spec === undefined ? edge.type : t(spec.labelKey),
        icon: spec?.icon ?? GENERIC_RELATION_ICON,
        style: {
          stroke: spec?.stroke ?? GENERIC_EDGE_COLOR,
          lineWidth: spec?.lineWidth ?? 1,
          lineDash: spec?.lineDash ?? SOLID,
        },
        detail: [...genericRelationDetail(edge, t), ...extra],
      }
    },
  }
}
