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
import z from '@deepseek-ai/schemastery'
import { SemanticLayerShell, type SemanticLayerShellProps } from './SemanticLayerShell.tsx'
import { en, zh } from './locales.ts'
import type { LayoutMode } from './hooks/useLayoutMode.ts'
import { semanticLayerPresenters } from './presenters/index.ts'
import { SemanticLayerGoalDock, SemanticLayerEvidence, SemanticLayerSchemaExplorer, PRESET_ID } from './wiring.tsx'
import { buildSchemaGatewayClient } from './schemaGatewayBridge.ts'
import { buildEvidenceQueryClient } from './evidenceQueryBridge.ts'
import { createSelectionStore } from './selectionStore.ts'

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

/**
 * Plugin config for the semantic layer client half. Both fields default so the
 * plugin runs unchanged when the host declares no config; the host can override
 * `layoutMode` to pin a layout and `autoFlipThreshold` to tune the B→A flip.
 */
export interface Config {
  /** Layout mode: 'B' (workspace-first), 'A' (dashboard-first), or 'auto' (flip on threshold). */
  layoutMode?: LayoutMode
  /** Minimum eval runs to auto-flip from B to A. Default: 3. */
  autoFlipThreshold?: number
}

export const Config: z<Config> = z.object({
  layoutMode: z.union(['B', 'A', 'auto']).default('auto'),
  autoFlipThreshold: z.number().default(3),
})

export function apply(ctx: ClientContext, config: Config = {}): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-semantic-layer: dictionaries')
  ctx.plugin(semanticLayerPresenters)

  // GA-WIRING: session-scoped selection store handle, shared across both
  // `details.aux` entries (SchemaExplorer writes the selected asset;
  // EvidenceSidebar reads it). Constructed at apply time so identity follows
  // the fiber — never exported at module level (module-cache identity is a
  // disguised singleton across plugin reloads). resolveStore indexes live
  // instances by handle × sessionId, so siblings in one session share one
  // instance while sessions stay isolated.
  const selectionStore = createSelectionStore()

  ctx.inject(['sessions', 'workspaces', 'connection', 'remote'], (scope: ClientContext) => {
    const sessions = scope.sessions
    const workspaces = scope.workspaces
    const { api } = scope.get('connection') as ConnectionHandle
    const layout = scope.get('layout') as { openDetails(): void } | undefined
    let staged: string | undefined

    const stopListSub = sessions.list.subscribe(() => {
      if (!staged) return
      const state = sessions.list.getSnapshot()
      const current = state.current
      if (!current) return
      const summary = state.byId[current]
      if (summary === undefined) return
      if (summary.agentPreset === staged) { staged = undefined; return }
      const presetId = staged
      staged = undefined
      void api.agentPresets.select({ sessionId: current, agentPreset: presetId }).then((response) => {
        if (response.result.ok) {
          sessions.noteAgentPreset(current, response.result.value.agentPreset)
        }
      }).catch((e: unknown) => {
        // ui-semantic-layer-7: a rejecting RPC (transport error, disposed scope)
        // is an unhandled rejection + silently swallowed preset apply. The staged
        // preset is already cleared above; surface nothing to the model.
        console.warn(`ui-semantic-layer: agentPresets.select failed: ${e instanceof Error ? e.message : String(e)}`)
      })
    })

    // W9/W11: Build typed RPC clients from TypeRT remote namespaces.
    // Use scope.get() for optional nested services to bypass Cordis Proxy inject guards.
    const rawSchemaGateway = scope.get('remote.schemaGateway') as unknown
    const rawEvidenceQuery = scope.get('remote.evidenceQuery') as unknown
    const schemaClient = rawSchemaGateway
      ? buildSchemaGatewayClient(rawSchemaGateway as never)
      : null

    const invalidationListeners = new Set<() => void>()
    const offEval = scope.remote.$on('evidence/eval-run-completed', () => {
      for (const cb of invalidationListeners) cb()
    })
    scope.on('connection/reset', () => {
      for (const cb of invalidationListeners) cb()
    })

    const evidenceClient = rawEvidenceQuery
      ? {
        ...buildEvidenceQueryClient(rawEvidenceQuery as never),
        subscribeInvalidation(cb: () => void) {
          invalidationListeners.add(cb)
          return () => { invalidationListeners.delete(cb) }
        },
      }
      : null
    const contextLayer = scope.get('contextLayer') as { open(node?: string): void } | undefined
    const onNavigateToGraph = contextLayer
      ? (assetId: string) =>{  contextLayer.open(assetId) }
      : undefined

    const openOrCreateSession = (): void => {
      const state = sessions.list.getSnapshot()
      for (const id of state.ids) {
        if (state.byId[id]?.agentPreset === PRESET_ID) {
          sessions.open(id)
          layout?.openDetails()
          return
        }
      }
      staged = PRESET_ID
      workspaces.startSession()
      layout?.openDetails()
    }

    const layoutMode: LayoutMode = config.layoutMode ?? 'auto'
    const autoFlipThreshold: number = config.autoFlipThreshold ?? 3

    const injected = (): Omit<SemanticLayerShellProps, 'wide' | 't'> => ({
      openOrCreateSession,
      layoutMode,
      autoFlipThreshold,
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
      store: selectionStore,
      inject: () => ({ evidenceClient }),
    }, SemanticLayerEvidence))

    scope.slots.inject('details.aux', () => scope.slots.register({
      name: 'details.aux',
      id: 'semantic-layer-schema-explorer',
      order: 10,
      locale: NS,
      store: selectionStore,
      inject: () => ({ schemaClient, onNavigateToGraph }),
    }, SemanticLayerSchemaExplorer))

    return () => { stopListSub(); offEval() }
  })
}
