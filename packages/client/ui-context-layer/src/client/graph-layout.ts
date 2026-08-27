/**
 * G6 v5 layout configuration for the context layer graph.
 *
 * Semantic zoom levels (LOD):
 *  - Far view (0.3–0.5): collapsed combos, aggregate density edges
 *  - Mid view (0.5–1.0): expanded combos, nodes as colored dots (no labels)
 *  - Near view (1.0+): full detail — name, kind badge, pass rate ring, confirmation icon
 *
 * Layout: combo-force (domain clusters as combos with force-directed
 * positioning inside each combo).
 */

/** Semantic zoom level thresholds. */
export const ZOOM_THRESHOLDS = {
  /** Below this zoom => far view (collapsed combos). */
  FAR_MAX: 0.5,
  /** Below this zoom => mid view (expanded combos, no labels). */
  MID_MAX: 1.0,
} as const

export type ZoomLevel = 'far' | 'mid' | 'near'

/**
 * Determine the current semantic zoom level from a numeric zoom value.
 */
export function getZoomLevel(zoom: number): ZoomLevel {
  if (zoom < ZOOM_THRESHOLDS.FAR_MAX) return 'far'
  if (zoom < ZOOM_THRESHOLDS.MID_MAX) return 'mid'
  return 'near'
}

/**
 * G6 v5 combo-force layout options. Nodes cluster by their primary domain
 * (combo). The layout uses a force simulation to position combos apart and
 * nodes within each combo close together.
 */
export function getLayoutConfig() {
  return {
    type: 'combo-combined',
    outerLayout: {
      type: 'force',
      preventOverlap: true,
      nodeSpacing: 30,
    },
    innerLayout: {
      type: 'concentric',
      preventOverlap: true,
      minNodeSpacing: 20,
    },
    spacing: 40,
  }
}

/**
 * LOD (Level of Detail) configuration for nodes based on zoom level.
 * Controls what visual elements are shown at each zoom level.
 */
export interface LODConfig {
  /** Show node labels. */
  showLabel: boolean
  /** Show kind badge (icon/text overlay). */
  showBadge: boolean
  /** Show eval pass-rate ring around node. */
  showEvalRing: boolean
  /** Node size multiplier. */
  nodeScale: number
  /** Whether combos are collapsed. */
  combosCollapsed: boolean
}

/**
 * Get the LOD config for a given zoom level.
 */
export function getLODConfig(level: ZoomLevel): LODConfig {
  switch (level) {
    case 'far':
      return {
        showLabel: false,
        showBadge: false,
        showEvalRing: false,
        nodeScale: 0.5,
        combosCollapsed: true,
      }
    case 'mid':
      return {
        showLabel: false,
        showBadge: false,
        showEvalRing: false,
        nodeScale: 0.8,
        combosCollapsed: false,
      }
    case 'near':
      return {
        showLabel: true,
        showBadge: true,
        showEvalRing: true,
        nodeScale: 1.0,
        combosCollapsed: false,
      }
  }
}
