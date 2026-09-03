/**
 * Structured before/after delta for definition edits (G6 D4 — eval-driven
 * version governance). The management agent's ③ self-driven loop reads this
 * to decide its next action ("what changed last") without loading + diffing
 * full YAML snapshots.
 *
 * `computeStructuredDelta` is a pure function over two definition dicts (the
 * `before` and `after` states already available in the `edit_definition` write
 * path). It lives in the audit package (not `tool-edit-definition`) because:
 *  - the delta IS the audit-domain payload — `recordTier2Write` stores it and
 *    `listDeltasSince` reads it back, so the type + computation belong where
 *    the store is.
 *  - `tool-edit-definition` already depends on `@deepseek-ai/dsh-audit`, so no
 *    new package dependency is introduced.
 *  - centralizing here lets a future V2 (eval-run changeset) consume deltas
 *    without reaching across package boundaries.
 *
 * @module @deepseek-ai/dsh-audit/delta
 */

/**
 * A structured before/after delta between two definition states.
 *
 * - `added`: top-level fields or nested items present in `after` but not in
 *   `before`. For `columns`/`dimension_refs` the value is an object keyed by
 *   identity field (`name` / `dim_table`); for `domains`/`alt_labels` the
 *   value is an array of added set members.
 * - `modified`: top-level fields or nested items present in both but changed.
 *   Each entry carries `{ from, to }`. For `columns`/`dimension_refs`, `from`
 *   and `to` are objects keyed by identity field (only the modified entries).
 * - `removed`: dotted paths of removed items, e.g. `"columns.user_id"`,
 *   `"domains.analytics"`, or a bare top-level field name like
 *   `"granularity"`.
 *
 * When a field is unchanged it is omitted entirely from all three collections
 * (an "empty patch" yields all-empty collections).
 */
export interface StructuredDelta {
  added: Record<string, unknown>
  modified: Record<string, { from: unknown; to: unknown }>
  removed: string[]
}

/** A single delta entry returned by {@link listDeltasSince}. */
export interface DeltaEntry {
  readonly asset_name: string
  readonly kind: string
  readonly timestamp: string
  readonly delta: StructuredDelta
}

// ── internals ───────────────────────────────────────────────────────────────

/**
 * Stable JSON serialization (object keys sorted alphabetically) so two
 * semantically equal values produce identical strings regardless of key
 * insertion order. Arrays preserve element order (order IS meaningful for
 * arrays like `partitions`; for `columns`/`dimension_refs`/`domains` the diff
 * logic keys by identity/set before comparing, so raw-array order is
 * irrelevant there).
 */
function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map(stableJsonStringify).join(',')}]`
  }
  const keys = Object.keys(value).sort()
  const pairs = keys.map(
    k => `${JSON.stringify(k)}:${stableJsonStringify((value as Record<string, unknown>)[k])}`,
  )
  return `{${pairs.join(',')}}`
}

/** Deep equality via stable JSON serialization (order-insensitive for objects). */
function deepEqual(a: unknown, b: unknown): boolean {
  return stableJsonStringify(a) === stableJsonStringify(b)
}

/** Coerce a value to an array of plain objects; returns [] for non-arrays / non-object elements. */
function toObjArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (e): e is Record<string, unknown> =>
      typeof e === 'object' && e !== null && !Array.isArray(e),
  )
}

/**
 * Index an array of object records by an identity field into a map. Entries
 * lacking the identity field (or with a non-string id) are skipped (a
 * nameless column / dim-ref is not mergeable, mirroring `applyPatch`).
 */
function indexById(
  arr: readonly Record<string, unknown>[],
  idField: string,
): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>()
  for (const entry of arr) {
    const id = entry[idField]
    if (typeof id === 'string') map.set(id, entry)
  }
  return map
}

/** Result of diffing two identity-keyed object arrays (columns / dimension_refs). */
interface NameDiff {
  /** New entries keyed by identity (full record). */
  added: Record<string, unknown>
  /** Modified entries: `from`/`to` objects each keyed by identity. */
  modifiedFrom: Record<string, unknown>
  modifiedTo: Record<string, unknown>
  /** Removed identity keys. */
  removed: string[]
}

/**
 * Diff two arrays of object records keyed by an identity field (`name` for
 * columns, `dim_table` for dimension_refs). An entry is "modified" if any
 * field other than its identity changed (detected via deep-equal on the whole
 * record — the identity field itself is included in the comparison but, being
 * equal by construction, never triggers a false "modified").
 * Returns `null` when neither side is an array of objects (nothing to diff).
 */
function diffByName(
  beforeVal: unknown,
  afterVal: unknown,
  idField: string,
): NameDiff | null {
  const beforeArr = toObjArray(beforeVal)
  const afterArr = toObjArray(afterVal)
  // If neither side yielded object records, this isn't a name-keyed array —
  // fall through to the generic from/to comparison in the caller.
  if (beforeArr.length === 0 && afterArr.length === 0) return null

  const beforeMap = indexById(beforeArr, idField)
  const afterMap = indexById(afterArr, idField)

  const added: Record<string, unknown> = {}
  const modifiedFrom: Record<string, unknown> = {}
  const modifiedTo: Record<string, unknown> = {}
  const removed: string[] = []

  for (const [id, afterEntry] of afterMap) {
    const beforeEntry = beforeMap.get(id)
    if (beforeEntry === undefined) {
      added[id] = afterEntry
    } else if (!deepEqual(beforeEntry, afterEntry)) {
      modifiedFrom[id] = beforeEntry
      modifiedTo[id] = afterEntry
    }
  }
  for (const [id] of beforeMap) {
    if (!afterMap.has(id)) removed.push(id)
  }
  return { added, modifiedFrom, modifiedTo, removed }
}

/** Result of diffing two arrays under set semantics (domains / alt_labels). */
interface SetDiff {
  /** Elements in `after` but not in `before` (in after-order). */
  added: unknown[]
  /** Elements in `before` but not in `after` (in before-order). */
  removed: unknown[]
}

/**
 * Diff two arrays under set semantics: `added` = after − before, `removed` =
 * before − after. Elements are compared by their string representation (they
 * are string arrays in practice — `domains`/`alt_labels`). Non-array values
 * yield empty sets.
 */
function diffSet(beforeVal: unknown, afterVal: unknown): SetDiff {
  const beforeArr = Array.isArray(beforeVal) ? beforeVal : []
  const afterArr = Array.isArray(afterVal) ? afterVal : []
  const beforeSet = new Set(beforeArr.map(v => String(v)))
  const afterSet = new Set(afterArr.map(v => String(v)))
  const added: unknown[] = []
  const removed: unknown[] = []
  for (const item of afterArr) {
    if (!beforeSet.has(String(item))) added.push(item)
  }
  for (const item of beforeArr) {
    if (!afterSet.has(String(item))) removed.push(item)
  }
  return { added, removed }
}

// ── public ──────────────────────────────────────────────────────────────────

/**
 * Compute a structured before/after delta for two definition states.
 *
 * Nested handling:
 * - `columns`: key by `name`; a column is "modified" if any field other than
 *   its identity `name` changed. `added.columns` is an object keyed by column
 *   name → full column record. `modified.columns` is `{ from: { [name]: old },
 *   to: { [name]: new } }` (only modified columns).
 * - `dimension_refs`: key by `dim_table`; same set/diff semantics as columns.
 * - `domains` / `alt_labels`: set semantics. `added[key]` is an array of added
 *   members. Removed members are dotted paths `"key.member"` in `removed`. If
 *   unchanged, the key is omitted entirely from all three collections.
 * - other top-level fields: direct `from`/`to` comparison.
 * - empty patch (no real change) → all three collections empty.
 *
 * @param before - the before definition state.
 * @param after - the after definition state.
 * @returns the structured delta.
 */
export function computeStructuredDelta(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): StructuredDelta {
  const added: Record<string, unknown> = {}
  const modified: Record<string, { from: unknown; to: unknown }> = {}
  const removed: string[] = []

  const beforeKeys = new Set(Object.keys(before))
  const afterKeys = new Set(Object.keys(after))

  // ── Fields in after but not in before → added ──
  for (const key of afterKeys) {
    if (!beforeKeys.has(key)) {
      added[key] = after[key]
    }
  }

  // ── Fields in before but not in after → removed ──
  for (const key of beforeKeys) {
    if (!afterKeys.has(key)) {
      removed.push(key)
    }
  }

  // ── Fields in both → modified or nested diff ──
  for (const key of beforeKeys) {
    if (!afterKeys.has(key)) continue
    const bVal = before[key]
    const aVal = after[key]

    // No change → omit entirely
    if (deepEqual(bVal, aVal)) continue

    if (key === 'columns' || key === 'dimension_refs') {
      const idField = key === 'columns' ? 'name' : 'dim_table'
      const nd = diffByName(bVal, aVal, idField)
      if (nd !== null) {
        if (Object.keys(nd.added).length > 0) added[key] = nd.added
        if (Object.keys(nd.modifiedFrom).length > 0) {
          modified[key] = { from: nd.modifiedFrom, to: nd.modifiedTo }
        }
        for (const name of nd.removed) removed.push(`${key}.${name}`)
      } else {
        // Both sides degenerated to non-object arrays (or non-arrays) —
        // treat as a direct from/to modification.
        modified[key] = { from: bVal, to: aVal }
      }
    } else if (key === 'domains' || key === 'alt_labels') {
      const sd = diffSet(bVal, aVal)
      if (sd.added.length > 0) added[key] = sd.added
      for (const item of sd.removed) removed.push(`${key}.${String(item)}`)
      // If unchanged, diffSet returns empty arrays → nothing emitted (key omitted).
    } else {
      modified[key] = { from: bVal, to: aVal }
    }
  }

  return { added, modified, removed }
}
