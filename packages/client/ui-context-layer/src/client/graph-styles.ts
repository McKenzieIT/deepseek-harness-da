/**
 * Palette and G6 v5 style mapping for the context-layer graph.
 *
 * This module owns colors and the translation from a resolved presentation into
 * a G6 element spec. It owns no kind table: which fill, stroke, and dash a node
 * or relation kind wears is decided by the presentation registry
 * (`graph-presentation.ts`), so a kind registered there needs no edit here.
 *
 * Eval pass-rate overlay: border color transitions from red (0%) through
 * yellow (50%) to green (100%). Undefined eval = neutral gray border.
 */
import type { NodeKindStyle, RelationKindStyle } from './graph-presentation.ts'

/** Neutral fill for a node kind with no dedicated presentation. */
export const GENERIC_NODE_COLOR = '#8c8c8c'

/** Neutral stroke for a relation kind with no dedicated presentation. */
export const GENERIC_EDGE_COLOR = 'rgba(0,0,0,0.45)'

/** Stroke for an inter-combo (aggregate) edge, which is thicker and translucent. */
export const AGGREGATE_EDGE_COLOR = 'rgba(0,0,0,0.25)'

/** Border for a node with no eval data. */
export const NO_EVAL_BORDER_COLOR = '#d9d9d9'

/** Base diameter of a node circle, before the LOD scale. */
export const NODE_SIZE = 32

/** Domain combo background tints (10 slots, cycled by domain index). */
export const DOMAIN_PALETTE: readonly string[] = [
  '#e6f7ff', '#f6ffed', '#fff7e6', '#f9f0ff', '#fff1f0',
  '#e6fffb', '#fcffe6', '#f0f5ff', '#fff0f6', '#fffbe6',
]

/** Domain combo border colors (matching palette indices). */
export const DOMAIN_BORDER_PALETTE: readonly string[] = [
  '#91d5ff', '#b7eb8f', '#ffd591', '#d3adf7', '#ffa39e',
  '#87e8de', '#eaff8f', '#adc6ff', '#ffadd2', '#ffe58f',
]

/**
 * Compute border color from eval pass rate (0..1).
 * Returns a CSS color string. Undefined rate => neutral gray.
 * @param passRate - passRate
 * @returns the result
 */
export function evalBorderColor(passRate: number | undefined): string {
  if (passRate === undefined) return NO_EVAL_BORDER_COLOR
  // Red → Yellow → Green gradient
  if (passRate <= 0.5) {
    const t = passRate * 2
    const r = 255
    const g = Math.round(t * 200)
    return `rgb(${r}, ${g}, 0)`
  }
  const t = (passRate - 0.5) * 2
  const r = Math.round(255 * (1 - t))
  const g = 200
  return `rgb(${r}, ${g}, 0)`
}

/**
 * Produce the G6 v5 node style spec from a resolved node presentation style.
 * Used at both initial render and when LOD level changes.
 * @param style - the fill/stroke/width the presentation registry resolved.
 * @returns the G6 node style spec.
 */
export function nodeStyle(style: NodeKindStyle): Record<string, unknown> {
  return {
    fill: style.fill,
    stroke: style.stroke,
    lineWidth: style.lineWidth,
    size: NODE_SIZE,
  }
}

/**
 * Produce the G6 v5 edge style spec from a resolved relation presentation style.
 * An inter-combo (aggregate) edge overrides the stroke and width with the
 * translucent aggregate pair; the relation's own dash survives either way.
 * @param style - the stroke/width/dash the presentation registry resolved.
 * @param isAggregate - whether the edge spans two combos.
 * @returns the G6 edge style spec.
 */
export function edgeStyle(style: RelationKindStyle, isAggregate = false): Record<string, unknown> {
  return {
    stroke: isAggregate ? AGGREGATE_EDGE_COLOR : style.stroke,
    lineWidth: isAggregate ? 3 : style.lineWidth,
    lineDash: style.lineDash,
    endArrow: true,
  }
}

/**
 * Combo (domain cluster) style from a domain index.
 * @param domainIndex - domainIndex
 * @returns the result
 */
export function comboStyle(domainIndex: number): Record<string, unknown> {
  const idx = domainIndex % DOMAIN_PALETTE.length
  // The `??` arms below are unreachable at runtime: `idx = domainIndex % PALETTE.length`
  // with a non-negative sorted-domain index always lands inside the palette. The literals
  // exist only because `noUncheckedIndexedAccess` types the lookup as `T | undefined`.
  return {
    /* v8 ignore next */
    fill: DOMAIN_PALETTE[idx] ?? '#e6f7ff',
    /* v8 ignore next */
    stroke: DOMAIN_BORDER_PALETTE[idx] ?? '#91d5ff',
    lineWidth: 1,
    radius: 8,
    padding: 20,
  }
}
