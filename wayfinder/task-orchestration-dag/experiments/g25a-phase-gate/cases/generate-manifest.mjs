/**
 * Emit `cases/manifest.json` — the frozen 36-case decision set for G25a.
 *
 * Twelve real-execution cases come from `packages/eval/eval/cases/rbi-10000251-exec`
 * (the only case set in the repo carrying reference SQL) and are exactly the twelve
 * whose oracle reproduced on a non-degenerate value in the 2026-09-17 audit.
 * Twenty-four behavioural cases come from `cases/challenge/`.
 *
 * The Task working set is ONE fixed envelope. Only the goal line and the absolute
 * dates vary per case; the read-only constraint, acceptance condition, evidence
 * requirement, and budget are byte-identical across all 36 cases and all three
 * arms. That is deliberate and load-bearing twice over: it makes the ticket's
 * "Task 工作集逐字节相同" check trivially true, and it stops the envelope from
 * leaking which category a case belongs to — an acceptance clause that said
 * "expect a clarifying question" would hand the model the answer on the ambiguity
 * cases. The uniform acceptance text therefore states the policy for all four
 * behaviours at once and lets the model decide which applies.
 *
 * The envelope never carries reference SQL, expected values, grading rules, or any
 * other Private Grading Material.
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import yaml from 'js-yaml'

const HERE = dirname(new URL(import.meta.url).pathname)
const REPO = join(HERE, '../../../../..')
const RBI_DIR = join(REPO, 'packages/eval/eval/cases/rbi-10000251-exec')
const CHALLENGE_DIR = join(HERE, 'challenge')
const SEMANTIC_ROOT = join(REPO, 'examples/k11-semantic-layer')

const REFERENCE_DATE = '2026-08-06'
const SUBS = { ds_yesterday: '20260805', ds_7d_ago: '20260730' }

/** The twelve cases whose reference SQL reproduced exactly on a non-degenerate value. */
const VERIFIED = ['036', '037', '038', '039', '040', '041', '042', '043', '046', '048', '055', '060']

const BUDGET = { max_llm_calls: 20, max_query_data_calls: 8, wall_clock_seconds: 300 }

const sha256 = (s) => createHash('sha256').update(s).digest('hex')

/**
 * The one fixed envelope. `goal` and `dates` are the only substitutions.
 * Everything else is constant across every case and every arm.
 */
function taskWorkingSet(goal, dateLines) {
  return [
    `【任务】${goal}`,
    '',
    '【数据域】scope k11，数据域 10000251，MaxCompute project ieu_cdm',
    `【数据快照日期】${REFERENCE_DATE}`,
    `【本题涉及的绝对日期】${dateLines}`,
    '【只读约束】只允许 SELECT 查询。禁止任何写入、建表、删除、修改或授权操作。',
    '【验收条件】'
      + '若问题在当前数据域内可答且口径唯一，给出具体数值答案，并说明该数值来自哪张表、哪个分区、使用了哪些过滤条件。'
      + '若同一名称在当前数据域内存在多个仍然成立且没有默认的口径，先提出一个具体的澄清问题，不要自行选定口径。'
      + '若当前数据域内没有可支撑该问题的表、事件或字段，明确说明无法回答，不要用相近指标替代。'
      + '若查询持续失败，明确说明数据不可得。',
    '【证据要求】'
      + '答案中的每个业务数值、趋势、排名和归因都必须来自一次成功的 query_data 执行结果。'
      + '没有成功的查询结果时，不要给出估计值或缓存值，也不要把 SQL 文本当作已验证的业务结果。',
    `【预算】最多 ${BUDGET.max_llm_calls} 次模型调用，最多 ${BUDGET.max_query_data_calls} 次 query_data 调用，本次执行总时长上限 ${BUDGET.wall_clock_seconds} 秒。`,
  ].join('\n')
}

const substitute = (sql) => sql.replace(/\{\{(\w+)\}\}/g, (m, k) => SUBS[k] ?? m).trim().replace(/;\s*$/, '')

/** Absolute ds literals the resolved reference SQL touches, in ascending order. */
function dsLiterals(sql) {
  return [...new Set(sql.match(/'(20\d{6})'/g) ?? [])].map(s => s.replaceAll("'", '')).sort()
}

const fmt = (ds) => `${ds.slice(0, 4)}-${ds.slice(4, 6)}-${ds.slice(6, 8)}`

const cases = []

// ── real-execution slice ────────────────────────────────────────────────────
for (const id of VERIFIED) {
  const file = join(RBI_DIR, `eval_10000251_${id}.yaml`)
  const bytes = readFileSync(file, 'utf8')
  const doc = yaml.load(bytes)
  const sql = substitute(doc.expected.sql)
  const ds = dsLiterals(sql)
  if (ds.length === 0) throw new Error(`case ${id}: reference SQL has no absolute ds literal after substitution`)
  const dateLines = ds.length === 1
    ? `${fmt(ds[0])}（分区 ds=${ds[0]}）`
    : `${fmt(ds[0])} 至 ${fmt(ds[ds.length - 1])}（分区 ds 从 ${ds[0]} 到 ${ds[ds.length - 1]}）`
  cases.push({
    case_id: `g25a_exec_${id}`,
    type: 'real_execution',
    source: {
      benchmark: relative(REPO, RBI_DIR),
      case_id: doc.case_id,
      content_digest: sha256(bytes),
      oracle_status: 'verified 2026-09-17: reference SQL reproduced expected value exactly, non-degenerate',
    },
    goal: doc.input.question,
    absolute_dates: ds,
    dimensions: doc.dimensions ?? {},
    task_working_set: taskWorkingSet(doc.input.question, dateLines),
    grading: {
      policy: 'real_execution',
      // Private Grading Material — read only by the grader, never by the model.
      reference_sql: sql,
      expected_value: doc.expected.result_value.value,
      match_mode: Array.isArray(doc.expected.result_value.value) ? 'row_set' : 'scalar_exact',
      stability_probe: 'execute reference_sql at batch start and batch end; drop the case from both arms if the result digest differs',
    },
    fault_injection: null,
    budget: BUDGET,
  })
}

// ── behavioural slice ───────────────────────────────────────────────────────
for (const f of readdirSync(CHALLENGE_DIR).filter(n => n.endsWith('.yaml')).sort()) {
  const bytes = readFileSync(join(CHALLENGE_DIR, f), 'utf8')
  const doc = yaml.load(bytes)
  const dateLines = `${fmt(doc.dates.yesterday_ds)}（分区 ds=${doc.dates.yesterday_ds}）`
  cases.push({
    case_id: doc.case_id,
    type: doc.type,
    source: {
      benchmark: relative(REPO, CHALLENGE_DIR),
      case_id: doc.case_id,
      content_digest: sha256(bytes),
      oracle_status: 'behavioural — graded from Session evidence, no warehouse reference result',
    },
    goal: doc.input.question,
    absolute_dates: [doc.dates.yesterday_ds],
    dimensions: {},
    task_working_set: taskWorkingSet(doc.input.question, dateLines),
    grading: { policy: doc.type, ...doc.grading, expectation: doc.expectation },
    fault_injection: doc.fault_injection ?? null,
    budget: BUDGET,
  })
}

// ── invariants that must hold before a decision batch may run ───────────────
const envelopes = cases.map(c => c.task_working_set)
const constantTail = (s) => s.split('\n').slice(5).join('\n') // everything after the per-case date line
const tails = new Set(envelopes.map(constantTail))
if (tails.size !== 1) throw new Error(`task working set is not uniform: ${tails.size} distinct constant sections`)
// The envelope legitimately contains the word SELECT (the read-only clause), so
// the leak check looks for SQL *body* and for the oracle value instead: a table
// reference, a FROM/JOIN clause, or the expected value's own digits.
for (const c of cases) {
  const ws = c.task_working_set
  if (/\bFROM\s+\w/i.test(ws) || /\bJOIN\s+\w/i.test(ws)) throw new Error(`${c.case_id}: working set leaks a SQL body`)
  if (/ieu_cdm\.|ieu_ods\./.test(ws)) throw new Error(`${c.case_id}: working set leaks a qualified table name`)
  const expected = c.grading.expected_value
  if (expected !== undefined) {
    for (const n of JSON.stringify(expected).match(/\d{3,}/g) ?? []) {
      // Absolute dates are the one numeric string the envelope is REQUIRED to carry.
      if (c.absolute_dates.includes(n)) continue
      if (ws.includes(n)) throw new Error(`${c.case_id}: working set leaks the expected value (${n})`)
    }
  }
}

const semanticFiles = []
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.yaml') || e.name.endsWith('.yml')) semanticFiles.push(p)
  }
}
walk(SEMANTIC_ROOT)
semanticFiles.sort()
const semanticDigest = sha256(semanticFiles.map(p => `${relative(REPO, p)}:${sha256(readFileSync(p))}`).join('\n'))

const byType = {}
for (const c of cases) byType[c.type] = (byType[c.type] ?? 0) + 1

const manifest = {
  manifest_version: 1,
  experiment: 'g25a-phase-gate',
  frozen_on: '2026-09-17',
  reference_date: REFERENCE_DATE,
  date_substitutions: SUBS,
  scope: { scope_id: 'k11', data_domain: '10000251', maxcompute_project: 'ieu_cdm' },
  semantic_root: relative(REPO, SEMANTIC_ROOT),
  semantic_corpus_digest: semanticDigest,
  semantic_corpus_files: semanticFiles.length,
  budget: BUDGET,
  arms: ['state_machine', 'policy_only', 'diagnostic_floor'],
  replicates: { state_machine: 3, policy_only: 3, diagnostic_floor: 1 },
  case_counts: byType,
  total_cases: cases.length,
  total_decision_attempts: cases.length * 3 * 2 + cases.length,
  primary_metric: 'severe_unsupported_answer_rate',
  primary_rule: 'severe unsupported answers reduced by >=50% with end-to-end correctness dropping <=2pp',
  reported_but_not_deciding: 'pass^3 8pp rule — below metric resolution at n=12 real-execution cases (8.3pp per case)',
  cases,
}

const body = JSON.stringify(manifest, null, 2)
writeFileSync(join(HERE, 'manifest.json'), `${body}\n`, 'utf8')

console.log(`wrote manifest.json: ${cases.length} cases`)
console.log(`case counts: ${JSON.stringify(byType)}`)
console.log(`total decision attempts: ${manifest.total_decision_attempts}`)
console.log(`semantic corpus: ${semanticFiles.length} files, digest ${semanticDigest.slice(0, 16)}…`)
console.log(`manifest digest: ${sha256(body).slice(0, 16)}…`)
console.log('task working set constant section is uniform across all cases: OK')
