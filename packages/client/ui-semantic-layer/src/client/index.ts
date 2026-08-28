/**
 * Semantic layer management plugin, browser half. Registers:
 *  - SemanticLayerShell into `sidebar.footer.action` (trigger for management sessions)
 *  - Tool presenters for search_schema/get_definition/get_coverage/discover_relations/trigger_eval
 *  - EvidenceSidebar + GoalDock (session-scoped, management agent only)
 *
 * W5-full: Evidence capability progressive illumination — sidebar renders
 * coverage stats, eval trajectory, gap analysis, and before/after eval delta
 * from ctx.evidenceQuery data.
 *
 * W11: Evidence-query RPC bridge wired. `evidenceClient` is built from
 * `scope.remote.evidenceQuery` (TypeRT namespace) and injected into:
 *  - SemanticLayerShell (root-scope): uses `useEvidenceMetrics` to derive
 *    live `evalRunCount` for the B→A auto-flip decision.
 *  - SemanticLayerGoalDock (session-scope): uses `useEvidenceMetrics` to
 *    feed `evalPassRates` to the sparkline.
 *  - SemanticLayerEvidence (session-scope): uses `useEvidenceMetrics` to
 *    pass live `evalRunCount`/`evalPassRates` + the client itself to
 *    EvidenceSidebar (coverage, gap, delta, health).
 */
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { SemanticLayerShell, type SemanticLayerShellProps } from './SemanticLayerShell.tsx'
import { en, zh } from './locales.ts'
import { semanticLayerPresenters } from './presenters/index.ts'
import { SemanticLayerGoalDock, SemanticLayerEvidence, SemanticLayerSchemaExplorer, PRESET_ID } from './wiring.tsx'
import { buildSchemaGatewayClient } from './schemaGatewayBridge.ts'
import { buildEvidenceQueryClient } from './evidenceQueryBridge.ts'

// W5-full exports: evidence panel components for host composition
export { EvidenceSidebar, type EvidenceSidebarProps } from './EvidenceSidebar.tsx'
export { GoalDock, type GoalDockProps, type GoalDockGoalData } from './GoalDock.tsx'
export { CoveragePanel, type CoveragePanelProps } from './CoveragePanel.tsx'
export { EvalTrajectory, type EvalTrajectoryProps } from './EvalTrajectory.tsx'
export { EvalDeltaView, type EvalDeltaViewProps } from './EvalDeltaView.tsx'
export { GapPanel, type GapPanelProps } from './GapPanel.tsx'
export { OnDemandEvalTrigger, type OnDemandEvalTriggerProps } from './OnDemandEvalTrigger.tsx'
export { useEvidenceQuery, type EvidenceQueryClient, type EvidenceQueryState } from './hooks/useEvidenceQuery.ts'
export type { SemanticLayerShellProps } from './SemanticLayerShell.tsx'
export type * from './types.ts'

// W6d exports: dashboard view and layout mode
export { DashboardView, type DashboardViewProps } from './DashboardView.tsx'
export { computeEffectiveMode, useLayoutMode, type LayoutMode } from './hooks/useLayoutMode.ts'
export type { UseLayoutModeOptions, UseLayoutModeResult } from './hooks/useLayoutMode.ts'

// W9 exports: schema browser
export { SchemaExplorer, type SchemaExplorerProps } from './SchemaExplorer.tsx'
export { AssetDetail, type AssetDetailProps } from './AssetDetail.tsx'
export { useSchemaGateway, type SchemaGatewayClient } from './hooks/useSchemaGateway.ts'
export { buildSchemaGatewayClient } from './schemaGatewayBridge.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'semanticLayer': import('./locales.ts').SemanticLayerKey
  }
}

const NS = 'semanticLayer'

export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-semantic-layer: dictionaries')
  ctx.plugin(semanticLayerPresenters)

  ctx.inject(['sessions', 'workspaces', 'connection', 'remote', 'layout'], (scope: ClientContext) => {
    const sessions = scope.sessions
    const workspaces = scope.workspaces
    const { api } = scope.get('connection') as ConnectionHandle
    const layout = (scope as unknown as { layout: { openDetails(): void } }).layout

    let staged: string | undefined

    const stopListSub = sessions.list.subscribe(() => {
      if (!staged) return
      const state = sessions.list.getSnapshot()
      const current = state.current
      if (!current) return
      const summary = state.byId[current]
      if (summary === undefined) return
      if (!summary.blank) return
      if (summary.agentPreset === staged) { staged = undefined; return }
      const presetId = staged
      staged = undefined
      void api.agentPresets.select({ sessionId: current, agentPreset: presetId }).then((response) => {
        if (response.result.ok) {
          sessions.noteAgentPreset(current, response.result.value.agentPreset)
        }
      })
    })

    // W9/W11: Build typed RPC clients from TypeRT remote namespaces.
    const remoteNs = (scope as unknown as { remote?: { schemaGateway?: unknown; evidenceQuery?: unknown } }).remote
    const schemaClient = remoteNs?.schemaGateway
      ? buildSchemaGatewayClient(remoteNs.schemaGateway as never)
      : null
    const evidenceClient = remoteNs?.evidenceQuery
      ? buildEvidenceQueryClient(remoteNs.evidenceQuery as never)
      : null
    const contextLayer = (scope as unknown as { contextLayer?: { open(node?: string): void } }).contextLayer
    const onNavigateToGraph = contextLayer
      ? (assetId: string) => contextLayer.open(assetId)
      : undefined

    const openOrCreateSession = (): void => {
      const state = sessions.list.getSnapshot()
      for (const id of state.ids) {
        if (state.byId[id]?.agentPreset === PRESET_ID) {
          sessions.open(id)
          layout.openDetails()
          return
        }
      }
      staged = PRESET_ID
      workspaces.startSession()
      layout.openDetails()
    }

    const injected = (): Omit<SemanticLayerShellProps, 'wide' | 't'> => ({
      openOrCreateSession,
      layoutMode: 'auto',
      evidenceClient,
    })

    scope.slots.inject('sidebar.footer.action', () => scope.slots.register({
      name: 'sidebar.footer.action',
      id: 'semantic-layer',
      order: 0,
      locale: NS,
      inject: injected,
    }, SemanticLayerShell))

    // Session-scoped slot adapters (./wiring.tsx). The management-session gate
    // is read REACTIVELY inside each adapter via useSessions.
    scope.slots.inject('conversation.input.dock', () => scope.slots.register({
      name: 'conversation.input.dock',
      id: 'semantic-layer-evidence',
      order: 20,
      locale: NS,
      inject: () => ({ evidenceClient }),
    }, SemanticLayerGoalDock))

    scope.slots.inject('details.aux', () => scope.slots.register({
      name: 'details.aux',
      id: 'semantic-layer-evidence',
      order: 0,
      locale: NS,
      inject: () => ({ evidenceClient }),
    }, SemanticLayerEvidence))

    scope.slots.inject('details.aux', () => scope.slots.register({
      name: 'details.aux',
      id: 'semantic-layer-schema-explorer',
      order: 10,
      locale: NS,
      inject: () => ({ schemaClient, onNavigateToGraph }),
    }, SemanticLayerSchemaExplorer))

    return stopListSub
  })
}
