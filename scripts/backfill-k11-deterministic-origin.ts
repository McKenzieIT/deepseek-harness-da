#!/usr/bin/env -S npx tsx --tsconfig tsconfig.base.json
/**
 * GA-GT3-5c — one-time migration: backfill `origin: 'deterministic'` on K11
 * existing dimension_ref / external_ref entries that the deterministic round
 * still re-derives. Pre-GA-I18N-1 seed refs carry no `origin` (undefined) →
 * preserved as manual-tier under the GA-GT3 item-5 origin-aware-replace fix
 * (safe), but "sticky" (re-discovery cannot drop them). This pass tags the
 * deterministic-reproducible subset so a future re-discovery
 * (origin-aware replace: keep `manual`/`undefined`, drop `deterministic`/`llm`)
 * can refresh them cleanly. Manual / LLM-found / asymmetric refs the
 * deterministic round does NOT reproduce are left `undefined` (preserved).
 *
 * Classification (data-safe "superset" criterion — CRITICAL: misclassifying a
 * manual/partial ref as `deterministic` would drop it on the next origin-aware
 * re-discovery = data loss). An existing ref is tagged `deterministic` IFF the
 * deterministic round re-derives a ref to the SAME `dim_table` whose
 * `join_keys` are a SUPERSET of the existing ref's (EVERY existing pair is
 * re-derived). The deterministic round only emits symmetric pairs
 * (dws_column == dim_column == DIM PK), so any existing ref carrying an
 * asymmetric pair (dws_column != dim_column, e.g. LLM-found) is NOT fully
 * reproducible → left `undefined` (its asymmetric pairs would otherwise be
 * lost on re-discovery). Partial reproduction → NOT tagged (preserved).
 *
 * Mirrors the re-discovery exclude logic (canonical `buildExcludeColumns` at
 * packages/data/semantic-layer/src/index.ts: buildExcludeColumns) so "reproduced"
 * matches what `SemanticLayerService.discoverRelations` would re-derive:
 * partition columns (role:'partition', fallback [ds,pt,dt]) are excluded from
 * PK matching. Re-implemented locally (NOT imported from index.ts) to keep the
 * script free of the cordis/schemastery service-shell dependency — the logic is
 * byte-identical and MUST stay in sync with the canonical implementation.
 *
 * TDD: scripts/backfill-k11-deterministic-origin.spec.ts pins the
 * classification-correctness property (manual + partial refs NOT misclassified).
 *
 * Quantifies: N backfilled / M stayed undefined / total (DWS dimension_refs +
 * event external_refs).
 *
 * Usage: npx tsx scripts/backfill-k11-deterministic-origin.ts
 */
import {
  buildDimInventory,
  discoverRelationsDeterministic,
  discoverEventRelationsDeterministic,
} from '../packages/data/semantic-layer/src/enrichment.ts'
import {
  loadTables,
  writeTable,
  loadEvents,
  writeEventYaml,
  dumpYaml,
} from '../packages/data/semantic-layer/src/io.ts'
import {
  TableDefinitionSchema,
  EventDefinitionSchema,
  DimensionRefSchema,
  type DimensionRef,
  type TableDefinition,
} from '../packages/data/semantic-layer/src/types.ts'

const K11_LAYER = './examples/k11-semantic-layer'
const DEFAULT_PARTITION_BLOCKLIST = ['ds', 'pt', 'dt']

/**
 * Mirror of the canonical `buildExcludeColumns`
 * (packages/data/semantic-layer/src/index.ts). MUST stay byte-identical so the
 * backfill's "reproduced" matches what `SemanticLayerService.discoverRelations`
 * (origin-aware replace) would re-derive. Kept local to avoid importing the
 * cordis/schemastery service shell into a one-time migration script.
 * @param def - the target table definition.
 * @returns column names to exclude from deterministic PK matching (never empty).
 */
function buildExcludeColumns(def: TableDefinition): Set<string> {
  const partitionCols = def.columns.filter(c => c.role === 'partition').map(c => c.name)
  return partitionCols.length > 0 ? new Set(partitionCols) : new Set(DEFAULT_PARTITION_BLOCKLIST)
}

// pair key = JSON.stringify([dws_column, dim_column]) — collision-proof: the
// JSON array form disambiguates ("a","bc") from ("ab","c").
const pairKey = (k: { dws_column: string; dim_column: string }): string =>
  JSON.stringify([k.dws_column, k.dim_column])

/**
 * Data-safe classification predicate: an existing ref is deterministic-reproducible
 * IFF the deterministic round re-derives a ref to the same `dim_table` whose
 * `join_keys` are a SUPERSET of the existing ref's (every existing pair is
 * re-derived). Mixed (det+llm) or asymmetric refs are NOT fully reproduced →
 * `false` (left `undefined` / preserved). This avoids misclassifying a
 * partially-reproducible ref as `deterministic` (which would drop its
 * asymmetric pairs on the next origin-aware re-discovery = data loss).
 * @param existing - the existing (pre-backfill) validated DimensionRef.
 * @param discovered - the deterministic round's freshly-derived refs for the target.
 * @returns `true` when every existing join_key pair is re-derived by the deterministic round.
 */
export function isReproduced(existing: DimensionRef, discovered: readonly DimensionRef[]): boolean {
  const d = discovered.find(x => x.dim_table === existing.dim_table)
  if (!d) return false
  const dPairs = new Set(d.join_keys.map(pairKey))
  return existing.join_keys.every(k => dPairs.has(pairKey(k)))
}

/**
 * Backfill `origin: 'deterministic'` on reproduced refs. Invalid (non-schema)
 * ref items are left untouched (preserved, not dropped). A ref already tagged
 * `deterministic` is not re-counted. Returns the new ref array + counts.
 * @param rawRefs - the raw (unparsed) existing ref array from the YAML.
 * @param discovered - the deterministic round's freshly-derived refs for the target.
 * @returns `{ refs, backfilled, stayed }` — the new ref array + counts.
 */
export function backfillRefs(
  rawRefs: unknown[],
  discovered: readonly DimensionRef[],
): { refs: unknown[]; backfilled: number; stayed: number } {
  let backfilled = 0
  let stayed = 0
  const refs = rawRefs.map((item) => {
    const parsed = DimensionRefSchema.safeParse(item)
    if (!parsed.success) return item // leave invalid untouched (preserved)
    if (isReproduced(parsed.data, discovered) && parsed.data.origin !== 'deterministic') {
      backfilled += 1
      return { ...parsed.data, origin: 'deterministic' as const }
    }
    stayed += 1
    return parsed.data
  })
  return { refs, backfilled, stayed }
}

/** Backfill result counts. */
export interface BackfillCounts {
  /** Refs tagged `origin: deterministic` (deterministic-reproducible). */
  backfilled: number
  /** Refs left `undefined` (manual / LLM-found / asymmetric / not reproduced). */
  stayed: number
  /** Total existing refs scanned (DWS dimension_refs + event external_refs). */
  total: number
  /** DWS tables written (≥1 ref backfilled). */
  tablesWritten: number
  /** Events written (≥1 ref backfilled). */
  eventsWritten: number
  /** DIM inventory size used for the deterministic round. */
  dimInventory: number
}

/**
 * Run the one-time backfill on a semantic layer: build the DIM inventory, for
 * each DWS table + event run the deterministic round, and for each EXISTING
 * ref tag `origin: 'deterministic'` when reproduced (superset criterion),
 * leaving manual/partial/asymmetric refs `undefined` (preserved). Writes back
 * only files where ≥1 ref was backfilled.
 * @param semanticLayer - the semantic-layer directory path (with config.yaml/tables/events).
 * @returns backfill counts.
 */
export async function runBackfill(semanticLayer: string): Promise<BackfillCounts> {
  const dimInventory = buildDimInventory(semanticLayer)

  let backfilled = 0
  let stayed = 0
  let total = 0
  let tablesWritten = 0
  let eventsWritten = 0

  // DWS tables (kind !== 'dim'): backfill dimension_refs.
  for (const t of loadTables(semanticLayer)) {
    const r = TableDefinitionSchema.safeParse(t.raw)
    if (!r.success || r.data.kind === 'dim') continue
    const existing = t.raw.dimension_refs
    if (!Array.isArray(existing) || existing.length === 0) continue
    const discovered = discoverRelationsDeterministic(r.data, dimInventory, buildExcludeColumns(r.data))
    const { refs, backfilled: b, stayed: s } = backfillRefs(existing, discovered)
    backfilled += b
    stayed += s
    total += existing.length
    if (b > 0) {
      await writeTable(semanticLayer, t.table_name, { ...t.raw, dimension_refs: refs })
      tablesWritten += 1
    }
  }

  // Events: backfill external_refs (no exclude — events have no partition columns;
  // matches `SemanticLayerService.discoverEventRelations` which passes no excludeColumnsFn).
  for (const e of loadEvents(semanticLayer)) {
    const r = EventDefinitionSchema.safeParse(e.raw)
    if (!r.success) continue
    const existing = e.raw.external_refs
    if (!Array.isArray(existing) || existing.length === 0) continue
    const discovered = discoverEventRelationsDeterministic(r.data, dimInventory)
    const { refs, backfilled: b, stayed: s } = backfillRefs(existing, discovered)
    backfilled += b
    stayed += s
    total += existing.length
    if (b > 0) {
      const content = dumpYaml({ ...e.raw, external_refs: refs })
      const res = await writeEventYaml(semanticLayer, e.name, content)
      if (res.ok) eventsWritten += 1
    }
  }

  return { backfilled, stayed, total, tablesWritten, eventsWritten, dimInventory: dimInventory.length }
}

async function main(): Promise<void> {
  const counts = await runBackfill(K11_LAYER)
  console.log(`DIM inventory: ${counts.dimInventory} tables`)
  console.log('-- DWS dimension_refs + event external_refs --')
  console.log(`  total existing refs: ${counts.total}`)
  console.log(`  backfilled origin=deterministic: ${counts.backfilled}`)
  console.log(`  stayed undefined (manual / LLM-found / asymmetric / not reproduced): ${counts.stayed}`)
  console.log(`  tables written: ${counts.tablesWritten}`)
  console.log(`  events written: ${counts.eventsWritten}`)
}

// Run main only when invoked directly (not when imported by the test).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e: unknown) => {
    console.error(e)
    process.exit(1)
  })
}
