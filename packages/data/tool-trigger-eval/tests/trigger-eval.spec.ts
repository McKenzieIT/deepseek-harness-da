import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply, formatTriggerEval, projectMeta, type TriggerEvalResult, type EvalRunnerService } from '../src/index.ts'
import type { RunResult, RunSummary, CaseVerdict, DeltaReport } from '@deepseek-ai/dsh-eval-runner'

/** The subset of the registered `trigger_eval` definition these tests exercise. */
interface TriggerEvalToolDef {
  readonly name: string
  readonly description: string
  readonly output: {
    readonly schema: unknown
    readonly render: (args: unknown, value: unknown) => readonly { readonly type: string; readonly text: string }[]
    readonly presentationMeta: (args: unknown, value: unknown) => unknown
  }
  readonly execute: (
    args: { readonly skip_health_gate?: boolean },
    exec: { readonly signal: AbortSignal; readonly scopeId?: string },
  ) => Promise<unknown>
  readonly presentCall: (args: unknown) => unknown
  readonly presentResult: (
    args: unknown,
    result: { readonly content: readonly unknown[]; readonly isError: boolean; readonly meta?: Record<string, unknown> },
  ) => unknown
}

/**
 * Capture the tool definition `apply` registers, without standing up a real
 * Cordis container. `services` is the `ctx.get(key)` lookup table: an absent
 * key returns `undefined`, which models "that service is not mounted".
 */
function registerTool(services: Record<string, unknown> = {}): TriggerEvalToolDef {
  let def: TriggerEvalToolDef | undefined
  const ctx = {
    tools: {
      register: (d: TriggerEvalToolDef) => {
        def = d
      },
    },
    get: (key: string) => services[key],
  } as unknown as Context
  apply(ctx, {})
  if (def === undefined) {
    throw new Error('apply did not register a tool')
  }
  return def
}

/** Verdicts of the run the mounted runner double resolves — `cases.length` is the reported case count. */
const CASES: CaseVerdict[] = [
  { case_id: 'c1', pass_k_results: [], verdict: 'correct', latency_ms: 12 },
  { case_id: 'c2', pass_k_results: [], verdict: 'wrong', latency_ms: 34 },
]

/** Summary of the run the mounted runner double resolves (8/10 = 80.0% pass rate). */
const SUMMARY: RunSummary = {
  total: 10,
  correct: 8,
  wrong: 1,
  declined: 1,
  unjudged: 0,
  infra_failure: 0,
  pass_rate: 0.8,
}

/** The run `runBatch` resolves; `run_id` differs from the minted `runId` so the reported id is traceable. */
const RUN: RunResult = { run_id: 'run-b', timestamp: '2026-09-20T00:00:00Z', cases: CASES, summary: SUMMARY }

/** The baseline `getLastRun` reports when a previous run exists. */
const PREVIOUS_RUN: RunResult = {
  run_id: 'run-a',
  timestamp: '2026-09-01T00:00:00Z',
  cases: [],
  summary: { total: 10, correct: 5, wrong: 5, declined: 0, unjudged: 0, infra_failure: 0, pass_rate: 0.5 },
}

/** The delta `computeDelta` reports for PREVIOUS_RUN → RUN. */
const DELTA: DeltaReport = {
  run_a_id: 'run-a',
  run_b_id: 'run-b',
  flips: [{ case_id: 'c2', old_verdict: 'correct', new_verdict: 'wrong' }],
  summary: { improved: 3, regressed: 1, unchanged: 6 },
}

/** A delta that flipped nothing — every case held its verdict. */
const DELTA_UNCHANGED: DeltaReport = {
  run_a_id: 'run-a',
  run_b_id: 'run-b',
  flips: [],
  summary: { improved: 0, regressed: 0, unchanged: 10 },
}

/** The exact value `execute` returns when no eval seam at all is mounted. */
const NOT_CONFIGURED_VALUE = {
  ok: false,
  mode: 'not_configured',
  runId: null,
  summary: null,
  delta: null,
  caseCount: 0,
  message: 'Eval runner service (ctx.evalRunner) is not mounted. The host composition must wire AgentResponder + QueryExecutor + JudgeExecutor collaborators to enable eval runs.',
  previousRunId: null,
}

/** A `TriggerEvalResult` whose unset fields stay empty, so each test states only the fields it asserts on. */
function evalValue(overrides: Partial<TriggerEvalResult>): TriggerEvalResult {
  return {
    ok: true,
    mode: 'full_run',
    runId: null,
    summary: null,
    delta: null,
    caseCount: 0,
    message: undefined,
    previousRunId: null,
    ...overrides,
  }
}

/** The options `execute` hands to `EvalRunnerService.runBatch`. */
interface RunBatchOptions {
  runId?: string
  skipHealthGate?: boolean
  scopeId?: string
}

/**
 * A mounted `EvalRunnerService` double. `batchCalls` records the exact
 * `runBatch` options and `deltaCalls` the exact `computeDelta` operands, so a
 * test can assert what `execute` handed the service.
 */
function mountedRunner(lastRun: RunResult | null): {
  service: EvalRunnerService
  batchCalls: RunBatchOptions[]
  deltaCalls: [RunResult, RunResult][]
} {
  const batchCalls: RunBatchOptions[] = []
  const deltaCalls: [RunResult, RunResult][] = []
  const service: EvalRunnerService = {
    runBatch: (options?: RunBatchOptions) => {
      batchCalls.push(options ?? {})
      return Promise.resolve(RUN)
    },
    getLastRun: () => lastRun,
    computeDelta: (runA: RunResult, runB: RunResult) => {
      deltaCalls.push([runA, runB])
      return DELTA
    },
    getCaseCount: () => CASES.length,
    getResultsDir: () => '/tmp/eval-results',
  }
  return { service, batchCalls, deltaCalls }
}

/**
 * An `evidenceQuery` double exposing only the eval-store seam `execute` reads.
 * `runIds` is the id list the store reports for the report-last path.
 */
function evidenceQueryDouble(runIds: readonly (string | undefined)[]): { getEvalStore: () => { getRunIds: () => string[] } } {
  return { getEvalStore: () => ({ getRunIds: () => runIds as string[] }) }
}

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
        message: undefined,
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
        message: undefined,
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
        message: undefined,
        previousRunId: 'run-prev',
      }

      const text = formatTriggerEval(result)
      expect(text).toContain('... +5 more')
    })

    it('falls back to a generic failure line when a failed value carries no message', () => {
      expect(formatTriggerEval(evalValue({ ok: false }))).toBe('trigger_eval failed')
    })

    it('reports only the run id for a full run that carries no summary', () => {
      expect(formatTriggerEval(evalValue({ mode: 'full_run', runId: 'run-b' }))).toBe('Eval run completed: run-b')
    })

    it('omits the wrong count for a full run with no wrong cases', () => {
      const text = formatTriggerEval(evalValue({
        mode: 'full_run',
        runId: 'run-b',
        summary: { total: 10, correct: 10, wrong: 0, declined: 0, unjudged: 0, infra_failure: 0, pass_rate: 1 },
      }))
      expect(text).toBe('Eval run completed: run-b\nResults: 10/10 correct (100.0% pass rate)')
    })

    it('reports the stored summary in report_last mode', () => {
      const text = formatTriggerEval(evalValue({ mode: 'report_last', runId: 'old-run', summary: SUMMARY, message: '2 past run(s)' }))
      expect(text).toBe('Last eval run: old-run\nResults: 8/10 correct (80.0% pass rate)\n2 past run(s)')
    })

    it('omits the guidance line when a report_last value carries no message', () => {
      expect(formatTriggerEval(evalValue({ mode: 'report_last', runId: 'old-run' }))).toBe('Last eval run: old-run')
    })

    it('renders the carried guidance for a not_configured value that is flagged ok', () => {
      // The not_configured arm is the else of the mode dispatch, so it is only
      // reached with `ok: true` — `ok: false` returns from the first line.
      expect(formatTriggerEval(evalValue({ mode: 'not_configured', message: 'wire the collaborators' }))).toBe('wire the collaborators')
    })

    it('falls back to a default guidance line for an ok not_configured value with no message', () => {
      expect(formatTriggerEval(evalValue({ mode: 'not_configured' }))).toBe('Eval runner not configured')
    })

    it('labels the delta with run_a_id and omits the flip list when nothing flipped', () => {
      const text = formatTriggerEval(evalValue({ mode: 'full_run', runId: 'run-b', summary: SUMMARY, delta: DELTA_UNCHANGED }))
      expect(text).toBe(
        'Eval run completed: run-b\nResults: 8/10 correct (80.0% pass rate)\n  Wrong: 1\n  Declined: 1\n'
        + '\nDelta vs previous (run-a):\n  Improved: 0 | Regressed: 0 | Unchanged: 10',
      )
      expect(text).not.toContain('Flips:')
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

  describe('projectMeta', () => {
    it('projects the run id, summary, delta and message into a JSON-safe record', () => {
      const meta = projectMeta(evalValue({
        mode: 'full_run',
        runId: 'run-b',
        summary: SUMMARY,
        delta: DELTA,
        caseCount: 2,
        message: 'heads up',
        previousRunId: 'run-a',
      }))

      expect(meta).toEqual({
        ok: true,
        mode: 'full_run',
        runId: 'run-b',
        caseCount: 2,
        message: 'heads up',
        previousRunId: 'run-a',
        summary: { total: 10, correct: 8, wrong: 1, declined: 1, unjudged: 0, infra_failure: 0, pass_rate: 0.8 },
        delta: {
          run_a_id: 'run-a',
          run_b_id: 'run-b',
          flips: [{ case_id: 'c2', old_verdict: 'correct', new_verdict: 'wrong' }],
          summary: { improved: 3, regressed: 1, unchanged: 6 },
        },
      })
    })

    it('nulls the summary, the delta and an absent message', () => {
      const meta = projectMeta(evalValue({ ok: false, mode: 'not_configured' }))

      expect(meta).toEqual({
        ok: false,
        mode: 'not_configured',
        runId: null,
        caseCount: 0,
        message: null,
        previousRunId: null,
        summary: null,
        delta: null,
      })
    })
  })

  describe('registration and output projection', () => {
    it('registers trigger_eval with an output schema, presenters and an executor', () => {
      const def = registerTool()

      expect(def.name).toBe('trigger_eval')
      expect(def.description).toContain('Trigger a semantic layer eval run')
      expect(def.output.schema).toMatchObject({ type: 'object', additionalProperties: true })
      expect(typeof def.execute).toBe('function')
      expect(typeof def.presentCall).toBe('function')
      expect(typeof def.presentResult).toBe('function')
    })

    it('renders the model-facing text block from the tool value', () => {
      const def = registerTool()

      const content = def.output.render({}, evalValue({ mode: 'full_run', runId: 'run-b', summary: SUMMARY }))

      expect(content).toEqual([{
        type: 'text',
        text: 'Eval run completed: run-b\nResults: 8/10 correct (80.0% pass rate)\n  Wrong: 1\n  Declined: 1',
      }])
    })

    it('projects the presentation meta carried on the tool result', () => {
      const def = registerTool()

      const meta = def.output.presentationMeta({}, evalValue({
        mode: 'report_last',
        runId: 'old-run',
        caseCount: 0,
        message: '2 past run(s)',
      }))

      expect(meta).toEqual({
        ok: true,
        mode: 'report_last',
        runId: 'old-run',
        caseCount: 0,
        message: '2 past run(s)',
        previousRunId: null,
        summary: null,
        delta: null,
      })
    })
  })

  describe('execute', () => {
    it('rejects with "trigger_eval aborted" when the signal is already aborted', async () => {
      const { service, batchCalls } = mountedRunner(null)
      const def = registerTool({ evalRunner: service })
      const controller = new AbortController()
      controller.abort()

      await expect(def.execute({}, { signal: controller.signal, scopeId: 'scope-1' })).rejects.toThrow(/^trigger_eval aborted$/)
      expect(batchCalls).toEqual([])
    })

    it('declines a full run when the execution carries no scope id', async () => {
      const { service, batchCalls } = mountedRunner(PREVIOUS_RUN)
      const def = registerTool({ evalRunner: service })

      const value = await def.execute({}, { signal: new AbortController().signal })

      expect(batchCalls).toEqual([])
      expect(value).toEqual({
        ok: false,
        mode: 'not_configured',
        runId: null,
        summary: null,
        delta: null,
        caseCount: 0,
        message: 'trigger_eval full_run requires a scope; exec.scopeId is undefined. Invoke from within a scoped session.',
        previousRunId: null,
      })
    })

    it('runs the batch under a minted run id and reports the full run when there is no baseline', async () => {
      const { service, batchCalls, deltaCalls } = mountedRunner(null)
      const def = registerTool({ evalRunner: service })

      const value = await def.execute({}, { signal: new AbortController().signal, scopeId: 'scope-1' })

      expect(batchCalls).toHaveLength(1)
      expect(Object.keys(batchCalls[0] ?? {}).sort()).toEqual(['runId', 'scopeId', 'skipHealthGate'])
      expect(batchCalls[0]?.runId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
      expect(batchCalls[0]?.skipHealthGate).toBe(false)
      expect(batchCalls[0]?.scopeId).toBe('scope-1')
      expect(deltaCalls).toEqual([])
      expect(value).toEqual({
        ok: true,
        mode: 'full_run',
        runId: 'run-b',
        summary: SUMMARY,
        delta: null,
        caseCount: 2,
        message: undefined,
        previousRunId: null,
      })
    })

    it('forwards skip_health_gate and reports the delta against the previous run', async () => {
      const { service, batchCalls, deltaCalls } = mountedRunner(PREVIOUS_RUN)
      const def = registerTool({ evalRunner: service })

      const value = await def.execute({ skip_health_gate: true }, { signal: new AbortController().signal, scopeId: 'scope-7' })

      expect(batchCalls[0]?.skipHealthGate).toBe(true)
      expect(batchCalls[0]?.scopeId).toBe('scope-7')
      expect(deltaCalls).toHaveLength(1)
      expect(deltaCalls[0]?.[0]).toBe(PREVIOUS_RUN)
      expect(deltaCalls[0]?.[1]).toBe(RUN)
      expect(value).toEqual({
        ok: true,
        mode: 'full_run',
        runId: 'run-b',
        summary: SUMMARY,
        delta: DELTA,
        caseCount: 2,
        message: undefined,
        previousRunId: 'run-a',
      })
    })

    it('reports the newest stored run id when only the evidence store is mounted', async () => {
      const def = registerTool({ evidenceQuery: evidenceQueryDouble(['r1', 'r2']) })

      const value = await def.execute({}, { signal: new AbortController().signal, scopeId: 'scope-1' })

      expect(value).toEqual({
        ok: true,
        mode: 'report_last',
        runId: 'r2',
        summary: null,
        delta: null,
        caseCount: 0,
        message: 'Eval runner not wired (collaborators not configured). 2 past run(s) available via evidence-query. Configure the eval runner service to trigger new runs.',
        previousRunId: null,
      })
    })

    it('reports a null run id when the evidence store counts runs but holds no trailing id', async () => {
      // `getEvalStore()` is read off an unvalidated `ctx.get('evidenceQuery')`
      // cast, so a store whose last slot is empty does reach here; the `?? null`
      // guard keeps the tool from reporting `undefined` as a run id.
      const def = registerTool({ evidenceQuery: evidenceQueryDouble(['r1', 'r2', undefined]) })

      const value = await def.execute({}, { signal: new AbortController().signal, scopeId: 'scope-1' })

      expect(value).toEqual({
        ok: true,
        mode: 'report_last',
        runId: null,
        summary: null,
        delta: null,
        caseCount: 0,
        message: 'Eval runner not wired (collaborators not configured). 3 past run(s) available via evidence-query. Configure the eval runner service to trigger new runs.',
        previousRunId: null,
      })
    })

    it('reports not_configured when the evidence store holds no past runs', async () => {
      const def = registerTool({ evidenceQuery: evidenceQueryDouble([]) })

      const value = await def.execute({}, { signal: new AbortController().signal, scopeId: 'scope-1' })

      expect(value).toEqual(NOT_CONFIGURED_VALUE)
    })

    it('reports not_configured when neither the runner nor the evidence store is mounted', async () => {
      const def = registerTool()

      const value = await def.execute({}, { signal: new AbortController().signal, scopeId: 'scope-1' })

      expect(value).toEqual(NOT_CONFIGURED_VALUE)
    })
  })

  describe('presentation', () => {
    it('presents the pending call as a generic search card', () => {
      expect(registerTool().presentCall({})).toEqual({ card: 'generic', title: 'Trigger Eval Run', kind: 'search' })
    })

    it('presents nothing for a failed tool result', () => {
      expect(registerTool().presentResult({}, { content: [], isError: true })).toBeUndefined()
    })

    it('presents an unavailable card when the result carries no meta', () => {
      const view = registerTool().presentResult({}, { content: [], isError: false })

      expect(view).toEqual({ card: 'generic', title: 'Eval result unavailable' })
    })

    it('presents a not-configured card for a not_configured meta', () => {
      const view = registerTool().presentResult({}, { content: [], isError: false, meta: { mode: 'not_configured' } })

      expect(view).toEqual({ card: 'generic', title: 'Eval runner not configured' })
    })

    it('labels the mode when the meta carries no summary', () => {
      const view = registerTool().presentResult({}, { content: [], isError: false, meta: { mode: 'report_last', summary: null } })

      expect(view).toEqual({ card: 'generic', title: 'Eval: report_last' })
    })

    it('presents the rounded pass rate and correct count from the summary', () => {
      const meta = { mode: 'full_run', summary: SUMMARY, delta: null }

      const view = registerTool().presentResult({}, { content: [], isError: false, meta })

      expect(view).toEqual({ card: 'generic', title: '80% pass rate · 8/10 correct' })
    })

    it('appends the improved and regressed counts when the delta moved cases', () => {
      const meta = { mode: 'full_run', summary: SUMMARY, delta: DELTA }

      const view = registerTool().presentResult({}, { content: [], isError: false, meta })

      expect(view).toEqual({ card: 'generic', title: '80% pass rate · 8/10 correct · 3⬆ 1⬇' })
    })

    it('omits the delta suffix when nothing improved and nothing regressed', () => {
      const meta = { mode: 'full_run', summary: SUMMARY, delta: DELTA_UNCHANGED }

      const view = registerTool().presentResult({}, { content: [], isError: false, meta })

      expect(view).toEqual({ card: 'generic', title: '80% pass rate · 8/10 correct' })
    })
  })
})
