/**
 * AI-Native enrichment (B1/B2) — discover DWS→DIM dimension relations.
 *
 * G3 design (resolved 2026-08-22):
 *  - Two-round strategy: (1) deterministic PK-name exact match (no LLM);
 *    (2) LLM-assisted semantic match via an injectable `llmCall`.
 *  - Results merged + deduped by `dim_table`; written directly (no approval).
 *  - `llmCall` is OPTIONAL: when absent, only the deterministic round runs.
 *
 * Substrate discipline: this module imports ONLY the substrate (types/io) +
 * atomic-write — it does NOT import `@deepseek-ai/dsh-llm`. The `llmCall`
 * adapter that wraps `ctx.llm` lives at the service/tool layer (B3/B4), so the
 * semantic-layer substrate stays zod + js-yaml only.
 *
 * @module @deepseek-ai/dsh-semantic-layer/src/enrichment
 */
import {
  TableDefinitionSchema,
  DimensionRefSchema,
  type TableDefinition,
  type DimensionRef,
} from './types.ts'
import { loadTables, writeTable } from './io.ts'

// ── Types ───────────────────────────────────────────────────────────────

/**
 * A DIM table summarized for relation discovery: its name, primary_key, a
 * description, and (optionally), its columns for richer LLM context.
 */
export interface DimInventoryEntry {
  readonly table_name: string
  readonly primary_key: readonly string[]
  readonly description: string
  readonly columns?: ReadonlyArray<{ name: string; comment?: string; type?: string }>
}

/**
 * An injectable one-shot text LLM call (prompt in, text out). When omitted,
 * `discoverRelationsFor` runs the deterministic round only. Production wires
 * this to `ctx.llm` (B3/B4); the substrate stays free of the LLM dependency.
 */
export type LlmCall = (prompt: string) => Promise<string>

// ── Round 1: deterministic (no LLM) ─────────────────────────────────────

/**
 * Deterministic round: for each DIM with a non-empty `primary_key`, emit a
 * DimensionRef for every DIM PK column whose name exactly matches a column on
 * the target DWS (G3 exact-name match). High-precision seed set; no LLM.
 * @param targetDef - the DWS table definition to find DIM joins for.
 * @param dimInventory - the DIM tables to match against.
 * @returns one DimensionRef per DIM whose PK shares at least one column name with the target.
 */
export function discoverRelationsDeterministic(
  targetDef: TableDefinition,
  dimInventory: readonly DimInventoryEntry[],
): DimensionRef[] {
  const colNames = new Set((targetDef.columns ?? []).map(c => c.name))
  const refs: DimensionRef[] = []
  for (const dim of dimInventory) {
    const pks = (dim.primary_key ?? []).filter(pk => colNames.has(pk))
    if (pks.length === 0) continue
    refs.push({
      dim_table: dim.table_name,
      join_keys: pks.map(pk => ({ dws_column: pk, dim_column: pk })),
      derivation: `确定性：DWS 列 ${pks.join(', ')} 与 ${dim.table_name} 主键精确同名`,
    })
  }
  return refs
}

// ── Merge (dedupe by dim_table, union join_keys) ───────────────────────

// pair key = JSON.stringify([dws_column, dim_column]) — collision-proof: the
// JSON array form disambiguates ("a","bc") from ("ab","c"), unlike the
// separator-free concatenation that hashed both to "abc".
const pairKey = (k: { dws_column: string; dim_column: string }) => JSON.stringify([k.dws_column, k.dim_column])

/**
 * Merge two DimensionRef lists: dedupe by `dim_table`, unioning `join_keys`
 * (deduped by the dws|dim pair). The second list's `derivation` overrides the
 * first's when the first's derivation is absent or the deterministic generic
 * (starts with "确定性") — i.e. the LLM/semantic derivation wins over the
 * generic one, but a human-curated derivation is preserved.
 * @param baseline - the first list (e.g. deterministic refs, or existing curated refs).
 * @param added - the second list (e.g. LLM refs, or newly-discovered refs).
 * @returns the merged, deduped DimensionRef list (baseline preserved + added unioned).
 */
export function mergeRefs(
  baseline: readonly DimensionRef[],
  added: readonly DimensionRef[],
): DimensionRef[] {
  const map = new Map<string, DimensionRef>()
  for (const r of baseline) {
    map.set(r.dim_table, { dim_table: r.dim_table, join_keys: r.join_keys.map(k => ({ ...k })), derivation: r.derivation })
  }
  for (const r of added) {
    const ex = map.get(r.dim_table)
    if (ex) {
      const seen = new Set(ex.join_keys.map(pairKey))
      for (const k of r.join_keys) {
        const key = pairKey(k)
        if (!seen.has(key)) {
          ex.join_keys.push({ dws_column: k.dws_column, dim_column: k.dim_column })
          seen.add(key)
        }
      }
      if (r.derivation && (!ex.derivation || ex.derivation.startsWith('确定性'))) {
        ex.derivation = r.derivation
      }
    } else {
      map.set(r.dim_table, { dim_table: r.dim_table, join_keys: r.join_keys.map(k => ({ ...k })), derivation: r.derivation })
    }
  }
  return [...map.values()]
}

// ── Round 2: LLM-assisted ───────────────────────────────────────────────

/**
 * Build the LLM prompt for one target DWS: its columns (name + comment) +
 * description, plus the full DIM inventory (table_name + primary_key +
 * description). The model is asked to return a JSON array of DimensionRef.
 * @param targetDef - the DWS table definition.
 * @param dimInventory - the DIM tables to consider.
 * @returns the assembled prompt text.
 */
export function buildLlmPrompt(targetDef: TableDefinition, dimInventory: readonly DimInventoryEntry[]): string {
  const cols = (targetDef.columns ?? []).map(c => `- ${c.name} (${c.type || 'string'}): ${c.comment || ''}`).join('\n')
  const dims = dimInventory
    .map(d => `- ${d.table_name} | PK: [${(d.primary_key ?? []).join(', ')}] | ${d.description || ''}`)
    .join('\n')
  return [
    `Discover dimension (DIM) join relations for the DWS fact table \`${targetDef.table_name}\`.`,
    '',
    `DWS table: ${targetDef.table_name}`,
    `Description: ${targetDef.description || targetDef.table_comment || ''}`,
    'Columns:',
    cols,
    '',
    'DIM inventory (find joins where a DWS column is a foreign key to a DIM primary_key — exact name OR semantic equivalence):',
    dims,
    '',
    'Return ONLY a JSON array of objects: [{"dim_table":"<DIM table_name>","join_keys":[{"dws_column":"<DWS col>","dim_column":"<DIM pk col>"}],"derivation":"<one sentence justification>"}].',
    'Rules: join_keys non-empty; only high-confidence foreign-key joins; if none, return [].',
  ].join('\n')
}

function extractJsonArray(text: string): unknown[] {
  // tolerate ```json fences and leading/trailing prose
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  t = fence?.[1]?.trim() ?? t
  const start = t.indexOf('[')
  const end = t.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) return []
  try {
    const parsed = JSON.parse(t.slice(start, end + 1))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Parse + validate an LLM's textual response into DimensionRefs. Lenient: any
 * item failing `DimensionRefSchema` (e.g. empty join_keys) is dropped rather
 * than aborting the whole batch.
 * @param text - the raw LLM response text.
 * @returns the valid DimensionRefs found in the response (empty when none/invalid).
 */
export function parseLlmRefs(text: string): DimensionRef[] {
  const arr = extractJsonArray(text)
  const refs: DimensionRef[] = []
  for (const item of arr) {
    const r = DimensionRefSchema.safeParse(item)
    if (r.success) refs.push(r.data)
  }
  return refs
}

/**
 * Discover dimension relations for one DWS table (G3 two-round strategy).
 * Round 1 (deterministic, no LLM) always runs; round 2 (LLM) runs only when
 * `llmCall` is provided and is best-effort (a thrown call or invalid JSON
 * degrades to round-1 results only).
 * @param targetDef - the DWS table definition.
 * @param dimInventory - the DIM tables to match against.
 * @param llmCall - optional one-shot LLM call for the semantic round.
 * @returns the merged DimensionRefs for the target.
 */
export async function discoverRelationsFor(
  targetDef: TableDefinition,
  dimInventory: readonly DimInventoryEntry[],
  llmCall?: LlmCall,
): Promise<DimensionRef[]> {
  const det = discoverRelationsDeterministic(targetDef, dimInventory)
  if (!llmCall) return det
  let llm: DimensionRef[] = []
  try {
    const text = await llmCall(buildLlmPrompt(targetDef, dimInventory))
    llm = parseLlmRefs(text)
  } catch {
    // best-effort: LLM round failure leaves the deterministic seed intact
  }
  return mergeRefs(det, llm)
}

// ── B2: batch enrich all DWS tables ────────────────────────────────────

/**
 * Build the DIM inventory from the layer's DIM tables (kind='dim').
 * @param semanticLayer - the semantic-layer directory path.
 * @returns the DIM inventory entries (table_name + primary_key + description + columns).
 */
export function buildDimInventory(semanticLayer: string): DimInventoryEntry[] {
  const out: DimInventoryEntry[] = []
  for (const t of loadTables(semanticLayer)) {
    const r = TableDefinitionSchema.safeParse(t.raw)
    if (!r.success || r.data.kind !== 'dim') continue
    out.push({
      table_name: r.data.table_name,
      primary_key: r.data.primary_key,
      description: r.data.description || r.data.table_comment,
      columns: r.data.columns.map(c => ({ name: c.name, comment: c.comment, type: c.type })),
    })
  }
  return out
}

/**
 * Read + validate the existing `dimension_refs` on a raw table dict (best-effort:
 * a non-array or invalid entry is dropped, mirroring the lenient scan).
 * @param raw - the raw table dict (unparsed YAML).
 * @returns the valid existing DimensionRefs (empty when absent/invalid).
 */
function existingRefs(raw: Record<string, unknown>): DimensionRef[] {
  const arr = raw.dimension_refs
  const out: DimensionRef[] = []
  if (!Array.isArray(arr)) return out
  for (const x of arr) {
    const v = DimensionRefSchema.safeParse(x)
    if (v.success) out.push(v.data)
  }
  return out
}

/**
 * Enrich every DWS table (kind !== 'dim') in a semantic layer: discover its
 * DIM relations and write them back into the table YAML's `dimension_refs`.
 *
 * Writes preserve the raw file verbatim (physical types, extra keys) — only
 * `dimension_refs` is replaced/merged — because `writeTable` writes the passed
 * object after validating it (it does not rewrite canonicalized types). DIM
 * tables are left untouched. Per-table fail-tolerant: a thrown discover/write
 * becomes an error string rather than aborting the batch.
 *
 * `mergeExisting`: when `true`, the discovered refs are merged WITH the table's
 * existing `dimension_refs` (existing preserved, discovered unioned) instead of
 * replacing them — used by the on-write hook so auto-trigger can never wipe
 * human-curated joins the deterministic round does not rediscover. When `false`
 * (default), discovered refs REPLACE existing — used by the explicit
 * `discoverRelations` entry (re-discover + replace, G3 direct-write).
 * @param semanticLayer - the semantic-layer directory path.
 * @param llmCall - optional one-shot LLM call for the semantic round.
 * @param tables - optional table_name filter; omit or empty to enrich all DWS tables.
 * @param mergeExisting - when true, merge discovered refs with existing (preserve curated); default false (replace).
 * @returns `enriched` (DWS tables that gained at least one ref) + `written` (DWS
 *   tables updated) + per-table `errors`.
 */
export async function enrichAllDwsTables(
  semanticLayer: string,
  llmCall?: LlmCall,
  tables?: readonly string[],
  mergeExisting = false,
): Promise<{ enriched: number; written: number; errors: string[] }> {
  const dimInventory = buildDimInventory(semanticLayer)
  const filter = tables !== undefined && tables.length > 0 ? new Set(tables) : undefined
  let enriched = 0
  let written = 0
  const errors: string[] = []
  for (const t of loadTables(semanticLayer)) {
    if (filter !== undefined && !filter.has(t.table_name)) continue
    const r = TableDefinitionSchema.safeParse(t.raw)
    if (!r.success) {
      errors.push(`${t.table_name}: schema parse failed`)
      continue
    }
    if (r.data.kind === 'dim') continue // only DWS
    try {
      const discovered = await discoverRelationsFor(r.data, dimInventory, llmCall)
      const refs = mergeExisting ? mergeRefs(existingRefs(t.raw), discovered) : discovered
      // write raw + refs (preserves physical types / extra keys; writeTable validates)
      await writeTable(semanticLayer, t.table_name, { ...t.raw, dimension_refs: refs })
      written += 1
      if (refs.length > 0) enriched += 1
    } catch (e) {
      errors.push(`${t.table_name}: ${(e as Error).message}`)
    }
  }
  return { enriched, written, errors }
}
