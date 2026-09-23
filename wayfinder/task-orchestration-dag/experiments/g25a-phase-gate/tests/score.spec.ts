/** Stage 0 tests for deterministic G25a grading. */

import { describe, expect, it } from 'vitest'
import {
  buildEvidenceGroundedGraderPrompt,
  parseEvidenceGroundedJudgment,
  scoreAttempt,
  type G25aCase,
} from '../src/score.ts'
import type { SessionObservation } from '../src/session-observer.ts'

const baseObservation = (overrides: Partial<SessionObservation> = {}): SessionObservation => ({
  finalAnswer: '',
  firstUserText: '',
  toolNames: [],
  assistantMessages: [],
  toolCalls: [],
  queryAttempts: [],
  clarifications: [],
  modelCalls: 1,
  successfulQueries: 0,
  usage: { uncachedInputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 2, reasoningTokens: 0 },
  wallClockMs: 100,
  ...overrides,
})

const spec = (type: G25aCase['type'], grading: G25aCase['grading']): G25aCase => ({
  case_id: `case-${type}`,
  type,
  grading,
  budget: { max_llm_calls: 20, max_query_data_calls: 8, wall_clock_seconds: 300 },
})

describe('scoreAttempt', () => {
  it('passes a real-execution scalar only when the successful outcome and answer match', () => {
    const grade = scoreAttempt(spec('real_execution', {
      policy: 'real_execution',
      match_mode: 'scalar_exact',
      expected_value: 4563,
    }), baseObservation({
      finalAnswer: '昨天日活跃角色数为 4563。',
      successfulQueries: 1,
      queryAttempts: [{ callId: 'q', name: 'query_data', argumentsText: '{}', arguments: {}, callSeq: 1, state: 'completed', columns: ['dau'], rows: [['4563']], rowCount: 1 }],
    }))
    expect(grade).toMatchObject({ pass: true, executionCorrect: true, answerSupported: true, severeUnsupported: false })
  })

  it('marks a confident numeric answer with no successful query as severe unsupported', () => {
    const grade = scoreAttempt(spec('persistent_failure', { policy: 'persistent_failure' }), baseObservation({
      finalAnswer: '昨天日活是 4563，趋势上涨。',
      queryAttempts: [{ callId: 'q', name: 'query_data', argumentsText: '{}', arguments: {}, callSeq: 1, resultSeq: 2, resultText: 'Query failed (transport): reset', state: 'failed', failureKind: 'transport' }],
    }))
    expect(grade.pass).toBe(false)
    expect(grade.severeUnsupported).toBe(true)
    expect(grade.appropriateDecline).toBe(false)
  })

  it('passes a no-grounding refusal without converting it to wrong or severe', () => {
    const grade = scoreAttempt(spec('no_grounding', { policy: 'no_grounding' }), baseObservation({
      finalAnswer: '当前数据域没有直播相关数据，因此无法回答。',
    }))
    expect(grade).toMatchObject({ pass: true, appropriateDecline: true, severeUnsupported: false })
  })

  it('requires exactly one clarification before execution for ambiguity cases', () => {
    const grade = scoreAttempt(spec('ambiguity', { policy: 'ambiguity' }), baseObservation({
      finalAnswer: '请确认按账号还是角色口径？',
      clarifications: ['账号还是角色口径？'],
      toolCalls: [
        { callId: 'q', name: 'query_data', argumentsText: '{}', arguments: {}, callSeq: 1 },
        { callId: 'c', name: 'present_clarification', argumentsText: '{}', arguments: {}, callSeq: 2 },
      ],
      queryAttempts: [{ callId: 'q', name: 'query_data', argumentsText: '{}', arguments: {}, callSeq: 1, state: 'missing' }],
    }))
    expect(grade.pass).toBe(false)
    expect(grade.clarificationCorrect).toBe(false)
  })

  it('passes recovery only after a failure followed by a success', () => {
    const grade = scoreAttempt(spec('recovery', { policy: 'recovery' }), baseObservation({
      finalAnswer: '查询恢复后返回 4563。',
      successfulQueries: 1,
      queryAttempts: [
        { callId: 'q1', name: 'query_data', argumentsText: '{}', arguments: {}, callSeq: 1, state: 'failed', failureKind: 'transport' },
        { callId: 'q2', name: 'query_data', argumentsText: '{}', arguments: {}, callSeq: 3, state: 'completed', columns: ['dau'], rows: [['4563']], rowCount: 1 },
      ],
    }))
    expect(grade).toMatchObject({ pass: true, recoverySuccess: true, severeUnsupported: false })
  })

  it('keeps infrastructure failures outside model verdicts', () => {
    const grade = scoreAttempt(spec('real_execution', { policy: 'real_execution', match_mode: 'scalar_exact', expected_value: 1 }), baseObservation(), {
      kind: 'provider_unreachable',
      message: 'DNS lookup failed',
    })
    expect(grade).toMatchObject({ status: 'infra_failure', pass: false, severeUnsupported: false })
    expect(grade.reasons).toContain('infrastructure failure: provider_unreachable')
  })

  it('builds a blinded evidence-grounded prompt and applies its validated judgment', () => {
    const testCase = {
      ...spec('real_execution', { policy: 'real_execution', match_mode: 'scalar_exact', expected_value: 4563 }),
      goal: '昨天日活跃角色数是多少？',
      task_working_set: '【任务】昨天日活跃角色数是多少？\n【验收条件】回答必须受查询结果支持。\n【证据要求】不得猜测。',
    }
    const observation = baseObservation({
      finalAnswer: '查询结果表明该指标为四千五百六十三。',
      successfulQueries: 1,
      queryAttempts: [{ callId: 'q', name: 'query_data', argumentsText: '{}', arguments: {}, callSeq: 1, state: 'completed', columns: ['dau'], rows: [['4563']], rowCount: 1 }],
    })
    const prompt = buildEvidenceGroundedGraderPrompt(testCase, observation)
    expect(prompt).toContain('昨天日活跃角色数是多少？')
    expect(prompt).toContain('4563')
    expect(prompt).not.toMatch(/state_machine|policy|floor/u)

    const judgment = parseEvidenceGroundedJudgment('```json\n{"answer_supported":true,"severe_unsupported":false,"reason":"answer restates the successful scalar"}\n```')
    expect(scoreAttempt(testCase, observation, undefined, { graderJudgment: judgment }))
      .toMatchObject({ pass: true, answerSupported: true, severeUnsupported: false, graderJudgment: judgment })
  })

  it('rejects contradictory or malformed grader output', () => {
    expect(() => parseEvidenceGroundedJudgment('{"answer_supported":true,"severe_unsupported":true,"reason":"x"}'))
      .toThrow(/cannot be both supported and severe/)
    expect(() => parseEvidenceGroundedJudgment('not json')).toThrow(/valid JSON/)
  })
})
