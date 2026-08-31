/**
 * W13: End-to-end integration test for the autonomous self-calibration loop.
 *
 * Wires the full assembly: goal-round-driver + goal-eval-policy +
 * goal-eval-context + eval-runner-service (stubbed at the LLM/query boundary)
 * in a real Cordis context with a real agent loop. Verifies the four
 * mechanical scenarios that together make the ③ loop:
 *
 *   1. Goal create → round continuation (followup → inbox → pre-step → admit)
 *   2. Eval evidence injection (goal active + store has data → <eval_evidence>)
 *   3. Policy count + eval trigger (K=3 admitted rounds → evalRunner.runBatch)
 *   4. No-progress block (N=3 consecutive improved===0 → block 'no-progress')
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import GoalService from '@deepseek-ai/dsh-goal'
import type { GoalView } from '@deepseek-ai/dsh-goal'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { EvalResultStore } from '@deepseek-ai/dsh-evidence-query'
import type { EvalResultRecord, EvalDeltaReport, EvalCaseFlip } from '@deepseek-ai/dsh-evidence-query'
import * as goalRoundDriver from '../src/index.ts'
import { apply as applyEvalPolicy } from '@deepseek-ai/dsh-goal-eval-policy'
import {
  apply as applyEvalContext,
  buildEvalEvidenceParams,
  renderEvalEvidence,
} from '@deepseek-ai/dsh-goal-eval-context'

// ──────────────────── Test LLM adapter ────────────────────

type ScriptEntry = StreamChunk[] | Error

function textResponse(text: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

class ScriptedAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  constructor(private readonly script: ScriptEntry[]) {
    super()
  }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const entry = this.script.shift()
    if (entry === undefined) throw new Error('ScriptedAdapter: script exhausted')
    if (entry instanceof Error) throw entry
    for (const chunk of entry) yield chunk
  }
}

// ──────────────────── Real delta computation ────────────────────

const STATUS_RANK: Record<EvalResultRecord['status'], number> = { pass: 3, fail: 1, error: 0, pending: 0 }

function realBeforeAfterDelta(store: EvalResultStore): (runIdA: string, runIdB: string) => EvalDeltaReport {
  return (runIdA: string, runIdB: string): EvalDeltaReport => {
    const recordsA = store.getByRunId(runIdA)
    const recordsB = store.getByRunId(runIdB)
    const mapA = new Map(recordsA.map(r => [r.caseId, r]))
    const mapB = new Map(recordsB.map(r => [r.caseId, r]))

    const flipped: EvalCaseFlip[] = []
    let improved = 0
    let regressed = 0
    let unchanged = 0

    const allCaseIds = new Set([...mapA.keys(), ...mapB.keys()])
    for (const caseId of allCaseIds) {
      const a = mapA.get(caseId)
      const b = mapB.get(caseId)
      if (!a || !b) continue
      if (a.status === b.status) { unchanged++ }
      else {
        flipped.push({ caseId, before: a.status, after: b.status })
        if (b.status === 'pass' && a.status !== 'pass') improved++
        else if (a.status === 'pass' && b.status !== 'pass') regressed++
        else if (STATUS_RANK[b.status] > STATUS_RANK[a.status]) improved++
        else regressed++
      }
    }
    return { runIdA, runIdB, flipped, summary: { improved, regressed, unchanged } }
  }
}

function record(runId: string, caseId: string, status: 'pass' | 'fail'): EvalResultRecord {
  return {
    id: `${runId}:${caseId}`,
    assetId: caseId,
    caseId,
    status,
    timestamp: '2026-01-01T00:00:00Z',
    metadata: { runId },
  }
}

// ──────────────────── Harness ────────────────────

interface E2EHarness {
  readonly ctx: Context
  readonly adapter: ScriptedAdapter
  readonly agent: Agent
  readonly evalStore: EvalResultStore
  readonly runBatchSpy: ReturnType<typeof vi.fn>
}

const contexts: Context[] = []

afterEach(async () => {
  await Promise.allSettled(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

/**
 * Mount the full autonomous loop assembly:
 *   agent-loop-testkit deps → GoalService → goal-round-driver →
 *   goal-eval-policy → goal-eval-context.
 *
 * The eval-runner-service is replaced by a spy-instrumented stub that does
 * NOT run real LLM/SQL — its runBatch() records calls and populates the
 * in-memory EvalResultStore so the policy can observe realistic run
 * sequences without external dependencies.
 *
 * The eval-policy and eval-context plugins are mounted via direct apply()
 * calls rather than ctx.plugin(). This bypasses Cordis inject resolution
 * (whose full service matching requires real Service subclass instances for
 * evidenceQuery/evalRunner) while correctly registering event listeners and
 * system prompt sections on the shared context — the same functional wiring
 * the production composition achieves through Cordis's scope chain.
 */
async function e2eHarness(
  script: ScriptEntry[],
  options: {
    K?: number
    N?: number
    /** Pre-programmed eval run results: each entry is an array of (caseId, pass/fail) pairs per runBatch call. */
    evalResults?: Array<Array<[string, 'pass' | 'fail']>>
  } = {},
): Promise<E2EHarness> {
  const { K = 3, N = 3, evalResults = [] } = options
  const ctx = new Context()
  contexts.push(ctx)

  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(GoalService)
  await ctx.plugin(goalRoundDriver)

  // Real in-memory EvalResultStore — shared between the eval-runner stub,
  // goal-eval-policy (via evidenceQuery.getEvalStore), and goal-eval-context.
  const evalStore = new EvalResultStore()
  let runCounter = 0
  const runBatchSpy = vi.fn(async () => {
    const runId = `run-${++runCounter}`
    const results = evalResults[runCounter - 1]
    if (results) {
      for (const [caseId, status] of results) {
        evalStore.add(record(runId, caseId, status))
      }
    }
    return { run_id: runId }
  })

  // Wire the evidenceQuery seam directly on the context. The Cordis proxy
  // set trap accepts property writes, making them accessible to plugins that
  // read ctx.evidenceQuery inside their apply() functions.
  const deltaFn = realBeforeAfterDelta(evalStore)
  ;(ctx as unknown as Record<string, unknown>).evidenceQuery = {
    getEvalStore: () => evalStore,
    beforeAfterDelta: (a: string, b: string) => deltaFn(a, b),
  }

  // Wire the evalRunner seam via Cordis provide. The goal-eval-policy reads
  // it via ctx.get('evalRunner') — Cordis resolves provided services through
  // the reflect layer's get() trap.
  ctx.provide('evalRunner', { runBatch: runBatchSpy })

  // Mount goal-eval-policy via direct apply (bypasses inject checks)
  applyEvalPolicy(ctx, {
    goalEvalIntervalRounds: K,
    noProgressThreshold: N,
  })

  // Mount goal-eval-context via direct apply. Registers the eval-evidence
  // system prompt section. Note: the plugin's goalActive flag is set by its
  // own goal/changed listener. In production, agent-scoped events (emitted
  // by the GoalService via agentEvents) reach this listener because the
  // plugin is mounted in the agent's preset scope. In this test, the
  // listener is registered at the root — agent-scoped events may not bubble
  // to it. Scenario 2 verifies the render pipeline independently.
  applyEvalContext(ctx, { hintEscalationThreshold: 2 })

  await ctx.plugin(AgentLoop, { agents: [] })

  const adapter = new ScriptedAdapter(script)
  ctx.llm.registerAdapter(['mock'], adapter)

  const agent = ctx.agentLoop.create(SessionId(`e2e-loop-${Math.random()}`), {
    provider: 'mock',
    model: 'mock',
  })

  return { ctx, adapter, agent, evalStore, runBatchSpy }
}

async function waitForGoal(
  ctx: Context,
  agent: Agent,
  predicate: (goal: GoalView | undefined) => boolean,
): Promise<GoalView | undefined> {
  await vi.waitFor(() => {
    expect(predicate(ctx.goals.get(agent))).toBe(true)
  })
  return ctx.goals.get(agent)
}

function requestText(request: GenerateOptions): string {
  return request.messages
    .flatMap(m => m.content)
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
}

// ──────────────────── End-to-end scenarios ────────────────────

describe('autonomous self-calibration loop end-to-end', () => {
  it('scenario 1: goal create → round continuation → round message admitted', async () => {
    const test = await e2eHarness([
      textResponse('round 1 work done'),
      textResponse('round 2 work done'),
    ])

    test.ctx.goals.create(test.agent, { objective: 'improve coverage', maxGoalRounds: 2 })

    const goal = await waitForGoal(test.ctx, test.agent, g => g?.phase === 'blocked')

    // Both rounds were admitted and executed
    expect(goal?.roundsStarted).toBe(2)
    expect(goal?.blockedReason?.code).toBe('round-limit')
    expect(test.adapter.requests).toHaveLength(2)

    // Round messages carried the goal_round prompt structure
    expect(requestText(test.adapter.requests[0]!)).toContain('<goal_round>')
    expect(requestText(test.adapter.requests[0]!)).toContain('Round: 1/2')
    expect(requestText(test.adapter.requests[1]!)).toContain('Round: 2/2')

    // Session events confirm admitted goal rounds (round > 0)
    const admittedRounds = test.agent.session.events
      .filter(e => e.type === 'user/message' && e.data.source.kind === 'goal' && (e.data.source as unknown as { round: number }).round > 0)
      .map(e => e.type === 'user/message' ? (e.data.source as unknown as { round: number }).round : 0)
    expect(admittedRounds).toEqual([1, 2])
  })

  it('scenario 2: eval evidence render pipeline produces correct XML from real store data', async () => {
    const test = await e2eHarness([
      textResponse('round 1'),
    ])

    // Pre-populate the eval store with run data
    test.evalStore.add(record('baseline-run', 'c1', 'pass'))
    test.evalStore.add(record('baseline-run', 'c2', 'fail'))
    test.evalStore.add(record('baseline-run', 'c3', 'fail'))

    test.ctx.goals.create(test.agent, { objective: 'check evidence injection', maxGoalRounds: 1 })
    await waitForGoal(test.ctx, test.agent, g => g?.phase === 'blocked')

    // Verify the full render pipeline: EvalResultStore → buildEvalEvidenceParams
    // → renderEvalEvidence → <eval_evidence> XML block. This is the exact code
    // path the plugin's systemPrompt text() function executes when goalActive=true.
    const store = test.evalStore
    const deltaFn = realBeforeAfterDelta(store)
    const params = buildEvalEvidenceParams(true, store, deltaFn)
    const rendered = renderEvalEvidence({ ...params, hintEscalationThreshold: 2 })

    expect(rendered).not.toBeNull()
    expect(rendered).toContain('<eval_evidence>')
    expect(rendered).toContain('Pass rate: 1/3 (33%)')
    expect(rendered).toContain('</eval_evidence>')

    // Verify the section IS registered on ctx.systemPrompt (structural wiring)
    const assembly = await test.ctx.systemPrompt.assemble({})
    const section = assembly.sections.find((s: { name: string }) => s.name === 'eval-evidence')
    expect(section).toBeDefined()

    // Verify with multiple runs: delta rendering
    test.evalStore.add(record('second-run', 'c1', 'pass'))
    test.evalStore.add(record('second-run', 'c2', 'pass'))
    test.evalStore.add(record('second-run', 'c3', 'fail'))

    const params2 = buildEvalEvidenceParams(true, store, deltaFn)
    const rendered2 = renderEvalEvidence({ ...params2, hintEscalationThreshold: 2 })!

    expect(rendered2).toContain('Pass rate: 2/3 (67%)')
    expect(rendered2).toContain('+1 improved')
    expect(rendered2).toContain('Progress detected')
  })

  it('scenario 3: policy triggers evalRunner.runBatch after K=3 admitted rounds', async () => {
    const test = await e2eHarness(
      Array.from({ length: 4 }, (_, i) => textResponse(`round ${i + 1}`)),
      {
        K: 3,
        N: 3,
        evalResults: [
          [['c1', 'fail'], ['c2', 'fail'], ['c3', 'fail']],
        ],
      },
    )

    test.ctx.goals.create(test.agent, { objective: 'trigger eval at K=3', maxGoalRounds: 4 })

    await waitForGoal(test.ctx, test.agent, g => g?.phase === 'blocked')

    // runBatch should have been called once (after 3 rounds)
    expect(test.runBatchSpy).toHaveBeenCalledTimes(1)

    // Eval store should have the run data persisted by our stub
    expect(test.evalStore.getRunIds()).toContain('run-1')
    const records = test.evalStore.getByRunId('run-1')
    expect(records).toHaveLength(3)
  })

  it('scenario 4: no-progress block after N=3 consecutive no-improvement evals', async () => {
    // K=3, N=3: need 4 eval cycles (12 rounds) for the block:
    //   cycle 1 (rounds 1-3):  baseline (no delta comparison)
    //   cycle 2 (rounds 4-6):  improved=0 → counter=1
    //   cycle 3 (rounds 7-9):  improved=0 → counter=2
    //   cycle 4 (rounds 10-12): improved=0 → counter=3 → BLOCK
    const test = await e2eHarness(
      Array.from({ length: 12 }, (_, i) => textResponse(`round ${i + 1}`)),
      {
        K: 3,
        N: 3,
        evalResults: [
          [['c1', 'fail'], ['c2', 'fail'], ['c3', 'fail']],
          [['c1', 'fail'], ['c2', 'fail'], ['c3', 'fail']],
          [['c1', 'fail'], ['c2', 'fail'], ['c3', 'fail']],
          [['c1', 'fail'], ['c2', 'fail'], ['c3', 'fail']],
        ],
      },
    )

    test.ctx.goals.create(test.agent, { objective: 'detect stagnation', maxGoalRounds: 256 })

    const goal = await waitForGoal(test.ctx, test.agent, g => g?.phase === 'blocked')

    expect(goal?.blockedReason?.code).toBe('no-progress')
    expect(goal?.blockedReason?.message).toContain('consecutive eval runs showed no improvement')

    // 4 eval cycles triggered
    expect(test.runBatchSpy).toHaveBeenCalledTimes(4)

    // All 12 rounds admitted before the async block fires
    expect(goal?.roundsStarted).toBe(12)
  })

  it('scenario 4 variant: improvement resets the no-progress counter', async () => {
    const test = await e2eHarness(
      Array.from({ length: 12 }, (_, i) => textResponse(`round ${i + 1}`)),
      {
        K: 3,
        N: 3,
        evalResults: [
          [['c1', 'pass'], ['c2', 'fail'], ['c3', 'fail']],
          [['c1', 'pass'], ['c2', 'fail'], ['c3', 'fail']],
          // c2 flips to pass → improved=1 → counter RESET
          [['c1', 'pass'], ['c2', 'pass'], ['c3', 'fail']],
          [['c1', 'pass'], ['c2', 'pass'], ['c3', 'fail']],
        ],
      },
    )

    test.ctx.goals.create(test.agent, { objective: 'improvement resets counter', maxGoalRounds: 12 })

    const goal = await waitForGoal(test.ctx, test.agent, g => g?.phase === 'blocked')

    // Goal blocked by round-limit (12/12), NOT no-progress
    expect(goal?.blockedReason?.code).toBe('round-limit')
    expect(goal?.roundsStarted).toBe(12)
    expect(test.runBatchSpy).toHaveBeenCalledTimes(4)
  })
})
