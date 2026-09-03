import { describe, expect, it } from 'vitest'
import { runBatch } from '../src/runner.ts'
import { buildCollaborators } from '../src/collaborators.ts'
import { StubAgentResponder, StubQueryExecutor, StubJudgeExecutor } from '../src/stubs.ts'
import type { SqlSemanticJudge, SqlJudgeInput, SqlJudgeResult } from '../src/sql_semantic_judge.ts'

const fixtureDir = import.meta.dirname
const caseA = `${fixtureDir}/fixtures/case-a.yaml`

class StubSqlSemanticJudge implements SqlSemanticJudge {
  readonly calls: SqlJudgeInput[] = []
  private _result: SqlJudgeResult = {
    score: 0.8,
    rationale: 'stub: looks correct',
    dimensions: {
      table_selection: 1,
      field_selection: 1,
      filter_conditions: 1,
      aggregation_logic: 0,
      overall_semantics: 1,
    },
  }

  setResult(result: SqlJudgeResult): void {
    this._result = result
  }

  async judgeSql(input: SqlJudgeInput): Promise<SqlJudgeResult> {
    this.calls.push(input)
    return this._result
  }
}

describe('sql_judge verdict persistence', () => {
  it('persists sql_judge field in AttemptResult when judge is used (no executor)', async () => {
    const agent = new StubAgentResponder()
    const sqlJudge = new StubSqlSemanticJudge()

    agent.setDefaultReply({ reply: '1000', generated_sql: 'SELECT SUM(amt) FROM orders' })

    const collaborators = buildCollaborators(agent, null, null, sqlJudge)

    const result = await runBatch([caseA], collaborators, {
      pass_k: 1,
      skip_health_gate: true,
    })

    const attempt = result.cases[0]!.pass_k_results[0]!
    expect(attempt.sql_judge).toBeDefined()
    expect(attempt.sql_judge!.score).toBe(0.8)
    expect(attempt.sql_judge!.rationale).toBe('stub: looks correct')
    expect(attempt.sql_judge!.dimensions).toEqual({
      table_selection: 1,
      field_selection: 1,
      filter_conditions: 1,
      aggregation_logic: 0,
      overall_semantics: 1,
    })
  })

  it('sql_judge field is undefined when no judge is invoked', async () => {
    const agent = new StubAgentResponder()
    const executor = new StubQueryExecutor()
    const judge = new StubJudgeExecutor()

    agent.setDefaultReply({ reply: '1000', generated_sql: 'SELECT 1000 AS total' })
    executor.setResult('SELECT 1000 AS total', { success: true, rows: [{ total: 1000 }], row_count: 1, error: null })
    judge.setScore(1.0)

    // No sqlJudge provided, and executor exists — old behavior would skip judge entirely
    const collaborators = buildCollaborators(agent, executor, judge, null)

    const result = await runBatch([caseA], collaborators, {
      pass_k: 1,
      skip_health_gate: true,
    })

    const attempt = result.cases[0]!.pass_k_results[0]!
    expect(attempt.sql_judge).toBeUndefined()
  })

  it('sql_judge dimensions record per-dimension 0|1 scores', async () => {
    const agent = new StubAgentResponder()
    const sqlJudge = new StubSqlSemanticJudge()

    sqlJudge.setResult({
      score: 0.4,
      rationale: 'wrong table and aggregation',
      dimensions: {
        table_selection: 0,
        field_selection: 1,
        filter_conditions: 1,
        aggregation_logic: 0,
        overall_semantics: 0,
      },
    })

    agent.setDefaultReply({ reply: 'bad answer', generated_sql: 'SELECT * FROM wrong_table' })

    const collaborators = buildCollaborators(agent, null, null, sqlJudge)

    const result = await runBatch([caseA], collaborators, {
      pass_k: 1,
      skip_health_gate: true,
    })

    const attempt = result.cases[0]!.pass_k_results[0]!
    expect(attempt.sql_judge).toBeDefined()
    expect(attempt.sql_judge!.dimensions.table_selection).toBe(0)
    expect(attempt.sql_judge!.dimensions.aggregation_logic).toBe(0)
    expect(attempt.sql_judge!.dimensions.overall_semantics).toBe(0)
    // Score below threshold → execution_match should be false
    expect(attempt.execution_match).toBe(false)
  })
})

describe('dual-score policy (executor + sql_judge)', () => {
  it('runs both executor and sql_judge when both are available', async () => {
    const agent = new StubAgentResponder()
    const executor = new StubQueryExecutor()
    const judge = new StubJudgeExecutor()
    const sqlJudge = new StubSqlSemanticJudge()

    agent.setDefaultReply({ reply: '1000', generated_sql: 'SELECT 1000 AS total' })
    executor.setResult('SELECT 1000 AS total', { success: true, rows: [{ total: 1000 }], row_count: 1, error: null })
    judge.setScore(1.0)
    sqlJudge.setResult({
      score: 1.0,
      rationale: 'correct',
      dimensions: {
        table_selection: 1,
        field_selection: 1,
        filter_conditions: 1,
        aggregation_logic: 1,
        overall_semantics: 1,
      },
    })

    const collaborators = buildCollaborators(agent, executor, judge, sqlJudge)

    const result = await runBatch([caseA], collaborators, {
      pass_k: 1,
      skip_health_gate: true,
    })

    const attempt = result.cases[0]!.pass_k_results[0]!
    // Both scores present
    expect(attempt.execution_match).toBe(true)
    expect(attempt.sql_judge).toBeDefined()
    expect(attempt.sql_judge!.score).toBe(1.0)
    // sql_judge was actually called
    expect(sqlJudge.calls).toHaveLength(1)
  })

  it('execution_match and sql_judge are independent — executor fails, judge passes', async () => {
    const agent = new StubAgentResponder()
    const executor = new StubQueryExecutor()
    const judge = new StubJudgeExecutor()
    const sqlJudge = new StubSqlSemanticJudge()

    agent.setDefaultReply({ reply: '999', generated_sql: 'SELECT 999 AS total' })
    // Executor returns non-matching result
    executor.setResult('SELECT 999 AS total', { success: true, rows: [{ total: 999 }], row_count: 1, error: null })
    judge.setScore(1.0)
    // But sql_judge says it's semantically correct
    sqlJudge.setResult({
      score: 0.8,
      rationale: 'semantically correct despite value mismatch',
      dimensions: {
        table_selection: 1,
        field_selection: 1,
        filter_conditions: 1,
        aggregation_logic: 0,
        overall_semantics: 1,
      },
    })

    const collaborators = buildCollaborators(agent, executor, judge, sqlJudge)

    const result = await runBatch([caseA], collaborators, {
      pass_k: 1,
      skip_health_gate: true,
    })

    const attempt = result.cases[0]!.pass_k_results[0]!
    // Execution doesn't match (value mismatch)
    expect(attempt.execution_match).toBe(false)
    // But sql_judge independently scored it
    expect(attempt.sql_judge).toBeDefined()
    expect(attempt.sql_judge!.score).toBe(0.8)
  })

  it('execution_match and sql_judge are independent — executor passes, judge fails', async () => {
    const agent = new StubAgentResponder()
    const executor = new StubQueryExecutor()
    const judge = new StubJudgeExecutor()
    const sqlJudge = new StubSqlSemanticJudge()

    agent.setDefaultReply({ reply: '1000', generated_sql: 'SELECT 1000 AS total' })
    executor.setResult('SELECT 1000 AS total', { success: true, rows: [{ total: 1000 }], row_count: 1, error: null })
    judge.setScore(1.0)
    // sql_judge thinks it's wrong
    sqlJudge.setResult({
      score: 0.2,
      rationale: 'wrong table used',
      dimensions: {
        table_selection: 0,
        field_selection: 0,
        filter_conditions: 1,
        aggregation_logic: 0,
        overall_semantics: 0,
      },
    })

    const collaborators = buildCollaborators(agent, executor, judge, sqlJudge)

    const result = await runBatch([caseA], collaborators, {
      pass_k: 1,
      skip_health_gate: true,
    })

    const attempt = result.cases[0]!.pass_k_results[0]!
    // Execution passes (result matches)
    expect(attempt.execution_match).toBe(true)
    // sql_judge independently scored low — recorded but doesn't override execution_match
    expect(attempt.sql_judge).toBeDefined()
    expect(attempt.sql_judge!.score).toBe(0.2)
  })

  it('does not call sql_judge when no SQL was generated (dual-score mode)', async () => {
    const agent = new StubAgentResponder()
    const executor = new StubQueryExecutor()
    const judge = new StubJudgeExecutor()
    const sqlJudge = new StubSqlSemanticJudge()

    // Agent returns no SQL
    agent.setDefaultReply({ reply: 'I cannot answer this question', generated_sql: null })
    judge.setScore(0.0)

    const collaborators = buildCollaborators(agent, executor, judge, sqlJudge)

    const result = await runBatch([caseA], collaborators, {
      pass_k: 1,
      skip_health_gate: true,
    })

    const attempt = result.cases[0]!.pass_k_results[0]!
    expect(attempt.sql_judge).toBeUndefined()
    expect(sqlJudge.calls).toHaveLength(0)
  })

  it('verdict uses execution_match for pass/fail (sql_judge does not override)', async () => {
    const agent = new StubAgentResponder()
    const executor = new StubQueryExecutor()
    const judge = new StubJudgeExecutor()
    const sqlJudge = new StubSqlSemanticJudge()

    agent.setDefaultReply({ reply: '1000', generated_sql: 'SELECT 1000 AS total' })
    // Execution matches
    executor.setResult('SELECT 1000 AS total', { success: true, rows: [{ total: 1000 }], row_count: 1, error: null })
    judge.setScore(1.0)
    // Judge fails — but should NOT change the verdict
    sqlJudge.setResult({
      score: 0.0,
      rationale: 'totally wrong',
      dimensions: {
        table_selection: 0,
        field_selection: 0,
        filter_conditions: 0,
        aggregation_logic: 0,
        overall_semantics: 0,
      },
    })

    const collaborators = buildCollaborators(agent, executor, judge, sqlJudge)

    const result = await runBatch([caseA], collaborators, {
      pass_k: 1,
      skip_health_gate: true,
    })

    // Verdict is determined by execution_match, not sql_judge
    expect(result.cases[0]!.verdict).toBe('correct')
  })
})
