/**
 * W6c/W6d session-scoped slot adapters: bridge the framework `useProjection` +
 * `useSessions` seats to the semantic-layer GoalDock/EvidenceSidebar props, and
 * gate both on the management agent preset.
 *
 * These adapters live in session-scoped slots (`conversation.input.dock` and
 * `details.aux`) so `useProjection` (a SessionStandardProps seat) is available;
 * the root-scoped `sidebar.footer.action` SemanticLayerShell cannot read it —
 * see the file header of `index.ts` for that constraint.
 *
 * Management-session gate: read REACTIVELY inside the component via
 * `useSessions(s => s.byId[sessionId]?.agentPreset === PRESET_ID)`, NOT in the
 * inject factory. The framework memoizes each inject-factory result per
 * `SessionProvideInfo` identity, which is stable across `agentPreset` changes
 * (it re-materializes only on a provider-roster change, not on `noteAgentPreset`
 * list mutations) — so a boolean cached in the inject face would go stale.
 *
 * W11: evidence-query RPC bridge wired — `evidenceClient` injected from
 * `index.ts` apply(), `useEvidenceMetrics` derives live evalRunCount/evalPassRates.
 */
import { type FC } from 'react'
// Type-only: pulls the `goal` SessionProjectionMap merge + the GoalProjection
// type from the goal domain (the same source ui-goal's GoalDock adapter reads).
import type { GoalProjection } from '@deepseek-ai/dsh-goal/client'
// Type-only: pulls the ui-conversation SlotMap merge — the conversation.input.dock
// list slot the GoalDock adapter co-occupies with ui-goal's entry.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the ui-layout SlotMap merge — the `details.aux` slot the
// EvidenceSidebar adapter occupies, coexisting with `details`/DetailsPanel.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { GoalDock, type GoalDockGoalData } from './GoalDock.tsx'
import { EvidenceSidebar } from './EvidenceSidebar.tsx'
import { SchemaExplorer } from './SchemaExplorer.tsx'
import type { SelectionState, SelectionStoreProps } from './selectionStore.ts'
import type { SchemaGatewayClient } from './schemaGatewayBridge.ts'
import type { EvidenceQueryClient } from './hooks/useEvidenceQuery.ts'
import { useEvidenceMetrics } from './hooks/useEvidenceMetrics.ts'

/** The semantic-layer management agent preset id (shared with index.ts's session-opening logic). */
export const PRESET_ID = 'semantic-layer-management'

/**
 * Adapt a goal projection (the `useProjection('goal')` value) to GoalDock's
 * data shape. `undefined` (capability absent) and `null` (no goal set) both
 * collapse to `null` — GoalDock renders nothing. `projection.goal`
 * (GoalSnapshot) is structurally assignable to GoalDockGoalData.goal
 * (objective/phase/blockedReason/maxGoalRounds match; `id`/`revision` are
 * extra but harmless), so this is a shape pick, not a rebuild.
 */
export function toGoalDockGoalData(
  projection: GoalProjection | null | undefined,
): GoalDockGoalData | null {
  if (projection == null) return null
  return { goal: projection.goal, roundsStarted: projection.roundsStarted }
}

/** Full dock-adapter props: framework runtime kit + locale seat + injected evidence client. */
export type SemanticLayerGoalDockProps =
  PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'semanticLayer'>
  & { evidenceClient?: EvidenceQueryClient | null }

/**
 * Dock adapter (E8): a second `conversation.input.dock` entry (after ui-goal's)
 * that renders the semantic-layer GoalDock (objective + phase + round + eval
 * sparkline) only in management agent sessions.
 */
export const SemanticLayerGoalDock: FC<SemanticLayerGoalDockProps> = ({ useProjection, useSessions, sessionId, t, evidenceClient }) => {
  const active = useSessions(s => s.byId[sessionId]?.agentPreset === PRESET_ID)
  const projection = useProjection('goal')
  const { evalPassRates } = useEvidenceMetrics(evidenceClient ?? null)
  if (!active) return null
  const tAny = t as unknown as (key: string, params?: Record<string, unknown>) => string
  return <GoalDock goalData={toGoalDockGoalData(projection)} evalPassRates={evalPassRates} t={tAny} />
}

/** Full details.aux-adapter props: framework runtime kit + locale seat + injected evidence client. */
export type SemanticLayerEvidenceProps =
  PropsRuntime<'details.aux'>
  & PropsLocale<'semanticLayer'>
  & SelectionStoreProps
  & { evidenceClient?: EvidenceQueryClient | null }

/**
 * Details-column adapter (E9/E10): mounts EvidenceSidebar into the
 * session-scoped `details.aux` list slot (declared by ui-layout, rendered
 * beside `details`/DetailsPanel in AppFrame), only in management agent
 * sessions. `goalData` comes from `useProjection('goal')`; evidence metrics
 * are fetched live from the evidence-query RPC bridge.
 */
export const SemanticLayerEvidence: FC<SemanticLayerEvidenceProps> = ({
  useProjection, useSessions, sessionId, t, evidenceClient, useStore,
}) => {
  const active = useSessions(s => s.byId[sessionId]?.agentPreset === PRESET_ID)
  const projection = useProjection('goal')
  const selectedAsset = useStore((s: SelectionState) => s.selectedAsset)
  const { evalRunCount, evalPassRates } = useEvidenceMetrics(evidenceClient ?? null)
  if (!active) return null
  const tAny2 = t as unknown as (key: string, params?: Record<string, unknown>) => string
  return (
    <EvidenceSidebar
      enabled={true}
      t={tAny2}
      evidenceClient={evidenceClient ?? null}
      selectedAssetId={selectedAsset?.name}
      goalData={toGoalDockGoalData(projection)}
      evalPassRates={evalPassRates}
      layoutMode="auto"
      evalRunCount={evalRunCount}
    />
  )
}

/** Full details.aux-adapter props for the Schema Browser panel. */
export type SemanticLayerSchemaExplorerProps =
  PropsRuntime<'details.aux'>
  & PropsLocale<'semanticLayer'>
  & SelectionStoreProps
  & { schemaClient?: SchemaGatewayClient | null; onNavigateToGraph?: ((assetId: string) => void) | undefined }

/**
 * Details-column adapter (W9): mounts SchemaExplorer into the session-scoped
 * `details.aux` list slot, only in management agent sessions. The schema
 * gateway client is passed through inject; onNavigateToGraph opens the
 * fullscreen context layer overlay (W10).
 */
export const SemanticLayerSchemaExplorer: FC<SemanticLayerSchemaExplorerProps> = ({
  useSessions, sessionId, t, schemaClient, onNavigateToGraph, useStore, actions,
}) => {
  const active = useSessions(s => s.byId[sessionId]?.agentPreset === PRESET_ID)
  if (!active) return null
  const tAny = t as unknown as (key: string, params?: Record<string, unknown>) => string
  return (
    <SchemaExplorer
      client={schemaClient ?? null}
      t={tAny}
      onNavigateToGraph={onNavigateToGraph}
      useStore={useStore}
      actions={actions}
    />
  )
}
