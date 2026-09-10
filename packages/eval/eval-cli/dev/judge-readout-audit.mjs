/**
 * Judge readout audit — is the multi-dimension score actually USING its
 * dimensions, or is one dimension deciding and the rest only leaking?
 *
 * The SQL semantic judge scores N binary criteria in one call and reduces them
 * with an unweighted mean, passing at >= 0.6 (`sql_semantic_judge.ts:136-142`,
 * `runner.ts:34-35`). Nothing in the toolchain can notice if that reduction
 * degenerates: `tsc` passes, the unit tests pass (they assert the arithmetic,
 * which is correct), and `pass_rate` still looks like a plausible number. The
 * defect is at the level of the INSTRUMENT, not the code.
 *
 * This reads already-persisted results and recomputes the readout's behaviour.
 * Zero LLM calls, zero agent calls — a deterministic re-aggregation, so it is
 * cheap enough to run after every change to the judge, its prompt, its
 * dimension list, or its threshold.
 *
 * Found by R8 (2026-09-10). Baseline on `eval-results/` at that date, on
 * master `5767e7c9a4`, decision dim `overall_semantics`, threshold 0.6:
 *
 *   files: 80 total, 29 with sql_judge, 19 with non-empty dimensions
 *   vectors: 1495 (all 5 dims present, one key-set)
 *
 *   mean >= 0.6            PASS : 1377  (92.11%)
 *   overall_semantics == 1 PASS : 1249  (83.55%)
 *   decision dim 1 but readout FAIL :   0  (0.00%)   <- readout is never stricter
 *   decision dim 0 but readout PASS : 128  (8.56%)   <- the leak
 *                                                    = 52.03% of the 246 zeros
 *   P(other dims all 1 | decision=1) = 0.9984  (1247/1249)
 *   P(other dims all 1 | decision=0) = 0.0325  (8/246)
 *
 * Reading: the four non-decision dimensions carry ~no incremental information
 * when the decision dim says pass, and their only effect when it says fail is to
 * outvote it. The readout is a single-dim gate plus an 8.56pp leak.
 *
 * NOT a validity check. It says nothing about whether any verdict is CORRECT —
 * "gate is stricter" is not "gate is righter". Judging that needs execution
 * ground truth (T1). This only asks whether the readout uses its inputs.
 *
 * Usage:
 *   node packages/eval/eval-cli/dev/judge-readout-audit.mjs [resultsDir]
 *
 * Env:
 *   DECISION_DIM=overall_semantics   the dim whose verdict the readout should not contradict
 *   THRESHOLD=0.6                    readout pass threshold on the unweighted mean
 *   EXPECT_NO_LEAK=1                 exit 1 if any leak remains (for use as a gate
 *                                    once G8/T7 has changed the readout)
 *
 * Ticket: wayfinder/evaluation/tickets/R20-judge-readout-probes.md (probe a)
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const RESULTS_DIR = process.argv[2] ?? 'eval-results'
const DECISION_DIM = process.env.DECISION_DIM ?? 'overall_semantics'
const THRESHOLD = Number(process.env.THRESHOLD ?? 0.6)
const EXPECT_NO_LEAK = process.env.EXPECT_NO_LEAK === '1'

/** Every `sql_judge.dimensions` object anywhere in a result doc, with its file. */
function collectVectors(doc, file, out) {
  if (Array.isArray(doc)) {
    for (const v of doc) collectVectors(v, file, out)
    return
  }
  if (doc === null || typeof doc !== 'object') return
  const sj = doc.sql_judge
  if (sj !== null && typeof sj === 'object' && sj.dimensions !== null
      && typeof sj.dimensions === 'object' && Object.keys(sj.dimensions).length > 0) {
    out.push({ file, dims: sj.dimensions })
  }
  for (const v of Object.values(doc)) collectVectors(v, file, out)
}

const files = readdirSync(RESULTS_DIR).filter(f => f.endsWith('.json')).sort()
const vectors = []
const perFile = new Map()
let withJudge = 0
for (const f of files) {
  let doc
  try {
    doc = JSON.parse(readFileSync(join(RESULTS_DIR, f), 'utf8'))
  } catch (err) {
    console.log(`PARSE FAIL ${f}: ${err instanceof Error ? err.message : String(err)}`)
    continue
  }
  const raw = readFileSync(join(RESULTS_DIR, f), 'utf8')
  if (raw.includes('"sql_judge"')) withJudge++
  const mine = []
  collectVectors(doc, f, mine)
  if (mine.length === 0) continue
  vectors.push(...mine)
  const cfg = doc !== null && typeof doc.config === 'object' && doc.config !== null ? doc.config : null
  perFile.set(f, { n: mine.length, dims: mine, config: cfg })
}

console.log(`${RESULTS_DIR}: ${files.length} json files, ${withJudge} with sql_judge, `
  + `${perFile.size} with non-empty dimensions => ${vectors.length} attempt-level vectors`)
if (vectors.length === 0) {
  // In gate mode an empty scan MUST fail: if a schema change renames
  // `sql_judge.dimensions`, a gate that "passes" because it can no longer see
  // any vectors is exactly the silent instrument death this script exists to
  // catch. Report-only mode stays exit 0.
  console.log('nothing to audit')
  if (EXPECT_NO_LEAK) {
    console.log('FAIL: EXPECT_NO_LEAK=1 but zero vectors found — the gate is blind, not clean')
    process.exit(2)
  }
  process.exit(0)
}

// Key-sets: a readout change may alter the dimension list, so never assume 5.
const keySets = new Map()
for (const { dims } of vectors) {
  const k = Object.keys(dims).sort().join(',')
  keySets.set(k, (keySets.get(k) ?? 0) + 1)
}
console.log(`\ndistinct dimension key-sets: ${keySets.size}`)
for (const [k, c] of [...keySets].sort((a, b) => b[1] - a[1])) console.log(`  ${String(c).padStart(5)} x [${k}]`)

/**
 * Report dimensions in the order the judge prompt lists them, not alphabetically —
 * pattern tuples printed here get compared by eye against the pinned baseline
 * above and against `research/experiment-audit-log.md`, and a silently different
 * column order reads as "the numbers moved". Unknown dims keep their own order,
 * appended after the known ones.
 */
const PROMPT_ORDER = [
  'table_selection', 'field_selection', 'filter_conditions', 'aggregation_logic', 'overall_semantics',
]
function orderDims(dims) {
  const known = PROMPT_ORDER.filter(d => dims.includes(d))
  return [...known, ...dims.filter(d => !known.includes(d))]
}

const DIMS = orderDims([...keySets.keys()][0].split(','))
if (!DIMS.includes(DECISION_DIM)) {
  console.log(`\nDECISION_DIM=${DECISION_DIM} is not among the dimensions; set it via env. Aborting.`)
  process.exit(2)
}
const OTHERS = DIMS.filter(d => d !== DECISION_DIM)
// Only vectors carrying the full dominant key-set take part in the arithmetic.
const full = vectors.filter(v => DIMS.every(d => d in v.dims))
if (full.length !== vectors.length) {
  console.log(`\n${vectors.length - full.length} vectors dropped (partial key-set); auditing ${full.length}`)
}

const score = v => DIMS.reduce((s, d) => s + (v.dims[d] === 1 ? 1 : 0), 0) / DIMS.length
const pct = (a, b) => `${(100 * a / b).toFixed(2)}%`

console.log(`\n=== marginal pass rate per dimension (n=${full.length}) ===`)
for (const d of DIMS) {
  const n1 = full.filter(v => v.dims[d] === 1).length
  console.log(`  ${d.padEnd(22)} mean=${(n1 / full.length).toFixed(4)}  n1=${n1}  n0=${full.length - n1}`
    + (d === DECISION_DIM ? '   <- decision dim' : ''))
}

console.log(`\n=== joint patterns (order: ${DIMS.join(', ')}) ===`)
const pat = new Map()
for (const v of full) {
  const k = DIMS.map(d => (v.dims[d] === 1 ? 1 : 0)).join(',')
  pat.set(k, (pat.get(k) ?? 0) + 1)
}
const allOnes = DIMS.map(() => 1).join(',')
for (const [k, c] of [...pat].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  (${k}) ${String(c).padStart(5)}  ${pct(c, full.length).padStart(7)}${k === allOnes ? '  <- all ones' : ''}`)
}
console.log(`  ${pat.size} of ${2 ** DIMS.length} possible patterns observed`)

console.log(`\n=== score distribution (unweighted mean, threshold ${THRESHOLD}) ===`)
const sc = new Map()
for (const v of full) {
  const s = score(v).toFixed(1)
  sc.set(s, (sc.get(s) ?? 0) + 1)
}
for (const s of [...sc.keys()].sort()) {
  console.log(`  ${s}: ${String(sc.get(s)).padStart(5)}  ${pct(sc.get(s), full.length).padStart(7)}  `
    + `${Number(s) >= THRESHOLD ? 'PASS' : 'fail'}`)
}

// ---- the four headline numbers ----
const readoutPass = full.filter(v => score(v) >= THRESHOLD)
const gatePass = full.filter(v => v.dims[DECISION_DIM] === 1)
const contradictStrict = full.filter(v => v.dims[DECISION_DIM] === 1 && score(v) < THRESHOLD)
const leak = full.filter(v => v.dims[DECISION_DIM] !== 1 && score(v) >= THRESHOLD)
const decisionZero = full.filter(v => v.dims[DECISION_DIM] !== 1)

console.log(`\n=== READOUT AUDIT (decision dim = ${DECISION_DIM}) ===`)
const label = s => s.padEnd(38)
console.log(`  ${label(`readout (mean >= ${THRESHOLD}) PASS`)}: ${String(readoutPass.length).padStart(5)}  ${pct(readoutPass.length, full.length)}`)
console.log(`  ${label(`gate (${DECISION_DIM} == 1) PASS`)}: ${String(gatePass.length).padStart(5)}  ${pct(gatePass.length, full.length)}`)
console.log(`  ${label('decision=1 but readout FAIL')}: ${String(contradictStrict.length).padStart(5)}  ${pct(contradictStrict.length, full.length)}   <- readout stricter than gate`)
console.log(`  ${label('decision=0 but readout PASS  (LEAK)')}: ${String(leak.length).padStart(5)}  ${pct(leak.length, full.length)}   <- readout looser than gate`)
if (decisionZero.length > 0) {
  console.log(`  => of the ${decisionZero.length} attempts the judge itself failed on ${DECISION_DIM}, `
    + `${leak.length} (${pct(leak.length, decisionZero.length)}) still passed`)
}

if (leak.length > 0) {
  console.log(`\n  leak patterns:`)
  const lp = new Map()
  for (const v of leak) {
    const k = DIMS.map(d => (v.dims[d] === 1 ? 1 : 0)).join(',')
    lp.set(k, (lp.get(k) ?? 0) + 1)
  }
  for (const [k, c] of [...lp].sort((a, b) => b[1] - a[1])) {
    console.log(`    (${k}) score=${(k.split(',').reduce((s, x) => s + Number(x), 0) / DIMS.length).toFixed(1)}  ${c}`)
  }
}

console.log(`\n=== conditional degeneracy: do the other dims add information? ===`)
for (const want of [1, 0]) {
  const sub = full.filter(v => (v.dims[DECISION_DIM] === 1 ? 1 : 0) === want)
  if (sub.length === 0) continue
  const allOther = sub.filter(v => OTHERS.every(d => v.dims[d] === 1))
  console.log(`  P(other dims all 1 | ${DECISION_DIM}=${want}) = ${(allOther.length / sub.length).toFixed(4)}`
    + `  (${allOther.length}/${sub.length})`)
  if (want === 0) {
    for (const d of OTHERS) {
      console.log(`      ${d.padEnd(22)} mean=${(sub.filter(v => v.dims[d] === 1).length / sub.length).toFixed(4)}`)
    }
  }
}

console.log(`\n=== per-run stratification (is this one bad run, or the rule?) ===`)
const rows = [...perFile.entries()].map(([f, r]) => {
  const ones = r.dims.filter(v => DIMS.every(d => v.dims[d] === 1)).length
  return {
    f, n: r.n, ones: 100 * ones / r.n,
    withQuery: r.config === null ? '' : String(r.config.with_query ?? ''),
    model: r.config === null ? '' : String(r.config.model ?? ''),
  }
}).sort((a, b) => b.n - a.n)
console.log(`  ${'file'.padEnd(42)}${'n'.padStart(6)}${'all-ones%'.padStart(11)}${'with_query'.padStart(12)}${'model'.padStart(15)}`)
for (const r of rows) {
  console.log(`  ${r.f.slice(0, 40).padEnd(42)}${String(r.n).padStart(6)}${r.ones.toFixed(1).padStart(11)}`
    + `${r.withQuery.padStart(12)}${r.model.slice(0, 13).padStart(15)}`)
}
const recoverable = rows.filter(r => r.withQuery !== '').reduce((s, r) => s + r.n, 0)
console.log(`\n  execution mode recoverable (config.with_query present) for `
  + `${recoverable}/${full.length} vectors (${pct(recoverable, full.length)}); `
  + `the rest cannot be told apart judge-only vs real-exec`)

if (EXPECT_NO_LEAK && leak.length > 0) {
  console.log(`\nFAIL: EXPECT_NO_LEAK=1 but ${leak.length} attempts passed with ${DECISION_DIM}=0`)
  process.exit(1)
}
