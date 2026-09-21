/**
 * DashboardView — the "A" layout (evidence-first).
 *
 * Promotes evidence panel components (EvalTrajectory, CoveragePanel,
 * EvalDeltaView, GapPanel) to hero position. Provides a drill-down link
 * back to the workspace ("B") layout.
 *
 * Loads global eval history on mount, compares the latest two returned runs,
 * and reuses the existing evidence components for presentation.
 */
import { useEffect, type FC } from 'react'
import { CoveragePanel } from './CoveragePanel.tsx'
import { EVAL_TRAJECTORY_RUN_LIMIT, EvalTrajectory } from './EvalTrajectory.tsx'
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
  const { state, fetchEvalHistory } = useEvidenceQuery(evidenceClient ?? null)

  useEffect(() => { void fetchEvalHistory({ limit: EVAL_TRAJECTORY_RUN_LIMIT }) }, [fetchEvalHistory])

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
        <EvalTrajectory evalHistory={state.evalHistory} loading={state.loading} t={t} />
      </div>

      <div className={css.kpiRow}>
        <CoveragePanel coverage={state.coverage} loading={state.loading} t={t} />
      </div>

      {state.error && <p className={css.error}>{t('error')}: {state.error}</p>}

      <div className={css.detail}>
        <EvalDeltaView evalDelta={state.evalDelta} loading={state.loading} t={t} />
        <GapPanel gapAnalysis={state.gapAnalysis} loading={state.loading} t={t} />
      </div>
    </div>
  )
}
