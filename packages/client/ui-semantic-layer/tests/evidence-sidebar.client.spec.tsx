// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { EvidenceSidebar } from '../src/client/EvidenceSidebar.tsx'
import { CoveragePanel } from '../src/client/CoveragePanel.tsx'
import { EvalTrajectory } from '../src/client/EvalTrajectory.tsx'
import { EvalDeltaView } from '../src/client/EvalDeltaView.tsx'
import { GapPanel } from '../src/client/GapPanel.tsx'
import { OnDemandEvalTrigger } from '../src/client/OnDemandEvalTrigger.tsx'
import type { EnrichedCoverageStats, EvalRunHistoryResult, EvalDeltaReport, GapAnalysisResult } from '../src/client/types.ts'

const t = (key: string) => key

describe('EvidenceSidebar', () => {
  it('renders placeholder when disabled', () => {
    const { container } = render(<EvidenceSidebar enabled={false} t={t} />)
    expect(container.querySelector('.sl-evidence-sidebar--disabled')).not.toBeNull()
    expect(container.textContent).toContain('evidence.placeholder')
  })

  it('renders active panel when enabled', () => {
    const { container } = render(
      <EvidenceSidebar enabled={true} t={t} evidenceClient={null} />,
    )
    expect(container.querySelector('.sl-evidence-sidebar--active')).not.toBeNull()
  })
})

describe('CoveragePanel', () => {
  it('renders loading state', () => {
    const { container } = render(<CoveragePanel coverage={null} loading={true} t={t} />)
    expect(container.querySelector('.sl-coverage-panel--loading')).not.toBeNull()
  })

  it('renders empty state', () => {
    const { container } = render(<CoveragePanel coverage={null} loading={false} t={t} />)
    expect(container.textContent).toContain('evidence.coverage.empty')
  })

  it('renders coverage stats', () => {
    const coverage: EnrichedCoverageStats = {
      table_count: 321,
      event_count: 445,
      metric_count: 3916,
      domain_counts: { trade: 100, finance: 50 },
      confirmation: { draft: 700, confirmed: 66, rejected: 0, unknown: 0 },
    }
    const { container } = render(<CoveragePanel coverage={coverage} loading={false} t={t} />)
    expect(container.textContent).toContain('321')
    expect(container.textContent).toContain('445')
    expect(container.textContent).toContain('3916')
    expect(container.textContent).toContain('66')
  })
})

describe('EvalTrajectory', () => {
  it('renders empty when no results', () => {
    const { container } = render(<EvalTrajectory evalHistory={null} loading={false} t={t} />)
    expect(container.textContent).toContain('evidence.eval.noResults')
  })

  it('renders results with pass rate', () => {
    const evalHistory: EvalRunHistoryResult = {
      runs: [
        { runId: 'run-a', timestamp: '2026-08-01T00:02:00Z', pass: 2, fail: 1, error: 0, pending: 0, total: 3 },
      ],
      total: 1,
      assetFilterStatus: 'not_requested',
    }
    const { container } = render(<EvalTrajectory evalHistory={evalHistory} loading={false} t={t} />)
    expect(container.textContent).toContain('67%')
    expect(container.textContent).toContain('2 evidence.eval.pass')
    expect(container.textContent).toContain('1 evidence.eval.fail')
  })

  it('labels global fallback when asset filtering is unavailable', () => {
    const evalHistory: EvalRunHistoryResult = {
      runs: [
        { runId: 'run-a', timestamp: '2026-08-01T00:00:00Z', pass: 1, fail: 0, error: 0, pending: 0, total: 1 },
      ],
      total: 1,
      assetFilterStatus: 'unavailable',
    }
    const { container } = render(<EvalTrajectory evalHistory={evalHistory} loading={false} t={t} />)
    expect(container.textContent).toContain('evidence.eval.assetFilterUnavailable')
    expect(container.textContent).toContain('run-a')
  })

  it('labels unavailable asset filtering when the global fallback is empty', () => {
    const evalHistory: EvalRunHistoryResult = {
      runs: [],
      total: 0,
      assetFilterStatus: 'unavailable',
    }
    const { container } = render(<EvalTrajectory evalHistory={evalHistory} loading={false} t={t} />)
    expect(container.textContent).toContain('evidence.eval.assetFilterUnavailable')
    expect(container.textContent).toContain('evidence.eval.noResults')
  })

  it('reports matching runs omitted by the history limit', () => {
    const evalHistory: EvalRunHistoryResult = {
      runs: Array.from({ length: 10 }, (_, index) => ({
        runId: `run-${index}`,
        timestamp: `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
        pass: 1,
        fail: 0,
        error: 0,
        pending: 0,
        total: 1,
      })),
      total: 12,
      assetFilterStatus: 'not_requested',
    }
    const { container } = render(<EvalTrajectory evalHistory={evalHistory} loading={false} t={t} />)
    expect(container.textContent).toContain('+2 evidence.eval.more')
  })

})

describe('EvalDeltaView', () => {
  it('renders empty when no delta', () => {
    const { container } = render(<EvalDeltaView evalDelta={null} loading={false} t={t} />)
    expect(container.textContent).toContain('evidence.evalDelta.empty')
  })

  it('renders delta summary and flips', () => {
    const delta: EvalDeltaReport = {
      runIdA: 'aaaaaaaa-1111-2222-3333-444444444444',
      runIdB: 'bbbbbbbb-1111-2222-3333-444444444444',
      flipped: [
        { caseId: 'case-x', before: 'fail', after: 'pass' },
        { caseId: 'case-y', before: 'pass', after: 'fail' },
      ],
      summary: { improved: 5, regressed: 2, unchanged: 154 },
    }
    const { container } = render(<EvalDeltaView evalDelta={delta} loading={false} t={t} />)
    expect(container.textContent).toContain('aaaaaaaa')
    expect(container.textContent).toContain('bbbbbbbb')
    expect(container.textContent).toContain('5 evidence.evalDelta.improved')
    expect(container.textContent).toContain('2 evidence.evalDelta.regressed')
    expect(container.textContent).toContain('case-x')
    expect(container.textContent).toContain('fail → pass')
  })
})

describe('GapPanel', () => {
  it('renders empty state', () => {
    const { container } = render(<GapPanel gapAnalysis={null} loading={false} t={t} />)
    expect(container.textContent).toContain('evidence.gap.empty')
  })

  it('renders no-gaps message', () => {
    const gap: GapAnalysisResult = { sourceAssetId: 'table_a', gaps: [] }
    const { container } = render(<GapPanel gapAnalysis={gap} loading={false} t={t} />)
    expect(container.textContent).toContain('evidence.gap.noGaps')
  })

  it('renders gap entries with join paths', () => {
    const gap: GapAnalysisResult = {
      sourceAssetId: 'dws_orders',
      gaps: [
        { assetId: 'dim_user', joinPath: ['dws_orders', 'dim_user'] },
        { assetId: 'dim_product', joinPath: ['dws_orders', 'dim_product'] },
      ],
    }
    const { container } = render(<GapPanel gapAnalysis={gap} loading={false} t={t} />)
    expect(container.textContent).toContain('dws_orders')
    expect(container.textContent).toContain('dim_user')
    expect(container.textContent).toContain('dim_product')
  })
})

describe('OnDemandEvalTrigger', () => {
  it('renders trigger button', () => {
    const onTrigger = vi.fn().mockResolvedValue('run-id')
    const { container } = render(<OnDemandEvalTrigger onTrigger={onTrigger} t={t} />)
    expect(container.textContent).toContain('evidence.eval.trigger')
    expect(container.querySelector('button')).not.toBeNull()
  })
})

describe('EvidenceSidebar layout mode (W6d auto-flip)', () => {
  it('renders the B (compact) layout when auto resolves below the threshold', () => {
    const { container } = render(
      <EvidenceSidebar enabled={true} t={t} evidenceClient={null} layoutMode="auto" evalRunCount={0} />,
    )
    expect(container.querySelector('.sl-evidence-sidebar--mode-b')).not.toBeNull()
    expect(container.querySelector('.sl-evidence-sidebar--mode-a')).toBeNull()
    // B layout: no hero block; CoveragePanel leads the body.
    expect(container.querySelector('.sl-evidence-sidebar__hero')).toBeNull()
    expect(container.querySelector('.sl-coverage-panel')).not.toBeNull()
  })

  it('renders the A (hero/dashboard) layout when auto flips at the threshold', () => {
    const { container } = render(
      <EvidenceSidebar enabled={true} t={t} evidenceClient={null} layoutMode="auto" evalRunCount={3} />,
    )
    expect(container.querySelector('.sl-evidence-sidebar--mode-a')).not.toBeNull()
    expect(container.querySelector('.sl-evidence-sidebar--mode-b')).toBeNull()
    // A layout: EvalTrajectory promoted into a hero block (DashboardView core fused in).
    expect(container.querySelector('.sl-evidence-sidebar__hero')).not.toBeNull()
  })

  it('defaults to the B layout when layout mode and run count are omitted', () => {
    const { container } = render(<EvidenceSidebar enabled={true} t={t} evidenceClient={null} />)
    expect(container.querySelector('.sl-evidence-sidebar--mode-b')).not.toBeNull()
  })

  it('honours an explicit B layout regardless of run count', () => {
    const { container } = render(
      <EvidenceSidebar enabled={true} t={t} evidenceClient={null} layoutMode="B" evalRunCount={50} />,
    )
    expect(container.querySelector('.sl-evidence-sidebar--mode-b')).not.toBeNull()
    expect(container.querySelector('.sl-evidence-sidebar--mode-a')).toBeNull()
  })
})
