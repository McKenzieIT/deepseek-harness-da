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
 * list mutations) — so a boolean cached in the inject face would go stale:
 * a freshly-created management session's scope is materialized with the default
 * preset, the inject caches `active: false`, then `noteAgentPreset` lands and the
 * gate never re-evaluates. Reading it reactively in the component re-renders
 * when the list snapshot changes, so the dock/sidebar appear once the preset lands.
 *
 * Placeholders until the client evidence-query RPC bridge lands:
 *  - `evalPassRates = []`   (GoalDock sparkline does not render)
 *  - `evalRunCount = 0`     (auto-flip stays in the B layout below the threshold)
 *  - `evidenceClient = null`
 * Each TODO below marks the wiring point for that future data.
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

/** Full dock-adapter props: framework runtime kit + locale seat. `useSessions`,
 *  `sessionId`, and `useProjection` all arrive via the standard kit (no inject face). */
export type SemanticLayerGoalDockProps =
  PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'semanticLayer'>

/**
 * Dock adapter (E8): a second `conversation.input.dock` entry (after ui-goal's)
 * that renders the semantic-layer GoalDock (objective + phase + round + eval
 * sparkline) only in management agent sessions. `evalPassRates` is a placeholder
 * until the evidence-query client RPC bridge exists.
 */
export const SemanticLayerGoalDock: FC<SemanticLayerGoalDockProps> = ({ useProjection, useSessions, sessionId, t }) => {
  // Both hooks are unconditional (Rules of Hooks); the gate returns null after.
  const active = useSessions(s => s.byId[sessionId]?.agentPreset === PRESET_ID)
  const projection = useProjection('goal')
  if (!active) return null
  // TODO(evidence-query-rpc): replace [] with real eval pass rates from the
  // evidence-query client once the client RPC bridge exists.
  return <GoalDock goalData={toGoalDockGoalData(projection)} evalPassRates={[]} t={t} />
}

/** Full details.aux-adapter props: framework runtime kit + locale seat (no inject face). */
export type SemanticLayerEvidenceProps =
  PropsRuntime<'details.aux'>
  & PropsLocale<'semanticLayer'>

/**
 * Details-column adapter (E9/E10): mounts EvidenceSidebar into the
 * session-scoped `details.aux` list slot (declared by ui-layout, rendered
 * beside `details`/DetailsPanel in AppFrame), only in management agent
 * sessions. `goalData` comes from `useProjection('goal')`; `evalPassRates`,
 * `evalRunCount`, and `evidenceClient` are placeholders — auto resolves to
 * the B (compact) layout below the flip threshold until the evidence-query
 * RPC bridge lands.
 */
export const SemanticLayerEvidence: FC<SemanticLayerEvidenceProps> = ({ useProjection, useSessions, sessionId, t }) => {
  const active = useSessions(s => s.byId[sessionId]?.agentPreset === PRESET_ID)
  const projection = useProjection('goal')
  if (!active) return null
  return (
    <EvidenceSidebar
      enabled={true}
      t={t}
      evidenceClient={null}
      goalData={toGoalDockGoalData(projection)}
      // TODO(evidence-query-rpc): real eval pass rates once the bridge exists.
      evalPassRates={[]}
      layoutMode="auto"
      // TODO(evidence-query-rpc): real run count
      // (`ctx.evidenceQuery.getEvalStore().getRunIds().length`) once the bridge exists.
      evalRunCount={0}
    />
  )
}
