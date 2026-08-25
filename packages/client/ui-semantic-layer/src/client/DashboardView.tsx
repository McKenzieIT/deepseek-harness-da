/**
 * DashboardView — the "A" layout (evidence-first).
 *
 * Promotes evidence panel components (EvalTrajectory, CoveragePanel,
 * EvalDeltaView, GapPanel) to hero position. Provides a drill-down link
 * back to the workspace ("B") layout.
 *
 * Reuses existing evidence components — does not duplicate logic.
 */
import { type FC } from 'react'
import { CoveragePanel } from './CoveragePanel.tsx'
import { EvalTrajectory } from './EvalTrajectory.tsx'
import { EvalDeltaView } from './EvalDeltaView.tsx'
import { GapPanel } from './GapPanel.tsx'
import { useEvidenceQuery, type EvidenceQueryClient } from './hooks/useEvidenceQuery.ts'

export interface DashboardViewProps {
  evidenceClient?: EvidenceQueryClient | null
  t: (key: string) => string
  onNavigateToWorkspace?: () => void
}

export const DashboardView: FC<DashboardViewProps> = ({
  evidenceClient,
  t,
  onNavigateToWorkspace,
}) => {
  const { state } = useEvidenceQuery(evidenceClient ?? null)

  return (
    <div className="sl-dashboard">
      <div className="sl-dashboard__header">
        <h1 className="sl-dashboard__title">{t('dashboard.title')}</h1>
        {onNavigateToWorkspace && (
          <button className="sl-dashboard__workspace-link" onClick={onNavigateToWorkspace}>
            {t('dashboard.goToWorkspace')}
          </button>
        )}
      </div>

      <div className="sl-dashboard__hero">
        <EvalTrajectory evalResults={state.evalResults} loading={state.loading} t={t} />
      </div>

      <div className="sl-dashboard__kpi-row">
        <CoveragePanel coverage={state.coverage} loading={state.loading} t={t} />
      </div>

      <div className="sl-dashboard__detail">
        <EvalDeltaView evalDelta={state.evalDelta} loading={state.loading} t={t} />
        <GapPanel gapAnalysis={state.gapAnalysis} loading={state.loading} t={t} />
      </div>
    </div>
  )
}
