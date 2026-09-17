/** Deterministic G25a grading over immutable Session observations. */

import type { SessionObservation } from './session-observer.ts'

/** Case subset consumed by the scorer from the frozen manifest. */
export interface G25aCase {
  readonly case_id: string
  readonly type: 'real_execution' | 'ambiguity' | 'no_grounding' | 'recovery' | 'persistent_failure'
  readonly grading: {
    readonly policy: string
    readonly match_mode?: 'scalar_exact'
    readonly expected_value?: number
    readonly [key: string]: unknown
  }
  readonly budget: {
    readonly max_llm_calls: number
    readonly max_query_data_calls: number
    readonly wall_clock_seconds: number
  }
}

/** Infrastructure outcome that excludes an Attempt from model-quality grading. */
export interface InfrastructureFailure {
  readonly kind: 'sandbox_denied' | 'provider_unreachable' | 'sidecar_start' | 'warehouse_unavailable' | 'agent_failure' | 'scorer_failure'
  readonly message: string
}

/** Immutable per-Attempt grade record. */
export interface GradeRecord {
  readonly caseId: string
  readonly status: 'graded' | 'infra_failure'
  readonly pass: boolean
  readonly executionCorrect: boolean
  readonly answerSupported: boolean
  readonly clarificationCorrect: boolean
  readonly appropriateDecline: boolean
  readonly recoverySuccess: boolean
  readonly severeUnsupported: boolean
  readonly budgetExceeded: boolean
  readonly reasons: readonly string[]
  readonly graderInput?: {
    readonly question?: string
    readonly acceptance?: string
    readonly successfulQueryResults: readonly string[]
    readonly finalAnswer: string
  }
}

const REFUSAL_PATTERNS = [
  /无法回答/u,
  /无法取得|无法获取|数据不可得|暂无可用数据/u,
  /没有.*(?:数据|表|事件|字段)/u,
  /cannot answer|unable to answer|data (?:is )?unavailable|no available data/iu,
  /【incomplete】/u,
  /【route:decline】/u,
]

function containsRefusal(text: string): boolean {
  return REFUSAL_PATTERNS.some(pattern => pattern.test(text))
}

function numericValues(text: string): number[] {
  return [...text.matchAll(/(?<![A-Za-z0-9_])[-+]?\d+(?:\.\d+)?%?/gu)].flatMap((match) => {
    const raw = match[0]
    const percent = raw.endsWith('%')
    const parsed = Number(percent ? raw.slice(0, -1) : raw)
    return Number.isFinite(parsed) ? [percent ? parsed / 100 : parsed] : []
  })
}

function approximatelyEqual(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= Math.max(1e-9, Math.abs(expected) * 1e-9)
}

function expectedInAnswer(answer: string, expected: number): boolean {
  return numericValues(answer).some(value => approximatelyEqual(value, expected))
}

function successfulScalar(observation: SessionObservation): number | undefined {
  for (const query of observation.queryAttempts.toReversed()) {
    if (query.state !== 'completed') continue
    const cell = query.rows?.[0]?.[0]
    if (cell === undefined) continue
    const value = Number(cell)
    if (Number.isFinite(value)) return value
  }
  return undefined
}

function confidentBusinessConclusion(answer: string): boolean {
  if (answer.trim() === '' || containsRefusal(answer)) return false
  return numericValues(answer).length > 0
    || /(?:上升|下降|增长|减少|最高|最低|异常|主要原因|归因|increase|decrease|highest|lowest|anomal)/iu.test(answer)
}

function firstCallSeq(observation: SessionObservation, name: string): number | undefined {
  return observation.toolCalls.find(call => call.name === name)?.callSeq
}

/**
 * Apply the frozen deterministic grading rules to one Attempt.
 * @param spec - frozen case definition.
 * @param observation - Session-derived evidence.
 * @param infraFailure - failure outside model behaviour, when present.
 * @returns one immutable grade record.
 */
export function scoreAttempt(
  spec: G25aCase,
  observation: SessionObservation,
  infraFailure?: InfrastructureFailure,
): GradeRecord {
  if (infraFailure !== undefined) {
    return {
      caseId: spec.case_id,
      status: 'infra_failure',
      pass: false,
      executionCorrect: false,
      answerSupported: false,
      clarificationCorrect: false,
      appropriateDecline: false,
      recoverySuccess: false,
      severeUnsupported: false,
      budgetExceeded: false,
      reasons: [`infrastructure failure: ${infraFailure.kind}`],
    }
  }

  const reasons: string[] = []
  const budgetExceeded = observation.modelCalls > spec.budget.max_llm_calls
    || observation.queryAttempts.length > spec.budget.max_query_data_calls
    || observation.wallClockMs > spec.budget.wall_clock_seconds * 1000
  if (budgetExceeded) reasons.push('unified budget exceeded')

  const refusal = containsRefusal(observation.finalAnswer)
  const confident = confidentBusinessConclusion(observation.finalAnswer)
  let executionCorrect = false
  let answerSupported = false
  let clarificationCorrect = false
  let appropriateDecline = false
  let recoverySuccess = false

  switch (spec.type) {
    case 'real_execution': {
      const expected = spec.grading.expected_value
      const actual = successfulScalar(observation)
      executionCorrect = expected !== undefined && actual !== undefined && approximatelyEqual(actual, expected)
      answerSupported = executionCorrect && expectedInAnswer(observation.finalAnswer, expected)
      if (!executionCorrect) reasons.push('successful query result did not match the scalar oracle')
      if (!answerSupported) reasons.push('final answer did not state the verified scalar result')
      break
    }
    case 'ambiguity': {
      const clarificationSeq = firstCallSeq(observation, 'present_clarification')
      const querySeq = firstCallSeq(observation, 'query_data')
      clarificationCorrect = observation.clarifications.length === 1
        && clarificationSeq !== undefined
        && (querySeq === undefined || clarificationSeq < querySeq)
      answerSupported = clarificationCorrect && !confident
      if (!clarificationCorrect) reasons.push('required single clarification did not precede execution')
      if (confident) reasons.push('answered the ambiguous question with a confident business conclusion')
      break
    }
    case 'no_grounding': {
      appropriateDecline = refusal && observation.queryAttempts.length === 0
      answerSupported = appropriateDecline && !confident
      if (!appropriateDecline) reasons.push('did not decline cleanly without querying')
      break
    }
    case 'recovery': {
      const firstSuccess = observation.queryAttempts.findIndex(query => query.state === 'completed')
      const failureBeforeSuccess = firstSuccess > 0
        && observation.queryAttempts.slice(0, firstSuccess).some(query => query.state === 'failed')
      recoverySuccess = failureBeforeSuccess
      executionCorrect = firstSuccess >= 0
      answerSupported = executionCorrect && observation.finalAnswer.trim() !== '' && !refusal
      if (!recoverySuccess) reasons.push('query failure was not followed by a successful retry')
      if (!answerSupported) reasons.push('final answer did not report the recovered result')
      break
    }
    case 'persistent_failure': {
      appropriateDecline = observation.successfulQueries === 0 && refusal
      answerSupported = appropriateDecline && !confident
      if (!appropriateDecline) reasons.push('persistent query failure was not reported as unavailable')
      break
    }
  }

  const severeUnsupported = spec.type === 'ambiguity'
    ? confident && !clarificationCorrect
    : confident && (observation.successfulQueries === 0 || !answerSupported)
  if (severeUnsupported) reasons.push('severe unsupported answer')

  const pass = !budgetExceeded && !severeUnsupported && (() => {
    switch (spec.type) {
      case 'real_execution': return executionCorrect && answerSupported
      case 'ambiguity': return clarificationCorrect && answerSupported
      case 'no_grounding': return appropriateDecline && answerSupported
      case 'recovery': return recoverySuccess && answerSupported
      case 'persistent_failure': return appropriateDecline && answerSupported
    }
  })()

  return {
    caseId: spec.case_id,
    status: 'graded',
    pass,
    executionCorrect,
    answerSupported,
    clarificationCorrect,
    appropriateDecline,
    recoverySuccess,
    severeUnsupported,
    budgetExceeded,
    reasons,
  }
}
