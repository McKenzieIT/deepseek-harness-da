/**
 * Model-facing `edit_definition` tool — apply partial patches to semantic layer
 * asset definitions (table, event, or metric) with Tier-2 audit trail. The
 * management agent uses this to improve semantic layer quality by editing asset
 * definitions after evaluating their correctness.
 *
 * G4 Q5 decision: direct write + Tier-2 audit + unreviewed status.
 * No draft/publish workflow — writes are immediate but marked 'unreviewed'.
 *
 * @module @deepseek-ai/dsh-tool-edit-definition
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools'
import type { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer/src/index.ts'
import { computeStructuredDelta, type Audit } from '@deepseek-ai/dsh-audit'

export const name = 'tool-edit-definition'
export const inject = ['tools', 'schema', 'audit']

export interface Config {}
export const Config: z<Config> = z.object({})

// ── Validation ──────────────────────────────────────────────────────────────

export function validateAssetName(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (/[/\\\x00]|\.\./.test(trimmed) || trimmed === '.') return null
  if (trimmed.length > 200) return null
  return trimmed
}

// ── Result type ─────────────────────────────────────────────────────────────

export interface EditDefinitionResult {
  readonly applied: boolean
  readonly asset_name: string
  readonly kind: string
  readonly patched_fields: string[]
  readonly message?: string
}

// ── Core logic (extracted for testability) ──────────────────────────────────

/**
 * Merge two arrays of object records by a shared identity field (e.g. `name`
 * for columns, `dim_table` for dimension_refs). Existing entries keep their
 * values unless the patch provides an override for that identity; new entries
 * in the patch are appended. Patch entries lacking the identity field are
 * skipped (defensive — a nameless column/dim-ref is not mergeable).
 */
function mergeByName(
  existing: readonly unknown[],
  patch: readonly unknown[],
  idField: string,
): Record<string, unknown>[] {
  const merged: Record<string, unknown>[] = []
  for (const entry of existing) {
    if (typeof entry === 'object' && entry !== null) {
      merged.push(entry as Record<string, unknown>)
    }
  }
  for (const patchEntry of patch) {
    if (typeof patchEntry !== 'object' || patchEntry === null) continue
    const pe = patchEntry as Record<string, unknown>
    const id = pe[idField]
    if (!id) continue
    const idx = merged.findIndex(c => c[idField] === id)
    if (idx >= 0) {
      merged[idx] = { ...merged[idx], ...pe }
    } else {
      merged.push(pe)
    }
  }
  return merged
}

/**
 * Merge a patch into a definition object. Smart-merge vs replace depends on
 * the array field:
 *  - `columns` — by-name merge (identity field: `name`).
 *  - `dimension_refs` — by-name merge (identity field: `dim_table`).
 *  - `domains` — string array, union with dedup (preserving existing order).
 *  - All other arrays and scalars — top-level replace.
 */
export function applyPatch(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...existing }
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'columns' && Array.isArray(value) && Array.isArray(existing.columns)) {
      result.columns = mergeByName(existing.columns, value, 'name')
    } else if (key === 'dimension_refs' && Array.isArray(value) && Array.isArray(existing.dimension_refs)) {
      result.dimension_refs = mergeByName(existing.dimension_refs, value, 'dim_table')
    } else if (key === 'domains' && Array.isArray(value) && Array.isArray(existing.domains)) {
      // string array: union with dedup, preserving existing order
      const existingDomains = existing.domains as readonly unknown[]
      const seen = new Set<unknown>(existingDomains)
      const merged = [...existingDomains]
      for (const d of value as readonly unknown[]) {
        if (!seen.has(d)) {
          seen.add(d)
          merged.push(d)
        }
      }
      result.domains = merged
    } else if (key === 'alt_labels' && Array.isArray(value) && Array.isArray(existing.alt_labels)) {
      const existingLabels = existing.alt_labels as readonly unknown[]
      const seen = new Set<unknown>(existingLabels)
      const merged = [...existingLabels]
      for (const l of value as readonly unknown[]) {
        if (!seen.has(l)) {
          seen.add(l)
          merged.push(l)
        }
      }
      result.alt_labels = merged
    } else {
      result[key] = value
    }
  }
  return result
}

/**
 * Core edit logic: resolves the asset, applies the patch, sets unreviewed
 * status, and returns the result. Does NOT perform I/O or audit — the caller
 * handles persistence.
 */
export function computeEdit(
  schema: SemanticLayerService | undefined,
  assetName: string,
  patch: Record<string, unknown>,
): { result: EditDefinitionResult; merged?: Record<string, unknown>; before?: Record<string, unknown>; kind?: string } {
  if (schema === undefined) {
    return {
      result: {
        applied: false,
        asset_name: assetName,
        kind: 'unknown',
        patched_fields: [],
        message: 'semantic-layer not mounted (ctx.schema unavailable)',
      },
    }
  }

  const validated = validateAssetName(assetName)
  if (validated === null) {
    return {
      result: {
        applied: false,
        asset_name: assetName,
        kind: 'unknown',
        patched_fields: [],
        message: `invalid asset name: ${JSON.stringify(assetName)}`,
      },
    }
  }

  if (typeof patch !== 'object' || Array.isArray(patch)) {
    return {
      result: {
        applied: false,
        asset_name: validated,
        kind: 'unknown',
        patched_fields: [],
        message: 'patch must be a non-null object',
      },
    }
  }

  // Try table first
  const table = schema.loadTableDefinition(validated)
  if (table !== null) {
    const existing = table as unknown as Record<string, unknown>
    const merged = applyPatch(existing, patch)
    // G4 Q5: agent writes marked 'unreviewed'. WARN 6: preserve existing
    // confirmation metadata (confirmed_by, reviewed_at, …) — only flip the
    // status, don't clobber sibling fields.
    const existingConfirmation = merged.confirmation as Record<string, unknown> | undefined
    merged.confirmation = { ...(existingConfirmation ?? {}), status: 'unreviewed' }
    return {
      result: {
        applied: true,
        asset_name: validated,
        kind: 'table',
        patched_fields: Object.keys(patch),
      },
      merged,
      before: existing,
      kind: 'table',
    }
  }

  // Try event
  const event = schema.loadEventDefinition(validated)
  if (event !== null) {
    const existing = event as unknown as Record<string, unknown>
    const merged = applyPatch(existing, patch)
    // G4 Q5: agent writes marked 'unreviewed'. WARN 6: preserve existing
    // confirmation metadata (confirmed_by, reviewed_at, …) — only flip the
    // status, don't clobber sibling fields.
    const existingConfirmation = merged.confirmation as Record<string, unknown> | undefined
    merged.confirmation = { ...(existingConfirmation ?? {}), status: 'unreviewed' }
    return {
      result: {
        applied: true,
        asset_name: validated,
        kind: 'event',
        patched_fields: Object.keys(patch),
      },
      merged,
      before: existing,
      kind: 'event',
    }
  }

  // Try metric (virtual — cannot be directly edited, as they derive from host)
  const metric = schema.loadMetricDefinition(validated)
  if (metric !== null) {
    return {
      result: {
        applied: false,
        asset_name: validated,
        kind: 'metric',
        patched_fields: [],
        message: 'Metrics are virtual (derived from host table/event). Edit the host asset\'s metrics block instead.',
      },
    }
  }

  // Try concept (CL-2: concepts support description/pref_label direct overwrite, alt_labels union with dedup)
  const concept = schema.loadConceptDefinition(validated)
  if (concept !== null) {
    const existing = concept as unknown as Record<string, unknown>
    const merged = applyPatch(existing, patch)
    return {
      result: {
        applied: true,
        asset_name: validated,
        kind: 'concept',
        patched_fields: Object.keys(patch),
      },
      merged,
      before: existing,
      kind: 'concept',
    }
  }

  return {
    result: {
      applied: false,
      asset_name: validated,
      kind: 'unknown',
      patched_fields: [],
      message: `no table, event, metric, or concept named "${validated}" found`,
    },
  }
}

// ── Formatting ──────────────────────────────────────────────────────────────

export function formatEditDefinition(value: EditDefinitionResult): string {
  if (!value.applied) return value.message ?? 'edit failed'
  return `[${value.kind}] ${value.asset_name}: patched fields: ${value.patched_fields.join(', ')}`
}

// ── Plugin apply ────────────────────────────────────────────────────────────

export function apply(ctx: Context, _config: Config = {}): void {
  ctx.tools.register(defineTool({
    name: 'edit_definition',
    description:
      'Edit a data asset definition (table, event, or concept) by applying a '
      + 'partial patch. The patch is shallow-merged at top level; for `columns` '
      + 'and `dimension_refs`, merges by identity field (name / dim_table). '
      + '`domains` and `alt_labels` are unioned with dedup. All edits to '
      + 'tables/events are marked "unreviewed" and audited. Metrics are virtual '
      + 'and cannot be edited directly — edit the host asset instead.',
    parameters: {
      asset_name: {
        type: 'string',
        required: true,
        description: 'The asset to edit (table_name or event name).',
      },
      patch: {
        type: 'object',
        additionalProperties: true,
        required: true,
        description:
          'Partial definition fields to merge. Supports: description, columns '
          + '(array merged by name), dimension_refs (array merged by '
          + 'dim_table), domains (unioned with dedup), granularity, metrics, etc.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          applied: { type: 'boolean', required: true },
          asset_name: { type: 'string', required: true },
          kind: { type: 'string', required: true },
          patched_fields: { type: 'array', items: { type: 'string' } },
          message: { type: 'string' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: formatEditDefinition(value as EditDefinitionResult),
      }],
      presentationMeta: (_args, value) => value,
    },
    async execute(args, exec): Promise<EditDefinitionResult> {
      if (exec.signal.aborted) throw new Error('edit_definition aborted')

      // WARN 1: inject = ['tools', 'schema', 'audit'] guarantees these are
      // mounted when execute runs — use ctx.schema / ctx.audit directly (no
      // ctx.get + `| undefined` fallback). The `as unknown as` on schema
      // bridges the project-reference type identity between the augmentation
      // and the explicit import.
      const schema = ctx.schema
      const audit: Audit = ctx.audit
      const patch = args.patch as Record<string, unknown>

      const { result, merged, before, kind } = computeEdit(schema, args.asset_name, patch)

      if (!result.applied || merged === undefined) {
        return result
      }

      // W11 S1: persist before-snapshot (undo substrate). Fail-silent: snapshot
      // failure must not break the business write.
      if (before !== undefined) {
        try {
          const { dumpYaml } = await import('@deepseek-ai/dsh-semantic-layer/src/io.ts')
          const beforeYaml = dumpYaml(before)
          audit.store.recordSnapshot(result.asset_name, kind as 'table' | 'event', beforeYaml)
        } catch { /* fail-silent */ }
      }

      // Persist the edit
      try {
        if (kind === 'table') {
          // D3-3 (TOCTOU): pass a PARTIAL override (patch + confirmation
          // flip) to updateTableMeta, not the full `merged` dict. The
          // substrate re-reads the current on-disk definition and shallow-
          // merges `updates` on top, so stale `existing`-sourced fields in
          // `merged` would silently revert a concurrent edit to any non-
          // patched field. `merged` stays the before/after snapshot source.
          const updates: Record<string, unknown> = {
            ...patch,
            confirmation: merged.confirmation,
          }
          const res = await schema.updateTableMeta(result.asset_name, updates)
          if (!res.ok) {
            return {
              applied: false,
              asset_name: result.asset_name,
              kind: 'table',
              patched_fields: [],
              message: `write failed: ${res.error}`,
            }
          }
        } else if (kind === 'event') {
          // Events use writeEventYaml (raw-edit surface). The event write path
          // does not have a Service-level method with Tier-2 audit, so we
          // record audit separately below.
          const { writeEventYaml, dumpYaml } = await import('@deepseek-ai/dsh-semantic-layer/src/io.ts')
          const yamlContent = dumpYaml(merged)
          const res = await writeEventYaml(schema.semanticRoot, result.asset_name, yamlContent)
          if (!res.ok) {
            return {
              applied: false,
              asset_name: result.asset_name,
              kind: 'event',
              patched_fields: [],
              message: `write failed: ${res.error}`,
            }
          }
        } else if (kind === 'concept') {
          const { dumpYaml } = await import('@deepseek-ai/dsh-semantic-layer/src/io.ts')
          const { writeFileAtomic } = await import('@deepseek-ai/dsh-atomic-write')
          // oxlint-disable-next-line typescript/unbound-method -- static module function, no this-binding
          const { join } = await import('node:path')
          const { mkdirSync } = await import('node:fs')
          const conceptsDir = join(schema.semanticRoot, 'concepts')
          mkdirSync(conceptsDir, { recursive: true })
          const yamlContent = dumpYaml(merged)
          await writeFileAtomic(join(conceptsDir, `${result.asset_name}.yaml`), yamlContent, { mode: 0o644 })
        }
      } catch (e) {
        return {
          applied: false,
          asset_name: result.asset_name,
          kind: kind ?? 'unknown',
          patched_fields: [],
          message: `write error: ${(e as Error).message}`,
        }
      }

      // Record Tier-2 audit (for events; tables are already audited via
      // updateTableMeta). inject guarantees audit is mounted — use it directly.
      // V1 (G6 D4): compute a structured before/after delta and co-locate it
      // with the tier-2 write event for ALL kinds (table / event / concept).
      // Tables already have a substrate-level `update_table_meta` audit row;
      // this `edit_definition` row carries the structured delta that the
      // management agent's ③ self-driven loop + the V2 eval-run changeset read
      // via `audit.store.listDeltasSince(ts)`. The automatic `confirmation`
      // status flip is stripped from the delta (noise — it is always
      // 'unreviewed' after every edit, not a semantic change).
      if (before !== undefined && kind !== undefined) {
        try {
          const { confirmation: _bConf, ...beforeForDelta } = before
          const { confirmation: _aConf, ...afterForDelta } = merged
          const delta = computeStructuredDelta(beforeForDelta, afterForDelta)
          audit.recordTier2Write(
            'edit_definition',
            { asset_name: result.asset_name, patch },
            { delta, asset_name: result.asset_name, kind },
          )
        } catch {
          // fail-silent: audit failure must not break the business write
        }
      }

      return result
    },
    presentCall(args): GenericCallView {
      return {
        card: 'generic',
        title: `Edit: ${args.asset_name}`,
        kind: 'edit',
      }
    },
    presentResult(args, result: ToolResult): GenericResultView | undefined {
      if (result.isError) return undefined
      const meta = result.meta as EditDefinitionResult | undefined
      if (!meta?.applied) {
        return { card: 'generic', title: `Edit failed: ${args.asset_name}` }
      }
      return {
        card: 'generic',
        title: `Edited ${meta.kind}: ${meta.asset_name} [${meta.patched_fields.join(', ')}]`,
      }
    },
  }))
}
