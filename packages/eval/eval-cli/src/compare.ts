/**
 * Compare two eval runs with category-level breakdown + case-level flips.
 *
 * Categories are derived from case_id naming:
 *   - k11v2_alias_* → Alias
 *   - k11v2_voice_* + delivery_match in case YAML → Voice DELIVERY
 *   - k11v2_voice_* + match_mode in case YAML → Voice EXEC
 *   - everything else → Original
 *
 * When --cases is provided, Voice cases are split into EXEC/DELIVERY.
 * Without it, Voice is reported as a single category.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { load as parseYaml } from 'js-yaml'

interface CaseVerdict {
  case_id: string
  verdict: string
  pass_k_results: Array<{
    sql_judge?: { score: number } | null
    generated_sql?: string | null
  }>
}

interface RunResult {
  run_id: string
  timestamp: string
  cases: CaseVerdict[]
  summary: {
    total: number
    correct: number
    wrong: number
    pass_rate: number
  }
  /**
   * Run protocol, persisted since 2026-09-04. Absent on the ~169 runs recorded
   * before that, which is why `describeRunProtocol` reports "unknown" rather than
   * assuming a default.
   */
  config?: {
    provider?: string
    model?: string
    pass_k?: number
    concurrency?: number
    max_infra_retries?: number
    sql_judge?: boolean
    verdict_semantics?: string
    responder?: string
    scope_id?: string
    today?: string
    query_expansion?: boolean
    with_query?: boolean
    executor_identity?: string
    query_wait_seconds?: number
    comparator_policy_version?: number
    column_semantics?: string
    max_stored_rows?: number
    skip_health_gate?: boolean
  } | null
}

/** Whether a run may be rendered, and whether its numbers may be cited as a baseline. */
export interface Renderability {
  readonly ok: boolean
  /** Why the run was refused, when it was. */
  readonly reason?: string
}

/**
 * Decide whether a run states enough about itself to be compared.
 *
 * A run that records a config but omits how it graded, or claims real execution
 * without naming the executor, is refused: those fields decide what its numbers
 * mean, and the build that produced it knows them. `with_query` alone is not
 * enough, because the default sidecar is a throwaway stand-in — the historical
 * 5.1% "real execution" baseline cannot be confirmed to have touched a
 * warehouse at all.
 *
 * A run with no config is refused because its grading mode and policy cannot
 * be established from the artifact.
 * @param run - the run to check.
 * @returns whether it may be rendered, and why not when it may not.
 */
export function checkRenderable(run: RunResult): Renderability {
  const config = run.config
  if (config === undefined || config === null) {
    return { ok: false, reason: `run ${run.run_id} has no config; grading mode and policy cannot be confirmed` }
  }

  const required = [
    'provider',
    'model',
    'pass_k',
    'concurrency',
    'max_infra_retries',
    'sql_judge',
    'verdict_semantics',
    'responder',
    'scope_id',
    'today',
    'query_expansion',
    'with_query',
    'comparator_policy_version',
    'column_semantics',
    'max_stored_rows',
    'skip_health_gate',
  ] as const
  const missing: string[] = required.filter(key => config[key] === undefined)
  if (config.with_query === true && config.executor_identity === undefined) missing.push('executor_identity')
  if (config.with_query === true && config.query_wait_seconds === undefined) missing.push('query_wait_seconds')
  if (missing.length > 0) {
    return { ok: false, reason: `run ${run.run_id} records a config but omits ${missing.join(', ')}; its numbers cannot be interpreted` }
  }
  return { ok: true }
}

/**
 * Human-readable execution mode: what executed the SQL and how results were
 * compared. Two runs that differ here are not comparable — judge-only versus
 * real execution measured 61.5% against 5.1% on the same cases and model.
 * @param run - the run to describe.
 * @returns the mode tag, or `null` when the run records no config.
 */
export function describeExecutionMode(run: RunResult): string | null {
  const config = run.config
  if (config === undefined || config === null) return null
  const executor = config.with_query === true ? config.executor_identity ?? 'unnamed-executor' : 'no-executor'
  const wait = config.with_query === true ? `${config.query_wait_seconds ?? '?'}s` : 'n/a'
  return `exec=${executor} wait=${wait} policy=v${config.comparator_policy_version ?? '?'}/${config.column_semantics ?? '?'} rows=${config.max_stored_rows ?? '?'}`
}

/**
 * Render every non-execution input that can change or qualify a run.
 * @param run - the run whose protocol is described.
 * @returns the protocol tag, or `null` for a legacy run without config.
 */
export function describeRunProtocol(run: RunResult): string | null {
  const config = run.config
  if (config === undefined || config === null) return null
  return [
    `provider=${config.provider ?? '?'}`,
    `model=${config.model ?? '?'}`,
    `pass_k=${config.pass_k ?? '?'}`,
    `concurrency=${config.concurrency ?? '?'}`,
    `max_infra_retries=${config.max_infra_retries ?? '?'}`,
    `sql_judge=${config.sql_judge ?? '?'}`,
    `verdict=${config.verdict_semantics ?? '?'}`,
    `responder=${config.responder ?? '?'}`,
    `scope=${config.scope_id ?? '?'}`,
    `today=${config.today ?? '?'}`,
    `query_expansion=${config.query_expansion ?? '?'}`,
    `skip_health_gate=${config.skip_health_gate ?? '?'}`,
  ].join(' ')
}

/**
 * Refuse to silently compare runs measured under different protocols.
 *
 * A k=1 run and a k=3 pass^k run of identical code differ by ~12pp on k11-v2
 * (pass^k requires every attempt to pass; 31.5% of cases are non-deterministic).
 * Diffing across that boundary reports a protocol artifact as a quality delta —
 * exactly the trap that `scripts/run-eval.sh --pass-k 1` left behind while the
 * recorded baseline moved to pass^k.
 *
 * Known-and-different is an error (definitely wrong). Unknown is a warning
 * (merely unverifiable) so historical baselines stay diffable.
 */
function checkProtocolMatch(runA: RunResult, runB: RunResult): void {
  for (const run of [runA, runB]) {
    const renderable = checkRenderable(run)
    if (!renderable.ok) {
      console.error(`\n  ✗ UNRENDERABLE — ${renderable.reason}`)
      console.error('    Re-run it on a build that records its grading policy.\n')
      process.exit(2)
    }
  }

  const modeA = describeExecutionMode(runA)
  const modeB = describeExecutionMode(runB)
  if (modeA !== null && modeB !== null && modeA !== modeB) {
    console.error('\n  ✗ EXECUTION MODE MISMATCH — these runs are not comparable')
    console.error(`      A (${runA.run_id}): ${modeA}`)
    console.error(`      B (${runB.run_id}): ${modeB}`)
    console.error('    Executor identity, wait windows, row retention, and comparator')
    console.error('    semantics can all change the observed result.\n')
    if (!process.argv.includes('--allow-protocol-mismatch')) process.exit(2)
  }

  const a = describeRunProtocol(runA)
  const b = describeRunProtocol(runB)

  if (a !== null && b !== null && a !== b) {
    console.error('\n  ✗ PROTOCOL MISMATCH — these runs are not comparable')
    console.error(`      A (${runA.run_id}): ${a}`)
    console.error(`      B (${runB.run_id}): ${b}`)
    console.error('    Provider, model, concurrency, judge, scope, date, and feature')
    console.error('    settings can change the result independently of code quality.')
    console.error('    Re-run one side under the other\'s protocol, or pass')
    console.error('    --allow-protocol-mismatch if you know what you are doing.\n')
    if (!process.argv.includes('--allow-protocol-mismatch')) process.exit(2)
  }
}

type Category = 'Original' | 'Alias' | 'Voice EXEC' | 'Voice DELIVERY' | 'Voice'

function findRepoRoot(): string {
  let dir = resolve('.')
  for (let i = 0; i < 10; i++) {
    if (readdirSync(dir).includes('packages')) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return resolve('.')
}

/**
 * Resolve a run-result file by id prefix. Deterministic + fail-loud:
 *   1. Prefer an exact `${prefix}.json` so a shorter id that is a prefix of
 *      another (e.g. "run-1" vs "run-10") resolves to itself, not whichever
 *      entry `readdirSync` happened to return first.
 *   2. Otherwise sort the prefix-colliding candidates for a stable error.
 *   3. Throw when more than one ambiguous candidate remains — the caller must
 *      pass a run id specific enough to name exactly one run file, otherwise
 *      `compareRuns` would silently diff the wrong pair.
 * Exported so the resolution rule is unit-testable independent of the CLI.
 * @param prefix - the run id prefix to match.
 * @param dir - directory containing run result JSON files.
 * @returns the resolved file path.
 */
export function resolveRunFile(prefix: string, dir: string): string {
  const exact = join(dir, `${prefix}.json`)
  if (existsSync(exact)) return exact
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.json') && f.startsWith(prefix))
    .sort()
  if (files.length === 0) throw new Error(`No run file matching "${prefix}" in ${dir}`)
  if (files.length > 1) {
    throw new Error(
      `Ambiguous run file prefix "${prefix}" in ${dir}: matched ${files.length} files [${files.join(', ')}]. Pass the full run id so exactly one "${prefix}.json" exists.`,
    )
  }
  return join(dir, files[0] as string)
}

function loadRun(path: string): RunResult {
  const data: unknown = JSON.parse(readFileSync(path, 'utf8'))
  return parseRunResult(data, path)
}

/**
 * Validate a parsed durable run artifact before comparison code consumes it.
 * @param data - the untrusted value returned by JSON parsing.
 * @param source - the file or input name used in diagnostics.
 * @returns the validated run.
 */
export function parseRunResult(data: unknown, source: string = 'run artifact'): RunResult {
  assertRunResult(data, source)
  return data
}

function assertRunResult(data: unknown, source: string): asserts data is RunResult {
  const run = requireRecord(data, source)
  requireString(run.run_id, `${source}.run_id`)
  requireString(run.timestamp, `${source}.timestamp`)
  if (!Array.isArray(run.cases)) throw new Error(`${source}.cases must be an array`)
  for (let i = 0; i < run.cases.length; i++) validateCase(run.cases[i], `${source}.cases[${i}]`)

  const summary = requireRecord(run.summary, `${source}.summary`)
  for (const key of ['total', 'correct', 'wrong', 'pass_rate'] as const) {
    requireNumber(summary[key], `${source}.summary.${key}`)
  }

  if (run.config !== undefined && run.config !== null) validateConfig(run.config, `${source}.config`)
}

function validateCase(data: unknown, path: string): void {
  const item = requireRecord(data, path)
  requireString(item.case_id, `${path}.case_id`)
  requireString(item.verdict, `${path}.verdict`)
  if (!Array.isArray(item.pass_k_results)) throw new Error(`${path}.pass_k_results must be an array`)
  for (let i = 0; i < item.pass_k_results.length; i++) {
    const attempt = requireRecord(item.pass_k_results[i], `${path}.pass_k_results[${i}]`)
    if (attempt.generated_sql !== undefined && attempt.generated_sql !== null) {
      requireString(attempt.generated_sql, `${path}.pass_k_results[${i}].generated_sql`)
    }
    if (attempt.sql_judge !== undefined && attempt.sql_judge !== null) {
      const judge = requireRecord(attempt.sql_judge, `${path}.pass_k_results[${i}].sql_judge`)
      requireNumber(judge.score, `${path}.pass_k_results[${i}].sql_judge.score`)
    }
  }
}

function validateConfig(data: unknown, path: string): void {
  const config = requireRecord(data, path)
  for (const key of ['provider', 'model', 'verdict_semantics', 'responder', 'scope_id', 'today', 'executor_identity', 'column_semantics'] as const) {
    if (config[key] !== undefined) requireString(config[key], `${path}.${key}`)
  }
  for (const key of ['pass_k', 'concurrency', 'max_infra_retries', 'query_wait_seconds', 'comparator_policy_version', 'max_stored_rows'] as const) {
    if (config[key] !== undefined) requireNumber(config[key], `${path}.${key}`)
  }
  for (const key of ['sql_judge', 'query_expansion', 'with_query', 'skip_health_gate'] as const) {
    if (config[key] !== undefined && typeof config[key] !== 'boolean') throw new Error(`${path}.${key} must be a boolean`)
  }
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${path} must be an object`)
  return value as Record<string, unknown>
}

function requireString(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string') throw new Error(`${path} must be a string`)
}

function requireNumber(value: unknown, path: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} must be a finite number`)
}

function loadDeliveryCaseIds(casesDir: string): Set<string> {
  const deliveryIds = new Set<string>()
  const files = readdirSync(casesDir).filter(f => /\.(yaml|yml)$/.test(f))
  for (const f of files) {
    const text = readFileSync(join(casesDir, f), 'utf8')
    const raw = parseYaml(text) as Record<string, unknown>
    const expected = raw.expected as Record<string, unknown> | undefined
    if (expected?.delivery_match != null && expected.match_mode == null) {
      deliveryIds.add(raw.case_id as string)
    }
  }
  return deliveryIds
}

function classifyCase(caseId: string, deliveryIds: Set<string> | null): Category {
  if (caseId.includes('_alias_')) return 'Alias'
  if (caseId.includes('_voice_')) {
    if (deliveryIds === null) return 'Voice'
    return deliveryIds.has(caseId) ? 'Voice DELIVERY' : 'Voice EXEC'
  }
  return 'Original'
}

interface CategoryStats {
  total: number
  correct: number
  wrong: number
  declined: number
  excluded: number
}

function buildCategoryBreakdown(
  cases: CaseVerdict[],
  deliveryIds: Set<string> | null,
): Map<Category, CategoryStats> {
  const map = new Map<Category, CategoryStats>()
  for (const c of cases) {
    const cat = classifyCase(c.case_id, deliveryIds)
    const stats = map.get(cat) ?? { total: 0, correct: 0, wrong: 0, declined: 0, excluded: 0 }
    stats.total++
    if (c.verdict === 'correct') stats.correct++
    if (c.verdict === 'wrong') stats.wrong++
    if (c.verdict === 'declined') stats.declined++
    if (c.verdict === 'unjudged' || c.verdict === 'infra_failure' || c.verdict === 'case_defect') stats.excluded++
    map.set(cat, stats)
  }
  return map
}

function rate(stats: CategoryStats): string {
  const attributable = stats.correct + stats.wrong + stats.declined
  if (attributable === 0) return '—'
  return (stats.correct / attributable * 100).toFixed(1) + '%'
}

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length)
}

function rpad(s: string, w: number): string {
  return s.length >= w ? s : ' '.repeat(w - s.length) + s
}

const CATEGORY_ORDER: Category[] = ['Original', 'Alias', 'Voice EXEC', 'Voice DELIVERY', 'Voice']

/**
 *  compareRuns
 * @param runIdA - runIdA
 * @param runIdB - runIdB
 * @param dir - dir
 */
export function compareRuns(runIdA: string, runIdB: string, dir: string): void {
  const resolvedDir = resolve(dir)
  const fileA = resolveRunFile(runIdA, resolvedDir)
  const fileB = resolveRunFile(runIdB, resolvedDir)

  const runA = loadRun(fileA)
  const runB = loadRun(fileB)

  checkProtocolMatch(runA, runB)

  const repoRoot = findRepoRoot()
  const defaultCasesDir = join(repoRoot, 'packages/eval/eval/cases/k11-v2')
  let deliveryIds: Set<string> | null = null
  try {
    deliveryIds = loadDeliveryCaseIds(defaultCasesDir)
  } catch {
    // cases dir not found — Voice won't be split
  }

  const breakdownA = buildCategoryBreakdown(runA.cases, deliveryIds)
  const breakdownB = buildCategoryBreakdown(runB.cases, deliveryIds)

  // Header
  console.log('\n  Eval Run Comparison')
  console.log(`  A (baseline): ${runA.run_id}  (${runA.timestamp})`)
  console.log(`  B (new):      ${runB.run_id}  (${runB.timestamp})`)
  console.log(`  Protocol:     A=${describeRunProtocol(runA) ?? 'unknown'}  B=${describeRunProtocol(runB) ?? 'unknown'}`)
  console.log()

  // Overall
  const rateA = (runA.summary.pass_rate * 100).toFixed(1)
  const rateB = (runB.summary.pass_rate * 100).toFixed(1)
  const overallDelta = (runB.summary.pass_rate * 100 - runA.summary.pass_rate * 100).toFixed(1)
  const sign = Number(overallDelta) >= 0 ? '+' : ''
  console.log(`  Overall: ${rateA}% → ${rateB}%  (${sign}${overallDelta}pp)`)
  console.log()

  // Category table
  const allCats = CATEGORY_ORDER.filter(c => breakdownA.has(c) || breakdownB.has(c))
  console.log('  ' + pad('Category', 18) + rpad('A', 16) + rpad('B', 16) + rpad('Delta', 10))
  console.log('  ' + '─'.repeat(60))
  for (const cat of allCats) {
    const a = breakdownA.get(cat) ?? { total: 0, correct: 0, wrong: 0, declined: 0, excluded: 0 }
    const b = breakdownB.get(cat) ?? { total: 0, correct: 0, wrong: 0, declined: 0, excluded: 0 }
    const rA = rate(a)
    const rB = rate(b)
    const attributableA = a.correct + a.wrong + a.declined
    const attributableB = b.correct + b.wrong + b.declined
    const pctA = attributableA > 0 ? a.correct / attributableA * 100 : 0
    const pctB = attributableB > 0 ? b.correct / attributableB * 100 : 0
    const d = (pctB - pctA).toFixed(1)
    const ds = Number(d) >= 0 ? '+' : ''
    const label = `${rA} (${a.correct}/${attributableA}; ${a.excluded} excl)`
    const labelB = `${rB} (${b.correct}/${attributableB}; ${b.excluded} excl)`
    console.log('  ' + pad(cat, 18) + rpad(label, 16) + rpad(labelB, 16) + rpad(`${ds}${d}pp`, 10))
  }
  console.log()

  // Case-level flips
  const verdictMapA = new Map(runA.cases.map(c => [c.case_id, c.verdict]))
  const verdictMapB = new Map(runB.cases.map(c => [c.case_id, c.verdict]))

  const gained: string[] = []
  const lost: string[] = []

  for (const [id, vA] of verdictMapA) {
    const vB = verdictMapB.get(id)
    if (vB === undefined) continue
    if (vA !== 'correct' && vB === 'correct') gained.push(id)
    if (vA === 'correct' && vB !== 'correct') lost.push(id)
  }

  // New cases in B not in A
  const newCases = runB.cases.filter(c => !verdictMapA.has(c.case_id))
  const removedCases = runA.cases.filter(c => !verdictMapB.has(c.case_id))

  if (gained.length > 0) {
    console.log(`  Gained (${gained.length}):`)
    for (const id of gained.sort()) {
      const cat = classifyCase(id, deliveryIds)
      console.log(`    + ${id}  [${cat}]`)
    }
    console.log()
  }

  if (lost.length > 0) {
    console.log(`  Lost (${lost.length}):`)
    for (const id of lost.sort()) {
      const cat = classifyCase(id, deliveryIds)
      console.log(`    - ${id}  [${cat}]`)
    }
    console.log()
  }

  if (newCases.length > 0) {
    console.log(`  New cases in B (${newCases.length}):`)
    for (const c of newCases.slice(0, 10)) {
      console.log(`    ~ ${c.case_id}  [${c.verdict}]`)
    }
    if (newCases.length > 10) console.log(`    ... and ${newCases.length - 10} more`)
    console.log()
  }

  if (removedCases.length > 0) {
    console.log(`  Removed from B (${removedCases.length}):`)
    for (const c of removedCases.slice(0, 10)) {
      console.log(`    × ${c.case_id}`)
    }
    console.log()
  }

  // Summary line
  console.log(`  Net: +${gained.length} / -${lost.length} = ${gained.length - lost.length >= 0 ? '+' : ''}${gained.length - lost.length} flips`)
  console.log()
}
