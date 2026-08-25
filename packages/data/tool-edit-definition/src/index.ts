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
import type {} from '@deepseek-ai/dsh-audit'

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
 * Merge a patch into a definition object. For top-level scalars, replaces them.
 * For arrays like `columns`, merges by the `name` field (existing columns keep
 * their values unless the patch provides an override for that column name; new
 * columns in the patch are appended).
 */
export function applyPatch(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...existing }
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'columns' && Array.isArray(value) && Array.isArray(existing.columns)) {
      // Merge columns by name
      const existingCols = existing.columns as Array<Record<string, unknown>>
      const patchCols = value as Array<Record<string, unknown>>
      const merged = [...existingCols]
      for (const patchCol of patchCols) {
        if (typeof patchCol !== 'object' || patchCol === null || !patchCol.name) {
          continue
        }
        const idx = merged.findIndex(c => c.name === patchCol.name)
        if (idx >= 0) {
          merged[idx] = { ...merged[idx], ...patchCol }
        } else {
          merged.push(patchCol)
        }
      }
      result.columns = merged
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
): { result: EditDefinitionResult; merged?: Record<string, unknown>; kind?: string } {
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

  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
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
    // G4 Q5: agent writes marked 'unreviewed'
    merged.confirmation = { status: 'unreviewed' }
    return {
      result: {
        applied: true,
        asset_name: validated,
        kind: 'table',
        patched_fields: Object.keys(patch),
      },
      merged,
      kind: 'table',
    }
  }

  // Try event
  const event = schema.loadEventDefinition(validated)
  if (event !== null) {
    const existing = event as unknown as Record<string, unknown>
    const merged = applyPatch(existing, patch)
    // G4 Q5: agent writes marked 'unreviewed'
    merged.confirmation = { status: 'unreviewed' }
    return {
      result: {
        applied: true,
        asset_name: validated,
        kind: 'event',
        patched_fields: Object.keys(patch),
      },
      merged,
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

  return {
    result: {
      applied: false,
      asset_name: validated,
      kind: 'unknown',
      patched_fields: [],
      message: `no table, event, or metric named "${validated}" found`,
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
      'Edit a data asset definition (table or event) by applying a partial '
      + 'patch. The patch is shallow-merged at top level; for `columns`, merges '
      + 'by column name. All edits are marked "unreviewed" and audited. Metrics '
      + 'are virtual and cannot be edited directly — edit the host asset instead.',
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
          + '(array merged by name), domains, dimension_refs, granularity, metrics, etc.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          applied: { type: 'boolean', required: true },
          asset_name: { type: 'string', required: true },
          kind: { type: 'string', required: true },
          patched_fields: { type: 'array' },
          message: { type: 'string' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: formatEditDefinition(value as unknown as EditDefinitionResult),
      }],
      presentationMeta: (_args, value) => value,
    },
    async execute(args, exec) {
      if (exec.signal.aborted) throw new Error('edit_definition aborted')

      const schema = ctx.get('schema') as SemanticLayerService | undefined
      const audit = ctx.get('audit') as { recordTier2Write(tool: string, payload: unknown): string } | undefined
      const patch = (args.patch ?? {}) as Record<string, unknown>

      const { result, merged, kind } = computeEdit(schema, args.asset_name, patch)

      if (!result.applied || merged === undefined || schema === undefined) {
        return result as unknown
      }

      // Persist the edit
      try {
        if (kind === 'table') {
          // Use the Service's updateTableMeta for tables (Tier-2 audited path)
          const updates = { ...merged }
          const res = await schema.updateTableMeta(result.asset_name, updates)
          if (!res.ok) {
            return {
              applied: false,
              asset_name: result.asset_name,
              kind: 'table',
              patched_fields: [],
              message: `write failed: ${res.error}`,
            } as unknown
          }
        } else if (kind === 'event') {
          // Events use writeEventYaml (raw-edit surface). Import dumpYaml to
          // serialize back; the event write path does not have a Service-level
          // method with Tier-2 audit, so we record audit separately.
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
            } as unknown
          }
        }
      } catch (e) {
        return {
          applied: false,
          asset_name: result.asset_name,
          kind: kind ?? 'unknown',
          patched_fields: [],
          message: `write error: ${(e as Error).message}`,
        } as unknown
      }

      // Record Tier-2 audit (for events; tables are already audited via updateTableMeta)
      if (kind === 'event' && audit !== undefined) {
        try {
          audit.recordTier2Write('edit_definition', { asset_name: result.asset_name, patch })
        } catch {
          // fail-silent: audit failure must not break the business write
        }
      }

      return result as unknown
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
