/**
 * Score a real-exec eval artifact TWICE: as shipped (against each case's
 * `expected.result_value`) and re-anchored (event cases against the value their
 * OWN reference SQL returns live).
 *
 * Needed because 16/18 event cases' recorded values no longer match their own
 * reference SQL — the raw event ODS view's historical partition is not a frozen
 * anchor, while the DWS tables are (see `case-expected-value-audit.mjs` and
 * GA-EVAL-CASESET-EVENT-ANCHOR). As shipped, an agent that computes the exactly
 * correct number still scores `wrong`, so the as-shipped pass_rate cannot say
 * whether event-case SQL got better. The re-anchored number can.
 *
 * Non-event cases keep their shipped verdict — the audit found their recorded
 * values still exact. Event cases must match the live anchor on EVERY attempt,
 * mirroring `passKVerdict`'s all-must-pass semantics.
 *
 * The anchor is only as fresh as the audit log you pass in; re-run the audit if
 * hours have passed, and note the anchor time alongside any number you report.
 *
 * First use (GA-EVAL-EVENTDEF-PREFETCH, 2026-09-06, run `eventdef-realexec`):
 *   as-shipped  2/39 = 5.1%   (event cases 0/18)
 *   re-anchored 5/39 = 12.8%  (event cases 3/18 — 119/125/126 exact on all 3 attempts)
 *
 * Usage: node packages/eval/eval-cli/dev/reanchored-score.mjs <artifact.json> <audit-event.log>
 */
import { readFileSync } from 'node:fs'

const artifact = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const auditLog = readFileSync(process.argv[3], 'utf8')

// Parse `[119] live=552 expected=510 rows=1` from the audit log.
const live = new Map()
for (const m of auditLog.matchAll(/^\[(\d+)\] live=(\S+) expected=(\S+)/gm)) {
  live.set(m[1], { live: JSON.parse(m[2]), recorded: JSON.parse(m[3]) })
}

const EVENT = new Set(['056', '057', '119', '120', '121', '122', '123', '124', '125', '126', '127', '128', '129', '130', '135', '136', '137', '138'])

/** Pull the first scalar out of an eval query_result (shape: [[v]] or [{k:v}]). */
function firstScalar(qr) {
  if (!Array.isArray(qr) || qr.length === 0) return null
  const row = qr[0]
  if (Array.isArray(row)) return row.length > 0 ? row[0] : null
  if (row !== null && typeof row === 'object') { const vs = Object.values(row); return vs.length > 0 ? vs[0] : null }
  return row
}

const near = (a, b) => a !== null && b !== null && Number.isFinite(Number(a)) && Number.isFinite(Number(b))
  && Math.abs(Number(a) - Number(b)) <= Math.max(1e-9, Math.abs(Number(b)) * 1e-9)

let shipped = 0, reanchored = 0
const rows = []
for (const c of artifact.cases) {
  const id = c.case_id.replace('eval_10000251_', '')
  const isEvent = EVENT.has(id)
  const shippedPass = c.verdict === 'correct'
  if (shippedPass) shipped++

  // Re-anchored: for event cases, every attempt must match the live value of the
  // case's own reference SQL (mirrors passKVerdict = all-must-pass). Non-event
  // cases keep their shipped verdict — the audit found their values still accurate.
  let reanchoredPass = shippedPass
  let detail = ''
  if (isEvent) {
    const anchor = live.get(id)
    if (anchor === undefined) { detail = 'no live anchor'; }
    else {
      const got = c.pass_k_results.map(r => firstScalar(r.query_result))
      const all = got.length > 0 && got.every(v => near(v, anchor.live))
      reanchoredPass = all
      detail = `live=${anchor.live} recorded=${anchor.recorded} got=[${got.map(v => JSON.stringify(v)).join(',')}]`
    }
  }
  if (reanchoredPass) reanchored++
  const usedView = c.pass_k_results.some(r => /ods_10000251_all_view/i.test(r.generated_sql || ''))
  rows.push(`${isEvent ? 'EVENT' : 'dws  '} ${id} shipped=${shippedPass ? 'PASS' : c.verdict.padEnd(4)} reanchored=${reanchoredPass ? 'PASS' : 'fail'} eventView=${usedView ? 'Y' : 'n'} ${detail}`)
}

console.log(rows.join('\n'))
const n = artifact.cases.length
console.log(`\nas-shipped : ${shipped}/${n} = ${(shipped / n * 100).toFixed(1)}%`)
console.log(`re-anchored: ${reanchored}/${n} = ${(reanchored / n * 100).toFixed(1)}%   (event cases scored against their own reference SQL's live value)`)
const evIds = [...EVENT].filter(id => artifact.cases.some(c => c.case_id.endsWith(id)))
const evShipped = evIds.filter(id => artifact.cases.find(c => c.case_id.endsWith(id)).verdict === 'correct').length
const evRe = rows.filter(r => r.startsWith('EVENT') && r.includes('reanchored=PASS')).length
console.log(`event cases: as-shipped ${evShipped}/${evIds.length}, re-anchored ${evRe}/${evIds.length}`)
