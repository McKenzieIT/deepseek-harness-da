/**
 * METRIC_EVAL_CASES — scripted ODPS substring alignment (nl2sql-11).
 *
 * StandInOdps.execute matches the candidate SQL via `sql.includes(sub)`, where
 * `sql` is the output of `extractSqlCandidate` (which collapses whitespace runs
 * but does NOT add spaces around `=`). The scripted `odps.sub` strings must
 * therefore appear verbatim in `extractSqlCandidate(llm.sql)` — a spaced
 * `ds = '...'` won't match an LLM `ds='...'`. These cases were left stale when
 * the Level 2.5 deterministic builder was removed (M1b); this test pins the
 * alignment so the fixtures stay runnable if a runner wires them up.
 */
import { describe, expect, it } from 'vitest'
import { extractSqlCandidate } from '../src/critic.ts'
import { METRIC_EVAL_CASES } from '../src/eval/metric-cases.ts'

describe('METRIC_EVAL_CASES — odps.sub matches the extracted LLM SQL (nl2sql-11)', () => {
  for (const c of METRIC_EVAL_CASES) {
    it(`${c.id}: odps.sub is a substring of extractSqlCandidate(llm.sql)`, () => {
      // METRIC_EVAL_CASES use the { sql } object form + a defined odps. Narrow
      // (ScriptedGen is a union with a function form; odps is optional) so a
      // future fixture changing shape fails loud rather than vacuously passing.
      const llm = c.llm
      if (typeof llm === 'function') throw new Error(`${c.id}: unexpected function-form llm`)
      const odps = c.odps
      if (odps === undefined) throw new Error(`${c.id}: missing odps fixture`)
      const sql = extractSqlCandidate(llm.sql)
      expect(sql).not.toBeNull()
      expect(sql ?? '').toContain(odps.sub)
    })
  }
})
