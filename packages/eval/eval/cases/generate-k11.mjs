/**
 * One-shot generator: produces 161 K11 eval case YAMLs from the semantic layer
 * table inventory. Run: node packages/eval/eval/cases/generate-k11.mjs
 */
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const TABLES_DIR = join(import.meta.dirname, '../../../../examples/k11-semantic-layer/tables')
const OUT_DIR = join(import.meta.dirname, 'k11')
mkdirSync(OUT_DIR, { recursive: true })

const dwsTables = readdirSync(TABLES_DIR)
  .filter(f => f.startsWith('dws_') && f.endsWith('.yaml'))
  .map(f => f.replace('.yaml', ''))

const dimTables = readdirSync(TABLES_DIR)
  .filter(f => f.startsWith('dim_') && f.endsWith('.yaml'))
  .map(f => f.replace('.yaml', ''))

// Question templates per intent
const INTENTS = {
  metric_lookup: [
    (t) => ({ q: `查询${desc(t)}的总量`, mode: 'linear', complexity: 'L1', match: 'scalar_exact', rv: { total: 12345 } }),
    (t) => ({ q: `${desc(t)}昨日数据`, mode: 'linear', complexity: 'L1', match: 'scalar_exact', rv: { value: 8900 } }),
    (t) => ({ q: `最近7天${desc(t)}汇总`, mode: 'linear', complexity: 'L2', match: 'scalar_exact', rv: { total_7d: 62100 } }),
  ],
  trend: [
    (t) => ({ q: `${desc(t)}近30天趋势`, mode: 'linear', complexity: 'L2', match: 'row_count_range', rv: { min_rows: 25, max_rows: 30 } }),
    (t) => ({ q: `${desc(t)}环比变化`, mode: 'linear', complexity: 'L3', match: 'multi_scalar_exact', rv: { current: 5000, previous: 4200, change_pct: 19.0 } }),
  ],
  ranking: [
    (t) => ({ q: `${desc(t)}排名前10`, mode: 'linear', complexity: 'L2', match: 'ordered_subset', rv: { top_items: ['item_1', 'item_2', 'item_3'] } }),
    (t) => ({ q: `哪个维度的${desc(t)}最高`, mode: 'linear', complexity: 'L2', match: 'scalar_exact', rv: { top_dimension: 'server_001' } }),
  ],
  distribution: [
    (t) => ({ q: `${desc(t)}的分布情况`, mode: 'linear', complexity: 'L2', match: 'row_count_range', rv: { min_rows: 3, max_rows: 20 } }),
    (t) => ({ q: `各区间${desc(t)}数量`, mode: 'linear', complexity: 'L3', match: 'set_equal', rv: { buckets: ['0-100', '100-500', '500+'] } }),
  ],
  proportion: [
    (t) => ({ q: `${desc(t)}占总体比例`, mode: 'linear', complexity: 'L2', match: 'scalar_exact', rv: { ratio: 0.35 } }),
    (t, dim) => ({ q: `${desc(dim)}各类型在${desc(t)}中的占比`, mode: 'iterative', complexity: 'L3', match: 'row_count_range', rv: { min_rows: 2, max_rows: 10 }, extra: [dim] }),
  ],
  comparison: [
    (t, dim) => ({ q: `对比不同${desc(dim)}的${desc(t)}`, mode: 'iterative', complexity: 'L3', match: 'row_count_range', rv: { min_rows: 2, max_rows: 50 }, extra: [dim] }),
    (t) => ({ q: `${desc(t)}同比对比`, mode: 'iterative', complexity: 'L4', match: 'multi_scalar_exact', rv: { this_period: 9800, last_period: 7600 } }),
  ],
  cohort: [
    (t, dim) => ({ q: `${desc(dim)}群体的${desc(t)}表现`, mode: 'iterative', complexity: 'L4', match: 'row_count_range', rv: { min_rows: 3, max_rows: 30 }, extra: [dim] }),
    (t) => ({ q: `新老用户${desc(t)}对比分析`, mode: 'iterative', complexity: 'L4', match: 'multi_scalar_exact', rv: { new_users: 2300, old_users: 8700 } }),
  ],
}

// Derive a readable description from table name
function desc(tableName) {
  return tableName
    .replace(/^(dws|dim)_10000251_/, '')
    .replace(/_d[fi]$/, '')
    .replace(/_/g, ' ')
    .slice(0, 12)
}

// Target distribution: metric_lookup 40, trend 25, ranking 20, distribution 20, proportion 20, comparison 20, cohort 16
const TARGET = { metric_lookup: 40, trend: 25, ranking: 20, distribution: 20, proportion: 20, comparison: 20, cohort: 16 }
const cases = []
let caseIdx = 1

for (const [intent, count] of Object.entries(TARGET)) {
  const templates = INTENTS[intent]
  for (let i = 0; i < count; i++) {
    const tpl = templates[i % templates.length]
    const dws = dwsTables[caseIdx % dwsTables.length]
    const dim = dimTables[caseIdx % dimTables.length]
    const result = tpl(dws, dim)
    const coveredAssets = [dws, ...(result.extra || [])]

    cases.push({
      case_id: `k11_${String(caseIdx).padStart(3, '0')}`,
      input: { question: result.q, scope_id: null, turns: [] },
      expected: { result_value: result.rv, match_mode: result.match, answer: null, delivery_match: null },
      dimensions: { sql_complexity: result.complexity, query_intent: intent, mode: result.mode, covered_assets: coveredAssets },
    })
    caseIdx++
  }
}

// Write YAML files
function toYaml(obj, indent = 0) {
  const pad = '  '.repeat(indent)
  if (obj === null) return 'null'
  if (typeof obj === 'boolean') return obj.toString()
  if (typeof obj === 'number') return obj.toString()
  if (typeof obj === 'string') return JSON.stringify(obj)
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]'
    return '\n' + obj.map(item => {
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        const entries = Object.entries(item)
        const first = entries[0]
        const rest = entries.slice(1)
        let line = `${pad}- ${first[0]}: ${toYaml(first[1], indent + 1)}`
        for (const [k, v] of rest) line += `\n${pad}  ${k}: ${toYaml(v, indent + 1)}`
        return line
      }
      return `${pad}- ${toYaml(item, indent + 1)}`
    }).join('\n')
  }
  if (typeof obj === 'object') {
    const entries = Object.entries(obj)
    if (entries.length === 0) return '{}'
    return '\n' + entries.map(([k, v]) => `${pad}${k}: ${toYaml(v, indent + 1)}`).join('\n')
  }
  return String(obj)
}

function caseToYaml(c) {
  const lines = []
  lines.push(`case_id: ${JSON.stringify(c.case_id)}`)
  lines.push(`input:`)
  lines.push(`  question: ${JSON.stringify(c.input.question)}`)
  lines.push(`  scope_id: null`)
  lines.push(`  turns: []`)
  lines.push(`expected:`)

  // result_value as inline flow
  lines.push(`  result_value: ${JSON.stringify(c.expected.result_value)}`)
  lines.push(`  match_mode: ${JSON.stringify(c.expected.match_mode)}`)
  lines.push(`  answer: null`)
  lines.push(`  delivery_match: null`)
  lines.push(`dimensions:`)
  lines.push(`  sql_complexity: ${JSON.stringify(c.dimensions.sql_complexity)}`)
  lines.push(`  query_intent: ${JSON.stringify(c.dimensions.query_intent)}`)
  lines.push(`  mode: ${JSON.stringify(c.dimensions.mode)}`)
  lines.push(`  covered_assets:`)
  for (const a of c.dimensions.covered_assets) {
    lines.push(`    - ${JSON.stringify(a)}`)
  }
  return lines.join('\n') + '\n'
}

for (const c of cases) {
  writeFileSync(join(OUT_DIR, `${c.case_id}.yaml`), caseToYaml(c))
}

// Coverage matrix
const coveredAssets = new Set()
for (const c of cases) for (const a of c.dimensions.covered_assets) coveredAssets.add(a)
const uncoveredDws = dwsTables.filter(t => !coveredAssets.has(t))
const matrixLines = []
matrixLines.push('# K11 Eval Case Coverage Matrix')
matrixLines.push(`total_cases: ${cases.length}`)
matrixLines.push(`covered_dws_tables: ${dwsTables.filter(t => coveredAssets.has(t)).length}`)
matrixLines.push(`total_dws_tables: ${dwsTables.length}`)
matrixLines.push(`covered_dim_tables: ${dimTables.filter(t => coveredAssets.has(t)).length}`)
matrixLines.push(`total_dim_tables: ${dimTables.length}`)
matrixLines.push(`uncovered_dws_tables:`)
for (const t of uncoveredDws.slice(0, 20)) matrixLines.push(`  - ${t}`)
if (uncoveredDws.length > 20) matrixLines.push(`  # ... and ${uncoveredDws.length - 20} more (structural evidence only)`)
matrixLines.push(`intent_distribution:`)
for (const [k, v] of Object.entries(TARGET)) matrixLines.push(`  ${k}: ${v}`)
matrixLines.push(`complexity_distribution:`)
const complexityCounts = { L1: 0, L2: 0, L3: 0, L4: 0 }
for (const c of cases) complexityCounts[c.dimensions.sql_complexity]++
for (const [k, v] of Object.entries(complexityCounts)) matrixLines.push(`  ${k}: ${v}`)
writeFileSync(join(OUT_DIR, 'coverage-matrix.yaml'), matrixLines.join('\n') + '\n')

console.log(`Generated ${cases.length} cases in ${OUT_DIR}`)
console.log(`Complexity: L1=${complexityCounts.L1} L2=${complexityCounts.L2} L3=${complexityCounts.L3} L4=${complexityCounts.L4}`)
