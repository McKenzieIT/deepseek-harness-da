#!/usr/bin/env -S npx tsx --tsconfig tsconfig.base.json
/**
 * GA-GT3 item 5 migration: backfill `origin: 'deterministic'` on K11 refs the
 * deterministic round still reproduces, so re-discovery (origin-aware replace)
 * can clean them when the matcher stops producing them.
 *
 * Pre-GA-I18N-1 seed refs carry no `origin` (undefined) -> preserved as
 * manual-tier under the item-5 fix (safe), but "sticky" (re-discovery cannot
 * drop them). This one-time pass tags the deterministic-reproducible subset so
 * they become cleanable. LLM-found (asymmetric) refs are NOT reproduced by the
 * deterministic round -> left undefined (preserved as manual-tier until an LLM
 * round can re-validate them).
 *
 * Mirrors the tool's exclude logic (buildExcludeColumns: role:'partition' cols,
 * fallback [ds,pt,dt]) so "reproduced" matches what `discoverRelations` would
 * re-derive. Reimplemented here to avoid importing the Service shell (cordis).
 *
 * Quantifies: X backfilled / Y stayed undefined / Z total (DWS dimension_refs
 * + event external_refs).
 *
 * Usage: npx tsx scripts/backfill-k11-deterministic-origin.ts
 */
import {
  buildDimInventory,
  discoverRelationsDeterministic,
  discoverEventRelationsDeterministic,
} from '../packages/data/semantic-layer/src/enrichment.ts'
import { loadTables, writeTable, loadEvents, writeEventYaml, dumpYaml } from '../packages/data/semantic-layer/src/io.ts'
import {
  TableDefinitionSchema,
  EventDefinitionSchema,
  DimensionRefSchema,
  type DimensionRef,
  type TableDefinition,
} from '../packages/data/semantic-layer/src/types.ts'

const root = './examples/k11-semantic-layer'
const DEFAULT_PARTITION_BLOCKLIST = ['ds', 'pt', 'dt']

/** Mirrors the Service `buildExcludeColumns` (kept local to avoid importing cordis). */
function buildExcludeColumns(def: TableDefinition): Set<string> {
  const partitionCols = def.columns.filter(c => c.role === 'partition').map(c => c.name)
  return partitionCols.length > 0 ? new Set(partitionCols) : new Set(DEFAULT_PARTITION_BLOCKLIST)
}

const pairKey = (k: { dws_column: string; dim_column: string }) => JSON.stringify([k.dws_column, k.dim_column])

/**
 * An existing ref is deterministic-reproducible iff the deterministic round
 * produces a ref to the same `dim_table` whose join_keys are a superset of the
 * existing ref's (every existing pair is re-derived). Mixed (det+llm) or
 * asymmetric refs are NOT fully reproduced -> left undefined.
 */
function isReproduced(existing: DimensionRef, discovered: readonly DimensionRef[]): boolean {
  const d = discovered.find(x => x.dim_table === existing.dim_table)
  if (!d) return false
  const dPairs = new Set(d.join_keys.map(pairKey))
  return existing.join_keys.every(k => dPairs.has(pairKey(k)))
}

/**
 * Backfill `origin: 'deterministic'` on reproduced refs. Invalid (non-schema)
 * ref items are left untouched (preserved, not dropped). Returns the new ref
 * array + counts.
 */
function backfill(rawRefs: unknown[], discovered: readonly DimensionRef[]): { refs: unknown[]; backfilled: number; stayed: number } {
  let backfilled = 0
  let stayed = 0
  const refs = rawRefs.map((item) => {
    const parsed = DimensionRefSchema.safeParse(item)
    if (!parsed.success) return item // leave invalid untouched
    if (isReproduced(parsed.data, discovered) && parsed.data.origin !== 'deterministic') {
      backfilled += 1
      return { ...parsed.data, origin: 'deterministic' }
    }
    stayed += 1
    return parsed.data
  })
  return { refs, backfilled, stayed }
}

async function main() {
  const dimInventory = buildDimInventory(root)
  console.log(`DIM inventory: ${dimInventory.length} tables`)

  let dwsBackfilled = 0, dwsStayed = 0, dwsTotal = 0, dwsTablesWritten = 0
  for (const t of loadTables(root)) {
    const r = TableDefinitionSchema.safeParse(t.raw)
    if (!r.success || r.data.kind === 'dim') continue
    const existing = t.raw.dimension_refs
    if (!Array.isArray(existing) || existing.length === 0) continue
    const discovered = discoverRelationsDeterministic(r.data, dimInventory, buildExcludeColumns(r.data))
    const { refs, backfilled, stayed } = backfill(existing, discovered)
    dwsBackfilled += backfilled; dwsStayed += stayed; dwsTotal += existing.length
    if (backfilled > 0) {
      await writeTable(root, t.table_name, { ...t.raw, dimension_refs: refs })
      dwsTablesWritten += 1
    }
  }

  let evtBackfilled = 0, evtStayed = 0, evtTotal = 0, evtEventsWritten = 0
  for (const e of loadEvents(root)) {
    const r = EventDefinitionSchema.safeParse(e.raw)
    if (!r.success) continue
    const existing = e.raw.external_refs
    if (!Array.isArray(existing) || existing.length === 0) continue
    // events path does not use excludeColumns (no partition columns on events)
    const discovered = discoverEventRelationsDeterministic(r.data, dimInventory)
    const { refs, backfilled, stayed } = backfill(existing, discovered)
    evtBackfilled += backfilled; evtStayed += stayed; evtTotal += existing.length
    if (backfilled > 0) {
      const content = dumpYaml({ ...e.raw, external_refs: refs })
      const res = await writeEventYaml(root, e.name, content)
      if (res.ok) evtEventsWritten += 1
    }
  }

  console.log('-- DWS dimension_refs --')
  console.log(`  total existing refs: ${dwsTotal}`)
  console.log(`  backfilled origin=deterministic: ${dwsBackfilled}`)
  console.log(`  stayed undefined (LLM-found / mixed / not reproduced): ${dwsStayed}`)
  console.log(`  tables written: ${dwsTablesWritten}`)
  console.log('-- event external_refs --')
  console.log(`  total existing refs: ${evtTotal}`)
  console.log(`  backfilled origin=deterministic: ${evtBackfilled}`)
  console.log(`  stayed undefined: ${evtStayed}`)
  console.log(`  events written: ${evtEventsWritten}`)
  console.log('-- total --')
  console.log(`  backfilled: ${dwsBackfilled + evtBackfilled} / ${dwsTotal + evtTotal} (stayed undefined: ${dwsStayed + evtStayed})`)
}

main().catch((e: unknown) => { console.error(e); process.exit(1) })
