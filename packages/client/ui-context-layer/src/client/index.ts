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
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { SemanticGraphData, SemanticGraphQuery } from '@deepseek-ai/dsh-schema-gateway/types'
import { ContextLayerService, type IContextLayer } from './service.ts'
import { ContextLayerOverlay } from './ContextLayerOverlay.tsx'
import { buildGraphDataClient } from './graphDataBridge.ts'
import { createGraphPresentationRegistry } from './graph-presentation.ts'
import { en, zh, type ContextLayerKey } from './locales.ts'

export {
  ContextLayerGraph,
  type ContextLayerGraphProps,
} from './ContextLayerGraph.tsx'

// The Graph RPC types live on the Schema Gateway package and are imported
// directly from `@deepseek-ai/dsh-schema-gateway/types` by every file that
// needs them. They are not re-exported here: a named cross-face re-export from
// this client package would force the Cordis inspect catalog to verify each
// name against the gateway's `./types` subpath from within the client analysis
// batch, which cannot see the gateway's host source files. An empty
// `export type {}` (as `api-remotes` uses) avoids that, but carries no value
// when no external consumer imports these aliases from this package — and none
// does (this package is a self-registering Cordis plugin, not an import target).

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
  GENERIC_NODE_COLOR,
  GENERIC_EDGE_COLOR,
  DOMAIN_PALETTE,
  DOMAIN_BORDER_PALETTE,
} from './graph-styles.ts'

export {
  createGraphPresentationRegistry,
  GENERIC_NODE_ICON,
  GENERIC_RELATION_ICON,
  type GraphDetailRow,
  type GraphPresentationReader,
  type GraphPresentationRegistry,
  type NodeDetailRenderer,
  type NodeKindSpec,
  type NodeKindStyle,
  type NodePresentation,
  type RelationDetailRenderer,
  type RelationKindSpec,
  type RelationKindStyle,
  type RelationPresentation,
} from './graph-presentation.ts'

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
  // One registry handle per plugin instance, seeded with the built-in node and
  // relation kinds. Components receive its read face as an ordinary prop, so no
  // module-level state decides how a kind looks.
  const presentation = createGraphPresentationRegistry()

  ctx.effect(() => ctx.reflect.provide('contextLayer', service), 'ui-context-layer: service')

  ctx.inject(['remote'], (scope: Context) => {
    type SchemaGatewayRemote = {
      getGraphData: (
        opts?: SemanticGraphQuery,
        scopeId?: string,
      ) => Promise<RemoteResult<SemanticGraphData>>
    }
    const remote = (scope as unknown as {
      remote?: { schemaGateway?: SchemaGatewayRemote }
    }).remote
    const schemaGateway = remote?.schemaGateway
    const graphClient = schemaGateway
      ? buildGraphDataClient(schemaGateway)
      : null

    const disposeOverlay = scope.slots.register({
      name: 'shell.overlay',
      id: 'context-layer-fullscreen',
      order: 1000,
      locale: NS,
      inject: () => ({ service, graphClient, presentation }),
    }, ContextLayerOverlay)

    return disposeOverlay
  })
}
