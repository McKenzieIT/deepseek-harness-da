#!/usr/bin/env -S npx tsx --tsconfig tsconfig.base.json
/**
 * F1 Task 3: Seed event external_refs using the deterministic PK-name match
 * round. No LLM wiring — `enrichAllEvents` is always called with the LLM
 * option unset, so only the deterministic round runs (the optional semantic
 * round is not exposed by this script).
 *
 * Usage:
 *   npx tsx scripts/seed-event-external-refs.ts
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

main().catch((e: unknown) => { console.error(e); process.exit(1) })
