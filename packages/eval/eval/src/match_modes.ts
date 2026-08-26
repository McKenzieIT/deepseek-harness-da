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

/**
 * Loose numeric equality: ODPS may return numbers as strings, and expected
 * values may be int vs float. This handles "42" == 42 and 42.0 == 42.
 */
function looseNumericEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  const na = typeof a === 'string' ? Number(a) : typeof a === 'number' ? a : NaN
  const nb = typeof b === 'string' ? Number(b) : typeof b === 'number' ? b : NaN
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb
  return String(a) === String(b)
}

/** The 5 EXECUTION match modes, in declaration order. */
export type MatchMode = 'scalar_exact' | 'multi_scalar_exact' | 'row_count_range' | 'set_equal' | 'ordered_subset'

/** The 5 EXECUTION match modes as a readonly tuple, in declaration order (mirrors the {@link MatchMode} union members). */
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
  // Accept both envelope format ({value: X}) and direct format ({total: X}, {count: X}, etc.)
  const target = 'value' in expected ? expected.value : Object.values(expected)[0]
  if (target === undefined) return { status: 'fail', detail: 'empty result_value for scalar_exact' }
  const firstRow = actualRows[0]
  if (firstRow === undefined) return { status: 'fail', detail: `no rows returned; expected scalar ${JSON.stringify(target)}` }
  const actualValues = Object.values(firstRow)
  const actual = actualValues[0]
  if (actual === undefined) return { status: 'fail', detail: 'first row has no columns' }
  if (looseNumericEqual(actual, target)) return { status: 'pass', detail: '' }
  return { status: 'fail', detail: `expected ${JSON.stringify(target)}, got ${JSON.stringify(actual)}` }
}

function multiScalarExact(expected: Record<string, unknown>, actualRows: readonly Record<string, unknown>[]): AssertionResult {
  // Accept both envelope format ({fields: {k: v}}) and direct format ({k1: v1, k2: v2})
  let rawFields: unknown = 'fields' in expected ? expected.fields : expected
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
    else if (!looseNumericEqual(firstRow[name], expVal)) mismatches.push(`${name}: expected ${JSON.stringify(expVal)}, got ${JSON.stringify(firstRow[name])}`)
  }
  if (mismatches.length > 0) return { status: 'fail', detail: mismatches.join('; ') }
  return { status: 'pass', detail: '' }
}

function rowCountRange(expected: Record<string, unknown>, actualRows: readonly Record<string, unknown>[]): AssertionResult {
  // Accept both envelope format ({min:, max:}) and case format ({min_rows:, max_rows:})
  const lo = expected.min ?? expected.min_rows
  const hi = expected.max ?? expected.max_rows
  if (typeof lo !== 'number' || typeof hi !== 'number') return { status: 'fail', detail: `malformed result_value for row_count_range: need min/max or min_rows/max_rows (got ${JSON.stringify(expected)})` }
  const count = actualRows.length
  if (lo <= count && count <= hi) return { status: 'pass', detail: '' }
  return { status: 'fail', detail: `row_count ${count} not in [${lo}, ${hi}]` }
}

function setEqual(expected: Record<string, unknown>, actualRows: readonly Record<string, unknown>[]): AssertionResult {
  // Accept envelope format ({rows: [...]}) or direct format ({key: [...]})
  let expectedRows: unknown[] | undefined
  if ('rows' in expected && Array.isArray(expected.rows)) {
    expectedRows = expected.rows
  } else {
    const firstArr = Object.values(expected).find(v => Array.isArray(v)) as unknown[] | undefined
    if (firstArr) expectedRows = firstArr
  }
  if (!expectedRows) return { status: 'fail', detail: 'malformed result_value for set_equal: no array found' }
  // If expected items are scalars (strings/numbers), compare against first-column values
  if (expectedRows.length > 0 && (typeof expectedRows[0] === 'string' || typeof expectedRows[0] === 'number')) {
    const actualValues = new Set(actualRows.flatMap(r => Object.values(r).map(v => String(v))))
    const expectedSet = new Set(expectedRows.map(v => String(v)))
    const missing = [...expectedSet].filter(k => !actualValues.has(k))
    if (missing.length === 0) return { status: 'pass', detail: '' }
    return { status: 'fail', detail: `missing ${missing.length} expected value(s): ${missing.slice(0, 5).join(', ')}` }
  }
  // Row-object comparison (original envelope format)
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
  // Accept envelope format ({rows: [...]}) or direct format ({key: [...]})
  let expectedRows: unknown[] | undefined
  if ('rows' in expected && Array.isArray(expected.rows)) {
    expectedRows = expected.rows
  } else {
    const firstArr = Object.values(expected).find(v => Array.isArray(v)) as unknown[] | undefined
    if (firstArr) expectedRows = firstArr
  }
  if (!expectedRows) return { status: 'fail', detail: 'malformed result_value for ordered_subset: no array found' }
  if (expectedRows.length === 0) return { status: 'pass', detail: '' }
  // If expected items are scalars, check ordered subsequence against first-column values
  if (typeof expectedRows[0] === 'string' || typeof expectedRows[0] === 'number') {
    const actualValues = actualRows.map(r => String(Object.values(r)[0]))
    const expectedValues = expectedRows.map(v => String(v))
    let ei = 0
    for (const av of actualValues) {
      if (expectedValues[ei] !== undefined && av === expectedValues[ei]) {
        ei++
        if (ei === expectedValues.length) break
      }
    }
    if (ei === expectedValues.length) return { status: 'pass', detail: '' }
    return { status: 'fail', detail: `ordered subsequence not found; matched ${ei}/${expectedValues.length} expected values` }
  }
  // Row-object comparison (original envelope format)
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
