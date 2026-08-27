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
  // W10 integration path (research resolved 2026-08-27):
  //   1. Provide ctx.contextLayer service (open/close/focusNode)
  //   2. Register shell.overlay entry (id: 'context-layer-fullscreen')
  //      with ContextLayerOverlay (position: fixed fullscreen, returns null when closed)
  //   3. ui-semantic-layer consumes ctx.contextLayer for onNavigateToGraph
  // Implementation deferred to the integration task.
  void ctx
}
