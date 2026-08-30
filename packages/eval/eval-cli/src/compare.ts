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
import { readFileSync, readdirSync } from 'node:fs'
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

function resolveRunFile(prefix: string, dir: string): string {
  const files = readdirSync(dir).filter(f => f.endsWith('.json') && f.startsWith(prefix))
  if (files.length === 0) throw new Error(`No run file matching "${prefix}" in ${dir}`)
  return join(dir, files[0])
}

function loadRun(path: string): RunResult {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function loadDeliveryCaseIds(casesDir: string): Set<string> {
  const deliveryIds = new Set<string>()
  const files = readdirSync(casesDir).filter(f => /\.(yaml|yml)$/.test(f))
  for (const f of files) {
    const text = readFileSync(join(casesDir, f), 'utf8')
    const raw = parseYaml(text) as Record<string, unknown>
    const expected = raw.expected as Record<string, unknown> | undefined
    if (expected?.delivery_match != null && expected?.match_mode == null) {
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
}

function buildCategoryBreakdown(
  cases: CaseVerdict[],
  deliveryIds: Set<string> | null,
): Map<Category, CategoryStats> {
  const map = new Map<Category, CategoryStats>()
  for (const c of cases) {
    const cat = classifyCase(c.case_id, deliveryIds)
    const stats = map.get(cat) ?? { total: 0, correct: 0, wrong: 0 }
    stats.total++
    if (c.verdict === 'correct') stats.correct++
    if (c.verdict === 'wrong') stats.wrong++
    map.set(cat, stats)
  }
  return map
}

function rate(stats: CategoryStats): string {
  if (stats.total === 0) return '—'
  return (stats.correct / stats.total * 100).toFixed(1) + '%'
}

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length)
}

function rpad(s: string, w: number): string {
  return s.length >= w ? s : ' '.repeat(w - s.length) + s
}

const CATEGORY_ORDER: Category[] = ['Original', 'Alias', 'Voice EXEC', 'Voice DELIVERY', 'Voice']

export function compareRuns(runIdA: string, runIdB: string, dir: string): void {
  const resolvedDir = resolve(dir)
  const fileA = resolveRunFile(runIdA, resolvedDir)
  const fileB = resolveRunFile(runIdB, resolvedDir)

  const runA = loadRun(fileA)
  const runB = loadRun(fileB)

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
    const a = breakdownA.get(cat) ?? { total: 0, correct: 0, wrong: 0 }
    const b = breakdownB.get(cat) ?? { total: 0, correct: 0, wrong: 0 }
    const rA = rate(a)
    const rB = rate(b)
    const pctA = a.total > 0 ? a.correct / a.total * 100 : 0
    const pctB = b.total > 0 ? b.correct / b.total * 100 : 0
    const d = (pctB - pctA).toFixed(1)
    const ds = Number(d) >= 0 ? '+' : ''
    const label = `${rA} (${a.correct}/${a.total})`
    const labelB = `${rB} (${b.correct}/${b.total})`
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
