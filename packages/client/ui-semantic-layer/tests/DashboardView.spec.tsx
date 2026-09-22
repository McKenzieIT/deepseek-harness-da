// @vitest-environment jsdom
import { act, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DashboardView, type DashboardViewProps } from '../src/client/DashboardView.tsx'
import type { EvidenceQueryClient } from '../src/client/hooks/useEvidenceQuery.ts'
import { en, zh, type SemanticLayerKey } from '../src/client/locales.ts'
import type { EnrichedCoverageStats, EvalDeltaReport, EvalRunHistoryResult } from '../src/client/types.ts'

function translator(dictionary: typeof en): DashboardViewProps['t'] {
  return key => dictionary[key as SemanticLayerKey] ?? key
}

const COVERAGE: EnrichedCoverageStats = {
  table_count: 0,
  event_count: 0,
  metric_count: 0,
  domain_counts: {},
  confirmation: { draft: 0, confirmed: 0, rejected: 0, unknown: 0 },
}

function run(runId: string, timestamp: string, status: 'pass' | 'fail' | 'error' = 'pass') {
  return {
    runId,
    timestamp,
    pass: status === 'pass' ? 1 : 0,
    fail: status === 'fail' ? 1 : 0,
    error: status === 'error' ? 1 : 0,
    pending: 0,
    total: 1,
  }
}

function makeClient(overrides: Partial<EvidenceQueryClient> = {}): EvidenceQueryClient {
  return {
    coverageQuery: vi.fn(async () => COVERAGE),
    gapAnalysis: vi.fn(),
    reachabilityDelta: vi.fn(),
    evalResultQuery: vi.fn(),
    evalRunHistory: vi.fn(async () => ({
      runs: [],
      total: 0,
      assetFilterStatus: 'not_requested',
    } as EvalRunHistoryResult)),
    assetHealth: vi.fn(),
    beforeAfterDelta: vi.fn(),
    ...overrides,
  }
}

const DELTA: EvalDeltaReport = {
  runIdA: 'run-2',
  runIdB: 'run-3',
  flipped: [{ caseId: 'case-1', before: 'fail', after: 'pass' }],
  summary: { improved: 1, regressed: 0, unchanged: 0 },
}

describe('DashboardView locale copy', () => {
  it.each([
    ['English', en, 'Evidence Dashboard', 'Back to workspace'],
    ['Chinese', zh, '证据看板', '返回工作区'],
  ])('renders %s dashboard labels instead of raw keys', (_locale, dictionary, title, workspaceLabel) => {
    const { container } = render(
      <DashboardView
        evidenceClient={null}
        t={translator(dictionary)}
        onNavigateToWorkspace={() => undefined}
      />,
    )

    expect(container.textContent).toContain(title)
    expect(container.textContent).toContain(workspaceLabel)
    expect(container.textContent).not.toContain('dashboard.title')
    expect(container.textContent).not.toContain('dashboard.goToWorkspace')
  })
})

describe('DashboardView eval history', () => {
  it('shows loading while global history is pending', async () => {
    let resolveHistory: (result: EvalRunHistoryResult) => void = () => undefined
    const client = makeClient({
      evalRunHistory: vi.fn(() => new Promise<EvalRunHistoryResult>((resolve) => { resolveHistory = resolve })),
    })

    const { container } = render(<DashboardView evidenceClient={client} t={translator(en)} />)

    await waitFor(() => expect(container.textContent).toContain('Loading'))
    await act(async () => {
      resolveHistory({ runs: [], total: 0, assetFilterStatus: 'not_requested' } as EvalRunHistoryResult)
    })
  })

  it('shows empty history and no delta when no runs exist', async () => {
    const beforeAfterDelta = vi.fn()
    const client = makeClient({ beforeAfterDelta })
    const { container } = render(<DashboardView evidenceClient={client} t={translator(en)} />)

    await waitFor(() => expect(container.textContent).toContain('No eval runs recorded'))
    expect(client.evalRunHistory).toHaveBeenCalledWith({ limit: 10 })
    expect(beforeAfterDelta).not.toHaveBeenCalled()
    expect(container.textContent).toContain('No delta available')
  })

  it('shows a single run without requesting a delta', async () => {
    const beforeAfterDelta = vi.fn()
    const client = makeClient({
      evalRunHistory: vi.fn(async () => ({
        runs: [run('run-1', '2026-09-16T00:00:00Z')],
        total: 1,
        assetFilterStatus: 'not_requested',
      } as EvalRunHistoryResult)),
      beforeAfterDelta,
    })
    const { container } = render(<DashboardView evidenceClient={client} t={translator(en)} />)

    await waitFor(() => expect(container.textContent).toContain('run-1'))
    expect(beforeAfterDelta).not.toHaveBeenCalled()
    expect(container.textContent).toContain('No delta available')
  })

  it('loads three runs globally and compares the latest two by timestamp', async () => {
    const evalRunHistory = vi.fn(async () => ({
      runs: [
        run('run-3', '2026-09-18T00:00:00Z'),
        run('run-2', '2026-09-17T00:00:00Z', 'fail'),
        run('run-1', '2026-09-16T00:00:00Z'),
      ],
      total: 3,
      assetFilterStatus: 'not_requested',
    } as EvalRunHistoryResult))
    const beforeAfterDelta = vi.fn(async () => DELTA)
    const client = makeClient({ evalRunHistory, beforeAfterDelta })
    const { container } = render(<DashboardView evidenceClient={client} t={translator(en)} />)

    await waitFor(() => expect(container.textContent).toContain('run-3'))
    expect(container.textContent).toContain('run-2')
    expect(container.textContent).toContain('run-1')
    expect(evalRunHistory).toHaveBeenCalledWith({ limit: 10 })
    expect(beforeAfterDelta).toHaveBeenCalledWith('run-2', 'run-3', {})
    expect(container.textContent).toContain('1 improved')
  })

  it('renders an error when history loading fails', async () => {
    const client = makeClient({
      evalRunHistory: vi.fn(async () => { throw new Error('history unavailable') }),
    })
    const { container } = render(<DashboardView evidenceClient={client} t={translator(en)} />)

    await waitFor(() => expect(container.textContent).toContain('history unavailable'))
  })
})
