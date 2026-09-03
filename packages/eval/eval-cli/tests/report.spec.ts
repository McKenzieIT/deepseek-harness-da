import { describe, it, expect } from 'vitest'
import { formatReport } from '../src/report.ts'
import type { RunResult } from '@deepseek-ai/dsh-eval-runner'
import type { EvalCase } from '@deepseek-ai/dsh-eval'

function makeCase(id: string, question: string, intent: string): EvalCase {
  return {
    case_id: id,
    input: { question, scope_id: null, turns: [] },
    expected: { result_value: null, match_mode: null, answer: null, delivery_match: null },
    dimensions: { query_intent: intent },
  }
}

function makeResult(cases: Array<{ id: string; verdict: 'correct' | 'wrong' | 'declined' | 'infra_failure' }>): RunResult {
  return {
    run_id: 'test-run-001',
    timestamp: '2026-08-25T12:00:00.000Z',
    cases: cases.map(c => ({
      case_id: c.id,
      pass_k_results: [{ attempt_k: 1 }],
      verdict: c.verdict,
      latency_ms: 100,
    })),
    summary: {
      total: cases.length,
      correct: cases.filter(c => c.verdict === 'correct').length,
      wrong: cases.filter(c => c.verdict === 'wrong').length,
      declined: cases.filter(c => c.verdict === 'declined').length,
      unjudged: 0,
      infra_failure: cases.filter(c => c.verdict === 'infra_failure').length,
      pass_rate: cases.filter(c => c.verdict === 'correct').length / cases.length,
    },
  }
}

describe('formatReport', () => {
  it('renders summary table with correct pass_rate', () => {
    const result = makeResult([
      { id: 'c1', verdict: 'correct' },
      { id: 'c2', verdict: 'wrong' },
      { id: 'c3', verdict: 'correct' },
      { id: 'c4', verdict: 'declined' },
    ])
    const cases = [
      makeCase('c1', 'question 1', 'metric_lookup'),
      makeCase('c2', 'question 2', 'trend'),
      makeCase('c3', 'question 3', 'metric_lookup'),
      makeCase('c4', 'question 4', 'ranking'),
    ]
    const report = formatReport(result, cases)
    expect(report).toContain('total: 4')
    expect(report).toContain('pass_rate: 50.0%')
    expect(report).toContain('correct: 2')
    expect(report).toContain('wrong: 1')
    expect(report).toContain('declined: 1')
  })

  it('groups per-intent breakdown correctly', () => {
    const result = makeResult([
      { id: 'c1', verdict: 'correct' },
      { id: 'c2', verdict: 'wrong' },
      { id: 'c3', verdict: 'correct' },
    ])
    const cases = [
      makeCase('c1', 'q1', 'metric_lookup'),
      makeCase('c2', 'q2', 'metric_lookup'),
      makeCase('c3', 'q3', 'trend'),
    ]
    const report = formatReport(result, cases)
    expect(report).toContain('metric_lookup')
    expect(report).toContain('trend')
  })

  it('shows top failures with question excerpts', () => {
    const result = makeResult([
      { id: 'c1', verdict: 'wrong' },
      { id: 'c2', verdict: 'infra_failure' },
    ])
    const cases = [
      makeCase('c1', '这是一个非常非常非常长的问题，用来测试报告格式化时超过五十个字符的问题描述是否会被正确截断并显示省略号', 'trend'),
      makeCase('c2', 'short question', 'ranking'),
    ]
    const report = formatReport(result, cases)
    expect(report).toContain('c1  [wrong]')
    expect(report).toContain('c2  [infra_failure]')
    expect(report).toContain('...')
    expect(report).toContain('short question')
  })

  it('handles empty results gracefully', () => {
    const result: RunResult = {
      run_id: 'empty',
      timestamp: '2026-08-25T00:00:00Z',
      cases: [],
      summary: { total: 0, correct: 0, wrong: 0, declined: 0, unjudged: 0, infra_failure: 0, pass_rate: 0 },
    }
    const report = formatReport(result, [])
    expect(report).toContain('total: 0')
    expect(report).not.toContain('Top Failures')
  })
})
