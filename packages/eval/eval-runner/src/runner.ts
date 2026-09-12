/**
 * Batch runner: drives all eval cases through pass_k attempts, handles infra
 * retry, health-gate pre-flight, and produces a RunResult.
 *
 * The runner accepts a list of case file paths, loads them via the eval core's
 * case_loader, then drives each case through the injected collaborators.
 *
 * @module @deepseek-ai/dsh-eval-runner/runner
 */

import { randomUUID } from 'node:crypto'
import {
  ENVIRONMENTAL_FAILURE_CLASSES,
  JUDGE_PASS_THRESHOLD,
  classifyExecutionFailure,
  executeAndNormalize,
  gradeExecution,
  loadCases,
  preflightEvalCaseContent,
  resolveComparatorPolicy,
  resolveReferenceSql,
} from '@deepseek-ai/dsh-eval'
import type { ComparatorPolicy, EvalCase, ExecutionArtifact, ExecutionOutcome } from '@deepseek-ai/dsh-eval'
import type { Collaborators } from './collaborators.ts'
import type {
  BatchRunOptions,
  RunResult,
  RunSummary,
  CaseVerdict,
  RunnerVerdict,
  AttemptResult,
  SqlJudgeVerdict,
  CasePreflightEvidence,
  ReferenceSqlPreflightEvidence,
  CaseProvenance,
  AgentResponse,
} from './types.ts'
import { runHealthGate } from './health_gate.ts'
import { withInfraRetry, classifyInfraFailure, isInfraError } from './infra_retry.ts'
import { writeRunResult } from './persistence.ts'

type SelfDescribingRunResult = RunResult & { readonly config: BatchRunOptions['config'] }

/**
 * Run a batch of eval cases.
 *
 * For each case, runs pass_k attempts; verdict = pass^k (ALL attempts must pass).
 * Handles infra errors with bounded retry (max 2 by default), labels as
 * infra_failure if all attempts fail due to infra.
 *
 * @param casePaths - paths to case YAML/JSON files.
 * @param collaborators - injected collaborators (agent, executor, judge).
 * @param options - batch run options.
 * @returns the full run result.
 */
export async function runBatch(
  casePaths: string[],
  collaborators: Collaborators,
  options: BatchRunOptions,
): Promise<SelfDescribingRunResult> {
  const resolved = resolveRunSettings(collaborators, options)
  const { passK, maxInfraRetries, concurrency, skipHealthGate, policy, config } = resolved
  const runId = options.run_id ?? randomUUID()
  const outputPath = options.output_path ?? null
  const onProgress = options.on_progress ?? null

  // Health gate pre-flight
  if (!skipHealthGate) {
    const healthResult = await runHealthGate({
      agent: collaborators.agent,
      executor: collaborators.executor ?? null,
      judge: collaborators.judge ?? null,
    })
    if (!healthResult.passed) {
      const failedChecks = healthResult.checks.filter(c => !c.healthy).map(c => `${c.name}: ${c.message}`)
      throw new Error(`health gate failed: ${failedChecks.join('; ')}`)
    }
  }

  // Load cases
  const cases = loadCases(casePaths).map((evalCase, index) => {
    const sourcePath = casePaths[index]
    if (sourcePath === undefined) throw new Error(`eval runner: no source path for loaded case ${evalCase.case_id}`)
    return { evalCase, sourcePath }
  })

  // Drive each case (serial when concurrency=1, parallel otherwise)
  let verdicts: CaseVerdict[]
  if (concurrency <= 1) {
    verdicts = []
    for (let i = 0; i < cases.length; i++) {
      const loaded = cases[i]
      if (!loaded) continue
      const { evalCase, sourcePath } = loaded
      const caseVerdict = await runSingleCase(evalCase, sourcePath, collaborators, passK, maxInfraRetries, policy)
      verdicts.push(caseVerdict)
      if (onProgress) {
        onProgress(i + 1, cases.length, evalCase.case_id)
      }
    }
  } else {
    verdicts = await runConcurrent(cases, collaborators, passK, maxInfraRetries, concurrency, policy, onProgress)
  }

  // Compute summary
  const summary = computeSummary(verdicts)

  const result: SelfDescribingRunResult = {
    run_id: runId,
    timestamp: new Date().toISOString(),
    cases: verdicts,
    summary,
    config,
  }

  // Persist if output path given
  if (outputPath) {
    writeRunResult(result, outputPath)
  }

  return result
}

interface ResolvedRunSettings {
  readonly passK: number
  readonly concurrency: number
  readonly maxInfraRetries: number
  readonly skipHealthGate: boolean
  readonly policy: ComparatorPolicy
  readonly config: BatchRunOptions['config']
}

function resolveRunSettings(collaborators: Collaborators, options: BatchRunOptions | undefined): ResolvedRunSettings {
  if (options?.config === undefined) {
    throw new Error('eval runner: config is required so every new run is self-describing')
  }
  const requested = options.config
  const passK = options.pass_k ?? requested.pass_k
  const concurrency = options.concurrency ?? requested.concurrency
  const maxInfraRetries = options.max_infra_retries ?? requested.max_infra_retries
  const skipHealthGate = options.skip_health_gate ?? requested.skip_health_gate

  assertRecordedSetting('pass_k', passK, requested.pass_k)
  assertRecordedSetting('concurrency', concurrency, requested.concurrency)
  assertRecordedSetting('max_infra_retries', maxInfraRetries, requested.max_infra_retries)
  assertRecordedSetting('skip_health_gate', skipHealthGate, requested.skip_health_gate)
  if (!Number.isInteger(passK) || passK < 1) throw new Error(`eval runner: pass_k must be a positive integer (got ${passK})`)
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error(`eval runner: concurrency must be a positive integer (got ${concurrency})`)
  if (!Number.isInteger(maxInfraRetries) || maxInfraRetries < 0) throw new Error(`eval runner: max_infra_retries must be a non-negative integer (got ${maxInfraRetries})`)

  const hasExecutor = collaborators.executor !== null && collaborators.executor !== undefined
  const hasSqlJudge = collaborators.sqlJudge !== null && collaborators.sqlJudge !== undefined
  const queryWaitSeconds = requested.query_wait_seconds
  assertRecordedSetting('with_query', hasExecutor, requested.with_query)
  assertRecordedSetting('sql_judge', hasSqlJudge, requested.sql_judge)
  if (hasExecutor && (requested.executor_identity === undefined || requested.executor_identity.length === 0)) {
    throw new Error('eval runner: executor_identity is required when with_query is true')
  }
  if (hasExecutor && queryWaitSeconds === undefined) {
    throw new Error('eval runner: query_wait_seconds is required when with_query is true')
  }
  if (hasExecutor && queryWaitSeconds !== undefined && (!Number.isFinite(queryWaitSeconds) || queryWaitSeconds <= 0)) {
    throw new Error(`eval runner: query_wait_seconds must be positive (got ${queryWaitSeconds})`)
  }

  const policy = resolveComparatorPolicy({
    columnSemantics: requested.column_semantics,
    maxStoredRows: requested.max_stored_rows,
  })
  assertRecordedSetting('comparator_policy_version', policy.version, requested.comparator_policy_version)

  return {
    passK,
    concurrency,
    maxInfraRetries,
    skipHealthGate,
    policy,
    config: {
      ...requested,
      pass_k: passK,
      concurrency,
      max_infra_retries: maxInfraRetries,
      skip_health_gate: skipHealthGate,
      comparator_policy_version: policy.version,
      column_semantics: policy.columnSemantics,
      max_stored_rows: policy.maxStoredRows,
    },
  }
}

function assertRecordedSetting(name: string, actual: boolean | number, recorded: boolean | number): void {
  if (actual !== recorded) {
    throw new Error(`eval runner: ${name}=${JSON.stringify(recorded)} in config does not match resolved value ${JSON.stringify(actual)}`)
  }
}

/**
 * Run cases concurrently with a bounded semaphore.
 */
interface LoadedCase {
  readonly evalCase: EvalCase
  readonly sourcePath: string
}

async function runConcurrent(
  cases: LoadedCase[],
  collaborators: Collaborators,
  passK: number,
  maxInfraRetries: number,
  concurrency: number,
  policy: ComparatorPolicy,
  onProgress: ((completed: number, total: number, case_id: string) => void) | null,
): Promise<CaseVerdict[]> {
  const results: (CaseVerdict | undefined)[] = new Array<CaseVerdict | undefined>(cases.length)
  let completed = 0
  let nextIdx = 0

  async function worker(): Promise<void> {
    while (true) {
      const idx = nextIdx++
      if (idx >= cases.length) return
      const loaded = cases[idx]
      if (!loaded) continue
      const { evalCase, sourcePath } = loaded
      const verdict = await runSingleCase(evalCase, sourcePath, collaborators, passK, maxInfraRetries, policy)
      results[idx] = verdict
      completed++
      if (onProgress) {
        onProgress(completed, cases.length, evalCase.case_id)
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, cases.length) }, () => worker())
  await Promise.all(workers)
  return results.filter((v): v is CaseVerdict => v !== undefined)
}

async function runSingleCase(
  evalCase: EvalCase,
  sourcePath: string,
  collaborators: Collaborators,
  passK: number,
  maxInfraRetries: number,
  policy: ComparatorPolicy,
): Promise<CaseVerdict> {
  const started = Date.now()
  const caseProvenance = buildCaseProvenance(evalCase, sourcePath)
  const content = preflightEvalCaseContent(evalCase)
  if (content.status === 'case-defect') {
    return preflightFailure(evalCase.case_id, started, 'case_defect', caseProvenance, { content })
  }

  const referenceSql = await preflightReferenceSql(evalCase, collaborators, policy)
  const preflight: CasePreflightEvidence = { content, reference_sql: referenceSql }
  if (referenceSql.status === 'case-defect') {
    return preflightFailure(evalCase.case_id, started, 'case_defect', caseProvenance, preflight)
  }
  if (referenceSql.status === 'environment-blocked') {
    return preflightFailure(evalCase.case_id, started, 'infra_failure', caseProvenance, preflight)
  }

  const attempts: AttemptResult[] = []
  for (let k = 1; k <= passK; k++) {
    const attempt = await runOneAttempt(evalCase, collaborators, k, maxInfraRetries, policy)
    attempts.push(attempt)
  }

  // pass^k: ALL k attempts must pass (execution + delivery) for the case to be correct
  const verdict = passKVerdict(evalCase, attempts)
  const latencyMs = Date.now() - started

  return {
    case_id: evalCase.case_id,
    pass_k_results: attempts,
    verdict,
    latency_ms: latencyMs,
    caseProvenance,
    preflight,
  }
}

/** Build a case verdict for a preflight failure without fabricating an agent attempt. */
function preflightFailure(
  caseId: string,
  started: number,
  verdict: 'case_defect' | 'infra_failure',
  caseProvenance: CaseProvenance,
  preflight: CasePreflightEvidence,
): CaseVerdict {
  return {
    case_id: caseId,
    pass_k_results: [],
    verdict,
    latency_ms: Date.now() - started,
    caseProvenance,
    preflight,
  }
}


/** Assemble the case-owned evidence once, next to the runner that loaded it. */
function buildCaseProvenance(evalCase: EvalCase, sourcePath: string): CaseProvenance {
  return {
    sourcePath,
    schemaVersion: evalCase.schema_version ?? null,
    scopeId: evalCase.input.scope_id,
    expected: {
      result_value: evalCase.expected.result_value,
      match_mode: evalCase.expected.match_mode,
      ...(evalCase.expected.sql === undefined ? {} : { sql: evalCase.expected.sql }),
      ...(evalCase.expected.behavior === undefined ? {} : { behavior: evalCase.expected.behavior }),
    },
    meta: evalCase.meta ?? null,
    referenceSql: resolveReferenceSql(evalCase),
  }
}

/** Resolve and, when possible, execute the case's own reference SQL before candidate execution. */
async function preflightReferenceSql(
  evalCase: EvalCase,
  collaborators: Collaborators,
  policy: ComparatorPolicy,
): Promise<ReferenceSqlPreflightEvidence> {
  const resolution = resolveReferenceSql(evalCase)
  if (resolution.kind === 'absent') {
    return { status: 'absent', detail: 'case declares no reference SQL' }
  }
  if (resolution.kind === 'unresolvable') {
    return { status: 'case-defect', stage: 'resolution', detail: resolution.detail }
  }

  const resolved = {
    sql: resolution.sql,
    ...(resolution.anchorDs === undefined ? {} : { anchor_ds: resolution.anchorDs }),
    substitutions: resolution.substitutions,
  }
  const executor = collaborators.executor
  if (executor === null || executor === undefined) {
    return {
      status: 'resolved-not-executed',
      stage: 'resolution',
      detail: 'reference SQL resolved; no executor mounted, so only static preflight ran',
      ...resolved,
    }
  }

  let artifact: ExecutionArtifact
  try {
    artifact = await executeAndNormalize(executor, resolution.sql, policy)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    const failureClass = classifyExecutionFailure(detail)
    const isCaseDefect = failureClass === 'syntax_error' || failureClass === 'guard_rejected' || referenceObjectMissing(detail)
    return {
      status: isCaseDefect ? 'case-defect' : 'environment-blocked',
      stage: 'execution',
      detail: `reference SQL execution threw: ${detail}`,
      ...resolved,
    }
  }

  if (artifact.kind !== 'completed') {
    const environmentBlocked = isReferenceEnvironmentFailure(artifact)
    return {
      status: environmentBlocked ? 'environment-blocked' : 'case-defect',
      stage: 'execution',
      detail: `reference SQL did not execute: ${artifact.error ?? 'no error detail'}`,
      execution_artifact: artifact,
      ...resolved,
    }
  }

  const comparison = gradeExecution(artifact, evalCase.expected, policy)
  switch (comparison.outcome) {
    case 'pass':
      return {
        status: 'passed',
        stage: 'comparison',
        detail: 'reference SQL matched the declared expected result',
        execution_artifact: artifact,
        ...resolved,
      }
    case 'fail':
      return {
        status: 'case-defect',
        stage: 'comparison',
        detail: `reference SQL result disagrees with declared expected: ${comparison.detail || 'comparison failed'}`,
        execution_artifact: artifact,
        ...resolved,
      }
    case 'case-defect':
      return {
        status: 'case-defect',
        stage: 'comparison',
        detail: comparison.detail,
        execution_artifact: artifact,
        ...resolved,
      }
    case 'environment-blocked':
    case 'not-measured':
      return {
        status: 'environment-blocked',
        stage: 'comparison',
        detail: comparison.detail,
        execution_artifact: artifact,
        ...resolved,
      }
    default:
      return assertNever(comparison.outcome, 'reference SQL comparison outcome')
  }
}

/** Classify a returned reference-SQL failure without charging it to the candidate model. */
function isReferenceEnvironmentFailure(artifact: ExecutionArtifact): boolean {
  if (artifact.kind === 'pending') return true
  const failureKind = artifact.failureKind?.toLowerCase() ?? ''
  if (['syntax', 'syntax_error', 'invalid_sql', 'semantic', 'guard', 'guard_rejected', 'not_found'].includes(failureKind)) {
    return false
  }
  if ([
    'transport',
    'connectivity',
    'timeout',
    'throttling',
    'throttled',
    'rate_limit',
    'retryable',
    'transient',
    'permission',
    'permission_denied',
  ].includes(failureKind)) {
    return true
  }
  if (referenceObjectMissing(artifact.error ?? '')) return false
  return artifact.failureClass !== null && ENVIRONMENTAL_FAILURE_CLASSES.has(artifact.failureClass)
}

/** Whether an execution error says the case's referenced table or column is absent. */
function referenceObjectMissing(detail: string): boolean {
  return /(?:table|column|field)\b[^\n]*\bnot found\b|cannot be resolved/i.test(detail)
}

/** Reject a future member of a closed union until its policy is defined. */
function assertNever(value: never, subject: string): never {
  throw new Error(`unhandled ${subject}: ${String(value)}`)
}

/**
 * Run one pass_k attempt. The model is sampled once; only SQL execution retries.
 */
async function runOneAttempt(
  evalCase: EvalCase,
  collaborators: Collaborators,
  attemptK: number,
  maxInfraRetries: number,
  policy: ComparatorPolicy,
): Promise<AttemptResult> {
  try {
    const agentResponse = await collaborators.agent.respond(evalCase.input.question, {
      scope_id: evalCase.input.scope_id,
    })
    const result = await executeAttempt(evalCase, agentResponse, collaborators, maxInfraRetries, policy)
    return {
      attempt_k: attemptK,
      execution_outcome: result.executionOutcome,
      execution_detail: result.executionDetail,
      ...(result.executionArtifact === undefined ? {} : { execution_artifact: result.executionArtifact }),
      ...(result.deliveryMatch === undefined ? {} : { delivery_match: result.deliveryMatch }),
      sql_judge: result.sqlJudge,
      generated_sql: result.generatedSql,
      expected_result: result.expectedResult,
    }
  } catch (err) {
    if (isInfraError(err) || classifyInfraFailure(err) !== null) {
      return {
        attempt_k: attemptK,
        infra_error: err instanceof Error ? err.message : String(err),
      }
    }
    return {
      attempt_k: attemptK,
      execution_outcome: 'fail',
      delivery_match: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/** Result from executing one attempt (before wrapping in AttemptResult). */
interface AttemptExecution {
  executionOutcome: ExecutionOutcome
  executionDetail: string
  executionArtifact: ExecutionArtifact | undefined
  deliveryMatch: boolean | undefined
  generatedSql: string | null
  expectedResult: unknown
  sqlJudge?: { score: number; rationale: string; dimensions: Record<string, 0 | 1> } | undefined
}

/**
 * Execute a single attempt: ask the agent, optionally run the SQL, judge.
 *
 * Dual-score policy: when both executor and sqlJudge are available, run both
 * independently. The execution outcome reflects the real query result
 * comparison; `sql_judge` records the LLM semantic verdict alongside it. The
 * judge never writes the execution outcome — an LLM reading SQL text is not a
 * weaker form of executing it, and letting it stand in produced a pass rate
 * 56.4pp above the same cases under real execution.
 */
async function executeAttempt(
  evalCase: EvalCase,
  agentResponse: AgentResponse,
  collaborators: Collaborators,
  maxInfraRetries: number,
  policy: ComparatorPolicy,
): Promise<AttemptExecution> {
  const question = evalCase.input.question

  // Collect diagnostics
  const generatedSql = agentResponse.generated_sql ?? null
  const expectedResult = evalCase.expected.result_value ?? null
  let sqlJudge: AttemptExecution['sqlJudge'] = undefined
  let executionArtifact: ExecutionArtifact | undefined = undefined

  // Determine the execution outcome. A case declaring no EXECUTION expectation
  // is `not-measured`, not a silent pass: the previous initial value of `true`
  // meant 25 DELIVERY-only cases reported an execution match that never ran.
  let executionOutcome: ExecutionOutcome = 'not-measured'
  let executionDetail = 'case declares no EXECUTION expectation'
  if (evalCase.expected.result_value !== null || evalCase.expected.match_mode !== null) {
    if (agentResponse.generated_sql !== null && collaborators.executor !== null && collaborators.executor !== undefined) {
      const sql = agentResponse.generated_sql
      const executor = collaborators.executor
      const { result } = await withInfraRetry(
        () => executeAndNormalize(executor, sql, policy),
        maxInfraRetries,
        undefined,
        classifyReturnedExecutionInfraFailure,
      )
      executionArtifact = result
      const verdict = gradeExecution(executionArtifact, evalCase.expected, policy)
      executionOutcome = verdict.outcome
      executionDetail = verdict.detail

      // Dual-score: also run sql_judge if available (reported, never folded in)
      if (collaborators.sqlJudge) {
        sqlJudge = await runSqlJudge(collaborators.sqlJudge, question, agentResponse)
      }
    } else if (agentResponse.generated_sql !== null && collaborators.sqlJudge) {
      // SQL-only mode: the judge reports, but execution stays unmeasured.
      sqlJudge = await runSqlJudge(collaborators.sqlJudge, question, agentResponse)
      executionOutcome = 'not-measured'
      executionDetail = 'no executor mounted; sql_judge reported separately'
    } else if (agentResponse.generated_sql === null) {
      executionOutcome = 'fail'
      executionDetail = 'agent produced no SQL'
    } else {
      executionOutcome = 'not-measured'
      executionDetail = 'no executor mounted'
    }
  }

  // Determine delivery match
  let deliveryMatch: boolean | undefined = undefined
  if (evalCase.expected.answer !== null) {
    if (collaborators.judge) {
      const judgeResult = await collaborators.judge.judge(
        evalCase.expected.answer,
        agentResponse.reply,
        question,
      )
      deliveryMatch = judgeResult.score >= JUDGE_PASS_THRESHOLD
    } else {
      const expectedAnswer = evalCase.expected.answer
      deliveryMatch = typeof expectedAnswer === 'string'
        ? expectedAnswer === agentResponse.reply
        : JSON.stringify(expectedAnswer) === agentResponse.reply
    }
  }

  return { executionOutcome, executionDetail, executionArtifact, deliveryMatch, generatedSql, expectedResult, sqlJudge }
}

/**
 * Run the SQL semantic judge for one attempt.
 * @param sqlJudge - the injected SQL semantic judge.
 * @param question - the case question.
 * @param agentResponse - the agent's response, whose `generated_sql` is judged.
 * @returns the judge verdict.
 */
async function runSqlJudge(
  sqlJudge: NonNullable<Collaborators['sqlJudge']>,
  question: string,
  agentResponse: { generated_sql: string | null; schema_context?: string; transcript?: unknown[] },
): Promise<SqlJudgeVerdict> {
  const schemaContext = agentResponse.schema_context ?? extractSchemaContext(agentResponse.transcript)
  const judgeResult = await sqlJudge.judgeSql({
    question,
    generated_sql: agentResponse.generated_sql ?? '',
    schema_context: schemaContext,
  })
  return toSqlJudgeVerdict(
    judgeResult.score,
    judgeResult.rationale || judgeResult.error || '',
    judgeResult.dimensions ?? {},
  )
}

/**
 * Extract schema context from the agent response transcript (trace).
 * The trace includes a 'retrieve' step with candidate table descriptions.
 */
function toSqlJudgeVerdict(score: number, rationale: string, dims: object): SqlJudgeVerdict {
  const dimensions: Record<string, 0 | 1> = {}
  for (const [k, v] of Object.entries(dims)) {
    dimensions[k] = (typeof v === 'number' && v >= 0.5 ? 1 : 0)
  }
  return { score, rationale, dimensions }
}

function extractSchemaContext(transcript: unknown[] | undefined): string {
  if (!transcript || !Array.isArray(transcript)) return '(no schema context available)'

  const retrieveStep = transcript.find(
    (entry): entry is Record<string, unknown> =>
      typeof entry === 'object' && entry !== null && (entry as Record<string, unknown>).step === 'bm25_linking',
  )

  if (!retrieveStep) return '(no schema context available)'

  const candidates = retrieveStep.candidates as Array<{ id: string; score?: string }> | undefined
  if (!candidates || candidates.length === 0) return '(no candidates retrieved)'

  return candidates.map(c => `- ${c.id} (relevance: ${c.score ?? '?'})`).join('\n')
}

/**
 * pass^k verdict (anti-flakiness): ALL k attempts must pass for 'correct'.
 * A case that passes once but fails otherwise is NOT correct — pass^k exists
 * to surface exactly that flakiness, which best-of-k would hide.
 *
 * The three excluded outcomes are checked before `wrong` so that neither a
 * broken environment nor a broken case is charged to the model:
 * `case_defect` first (it must be fixed, and rerunning cannot help), then
 * `infra_failure`, then `unjudged` for a case execution never measured.
 */
function passKVerdict(evalCase: EvalCase, attempts: AttemptResult[]): RunnerVerdict {
  if (attempts.some(a => a.execution_outcome === 'case-defect')) return 'case_defect'

  const requiresExecution = evalCase.expected.result_value !== null && evalCase.expected.match_mode !== null
  const requiresDelivery = evalCase.expected.answer !== null
  if (attempts.some(a => a.infra_error !== undefined || (requiresExecution && a.execution_outcome === 'environment-blocked'))) {
    return 'infra_failure'
  }

  if (attempts.some(a =>
    (requiresExecution && (a.execution_outcome === undefined || a.execution_outcome === 'not-measured')) ||
    (requiresDelivery && a.delivery_match === undefined),
  )) {
    return 'unjudged'
  }

  const allCorrect = attempts.every(a =>
    (!requiresExecution || a.execution_outcome === 'pass') &&
    (!requiresDelivery || a.delivery_match === true),
  )
  return allCorrect ? 'correct' : 'wrong'
}

/**
 * Compute summary statistics from case verdicts. `pass_rate` divides by the
 * cases that actually measured the model: a broken environment or a broken case
 * leaves the denominator rather than counting against it.
 */
function computeSummary(verdicts: CaseVerdict[]): RunSummary {
  const total = verdicts.length
  let correct = 0
  let wrong = 0
  let declined = 0
  let unjudged = 0
  let infraFailure = 0
  let caseDefect = 0

  for (const v of verdicts) {
    switch (v.verdict) {
      case 'correct': correct++; break
      case 'wrong': wrong++; break
      case 'declined': declined++; break
      case 'unjudged': unjudged++; break
      case 'infra_failure': infraFailure++; break
      case 'case_defect': caseDefect++; break
    }
  }

  const attributable = correct + wrong + declined
  return {
    total,
    correct,
    wrong,
    declined,
    unjudged,
    infra_failure: infraFailure,
    case_defect: caseDefect,
    pass_rate: attributable > 0 ? correct / attributable : 0,
  }
}

function classifyReturnedExecutionInfraFailure(result: ExecutionArtifact): { kind: 'connectivity' | 'timeout' | 'rate_limit' | 'transient'; error: string } | null {
  if (result.kind === 'completed') return null
  const artifact = result
  const failureKind = artifact.failureKind?.toLowerCase() ?? ''
  const error = artifact.error ?? 'query execution returned an infrastructure failure'

  if (failureKind === 'transport' || failureKind === 'connectivity') return { kind: 'connectivity', error }
  if (failureKind === 'timeout') return { kind: 'timeout', error }
  if (failureKind === 'throttling' || failureKind === 'throttled' || failureKind === 'rate_limit') {
    return { kind: 'rate_limit', error }
  }
  if (failureKind === 'retryable' || failureKind === 'transient') return { kind: 'transient', error }

  if (artifact.kind !== 'pending' && artifact.failureClass !== 'infrastructure' && artifact.failureClass !== 'timeout' && artifact.failureClass !== 'patience') return null
  const inferred = classifyInfraFailure(error)
  return inferred === null ? null : { kind: inferred, error }
}
