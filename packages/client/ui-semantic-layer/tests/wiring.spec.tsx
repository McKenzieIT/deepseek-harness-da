// @vitest-environment jsdom
/**
 * W6c/W6d session-scoped slot adapters: bridge the framework `useProjection` +
 * `useSessions` seats to the semantic-layer GoalDock/EvidenceSidebar props,
 * gated on the management agent preset. Covers the pure projection→GoalDockGoalData
 * mapping and the two thin adapters (E8 dock, E9/E10 details.aux), including the
 * reactive management-session gate.
 */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import type { GoalProjection } from '@deepseek-ai/dsh-goal/client'
import {
  toGoalDockGoalData,
  SemanticLayerGoalDock,
  SemanticLayerEvidence,
  PRESET_ID,
  type SemanticLayerGoalDockProps,
  type SemanticLayerEvidenceProps,
} from '../src/client/wiring.tsx'

const t = (key: string): string => key

function makeProjection(over: Partial<GoalProjection> = {}): GoalProjection {
  const base: GoalProjection = {
    goal: {
      id: 'goal-1' as GoalProjection['goal']['id'],
      revision: 1,
      objective: 'Reach 95% trade-table coverage',
      phase: 'active',
      maxGoalRounds: 10,
    },
    roundsStarted: 3,
    createdAt: 1_000,
    updatedAt: 2_000,
  }
  return { ...base, ...over, goal: { ...base.goal, ...(over.goal ?? {}) } }
}

// The framework hands a session-scoped slot component its full PropsRuntime kit;
// the adapter reads useSessions/sessionId/useProjection/t. The test mounts it
// with those four (useSessions is a plain selector-evaluating stub) and casts
// around the unused framework seats.
const sessionsSnapshotFor = (agentPreset: string | undefined) => ({
  byId: { s1: { agentPreset } },
})
const useSessionsStub = <S,>(snapshot: unknown) =>
  (selector: (s: unknown) => S): S => selector(snapshot)

describe('toGoalDockGoalData', () => {
  it('returns null when the projection is undefined (capability absent)', () => {
    expect(toGoalDockGoalData(undefined)).toBeNull()
  })

  it('returns null when the projection is null (no goal set)', () => {
    expect(toGoalDockGoalData(null)).toBeNull()
  })

  it('maps goal and roundsStarted when the projection is present', () => {
    const data = toGoalDockGoalData(makeProjection())
    expect(data).not.toBeNull()
    expect(data!.goal.objective).toBe('Reach 95% trade-table coverage')
    expect(data!.goal.phase).toBe('active')
    expect(data!.goal.maxGoalRounds).toBe(10)
    expect(data!.roundsStarted).toBe(3)
  })

  it('carries blockedReason through when the goal is blocked', () => {
    const data = toGoalDockGoalData(makeProjection({
      goal: {
        ...makeProjection().goal,
        phase: 'blocked',
        blockedReason: { code: 'upstream-fail', message: 'Upstream pipeline timeout' },
      },
    }))
    expect(data!.goal.phase).toBe('blocked')
    expect(data!.goal.blockedReason?.code).toBe('upstream-fail')
    expect(data!.goal.blockedReason?.message).toBe('Upstream pipeline timeout')
  })
})

describe('SemanticLayerGoalDock (E8 dock adapter)', () => {
  const renderDock = (agentPreset: string | undefined, useProjection: (key: string) => unknown) => {
    const props = {
      useProjection,
      useSessions: useSessionsStub(sessionsSnapshotFor(agentPreset)),
      sessionId: 's1',
      t,
    } as unknown as SemanticLayerGoalDockProps
    return render(<SemanticLayerGoalDock {...props} />)
  }

  it('renders nothing when the session is not a management session', () => {
    const { container } = renderDock('some-other-preset', () => makeProjection())
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when the session has no preset recorded', () => {
    const { container } = renderDock(undefined, () => makeProjection())
    expect(container.innerHTML).toBe('')
  })

  it('renders the goal objective, phase badge, and round counter in a management session', () => {
    const { container } = renderDock(PRESET_ID, () => makeProjection())
    expect(container.textContent).toContain('Reach 95% trade-table coverage')
    expect(container.querySelector('.sl-goal-dock__phase--active')).not.toBeNull()
    expect(container.textContent).toContain('3/10')
    // E11 placeholder: evalPassRates=[] → no sparkline rendered.
    expect(container.querySelector('.sl-goal-dock__sparkline')).toBeNull()
    expect(container.querySelector('.sl-goal-dock__sparkline-single')).toBeNull()
  })

  it('renders nothing in a management session when no goal is set (null projection)', () => {
    const { container } = renderDock(PRESET_ID, () => null)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing in a management session when the goal capability is absent (undefined projection)', () => {
    const { container } = renderDock(PRESET_ID, () => undefined)
    expect(container.innerHTML).toBe('')
  })
})

describe('SemanticLayerEvidence (E9/E10 details.aux adapter)', () => {
  const renderEvidence = (agentPreset: string | undefined, useProjection: (key: string) => unknown) => {
    const props = {
      useProjection,
      useSessions: useSessionsStub(sessionsSnapshotFor(agentPreset)),
      sessionId: 's1',
      t,
    } as unknown as SemanticLayerEvidenceProps
    return render(<SemanticLayerEvidence {...props} />)
  }

  it('renders nothing when the session is not a management session', () => {
    const { container } = renderEvidence('some-other-preset', () => makeProjection())
    expect(container.innerHTML).toBe('')
  })

  it('mounts the active EvidenceSidebar carrying the projected goal in a management session', () => {
    const { container } = renderEvidence(PRESET_ID, () => makeProjection())
    expect(container.querySelector('.sl-evidence-sidebar--active')).not.toBeNull()
    // GoalDock inside carries the projected objective.
    expect(container.textContent).toContain('Reach 95% trade-table coverage')
    // E9/E10 placeholder: layoutMode='auto' + evalRunCount=0 resolves to B (compact).
    expect(container.querySelector('.sl-evidence-sidebar--mode-b')).not.toBeNull()
    expect(container.querySelector('.sl-evidence-sidebar--mode-a')).toBeNull()
  })

  it('still mounts the sidebar body in a management session when no goal is set (goalData null, GoalDock hidden)', () => {
    const { container } = renderEvidence(PRESET_ID, () => null)
    expect(container.querySelector('.sl-evidence-sidebar--active')).not.toBeNull()
    expect(container.querySelector('.sl-coverage-panel')).not.toBeNull()
  })
})
