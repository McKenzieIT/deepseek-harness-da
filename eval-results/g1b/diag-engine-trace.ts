/**
 * Diagnostic: trace a single eval case through the NL2SQL engine to see
 * BM25 candidates, generated SQL, ODPS result, and comparison with expected.
 *
 * Run: DASHSCOPE_API_KEY=... npx tsx eval-results/g1b/diag-engine-trace.ts [case_id]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import jsYaml from 'js-yaml'
import { Bm25Linker, type DataSourceDoc } from '../../packages/data/nl2sql-engine/src/bm25-linking.ts'

const SCHEMA_DIR = join(import.meta.dirname, '../../examples/k11-semantic-layer/tables')
const CASES_DIR = join(import.meta.dirname, '../../packages/eval/eval/cases/k11-v2')
const CASE_ID = process.argv[2] ?? 'k11v2_001'

// Load corpus
const files = readdirSync(SCHEMA_DIR).filter(f => f.endsWith('.yaml'))
const dataSources: DataSourceDoc[] = files.map(f => {
  const raw = jsYaml.load(readFileSync(join(SCHEMA_DIR, f), 'utf8')) as any
  return {
    id: raw.table_name,
    description: [raw.table_comment, raw.description].filter(Boolean).join(' '),
    metrics: raw.metrics ?? {},
  }
})

// Load case
const caseFile = join(CASES_DIR, `${CASE_ID}.yaml`)
const evalCase = jsYaml.load(readFileSync(caseFile, 'utf8')) as any

console.log(`=== Case: ${CASE_ID} ===`)
console.log(`Question: "${evalCase.input.question}"`)
console.log(`Expected: ${JSON.stringify(evalCase.expected.result_value)}`)
console.log(`Match mode: ${evalCase.expected.match_mode}`)
console.log(`Target tables: ${evalCase.dimensions.covered_assets.join(', ')}`)
console.log()

// BM25 retrieval
const linker = new Bm25Linker(dataSources)
const hits = linker.retrieve(evalCase.input.question, { topK: 5 })
console.log('=== BM25 Top-5 ===')
for (const [i, h] of hits.entries()) {
  const isTarget = evalCase.dimensions.covered_assets.includes(h.id)
  console.log(`  ${i + 1}. ${h.id} (${h.score.toFixed(2)}) ${isTarget ? '★ TARGET' : ''}`)
}
console.log()

// Show what the target table looks like
for (const t of evalCase.dimensions.covered_assets) {
  const tf = join(SCHEMA_DIR, `${t}.yaml`)
  try {
    const raw = jsYaml.load(readFileSync(tf, 'utf8')) as any
    console.log(`=== Target: ${t} ===`)
    console.log(`  Comment: ${raw.table_comment ?? '(none)'}`)
    console.log(`  Metrics: ${Object.keys(raw.metrics ?? {}).join(', ') || '(none)'}`)
    const cols = (raw.columns ?? []).slice(0, 10).map((c: any) => `${c.name}(${c.type})`).join(', ')
    console.log(`  Columns (first 10): ${cols}`)
    console.log()
  } catch { /* skip */ }
}
