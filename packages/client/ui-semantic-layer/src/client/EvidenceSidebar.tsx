/**
 * EvidenceSidebar renders the compact or evidence-first semantic-layer panel.
 * It always loads eval history: globally without a selected asset, or with an
 * asset filter request when selected. Evidence-query applies that filter only
 * when persisted cases have a reliable case-to-asset mapping source; otherwise the
 * returned history stays global and carries an unavailable status for the UI.
 */
import { useEffect, type FC } from 'react'
import { useEvidenceQuery, type EvidenceQueryClient } from './hooks/useEvidenceQuery.ts'
import { computeEffectiveMode, type LayoutMode } from './hooks/useLayoutMode.ts'
import { CoveragePanel } from './CoveragePanel.tsx'
import { GapPanel } from './GapPanel.tsx'
import { EVAL_TRAJECTORY_RUN_LIMIT, EvalTrajectory } from './EvalTrajectory.tsx'
import { EvalDeltaView } from './EvalDeltaView.tsx'
import { OnDemandEvalTrigger } from './OnDemandEvalTrigger.tsx'
import { GoalDock, type GoalDockGoalData } from './GoalDock.tsx'

/** Resolved layout: the compact 'B' or the dashboard 'A' (auto resolved upstream). */
type EffectiveMode = 'B' | 'A'

export interface EvidenceSidebarProps {
  enabled: boolean
  t: (key: string, params?: Record<string, unknown>) => string
  evidenceClient?: EvidenceQueryClient | null | undefined
  selectedAssetId?: string | undefined
  goalData?: GoalDockGoalData | null  // W6c: active goal projection data
  evalPassRates?: number[]  // W6c: recent eval pass rates for sparkline
  /** W6d: layout mode; 'auto' flips B→A once evalRunCount crosses the threshold. Defaults to 'B'. */
  layoutMode?: LayoutMode
  /** W6d: completed eval run count driving the auto-flip. Defaults to 0 (stays in B). */
  evalRunCount?: number
}

export const EvidenceSidebar: FC<EvidenceSidebarProps> = ({
  enabled,
  t,
  evidenceClient,
  selectedAssetId,
  goalData,
  evalPassRates,
  layoutMode = 'B',
  evalRunCount = 0,
}) => {
  if (!enabled) {
    return (
      <aside className="sl-evidence-sidebar sl-evidence-sidebar--disabled">
        <div className="sl-evidence-sidebar__placeholder">
          <span className="sl-evidence-sidebar__icon">🚧</span>
          <p className="sl-evidence-sidebar__text">{t('evidence.placeholder')}</p>
        </div>
      </aside>
    )
  }

  const effectiveMode: EffectiveMode = computeEffectiveMode(layoutMode, evalRunCount)

  return (
    <aside
      className={`sl-evidence-sidebar sl-evidence-sidebar--active sl-evidence-sidebar--mode-${effectiveMode.toLowerCase()}`}
    >
      <EvidenceSidebarContent
        evidenceClient={evidenceClient ?? null}
        selectedAssetId={selectedAssetId}
        t={t}
        goalData={goalData ?? null}
        evalPassRates={evalPassRates ?? []}
        effectiveMode={effectiveMode}
      />
    </aside>
  )
}

interface ContentProps {
  evidenceClient: EvidenceQueryClient | null
  selectedAssetId?: string | undefined
  t: (key: string) => string
  goalData: GoalDockGoalData | null
  evalPassRates: number[]
  effectiveMode: EffectiveMode
}

const EvidenceSidebarContent: FC<ContentProps> = ({
  evidenceClient,
  selectedAssetId,
  t,
  goalData,
  evalPassRates,
  effectiveMode,
}) => {
  const {
    state,
    fetchGapAnalysis,
    fetchEvalHistory,
    triggerEval,
  } = useEvidenceQuery(evidenceClient)

  useEffect(() => {
    if (selectedAssetId) void fetchGapAnalysis(selectedAssetId)
    void fetchEvalHistory(selectedAssetId
      ? { assetId: selectedAssetId, limit: EVAL_TRAJECTORY_RUN_LIMIT }
      : { limit: EVAL_TRAJECTORY_RUN_LIMIT })
  }, [selectedAssetId, fetchGapAnalysis, fetchEvalHistory])

  return (
    <div className="sl-evidence-sidebar__content">
      <GoalDock goalData={goalData} evalPassRates={evalPassRates} t={t} />
      {effectiveMode === 'A' ? (
        // A (dashboard) layout: EvalTrajectory promoted to a hero block, CoveragePanel
        // as a KPI row — DashboardView's core fused into the sidebar, no separate route.
        <>
          <div className="sl-evidence-sidebar__hero">
            <EvalTrajectory evalHistory={state.evalHistory} loading={state.loading} t={t} />
          </div>
          <div className="sl-evidence-sidebar__kpi-row">
            <CoveragePanel coverage={state.coverage} loading={state.loading} t={t} />
          </div>
          <OnDemandEvalTrigger assetId={selectedAssetId} onTrigger={triggerEval} t={t} />
          <EvalDeltaView evalDelta={state.evalDelta} loading={state.loading} t={t} />
          <GapPanel gapAnalysis={state.gapAnalysis} loading={state.loading} t={t} />
        </>
      ) : (
        // B (compact) layout: CoveragePanel leads, trajectory inline below.
        <>
          <CoveragePanel coverage={state.coverage} loading={state.loading} t={t} />
          <OnDemandEvalTrigger assetId={selectedAssetId} onTrigger={triggerEval} t={t} />
          <GapPanel gapAnalysis={state.gapAnalysis} loading={state.loading} t={t} />
          <EvalTrajectory evalHistory={state.evalHistory} loading={state.loading} t={t} />
          <EvalDeltaView evalDelta={state.evalDelta} loading={state.loading} t={t} />
        </>
      )}
      {state.error && (
        <div className="sl-evidence-sidebar__error">
          <p>{t('error')}: {state.error}</p>
        </div>
      )}
    </div>
  )
}
