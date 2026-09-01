/**
 * Model-facing `update_table_config` tool — the self-evolution #3b write entry.
 *
 * When a TABLE_NOT_FOUND surfaces (query-maxcompute failureKind=not_found), the
 * self-evolution loop asks the user which engine project the table lives in
 * (Task 6's `present_clarification`), then calls this tool to persist the
 * answer as a per-table `project` override on the table YAML. The next
 * `qualifyTable` retry reads the override (Task 3a) and qualifies the table
 * `<project>.<table>` so the engine finds it — closing the loop without a code
 * change or a restart.
 *
 * This is the third model-facing tool (after `tool-search-data-sources` and
 * `tool-load-table-definition`) and the first model-facing WRITE. It mirrors
 * `tool-load-table-definition`'s `defineTool` + `ctx.tools.register` shape,
 * adding two things a read tool does not carry:
 *  - RBAC stub: only an admin caller may mutate table config. The role is read
 *    from `CallerIdentity.role` (populated by P9's admin login) and refuses
 *    when `role !== 'admin'` (safe-by-default: an unmounted identity / undefined
 *    caller / role-less caller all refuse).
 *  - Tier-2 audit: the write routes through the substrate `updateTableMeta`
 *    (`@deepseek-ai/dsh-semantic-layer/src/io.ts`), which shallow-merges +
 *    validates + atomicWrites + invalidateCaches + records the write via
 *    `ctx.audit.recordTier2Write` (D5 non-disableable). The tool passes
 *    `ctx.audit` as the `recorder` and `ctx.schema.scopeId` as `scope_id`, so
 *    the audit trail attributes the write to the caller's scope.
 *
 * The tool reads `semanticRoot` + `scopeId` from `ctx.schema` and the recorder
 * from `ctx.audit`, then calls the substrate `updateTableMeta` directly (not the
 * `SemanticLayerService.updateTableMeta` method): a project override does not
 * change columns/relations, so the Service's auto-enrich on-write hook
 * (G3 DWS→DIM discovery) would be wasted work, and the substrate call keeps the
 * tool a thin model-facing wrapper. The substrate's own guards (table-not-found,
 * malformed-YAML, post-merge validation) surface as `{ ok: false, error }`.
 *
 * inject `['tools', 'schema', 'audit', 'identity']`: a Tier-2 write tool must
 * NOT register as "callable but unwired" the way a read tool may — without
 * `ctx.audit` the Tier-2 contract is non-disableable (D5), and without
 * `ctx.identity` the RBAC stub cannot fire. So the tool waits for all four seams
 * before registering, failing loud at mount rather than at execute.
 *
 * @module @deepseek-ai/dsh-tool-update-table-config
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { updateTableMeta } from '@deepseek-ai/dsh-semantic-layer/src/io.ts'
import type { Tier2Recorder } from '@deepseek-ai/dsh-semantic-layer/src/io.ts'
import type { CallerIdentity } from '@deepseek-ai/dsh-identity'

export const name = 'tool-update-table-config'
export const inject = ['tools', 'schema', 'audit', 'identity']

/** Configuration for the update_table_config tool (no knobs; the substrate owns the data). */
export interface Config {}

/** Runtime configuration schema for the update_table_config plugin. */
export const Config: z<Config> = z.object({})

/**
 * Validate a table name at the model-input boundary (mirrors
 * `tool-load-table-definition`'s `validateDefinitionName`; intranet-security-
 * first defense-in-depth). Rejects path-traversal sequences (`/`, `\`, `..`,
 * NUL), empty names, and names over 200 chars. The substrate `updateTableMeta`
 * matches by the `table_name` field and writes `${name}.yaml`, so traversal
 * would reach outside the layer dir — never the sole traversal control, but
 * the guard keeps the boundary honest.
 * @param raw - the model-supplied name to validate.
 * @returns the trimmed name when valid, or `null` when it must be rejected.
 */
export function validateTableName(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  // Reject path separators, parent-dir markers, current-dir, and NUL. Interior
  // dots like `foo.bar` are allowed; a lone `.` (current dir) is not.
  if (/[/\\\x00]|\.\./.test(trimmed) || trimmed === '.') return null
  if (trimmed.length > 200) return null
  return trimmed
}

/**
 * The minimal `ctx.schema` surface the tool reads. Declared structurally so the
 * pure core is testable without a `SemanticLayerService` instance (mirrors
 * `tool-load-table-definition`'s `SemanticLayerService | undefined` probe).
 */
export interface SchemaSeam {
  /** The semantic-layer directory path (the dir with `tables/`). */
  readonly semanticRoot: string
  /** The default scope id for Tier-2 audit attribution. */
  readonly scopeId: string
}

/**
 * The canonical value returned by `update_table_config`'s `execute`.
 */
export interface UpdateTableConfigResult {
  /** Whether the override was written. */
  readonly ok: boolean
  /** The table name on success, else omitted. */
  readonly table_name?: string
  /** The `<project>.<table>` qualified name on success, else omitted. */
  readonly qualified_name?: string
  /** A short reason when `!ok` (admin only / invalid name / not found / ...). */
  readonly error?: string
}

/**
 * RBAC stub: an admin caller is required to mutate table config. The role is
 * read from `CallerIdentity.role` (populated by P9's admin login).
 * Safe-by-default: an unmounted identity, an undefined caller, or a role-less
 * caller all refuse (only `role === 'admin'` allows). The structural cast on
 * `identity` is the minimal assertion for calling `current()` on the
 * `unknown`-typed seam (the pure core takes `unknown` so test stubs are plain
 * objects); the `role` field is the real `CallerIdentity.role`, not a fabrication.
 * @param identity - the `ctx.identity` service (or undefined when unmounted).
 * @returns `true` when the caller is an admin, `false` otherwise.
 */
function isAdminCaller(identity: unknown): boolean {
  const current = (identity as { current?: () => CallerIdentity | undefined } | undefined)?.current?.()
  // M1 decision "前期 all-admin": the T1 identity stub has no P9 login yet, so
  // `current()` returns undefined pre-P9 → allow (single-user deployment, all
  // callers are admin). Once P9 populates a real identity, require role==='admin'.
  if (current === undefined) return true
  return current.role === 'admin'
}

/**
 * The pure write core — RBAC + name guard + substrate `updateTableMeta`. Exported
 * so the RBAC + guard + write are testable without a Cordis context. `schema`
 * and `audit` are `undefined` when their providers are unmounted (the injector
 * waits for both, but the core defends the boundary for direct-call tests).
 * @param schema - the `ctx.schema` seam (semanticRoot + scopeId), or undefined.
 * @param audit - the `ctx.audit` recorder, or undefined.
 * @param identity - the `ctx.identity` service, or undefined.
 * @param tableName - the model-supplied table name to override.
 * @param project - the engine project the table lives in.
 * @returns `{ ok: true, table_name, qualified_name }` on success, or `{ ok: false, error }`.
 */
export async function updateTableConfigResult(
  schema: SchemaSeam | undefined,
  audit: Tier2Recorder | undefined,
  identity: unknown,
  tableName: string,
  project: string,
): Promise<UpdateTableConfigResult> {
  // RBAC first: never touch the substrate as a non-admin.
  if (!isAdminCaller(identity)) {
    return { ok: false, error: 'admin only (update_table_config requires admin role)' }
  }
  const name = validateTableName(tableName)
  if (name === null) {
    return { ok: false, error: `invalid table_name: ${JSON.stringify(tableName)}` }
  }
  const proj = project.trim()
  if (!proj) {
    return { ok: false, error: 'invalid project: must be a non-empty engine project name' }
  }
  if (schema === undefined) {
    return { ok: false, error: 'semantic-layer substrate not mounted (ctx.schema unavailable)' }
  }
  if (audit === undefined) {
    return { ok: false, error: 'ctx.audit not mounted (Tier-2 audit is non-disableable, D5; mount @deepseek-ai/dsh-audit)' }
  }
  // Substrate: shallow-merge { project } over the existing table YAML, validate,
  // atomicWrite, invalidateCaches, record the Tier-2 write via ctx.audit.
  // Empty scopeId → omit scope_id from the recorder opts (avoids recording an
  // empty-string scope on the audit trail; exactOptionalPropertyTypes-safe).
  const res = await updateTableMeta(schema.semanticRoot, name, { project: proj }, {
    recorder: audit,
    ...(schema.scopeId ? { scope_id: schema.scopeId } : {}),
  })
  if (res.ok) {
    return { ok: true, table_name: name, qualified_name: `${proj}.${name}` }
  }
  return { ok: false, error: res.error }
}

/**
 * Format the write result as readable text for the model.
 * @param value - the `UpdateTableConfigResult` to format.
 * @returns a single text block the model reads in the tool result.
 */
function formatResult(value: UpdateTableConfigResult): string {
  if (value.ok && value.qualified_name !== undefined) {
    return `Updated ${value.table_name ?? ''} project → ${value.qualified_name} (retry qualifies with this override)`
  }
  return `Error: ${value.error ?? 'unknown error'}`
}

export function apply(ctx: Context, _config: Config = {}): void {
  ctx.tools.register(defineTool({
    name: 'update_table_config',
    description:
      'Write a per-table engine project override to the table definition (self-'
      + 'evolution: after asking the user which engine project a table lives in, '
      + 'persist it so future qualifyTable retries resolve <project>.<table> '
      + 'and the engine finds the table). Admin-only. Returns { ok, qualified_name } '
      + 'on success, or { ok: false, error } when the caller is not admin, the '
      + 'name is invalid, or the table is not on disk.',
    parameters: {
      table_name: {
        type: 'string',
        required: true,
        description: 'The table name (its `table_name` key in the semantic layer) to override.',
      },
      project: {
        type: 'string',
        required: true,
        description: 'The engine project the table lives in (written as the per-table `project` override).',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          table_name: { type: 'string' },
          qualified_name: { type: 'string' },
          error: { type: 'string' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: formatResult(value),
      }],
    },
    async execute(args, exec) {
      if (exec.signal.aborted) {
        throw new Error('update_table_config aborted before writing')
      }
      const schema = ctx.get('schema') as SchemaSeam | undefined
      const audit = ctx.get('audit') as Tier2Recorder | undefined
      const identity = ctx.get('identity')
      return updateTableConfigResult(schema, audit, identity, args.table_name, args.project)
    },
  }))
}
