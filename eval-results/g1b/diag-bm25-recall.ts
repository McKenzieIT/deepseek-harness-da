/**
 * Diagnostic: verify BM25 recall for k11 eval cases against the k11-semantic-layer corpus.
 * Run: npx tsx eval-results/g1b/diag-bm25-recall.ts
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import jsYaml from 'js-yaml'
import { Bm25Linker, tokenize, type DataSourceDoc } from '../../packages/data/nl2sql-engine/src/bm25-linking.ts'

const parse = (s: string) => jsYaml.load(s) as any

const CORPUS_DIR = join(import.meta.dirname, '../../examples/k11-semantic-layer/tables')
const CASES_DIR = join(import.meta.dirname, '../../packages/eval/eval/cases/k11-v2')

// Load corpus
const files = readdirSync(CORPUS_DIR).filter(f => f.endsWith('.yaml'))
const dataSources: DataSourceDoc[] = files.map(f => {
  const raw = parse(readFileSync(join(CORPUS_DIR, f), 'utf8'))
  return {
    id: raw.table_name,
    description: [raw.table_comment, raw.description].filter(Boolean).join(' '),
    metrics: raw.metrics ?? {},
  }
})

console.log(`Corpus: ${dataSources.length} tables`)

// Build linker
const linker = new Bm25Linker(dataSources)

// Load eval cases
const caseFiles = readdirSync(CASES_DIR).filter(f => f.endsWith('.yaml'))
let hits = 0
let total = 0

for (const cf of caseFiles) {
  const c = parse(readFileSync(join(CASES_DIR, cf), 'utf8'))
  const question = c.input.question
  const expected = c.dimensions.covered_assets as string[]
  const results = linker.retrieve(question, { topK: 5 })
  const top5ids = results.map(r => r.id)
  const found = expected.some(e => top5ids.includes(e))
  total++
  if (found) hits++

  // Print details for first few and failures
  if (!found || cf === 'k11_001.yaml') {
    console.log(`\n[${found ? 'HIT' : 'MISS'}] ${cf}: "${question}"`)
    console.log(`  Expected: ${expected.join(', ')}`)
    console.log(`  Top-5: ${top5ids.map((id, i) => `${i + 1}. ${id} (${results[i]!.score.toFixed(2)})`).join(', ')}`)
    if (!found) {
      // Check where expected table ranks
      const allResults = linker.retrieve(question, { topK: 100 })
      for (const e of expected) {
        const idx = allResults.findIndex(r => r.id === e)
        if (idx >= 0) {
          console.log(`  → ${e} found at rank ${idx + 1} (score ${allResults[idx]!.score.toFixed(3)})`)
        } else {
          console.log(`  → ${e} NOT FOUND in top-100`)
        }
      }
    }
  }
}

console.log(`\n=== Recall@5: ${hits}/${total} (${(100 * hits / total).toFixed(1)}%) ===`)

// Also show tokenization of the target table for debugging
console.log(`\nTokenization debug:`)
console.log(`  "dws_10000251_acc_summary_df" → ${JSON.stringify(tokenize('dws_10000251_acc_summary_df'))}`)
console.log(`  "查询acc summary的总量" → ${JSON.stringify(tokenize('查询acc summary的总量'))}`)
