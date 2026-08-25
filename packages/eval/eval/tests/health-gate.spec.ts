import { describe, expect, it } from 'vitest'
import { runHealthCheck } from '../src/health-gate.ts'
import type { CaseSqlExecutor, Responder } from '../src/types.ts'

function passingExecutor(): CaseSqlExecutor {
  return async () => ({ success: true, rows: [{ '1': 1 }], rowCount: 1, error: null, failureClass: null })
}

function failingExecutor(): CaseSqlExecutor {
  return async () => ({ success: false, rows: [], rowCount: 0, error: 'connection refused', failureClass: 'infrastructure' })
}

function throwingExecutor(): CaseSqlExecutor {
  return async () => { throw new Error('network unreachable') }
}

function passingResponder(): Responder {
  return async () => ({ reply: 'pong', generatedSql: null, generatedBehavior: null })
}

function failingResponder(): Responder {
  return async () => { throw new Error('401 unauthorized: invalid credential') }
}

function hangingResponder(): Responder {
  return () => new Promise(() => {}) // never resolves
}

describe('runHealthCheck', () => {
  it('passes when executor is healthy', async () => {
    const result = await runHealthCheck({ executeSql: passingExecutor() })
    expect(result.healthy).toBe(true)
    expect(result.checks).toHaveLength(1)
    expect(result.checks[0].name).toBe('connectivity')
    expect(result.checks[0].passed).toBe(true)
  })

  it('fails on executor failure', async () => {
    const result = await runHealthCheck({ executeSql: failingExecutor() })
    expect(result.healthy).toBe(false)
    expect(result.error).toContain('connectivity check failed')
  })

  it('fails on executor exception', async () => {
    const result = await runHealthCheck({ executeSql: throwingExecutor() })
    expect(result.healthy).toBe(false)
    expect(result.checks[0].detail).toContain('network unreachable')
  })

  it('passes when responder is healthy', async () => {
    const result = await runHealthCheck({ responder: passingResponder() })
    expect(result.healthy).toBe(true)
    expect(result.checks[0].name).toBe('responder')
  })

  it('fails on responder auth failure', async () => {
    const result = await runHealthCheck({ responder: failingResponder() })
    expect(result.healthy).toBe(false)
    expect(result.checks[0].detail).toContain('auth failure')
  })

  it('fails on responder timeout', async () => {
    const result = await runHealthCheck({ responder: hangingResponder(), timeoutMs: 50 })
    expect(result.healthy).toBe(false)
    expect(result.checks[0].detail).toContain('timed out')
  })

  it('checks both executor and responder when provided', async () => {
    const result = await runHealthCheck({ executeSql: passingExecutor(), responder: passingResponder() })
    expect(result.healthy).toBe(true)
    expect(result.checks).toHaveLength(2)
  })

  it('short-circuits: if executor fails, responder is not checked', async () => {
    const result = await runHealthCheck({ executeSql: failingExecutor(), responder: passingResponder() })
    expect(result.healthy).toBe(false)
    expect(result.checks).toHaveLength(1)
    expect(result.checks[0].name).toBe('connectivity')
  })

  it('returns healthy with no options (nothing to check)', async () => {
    const result = await runHealthCheck({})
    expect(result.healthy).toBe(true)
    expect(result.checks).toHaveLength(0)
  })
})
