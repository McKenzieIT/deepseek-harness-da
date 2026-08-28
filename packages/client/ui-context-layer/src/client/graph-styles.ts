/**
 * G6 v5 node/edge/combo style definitions for the context layer graph.
 *
 * Node colors by kind:
 *  - dws  = blue (#1890ff)
 *  - dim  = green (#52c41a)
 *  - event = orange (#fa8c16)
 *  - metric = purple (#722ed1)
 *
 * Eval pass-rate overlay: border color transitions from red (0%) through
 * yellow (50%) to green (100%). Undefined eval = neutral gray border.
 */

export type NodeKind = 'dws' | 'dim' | 'event' | 'metric'

/** Base fill colors per node kind. */
export const KIND_COLORS: Record<NodeKind, string> = {
  dws: '#1890ff',
  dim: '#52c41a',
  event: '#fa8c16',
  metric: '#722ed1',
}

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
 */
export function evalBorderColor(passRate: number | undefined): string {
  if (passRate === undefined) return '#d9d9d9'
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
 * Produce the G6 v5 node style spec for a given kind and eval pass rate.
 * Used at both initial render and when LOD level changes.
 */
export function nodeStyle(kind: NodeKind, evalPassRate?: number) {
  return {
    fill: KIND_COLORS[kind],
    stroke: evalBorderColor(evalPassRate),
    lineWidth: evalPassRate !== undefined ? 3 : 1,
    size: 32,
  }
}

/**
 * Edge style spec. Inter-combo (aggregate) edges are thicker and translucent;
 * intra-combo edges are thin.
 */
export function edgeStyle(isAggregate = false) {
  return {
    stroke: isAggregate ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.45)',
    lineWidth: isAggregate ? 3 : 1,
    endArrow: true,
  }
}

/**
 * Combo (domain cluster) style from a domain index.
 */
export function comboStyle(domainIndex: number) {
  const idx = domainIndex % DOMAIN_PALETTE.length
  return {
    fill: DOMAIN_PALETTE[idx] ?? '#e6f7ff',
    stroke: DOMAIN_BORDER_PALETTE[idx] ?? '#91d5ff',
    lineWidth: 1,
    radius: 8,
    padding: 20,
  }
}
