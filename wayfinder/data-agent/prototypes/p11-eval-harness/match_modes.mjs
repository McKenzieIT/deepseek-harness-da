// PROTOTYPE (throwaway) — P11 eval harness · 5 match_mode — 1:1 translation of rbi
// scoring/match_modes.py (research Claim C: pure dict/row comparison, zero external deps).
//
// Envelope convention for `expected.result_value` (a single object encoding the comparison target
// per mode — rbi makes this explicit so case authors know what shape to provide):
//   scalar_exact:       { value: <scalar> }
//   multi_scalar_exact: { fields: { <name>: <expected>, ... } }   // or single-element array
//   row_count_range:    { min: <int>, max: <int> }
//   set_equal:          { rows: [ <row>, ... ] }
//   ordered_subset:     { rows: [ <row>, ... ] }
//
// Returns { status: 'pass' | 'fail', detail }.

export function checkResultMatch(expected, actualRows, matchMode) {
  const handler = {
    scalar_exact: _scalarExact,
    multi_scalar_exact: _multiScalarExact,
    row_count_range: _rowCountRange,
    set_equal: _setEqual,
    ordered_subset: _orderedSubset,
  }[matchMode]
  if (!handler) return { status: 'fail', detail: `unknown match_mode: ${matchMode}` }
  return handler(expected, actualRows)
}

function _scalarExact(expected, actualRows) {
  if (!('value' in expected))
    return { status: 'fail', detail: "malformed result_value for scalar_exact: missing 'value' key" }
  const target = expected.value
  if (!actualRows.length)
    return { status: 'fail', detail: `no rows returned; expected scalar ${JSON.stringify(target)}` }
  const firstRow = actualRows[0]
  const actualValues = Object.values(firstRow)
  if (!actualValues.length) return { status: 'fail', detail: 'first row has no columns' }
  const actual = actualValues[0]
  if (actual === target) return { status: 'pass' }
  return { status: 'fail', detail: `expected ${JSON.stringify(target)}, got ${JSON.stringify(actual)}` }
}

function _multiScalarExact(expected, actualRows) {
  if (!('fields' in expected))
    return { status: 'fail', detail: "malformed result_value for multi_scalar_exact: missing 'fields' key" }
  let rawFields = expected.fields
  if (Array.isArray(rawFields)) {
    if (!rawFields.length) return { status: 'fail', detail: 'fields list is empty' }
    rawFields = rawFields[0]
  }
  if (typeof rawFields !== 'object' || rawFields === null)
    return { status: 'fail', detail: 'fields must be an object or single-element array of objects' }
  const fields = rawFields
  if (!actualRows.length) return { status: 'fail', detail: 'no rows returned; expected field values' }
  const firstRow = actualRows[0]
  const mismatches = []
  for (const [name, expVal] of Object.entries(fields)) {
    if (!(name in firstRow)) mismatches.push(`${name}: missing from result`)
    else if (firstRow[name] !== expVal)
      mismatches.push(`${name}: expected ${JSON.stringify(expVal)}, got ${JSON.stringify(firstRow[name])}`)
  }
  if (mismatches.length) return { status: 'fail', detail: mismatches.join('; ') }
  return { status: 'pass' }
}

function _rowCountRange(expected, actualRows) {
  if (!('min' in expected) || !('max' in expected))
    return { status: 'fail', detail: "malformed result_value for row_count_range: missing 'min' and/or 'max' key" }
  const lo = expected.min
  const hi = expected.max
  const count = actualRows.length
  if (lo <= count && count <= hi) return { status: 'pass' }
  return { status: 'fail', detail: `row_count ${count} not in [${lo}, ${hi}]` }
}

function _setEqual(expected, actualRows) {
  if (!('rows' in expected))
    return { status: 'fail', detail: "malformed result_value for set_equal: missing 'rows' key" }
  const expectedSet = new Set(expected.rows.map(rowKey))
  const actualSet = new Set(actualRows.map(rowKey))
  if (setsEqual(expectedSet, actualSet)) return { status: 'pass' }
  const missing = [...expectedSet].filter((k) => !actualSet.has(k))
  const extra = [...actualSet].filter((k) => !expectedSet.has(k))
  const parts = []
  if (missing.length) parts.push(`missing ${missing.length} expected row(s)`)
  if (extra.length) parts.push(`${extra.length} unexpected row(s)`)
  return { status: 'fail', detail: parts.join('; ') }
}

function _orderedSubset(expected, actualRows) {
  if (!('rows' in expected))
    return { status: 'fail', detail: "malformed result_value for ordered_subset: missing 'rows' key" }
  const expectedRows = expected.rows
  if (!expectedRows.length) return { status: 'pass' }
  // list (order preserved, dupes kept) — NOT a set: ordered_subset walks actual in order.
  const actualFrozen = actualRows.map(rowKey)
  const expectedFrozen = expectedRows.map(rowKey)
  let ei = 0
  for (const ar of actualFrozen) {
    if (ar === expectedFrozen[ei]) {
      ei++
      if (ei === expectedFrozen.length) break
    }
  }
  if (ei === expectedFrozen.length) return { status: 'pass' }
  return {
    status: 'fail',
    detail: `ordered subsequence not found; matched ${ei}/${expectedFrozen.length} expected rows`,
  }
}

// rbi uses frozenset(sorted(r.items())) per row — a canonical, order-independent-within-row fingerprint
// that also dedupes (set semantics). A sorted "k=v|k=v" string mirrors it for JS.
function rowKey(r) {
  return Object.keys(r)
    .sort()
    .map((k) => `${k}=${JSON.stringify(r[k])}`)
    .join('|')
}
function setsEqual(a, b) {
  if (a.size !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  return true
}
