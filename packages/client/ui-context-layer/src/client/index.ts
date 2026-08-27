/**
 * Context layer graph plugin, browser half. Registers:
 *  - ContextLayerGraph: G6 v5 interactive relation graph with semantic zoom
 *  - ctx.contextLayer service (open/close/focusNode)
 *  - shell.overlay fullscreen entry (ContextLayerOverlay)
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { ContextLayerService, type IContextLayer } from './service.ts'
import { ContextLayerOverlay } from './ContextLayerOverlay.tsx'

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

export {
  ContextLayerOverlay,
  type ContextLayerOverlayProps,
} from './ContextLayerOverlay.tsx'

export {
  ContextLayerService,
  type IContextLayer,
} from './service.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    contextLayer: IContextLayer
  }
}

export const name = 'ui-context-layer'
export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  const service = new ContextLayerService()

  ctx.effect(() => {
    const disposeService = ctx.reflect.provide('contextLayer', service)
    const disposeOverlay = ctx.slots.register({
      name: 'shell.overlay',
      id: 'context-layer-fullscreen',
      order: 1000,
      inject: () => ({ service }),
    }, ContextLayerOverlay)
    return () => {
      disposeOverlay()
      void disposeService()
    }
  }, 'ui-context-layer: service + overlay registration')
}
