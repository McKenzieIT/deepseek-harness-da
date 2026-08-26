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
import { loadCases, checkResultMatch as coreCheckResultMatch } from '@deepseek-ai/dsh-eval'
import type { EvalCase } from '@deepseek-ai/dsh-eval'
import type { Collaborators } from './collaborators.ts'
import type {
  BatchRunOptions,
  RunResult,
  RunSummary,
  CaseVerdict,
  RunnerVerdict,
  AttemptResult,
} from './types.ts'
import { runHealthGate } from './health_gate.ts'
import { withInfraRetry, isInfraError } from './infra_retry.ts'
import { writeRunResult } from './persistence.ts'

/** Default pass_k: number of attempts per case. */
const DEFAULT_PASS_K = 3

/** Default max infra retries per attempt. */
const DEFAULT_MAX_INFRA_RETRIES = 2

/** Threshold for SQL semantic judge to pass (3/5 dimensions = 0.6). */
const SQL_JUDGE_PASS_THRESHOLD = 0.6

/**
 * Run a batch of eval cases.
 *
 * For each case, runs pass_k attempts; verdict = best-of-k (any pass = correct).
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
      const caseVerdict = await runSingleCase(evalCase, collaborators, passK, maxInfraRetries)
      verdicts.push(caseVerdict)
      if (onProgress) {
        onProgress(i + 1, cases.length, evalCase.case_id)
      }
    }
  } else {
    verdicts = await runConcurrent(cases, collaborators, passK, maxInfraRetries, concurrency, onProgress)
  }

  // Compute summary
  const summary = computeSummary(verdicts)

  const result: RunResult = {
    run_id: runId,
    timestamp: new Date().toISOString(),
    cases: verdicts,
    summary,
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
  onProgress: ((completed: number, total: number, case_id: string) => void) | null,
): Promise<CaseVerdict[]> {
  const results: CaseVerdict[] = new Array(cases.length)
  let completed = 0
  let nextIdx = 0

  async function worker(): Promise<void> {
    while (true) {
      const idx = nextIdx++
      if (idx >= cases.length) return
      const evalCase = cases[idx]
      if (!evalCase) continue
      const verdict = await runSingleCase(evalCase, collaborators, passK, maxInfraRetries)
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
): Promise<CaseVerdict> {
  const started = Date.now()
  const attempts: AttemptResult[] = []

  for (let k = 1; k <= passK; k++) {
    const attempt = await runOneAttempt(evalCase, collaborators, k, maxInfraRetries)
    attempts.push(attempt)
  }

  // Best-of-k: if any attempt passed (execution + delivery), case is correct
  const verdict = bestOfKVerdict(attempts)
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
): Promise<AttemptResult> {
  try {
    const { result } = await withInfraRetry(
      () => executeAttempt(evalCase, collaborators),
      maxInfraRetries,
    )
    return {
      attempt_k: attemptK,
      execution_match: result.executionMatch,
      delivery_match: result.deliveryMatch,
      generated_sql: result.generatedSql,
      query_result: result.queryResult,
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
      execution_match: false,
      delivery_match: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/** Result from executing one attempt (before wrapping in AttemptResult). */
interface AttemptExecution {
  executionMatch: boolean
  deliveryMatch: boolean
  generatedSql: string | null
  queryResult: unknown[] | null
  expectedResult: unknown
}

/**
 * Execute a single attempt: ask the agent, optionally run the SQL, judge.
 */
async function executeAttempt(evalCase: EvalCase, collaborators: Collaborators): Promise<AttemptExecution> {
  const question = evalCase.input.question

  // Ask the agent
  const agentResponse = await collaborators.agent.respond(question, {
    scope_id: evalCase.input.scope_id,
  })

  // Collect diagnostics
  const generatedSql = agentResponse.generated_sql ?? null
  let queryResult: unknown[] | null = null
  const expectedResult = evalCase.expected.result_value ?? null

  // Determine execution match
  let executionMatch = true
  if (evalCase.expected.result_value !== null && evalCase.expected.match_mode !== null) {
    if (agentResponse.generated_sql && collaborators.executor) {
      const execResult = await collaborators.executor.execute(agentResponse.generated_sql)
      if (!execResult.success) {
        executionMatch = false
        queryResult = [{ _error: execResult.error ?? 'execution failed' }] as unknown as unknown[]
      } else {
        queryResult = execResult.rows?.slice(0, 5) ?? null
        const matchMode = evalCase.expected.match_mode ?? undefined
        const expectedRv = evalCase.expected.result_value as Record<string, unknown>
        executionMatch = checkResultMatch(execResult.rows ?? [], expectedRv, matchMode)
      }
    } else if (agentResponse.generated_sql && !collaborators.executor) {
      if (collaborators.sqlJudge) {
        const schemaContext = agentResponse.schema_context ?? extractSchemaContext(agentResponse.transcript)
        const judgeResult = await collaborators.sqlJudge.judgeSql({
          question,
          generated_sql: agentResponse.generated_sql,
          schema_context: schemaContext,
        })
        executionMatch = judgeResult.score >= SQL_JUDGE_PASS_THRESHOLD
      } else {
        executionMatch = true
      }
    } else {
      executionMatch = false
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
      deliveryMatch = judgeResult.score >= 0.6
    } else {
      deliveryMatch = String(evalCase.expected.answer) === agentResponse.reply
    }
  }

  return { executionMatch, deliveryMatch, generatedSql, queryResult, expectedResult }
}

/**
 * Extract schema context from the agent response transcript (trace).
 * The trace includes a 'retrieve' step with candidate table descriptions.
 */
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
 * Value-only result match: compare scalar values from the first actual row against expected
 * values, ignoring column names (aliases vary between models/SQL dialects). Uses 1:1
 * consumption to prevent the same actual value from satisfying multiple expected values.
 */
function checkResultMatch(actualRows: unknown[], expected: Record<string, unknown>, matchMode?: string): boolean {
  if (!matchMode) return actualRows.length > 0
  const normalizedRows = actualRows.map((r) => {
    if (Array.isArray(r)) {
      const obj: Record<string, unknown> = {}
      for (let i = 0; i < r.length; i++) obj[`col${i}`] = r[i]
      return obj
    }
    return r as Record<string, unknown>
  })
  const result = coreCheckResultMatch(expected, normalizedRows, matchMode)
  return result.status === 'pass'
}

/**
 * Best-of-k verdict: any passing attempt means 'correct'.
 * All infra failures → 'infra_failure'.
 * Otherwise derive from attempt results.
 */
function bestOfKVerdict(attempts: AttemptResult[]): RunnerVerdict {
  const anyCorrect = attempts.some(a =>
    a.infra_error === undefined && a.execution_match !== false && a.delivery_match !== false,
  )
  if (anyCorrect) return 'correct'

  const allInfra = attempts.every(a => a.infra_error !== undefined)
  if (allInfra) return 'infra_failure'

  const hasWrong = attempts.some(a => a.execution_match === false || a.delivery_match === false)
  if (hasWrong) return 'wrong'

  return 'unjudged'
}

/**
 * Compute summary statistics from case verdicts.
 */
function computeSummary(verdicts: CaseVerdict[]): RunSummary {
  const total = verdicts.length
  let correct = 0
  let wrong = 0
  let declined = 0
  let unjudged = 0
  let infraFailure = 0

  for (const v of verdicts) {
    switch (v.verdict) {
      case 'correct': correct++; break
      case 'wrong': wrong++; break
      case 'declined': declined++; break
      case 'unjudged': unjudged++; break
      case 'infra_failure': infraFailure++; break
    }
  }

  return {
    total,
    correct,
    wrong,
    declined,
    unjudged,
    infra_failure: infraFailure,
    pass_rate: total > 0 ? correct / total : 0,
  }
}
