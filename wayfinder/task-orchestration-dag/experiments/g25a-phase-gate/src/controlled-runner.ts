/** Frozen G25a schedule, parity gates, and command-line stage admission. */

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Arm } from './analyze.ts'

/** One case row from the frozen manifest. */
export interface ManifestCase {
  readonly case_id: string
  readonly type: 'real_execution' | 'ambiguity' | 'no_grounding' | 'recovery' | 'persistent_failure'
  readonly task_working_set: string
  readonly dimensions?: { readonly sql_complexity?: string; readonly interaction_complexity?: string }
  readonly fault_injection?: { readonly mode: string; readonly fail_first_n?: number; readonly failure_kind?: string } | null
  readonly grading: Record<string, unknown>
  readonly budget: { readonly max_llm_calls: number; readonly max_query_data_calls: number; readonly wall_clock_seconds: number }
  readonly source?: { readonly content_digest?: string }
}

/** Frozen manifest fields the runner consumes. */
export interface G25aManifest {
  readonly manifest_version: number
  readonly frozen_on: string
  readonly total_cases: number
  readonly total_decision_attempts: number
  readonly cases: readonly ManifestCase[]
}

/** One scheduled Evaluation Attempt. */
export interface PlannedAttempt {
  readonly attemptId: string
  readonly caseId: string
  readonly arm: Arm
  readonly replicate: number
  readonly order: number
  readonly taskWorkingSet: string
  readonly taskDigest: string
  readonly faultMode: string
  readonly failFirstN: number
}

/** Minimal observation identity used by the Stage 1 parity gate. */
export interface ParityObservation {
  readonly arm: Arm
  readonly taskDigest: string
  readonly toolNames: readonly string[]
}

const SEED = 'g25a-2026-09-17'

/** SHA-256 hex over UTF-8 text. */
export function digestText(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

function bit(label: string): 0 | 1 {
  return parseInt(digestText(`${SEED}\0${label}`).slice(0, 2), 16) % 2 as 0 | 1
}

function armPair(caseId: string, replicate: number): readonly ['state_machine', 'policy'] | readonly ['policy', 'state_machine'] {
  return bit(`${caseId}\0${String(replicate)}\0pair`) === 0
    ? ['state_machine', 'policy']
    : ['policy', 'state_machine']
}

function attempt(
  testCase: ManifestCase,
  arm: Arm,
  replicate: number,
  order: number,
): PlannedAttempt {
  const fault = testCase.fault_injection
  return {
    attemptId: `${testCase.case_id}-${arm}-r${String(replicate + 1)}`,
    caseId: testCase.case_id,
    arm,
    replicate,
    order,
    taskWorkingSet: testCase.task_working_set,
    taskDigest: digestText(testCase.task_working_set),
    faultMode: fault?.mode ?? 'none',
    failFirstN: fault?.fail_first_n ?? 0,
  }
}

/**
 * Build the amended locked decision schedule: six decision-arm Attempts plus
 * one diagnostic-floor Attempt for each of 36 cases.
 * @param manifest - frozen 36-case manifest.
 * @returns deterministic 252-Attempt order.
 */
export function buildDecisionPlan(manifest: G25aManifest): PlannedAttempt[] {
  if (manifest.cases.length !== 36 || manifest.total_decision_attempts !== 252) {
    throw new Error(
      `G25a decision protocol requires 36 cases and 252 Attempts; manifest declares ${String(manifest.cases.length)} cases and ${String(manifest.total_decision_attempts)} Attempts`,
    )
  }
  const planned: PlannedAttempt[] = []
  let order = 0
  for (const testCase of manifest.cases) {
    const floorFirst = bit(`${testCase.case_id}\0floor`) === 0
    if (floorFirst) planned.push(attempt(testCase, 'floor', 0, order++))
    for (let replicate = 0; replicate < 3; replicate += 1) {
      for (const arm of armPair(testCase.case_id, replicate)) {
        planned.push(attempt(testCase, arm, replicate, order++))
      }
    }
    if (!floorFirst) planned.push(attempt(testCase, 'floor', 0, order++))
  }
  return planned
}

/**
 * Select the six locked Stage 1 smoke cases, rejecting a manifest that cannot
 * supply the approved 2×L1, 1×L2, 1×L3, 1×L4 plus persistent-failure mix.
 * @param manifest - frozen manifest.
 * @returns six cases in the approved complexity order.
 */
export function selectSmokeCases(manifest: G25aManifest): readonly ManifestCase[] {
  const real = manifest.cases.filter(testCase => testCase.type === 'real_execution')
  const byLevel = new Map<string, ManifestCase[]>()
  for (const testCase of real) {
    const level = testCase.dimensions?.sql_complexity ?? 'unclassified'
    const rows = byLevel.get(level) ?? []
    rows.push(testCase)
    byLevel.set(level, rows)
  }
  const counts = ['L1', 'L2', 'L3', 'L4'].map(level => `${level}=${String(byLevel.get(level)?.length ?? 0)}`).join(', ')
  if ((byLevel.get('L1')?.length ?? 0) < 2
    || (byLevel.get('L2')?.length ?? 0) < 1
    || (byLevel.get('L3')?.length ?? 0) < 1
    || (byLevel.get('L4')?.length ?? 0) < 1) {
    throw new Error(`G25a Stage 1 requires 2×L1, 1×L2, 1×L3, and 1×L4 real cases; amended manifest has ${counts}`)
  }
  const persistent = manifest.cases.find(testCase => testCase.type === 'persistent_failure')
  if (persistent === undefined) throw new Error('G25a Stage 1 requires one persistent-failure case')
  return [byLevel.get('L1')![0]!, byLevel.get('L1')![1]!, byLevel.get('L2')![0]!, byLevel.get('L3')![0]!, byLevel.get('L4')![0]!, persistent]
}

/**
 * Prove all three arms exposed byte-identical Task material and tool names.
 * @param observations - one observation per arm for the same case/replicate block.
 */
export function validateObservationParity(observations: readonly ParityObservation[]): void {
  const taskDigests = new Set(observations.map(observation => observation.taskDigest))
  if (taskDigests.size !== 1) throw new Error('G25a Task working set drift across arms')
  const catalogues = new Set(observations.map(observation => JSON.stringify([...observation.toolNames].sort())))
  if (catalogues.size !== 1) throw new Error('G25a tool catalogue drift across arms')
}

async function loadManifest(): Promise<G25aManifest> {
  const path = resolve(import.meta.dirname, '../cases/manifest.json')
  return JSON.parse(await readFile(path, 'utf8')) as G25aManifest
}

async function main(): Promise<void> {
  const stageIndex = process.argv.indexOf('--stage')
  const stage = stageIndex >= 0 ? process.argv[stageIndex + 1] : undefined
  const manifest = await loadManifest()
  if (stage === 'smoke') {
    const cases = selectSmokeCases(manifest)
    process.stdout.write(`${JSON.stringify({ stage, caseIds: cases.map(testCase => testCase.case_id) }, null, 2)}\n`)
    return
  }
  if (stage === 'decision') {
    // The locked protocol forbids spending any of the 252 Attempts before the
    // Stage 1 smoke passes. The current manifest cannot satisfy Stage 1, so the
    // runner exposes the frozen plan but refuses execution.
    selectSmokeCases(manifest)
    process.stdout.write(`${JSON.stringify(buildDecisionPlan(manifest), null, 2)}\n`)
    return
  }
  throw new Error('usage: controlled-runner.ts --stage smoke|decision')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main()
}
