/**
 * Context layer graph plugin, browser half. Registers:
 *  - ContextLayerGraph: G6 v5 interactive relation graph with semantic zoom
 *
 * W10 base: foundational graph component skeleton. Later iterations add:
 *  - Conversation panel integration
 *  - Animation layer
 *  - Evidence overlay toggle
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

export {
  ContextLayerGraph,
  type ContextLayerGraphProps,
} from './ContextLayerGraph.tsx'

export type {
  GraphData,
  GraphNode,
  GraphEdge,
  GraphDataOpts,
} from './types.ts'

export {
  getZoomLevel,
  getLODConfig,
  getLayoutConfig,
  ZOOM_THRESHOLDS,
  type ZoomLevel,
  type LODConfig,
} from './graph-layout.ts'

export {
  nodeStyle,
  edgeStyle,
  comboStyle,
  evalBorderColor,
  KIND_COLORS,
  DOMAIN_PALETTE,
  DOMAIN_BORDER_PALETTE,
  type NodeKind,
} from './graph-styles.ts'

export {
  NarrationGate,
  useNarrationGate,
  type GraphUpdate,
  type NarrationGateState,
  type NarrationGateOptions,
  type SessionEventLike,
  type SessionEventSource,
} from './narration-gate.ts'

export {
  fadeIn,
  dashedHighlight,
  clearDashedHighlight,
  pulseNode,
  blinkNodes,
  focusWithZoom,
  useGraphAnimations,
  useOverlayMode,
  type OverlayMode,
  type OverlayModeState,
} from './graph-animations.ts'

export {
  DomainFilterToolbar,
  type DomainFilterToolbarProps,
} from './DomainFilterToolbar.tsx'

export {
  SearchBar,
  type SearchBarProps,
} from './SearchBar.tsx'

export {
  OverlayToggle,
  type OverlayToggleProps,
} from './OverlayToggle.tsx'

export {
  NodeDetailPanel,
  type NodeDetailPanelProps,
} from './NodeDetailPanel.tsx'

export {
  ManagementChatPanel,
  type ManagementChatPanelProps,
  type ChatMessage,
} from './ManagementChatPanel.tsx'

export {
  ContextLayerView,
  type ContextLayerViewProps,
} from './ContextLayerView.tsx'

export const name = 'ui-context-layer'
export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  // W10 base: no slot registrations yet — the ContextLayerGraph component
  // is exported for composition by host-level wiring (the parent layout
  // decides where the graph mounts). Slot registrations come in a follow-up
  // when the layout integration point is defined.
  void ctx
}
