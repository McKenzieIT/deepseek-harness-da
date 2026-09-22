/**
 * G6 v5 node/edge/combo style definitions for the context layer graph.
 *
 * Node colors by kind:
 *  - dws  = blue (#1890ff)
 *  - dim  = green (#52c41a)
 *  - event = orange (#fa8c16)
 *  - metric = purple (#722ed1)
 *  - concept = magenta (#eb2f96)
 *  - unknown kind = neutral gray (generic fallback — open kinds never crash)
 *
 * Eval pass-rate overlay: border color transitions from red (0%) through
 * yellow (50%) to green (100%). Undefined eval = neutral gray border.
 */

/** Neutral fill for an unknown node kind (generic fallback). */
export const GENERIC_NODE_COLOR = '#8c8c8c'

/** Base fill colors for the known node kinds; open kinds fall back via {@link nodeKindColor}. */
export const KIND_COLORS: Record<string, string> = {
  dws: '#1890ff',
  dim: '#52c41a',
  event: '#fa8c16',
  metric: '#722ed1',
  concept: '#eb2f96',
}

/**
 * Fill color for an open node kind. Known kinds map to their palette color;
 * any unknown kind falls back to {@link GENERIC_NODE_COLOR} so a kind
 * registered on the Host renders without a client change and never yields an
 * undefined fill.
 * @param kind - the open node kind string.
 * @returns a CSS color string.
 */
export function nodeKindColor(kind: string): string {
  return KIND_COLORS[kind] ?? GENERIC_NODE_COLOR
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
 * @param passRate - passRate
 * @returns the result
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
 * Produce the G6 v5 node style spec for an open node kind and eval pass rate.
 * Used at both initial render and when LOD level changes.
 * @param kind - the open node kind string.
 * @param evalPassRate - evalPassRate
 * @returns the result
 */
export function nodeStyle(kind: string, evalPassRate?: number): Record<string, unknown> {
  return {
    fill: nodeKindColor(kind),
    stroke: evalBorderColor(evalPassRate),
    lineWidth: evalPassRate !== undefined ? 3 : 1,
    size: 32,
  }
}

/**
 * Edge style spec. Inter-combo (aggregate) edges are thicker and translucent;
 * intra-combo edges are thin.
 * @param isAggregate - isAggregate
 * @returns the result
 */
export function edgeStyle(isAggregate = false): Record<string, unknown> {
  return {
    stroke: isAggregate ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.45)',
    lineWidth: isAggregate ? 3 : 1,
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
  return {
    fill: DOMAIN_PALETTE[idx] ?? '#e6f7ff',
    stroke: DOMAIN_BORDER_PALETTE[idx] ?? '#91d5ff',
    lineWidth: 1,
    radius: 8,
    padding: 20,
  }
}
