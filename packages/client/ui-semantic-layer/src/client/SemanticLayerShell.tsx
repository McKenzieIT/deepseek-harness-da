/**
 * SemanticLayerShell — sidebar footer-action trigger that opens or resumes
 * the semantic-layer management agent session. Clicking the button finds the
 * existing session with `agentPreset === 'semantic-layer-management'` and
 * opens it, or creates a new one when none exists.
 *
 * W6d: Also acts as the layout router — based on `layoutMode` and
 * `evalRunCount`, resolves the effective layout (B=workspace, A=dashboard)
 * and renders the appropriate view when used as a full-page shell.
 *
 * Receives the `SidebarFooterActionOwnerProps` owner share (`{ wide }`) and
 * the inject factory's action callback.
 *
 * W6c/W6d: goalData, evalPassRates, and evalRunCount are provided by the
 * host composition via useProjection('goal') and
 * ctx.evidenceQuery.getEvalStore().getRunIds(). See:
 * apps/cli/config/agent-presets/semantic-layer-management/ for the
 * production wiring. This package only ships the framework components; the
 * host loader is responsible for threading live data into these props.
 */
import clsx from 'clsx'
import {
  IconDataOutline16, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import css from './SemanticLayerShell.module.css'
import { DashboardView } from './DashboardView.tsx'
import { computeEffectiveMode, type LayoutMode } from './hooks/useLayoutMode.ts'
import type { EvidenceQueryClient } from './hooks/useEvidenceQuery.ts'
import { useEvidenceMetrics } from './hooks/useEvidenceMetrics.ts'

export interface SemanticLayerShellProps {
  /** Whether the sidebar renders wide content (false = 56px rail). */
  wide: boolean
  /** Locale-bound translate for this namespace. */
  t: TranslateNS<'semanticLayer'>
  /** Open or create the management agent session. */
  openOrCreateSession: () => void
  /** Layout mode configuration: 'B' (workspace), 'A' (dashboard), or 'auto'. */
  layoutMode?: LayoutMode
  /** Number of completed eval runs; used for auto-flip decision. */
  evalRunCount?: number
  /** Minimum eval runs to auto-flip from B to A. Default: 3. */
  autoFlipThreshold?: number
  /** Evidence query client for the dashboard view. */
  evidenceClient?: EvidenceQueryClient | null
  /** Callback to navigate to the workspace view (for dashboard drill-down). */
  onNavigateToWorkspace?: () => void
}

export function SemanticLayerShell({
  wide,
  t,
  openOrCreateSession,
  layoutMode = 'auto',
  evalRunCount: evalRunCountProp = 0,
  autoFlipThreshold = 3,
  evidenceClient,
  onNavigateToWorkspace,
}: SemanticLayerShellProps) {
  const metrics = useEvidenceMetrics(evidenceClient ?? null)
  const evalRunCount = evidenceClient ? metrics.evalRunCount : evalRunCountProp
  const effectiveMode = computeEffectiveMode(layoutMode, evalRunCount, autoFlipThreshold)

  // When effective mode is 'A', render the dashboard view as the default
  if (effectiveMode === 'A' && evidenceClient) {
    return (
      <DashboardView
        evidenceClient={evidenceClient}
        t={t as unknown as (k: string, p?: Record<string, unknown>) => string}
        onNavigateToWorkspace={onNavigateToWorkspace}
      />
    )
  }

  // Default: 'B' layout — the sidebar trigger button (workspace-first)
  return (
    <Tooltip label={t('title')} delayMs={500} disabled={wide}>
      <button
        type="button"
        className={clsx(css.trigger, !wide && css.triggerRail)}
        onClick={openOrCreateSession}
      >
        <IconDataOutline16 size={wide ? 16 : 18} />
        {wide && <span className={css.label}>{t('title')}</span>}
      </button>
    </Tooltip>
  )
}
