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
import css from './DashboardView.module.css'

export interface DashboardViewProps {
  evidenceClient?: EvidenceQueryClient | null
  t: (key: string, params?: Record<string, unknown>) => string
  onNavigateToWorkspace?: (() => void) | undefined
}

export const DashboardView: FC<DashboardViewProps> = ({
  evidenceClient,
  t,
  onNavigateToWorkspace,
}) => {
  const { state } = useEvidenceQuery(evidenceClient ?? null)

  return (
    <div className={css.dashboard}>
      <div className={css.header}>
        <h1 className={css.title}>{t('dashboard.title')}</h1>
        {onNavigateToWorkspace && (
          <button className={css.workspaceLink} onClick={onNavigateToWorkspace}>
            {t('dashboard.goToWorkspace')}
          </button>
        )}
      </div>

      <div className={css.hero}>
        <EvalTrajectory evalResults={state.evalResults} loading={state.loading} t={t} />
      </div>

      <div className={css.kpiRow}>
        <CoveragePanel coverage={state.coverage} loading={state.loading} t={t} />
      </div>

      <div className={css.detail}>
        <EvalDeltaView evalDelta={state.evalDelta} loading={state.loading} t={t} />
        <GapPanel gapAnalysis={state.gapAnalysis} loading={state.loading} t={t} />
      </div>
    </div>
  )
}
