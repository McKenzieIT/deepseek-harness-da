import { describe, expect, it, vi } from 'vitest'
import { formatTriggerEval, type TriggerEvalResult, type EvalRunnerService } from '../src/index.ts'
import type { RunResult, DeltaReport } from '@deepseek-ai/dsh-eval-runner'

describe('trigger_eval tool', () => {
  describe('formatTriggerEval', () => {
    it('formats a successful full run', () => {
      const result: TriggerEvalResult = {
        ok: true,
        mode: 'full_run',
        runId: 'run-123',
        summary: {
          total: 161,
          correct: 130,
          wrong: 20,
          declined: 5,
          unjudged: 3,
          infra_failure: 3,
          pass_rate: 0.8075,
        },
        delta: null,
        caseCount: 161,
        message: null,
        previousRunId: null,
      }

      const text = formatTriggerEval(result)
      expect(text).toContain('Eval run completed: run-123')
      expect(text).toContain('130/161 correct')
      expect(text).toContain('80.8% pass rate')
      expect(text).toContain('Wrong: 20')
    })

    it('formats a run with delta', () => {
      const result: TriggerEvalResult = {
        ok: true,
        mode: 'full_run',
        runId: 'run-456',
        summary: {
          total: 161,
          correct: 135,
          wrong: 15,
          declined: 5,
          unjudged: 3,
          infra_failure: 3,
          pass_rate: 0.8385,
        },
        delta: {
          run_a_id: 'run-123',
          run_b_id: 'run-456',
          flips: [
            { case_id: 'case-1', old_verdict: 'wrong', new_verdict: 'correct' },
            { case_id: 'case-2', old_verdict: 'correct', new_verdict: 'wrong' },
          ],
          summary: { improved: 7, regressed: 2, unchanged: 152 },
        },
        caseCount: 161,
        message: null,
        previousRunId: 'run-123',
      }

      const text = formatTriggerEval(result)
      expect(text).toContain('Eval run completed: run-456')
      expect(text).toContain('Delta vs previous (run-123)')
      expect(text).toContain('Improved: 7')
      expect(text).toContain('Regressed: 2')
      expect(text).toContain('⬆ case-1: wrong → correct')
      expect(text).toContain('⬇ case-2: correct → wrong')
    })

    it('formats not_configured mode', () => {
      const result: TriggerEvalResult = {
        ok: false,
        mode: 'not_configured',
        runId: null,
        summary: null,
        delta: null,
        caseCount: 0,
        message: 'Eval runner service not mounted',
        previousRunId: null,
      }

      const text = formatTriggerEval(result)
      expect(text).toBe('Eval runner service not mounted')
    })

    it('formats report_last mode', () => {
      const result: TriggerEvalResult = {
        ok: true,
        mode: 'report_last',
        runId: 'old-run',
        summary: null,
        delta: null,
        caseCount: 0,
        message: '3 past run(s) available',
        previousRunId: null,
      }

      const text = formatTriggerEval(result)
      expect(text).toContain('Last eval run: old-run')
    })

    it('truncates flips list beyond 10', () => {
      const flips = Array.from({ length: 15 }, (_, i) => ({
        case_id: `case-${i}`,
        old_verdict: 'wrong' as const,
        new_verdict: 'correct' as const,
      }))

      const result: TriggerEvalResult = {
        ok: true,
        mode: 'full_run',
        runId: 'run-x',
        summary: {
          total: 100,
          correct: 90,
          wrong: 10,
          declined: 0,
          unjudged: 0,
          infra_failure: 0,
          pass_rate: 0.9,
        },
        delta: {
          run_a_id: 'run-prev',
          run_b_id: 'run-x',
          flips,
          summary: { improved: 15, regressed: 0, unchanged: 85 },
        },
        caseCount: 100,
        message: null,
        previousRunId: 'run-prev',
      }

      const text = formatTriggerEval(result)
      expect(text).toContain('... +5 more')
    })
  })

  describe('EvalRunnerService contract', () => {
    it('satisfies the interface shape', () => {
      const mockService: EvalRunnerService = {
        runBatch: vi.fn().mockResolvedValue({
          run_id: 'test-run',
          timestamp: '2026-08-25T00:00:00Z',
          cases: [],
          summary: { total: 0, correct: 0, wrong: 0, declined: 0, unjudged: 0, infra_failure: 0, pass_rate: 0 },
        } satisfies RunResult),
        getLastRun: vi.fn().mockReturnValue(null),
        getLastTwoRuns: vi.fn().mockReturnValue(null),
        computeDelta: vi.fn().mockReturnValue({
          run_a_id: 'a',
          run_b_id: 'b',
          flips: [],
          summary: { improved: 0, regressed: 0, unchanged: 0 },
        } satisfies DeltaReport),
        getCaseCount: vi.fn().mockReturnValue(161),
        getResultsDir: vi.fn().mockReturnValue('/tmp/eval-results'),
      }

      expect(mockService.getCaseCount()).toBe(161)
      expect(mockService.getLastRun()).toBeNull()
    })
  })
})
