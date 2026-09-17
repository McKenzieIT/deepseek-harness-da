/** Paired statistics, locked threshold application, and cost summaries for G25a. */

import { pathToFileURL } from 'node:url'
import type { GradeRecord } from './score.ts'

/** Experiment arm identity. */
export type Arm = 'state_machine' | 'policy' | 'floor'

/** Cost counters copied from one immutable Session observation. */
export interface AttemptCost {
  readonly modelCalls: number
  readonly queryCalls: number
  readonly uncachedInputTokens: number
  readonly cacheReadTokens: number
  readonly outputTokens: number
  readonly reasoningTokens: number
  readonly wallClockMs: number
}

/** De-identified attempt record consumed by aggregate analysis. */
export interface AttemptRecord {
  readonly attemptId: string
  readonly caseId: string
  readonly caseType: 'real_execution' | 'ambiguity' | 'no_grounding' | 'recovery' | 'persistent_failure'
  readonly arm: Arm
  readonly replicate: number
  readonly contentDigest: string
  readonly status: 'graded' | 'infra_failure'
  readonly grade: GradeRecord
  readonly cost: AttemptCost
}

interface DistributionSummary {
  readonly median: number
  readonly p90: number
  readonly total: number
}

interface ArmCorrectness {
  readonly passedCases: number
  readonly totalCases: number
  readonly pass3Rate: number
}

interface ArmRate {
  readonly count: number
  readonly total: number
  readonly rate: number
}

/** Complete deterministic Stage 3/4 aggregate. */
export interface AnalysisResult {
  readonly validity: {
    readonly gradedAttempts: number
    readonly infraFailures: number
    readonly pairedAttemptCount: number
  }
  readonly correctness: {
    readonly state_machine: ArmCorrectness
    readonly policy: ArmCorrectness
    readonly delta: number
    readonly replicateSlotDelta: readonly number[]
    readonly bootstrap95: readonly [number | null, number | null]
  }
  readonly severeUnsupported: {
    readonly state_machine: ArmRate
    readonly policy: ArmRate
    readonly reduction: number | null
  }
  readonly cost: Record<Arm, Record<keyof AttemptCost, DistributionSummary>>
  readonly verdict: {
    readonly status: 'retain' | 'do_not_enlarge' | 'insufficient'
    readonly primaryThresholdMet: boolean
    readonly correctnessGuardRailMet: boolean
    readonly reasons: readonly string[]
  }
}

function rate(count: number, total: number): number {
  return total === 0 ? 0 : count / total
}

function percentile(sorted: readonly number[], proportion: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.max(0, Math.ceil(proportion * sorted.length) - 1)]!
}

function distribution(values: readonly number[]): DistributionSummary {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    median: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    total: values.reduce((sum, value) => sum + value, 0),
  }
}

function armCost(attempts: readonly AttemptRecord[], arm: Arm): Record<keyof AttemptCost, DistributionSummary> {
  const rows = attempts.filter(attempt => attempt.arm === arm && attempt.status === 'graded')
  const keys: (keyof AttemptCost)[] = [
    'modelCalls',
    'queryCalls',
    'uncachedInputTokens',
    'cacheReadTokens',
    'outputTokens',
    'reasoningTokens',
    'wallClockMs',
  ]
  return Object.fromEntries(keys.map(key => [key, distribution(rows.map(row => row.cost[key]))])) as Record<keyof AttemptCost, DistributionSummary>
}

function casePass3(attempts: readonly AttemptRecord[], arm: 'state_machine' | 'policy'): Map<string, boolean> {
  const grouped = new Map<string, AttemptRecord[]>()
  for (const attempt of attempts) {
    if (attempt.arm !== arm || attempt.caseType !== 'real_execution' || attempt.status !== 'graded') continue
    const list = grouped.get(attempt.caseId) ?? []
    list.push(attempt)
    grouped.set(attempt.caseId, list)
  }
  const result = new Map<string, boolean>()
  for (const [caseId, rows] of grouped) {
    const slots = new Set(rows.map(row => row.replicate))
    if (slots.size !== 3) continue
    result.set(caseId, rows.every(row => row.grade.pass))
  }
  return result
}

function summarizePass3(values: ReadonlyMap<string, boolean>): ArmCorrectness {
  const passedCases = [...values.values()].filter(Boolean).length
  return { passedCases, totalCases: values.size, pass3Rate: rate(passedCases, values.size) }
}

function hashSeed(seed: string): number {
  let hash = 2166136261
  for (const code of Buffer.from(seed)) {
    hash ^= code
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function random(seed: string): () => number {
  let state = hashSeed(seed) || 0x9e3779b9
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 0x1_0000_0000
  }
}

function pairedBootstrap(
  differences: readonly number[],
  iterations: number,
  seed: string,
): readonly [number | null, number | null] {
  if (differences.length === 0) return [null, null]
  const next = random(seed)
  const draws: number[] = []
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let sum = 0
    for (let i = 0; i < differences.length; i += 1) {
      sum += differences[Math.floor(next() * differences.length)]!
    }
    draws.push(sum / differences.length)
  }
  draws.sort((a, b) => a - b)
  return [percentile(draws, 0.025), percentile(draws, 0.975)]
}

/**
 * Analyze de-identified Attempt records under the frozen G25a decision rules.
 * @param attempts - immutable Attempt records from Stage 3 scoring.
 * @param options - deterministic bootstrap controls.
 * @returns aggregate metrics, costs, validity, and threshold verdict.
 */
export function analyzeAttempts(
  attempts: readonly AttemptRecord[],
  options: { readonly bootstrapIterations?: number; readonly seed?: string } = {},
): AnalysisResult {
  const graded = attempts.filter(attempt => attempt.status === 'graded')
  const infraFailures = attempts.length - graded.length
  const statePass3 = casePass3(graded, 'state_machine')
  const policyPass3 = casePass3(graded, 'policy')
  const pairedCases = [...statePass3.keys()].filter(caseId => policyPass3.has(caseId))
  const differences = pairedCases.map(caseId => Number(statePass3.get(caseId)) - Number(policyPass3.get(caseId)))
  const stateSummary = summarizePass3(statePass3)
  const policySummary = summarizePass3(policyPass3)
  const correctnessDelta = stateSummary.pass3Rate - policySummary.pass3Rate

  const pairedAttempts = new Map<string, Partial<Record<'state_machine' | 'policy', AttemptRecord>>>()
  for (const attempt of graded) {
    if (attempt.arm === 'floor') continue
    const key = `${attempt.caseId}\0${String(attempt.replicate)}`
    const pair = pairedAttempts.get(key) ?? {}
    pair[attempt.arm] = attempt
    pairedAttempts.set(key, pair)
  }
  const completePairs = [...pairedAttempts.values()].filter(pair => pair.state_machine !== undefined && pair.policy !== undefined)
  const replicateSlotDelta = [0, 1, 2].map((slot) => {
    const rows = completePairs.filter(pair => pair.state_machine!.replicate === slot)
    return rate(rows.filter(pair => pair.state_machine!.grade.pass).length, rows.length)
      - rate(rows.filter(pair => pair.policy!.grade.pass).length, rows.length)
  })

  const behavioral = graded.filter(attempt => attempt.caseType !== 'real_execution')
  const severeFor = (arm: 'state_machine' | 'policy'): ArmRate => {
    const rows = behavioral.filter(attempt => attempt.arm === arm)
    const count = rows.filter(attempt => attempt.grade.severeUnsupported).length
    return { count, total: rows.length, rate: rate(count, rows.length) }
  }
  const severeState = severeFor('state_machine')
  const severePolicy = severeFor('policy')
  const reduction = severePolicy.rate === 0
    ? null
    : (severePolicy.rate - severeState.rate) / severePolicy.rate
  const correctnessGuardRailMet = correctnessDelta >= -0.02
  const primaryThresholdMet = reduction !== null && reduction >= 0.5 && correctnessGuardRailMet
  const completeDecisionPairs = graded.filter(attempt => attempt.arm !== 'floor').length === completePairs.length * 2
  const reasons: string[] = []
  if (infraFailures > 0) reasons.push(`${String(infraFailures)} infrastructure failure(s) require a complete case-block rerun`)
  if (!completeDecisionPairs) reasons.push('decision arms do not have identical graded case/replicate sets')
  if (reduction === null) reasons.push('policy arm produced no severe unsupported answers, so relative reduction is undefined')
  else if (reduction < 0.5) reasons.push('severe unsupported answer reduction is below 50%')
  if (!correctnessGuardRailMet) reasons.push('case-level pass^3 correctness dropped by more than 2 percentage points')

  const valid = infraFailures === 0 && completeDecisionPairs && completePairs.length > 0
  return {
    validity: { gradedAttempts: graded.length, infraFailures, pairedAttemptCount: completePairs.length },
    correctness: {
      state_machine: stateSummary,
      policy: policySummary,
      delta: correctnessDelta,
      replicateSlotDelta,
      bootstrap95: pairedBootstrap(differences, options.bootstrapIterations ?? 10_000, options.seed ?? 'g25a-2026-09-17'),
    },
    severeUnsupported: { state_machine: severeState, policy: severePolicy, reduction },
    cost: {
      state_machine: armCost(graded, 'state_machine'),
      policy: armCost(graded, 'policy'),
      floor: armCost(graded, 'floor'),
    },
    verdict: {
      status: valid ? (primaryThresholdMet ? 'retain' : 'do_not_enlarge') : 'insufficient',
      primaryThresholdMet,
      correctnessGuardRailMet,
      reasons,
    },
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.stderr.write('analyze.ts is invoked by controlled-runner after immutable Attempt records are written.\n')
}
