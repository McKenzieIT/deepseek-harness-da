/**
 * P13b NL→SQL engine — EXECUTION scorer (5 match_mode, direct-translation of
 * the rbi 5 match_mode, G2 EXECUTION judging layer). Ported from
 * `prototypes/p13-nl2sql-engine/eval/scorer.mjs`.
 *
 * Runs the engine → stand-in ODPS executes → compares the result set vs
 * `expected.result_value`. No sqlglot (G2 Q1 decision: EXECUTION + DELIVERY,
 * data-equivalence over SQL-form). This module implements EXECUTION (DELIVERY
 * is P11 production).
 *
 * @module @deepseek-ai/dsh-nl2sql-engine/src/eval/scorer
 */
import { MatchMode } from '../types.ts'
import type { EngineRunResult } from '../engine.ts'
import type { EvalCaseExpected } from './cases.ts'

/** First row, first column as a number (scalar judging). */
function firstScalar(rows: readonly unknown[] | undefined): number | null {
  if (!rows || rows.length === 0) return null
  const v = Object.values(rows[0] as Record<string, unknown>)[0]
  if (typeof v === 'number') return v
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Canonical row key (sorted-keys JSON, so column order does not matter). */
function rowKey(row: Record<string, unknown>): string {
  return JSON.stringify(Object.keys(row).sort().reduce<Record<string, unknown>>((o, k) => { o[k] = row[k]; return o }, {}))
}

function rowSet(rows: readonly unknown[] | undefined): Set<string> {
  return new Set((rows ?? []).map(r => rowKey(r as Record<string, unknown>)))
}

/**
 * Compare an engine run result against an eval case's expected outcome using
 * the 5 match modes (scalar exact / value close / set exact / set subset /
 * null-check decline).
 *
 * @param runResult - The engine run result to judge.
 * @param expected - The eval case's expected outcome and match mode.
 * @returns True when the result matches the expected outcome under the match mode.
 */
export function scoreMatch(runResult: EngineRunResult, expected: EvalCaseExpected): boolean {
  // null_check / decline case
  if (expected.decline || expected.match_mode === MatchMode.NULL_CHECK) {
    return runResult.decline === true
  }
  if (runResult.decline) return false // expected done but declined → fail
  const rows = runResult.result ?? []
  switch (expected.match_mode) {
    case MatchMode.SCALAR_EXACT:
      return firstScalar(rows) === Number(expected.result_value)
    case MatchMode.VALUE_CLOSE: {
      const a = firstScalar(rows)
      const eps = expected.eps ?? 0.01
      return a != null && Math.abs(a - Number(expected.result_value)) < eps
    }
    case MatchMode.SET_EXACT: {
      if (!Array.isArray(expected.result_value)) return false
      const a = rowSet(rows)
      const b = rowSet(expected.result_value)
      if (a.size !== b.size) return false
      for (const k of a) if (!b.has(k)) return false
      return true
    }
    case MatchMode.SET_SUBSET: {
      if (!Array.isArray(expected.result_value)) return false
      const a = rowSet(rows)
      const b = rowSet(expected.result_value)
      for (const k of a) if (!b.has(k)) return false
      return true
    }
    default:
      return false
  }
}
