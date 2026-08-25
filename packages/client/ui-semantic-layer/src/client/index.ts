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
 *    EvidenceSidebar. As of W6c/W6d both are wired through session-scoped
 *    slot adapters in `./wiring.tsx` (so `useProjection` — a
 *    SessionStandardProps seat — is available, which the root-scoped
 *    `sidebar.footer.action` is not): `SemanticLayerGoalDock` mounts into
 *    `conversation.input.dock` (a second entry after ui-goal's, management
 *    sessions only); `SemanticLayerEvidence` mounts EvidenceSidebar into the
 *    `details.aux` list slot declared by ui-layout (coexisting with
 *    DetailsPanel in the right column, management sessions only). `goalData`
 *    comes from `useProjection('goal')` (same source as ui-goal's GoalBar);
 *    `evalPassRates`, `evalRunCount`, and `evidenceClient` remain placeholders
 *    (see the TODOs in wiring.tsx) pending the evidence-query client RPC
 *    bridge.
 */
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { SemanticLayerShell, type SemanticLayerShellProps } from './SemanticLayerShell.tsx'
import { en, zh } from './locales.ts'
import { semanticLayerPresenters } from './presenters/index.ts'
import { SemanticLayerGoalDock, SemanticLayerEvidence, PRESET_ID } from './wiring.tsx'

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

    // W6c/W6d session-scoped slot adapters (./wiring.tsx). The management-session
    // gate is read REACTIVELY inside each adapter via useSessions (not the inject
    // factory, whose result the framework memoizes per SessionProvideInfo identity
    // and would go stale when noteAgentPreset lands after a freshly-created session's
    // scope is materialized); non-management sessions render nothing, so ui-goal's
    // dock entry and ui-conversation's DetailsPanel stay untouched there.

    // E8: a second conversation.input.dock entry (after ui-goal's, order 10)
    // rendering the semantic-layer GoalDock (objective + phase + round + the
    // eval sparkline, currently a placeholder).
    scope.slots.inject('conversation.input.dock', () => scope.slots.register({
      name: 'conversation.input.dock',
      id: 'semantic-layer-evidence',
      order: 20,
      locale: NS,
    }, SemanticLayerGoalDock))

    // E9/E10: EvidenceSidebar in the right details column — the details.aux
    // list slot declared by ui-layout, coexisting with DetailsPanel. auto-flip
    // resolves to the B (compact) layout while evalRunCount stays a placeholder.
    scope.slots.inject('details.aux', () => scope.slots.register({
      name: 'details.aux',
      id: 'semantic-layer-evidence',
      order: 0,
      locale: NS,
    }, SemanticLayerEvidence))

    return stopListSub
  })
}
