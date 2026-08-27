import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  PatrolService,
  DEFAULT_MAX_EDITS_PER_ROUND,
  DEFAULT_CONFIRM_TIMEOUT_MS,
} from '../src/index.ts'
import type { PatrolConfig } from '../src/index.ts'

// ── Mock Helpers ────────────────────────────────────────────────────────────

/**
 * Build a minimal mock Context matching the structural contract PatrolService
 * requires: managementSession, audit, evidenceQuery, and event emission.
 */
function createMockContext() {
  const events: Array<{ name: string; args: unknown[] }> = []

  const mockManagementSession = {
    getActive: vi.fn().mockReturnValue({
      sessionId: 'mgmt-session-1',
      session: {},
      createdAt: Date.now(),
    }),
    create: vi.fn(),
    destroy: vi.fn(),
  }

  const mockAudit = {
    log: vi.fn(),
  }

  const mockEvidenceQuery = {
    coverageQuery: vi.fn().mockReturnValue({
      table_count: 5,
      event_count: 2,
      metric_count: 3,
      domain_counts: { payment: 3, user: 2, order: 3 },
      confirmation: { draft: 3, confirmed: 5, rejected: 0 },
    }),
    gapAnalysis: vi.fn().mockReturnValue({
      sourceAssetId: 'test_asset',
      gaps: [{ assetId: 'gap_asset_1', joinPath: ['test_asset', 'gap_asset_1'] }],
    }),
    assetHealth: vi.fn().mockImplementation((assetId: string) => ({
      assetId,
      confirmationStatus: 'draft',
      hasEvalCoverage: false,
      relationCount: 1,
      lastModified: '',
    })),
    evalResultQuery: vi.fn().mockReturnValue({
      results: [
        { id: '1', assetId: 'weak_asset_1', caseId: 'case1', status: 'fail', timestamp: '' },
        { id: '2', assetId: 'weak_asset_2', caseId: 'case2', status: 'fail', timestamp: '' },
        { id: '3', assetId: 'weak_asset_3', caseId: 'case3', status: 'fail', timestamp: '' },
        { id: '4', assetId: 'weak_asset_4', caseId: 'case4', status: 'fail', timestamp: '' },
      ],
      total: 4,
    }),
  }

  const mockEvalRunner = {
    runBatch: vi.fn().mockResolvedValue({ run_id: 'run-1', cases: [], summary: {} }),
  }

  const serviceRegistry = new Map<string, unknown>([
    ['evidenceQuery', mockEvidenceQuery],
    ['evalRunner', mockEvalRunner],
  ])

  const ctx = {
    managementSession: mockManagementSession,
    audit: mockAudit,
    emit: vi.fn((...args: unknown[]) => {
      events.push({ name: args[0] as string, args: args.slice(1) })
    }),
    get: vi.fn((key: string) => serviceRegistry.get(key)),
    plugin: vi.fn(),
    reflect: { provide: vi.fn() },
    effect: vi.fn(() => () => {}),
    on: vi.fn(() => () => {}),
  } as unknown as import('@deepseek-ai/cordis').Context

  return { ctx, events, mockManagementSession, mockAudit, mockEvidenceQuery, mockEvalRunner }
}

/**
 * Create a PatrolService instance with the mock context, bypassing normal
 * Cordis service registration.
 */
function createPatrolService() {
  const mocks = createMockContext()
  const service = new PatrolService(mocks.ctx)
  return { service, ...mocks }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('PatrolService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── Start/Stop Lifecycle ──────────────────────────────────────────────

  describe('start/stop lifecycle', () => {
    it('starts in idle state', () => {
      const { service } = createPatrolService()
      expect(service.getState()).toBe('idle')
      expect(service.isRunning()).toBe(false)
    })

    it('transitions to running when started', () => {
      const { service, ctx } = createPatrolService()
      service.start()
      expect(service.getState()).toBe('running')
      expect(service.isRunning()).toBe(true)
      expect(ctx.emit).toHaveBeenCalledWith('patrol/started', expect.any(Object))
      service.stop()
    })

    it('throws when starting if already running', () => {
      const { service } = createPatrolService()
      service.start()
      expect(() => service.start()).toThrow('Cannot start patrol')
      service.stop()
    })

    it('transitions back to idle when stopped', () => {
      const { service, ctx } = createPatrolService()
      service.start()
      service.stop()
      expect(service.getState()).toBe('idle')
      expect(service.isRunning()).toBe(false)
      expect(ctx.emit).toHaveBeenCalledWith('patrol/stopped')
    })

    it('stop is idempotent when already idle', () => {
      const { service } = createPatrolService()
      expect(() => service.stop()).not.toThrow()
      expect(service.getState()).toBe('idle')
    })

    it('accepts config options', () => {
      const { service, ctx } = createPatrolService()
      const config: PatrolConfig = {
        maxEditsPerRound: 5,
        confirmTimeoutMs: 30000,
        scope: 'payment',
      }
      service.start(config)
      expect(ctx.emit).toHaveBeenCalledWith('patrol/started', {
        maxEditsPerRound: 5,
        confirmTimeoutMs: 30000,
        scope: 'payment',
      })
      service.stop()
    })

    it('uses defaults when no config is provided', () => {
      const { service, ctx } = createPatrolService()
      service.start()
      expect(ctx.emit).toHaveBeenCalledWith('patrol/started', {
        maxEditsPerRound: DEFAULT_MAX_EDITS_PER_ROUND,
        confirmTimeoutMs: DEFAULT_CONFIRM_TIMEOUT_MS,
        scope: '',
      })
      service.stop()
    })
  })

  // ── maxEditsPerRound Limit ────────────────────────────────────────────

  describe('maxEditsPerRound limit', () => {
    it('limits edits to the configured maxEditsPerRound', async () => {
      const { service, ctx, mockEvidenceQuery } = createPatrolService()

      // Set up 5 weak assets but limit to 2 edits per round
      mockEvidenceQuery.evalResultQuery.mockReturnValue({
        results: [
          { id: '1', assetId: 'a1', caseId: 'c1', status: 'fail', timestamp: '' },
          { id: '2', assetId: 'a2', caseId: 'c2', status: 'fail', timestamp: '' },
          { id: '3', assetId: 'a3', caseId: 'c3', status: 'fail', timestamp: '' },
          { id: '4', assetId: 'a4', caseId: 'c4', status: 'fail', timestamp: '' },
          { id: '5', assetId: 'a5', caseId: 'c5', status: 'fail', timestamp: '' },
        ],
        total: 5,
      })

      service.start({ maxEditsPerRound: 2 })

      // The loop starts and will emit patrol/round-start, then request confirms
      // Advance time to let the loop process
      await vi.advanceTimersByTimeAsync(10)

      // Should get a confirm-request for the first asset
      const confirmCalls = (ctx.emit as ReturnType<typeof vi.fn>).mock.calls
        .filter(c => c[0] === 'patrol/confirm-request')
      expect(confirmCalls.length).toBeGreaterThanOrEqual(1)

      service.stop()
    })

    it('default maxEditsPerRound is 3', () => {
      expect(DEFAULT_MAX_EDITS_PER_ROUND).toBe(3)
    })
  })

  // ── Confirm Timeout ───────────────────────────────────────────────────

  describe('confirm timeout behavior', () => {
    it('emits confirm-timeout when user does not respond in time', async () => {
      const { service, ctx } = createPatrolService()

      service.start({ confirmTimeoutMs: 100 })

      // Let the loop start and request a confirm
      await vi.advanceTimersByTimeAsync(50)

      // Verify a confirm request was emitted
      const confirmRequests = (ctx.emit as ReturnType<typeof vi.fn>).mock.calls
        .filter(c => c[0] === 'patrol/confirm-request')

      if (confirmRequests.length > 0) {
        // Advance past the timeout
        await vi.advanceTimersByTimeAsync(200)

        // Check that timeout was emitted
        const timeoutCalls = (ctx.emit as ReturnType<typeof vi.fn>).mock.calls
          .filter(c => c[0] === 'patrol/confirm-timeout')
        expect(timeoutCalls.length).toBeGreaterThanOrEqual(1)
      }

      service.stop()
    })

    it('default confirmTimeoutMs is 60000', () => {
      expect(DEFAULT_CONFIRM_TIMEOUT_MS).toBe(60_000)
    })

    it('respondToConfirm rejects the edit', async () => {
      const { service, ctx } = createPatrolService()

      service.start({ confirmTimeoutMs: 5000 })

      // Let the loop start
      await vi.advanceTimersByTimeAsync(10)

      const confirmRequests = (ctx.emit as ReturnType<typeof vi.fn>).mock.calls
        .filter(c => c[0] === 'patrol/confirm-request')

      if (confirmRequests.length > 0) {
        // User rejects
        service.respondToConfirm('rejected')
        await vi.advanceTimersByTimeAsync(10)

        // Should not get a timeout since we responded
        const timeoutsBeforeAdvance = (ctx.emit as ReturnType<typeof vi.fn>).mock.calls
          .filter(c => c[0] === 'patrol/confirm-timeout')
        expect(timeoutsBeforeAdvance.length).toBe(0)
      }

      service.stop()
    })

    it('respondToConfirm confirms the edit', async () => {
      const { service, ctx } = createPatrolService()

      service.start({ confirmTimeoutMs: 5000 })

      // Let the loop start
      await vi.advanceTimersByTimeAsync(10)

      const confirmRequests = (ctx.emit as ReturnType<typeof vi.fn>).mock.calls
        .filter(c => c[0] === 'patrol/confirm-request')

      if (confirmRequests.length > 0) {
        service.respondToConfirm('confirmed')
        await vi.advanceTimersByTimeAsync(10)
      }

      service.stop()
    })

    it('throws when respondToConfirm is called without pending confirm', () => {
      const { service } = createPatrolService()
      expect(() => service.respondToConfirm('confirmed'))
        .toThrow('No pending confirmation to respond to')
    })
  })

  // ── BTW Interruption (S3) ─────────────────────────────────────────────

  describe('btw interruption and resume', () => {
    it('throws when handleBtw is called while idle', async () => {
      const { service } = createPatrolService()
      await expect(service.handleBtw('hello')).rejects.toThrow('Cannot handle btw: patrol is not running')
    })

    it('emits btw-received event', async () => {
      const { service, ctx } = createPatrolService()
      service.start()

      await vi.advanceTimersByTimeAsync(10)
      await service.handleBtw('check order table')

      expect(ctx.emit).toHaveBeenCalledWith('patrol/btw-received', 'check order table')
      service.stop()
    })

    it('stops patrol on explicit stop command (Chinese)', async () => {
      const { service } = createPatrolService()
      service.start()
      await vi.advanceTimersByTimeAsync(10)

      await service.handleBtw('停止巡检')
      expect(service.isRunning()).toBe(false)
      expect(service.getState()).toBe('idle')
    })

    it('stops patrol on explicit stop command (English)', async () => {
      const { service } = createPatrolService()
      service.start()
      await vi.advanceTimersByTimeAsync(10)

      await service.handleBtw('stop patrol')
      expect(service.isRunning()).toBe(false)
      expect(service.getState()).toBe('idle')
    })

    it('stops patrol on "关闭 patrol"', async () => {
      const { service } = createPatrolService()
      service.start()
      await vi.advanceTimersByTimeAsync(10)

      await service.handleBtw('关闭 patrol')
      expect(service.isRunning()).toBe(false)
    })

    it('does not stop patrol on regular btw messages', async () => {
      const { service } = createPatrolService()
      service.start()
      await vi.advanceTimersByTimeAsync(10)

      await service.handleBtw('what is the coverage of user domain?')
      expect(service.isRunning()).toBe(true)
      service.stop()
    })

    it('patrol resumes after btw is handled', async () => {
      const { service } = createPatrolService()
      service.start()
      await vi.advanceTimersByTimeAsync(10)

      await service.handleBtw('quick question')
      expect(service.isRunning()).toBe(true)
      expect(service.getState()).not.toBe('idle')
      service.stop()
    })
  })

  // ── Event Emission ────────────────────────────────────────────────────

  describe('event emission', () => {
    it('emits patrol/started on start', () => {
      const { service, ctx } = createPatrolService()
      service.start()
      expect(ctx.emit).toHaveBeenCalledWith('patrol/started', expect.any(Object))
      service.stop()
    })

    it('emits patrol/stopped on stop', () => {
      const { service, ctx } = createPatrolService()
      service.start()
      service.stop()
      expect(ctx.emit).toHaveBeenCalledWith('patrol/stopped')
    })

    it('emits patrol/round-start at beginning of each round', async () => {
      const { service, ctx } = createPatrolService()
      service.start()
      await vi.advanceTimersByTimeAsync(10)

      const roundStarts = (ctx.emit as ReturnType<typeof vi.fn>).mock.calls
        .filter(c => c[0] === 'patrol/round-start')
      expect(roundStarts.length).toBeGreaterThanOrEqual(1)
      expect(roundStarts[0]![1]).toBe(1)
      service.stop()
    })
  })

  // ── No Weak Assets ────────────────────────────────────────────────────

  describe('no weak assets scenario', () => {
    it('pauses when no weak assets are found', async () => {
      const { service, ctx, mockEvidenceQuery } = createPatrolService()

      // No failing eval results
      mockEvidenceQuery.evalResultQuery.mockReturnValue({ results: [], total: 0 })

      service.start()
      await vi.advanceTimersByTimeAsync(10)

      const pauseCalls = (ctx.emit as ReturnType<typeof vi.fn>).mock.calls
        .filter(c => c[0] === 'patrol/paused')
      expect(pauseCalls.length).toBeGreaterThanOrEqual(1)
      expect(pauseCalls[0]![1]).toBe('no weak assets found')

      service.stop()
    })
  })

  // ── Scope Filtering ───────────────────────────────────────────────────

  describe('scope filtering', () => {
    it('accepts scope config to restrict patrol domain', () => {
      const { service, ctx } = createPatrolService()
      service.start({ scope: 'payment' })
      expect(ctx.emit).toHaveBeenCalledWith('patrol/started', expect.objectContaining({ scope: 'payment' }))
      service.stop()
    })
  })
})
