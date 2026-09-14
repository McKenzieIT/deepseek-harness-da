/**
 * Context layer graph plugin, browser half. Registers:
 *  - ContextLayerGraph: G6 v5 interactive relation graph with semantic zoom
 *  - ctx.contextLayer service (open/close/focusNode)
 *  - shell.overlay fullscreen entry (ContextLayerOverlay)
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { ContextLayerService, type IContextLayer } from './service.ts'
import { ContextLayerOverlay } from './ContextLayerOverlay.tsx'
import { buildGraphDataClient } from './graphDataBridge.ts'
import { en, zh, type ContextLayerKey } from './locales.ts'

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

export {
  buildGraphDataClient,
  type GraphDataClient,
} from './graphDataBridge.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The context-layer graph overlay, node details, controls, and management chat copy. */
    'contextLayer': ContextLayerKey
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    contextLayer: IContextLayer
  }
}

export const name = 'ui-context-layer'
const NS = 'contextLayer'
export const inject = ['slots', 'locale'] as const

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-context-layer: dictionaries')
  const service = new ContextLayerService()

  ctx.effect(() => ctx.reflect.provide('contextLayer', service), 'ui-context-layer: service')

  ctx.inject(['remote'], (scope: Context) => {
    const remoteNs = (scope as unknown as { remote?: { schemaGateway?: unknown } }).remote
    const graphClient = remoteNs?.schemaGateway
      ? buildGraphDataClient(remoteNs.schemaGateway as never)
      : null

    const disposeOverlay = scope.slots.register({
      name: 'shell.overlay',
      id: 'context-layer-fullscreen',
      order: 1000,
      locale: NS,
      inject: () => ({ service, graphClient }),
    }, ContextLayerOverlay)

    return disposeOverlay
  })
}
