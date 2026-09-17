/** Frozen G25a schedule, parity gates, and command-line stage admission. */

import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { constants as fsConstants } from 'node:fs'
import { access, mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { delimiter, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { analyzeAttempts, type AnalysisResult, type Arm, type AttemptRecord } from './analyze.ts'
import {
  buildEvidenceGroundedGraderPrompt,
  confidentBusinessConclusion,
  parseEvidenceGroundedJudgment,
  scoreAttempt,
  type EvidenceGroundedJudgment,
  type GradeRecord,
  type InfrastructureFailure,
} from './score.ts'
import { observeSession, type SessionObservation } from './session-observer.ts'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { AgentHandle } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import type { GenerateOptions, Message } from '@deepseek-ai/dsh-llm'

/** One case row from the frozen manifest. */
export interface ManifestCase {
  readonly case_id: string
  readonly goal?: string
  readonly type: 'real_execution' | 'ambiguity' | 'no_grounding' | 'recovery' | 'persistent_failure'
  readonly task_working_set: string
  readonly dimensions?: { readonly sql_complexity?: string; readonly interaction_complexity?: string }
  readonly fault_injection?: { readonly mode: string; readonly fail_first_n?: number; readonly failure_kind?: string } | null
  readonly grading: Record<string, unknown> & {
    readonly policy: string
    readonly match_mode?: 'scalar_exact'
    readonly reference_sql?: string
    readonly expected_value?: number
  }
  readonly budget: { readonly max_llm_calls: number; readonly max_query_data_calls: number; readonly wall_clock_seconds: number }
  readonly source?: { readonly content_digest?: string }
}

/** Frozen manifest fields the runner consumes. */
export interface G25aManifest {
  readonly manifest_version: number
  readonly frozen_on: string
  readonly total_cases: number
  readonly total_decision_attempts: number
  readonly semantic_corpus_digest?: string
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

/** One direct subprocess invocation used by a reference probe. */
export interface ReferenceCommand {
  readonly file: string
  readonly args: readonly string[]
  readonly stdin: string
}

/** Captured process outcome without environment or credential contents. */
export interface ReferenceCommandResult {
  readonly code: number | null
  readonly signal: NodeJS.Signals | null
  readonly stdout: string
  readonly stderr: string
}

/** Canonical rows returned by one reference SQL execution. */
export interface ReferenceResult {
  readonly columns: readonly string[]
  readonly rows: readonly (readonly string[])[]
  readonly rowCount: number
  readonly scalar?: number
  readonly digest: string
}

/** De-identified receipt for one reference SQL probe. */
export interface ReferenceProbeReceipt {
  readonly caseId: string
  readonly maxcPath: string
  readonly maxcConfigPath: string
  readonly result: ReferenceResult
  readonly matchesExpected: boolean
}

/** One completed smoke Attempt plus private-artifact locators. */
export interface SmokeAttemptResult {
  readonly planned: PlannedAttempt
  readonly testCase: ManifestCase
  readonly observation: SessionObservation
  readonly grade: GradeRecord
  readonly firstModelRequestContainsTask: boolean
  readonly rawLocator: string
  readonly observationDigest: string
  readonly gradeDigest: string
  readonly infrastructureFailure?: InfrastructureFailure
}

/** Non-secret runtime facts written beside one private Attempt. */
export interface AttemptEnvironmentReceipt {
  readonly provider: string
  readonly model: string
  readonly scopeId: string
  readonly maxcomputeProject: string
  readonly semanticRoot: string
  readonly presetPath: string
  readonly sidecarPath: string
  readonly maxcPath: string
  readonly maxcConfigPath: string
  readonly environmentVariableNames: readonly string[]
}

/** One fresh Agent/Session runtime owned by an Evaluation Attempt. */
export interface AttemptRuntime {
  run(taskWorkingSet: string): Promise<{
    readonly sessionHeader: unknown
    readonly events: readonly SessionEvent[]
    readonly firstModelRequestContainsTask: boolean
    readonly budgetExceeded: boolean
    readonly infrastructureFailure?: InfrastructureFailure
  }>
  dispose(): Promise<void>
}

/** Dependencies and private output location for one Attempt. */
export interface ExecuteAttemptOptions {
  readonly runId: string
  readonly rawRoot: string
  readonly environment: AttemptEnvironmentReceipt
  readonly createRuntime: () => Promise<AttemptRuntime>
  readonly writeArtifact?: (path: string, value: unknown) => Promise<void>
  readonly gradeObservation?: (
    testCase: ManifestCase,
    observation: SessionObservation,
    control: { readonly budgetExceeded: boolean },
  ) => Promise<GradeRecord> | GradeRecord
  readonly now?: () => number
}

/** Inputs for resolving one real Attempt's non-secret host configuration. */
export interface ResolveAttemptEnvironmentOptions {
  readonly repoRoot: string
  readonly arm: Arm
  readonly faultMode: string
  readonly env?: NodeJS.ProcessEnv
}

/** Stage 1 result; a failed gate forbids starting Stage 2. */
export interface Stage1Result {
  readonly passed: boolean
  readonly failures: readonly string[]
  readonly attempts: readonly SmokeAttemptResult[]
  readonly referenceBefore: readonly ReferenceProbeReceipt[]
  readonly referenceAfter: readonly ReferenceProbeReceipt[]
}

/** Committable Stage 1 summary without raw model text or query rows. */
export interface Stage1Summary {
  readonly schemaVersion: 1
  readonly stage: 'smoke'
  readonly runId: string
  readonly passed: boolean
  readonly failures: readonly string[]
  readonly environment: {
    readonly provider: string
    readonly model: string
    readonly scopeId: string
    readonly maxcomputeProject: string
    readonly semanticRoot: string
    readonly maxcPath: string
    readonly maxcConfigPath: string
    readonly environmentVariableNames: readonly string[]
  }
  readonly reference: {
    readonly before: readonly {
      readonly caseId: string
      readonly resultDigest: string
      readonly rowCount: number
      readonly matchesExpected: boolean
    }[]
    readonly after: readonly {
      readonly caseId: string
      readonly resultDigest: string
      readonly rowCount: number
      readonly matchesExpected: boolean
    }[]
  }
  readonly attempts: readonly {
    readonly attemptId: string
    readonly caseId: string
    readonly caseType: ManifestCase['type']
    readonly arm: Arm
    readonly taskDigest: string
    readonly contentDigest: string
    readonly status: GradeRecord['status']
    readonly grade: GradeRecord
    readonly cost: {
      readonly modelCalls: number
      readonly queryCalls: number
      readonly uncachedInputTokens: number
      readonly cacheReadTokens: number
      readonly outputTokens: number
      readonly reasoningTokens: number
      readonly wallClockMs: number
    }
    readonly toolNames: readonly string[]
    readonly firstModelRequestContainsTask: boolean
    readonly rawLocator: string
    readonly observationDigest: string
    readonly gradeDigest: string
    readonly infrastructureFailureKind?: InfrastructureFailure['kind']
  }[]
}

/** Injectable Stage 1 side effects, kept outside the deterministic controller. */
export interface Stage1Dependencies {
  readonly probe: (testCase: ManifestCase, phase: 'before' | 'after') => Promise<ReferenceProbeReceipt>
  readonly attempt: (planned: PlannedAttempt, testCase: ManifestCase) => Promise<SmokeAttemptResult>
  readonly concurrency?: number
}

/** Stage 2 execution inputs. */
export interface DecisionDependencies extends Stage1Dependencies {
  readonly beforeAttempts?: (referenceBefore: readonly ReferenceProbeReceipt[]) => Promise<void>
}

/** Stage 2 observations, grades, admission failures, and aggregate analysis. */
export interface DecisionBatchResult {
  readonly attempts: readonly SmokeAttemptResult[]
  readonly records: readonly AttemptRecord[]
  readonly referenceBefore: readonly ReferenceProbeReceipt[]
  readonly referenceAfter: readonly ReferenceProbeReceipt[]
  readonly failures: readonly string[]
  readonly analysis: AnalysisResult
}

/** Arm-blinded human-review material plus its separately stored reveal map. */
export interface BlindReviewPacket {
  readonly entries: readonly {
    readonly blindId: string
    readonly caseId: string
    readonly question: string
    readonly acceptance: string
    readonly successfulQueryResults: readonly string[]
    readonly finalAnswer: string
    readonly machineGrade: GradeRecord
    readonly humanVerdict: null
    readonly humanReason: string
  }[]
  readonly mapping: readonly {
    readonly blindId: string
    readonly attemptId: string
    readonly arm: Arm
  }[]
}

/** Complete behavior-affecting identity frozen before decision Attempts. */
export interface RunIdentityInput {
  readonly gitCommit: string
  readonly dirtyDiffDigest: string
  readonly presetDigests: Readonly<Record<Arm, string>>
  readonly policyPluginDigest: string
  readonly manifestDigest: string
  readonly semanticCorpusDigest: string
  readonly sidecarDigests: {
    readonly real: string
    readonly fault: string
  }
  readonly provider: string
  readonly model: string
  readonly environmentVariableNames: readonly string[]
  readonly resolvedPaths: {
    readonly maxc: string
    readonly maxcConfig: string
    readonly semanticRoot: string
  }
  readonly randomizationSeed: string
  readonly referenceStartDigests: Readonly<Record<string, string>>
}

/** Frozen run identity plus its canonical content digest. */
export type RunIdentity = RunIdentityInput & { readonly identityDigest: string }

const SEED = 'g25a-2026-09-17'

/** SHA-256 hex over UTF-8 text. */
export function digestText(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

/** Content-identify the complete frozen input to one Stage 2 run. */
export function buildRunIdentity(input: RunIdentityInput): RunIdentity {
  return { ...input, identityDigest: digestText(canonicalJson(input)) }
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

/** Approved Stage 1 sample: three L2, two L3, and one persistent failure. */
const SMOKE_CASE_IDS = [
  'g25a_exec_037',
  'g25a_exec_039',
  'g25a_exec_046',
  'g25a_exec_042',
  'g25a_exec_048',
  'g25a_fail_01',
] as const

/**
 * Select the six Stage 1 smoke cases approved on 2026-09-17.
 * @param manifest - frozen manifest.
 * @returns three L2, two L3, and one persistent-failure case.
 */
export function selectSmokeCases(manifest: G25aManifest): readonly ManifestCase[] {
  const byId = new Map(manifest.cases.map(testCase => [testCase.case_id, testCase]))
  return SMOKE_CASE_IDS.map((caseId) => {
    const found = byId.get(caseId)
    if (found === undefined) throw new Error(`G25a approved smoke case ${caseId} is absent from the manifest`)
    return found
  })
}

/** Build the approved deterministic 18-Attempt Stage 1 schedule. */
export function buildSmokePlan(manifest: G25aManifest): PlannedAttempt[] {
  const planned: PlannedAttempt[] = []
  let order = 0
  for (const testCase of selectSmokeCases(manifest)) {
    const pair = armPair(testCase.case_id, 0)
    const arms: readonly Arm[] = bit(`${testCase.case_id}\0smoke-floor`) === 0
      ? ['floor', ...pair]
      : [...pair, 'floor']
    for (const arm of arms) planned.push(attempt(testCase, arm, 0, order++))
  }
  return planned
}

/**
 * Prove Task identity, full-catalogue parity, and phase-scoped subset safety.
 * @param observations - one observation per arm for the same case/replicate block.
 */
export function validateObservationParity(observations: readonly ParityObservation[]): void {
  const taskDigests = new Set(observations.map(observation => observation.taskDigest))
  if (taskDigests.size !== 1) throw new Error('G25a Task working set drift across arms')
  const byArm = new Map<Arm, ParityObservation>()
  for (const observation of observations) {
    if (byArm.has(observation.arm)) throw new Error(`G25a duplicate parity observation for ${observation.arm}`)
    byArm.set(observation.arm, observation)
  }
  const stateMachine = byArm.get('state_machine')
  const policy = byArm.get('policy')
  const floor = byArm.get('floor')
  if (stateMachine === undefined || policy === undefined || floor === undefined) {
    throw new Error('G25a parity requires one observation for each arm')
  }
  const policyNames = [...policy.toolNames].sort()
  const floorNames = [...floor.toolNames].sort()
  if (JSON.stringify(policyNames) !== JSON.stringify(floorNames)) {
    throw new Error('G25a full tool catalogue drift between policy and floor arms')
  }
  const fullCatalogue = new Set(policyNames)
  const unexpected = stateMachine.toolNames.filter(name => !fullCatalogue.has(name))
  if (unexpected.length > 0) {
    throw new Error(`G25a state-machine request catalogue exposed unexpected tool(s): ${unexpected.sort().join(', ')}`)
  }
}

function stringCell(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

/** Parse one successful `maxc --json` query result into canonical rows. */
export function parseReferenceResult(stdout: string): ReferenceResult {
  const envelope = JSON.parse(stdout) as {
    readonly status?: unknown
    readonly error?: { readonly message?: unknown }
    readonly data?: { readonly result?: { readonly schema?: readonly { readonly name?: unknown }[]; readonly rows?: readonly Record<string, unknown>[] } }
  }
  if (envelope.status !== 'success' || envelope.data?.result === undefined) {
    const message = typeof envelope.error?.message === 'string' ? envelope.error.message : 'maxc returned no successful result'
    throw new Error(message)
  }
  const columns = (envelope.data.result.schema ?? []).map((column) => {
    if (typeof column.name !== 'string' || column.name === '') throw new Error('maxc result schema has an invalid column name')
    return column.name
  })
  const rows = (envelope.data.result.rows ?? []).map(row => columns.map(column => stringCell(row[column])))
  const scalarText = rows[0]?.[0]
  const scalar = scalarText === undefined ? undefined : Number(scalarText)
  const canonical = { columns, rows, rowCount: rows.length }
  return {
    ...canonical,
    ...(scalar !== undefined && Number.isFinite(scalar) ? { scalar } : {}),
    digest: digestText(JSON.stringify(canonical)),
  }
}

function scalarMatches(actual: number | undefined, expected: number | undefined): boolean {
  if (actual === undefined || expected === undefined) return false
  return Math.abs(actual - expected) <= Math.max(1e-9, Math.abs(expected) * 1e-9)
}

async function executeReferenceCommand(command: ReferenceCommand): Promise<ReferenceCommandResult> {
  return new Promise((settle) => {
    const child = spawn(command.file, [...command.args], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { stdout += chunk })
    child.stderr.on('data', (chunk: string) => { stderr += chunk })
    child.on('error', (error) => settle({ code: null, signal: null, stdout, stderr: error.message }))
    child.on('close', (code, signal) => settle({ code, signal, stdout, stderr }))
    child.stdin.end(command.stdin)
  })
}

function referenceFailureMessage(outcome: ReferenceCommandResult): string {
  if (outcome.stderr.trim() !== '') return outcome.stderr.trim()
  try {
    const envelope = JSON.parse(outcome.stdout) as { readonly error?: { readonly message?: unknown } }
    if (typeof envelope.error?.message === 'string' && envelope.error.message !== '') return envelope.error.message
  } catch {
    // Non-JSON stdout has no structured MaxCompute diagnostic to preserve.
  }
  return `exit ${String(outcome.code)}`
}

/** Execute a real-case reference SQL with explicit binary and config paths. */
export async function runReferenceProbe(
  testCase: ManifestCase,
  options: {
    readonly maxcPath: string
    readonly maxcConfigPath: string
    readonly execute?: (command: ReferenceCommand) => Promise<ReferenceCommandResult>
  },
): Promise<ReferenceProbeReceipt> {
  const sql = testCase.grading.reference_sql
  if (testCase.type !== 'real_execution' || typeof sql !== 'string' || sql.trim() === '') {
    throw new Error(`G25a reference probe requires reference SQL for ${testCase.case_id}`)
  }
  const command: ReferenceCommand = {
    file: options.maxcPath,
    args: ['--config', options.maxcConfigPath, 'query', 'run', '--wait', '300', '--stdin', '--json'],
    stdin: sql,
  }
  const outcome = await (options.execute ?? executeReferenceCommand)(command)
  if (outcome.code !== 0 || outcome.signal !== null) {
    throw new Error(`reference probe ${testCase.case_id} failed: ${referenceFailureMessage(outcome)}`)
  }
  const result = parseReferenceResult(outcome.stdout)
  return {
    caseId: testCase.case_id,
    maxcPath: options.maxcPath,
    maxcConfigPath: options.maxcConfigPath,
    result,
    matchesExpected: scalarMatches(result.scalar, testCase.grading.expected_value),
  }
}

async function mapConcurrent<T, R>(
  values: readonly T[],
  concurrency: number,
  visit: (value: T) => Promise<R>,
): Promise<R[]> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 3) {
    throw new Error('G25a concurrency must be an integer from 1 through 3')
  }
  const output = new Array<R>(values.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    for (;;) {
      const index = cursor++
      const value = values[index]
      if (value === undefined) return
      output[index] = await visit(value)
    }
  }))
  return output
}

/** Reject a completed query whose model-visible result could not be reconstructed. */
export function validateReadableQueryOutcomes(observation: SessionObservation): void {
  const unreadable = observation.queryAttempts.find(query => query.state === 'completed'
    && (query.columns === undefined || query.rows === undefined || query.rowCount === undefined))
  if (unreadable !== undefined) throw new Error('successful query has no readable outcome')
}

/** Execute and gate the complete Stage 1 smoke without contributing to Stage 2 statistics. */
export async function runStage1(manifest: G25aManifest, dependencies: Stage1Dependencies): Promise<Stage1Result> {
  const smokeCases = selectSmokeCases(manifest)
  const realCases = smokeCases.filter(testCase => testCase.type === 'real_execution')
  const before = await mapConcurrent(realCases, dependencies.concurrency ?? 3, testCase => dependencies.probe(testCase, 'before'))
  const byId = new Map(smokeCases.map(testCase => [testCase.case_id, testCase]))
  const attempts = await mapConcurrent(buildSmokePlan(manifest), dependencies.concurrency ?? 3, (planned) => {
    const testCase = byId.get(planned.caseId)
    if (testCase === undefined) throw new Error(`G25a smoke case ${planned.caseId} disappeared from the manifest`)
    return dependencies.attempt(planned, testCase)
  })
  const after = await mapConcurrent(realCases, dependencies.concurrency ?? 3, testCase => dependencies.probe(testCase, 'after'))

  const failures: string[] = []
  const beforeByCase = new Map(before.map(receipt => [receipt.caseId, receipt]))
  for (const receipt of [...before, ...after]) {
    if (!receipt.matchesExpected) failures.push(`reference result did not match expected value for ${receipt.caseId}`)
  }
  for (const receipt of after) {
    if (beforeByCase.get(receipt.caseId)?.result.digest !== receipt.result.digest) {
      failures.push(`reference result changed for ${receipt.caseId}`)
    }
  }

  for (const testCase of smokeCases) {
    const rows = attempts.filter(result => result.planned.caseId === testCase.case_id)
    try {
      validateObservationParity(rows.map(result => ({
        arm: result.planned.arm,
        taskDigest: result.planned.taskDigest,
        toolNames: result.observation.toolNames,
      })))
    } catch (error: unknown) {
      failures.push(`${testCase.case_id}: ${error instanceof Error ? error.message : String(error)}`)
    }
    for (const result of rows) {
      if (result.grade.status === 'infra_failure') continue
      if (digestText(result.observation.firstUserText) !== result.planned.taskDigest) {
        failures.push(`${result.planned.attemptId}: first user Task working set drifted`)
      }
      if (!result.firstModelRequestContainsTask) {
        failures.push(`${result.planned.attemptId}: first model request omitted the Task working set`)
      }
      try {
        validateReadableQueryOutcomes(result.observation)
      } catch (error: unknown) {
        failures.push(`${result.planned.attemptId}: ${error instanceof Error ? error.message : String(error)}`)
      }
      if (result.observation.successfulQueries === 0
        && result.grade.pass
        && confidentBusinessConclusion(result.observation.finalAnswer)) {
        failures.push(`${result.planned.attemptId}: scorer accepted an unsupported business conclusion`)
      }
      if (result.rawLocator === '' || result.observationDigest === '' || result.gradeDigest === '') {
        failures.push(`${result.planned.attemptId}: evidence locator or digest is missing`)
      }
    }
  }

  for (const arm of ['state_machine', 'policy', 'floor'] as const) {
    const rows = attempts.filter(result => result.planned.arm === arm)
    const infraFailures = rows.filter(result => result.grade.status === 'infra_failure').length
    if (rows.length === 0 || infraFailures / rows.length > 0.05) {
      failures.push(`${arm} infrastructure failure rate exceeds 5%`)
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    attempts,
    referenceBefore: before,
    referenceAfter: after,
  }
}

function attemptRecord(result: SmokeAttemptResult): AttemptRecord {
  const toolCallCounts: Record<string, number> = {}
  for (const call of result.observation.toolCalls) toolCallCounts[call.name] = (toolCallCounts[call.name] ?? 0) + 1
  const queryFailureKinds: Record<string, number> = {}
  for (const query of result.observation.queryAttempts) {
    if (query.state !== 'failed') continue
    const kind = query.failureKind ?? 'unknown'
    queryFailureKinds[kind] = (queryFailureKinds[kind] ?? 0) + 1
  }
  return {
    attemptId: result.planned.attemptId,
    caseId: result.planned.caseId,
    caseType: result.testCase.type,
    arm: result.planned.arm,
    replicate: result.planned.replicate,
    contentDigest: result.testCase.source?.content_digest ?? digestText(result.testCase.task_working_set),
    status: result.grade.status,
    grade: result.grade,
    ...(result.testCase.dimensions?.sql_complexity === undefined
      ? {}
      : { sqlComplexity: result.testCase.dimensions.sql_complexity }),
    interactionComplexity: result.testCase.type === 'recovery'
      ? 'iterative'
      : result.testCase.dimensions?.interaction_complexity === 'I1' ? 'straightforward' : 'iterative',
    toolCallCounts,
    queryFailureKinds,
    cost: {
      modelCalls: result.observation.modelCalls,
      queryCalls: result.observation.queryAttempts.length,
      uncachedInputTokens: result.observation.usage.uncachedInputTokens,
      cacheReadTokens: result.observation.usage.cacheReadTokens,
      outputTokens: result.observation.usage.outputTokens,
      reasoningTokens: result.observation.usage.reasoningTokens,
      wallClockMs: result.observation.wallClockMs,
    },
  }
}

/** Execute the locked Stage 2 schedule and compute its provisional aggregate. */
export async function runDecisionBatch(
  manifest: G25aManifest,
  dependencies: DecisionDependencies,
): Promise<DecisionBatchResult> {
  const realCases = manifest.cases.filter(testCase => testCase.type === 'real_execution')
  const before = await mapConcurrent(realCases, dependencies.concurrency ?? 3, testCase => dependencies.probe(testCase, 'before'))
  const invalidStart = before.filter(receipt => !receipt.matchesExpected)
  if (invalidStart.length > 0) {
    throw new Error(`G25a decision reference start mismatch: ${invalidStart.map(receipt => receipt.caseId).join(', ')}`)
  }
  await dependencies.beforeAttempts?.(before)
  const byId = new Map(manifest.cases.map(testCase => [testCase.case_id, testCase]))
  const attempts = await mapConcurrent(buildDecisionPlan(manifest), dependencies.concurrency ?? 3, (planned) => {
    const testCase = byId.get(planned.caseId)
    if (testCase === undefined) throw new Error(`G25a decision case ${planned.caseId} disappeared from the manifest`)
    return dependencies.attempt(planned, testCase)
  })
  const after = await mapConcurrent(realCases, dependencies.concurrency ?? 3, testCase => dependencies.probe(testCase, 'after'))
  const failures: string[] = []
  const beforeByCase = new Map(before.map(receipt => [receipt.caseId, receipt]))
  for (const receipt of [...before, ...after]) {
    if (!receipt.matchesExpected) failures.push(`reference result did not match expected value for ${receipt.caseId}`)
  }
  for (const receipt of after) {
    if (beforeByCase.get(receipt.caseId)?.result.digest !== receipt.result.digest) {
      failures.push(`reference result changed for ${receipt.caseId}`)
    }
  }
  for (const testCase of manifest.cases) {
    const rows = attempts.filter(result => result.planned.caseId === testCase.case_id)
    const floor = rows.find(result => result.planned.arm === 'floor')
    for (let replicate = 0; replicate < 3; replicate += 1) {
      const stateMachine = rows.find(result => result.planned.arm === 'state_machine' && result.planned.replicate === replicate)
      const policy = rows.find(result => result.planned.arm === 'policy' && result.planned.replicate === replicate)
      if (stateMachine === undefined || policy === undefined || floor === undefined) {
        failures.push(`${testCase.case_id}: incomplete case/replicate block ${String(replicate)}`)
        continue
      }
      if ([stateMachine, policy, floor].some(result => result.grade.status === 'infra_failure')) continue
      try {
        validateObservationParity([stateMachine, policy, floor].map(result => ({
          arm: result.planned.arm,
          taskDigest: result.planned.taskDigest,
          toolNames: result.observation.toolNames,
        })))
      } catch (error: unknown) {
        failures.push(`${testCase.case_id} replicate ${String(replicate + 1)}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    for (const result of rows) {
      if (result.grade.status === 'infra_failure') {
        failures.push(`${result.planned.attemptId}: infrastructure failure requires a complete case-block rerun`)
        continue
      }
      if (digestText(result.observation.firstUserText) !== result.planned.taskDigest) {
        failures.push(`${result.planned.attemptId}: first user Task working set drifted`)
      }
      if (!result.firstModelRequestContainsTask) failures.push(`${result.planned.attemptId}: first model request omitted the Task working set`)
      try {
        validateReadableQueryOutcomes(result.observation)
      } catch (error: unknown) {
        failures.push(`${result.planned.attemptId}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
  const records = attempts.map(attemptRecord)
  return {
    attempts,
    records,
    referenceBefore: before,
    referenceAfter: after,
    failures,
    analysis: analyzeAttempts(records),
  }
}

function acceptanceText(testCase: ManifestCase): string {
  return /【验收条件】([^【]*)/u.exec(testCase.task_working_set)?.[1]?.trim() ?? ''
}

/** Build the arm-blinded packet required before human verdicts are recorded. */
export function buildBlindReviewPacket(
  attempts: readonly SmokeAttemptResult[],
  blindSeed = randomUUID(),
): BlindReviewPacket {
  const selected = new Set<string>()
  for (const attempt of attempts) {
    if (attempt.grade.severeUnsupported) selected.add(attempt.planned.attemptId)
  }
  const byPair = new Map<string, Partial<Record<'state_machine' | 'policy', SmokeAttemptResult>>>()
  for (const attempt of attempts) {
    if (attempt.planned.arm === 'floor') continue
    const key = `${attempt.planned.caseId}\0${String(attempt.planned.replicate)}`
    const pair = byPair.get(key) ?? {}
    pair[attempt.planned.arm] = attempt
    byPair.set(key, pair)
  }
  for (const pair of byPair.values()) {
    if (pair.state_machine === undefined || pair.policy === undefined) continue
    if (pair.state_machine.grade.pass !== pair.policy.grade.pass
      || pair.state_machine.grade.severeUnsupported !== pair.policy.grade.severeUnsupported) {
      selected.add(pair.state_machine.planned.attemptId)
      selected.add(pair.policy.planned.attemptId)
    }
  }
  const chosen = attempts.filter(attempt => selected.has(attempt.planned.attemptId))
  const entries = chosen.map((attempt) => {
    const blindId = `review-${digestText(`${blindSeed}\0${attempt.planned.attemptId}`).slice(0, 16)}`
    return {
      blindId,
      caseId: attempt.planned.caseId,
      question: typeof attempt.testCase.goal === 'string' ? attempt.testCase.goal : attempt.observation.firstUserText,
      acceptance: acceptanceText(attempt.testCase),
      successfulQueryResults: attempt.observation.queryAttempts
        .filter(query => query.state === 'completed')
        .map(query => JSON.stringify({ columns: query.columns ?? [], rows: query.rows ?? [], rowCount: query.rowCount ?? 0 })),
      finalAnswer: attempt.observation.finalAnswer,
      machineGrade: attempt.grade,
      humanVerdict: null,
      humanReason: '',
    }
  })
  return {
    entries,
    mapping: chosen.map(attempt => ({
      blindId: `review-${digestText(`${blindSeed}\0${attempt.planned.attemptId}`).slice(0, 16)}`,
      attemptId: attempt.planned.attemptId,
      arm: attempt.planned.arm,
    })),
  }
}

/** Project private Stage 1 evidence into a safe, committable summary. */
export function summarizeStage1(
  runId: string,
  result: Stage1Result,
  environment: AttemptEnvironmentReceipt,
): Stage1Summary {
  const reference = (receipts: readonly ReferenceProbeReceipt[]) => receipts.map(receipt => ({
    caseId: receipt.caseId,
    resultDigest: receipt.result.digest,
    rowCount: receipt.result.rowCount,
    matchesExpected: receipt.matchesExpected,
  }))
  return {
    schemaVersion: 1,
    stage: 'smoke',
    runId,
    passed: result.passed,
    failures: result.failures,
    environment: {
      provider: environment.provider,
      model: environment.model,
      scopeId: environment.scopeId,
      maxcomputeProject: environment.maxcomputeProject,
      semanticRoot: environment.semanticRoot,
      maxcPath: environment.maxcPath,
      maxcConfigPath: environment.maxcConfigPath,
      environmentVariableNames: environment.environmentVariableNames,
    },
    reference: {
      before: reference(result.referenceBefore),
      after: reference(result.referenceAfter),
    },
    attempts: result.attempts.map(attempt => ({
      attemptId: attempt.planned.attemptId,
      caseId: attempt.planned.caseId,
      caseType: attempt.testCase.type,
      arm: attempt.planned.arm,
      taskDigest: attempt.planned.taskDigest,
      contentDigest: attempt.testCase.source?.content_digest ?? digestText(attempt.testCase.task_working_set),
      status: attempt.grade.status,
      grade: attempt.grade,
      cost: {
        modelCalls: attempt.observation.modelCalls,
        queryCalls: attempt.observation.queryAttempts.length,
        uncachedInputTokens: attempt.observation.usage.uncachedInputTokens,
        cacheReadTokens: attempt.observation.usage.cacheReadTokens,
        outputTokens: attempt.observation.usage.outputTokens,
        reasoningTokens: attempt.observation.usage.reasoningTokens,
        wallClockMs: attempt.observation.wallClockMs,
      },
      toolNames: attempt.observation.toolNames,
      firstModelRequestContainsTask: attempt.firstModelRequestContainsTask,
      rawLocator: attempt.rawLocator,
      observationDigest: attempt.observationDigest,
      gradeDigest: attempt.gradeDigest,
      ...(attempt.infrastructureFailure === undefined
        ? {}
        : { infrastructureFailureKind: attempt.infrastructureFailure.kind }),
    })),
  }
}

function infrastructureFailure(error: unknown): InfrastructureFailure {
  const message = error instanceof Error ? error.message : String(error)
  if (/sandbox|operation not permitted|eperm/iu.test(message)) return { kind: 'sandbox_denied', message }
  if (/maxc|sidecar|mcp|spawn/iu.test(message)) return { kind: 'sidecar_start', message }
  if (/credential|provider|dashscope|network|dns|transport|rate.limit|timeout/iu.test(message)) {
    return { kind: 'provider_unreachable', message }
  }
  return { kind: 'agent_failure', message }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
}

/** Run one Attempt, seal Session-derived evidence, grade it, and await teardown. */
export async function executeAttempt(
  planned: PlannedAttempt,
  testCase: ManifestCase,
  options: ExecuteAttemptOptions,
): Promise<SmokeAttemptResult> {
  const now = options.now ?? Date.now
  const startedAt = now()
  const directory = join(options.rawRoot, options.runId, planned.attemptId)
  await mkdir(directory, { recursive: true })
  let runtime: AttemptRuntime | undefined
  let sessionHeader: unknown = null
  let events: readonly SessionEvent[] = []
  let firstModelRequestContainsTask = false
  let budgetExceeded = false
  let failure: InfrastructureFailure | undefined
  try {
    runtime = await options.createRuntime()
    const result = await runtime.run(planned.taskWorkingSet)
    sessionHeader = result.sessionHeader
    events = result.events
    firstModelRequestContainsTask = result.firstModelRequestContainsTask
    budgetExceeded = result.budgetExceeded
    failure = result.infrastructureFailure
  } catch (error: unknown) {
    failure = infrastructureFailure(error)
  } finally {
    if (runtime !== undefined) {
      try {
        await runtime.dispose()
      } catch (error: unknown) {
        failure ??= infrastructureFailure(error)
      }
    }
  }

  const observation = observeSession(events, Math.max(0, now() - startedAt))
  const writeArtifact = options.writeArtifact ?? writeJson
  await writeArtifact(join(directory, 'config.json'), { planned, testCase })
  await writeArtifact(join(directory, 'session.json'), { header: sessionHeader, events })
  await writeArtifact(join(directory, 'environment.json'), options.environment)
  await writeArtifact(join(directory, 'observation.json'), observation)
  if (failure !== undefined) await writeArtifact(join(directory, 'failure.json'), failure)
  let grade: GradeRecord
  let gradingFailure: InfrastructureFailure | undefined
  try {
    grade = failure === undefined
      ? await (options.gradeObservation ?? ((spec, observed, control) => scoreAttempt(spec, observed, undefined, control)))(
          testCase,
          observation,
          { budgetExceeded },
        )
      : scoreAttempt(testCase, observation, failure, { budgetExceeded })
  } catch (error: unknown) {
    gradingFailure = {
      kind: 'scorer_failure',
      message: error instanceof Error ? error.message : String(error),
    }
    grade = scoreAttempt(testCase, observation, gradingFailure)
  }
  const observationDigest = digestText(JSON.stringify(observation))
  const gradeDigest = digestText(JSON.stringify(grade))
  const rawLocator = `${options.runId}/${planned.attemptId}`
  await writeArtifact(join(directory, 'grade.json'), grade)
  if (gradingFailure !== undefined) await writeArtifact(join(directory, 'failure.json'), gradingFailure)
  return {
    planned,
    testCase,
    observation,
    grade,
    firstModelRequestContainsTask,
    rawLocator,
    observationDigest,
    gradeDigest,
    ...(failure ?? gradingFailure) === undefined ? {} : { infrastructureFailure: failure ?? gradingFailure },
  }
}

async function resolveExecutable(name: string, pathValue: string | undefined): Promise<string> {
  for (const directory of (pathValue ?? '').split(delimiter)) {
    if (directory === '') continue
    const candidate = resolve(directory, name)
    try {
      await access(candidate, fsConstants.X_OK)
      return await realpath(candidate)
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && (error as NodeJS.ErrnoException).code !== 'EACCES') throw error
    }
  }
  throw new Error(`G25a cannot resolve executable ${name} from PATH`)
}

/** Resolve the explicit, non-secret paths recorded for one real Attempt. */
export async function resolveAttemptEnvironment(
  options: ResolveAttemptEnvironmentOptions,
): Promise<AttemptEnvironmentReceipt> {
  const env = options.env ?? process.env
  if (env.MAXC_CONFIG === undefined || env.MAXC_CONFIG.trim() === '') {
    throw new Error('G25a MAXC_CONFIG must name an explicit path')
  }
  const maxcConfigPath = resolve(env.MAXC_CONFIG)
  await access(maxcConfigPath, fsConstants.R_OK)
  const maxcPath = await resolveExecutable('maxc', env.PATH)
  const experimentRoot = resolve(options.repoRoot, 'wayfinder/task-orchestration-dag/experiments/g25a-phase-gate')
  const presetPath = options.arm === 'state_machine'
    ? resolve(options.repoRoot, 'packages/bundle/data-agent/presets/data-agent/agent.cordis.yml')
    : resolve(experimentRoot, `presets/${options.arm}/agent.cordis.yml`)
  const sidecarPath = options.faultMode === 'none'
    ? resolve(options.repoRoot, 'packages/query/query-maxcompute/dev/maxc-sidecar.mjs')
    : resolve(experimentRoot, 'fixtures/fault-sidecar.mjs')
  return {
    provider: 'aga',
    model: 'qwen3.7-max',
    scopeId: '10000251',
    maxcomputeProject: 'ieu_cdm',
    semanticRoot: resolve(options.repoRoot, 'examples/k11-semantic-layer'),
    presetPath,
    sidecarPath,
    maxcPath,
    maxcConfigPath: await realpath(maxcConfigPath),
    environmentVariableNames: Object.keys(env).filter(key => env[key] !== undefined).sort(),
  }
}

function textFromMessages(messages: readonly Message[]): string {
  return messages.flatMap(message => message.content.flatMap(block => block.type === 'text' ? [block.text] : [])).join('\n')
}

interface WorkspaceModules {
  readonly Context: typeof import('@deepseek-ai/cordis')['Context']
  readonly Loader: typeof import('@deepseek-ai/cordis-plugin-loader')['default']
  readonly Include: typeof import('@deepseek-ai/cordis-plugin-include')['default']
  readonly Group: typeof import('@deepseek-ai/cordis-plugin-group')['default']
  readonly LlmRuntime: typeof import('@deepseek-ai/dsh-llm')['default']
  readonly BlockAssembler: typeof import('@deepseek-ai/dsh-llm')['BlockAssembler']
  readonly createUserMessage: typeof import('@deepseek-ai/dsh-llm')['createUserMessage']
  readonly llmDashscope: typeof import('@deepseek-ai/dsh-llm-dashscope')
  readonly LocalCredentialProvider: typeof import('@deepseek-ai/dsh-credentials-local')['default']
  readonly resolveDshHome: typeof import('@deepseek-ai/dsh-home-paths')['resolveDshHome']
  readonly SemanticLayerService: typeof import('@deepseek-ai/dsh-semantic-layer')['SemanticLayerService']
  readonly SessionStore: typeof import('@deepseek-ai/dsh-session')['default']
  readonly SessionId: typeof import('@deepseek-ai/dsh-session')['SessionId']
  readonly SessionProjectionRegistry: typeof import('@deepseek-ai/dsh-session-projection')['default']
  readonly SystemPrompt: typeof import('@deepseek-ai/dsh-system-prompt')['default']
  readonly ToolRuntime: typeof import('@deepseek-ai/dsh-tools')['default']
  readonly toolRuntimeScheduler: typeof import('@deepseek-ai/dsh-tools')['TOOL_RUNTIME_SCHEDULER']
  readonly AgentRegistry: typeof import('@deepseek-ai/dsh-agent')['default']
  readonly AgentDefaultModel: typeof import('@deepseek-ai/dsh-agent-default-model')['default']
  readonly AgentLoop: typeof import('@deepseek-ai/dsh-agent-loop')['default']
  readonly IdentityService: typeof import('@deepseek-ai/dsh-identity')['default']
  readonly Audit: typeof import('@deepseek-ai/dsh-audit')['default']
  readonly resultCacheMemory: typeof import('@deepseek-ai/dsh-result-cache-memory')
  readonly WorkerThreadCodeRuntime: typeof import('@deepseek-ai/dsh-code-runtime-worker-thread')['default']
  readonly llmRetry: typeof import('@deepseek-ai/dsh-llm-retry')
  readonly MaxComputeQueryEngine: typeof import('@deepseek-ai/dsh-query-maxcompute')['MaxComputeQueryEngine']
  readonly mountPreset: typeof import('@deepseek-ai/dsh-agent-presets')['mountPreset']
}

async function loadWorkspaceModules(): Promise<WorkspaceModules> {
  const [
    cordis,
    loader,
    include,
    group,
    llm,
    llmDashscope,
    credentialsLocal,
    homePaths,
    semanticLayer,
    session,
    sessionProjection,
    systemPrompt,
    tools,
    agent,
    agentDefaultModel,
    agentLoop,
    identity,
    audit,
    resultCacheMemory,
    codeRuntime,
    llmRetry,
    queryMaxCompute,
    agentPresets,
  ] = await Promise.all([
    import('@deepseek-ai/cordis'),
    import('@deepseek-ai/cordis-plugin-loader'),
    import('@deepseek-ai/cordis-plugin-include'),
    import('@deepseek-ai/cordis-plugin-group'),
    import('@deepseek-ai/dsh-llm'),
    import('@deepseek-ai/dsh-llm-dashscope'),
    import('@deepseek-ai/dsh-credentials-local'),
    import('@deepseek-ai/dsh-home-paths'),
    import('@deepseek-ai/dsh-semantic-layer'),
    import('@deepseek-ai/dsh-session'),
    import('@deepseek-ai/dsh-session-projection'),
    import('@deepseek-ai/dsh-system-prompt'),
    import('@deepseek-ai/dsh-tools'),
    import('@deepseek-ai/dsh-agent'),
    import('@deepseek-ai/dsh-agent-default-model'),
    import('@deepseek-ai/dsh-agent-loop'),
    import('@deepseek-ai/dsh-identity'),
    import('@deepseek-ai/dsh-audit'),
    import('@deepseek-ai/dsh-result-cache-memory'),
    import('@deepseek-ai/dsh-code-runtime-worker-thread'),
    import('@deepseek-ai/dsh-llm-retry'),
    import('@deepseek-ai/dsh-query-maxcompute'),
    import('@deepseek-ai/dsh-agent-presets'),
  ])
  return {
    Context: cordis.Context,
    Loader: loader.default,
    Include: include.default,
    Group: group.default,
    LlmRuntime: llm.default,
    BlockAssembler: llm.BlockAssembler,
    createUserMessage: llm.createUserMessage,
    llmDashscope,
    LocalCredentialProvider: credentialsLocal.default,
    resolveDshHome: homePaths.resolveDshHome,
    SemanticLayerService: semanticLayer.SemanticLayerService,
    SessionStore: session.default,
    SessionId: session.SessionId,
    SessionProjectionRegistry: sessionProjection.default,
    SystemPrompt: systemPrompt.default,
    ToolRuntime: tools.default,
    toolRuntimeScheduler: tools.TOOL_RUNTIME_SCHEDULER,
    AgentRegistry: agent.default,
    AgentDefaultModel: agentDefaultModel.default,
    AgentLoop: agentLoop.default,
    IdentityService: identity.default,
    Audit: audit.default,
    resultCacheMemory,
    WorkerThreadCodeRuntime: codeRuntime.default,
    llmRetry,
    MaxComputeQueryEngine: queryMaxCompute.MaxComputeQueryEngine,
    mountPreset: agentPresets.mountPreset,
  }
}


/** Verify the host ToolRuntime and AgentLoop share one scheduler symbol identity. */
export async function verifyToolSchedulerIdentity(): Promise<boolean> {
  const modules = await loadWorkspaceModules()
  const ctx = new modules.Context()
  try {
    await ctx.plugin(modules.SystemPrompt)
    await ctx.plugin(modules.ToolRuntime, { mode: 'native' })
    return (ctx.tools as unknown as Record<PropertyKey, unknown>)[modules.toolRuntimeScheduler] !== undefined
  } finally {
    await ctx.fiber.dispose()
  }
}

/** Dedicated arm-blinded model grader used after an observation is sealed. */
export interface EvidenceGraderRuntime {
  judge(spec: ManifestCase, observation: SessionObservation): Promise<{
    readonly prompt: string
    readonly response: string
    readonly judgment: EvidenceGroundedJudgment
  }>
  dispose(): Promise<void>
}

/** Boot a tool-free grading context that cannot observe experiment arm identity. */
export async function createEvidenceGraderRuntime(
  environment: Pick<AttemptEnvironmentReceipt, 'provider' | 'model'>,
): Promise<EvidenceGraderRuntime> {
  const modules = await loadWorkspaceModules()
  const ctx = new modules.Context()
  try {
    await ctx.plugin(modules.LlmRuntime)
    const dshHome = modules.resolveDshHome()
    await ctx.plugin(modules.LocalCredentialProvider, {
      path: resolve(dshHome, '.credentials.yaml'),
      dshHome,
    })
    await ctx.plugin(modules.llmDashscope, {
      retryPolicy: { mode: 'normal', maxRetries: 0, retryableCodes: ['TRANSPORT'] },
    })
  } catch (error: unknown) {
    try {
      await ctx.fiber.dispose()
    } catch {
      // Preserve the grader boot failure.
    }
    throw error
  }
  return {
    judge: async (spec, observation) => {
      const prompt = buildEvidenceGroundedGraderPrompt(spec, observation)
      const assembler = new modules.BlockAssembler()
      const request = {
        provider: environment.provider,
        model: environment.model,
        maxTokens: 512,
        messages: [modules.createUserMessage({
          content: [{ type: 'text', text: prompt }],
          source: { kind: 'plugin', plugin: 'g25a-evidence-grader' },
        })],
      }
      for await (const chunk of ctx.llm.stream(request)) assembler.push(chunk)
      const finish = assembler.finish
      if (finish.kind === 'error' || finish.kind === 'aborted') {
        throw new Error(`G25a evidence grader failed: ${finish.failure.message}`)
      }
      const response = assembler.blocks()
        .flatMap(block => block.type === 'text' ? [block.text] : [])
        .join('')
      return { prompt, response, judgment: parseEvidenceGroundedJudgment(response) }
    },
    dispose: async () => { await ctx.fiber.dispose() },
  }
}

/** Resolve a package through pnpm's complete workspace dependency closure. */
export function resolveWorkspaceSpecifier(repoRoot: string, specifier: string): string {
  const moduleRoot = resolve(repoRoot, 'node_modules/.pnpm/node_modules')
  return createRequire(resolve(moduleRoot, '.g25a-resolver.cjs')).resolve(specifier)
}

async function digestFile(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

async function digestSemanticCorpus(repoRoot: string, root: string): Promise<{ digest: string; files: number }> {
  const paths: string[] = []
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile() && /\.ya?ml$/u.test(entry.name)) paths.push(path)
    }
  }
  await walk(root)
  paths.sort()
  const rows: string[] = []
  for (const path of paths) rows.push(`${relative(repoRoot, path)}:${await digestFile(path)}`)
  return { digest: digestText(rows.join('\n')), files: paths.length }
}

async function runTextCommand(file: string, args: readonly string[], cwd: string): Promise<string> {
  return new Promise((settle, reject) => {
    const child = spawn(file, [...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { stdout += chunk })
    child.stderr.on('data', (chunk: string) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code, signal) => {
      if (code === 0 && signal === null) settle(stdout)
      else reject(new Error(`${file} ${args.join(' ')} failed: ${stderr.trim() || `exit ${String(code)} signal ${String(signal)}`}`))
    })
  })
}

async function dirtyStateDigest(repoRoot: string): Promise<string> {
  const diff = await runTextCommand('git', ['diff', '--binary', 'HEAD', '--', '.'], repoRoot)
  const untrackedRaw = await runTextCommand('git', ['ls-files', '--others', '--exclude-standard', '-z'], repoRoot)
  const untracked = untrackedRaw.split('\0').filter(Boolean).sort()
  const files: { path: string; digest: string }[] = []
  for (const path of untracked) {
    const absolute = resolve(repoRoot, path)
    if ((await stat(absolute)).isFile()) files.push({ path, digest: await digestFile(absolute) })
  }
  return digestText(canonicalJson({ diffDigest: digestText(diff), untracked: files }))
}

/** Capture every frozen behavior-affecting input immediately before Stage 2. */
export async function captureRunIdentity(
  repoRoot: string,
  manifest: G25aManifest & { readonly semantic_corpus_digest?: string },
  environment: AttemptEnvironmentReceipt,
  referenceStart: readonly ReferenceProbeReceipt[],
): Promise<RunIdentity> {
  const experimentRoot = resolve(repoRoot, 'wayfinder/task-orchestration-dag/experiments/g25a-phase-gate')
  const semantic = await digestSemanticCorpus(repoRoot, environment.semanticRoot)
  if (manifest.semantic_corpus_digest !== undefined && semantic.digest !== manifest.semantic_corpus_digest) {
    throw new Error(`G25a semantic corpus digest drift: manifest=${manifest.semantic_corpus_digest} actual=${semantic.digest}`)
  }
  const gitCommit = (await runTextCommand('git', ['rev-parse', 'HEAD'], repoRoot)).trim()
  return buildRunIdentity({
    gitCommit,
    dirtyDiffDigest: await dirtyStateDigest(repoRoot),
    presetDigests: {
      state_machine: await digestFile(resolve(repoRoot, 'packages/bundle/data-agent/presets/data-agent/agent.cordis.yml')),
      policy: await digestFile(resolve(experimentRoot, 'presets/policy/agent.cordis.yml')),
      floor: await digestFile(resolve(experimentRoot, 'presets/floor/agent.cordis.yml')),
    },
    policyPluginDigest: await digestFile(resolve(experimentRoot, 'src/guardrails-policy.ts')),
    manifestDigest: await digestFile(resolve(experimentRoot, 'cases/manifest.json')),
    semanticCorpusDigest: semantic.digest,
    sidecarDigests: {
      real: await digestFile(resolve(repoRoot, 'packages/query/query-maxcompute/dev/maxc-sidecar.mjs')),
      fault: await digestFile(resolve(experimentRoot, 'fixtures/fault-sidecar.mjs')),
    },
    provider: environment.provider,
    model: environment.model,
    environmentVariableNames: environment.environmentVariableNames,
    resolvedPaths: {
      maxc: environment.maxcPath,
      maxcConfig: environment.maxcConfigPath,
      semanticRoot: environment.semanticRoot,
    },
    randomizationSeed: SEED,
    referenceStartDigests: Object.fromEntries(referenceStart.map(receipt => [receipt.caseId, receipt.result.digest])),
  })
}

async function writeSidecarLaunchers(
  directory: string,
  environment: AttemptEnvironmentReceipt,
  planned: PlannedAttempt,
  repoRoot: string,
): Promise<string> {
  const realSidecar = resolve(repoRoot, 'packages/query/query-maxcompute/dev/maxc-sidecar.mjs')
  const realLauncher = resolve(directory, 'maxc-sidecar-launcher.mjs')
  await writeFile(realLauncher, [
    `process.argv.splice(2, 0, '--maxc-bin', ${JSON.stringify(environment.maxcPath)});`,
    `await import(${JSON.stringify(pathToFileURL(realSidecar).href)});`,
    '',
  ].join('\n'), { encoding: 'utf8', flag: 'wx' })
  if (planned.faultMode === 'none') return realLauncher
  const faultLauncher = resolve(directory, 'fault-sidecar-launcher.mjs')
  await writeFile(faultLauncher, [
    `process.env.G25A_FAULT_MODE = ${JSON.stringify(planned.faultMode)};`,
    `process.env.G25A_FAIL_FIRST_N = ${JSON.stringify(String(planned.failFirstN))};`,
    `process.env.G25A_DELEGATE_SIDECAR = ${JSON.stringify(realLauncher)};`,
    `await import(${JSON.stringify(pathToFileURL(environment.sidecarPath).href)});`,
    '',
  ].join('\n'), { encoding: 'utf8', flag: 'wx' })
  return faultLauncher
}

function classifyRuntimeError(error: unknown): InfrastructureFailure {
  return infrastructureFailure(error)
}

/** Boot one real Cordis context with one fresh Agent and Session. */
export async function createRealAttemptRuntime(
  repoRoot: string,
  attemptDirectory: string,
  planned: PlannedAttempt,
  testCase: ManifestCase,
  environment: AttemptEnvironmentReceipt,
): Promise<AttemptRuntime> {
  const modules = await loadWorkspaceModules()
  const ctx = new modules.Context()
  let handle: AgentHandle | undefined
  let agentFailure: InfrastructureFailure | undefined
  let modelRequests = 0
  let queryCalls = 0
  let budgetExceeded = false
  let firstModelRequestContainsTask = false
  let firstModelRequestSeen = false
  try {
    ctx.baseUrl = pathToFileURL(`${resolve(repoRoot, 'node_modules/.pnpm/node_modules')}/`).href
    await ctx.plugin(modules.Loader)
    ctx.loader.builtins.include = modules.Include
    ctx.loader.builtins.group = modules.Group
    await ctx.plugin(modules.LlmRuntime)
    const dshHome = modules.resolveDshHome()
    await ctx.plugin(modules.LocalCredentialProvider, {
      path: resolve(dshHome, '.credentials.yaml'),
      dshHome,
    })
    await ctx.plugin(modules.llmDashscope, {
      retryPolicy: {
        mode: 'normal',
        maxRetries: 1,
        retryableCodes: ['TRANSPORT'],
      },
    })
    await ctx.plugin(modules.SemanticLayerService, {
      semanticRoot: environment.semanticRoot,
      scopeId: environment.scopeId,
    })
    await ctx.plugin(modules.SessionStore)
    await ctx.plugin(modules.SessionProjectionRegistry)
    await ctx.plugin(modules.SystemPrompt)
    await ctx.plugin(modules.ToolRuntime, { mode: 'native' })
    await ctx.plugin(modules.AgentRegistry)
    await ctx.plugin(modules.AgentDefaultModel, { provider: environment.provider, model: environment.model })
    await ctx.plugin(modules.AgentLoop, { agents: [], maxParallelToolCalls: 3 })
    await ctx.plugin(modules.IdentityService)
    await ctx.plugin(modules.Audit, { path: resolve(attemptDirectory, 'audit.db') })
    await ctx.plugin(modules.resultCacheMemory)
    await ctx.plugin(modules.WorkerThreadCodeRuntime)
    await ctx.plugin(modules.llmRetry)
    const sidecarPath = await writeSidecarLaunchers(attemptDirectory, environment, planned, repoRoot)
    await ctx.plugin(modules.MaxComputeQueryEngine, {
      sidecarPath,
      credMode: 'sidecar-self',
      maxcConfigPath: environment.maxcConfigPath,
      defaultProject: environment.maxcomputeProject,
      toolCallTimeoutMs: testCase.budget.wall_clock_seconds * 1000,
    })
    const query = ctx.query as { start?(): Promise<void> }
    if (query.start !== undefined) await query.start()

    handle = await ctx.agents.create({
      sessionId: modules.SessionId(`g25a-${planned.attemptId}-${randomUUID()}`),
      meta: { cwd: repoRoot, agentPreset: `g25a-${planned.arm}` },
      agentOptions: { provider: environment.provider, model: environment.model },
      setup: async (agentCtx: Context) => {
        agentCtx.on('agent/error', ({ error }) => {
          if (!budgetExceeded) agentFailure = classifyRuntimeError(error)
        })
        agentCtx.on('agent/request', async (_payload, next) => {
          if (modelRequests >= testCase.budget.max_llm_calls) {
            budgetExceeded = true
            throw new Error(`G25a model-call budget exhausted at ${String(testCase.budget.max_llm_calls)}`)
          }
          modelRequests += 1
          return next()
        })
        agentCtx.on('llm/stream', (request: GenerateOptions, next) => {
          if (!firstModelRequestSeen) {
            firstModelRequestSeen = true
            firstModelRequestContainsTask = textFromMessages(request.messages).includes(planned.taskWorkingSet)
          }
          return next()
        })
        agentCtx.on('tools/pre-execute', (exec, next) => {
          if (exec.name !== 'query_data') return next()
          if (queryCalls >= testCase.budget.max_query_data_calls) {
            budgetExceeded = true
            return Promise.resolve({ kind: 'deny', reason: 'G25a query_data budget exhausted' })
          }
          queryCalls += 1
          return next()
        })
        const presetCtx = planned.arm === 'state_machine'
          ? agentCtx.intercept('phaseGate', {
              max_llm_calls_per_turn: testCase.budget.max_llm_calls,
              max_executions_per_turn: testCase.budget.max_query_data_calls,
              stall_watchdog_seconds: testCase.budget.wall_clock_seconds,
            })
          : agentCtx
        await modules.mountPreset(presetCtx, {
          id: `g25a-${planned.arm}`,
          trust: 'system',
          path: environment.presetPath,
        })
      },
    })
  } catch (error: unknown) {
    try {
      if (handle !== undefined) await handle.dispose()
      await ctx.fiber.dispose()
    } catch {
      // Preserve the boot error; no live handle escapes this failed factory.
    }
    throw error
  }

  const ownedHandle = handle
  return {
    run: async (taskWorkingSet) => {
      await ownedHandle.agent.whenIdle()
      const message = modules.createUserMessage({
        content: [{ type: 'text', text: taskWorkingSet }],
        source: { kind: 'user' },
      })
      ownedHandle.agent.followup(message)
      let timer: ReturnType<typeof setTimeout> | undefined
      let timedOut = false
      const timeout = new Promise<void>((resolveTimeout) => {
        timer = setTimeout(() => {
          timedOut = true
          budgetExceeded = true
          ownedHandle.agent.cancel({ kind: 'hook', reason: 'G25a wall-clock budget exhausted' })
          resolveTimeout()
        }, testCase.budget.wall_clock_seconds * 1000)
      })
      try {
        await Promise.race([ownedHandle.agent.whenIdle(), timeout])
        if (timedOut) await ownedHandle.agent.whenIdle()
      } finally {
        if (timer !== undefined) clearTimeout(timer)
      }
      const events = ownedHandle.agent.session.snapshotEvents()
      return {
        sessionHeader: ownedHandle.agent.session.header,
        events,
        firstModelRequestContainsTask,
        budgetExceeded,
        ...(agentFailure === undefined ? {} : { infrastructureFailure: agentFailure }),
      }
    },
    dispose: async () => {
      const failures: unknown[] = []
      try {
        await ownedHandle.dispose()
      } catch (error: unknown) {
        failures.push(error)
      }
      try {
        await ctx.fiber.dispose()
      } catch (error: unknown) {
        failures.push(error)
      }
      if (failures.length > 0) throw new AggregateError(failures, `G25a teardown failed for ${planned.attemptId}`)
    },
  }
}

async function loadManifest(): Promise<G25aManifest> {
  const path = resolve(import.meta.dirname, '../cases/manifest.json')
  return JSON.parse(await readFile(path, 'utf8')) as G25aManifest
}

async function runRealStage1(manifest: G25aManifest): Promise<Stage1Summary> {
  const repoRoot = resolve(import.meta.dirname, '../../../../..')
  const experimentRoot = resolve(import.meta.dirname, '..')
  const rawRoot = resolve(repoRoot, 'eval-results/g25a/raw')
  const resultsRoot = resolve(experimentRoot, 'results')
  const runId = `g25a-smoke-2026-09-17-${randomUUID()}`
  const referenceEnvironment = await resolveAttemptEnvironment({
    repoRoot,
    arm: 'state_machine',
    faultMode: 'none',
  })
  const result = await runStage1(manifest, {
    concurrency: 3,
    probe: async (testCase, phase) => {
      const receipt = await runReferenceProbe(testCase, {
        maxcPath: referenceEnvironment.maxcPath,
        maxcConfigPath: referenceEnvironment.maxcConfigPath,
      })
      const directory = resolve(rawRoot, runId, 'reference', phase)
      await mkdir(directory, { recursive: true })
      await writeJson(resolve(directory, `${testCase.case_id}.json`), receipt)
      return receipt
    },
    attempt: async (planned, testCase) => {
      const environment = await resolveAttemptEnvironment({
        repoRoot,
        arm: planned.arm,
        faultMode: planned.faultMode,
      })
      const attemptDirectory = resolve(rawRoot, runId, planned.attemptId)
      return executeAttempt(planned, testCase, {
        runId,
        rawRoot,
        environment,
        createRuntime: () => createRealAttemptRuntime(repoRoot, attemptDirectory, planned, testCase, environment),
      })
    },
  })
  const summary = summarizeStage1(runId, result, referenceEnvironment)
  await mkdir(resultsRoot, { recursive: true })
  await writeFile(resolve(resultsRoot, 'smoke-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  return summary
}

interface DecisionSummary {
  readonly schemaVersion: 1
  readonly stage: 'decision'
  readonly runId: string
  readonly runIdentity: RunIdentity
  readonly failures: readonly string[]
  readonly reference: Stage1Summary['reference']
  readonly attempts: readonly (AttemptRecord & {
    readonly taskDigest: string
    readonly toolNames: readonly string[]
    readonly firstModelRequestContainsTask: boolean
    readonly rawLocator: string
    readonly observationDigest: string
    readonly gradeDigest: string
  })[]
  readonly provisionalAnalysis: AnalysisResult
  readonly humanReview: {
    readonly status: 'pending' | 'not_required'
    readonly entries: number
    readonly packetLocator: string
    readonly mappingLocator: string
  }
}

function summarizeDecision(
  runId: string,
  identity: RunIdentity,
  result: DecisionBatchResult,
  review: BlindReviewPacket,
): DecisionSummary {
  const reference = (receipts: readonly ReferenceProbeReceipt[]) => receipts.map(receipt => ({
    caseId: receipt.caseId,
    resultDigest: receipt.result.digest,
    rowCount: receipt.result.rowCount,
    matchesExpected: receipt.matchesExpected,
  }))
  return {
    schemaVersion: 1,
    stage: 'decision',
    runId,
    runIdentity: identity,
    failures: result.failures,
    reference: { before: reference(result.referenceBefore), after: reference(result.referenceAfter) },
    attempts: result.attempts.map((attempt, index) => ({
      ...result.records[index]!,
      taskDigest: attempt.planned.taskDigest,
      toolNames: attempt.observation.toolNames,
      firstModelRequestContainsTask: attempt.firstModelRequestContainsTask,
      rawLocator: attempt.rawLocator,
      observationDigest: attempt.observationDigest,
      gradeDigest: attempt.gradeDigest,
    })),
    provisionalAnalysis: result.analysis,
    humanReview: {
      status: review.entries.length === 0 ? 'not_required' : 'pending',
      entries: review.entries.length,
      packetLocator: `${runId}/review/review-packet.json`,
      mappingLocator: `${runId}/review/reveal-map.json`,
    },
  }
}

async function runRealDecision(manifest: G25aManifest): Promise<DecisionSummary> {
  const repoRoot = resolve(import.meta.dirname, '../../../../..')
  const experimentRoot = resolve(import.meta.dirname, '..')
  const rawRoot = resolve(repoRoot, 'eval-results/g25a/raw')
  const resultsRoot = resolve(experimentRoot, 'results')
  const smoke = JSON.parse(await readFile(resolve(resultsRoot, 'smoke-summary.json'), 'utf8')) as Stage1Summary
  if (!smoke.passed) throw new Error(`G25a Stage 2 requires a passing Stage 1 summary; ${smoke.runId} did not pass`)
  const runId = `g25a-decision-2026-09-17-${randomUUID()}`
  const environment = await resolveAttemptEnvironment({ repoRoot, arm: 'state_machine', faultMode: 'none' })
  const grader = await createEvidenceGraderRuntime(environment)
  let identity: RunIdentity | undefined
  try {
    const result = await runDecisionBatch(manifest, {
      concurrency: 3,
      beforeAttempts: async (referenceBefore) => {
        identity = await captureRunIdentity(repoRoot, manifest, environment, referenceBefore)
        const directory = resolve(rawRoot, runId)
        await mkdir(directory, { recursive: true })
        await writeJson(resolve(directory, 'run-identity.json'), identity)
      },
      probe: async (testCase, phase) => {
        const receipt = await runReferenceProbe(testCase, {
          maxcPath: environment.maxcPath,
          maxcConfigPath: environment.maxcConfigPath,
        })
        const directory = resolve(rawRoot, runId, 'reference', phase)
        await mkdir(directory, { recursive: true })
        await writeJson(resolve(directory, `${testCase.case_id}.json`), receipt)
        return receipt
      },
      attempt: async (planned, testCase) => {
        const attemptEnvironment = await resolveAttemptEnvironment({
          repoRoot,
          arm: planned.arm,
          faultMode: planned.faultMode,
        })
        const attemptDirectory = resolve(rawRoot, runId, planned.attemptId)
        const result = await executeAttempt(planned, testCase, {
          runId,
          rawRoot,
          environment: attemptEnvironment,
          createRuntime: () => createRealAttemptRuntime(repoRoot, attemptDirectory, planned, testCase, attemptEnvironment),
          gradeObservation: async (spec, observation, control) => {
            const judged = await grader.judge(spec, observation)
            await writeJson(resolve(attemptDirectory, 'grader.json'), judged)
            return scoreAttempt(spec, observation, undefined, { ...control, graderJudgment: judged.judgment })
          },
        })
        process.stderr.write(`[g25a] ${String(planned.order + 1)}/${String(manifest.total_decision_attempts)} ${planned.attemptId} ${result.grade.status}\n`)
        return result
      },
    })
    if (identity === undefined) throw new Error('G25a decision run identity was not frozen before Attempts')
    const review = buildBlindReviewPacket(result.attempts)
    const reviewDirectory = resolve(rawRoot, runId, 'review')
    await mkdir(reviewDirectory, { recursive: true })
    await writeJson(resolve(reviewDirectory, 'review-packet.json'), review.entries)
    await writeJson(resolve(reviewDirectory, 'reveal-map.json'), review.mapping)
    const summary = summarizeDecision(runId, identity, result, review)
    await mkdir(resultsRoot, { recursive: true })
    await writeFile(resolve(resultsRoot, 'decision-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
    return summary
  } finally {
    await grader.dispose()
  }
}

async function main(): Promise<void> {
  const stageIndex = process.argv.indexOf('--stage')
  const stage = stageIndex >= 0 ? process.argv[stageIndex + 1] : undefined
  const manifest = await loadManifest()
  if (stage === 'smoke') {
    const summary = await runRealStage1(manifest)
    process.stdout.write(`${JSON.stringify({
      stage,
      runId: summary.runId,
      passed: summary.passed,
      failures: summary.failures,
      attempts: summary.attempts.length,
    }, null, 2)}\n`)
    if (!summary.passed) process.exitCode = 1
    return
  }
  if (stage === 'decision') {
    const summary = await runRealDecision(manifest)
    process.stdout.write(`${JSON.stringify({
      stage,
      runId: summary.runId,
      identityDigest: summary.runIdentity.identityDigest,
      failures: summary.failures,
      attempts: summary.attempts.length,
      humanReview: summary.humanReview,
      provisionalVerdict: summary.provisionalAnalysis.verdict,
    }, null, 2)}\n`)
    if (summary.failures.length > 0) process.exitCode = 1
    return
  }
  throw new Error('usage: controlled-runner.ts --stage smoke|decision')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main()
}
