/**
 * Semantic layer management plugin, browser half. Registers:
 *  - SemanticLayerShell into `sidebar.footer.action` (trigger for management sessions)
 *  - Tool presenters for search_schema/get_definition/get_coverage/discover_relations/trigger_eval
 *  - EvidenceSidebar (exported for host-composition placement in the details column)
 *
 * W5-full: Evidence capability progressive illumination — sidebar renders
 * coverage stats, eval trajectory, gap analysis, and before/after eval delta
 * from ctx.evidenceQuery data.
 *
 * W6c/W6d data-wiring status (this host composition):
 *  - SemanticLayerShell (registered below into `sidebar.footer.action`, a
 *    root-scope slot) receives `layoutMode: 'auto'` and an `evalRunCount`
 *    placeholder through the `injected()` factory. The shell routes to
 *    DashboardView (the "A" layout) only when `effectiveMode === 'A' &&
 *    evidenceClient`; otherwise it renders the trigger button ("B" layout).
 *  - `evalRunCount` real source is server-side —
 *    `ctx.evidenceQuery.getEvalStore().getRunIds().length`
 *    (EvidenceQueryService, packages/data/evidence-query). No client RPC
 *    bridge exists yet, so the factory passes `0` (auto resolves to B below
 *    the threshold of 3). When a client evidence-query RPC lands, read the
 *    run count here and pass it down.
 *  - `evidenceClient` (the EvidenceQueryClient face that DashboardView and
 *    useEvidenceQuery consume) is likewise un-wired: there is no client-side
 *    construction of it today. It is left absent until that bridge exists.
 *  - `goalData` and `evalPassRates` feed GoalDock, which lives inside
 *    EvidenceSidebar. EvidenceSidebar is exported (below) for host
 *    composition in a SESSION-scoped details column — NOT rendered by this
 *    plugin. Because `sidebar.footer.action` is root-scoped, `useProjection`
 *    (a SessionStandardProps seat) is unavailable here. The GoalDock wiring
 *    therefore belongs in the session-scoped slot that mounts
 *    EvidenceSidebar: `goalData` from `useProjection('goal')` (same source
 *    as ui-goal's GoalBar) and `evalPassRates` from the evidence-query
 *    client once it exists. This file cannot thread those props.
 */
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { SemanticLayerShell, type SemanticLayerShellProps } from './SemanticLayerShell.tsx'
import { en, zh } from './locales.ts'
import { semanticLayerPresenters } from './presenters/index.ts'

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

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'semanticLayer': import('./locales.ts').SemanticLayerKey
  }
}

const NS = 'semanticLayer'
const PRESET_ID = 'semantic-layer-management'

export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-semantic-layer: dictionaries')
  ctx.plugin(semanticLayerPresenters)

  ctx.inject(['sessions', 'workspaces', 'connection'], (scope: ClientContext) => {
    const sessions = scope.sessions
    const workspaces = scope.workspaces
    const { api } = scope.get('connection') as ConnectionHandle

    let staged: string | undefined

    const stopListSub = sessions.list.subscribe(() => {
      if (!staged) return
      const state = sessions.list.getSnapshot()
      const current = state.current
      if (!current) return
      const summary = state.byId[current]
      if (!summary?.blank) { staged = undefined; return }
      if (summary.agentPreset === staged) { staged = undefined; return }
      const presetId = staged
      staged = undefined
      void api.agentPresets.select({ sessionId: current, agentPreset: presetId }).then((response) => {
        if (response.result.ok) {
          sessions.noteAgentPreset(current, response.result.value.agentPreset)
        }
      })
    })

    const openOrCreateSession = (): void => {
      const state = sessions.list.getSnapshot()
      for (const id of state.ids) {
        if (state.byId[id]?.agentPreset === PRESET_ID) {
          sessions.open(id)
          return
        }
      }
      staged = PRESET_ID
      workspaces.startSession()
    }

    const injected = (): Omit<SemanticLayerShellProps, 'wide' | 't'> => ({
      openOrCreateSession,
      // W6d: auto-flip enabled — computeEffectiveMode resolves 'B' (trigger)
      // vs 'A' (DashboardView) from evalRunCount against the threshold.
      layoutMode: 'auto',
      // W6d: eval run count for the auto-flip decision. Real source is
      // server-side (`ctx.evidenceQuery.getEvalStore().getRunIds().length`)
      // which has no client RPC bridge yet — see the file header. Passing 0
      // keeps the shell in the 'B' trigger layout until a host threads live
      // data through; this is the wiring point for that future data.
      evalRunCount: 0,
    })

    scope.slots.inject('sidebar.footer.action', () => scope.slots.register({
      name: 'sidebar.footer.action',
      id: 'semantic-layer',
      order: 0,
      locale: NS,
      inject: injected,
    }, SemanticLayerShell))

    return stopListSub
  })
}
