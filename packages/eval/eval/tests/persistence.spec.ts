import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { persistBatchResult, loadRunRecords, listRunFiles, computeDelta, passAtK } from '../src/persistence.ts'
import type { BatchResult } from '../src/runner.ts'
import type { PersistedCaseRecord } from '../src/persistence.ts'

function makeBatchResult(overrides: Partial<BatchResult> = {}): BatchResult {
  return {
    runId: 'run-1',
    timestamp: '2026-08-25T10:00:00.000Z',
    passK: 3,
    perCase: [
      {
        caseId: 'c1',
        outcome: 'correct',
        verdict: 'pass',
        result: { caseId: 'c1', passK: 3, passed: true, verdict: 'pass', attempts: [], latencyMs: 100, lastSubmission: null },
      },
      {
        caseId: 'c2',
        outcome: 'wrong',
        verdict: 'fail',
        result: { caseId: 'c2', passK: 3, passed: false, verdict: 'fail', attempts: [], latencyMs: 200, lastSubmission: null },
      },
    ],
    summary: { totalCases: 2, correct: 1, declined: 0, wrong: 1, unjudged: 0, passRate: 0.5, totalLatencyMs: 300 },
    ...overrides,
  }
}

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'eval-persist-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('persistBatchResult + loadRunRecords', () => {
  it('writes JSONL and reads back correctly', () => {
    const batch = makeBatchResult()
    const path = persistBatchResult(batch, tmpDir)
    expect(path).toContain('.jsonl')

    const records = loadRunRecords(path)
    expect(records).toHaveLength(2)
    expect(records[0]!.caseId).toBe('c1')
    expect(records[0]!.outcome).toBe('correct')
    expect(records[0]!.runId).toBe('run-1')
    expect(records[1]!.caseId).toBe('c2')
    expect(records[1]!.outcome).toBe('wrong')
  })

  it('creates directory if it does not exist', () => {
    const nested = join(tmpDir, 'nested', 'deep')
    const path = persistBatchResult(makeBatchResult(), nested)
    expect(path).toContain('nested/deep')
    const records = loadRunRecords(path)
    expect(records).toHaveLength(2)
  })
})

describe('listRunFiles', () => {
  it('lists files sorted by timestamp', () => {
    persistBatchResult(makeBatchResult({ runId: 'early', timestamp: '2026-08-24T10:00:00.000Z' }), tmpDir)
    persistBatchResult(makeBatchResult({ runId: 'late', timestamp: '2026-08-25T10:00:00.000Z' }), tmpDir)
    const files = listRunFiles(tmpDir)
    expect(files).toHaveLength(2)
    expect(files[0]!.runId).toBe('early')
    expect(files[1]!.runId).toBe('late')
  })

  it('returns empty for non-existent directory', () => {
    expect(listRunFiles('/nonexistent/path')).toEqual([])
  })
})

describe('computeDelta', () => {
  it('detects flips between runs', () => {
    const runA: PersistedCaseRecord[] = [
      { runId: 'a', timestamp: 't', caseId: 'c1', outcome: 'correct', verdict: 'pass', passed: true, passK: 3, latencyMs: 100, attemptsCount: 3, errorsCount: 0 },
      { runId: 'a', timestamp: 't', caseId: 'c2', outcome: 'wrong', verdict: 'fail', passed: false, passK: 3, latencyMs: 200, attemptsCount: 3, errorsCount: 0 },
    ]
    const runB: PersistedCaseRecord[] = [
      { runId: 'b', timestamp: 't', caseId: 'c1', outcome: 'wrong', verdict: 'fail', passed: false, passK: 3, latencyMs: 100, attemptsCount: 3, errorsCount: 0 },
      { runId: 'b', timestamp: 't', caseId: 'c2', outcome: 'correct', verdict: 'pass', passed: true, passK: 3, latencyMs: 200, attemptsCount: 3, errorsCount: 0 },
    ]
    const delta = computeDelta(runA, runB)
    expect(delta.flipped).toHaveLength(2)
    expect(delta.summary.improved).toBe(1)
    expect(delta.summary.regressed).toBe(1)
    expect(delta.summary.unchanged).toBe(0)
  })

  it('handles new and removed cases', () => {
    const runA: PersistedCaseRecord[] = [
      { runId: 'a', timestamp: 't', caseId: 'c1', outcome: 'correct', verdict: 'pass', passed: true, passK: 3, latencyMs: 100, attemptsCount: 3, errorsCount: 0 },
    ]
    const runB: PersistedCaseRecord[] = [
      { runId: 'b', timestamp: 't', caseId: 'c2', outcome: 'wrong', verdict: 'fail', passed: false, passK: 3, latencyMs: 200, attemptsCount: 3, errorsCount: 0 },
    ]
    const delta = computeDelta(runA, runB)
    expect(delta.summary.removedCases).toBe(1)
    expect(delta.summary.newCases).toBe(1)
  })

  it('reports unchanged when outcomes match', () => {
    const records: PersistedCaseRecord[] = [
      { runId: 'x', timestamp: 't', caseId: 'c1', outcome: 'correct', verdict: 'pass', passed: true, passK: 3, latencyMs: 100, attemptsCount: 3, errorsCount: 0 },
    ]
    const delta = computeDelta(records, records)
    expect(delta.summary.unchanged).toBe(1)
    expect(delta.flipped).toHaveLength(0)
  })
})

describe('passAtK', () => {
  it('computes fraction of passing cases', () => {
    const records: PersistedCaseRecord[] = [
      { runId: 'r', timestamp: 't', caseId: 'c1', outcome: 'correct', verdict: 'pass', passed: true, passK: 3, latencyMs: 100, attemptsCount: 3, errorsCount: 0 },
      { runId: 'r', timestamp: 't', caseId: 'c2', outcome: 'wrong', verdict: 'fail', passed: false, passK: 3, latencyMs: 200, attemptsCount: 3, errorsCount: 0 },
    ]
    expect(passAtK(records)).toBe(0.5)
  })

  it('returns 0 for empty records', () => {
    expect(passAtK([])).toBe(0)
  })
})
