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
import { loadCases, executeAndNormalize, gradeExecution, resolveComparatorPolicy, JUDGE_PASS_THRESHOLD } from '@deepseek-ai/dsh-eval'
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
} from './types.ts'
import { runHealthGate } from './health_gate.ts'
import { withInfraRetry, isInfraError } from './infra_retry.ts'
import { writeRunResult } from './persistence.ts'

/** Default pass_k: number of attempts per case. */
const DEFAULT_PASS_K = 3

/** Default max infra retries per attempt. */
const DEFAULT_MAX_INFRA_RETRIES = 2

/**
 * Rows an execution artifact stores when the caller names no policy. The
 * digests always cover the full result, so this bounds artifact size without
 * making a verdict unreproducible — unlike the previous 5-row evidence cut,
 * which could not re-derive a `row_count_range` decision.
 */
const DEFAULT_MAX_STORED_ROWS = 200

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
export async function runBatch(casePaths: string[], collaborators: Collaborators, options?: BatchRunOptions): Promise<RunResult> {
  const runId = options?.run_id ?? randomUUID()
  const passK = options?.pass_k ?? DEFAULT_PASS_K
  const maxInfraRetries = options?.max_infra_retries ?? DEFAULT_MAX_INFRA_RETRIES
  const skipHealthGate = options?.skip_health_gate ?? false
  const outputPath = options?.output_path ?? null
  const concurrency = options?.concurrency ?? 1
  const onProgress = options?.on_progress ?? null
  // Resolved once per batch, so every case in it is graded under one policy and
  // the run records which. The run config is the single source: the same object
  // is persisted, so the policy graded under and the policy reported cannot
  // disagree. A batch never mixes two.
  const policy = resolveComparatorPolicy({
    columnSemantics: options?.config?.column_semantics ?? 'by-name',
    maxStoredRows: options?.config?.max_stored_rows ?? DEFAULT_MAX_STORED_ROWS,
  })

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
  const cases = loadCases(casePaths)

  // Drive each case (serial when concurrency=1, parallel otherwise)
  let verdicts: CaseVerdict[]
  if (concurrency <= 1) {
    verdicts = []
    for (let i = 0; i < cases.length; i++) {
      const evalCase = cases[i]
      if (!evalCase) continue
      const caseVerdict = await runSingleCase(evalCase, collaborators, passK, maxInfraRetries, policy)
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

  const result: RunResult = {
    run_id: runId,
    timestamp: new Date().toISOString(),
    cases: verdicts,
    summary,
    // GA-EVAL-REBASELINE item 4: stamp the run's protocol/semantics/concurrency/
    // model onto the artifact so a contaminated/mis-attributed run is detectable
    // from its JSON alone. Optional — legacy callers without a config leave this
    // undefined (the artifact is then non-self-describing, matching pre-item-4
    // behavior). `writeRunResult` JSON.stringifies the whole RunResult, so this
    // persists automatically.
    ...(options?.config !== undefined ? { config: options.config } : {}),
  }

  // Persist if output path given
  if (outputPath) {
    writeRunResult(result, outputPath)
  }

  return result
}

/**
 * Run cases concurrently with a bounded semaphore.
 */
async function runConcurrent(
  cases: EvalCase[],
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
      const evalCase = cases[idx]
      if (!evalCase) continue
      const verdict = await runSingleCase(evalCase, collaborators, passK, maxInfraRetries, policy)
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
  collaborators: Collaborators,
  passK: number,
  maxInfraRetries: number,
  policy: ComparatorPolicy,
): Promise<CaseVerdict> {
  const started = Date.now()
  const attempts: AttemptResult[] = []

  for (let k = 1; k <= passK; k++) {
    const attempt = await runOneAttempt(evalCase, collaborators, k, maxInfraRetries, policy)
    attempts.push(attempt)
  }

  // pass^k: ALL k attempts must pass (execution + delivery) for the case to be correct
  const verdict = passKVerdict(attempts)
  const latencyMs = Date.now() - started

  return {
    case_id: evalCase.case_id,
    pass_k_results: attempts,
    verdict,
    latency_ms: latencyMs,
  }
}

/**
 * Run one pass_k attempt with infra retry wrapping.
 */
async function runOneAttempt(
  evalCase: EvalCase,
  collaborators: Collaborators,
  attemptK: number,
  maxInfraRetries: number,
  policy: ComparatorPolicy,
): Promise<AttemptResult> {
  try {
    const { result } = await withInfraRetry(
      () => executeAttempt(evalCase, collaborators, policy),
      maxInfraRetries,
    )
    return {
      attempt_k: attemptK,
      execution_outcome: result.executionOutcome,
      execution_detail: result.executionDetail,
      ...(result.executionArtifact === undefined ? {} : { execution_artifact: result.executionArtifact }),
      delivery_match: result.deliveryMatch,
      sql_judge: result.sqlJudge,
      generated_sql: result.generatedSql,
      expected_result: result.expectedResult,
    }
  } catch (err) {
    if (isInfraError(err)) {
      return {
        attempt_k: attemptK,
        infra_error: err.message,
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
  deliveryMatch: boolean
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
async function executeAttempt(evalCase: EvalCase, collaborators: Collaborators, policy: ComparatorPolicy): Promise<AttemptExecution> {
  const question = evalCase.input.question

  // Ask the agent
  const agentResponse = await collaborators.agent.respond(question, {
    scope_id: evalCase.input.scope_id,
  })

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
      executionArtifact = await executeAndNormalize(collaborators.executor, agentResponse.generated_sql, policy)
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
  let deliveryMatch = true
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
function passKVerdict(attempts: AttemptResult[]): RunnerVerdict {
  if (attempts.some(a => a.execution_outcome === 'case-defect')) return 'case_defect'

  const allInfra = attempts.every(a => a.infra_error !== undefined || a.execution_outcome === 'environment-blocked')
  if (allInfra) return 'infra_failure'

  const allCorrect = attempts.every(a =>
    a.infra_error === undefined && a.execution_outcome !== 'fail' && a.delivery_match !== false,
  )
  if (allCorrect) {
    // Nothing was measured and nothing was judged: not a pass.
    const measured = attempts.some(a => a.execution_outcome === 'pass' || a.delivery_match === true)
    return measured ? 'correct' : 'unjudged'
  }

  const hasWrong = attempts.some(a => a.execution_outcome === 'fail' || a.delivery_match === false)
  if (hasWrong) return 'wrong'

  return 'unjudged'
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
  const declined = 0
  let unjudged = 0
  let infraFailure = 0
  let caseDefect = 0

  for (const v of verdicts) {
    switch (v.verdict) {
      case 'correct': correct++; break
      case 'wrong': wrong++; break
      case 'declined': break
      case 'unjudged': unjudged++; break
      case 'infra_failure': infraFailure++; break
      case 'case_defect': caseDefect++; break
    }
  }

  const attributable = total - infraFailure - caseDefect
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
