/**
 * Semantic layer management plugin, browser half. Registers:
 *  - SemanticLayerShell into `sidebar.footer.action` (trigger for management sessions)
 *  - Tool presenters for search_schema/get_definition/get_coverage/discover_relations/trigger_eval
 *  - EvidenceSidebar (exported for host-composition placement in the details column)
 *
 * W5-full: Evidence capability progressive illumination — sidebar renders
 * coverage stats, eval trajectory, gap analysis, and before/after eval delta
 * from ctx.evidenceQuery data.
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
