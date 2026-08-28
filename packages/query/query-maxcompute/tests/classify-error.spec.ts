/**
 * classifyMaxcError + decodeResult failure classification — self-evolution #1.
 *
 * Phase-gate needs to identify TABLE_NOT_FOUND to trigger the ask-user-for-
 * project flow. The raw MCP `isError` path and the sidecar's `toOutcome`
 * (dev/maxc-sidecar.mjs) both surface the verbatim ODPS error text in
 * `error`; `classifyMaxcError` parses it for ODPS codes/keywords, and
 * `decodeResult` overrides the coarse failureKind ('remote' on the MCP
 * isError path; 'transport'/'retryable'/'unknown' from the sidecar) with the
 * detected kind. The undecodable path stays 'transport' (a protocol failure,
 * not an ODPS error).
 *
 * Layering: the provider owns ODPS error-code knowledge; phase-gate (#2b, Task 6)
 * only reads `failureKind`. The query-tool seam already passes `failureKind`
 * through verbatim (query-tool/src/index.ts:145), so it needs no change.
 *
 * Run: `pnpm vitest run packages/query/query-maxcompute/tests/`
 */
import { describe, it, expect } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { MaxComputeQueryEngine, classifyMaxcError, type Config } from '../src/index.ts'
import type { QueryOutcome } from '@deepseek-ai/dsh-query/src/index.ts'

/**
 * Construct a MaxComputeQueryEngine WITHOUT starting it (mirror qualify.spec.ts):
 * the Service base constructor only registers on ctx — no sidecar spawn until
 * [Service.init] runs via ctx.plugin. `decodeResult` reads the passed-in MCP
 * result and never touches the sidecar, so bracket-accessing the private pure
 * decoder is a safe isolated probe (no spawn, no test-only method added).
 */
function newEngine(config: Config = { sidecarPath: 'unused' }): MaxComputeQueryEngine {
  return new MaxComputeQueryEngine(new Context(), config)
}

/** Bracket-access the private pure-logic decoder (no sidecar spawn). */
function decode(result: Record<string, unknown>, tool = 'execute'): QueryOutcome {
  return (newEngine() as unknown as {
    decodeResult: (r: Record<string, unknown>, t: string) => QueryOutcome
  }).decodeResult(result, tool)
}

describe('classifyMaxcError', () => {
  it('classifies Table not found / NoSuchTable / ODPS-0130131 as not_found', () => {
    expect(classifyMaxcError('ODPS-0130131:[1,33] Table not found - table game_x.dws_y cannot be resolved')).toBe('not_found')
    expect(classifyMaxcError('NoSuchTable: dws_x')).toBe('not_found')
  })

  it('classifies AccessDenied / ODPS-0121 denied as permission', () => {
    expect(classifyMaxcError('ODPS-0121: AccessDenied')).toBe('permission')
  })

  it('classifies syntax error / ODPS-0130 (non-0130131) as syntax', () => {
    expect(classifyMaxcError('ODPS-0130: syntax error near')).toBe('syntax')
  })

  it('classifies timeout / timed out / exceeded as timeout', () => {
    expect(classifyMaxcError('ODPS-0121: timeout / query exceeded')).toBe('timeout')
  })

  it('returns unknown when no ODPS code is detected', () => {
    expect(classifyMaxcError('some other error')).toBe('unknown')
  })
})

describe('decodeResult failure classification', () => {
  it('overrides the coarse remote label with not_found when the MCP isError text carries an ODPS table-not-found code', () => {
    const out = decode({
      isError: true,
      content: [{ type: 'text', text: 'ODPS-0130131:[1,33] Table not found - table game_x.dws_y cannot be resolved' }],
    })
    expect(out.state).toBe('failed')
    expect(out.failureKind).toBe('not_found')
  })

  it('keeps the coarse remote label when the MCP isError text has no recognizable ODPS code', () => {
    const out = decode({
      isError: true,
      content: [{ type: 'text', text: 'some other transport-level error' }],
    })
    expect(out.failureKind).toBe('remote')
  })

  it('overrides the sidecar coarse unknown with not_found when the JSON failed outcome carries an ODPS table-not-found code', () => {
    const out = decode({
      isError: false,
      content: [{ type: 'text', text: JSON.stringify({ state: 'failed', error: 'ODPS-0130131 Table not found - table dws_x', failureKind: 'unknown', sql: 'SELECT 1' }) }],
    })
    expect(out.state).toBe('failed')
    expect(out.failureKind).toBe('not_found')
  })

  it('keeps the sidecar retryable label when the JSON failed outcome has no recognizable ODPS code', () => {
    // classify → 'unknown' must NOT clobber the sidecar's recoverable signal;
    // the ODPS code wins only when detected (else keep existing).
    const out = decode({
      isError: false,
      content: [{ type: 'text', text: JSON.stringify({ state: 'failed', error: 'resource busy', failureKind: 'retryable', sql: 'SELECT 1' }) }],
    })
    expect(out.failureKind).toBe('retryable')
  })

  it('does not classify a completed outcome (leaves it untouched)', () => {
    const out = decode({
      isError: false,
      content: [{ type: 'text', text: JSON.stringify({ state: 'completed', columns: ['c'], rows: [[1]], rowCount: 1, sql: 'SELECT 1' }) }],
    })
    expect(out.state).toBe('completed')
    expect(out.failureKind).toBeUndefined()
  })

  it('keeps the transport label when the result text is undecodable', () => {
    const out = decode({ isError: false, content: [{ type: 'text', text: 'not json' }] })
    expect(out.state).toBe('failed')
    expect(out.failureKind).toBe('transport')
  })
})
