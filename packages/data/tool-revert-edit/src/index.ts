/**
 * Model-facing `revert_edit` tool — roll back a semantic layer asset definition
 * to a prior snapshot stored in the audit trail. Each `edit_definition` call
 * records a before-snapshot; this tool restores one of those snapshots.
 *
 * W11 S1 decision: `revert_edit(asset_name, to_version)` based on audit trail
 * before-snapshot versioning.
 *
 * @module @deepseek-ai/dsh-tool-revert-edit
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools'
import type { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer/src/index.ts'
import type { Audit } from '@deepseek-ai/dsh-audit'

export const name = 'tool-revert-edit'
export const inject = ['tools', 'schema', 'audit']

export interface Config {}
export const Config: z<Config> = z.object({})

// ── Validation ──────────────────────────────────────────────────────────────

function validateAssetName(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (/[/\\\x00]|\.\./.test(trimmed) || trimmed === '.') return null
  if (trimmed.length > 200) return null
  return trimmed
}

// ── Result type ─────────────────────────────────────────────────────────────

export interface RevertEditResult {
  readonly reverted: boolean
  readonly asset_name: string
  readonly kind: string
  readonly from_version?: number
  readonly to_version: number
  readonly message?: string
}

// ── Formatting ──────────────────────────────────────────────────────────────

function formatRevertEdit(value: RevertEditResult): string {
  if (!value.reverted) return value.message ?? 'revert failed'
  return `[${value.kind}] ${value.asset_name}: reverted to snapshot v${value.to_version}`
}

// ── Plugin apply ────────────────────────────────────────────────────────────

export function apply(ctx: Context, _config: Config = {}): void {
  ctx.tools.register(defineTool({
    name: 'revert_edit',
    description:
      'Roll back a data asset definition (table or event) to a prior snapshot. '
      + 'Each edit_definition call records a before-snapshot with an incrementing '
      + 'version number per asset. Use this tool to undo edits by reverting to a '
      + 'specific version. The current state is also snapshotted before reverting '
      + '(so the revert itself can be undone).',
    parameters: {
      asset_name: {
        type: 'string',
        required: true,
        description: 'The asset to revert (table_name or event name).',
      },
      to_version: {
        type: 'integer',
        description:
          'The snapshot version to restore (must be >= 1). Use list mode (omit to_version and '
          + 'set list_versions=true) to see available versions, or specify a '
          + 'version number to revert to that snapshot.',
      },
      list_versions: {
        type: 'boolean',
        description:
          'If true, list available snapshot versions for the asset instead of '
          + 'reverting. Returns version metadata without modifying anything.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          reverted: { type: 'boolean' },
          asset_name: { type: 'string' },
          kind: { type: 'string' },
          from_version: { type: 'integer' },
          to_version: { type: 'integer' },
          message: { type: 'string' },
          versions: { type: 'array', items: { type: 'object', additionalProperties: true } },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: (value as { versions?: unknown[] }).versions
          ? `Available versions: ${JSON.stringify((value as { versions: unknown[] }).versions, null, 2)}`
          : formatRevertEdit(value as RevertEditResult),
      }],
      presentationMeta: (_args, value) => value,
    },
    async execute(args, exec) {
      if (exec.signal.aborted) throw new Error('revert_edit aborted')

      const schema = ctx.schema as unknown as SemanticLayerService
      const audit: Audit = ctx.audit

      const validated = validateAssetName(args.asset_name)
      if (validated === null) {
        return {
          reverted: false,
          asset_name: args.asset_name,
          kind: 'unknown',
          to_version: args.to_version ?? 0,
          message: `invalid asset name: ${JSON.stringify(args.asset_name)}`,
        }
      }

      // List mode: return available snapshots
      if (args.list_versions) {
        const versions = audit.store.listSnapshots(validated)
        return { asset_name: validated, versions }
      }

      if (args.to_version === undefined) {
        return {
          reverted: false,
          asset_name: validated,
          kind: 'unknown',
          to_version: 0,
          message: 'to_version is required (or set list_versions=true to see available versions)',
        }
      }

      // Look up target snapshot
      const snapshot = audit.store.getSnapshot(validated, args.to_version)
      if (snapshot === null) {
        return {
          reverted: false,
          asset_name: validated,
          kind: 'unknown',
          to_version: args.to_version,
          message: `no snapshot found for "${validated}" at version ${args.to_version}`,
        }
      }

      const kind = snapshot.kind as 'table' | 'event'

      // Record a before-snapshot of the CURRENT state (so this revert can be undone)
      let fromVersion: number | undefined
      try {
        const { dumpYaml } = await import('@deepseek-ai/dsh-semantic-layer/src/io.ts')
        let currentYaml: string | undefined
        if (kind === 'table') {
          const current = schema.loadTableDefinition(validated)
          if (current !== null) currentYaml = dumpYaml(current)
        } else if (kind === 'event') {
          const current = schema.loadEventDefinition(validated)
          if (current !== null) currentYaml = dumpYaml(current)
        }
        if (currentYaml !== undefined) {
          fromVersion = audit.store.recordSnapshot(validated, kind, currentYaml)
        }
      } catch { /* fail-silent: pre-revert snapshot failure must not block the revert */ }

      // Write the snapshot content back to the semantic layer.
      // Intentionally uses raw writeTable (not schema.updateTableMeta) because a
      // revert restores the exact prior state — re-enrichment (enrichOnWrite) would
      // mutate the restored definition, defeating the purpose of an undo.
      try {
        const { writeTable, writeEventYaml } = await import('@deepseek-ai/dsh-semantic-layer/src/io.ts')
        if (kind === 'table') {
          const { load: yamlLoad } = await import('js-yaml')
          const obj = yamlLoad(snapshot.content) as Record<string, unknown>
          await writeTable(schema.semanticRoot, validated, obj)
        } else if (kind === 'event') {
          const res = await writeEventYaml(schema.semanticRoot, validated, snapshot.content)
          if (!res.ok) {
            return {
              reverted: false,
              asset_name: validated,
              kind,
              to_version: args.to_version,
              message: `write failed: ${res.error}`,
            }
          }
        }
      } catch (e) {
        return {
          reverted: false,
          asset_name: validated,
          kind,
          to_version: args.to_version,
          message: `write error: ${(e as Error).message}`,
        }
      }

      // Record Tier-2 audit for the revert itself
      try {
        audit.recordTier2Write('revert_edit', { asset_name: validated, to_version: args.to_version })
      } catch { /* fail-silent */ }

      return {
        reverted: true,
        asset_name: validated,
        kind,
        ...(fromVersion !== undefined ? { from_version: fromVersion } : {}),
        to_version: args.to_version,
      }
    },
    presentCall(args): GenericCallView {
      return {
        card: 'generic',
        title: args.list_versions
          ? `Snapshots: ${args.asset_name}`
          : `Revert: ${args.asset_name} → v${args.to_version}`,
        kind: 'edit',
      }
    },
    presentResult(args, result: ToolResult): GenericResultView | undefined {
      if (result.isError) return undefined
      const meta = result.meta as RevertEditResult | undefined
      if (meta && 'versions' in meta) {
        return { card: 'generic', title: `Snapshot history: ${args.asset_name}` }
      }
      if (!meta?.reverted) {
        return { card: 'generic', title: `Revert failed: ${args.asset_name}` }
      }
      return {
        card: 'generic',
        title: `Reverted ${meta.kind}: ${meta.asset_name} → v${meta.to_version}`,
      }
    },
  }))
}
