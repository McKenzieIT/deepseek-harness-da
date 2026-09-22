/**
 * Reference-SQL template resolution. `rbi-10000251-exec` cases carry a
 * human-written `expected.sql` that is a *template*, not executable SQL: 37 of
 * 39 embed `{{ds_yesterday}}` or `{{ds_7d_ago}}`, which bind against that
 * case's own `meta.anchor_ds`. Executing an unresolved template silently
 * queries the literal string `{{ds_yesterday}}`, so resolution is a required
 * step between loading a case and running its reference SQL.
 *
 * The placeholder set is closed: an unrecognized placeholder is refused rather
 * than passed through, because passing it through produces SQL that runs and
 * returns the wrong answer. A template whose case declares no anchor is refused
 * for the same reason.
 *
 * `anchor_ds` is the date the template resolves against. Whether it identifies
 * a *frozen* snapshot is a separate question this module does not answer — event
 * partitions are known not to freeze, so for event cases the anchor is not a
 * valid snapshot identity.
 *
 * @module @deepseek-ai/dsh-eval/reference_sql
 */

import type { EvalCase } from './eval_case.ts'

/**
 * The placeholders a reference-SQL template may use, each an offset from the
 * case's `meta.anchor_ds`. Closed set — extending it is a schema decision, not
 * a per-case one.
 */
export const REFERENCE_PLACEHOLDERS = ['ds_yesterday', 'ds_7d_ago'] as const

/** A placeholder a reference-SQL template may use. */
export type ReferencePlaceholder = typeof REFERENCE_PLACEHOLDERS[number]

/** Day offsets from `meta.anchor_ds` for each placeholder. */
const PLACEHOLDER_OFFSET_DAYS: Record<ReferencePlaceholder, number> = {
  ds_yesterday: -1,
  ds_7d_ago: -7,
}

/** Why a reference SQL template could not be resolved to executable SQL. */
export type ReferenceSqlRefusal = 'missing-anchor' | 'unknown-placeholder' | 'malformed-template' | 'malformed-anchor'

/**
 * The outcome of resolving one case's reference SQL. `absent` is not a failure:
 * `k11-v2` cases carry no reference SQL at all.
 */
export type ReferenceSqlResolution =
  | {
    kind: 'resolved'
    /** Executable SQL, with every placeholder substituted. */
    sql: string
    /** The anchor the substitutions were derived from, absent if the template needed none. */
    anchorDs: string | undefined
    /** Each substituted placeholder and the `ds` it became — replay evidence. */
    substitutions: Partial<Record<ReferencePlaceholder, string>>
  }
  | { kind: 'absent' }
  | { kind: 'unresolvable'; reason: ReferenceSqlRefusal; detail: string }

/** Matches complete `{{...}}` placeholder-like segments so malformed names cannot pass through. */
const PLACEHOLDER_RE = /\{\{([^{}]*)\}\}/g

/** A syntactically valid placeholder name. */
const PLACEHOLDER_NAME_RE = /^\w+$/

/** An 8-digit `yyyymmdd` partition date. */
const DS_RE = /^\d{8}$/

/**
 * Resolve a case's reference SQL against its own `meta.anchor_ds`.
 * @param c - the loaded case.
 * @returns the executable SQL, `absent` if the case declares none, or a refusal.
 */
export function resolveReferenceSql(c: EvalCase): ReferenceSqlResolution {
  const template = c.expected.sql
  if (template === undefined || template === '') return { kind: 'absent' }

  const used: ReferencePlaceholder[] = []
  const unknown: string[] = []
  // `PLACEHOLDER_RE` has one mandatory capture group, so every match carries a name.
  for (const [, name] of template.matchAll(PLACEHOLDER_RE) as Iterable<[string, string]>) {
    if (!PLACEHOLDER_NAME_RE.test(name)) {
      return { kind: 'unresolvable', reason: 'malformed-template', detail: `case ${c.case_id} reference SQL contains malformed placeholder ${JSON.stringify(`{{${name}}}`)}` }
    }
    if (isReferencePlaceholder(name)) {
      if (!used.includes(name)) used.push(name)
    } else if (!unknown.includes(name)) {
      unknown.push(name)
    }
  }
  const unmatchedDelimiters = template.replace(PLACEHOLDER_RE, '')
  if (unmatchedDelimiters.includes('{{') || unmatchedDelimiters.includes('}}')) {
    return { kind: 'unresolvable', reason: 'malformed-template', detail: `case ${c.case_id} reference SQL contains an unmatched template delimiter` }
  }
  if (unknown.length > 0) {
    return { kind: 'unresolvable', reason: 'unknown-placeholder', detail: `case ${c.case_id} reference SQL uses unknown placeholder(s) ${unknown.join(', ')}; supported: ${REFERENCE_PLACEHOLDERS.join(', ')}` }
  }

  const anchorDs = c.meta?.anchor_ds
  if (used.length === 0) return { kind: 'resolved', sql: template, anchorDs, substitutions: {} }

  if (anchorDs === undefined) {
    return { kind: 'unresolvable', reason: 'missing-anchor', detail: `case ${c.case_id} reference SQL uses ${used.join(', ')} but declares no meta.anchor_ds` }
  }
  const anchorDate = parseDs(anchorDs)
  if (anchorDate === null) {
    return { kind: 'unresolvable', reason: 'malformed-anchor', detail: `case ${c.case_id} meta.anchor_ds ${JSON.stringify(anchorDs)} is not yyyymmdd` }
  }

  const pairs = used.map(name => [name, shiftDate(anchorDate, PLACEHOLDER_OFFSET_DAYS[name])] as const)
  let sql = template
  for (const [name, ds] of pairs) sql = sql.replaceAll(`{{${name}}}`, ds)
  return { kind: 'resolved', sql, anchorDs, substitutions: Object.fromEntries(pairs) }
}

/** Whether `name` is one of the supported placeholders. */
function isReferencePlaceholder(name: string): name is ReferencePlaceholder {
  return (REFERENCE_PLACEHOLDERS as readonly string[]).includes(name)
}

/**
 * Parse a real `yyyymmdd` calendar date without allowing JavaScript rollover.
 * @param ds - the candidate partition date.
 * @returns the UTC date, or `null` when the components do not round-trip.
 */
function parseDs(ds: string): Date | null {
  if (!DS_RE.test(ds)) return null
  const year = Number(ds.slice(0, 4))
  const month = Number(ds.slice(4, 6))
  const day = Number(ds.slice(6, 8))
  const date = new Date(0)
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCFullYear(year, month - 1, day)
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return date
}

/**
 * Shift a partition date by whole days, in UTC so the host timezone
 * cannot move a partition.
 * @param date - the validated UTC date.
 * @param deltaDays - days to add (negative to go back).
 * @returns the shifted `yyyymmdd` date.
 */
function shiftDate(date: Date, deltaDays: number): string {
  const dt = new Date(date)
  dt.setUTCDate(dt.getUTCDate() + deltaDays)
  const month = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const day = String(dt.getUTCDate()).padStart(2, '0')
  return `${dt.getUTCFullYear()}${month}${day}`
}
