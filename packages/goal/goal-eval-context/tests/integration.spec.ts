import { describe, expect, it } from 'vitest'
import {
  apply,
  renderEvalEvidence,
  buildEvalEvidenceParams,
  computeConsecutiveNoImprovement,
} from '@deepseek-ai/dsh-goal-eval-context'
import type { Config } from '@deepseek-ai/dsh-goal-eval-context'
import { EvalResultStore } from '@deepseek-ai/dsh-evidence-query'
import type { EvalResultRecord, EvalDeltaReport, EvalCaseFlip } from '@deepseek-ai/dsh-evidence-query'
import type { Context } from '@deepseek-ai/cordis'
import { GoalId } from '@deepseek-ai/dsh-goal'
import type { GoalChanged, GoalOperation, GoalRef, GoalView } from '@deepseek-ai/dsh-goal'
import type { PromptSection } from '@deepseek-ai/dsh-system-prompt'

// ──────────────────── Helpers ────────────────────

const STATUS_RANK: Record<EvalResultRecord['status'], number> = {
  pass: 3,
  fail: 1,
  error: 0,
  pending: 0,
}

/** Create an eval result record for a run + case. */
function record(
  runId: string,
  caseId: string,
  status: 'pass' | 'fail',
): EvalResultRecord {
  return {
    id: `${runId}:${caseId}`,
    assetId: caseId,
    caseId,
    status,
    timestamp: '2026-01-01T00:00:00Z',
    metadata: { runId },
  }
}

/**
 * Real before/after delta computation — mirrors the logic in
 * EvidenceQueryService.beforeAfterDelta(). Reads from the REAL
 * EvalResultStore's getByRunId() method and computes the case-flip summary.
 * This is NOT a stub: it produces real deltas from real store data.
 */
function makeRealBeforeAfterDelta(
  store: EvalResultStore,
): (runIdA: string, runIdB: string) => EvalDeltaReport {
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

      if (a.status === b.status) {
        unchanged++
      } else {
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

/**
 * Simulate the plugin's systemPrompt text function. This is the exact
 * pipeline the goal-eval-context plugin uses in apply():
 *   store → buildEvalEvidenceParams → renderEvalEvidence
 * No Cordis ctx or systemPrompt service needed — the pure functions
 * are exercised end-to-end with a REAL EvalResultStore.
 */
function simulateTextFunction(
  goalActive: boolean,
  store: EvalResultStore,
  hintEscalationThreshold: number = 2,
): string {
  const beforeAfterDelta = makeRealBeforeAfterDelta(store)
  const params = buildEvalEvidenceParams(goalActive, store, beforeAfterDelta)
  return renderEvalEvidence({ ...params, hintEscalationThreshold }) ?? ''
}

// ──────────────────── Plugin harness ────────────────────

function makeGoalView(overrides: Partial<GoalView> = {}): GoalView {
  return {
    id: GoalId('goal-1'),
    revision: 1,
    objective: 'Raise the eval pass rate',
    phase: 'active',
    maxGoalRounds: 256,
    roundsStarted: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    activation: 'armed',
    ...overrides,
  }
}

function makeChange(operation: GoalOperation, goal?: GoalView): GoalChanged {
  return {
    operation,
    ref: { id: goal?.id ?? 'goal-1', revision: goal?.revision ?? 1 } as GoalRef,
    ...(goal !== undefined ? { goal } : {}),
  }
}

type GoalChangedListener = (payload: { agent: { id: string }; change: GoalChanged }) => void

/**
 * Mounts the REAL plugin `apply()` over a lightweight ctx shim — the harness
 * shape the sibling goal-eval-policy suites use, because `goal/changed` is an
 * agent-scoped event that only a real agent carrier can emit. The eval store
 * and its delta computation are real (see {@link makeRealBeforeAfterDelta});
 * only the ctx plumbing (event registry, section registry, effect) is a shim.
 */
function mountPlugin(store: EvalResultStore, config: Config = { hintEscalationThreshold: 2 }) {
  const listeners: GoalChangedListener[] = []
  const sections: PromptSection[] = []
  const disposed: string[] = []
  const beforeAfterDelta = makeRealBeforeAfterDelta(store)

  const ctx = {
    evidenceQuery: { getEvalStore: () => store, beforeAfterDelta },
    systemPrompt: {
      section(section: PromptSection): () => void {
        sections.push(section)
        return () => { disposed.push(section.name) }
      },
    },
    on(event: string, listener: GoalChangedListener): () => void {
      if (event === 'goal/changed') listeners.push(listener)
      return () => {}
    },
    effect(callback: () => () => void): () => void {
      return callback()
    },
  }

  apply(ctx as unknown as Context, config)

  return {
    sections,
    emit(change: GoalChanged): void {
      for (const listener of listeners) listener({ agent: { id: 'agent-1' }, change })
    },
    /** Run the registered section's text provider, exactly as prompt assembly would. */
    render(): string {
      const section = sections[0]
      if (section === undefined) throw new Error('no eval-evidence section was registered')
      return typeof section.text === 'function' ? section.text({}) : section.text
    },
  }
}

describe('goal-eval-context plugin (apply over a real eval store)', () => {
  it('registers exactly one eval-evidence section at order 50', () => {
    const plugin = mountPlugin(new EvalResultStore())
    expect(plugin.sections.map(section => section.name)).toEqual(['eval-evidence'])
    expect(plugin.sections[0]?.order).toBe(50)
  })

  it('stays silent until a goal/changed activates a goal, then emits the evidence block', () => {
    const store = new EvalResultStore()
    store.add(record('run-1', 'c1', 'fail'))
    store.add(record('run-2', 'c1', 'pass'))
    const plugin = mountPlugin(store)

    // No goal has been announced yet: the section contributes nothing, even
    // though the store already holds runs.
    expect(plugin.render()).toBe('')

    plugin.emit(makeChange('create', makeGoalView()))
    const active = plugin.render()
    expect(active).toContain('<eval_evidence>')
    expect(active).toContain('Pass rate: 1/1 (100%)')
    expect(active).toContain('Last delta: +1 improved, -0 regressed, 0 unchanged (vs run run-1)')
    expect(active).toContain('Direction: Progress detected — continue current approach.')
  })

  it('stops contributing once the goal is cleared', () => {
    const store = new EvalResultStore()
    store.add(record('run-1', 'c1', 'pass'))
    const plugin = mountPlugin(store)

    plugin.emit(makeChange('create', makeGoalView()))
    expect(plugin.render()).toContain('<eval_evidence>')

    // A clear carries no goal snapshot, so deactivation must come from the
    // operation itself rather than from a phase read.
    plugin.emit(makeChange('clear'))
    expect(plugin.render()).toBe('')
  })

  it('deactivates on a non-active phase and reactivates when the goal resumes', () => {
    const store = new EvalResultStore()
    store.add(record('run-1', 'c1', 'pass'))
    const plugin = mountPlugin(store)

    plugin.emit(makeChange('create', makeGoalView()))
    expect(plugin.render()).toContain('<eval_evidence>')

    plugin.emit(makeChange('pause', makeGoalView({ phase: 'paused', revision: 2 })))
    expect(plugin.render()).toBe('')

    plugin.emit(makeChange('resume', makeGoalView({ phase: 'active', revision: 3 })))
    expect(plugin.render()).toContain('<eval_evidence>')
  })

  it('leaves goal activity untouched by a change that carries no goal snapshot', () => {
    const store = new EvalResultStore()
    store.add(record('run-1', 'c1', 'pass'))
    const plugin = mountPlugin(store)

    // A snapshot-less non-clear change before any goal exists must not activate.
    plugin.emit(makeChange('edit'))
    expect(plugin.render()).toBe('')

    // …and must not deactivate an already-active goal either.
    plugin.emit(makeChange('create', makeGoalView()))
    plugin.emit(makeChange('edit'))
    expect(plugin.render()).toContain('<eval_evidence>')
  })

  it('feeds the configured hintEscalationThreshold into the rendered direction hint', () => {
    const store = new EvalResultStore()
    // Three runs, no case ever flips to pass → 2 consecutive no-improvement.
    for (const runId of ['run-1', 'run-2', 'run-3']) {
      store.add(record(runId, 'c1', 'fail'))
      store.add(record(runId, 'c2', 'pass'))
    }

    const lenient = mountPlugin(store, { hintEscalationThreshold: 5 })
    lenient.emit(makeChange('create', makeGoalView()))
    const mild = lenient.render()
    expect(mild).toContain('Consecutive evaluations without improvement: 2')
    expect(mild).toContain('Direction: No improvement in last evaluation. Consider investigating regressed or failed cases.')

    const strict = mountPlugin(store, { hintEscalationThreshold: 2 })
    strict.emit(makeChange('create', makeGoalView()))
    expect(strict.render()).toContain('Direction: No improvement detected for 2 consecutive evaluations. Consider changing approach or investigating regressed cases before continuing.')
  })
})

// ──────────────────── Integration Tests ────────────────────

describe('goal-eval-context integration (real EvalResultStore data layer)', () => {
  it('goal active + 3 runs in store → section outputs correct XML', () => {
    const store = new EvalResultStore()
    // run-1: 1 pass, 2 fail (33%)
    store.add(record('run-1', 'c1', 'pass'))
    store.add(record('run-1', 'c2', 'fail'))
    store.add(record('run-1', 'c3', 'fail'))
    // run-2: c2 flipped to pass (67%), delta improved=1
    store.add(record('run-2', 'c1', 'pass'))
    store.add(record('run-2', 'c2', 'pass'))
    store.add(record('run-2', 'c3', 'fail'))
    // run-3: c3 flipped to pass (100%), delta improved=1
    store.add(record('run-3', 'c1', 'pass'))
    store.add(record('run-3', 'c2', 'pass'))
    store.add(record('run-3', 'c3', 'pass'))

    const output = simulateTextFunction(true, store)

    // XML structure
    expect(output).toContain('<eval_evidence>')
    expect(output).toContain('</eval_evidence>')

    // Pass rate from latest run (run-3: 3/3 = 100%)
    expect(output).toContain('Pass rate: 3/3 (100%)')

    // Delta summary (run-2 → run-3: 1 improved, 0 regressed, 2 unchanged)
    expect(output).toContain('Last delta: +1 improved, -0 regressed, 2 unchanged (vs run run-2)')

    // Direction hint — improvement detected
    expect(output).toContain('Direction: Progress detected — continue current approach.')

    // Consecutive no-improvement count (latest delta has improvement → 0)
    expect(output).toContain('Consecutive evaluations without improvement: 0')
  })

  it('goal active + 1 run → baseline message', () => {
    const store = new EvalResultStore()
    // Single run: 2 pass, 1 fail (67%)
    store.add(record('run-1', 'c1', 'pass'))
    store.add(record('run-1', 'c2', 'pass'))
    store.add(record('run-1', 'c3', 'fail'))

    const output = simulateTextFunction(true, store)

    expect(output).toContain('<eval_evidence>')
    expect(output).toContain('Pass rate: 2/3 (67%)')
    expect(output).toContain('Baseline established. Next evaluation will show improvement delta.')
    expect(output).toContain('Direction: Continue working — first delta will appear after next evaluation.')
    expect(output).toContain('</eval_evidence>')
  })

  it('goal inactive → text function returns empty string', () => {
    const store = new EvalResultStore()
    // Store has data, but goal is not active — should return ''
    store.add(record('run-1', 'c1', 'pass'))
    store.add(record('run-2', 'c1', 'pass'))

    const output = simulateTextFunction(false, store)

    // renderEvalEvidence returns null when goalActive=false → text = ''
    expect(output).toBe('')
  })

  it('multiple consecutive no-improvement runs → escalated hint', () => {
    const store = new EvalResultStore()
    // 4 runs where ALL pairs have improved=0 (no case ever flips to pass)
    // run-1: c1=fail, c2=fail
    store.add(record('run-1', 'c1', 'fail'))
    store.add(record('run-1', 'c2', 'fail'))
    // run-2: same statuses → delta improved=0
    store.add(record('run-2', 'c1', 'fail'))
    store.add(record('run-2', 'c2', 'fail'))
    // run-3: same statuses → delta improved=0
    store.add(record('run-3', 'c1', 'fail'))
    store.add(record('run-3', 'c2', 'fail'))
    // run-4: same statuses → delta improved=0
    store.add(record('run-4', 'c1', 'fail'))
    store.add(record('run-4', 'c2', 'fail'))

    // Verify the real delta computation produces improved=0 for all pairs
    const deltaFn = makeRealBeforeAfterDelta(store)
    const runIds = store.getRunIds()
    expect(runIds).toEqual(['run-1', 'run-2', 'run-3', 'run-4'])

    // computeConsecutiveNoImprovement walks all 3 pairs from the end
    const consecutive = computeConsecutiveNoImprovement(runIds, deltaFn)
    expect(consecutive).toBe(3)

    const output = simulateTextFunction(true, store)

    // Escalated hint with the count
    expect(output).toContain('No improvement detected for 3 consecutive evaluations')
    expect(output).toContain('Consecutive evaluations without improvement: 3')
    expect(output).toContain('Consider changing approach or investigating regressed cases before continuing.')
  })
})
