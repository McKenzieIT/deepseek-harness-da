/**
 * EvidenceSidebar — full evidence panel for the semantic layer (W5-full).
 *
 * Feature-flag gated:
 *   enabled=false → W5-lite placeholder
 *   enabled=true  → full evidence views (coverage, gap, eval, delta)
 *
 * Consumes the EvidenceQueryClient and renders coverage stats, asset health,
 * eval trajectory, gap analysis, and before/after eval delta.
 */
import { useEffect, type FC } from 'react'
import { useEvidenceQuery, type EvidenceQueryClient } from './hooks/useEvidenceQuery.ts'
import { CoveragePanel } from './CoveragePanel.tsx'
import { GapPanel } from './GapPanel.tsx'
import { EvalTrajectory } from './EvalTrajectory.tsx'
import { EvalDeltaView } from './EvalDeltaView.tsx'
import { OnDemandEvalTrigger } from './OnDemandEvalTrigger.tsx'
import { GoalDock, type GoalDockGoalData } from './GoalDock.tsx'

export interface EvidenceSidebarProps {
  enabled: boolean
  t: (key: string) => string
  evidenceClient?: EvidenceQueryClient | null | undefined
  selectedAssetId?: string | undefined
  goalData?: GoalDockGoalData | null  // W6c: active goal projection data
  evalPassRates?: number[]  // W6c: recent eval pass rates for sparkline
}

export const EvidenceSidebar: FC<EvidenceSidebarProps> = ({
  enabled,
  t,
  evidenceClient,
  selectedAssetId,
  goalData,
  evalPassRates,
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

  return (
    <aside className="sl-evidence-sidebar sl-evidence-sidebar--active">
      <EvidenceSidebarContent
        evidenceClient={evidenceClient ?? null}
        selectedAssetId={selectedAssetId}
        t={t}
        goalData={goalData ?? null}
        evalPassRates={evalPassRates ?? []}
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
}

const EvidenceSidebarContent: FC<ContentProps> = ({
  evidenceClient,
  selectedAssetId,
  t,
  goalData,
  evalPassRates,
}) => {
  const {
    state,
    fetchGapAnalysis,
    fetchEvalResults,
    triggerEval,
  } = useEvidenceQuery(evidenceClient)

  useEffect(() => {
    if (!selectedAssetId) return
    void fetchGapAnalysis(selectedAssetId)
    void fetchEvalResults({ assetId: selectedAssetId, limit: 50 })
  }, [selectedAssetId, fetchGapAnalysis, fetchEvalResults])

  return (
    <div className="sl-evidence-sidebar__content">
      <GoalDock goalData={goalData} evalPassRates={evalPassRates} t={t} />
      <CoveragePanel coverage={state.coverage} loading={state.loading} t={t} />
      <OnDemandEvalTrigger assetId={selectedAssetId} onTrigger={triggerEval} t={t} />
      <GapPanel gapAnalysis={state.gapAnalysis} loading={state.loading} t={t} />
      <EvalTrajectory evalResults={state.evalResults} loading={state.loading} t={t} />
      <EvalDeltaView evalDelta={state.evalDelta} loading={state.loading} t={t} />
      {state.error && (
        <div className="sl-evidence-sidebar__error">
          <p>{t('error')}: {state.error}</p>
        </div>
      )}
    </div>
  )
}
