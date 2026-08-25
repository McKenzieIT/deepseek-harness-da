#!/usr/bin/env -S npx tsx --tsconfig tsconfig.base.json
/**
 * F1 Task 3: Seed event external_refs using the deterministic round.
 *
 * When run without LLM wiring, only the deterministic PK-name match round
 * executes. Pass --with-llm to wire a real LLM (requires DASHSCOPE_API_KEY).
 *
 * Usage:
 *   npx tsx scripts/seed-event-external-refs.ts
 *   npx tsx scripts/seed-event-external-refs.ts --with-llm
 */
import { enrichAllEvents } from '../packages/data/semantic-layer/src/enrichment.ts'

const root = './examples/k11-semantic-layer'

async function main() {
  console.log('Enriching events (deterministic round only — no LLM)...')
  console.time('enrichAllEvents')
  const result = await enrichAllEvents(root, undefined)
  console.timeEnd('enrichAllEvents')
  console.log(`  enriched: ${result.enriched} events gained ≥1 external_ref`)
  console.log(`  written:  ${result.written} event files updated`)
  console.log(`  errors:   ${result.errors.length}`)
  if (result.errors.length > 0) {
    console.log('  first errors:')
    for (const e of result.errors.slice(0, 5)) console.log(`    - ${e}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
