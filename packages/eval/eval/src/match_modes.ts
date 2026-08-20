/**
 * The 5 EXECUTION `match_mode` variants — a 1:1 translation of
 * `reverse-bi/libs/rbi-eval/src/rbi_eval/scoring/match_modes.py`. Pure
 * dict/row comparison, zero external dependencies, so the translation is
 * mechanical (`frozenset(sorted(r.items()))` → a sorted `k=v|k=v` fingerprint
 * string). The envelope convention for `expected.result_value` (a single flat
 * object encoding the comparison target per mode) is rbi's, mirrored verbatim:
 *
 * - `scalar_exact`:        `{ value: <scalar> }`
 * - `multi_scalar_exact`:  `{ fields: { <name>: <expected>, ... } }` (or a single-element array)
 * - `row_count_range`:     `{ min: <int>, max: <int> }`
 * - `set_equal`:           `{ rows: [ <row>, ... ] }`
 * - `ordered_subset`:      `{ rows: [ <row>, ... ] }`
 *
 * @module @deepseek-ai/dsh-eval/match_modes
 */

import type { AssertionResult } from './types.ts'

/** The 5 EXECUTION match modes, in declaration order. */
export type MatchMode = 'scalar_exact' | 'multi_scalar_exact' | 'row_count_range' | 'set_equal' | 'ordered_subset'

export const MATCH_MODES: readonly MatchMode[] = [
  'scalar_exact',
  'multi_scalar_exact',
  'row_count_range',
  'set_equal',
  'ordered_subset',
]

/**
 * Compare `actualRows` against `expected` per `matchMode`.
 * @param expected - the `expected.result_value` envelope (shape per mode).
 * @param actualRows - dict rows from the injected `CaseSqlExecutor` (the `QueryOutcome.rows` zipped with `columns`).
 * @param matchMode - one of {@link MatchMode}.
 * @returns `{status, detail}` — `pass` or `fail` with a short reason.
 */
export function checkResultMatch(
  expected: Record<string, unknown>,
  actualRows: readonly Record<string, unknown>[],
  matchMode: string,
): AssertionResult {
  switch (matchMode) {
    case 'scalar_exact': return scalarExact(expected, actualRows)
    case 'multi_scalar_exact': return multiScalarExact(expected, actualRows)
    case 'row_count_range': return rowCountRange(expected, actualRows)
    case 'set_equal': return setEqual(expected, actualRows)
    case 'ordered_subset': return orderedSubset(expected, actualRows)
    default: return { status: 'fail', detail: `unknown match_mode: ${matchMode}` }
  }
}

function scalarExact(expected: Record<string, unknown>, actualRows: readonly Record<string, unknown>[]): AssertionResult {
  if (!('value' in expected)) return { status: 'fail', detail: "malformed result_value for scalar_exact: missing 'value' key" }
  const target = expected.value
  const firstRow = actualRows[0]
  if (firstRow === undefined) return { status: 'fail', detail: `no rows returned; expected scalar ${JSON.stringify(target)}` }
  const actualValues = Object.values(firstRow)
  const actual = actualValues[0]
  if (actual === undefined) return { status: 'fail', detail: 'first row has no columns' }
  if (actual === target) return { status: 'pass', detail: '' }
  return { status: 'fail', detail: `expected ${JSON.stringify(target)}, got ${JSON.stringify(actual)}` }
}

function multiScalarExact(expected: Record<string, unknown>, actualRows: readonly Record<string, unknown>[]): AssertionResult {
  if (!('fields' in expected)) return { status: 'fail', detail: "malformed result_value for multi_scalar_exact: missing 'fields' key" }
  let rawFields: unknown = expected.fields
  if (Array.isArray(rawFields)) {
    const first = rawFields[0]
    if (first === undefined) return { status: 'fail', detail: 'fields list is empty' }
    rawFields = first
  }
  if (rawFields === null || typeof rawFields !== 'object' || Array.isArray(rawFields)) {
    return { status: 'fail', detail: 'fields must be an object or single-element array of objects' }
  }
  const fields = rawFields as Record<string, unknown>
  const firstRow = actualRows[0]
  if (firstRow === undefined) return { status: 'fail', detail: 'no rows returned; expected field values' }
  const mismatches: string[] = []
  for (const [name, expVal] of Object.entries(fields)) {
    if (!(name in firstRow)) mismatches.push(`${name}: missing from result`)
    else if (firstRow[name] !== expVal) mismatches.push(`${name}: expected ${JSON.stringify(expVal)}, got ${JSON.stringify(firstRow[name])}`)
  }
  if (mismatches.length > 0) return { status: 'fail', detail: mismatches.join('; ') }
  return { status: 'pass', detail: '' }
}

function rowCountRange(expected: Record<string, unknown>, actualRows: readonly Record<string, unknown>[]): AssertionResult {
  if (!('min' in expected) || !('max' in expected)) return { status: 'fail', detail: "malformed result_value for row_count_range: missing 'min' and/or 'max' key" }
  const lo = expected.min
  const hi = expected.max
  if (typeof lo !== 'number' || typeof hi !== 'number') return { status: 'fail', detail: 'min and max must be numbers' }
  const count = actualRows.length
  if (lo <= count && count <= hi) return { status: 'pass', detail: '' }
  return { status: 'fail', detail: `row_count ${count} not in [${lo}, ${hi}]` }
}

function setEqual(expected: Record<string, unknown>, actualRows: readonly Record<string, unknown>[]): AssertionResult {
  if (!('rows' in expected)) return { status: 'fail', detail: "malformed result_value for set_equal: missing 'rows' key" }
  const expectedRows = expected.rows
  if (!Array.isArray(expectedRows)) return { status: 'fail', detail: 'rows must be an array' }
  const expectedSet = new Set(expectedRows.map(rowKey))
  const actualSet = new Set(actualRows.map(rowKey))
  if (setsEqual(expectedSet, actualSet)) return { status: 'pass', detail: '' }
  const missing = [...expectedSet].filter(k => !actualSet.has(k))
  const extra = [...actualSet].filter(k => !expectedSet.has(k))
  const parts: string[] = []
  if (missing.length > 0) parts.push(`missing ${missing.length} expected row(s)`)
  if (extra.length > 0) parts.push(`${extra.length} unexpected row(s)`)
  return { status: 'fail', detail: parts.join('; ') }
}

function orderedSubset(expected: Record<string, unknown>, actualRows: readonly Record<string, unknown>[]): AssertionResult {
  if (!('rows' in expected)) return { status: 'fail', detail: "malformed result_value for ordered_subset: missing 'rows' key" }
  const expectedRows = expected.rows
  if (!Array.isArray(expectedRows)) return { status: 'fail', detail: 'rows must be an array' }
  if (expectedRows.length === 0) return { status: 'pass', detail: '' }
  const actualFrozen = actualRows.map(rowKey)
  const expectedFrozen = expectedRows.map(rowKey)
  let ei = 0
  for (const ar of actualFrozen) {
    const want = expectedFrozen[ei]
    if (want !== undefined && ar === want) {
      ei++
      if (ei === expectedFrozen.length) break
    }
  }
  if (ei === expectedFrozen.length) return { status: 'pass', detail: '' }
  return { status: 'fail', detail: `ordered subsequence not found; matched ${ei}/${expectedFrozen.length} expected rows` }
}

/** Canonical, order-independent-within-row fingerprint that also dedupes (rbi's `frozenset(sorted(r.items()))`). */
function rowKey(r: Record<string, unknown>): string {
  return Object.keys(r)
    .sort()
    .map(k => `${k}=${JSON.stringify(r[k])}`)
    .join('|')
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  return true
}
