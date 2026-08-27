/**
 * Check the real corpus size and whether target tables exist in it.
 */
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer'

const SCHEMA_DIR = join(import.meta.dirname, '../../examples/k11-semantic-layer')

const ctx = new Context()
await ctx.plugin(SemanticLayerService, { semanticRoot: SCHEMA_DIR, scopeId: 'k11' })

const schema = ctx.get('schema') as any
const corpus = schema.loadRetrievalCorpusAll()

console.log(`Total corpus size: ${corpus.length}`)

// Count by kind
const byKind: Record<string, number> = {}
for (const item of corpus) {
  const kind = (item as any).kind ?? (item as any).id?.includes('.') ? 'event' : 'unknown'
  byKind[kind] = (byKind[kind] ?? 0) + 1
}
console.log('By kind:', JSON.stringify(byKind))

// Check target tables
const targets = ['dws_10000251_role_account_inner', 'dws_10000251_play_process_act_df', 'dws_10000251_acc_summary_df']
for (const t of targets) {
  const found = corpus.find((c: any) => c.id === t)
  console.log(`${t}: ${found ? 'FOUND' : 'NOT FOUND'}`)
}

// Show sample items
console.log('\nFirst 10 items:')
for (const item of corpus.slice(0, 10)) {
  const i = item as any
  console.log(`  ${i.id} (${i.description?.slice(0, 50) ?? 'no desc'})`)
}

process.exit(0)
