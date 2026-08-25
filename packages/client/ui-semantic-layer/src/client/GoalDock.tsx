/**
 * GoalDock — read-only goal status card for EvidenceSidebar (W6c).
 *
 * Displays the active goal's objective (truncated), phase badge,
 * round counter, and a mini sparkline of recent eval pass rates.
 *
 * When no goal is active, renders nothing.
 */
import { type FC } from 'react'

// The goal projection shape (from useProjection('goal')):
export interface GoalDockGoalData {
  goal: {
    objective: string
    phase: 'active' | 'paused' | 'blocked' | 'complete'
    blockedReason?: { code: string; message: string }
    maxGoalRounds: number
  }
  roundsStarted: number
}

// Eval sparkline data: array of pass_rates from recent eval runs
export interface GoalDockProps {
  /** Active goal projection data; null when no goal is active. */
  goalData: GoalDockGoalData | null
  /** Recent eval pass_rates for sparkline. Values are fractions in [0, 1]. */
  evalPassRates: number[]
  /** i18n translate. */
  t: (key: string) => string
}

export const GoalDock: FC<GoalDockProps> = ({ goalData, evalPassRates, t }) => {
  if (!goalData) return null  // Don't render when no active goal

  const { goal, roundsStarted } = goalData

  return (
    <div className="sl-goal-dock">
      {/* Objective: truncated to 2 lines, title attr for full text */}
      <div className="sl-goal-dock__objective" title={goal.objective}>
        {goal.objective}
      </div>

      {/* Phase badge */}
      <div className="sl-goal-dock__meta">
        <span className={`sl-goal-dock__phase sl-goal-dock__phase--${goal.phase}`}>
          {t(`goal.phase.${goal.phase}`)}
        </span>

        {/* Round counter */}
        <span className="sl-goal-dock__rounds">
          {t('goal.round')} {roundsStarted}/{goal.maxGoalRounds}
        </span>
      </div>

      {/* Eval sparkline: mini SVG line chart of pass_rates */}
      {evalPassRates.length > 0 && (
        <EvalSparkline passRates={evalPassRates} />
      )}

      {/* Block reason when phase=blocked */}
      {goal.phase === 'blocked' && goal.blockedReason && (
        <div className="sl-goal-dock__blocked-reason">
          {goal.blockedReason.message}
        </div>
      )}
    </div>
  )
}

/** Mini SVG sparkline for eval pass rates. */
interface SparklineProps {
  /** Pass-rate samples. Values are fractions in [0, 1]. */
  passRates: number[]
}

const EvalSparkline: FC<SparklineProps> = ({ passRates }) => {
  if (passRates.length < 2) {
    // Single point: just show the value
    const pct = Math.round((passRates[0] ?? 0) * 100)
    return <span className="sl-goal-dock__sparkline-single">{pct}%</span>
  }

  const width = 80
  const height = 24
  const padding = 2
  const innerWidth = width - padding * 2
  const innerHeight = height - padding * 2

  const min = Math.min(...passRates)
  const max = Math.max(...passRates)
  const range = max - min
  // When all values are equal, center the line vertically
  const normalizeY = (rate: number): number => range === 0
    ? padding + innerHeight / 2
    : padding + innerHeight - ((rate - min) / range) * innerHeight

  const points = passRates.map((rate, i) => {
    const x = padding + (i / (passRates.length - 1)) * innerWidth
    const y = normalizeY(rate)
    return `${x},${y}`
  }).join(' ')

  const lastRate = passRates[passRates.length - 1] ?? 0
  const pct = Math.round(lastRate * 100)

  return (
    <div className="sl-goal-dock__sparkline">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="sl-goal-dock__sparkline-value">{pct}%</span>
    </div>
  )
}
