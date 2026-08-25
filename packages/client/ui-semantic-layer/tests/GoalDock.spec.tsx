// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { GoalDock, type GoalDockGoalData } from '../src/client/GoalDock.tsx'

const t = (key: string) => key

const makeGoalData = (overrides?: Partial<GoalDockGoalData>): GoalDockGoalData => ({
  goal: {
    objective: 'Improve coverage to 95% across all trade tables',
    phase: 'active',
    maxGoalRounds: 10,
  },
  roundsStarted: 3,
  ...overrides,
})

describe('GoalDock', () => {
  it('returns null when goalData is null (no active goal)', () => {
    const { container } = render(<GoalDock goalData={null} evalPassRates={[]} t={t} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders objective, phase badge, and round counter when active with no eval data', () => {
    const goalData = makeGoalData()
    const { container } = render(<GoalDock goalData={goalData} evalPassRates={[]} t={t} />)

    // Objective text rendered
    expect(container.textContent).toContain('Improve coverage to 95%')

    // Phase badge
    const phaseBadge = container.querySelector('.sl-goal-dock__phase--active')
    expect(phaseBadge).not.toBeNull()
    expect(phaseBadge!.textContent).toBe('goal.phase.active')

    // Round counter
    expect(container.textContent).toContain('goal.round')
    expect(container.textContent).toContain('3/10')

    // No sparkline rendered
    expect(container.querySelector('.sl-goal-dock__sparkline')).toBeNull()
    expect(container.querySelector('.sl-goal-dock__sparkline-single')).toBeNull()
  })

  it('renders sparkline SVG with correct point count when evalPassRates has 2+ entries', () => {
    const goalData = makeGoalData()
    const passRates = [0.6, 0.7, 0.85, 0.9]
    const { container } = render(<GoalDock goalData={goalData} evalPassRates={passRates} t={t} />)

    const sparklineDiv = container.querySelector('.sl-goal-dock__sparkline')
    expect(sparklineDiv).not.toBeNull()

    const polyline = sparklineDiv!.querySelector('polyline')
    expect(polyline).not.toBeNull()

    // Points string should have 4 coordinate pairs separated by spaces
    const pointsAttr = polyline!.getAttribute('points')!
    const pointPairs = pointsAttr.trim().split(' ')
    expect(pointPairs).toHaveLength(4)

    // Last value displayed as percentage
    expect(sparklineDiv!.textContent).toContain('90%')
  })

  it('renders single percentage when evalPassRates has exactly 1 entry', () => {
    const goalData = makeGoalData()
    const { container } = render(<GoalDock goalData={goalData} evalPassRates={[0.73]} t={t} />)

    const singleSpan = container.querySelector('.sl-goal-dock__sparkline-single')
    expect(singleSpan).not.toBeNull()
    expect(singleSpan!.textContent).toBe('73%')

    // No SVG sparkline
    expect(container.querySelector('.sl-goal-dock__sparkline')).toBeNull()
  })

  it('renders blocked reason when phase is blocked', () => {
    const goalData = makeGoalData({
      goal: {
        objective: 'Fix broken pipeline',
        phase: 'blocked',
        blockedReason: { code: 'UPSTREAM_FAIL', message: 'Upstream pipeline timeout' },
        maxGoalRounds: 5,
      },
    })
    const { container } = render(<GoalDock goalData={goalData} evalPassRates={[]} t={t} />)

    // Phase badge shows blocked
    const phaseBadge = container.querySelector('.sl-goal-dock__phase--blocked')
    expect(phaseBadge).not.toBeNull()

    // Blocked reason message
    const blockedReason = container.querySelector('.sl-goal-dock__blocked-reason')
    expect(blockedReason).not.toBeNull()
    expect(blockedReason!.textContent).toBe('Upstream pipeline timeout')
  })

  it('does not render blocked reason when phase is active even if blockedReason exists', () => {
    const goalData = makeGoalData({
      goal: {
        objective: 'Some goal',
        phase: 'active',
        blockedReason: { code: 'STALE', message: 'Should not appear' },
        maxGoalRounds: 5,
      },
    })
    const { container } = render(<GoalDock goalData={goalData} evalPassRates={[]} t={t} />)

    expect(container.querySelector('.sl-goal-dock__blocked-reason')).toBeNull()
  })

  it('sets title attribute on objective for full text access', () => {
    const longObjective = 'This is a very long objective that should be truncated in the UI but accessible via title attribute for accessibility purposes'
    const goalData = makeGoalData({
      goal: {
        objective: longObjective,
        phase: 'active',
        maxGoalRounds: 8,
      },
    })
    const { container } = render(<GoalDock goalData={goalData} evalPassRates={[]} t={t} />)

    const objectiveEl = container.querySelector('.sl-goal-dock__objective')
    expect(objectiveEl).not.toBeNull()
    expect(objectiveEl!.getAttribute('title')).toBe(longObjective)
  })
})
