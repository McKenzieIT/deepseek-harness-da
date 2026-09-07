/**
 * usl-10: shared RemoteResult unwrap contract. Pins the unwrapping rule
 * (throw on `!ok` or a missing value) and the per-seam error-message prefix
 * so the evidence-query and schema-gateway bridges share one contract instead
 * of re-declaring byte-identical `RemoteResult<T>` + `unwrap<T>` helpers.
 */
import { describe, expect, it } from 'vitest'
import { unwrapRemoteResult, type RemoteResult } from '../src/client/remoteResult.ts'

function ok<T>(value: T): RemoteResult<T> {
  return { ok: true, value }
}

function fail(error: unknown): RemoteResult<unknown> {
  return { ok: false, error }
}

describe('unwrapRemoteResult', () => {
  it('returns the value on ok', () => {
    expect(unwrapRemoteResult(ok(42), 'evidence-query')).toBe(42)
  })

  it('throws "<ns> RPC failed: <detail>" on !ok with an Error', () => {
    expect(() => unwrapRemoteResult(fail(new Error('network timeout')), 'evidence-query')).toThrow(
      'evidence-query RPC failed: network timeout',
    )
  })

  it('throws "<ns> RPC failed: <detail>" on !ok with a string error', () => {
    expect(() => unwrapRemoteResult(fail('connection lost'), 'schema-gateway')).toThrow(
      'schema-gateway RPC failed: connection lost',
    )
  })

  it('throws "<ns> RPC failed: unknown" on !ok with a non-string/non-Error error', () => {
    expect(() => unwrapRemoteResult(fail({ code: 500 }), 'evidence-query')).toThrow(
      'evidence-query RPC failed: unknown',
    )
  })

  it('throws "<ns> RPC failed: ok response missing value" when ok but value is absent', () => {
    // { ok: true } with no `value` — the host returned success but omitted the
    // payload; any T applies (the value type is irrelevant to the missing check).
    expect(() => unwrapRemoteResult({ ok: true }, 'schema-gateway')).toThrow(
      'schema-gateway RPC failed: ok response missing value',
    )
  })

  it('returns present values (null / 0 / "") without confusing them for missing', () => {
    // null is a valid value (e.g. assetHealth for a nonexistent asset) and must
    // not trigger the missing-value contract violation (only `undefined` does).
    expect(unwrapRemoteResult(ok(null), 'evidence-query')).toBeNull()
    expect(unwrapRemoteResult(ok(0), 'evidence-query')).toBe(0)
    expect(unwrapRemoteResult(ok(''), 'evidence-query')).toBe('')
  })
})
