/**
 * Stub/mock collaborators for testing and dry-run mode. These return fixture
 * data and are used when the real collaborators are not available (no live
 * agent, no warehouse, no judge endpoint).
 *
 * @module @deepseek-ai/dsh-eval-runner/stubs
 */

import type { QueryOutcomeView } from '@deepseek-ai/dsh-eval'
import type { AgentResponder, AgentResponse, AgentRespondOpts, QueryExecutor, JudgeExecutor, JudgeResult } from './types.ts'

/**
 * A stub agent responder that echoes the question back as the reply.
 * Useful for testing the runner harness without a real agent.
 */
export class StubAgentResponder implements AgentResponder {
  private readonly _replies: Map<string, AgentResponse> = new Map()
  private _defaultReply: AgentResponse = { reply: 'stub response', generated_sql: null }
  /** StubAgentResponder.calls */
  readonly calls: Array<{ question: string; opts?: AgentRespondOpts | undefined }> = []

  /**
   *  Set a canned response for a specific question (substring match).
   * @param questionSubstring - questionSubstring
   * @param response - response
   */
  setReply(questionSubstring: string, response: AgentResponse): void {
    this._replies.set(questionSubstring, response)
  }

  /**
   *  Set the default response for unmatched questions.
   * @param response - response
   */
  setDefaultReply(response: AgentResponse): void {
    this._defaultReply = response
  }

  // oxlint-disable-next-line typescript/require-await -- async for interface conformance, returns Promise<AgentResponse>
  async respond(question: string, opts?: AgentRespondOpts): Promise<AgentResponse> {
    this.calls.push({ question, opts })
    for (const [substring, response] of this._replies) {
      if (question.includes(substring)) return response
    }
    return this._defaultReply
  }
}

/**
 * A stub query executor that returns a configurable outcome.
 * Useful for testing without a real warehouse.
 */
export class StubQueryExecutor implements QueryExecutor {
  private readonly _results: Map<string, QueryOutcomeView> = new Map()
  private _defaultResult: QueryOutcomeView = { state: 'completed', columns: ['result'], rows: [[1]], rowCount: 1 }
  /** StubQueryExecutor.calls */
  readonly calls: string[] = []

  /**
   *  Set a canned outcome for a specific SQL (exact match).
   * @param sql - sql
   * @param result - result
   */
  setResult(sql: string, result: QueryOutcomeView): void {
    this._results.set(sql, result)
  }

  /**
   *  Set the default outcome for unmatched SQL.
   * @param result - result
   */
  setDefaultResult(result: QueryOutcomeView): void {
    this._defaultResult = result
  }

  // oxlint-disable-next-line typescript/require-await -- async for interface conformance, returns Promise<QueryOutcomeView>
  async execute(sql: string): Promise<QueryOutcomeView> {
    this.calls.push(sql)
    return this._results.get(sql) ?? this._defaultResult
  }
}

/**
 * A stub judge executor that returns a configurable score.
 * Useful for testing without a real judge LLM.
 */
export class StubJudgeExecutor implements JudgeExecutor {
  private _score: number = 1.0
  private _rationale: string = 'stub judge: always passes'
  /** StubJudgeExecutor.calls */
  readonly calls: Array<{ expected: unknown; actual: string; question: string }> = []

  /**
   *  Set the score that the stub judge returns.
   * @param score - score
   * @param rationale - rationale
   */
  setScore(score: number, rationale?: string): void {
    this._score = score
    if (rationale) this._rationale = rationale
  }

  // oxlint-disable-next-line typescript/require-await -- async for interface conformance, returns Promise<JudgeResult>
  async judge(expected: unknown, actual: string, question: string): Promise<JudgeResult> {
    this.calls.push({ expected, actual, question })
    return { score: this._score, rationale: this._rationale }
  }
}

/**
 * A stub agent responder that throws on every call (for testing infra failures).
 */
export class FailingAgentResponder implements AgentResponder {
  constructor(private readonly _error: Error = new Error('ECONNREFUSED: agent unreachable')) {}

  // oxlint-disable-next-line typescript/require-await -- async for interface conformance, returns Promise<never>
  async respond(_question: string, _opts?: AgentRespondOpts): Promise<never> {
    throw this._error
  }
}

/**
 * A stub query executor that throws on every call (for testing infra failures).
 */
export class FailingQueryExecutor implements QueryExecutor {
  constructor(private readonly _error: Error = new Error('ECONNREFUSED: warehouse unreachable')) {}

  // oxlint-disable-next-line typescript/require-await -- async for interface conformance, returns Promise<never>
  async execute(_sql: string): Promise<never> {
    throw this._error
  }
}
