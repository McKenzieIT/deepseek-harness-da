/**
 * Model-facing `query_data` tool - the EXECUTION-phase entry to real SQL
 * execution. The agent calls it with SQL + a per-game scope to run that SQL
 * against MaxCompute (via `ctx.query`) and get back rows. This is the agent
 * running its OWN SQL — not the eval harness re-running a canned SQL — so it
 * closes G1b's execution-match hard gate on the agent side.
 *
 * P4c(c): the SECOND model-facing tool registration in the data-agent effort
 * (after `search_data_sources`, P13b). It mirrors
 * [`@deepseek-ai/dsh-tool-search-data-sources`](../../data/tool-search-data-sources):
 * `defineTool` + `ctx.tools.register`, an `inject: ['tools']` plugin that
 * probes `ctx.get('query')` (NOT `inject: ['query']`) so the tool loads
 * without a query provider mounted — an unregistered whitelisted tool is
 * simply uncallable, not a broken mount (the phase-gate guard's EXECUTION
 * whitelist already names `query_data`).
 *
 * The 3-state `QueryOutcome` (P4 decision B) is the whole EXECUTION shape:
 * completed -> rows; pending -> poll `getProgress` to settlement (or the poll
 * budget, then an honest pending); failed -> surface. The guard chain
 * (CostGuard `estimate_cost` / TimeoutGuard signal / RetryGuard /
 * OrphanReaper) is deferred to the A1-split engine-wrapper hardening (P4c(b));
 * this tool is the dumb model-facing consumer over `ctx.query.execute`.
 *
 * The core EXECUTION flow (`executeQuery` / `projectOutcome` /
 * `pollToSettlement`) is exported pure so the 3-state handling is testable
 * against a stub `QueryEngine`, and the P4c(c) smoke calls it against the real
 * MaxCompute provider (maxc-backed sidecar -> real ODPS rows), proving the
 * tool path - not a direct sidecar call.
 *
 * @module @deepseek-ai/dsh-query-tool
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool, type JsonValue } from '@deepseek-ai/dsh-tools'
import type { InstanceId, QueryEngine, QueryOutcome, QueryState } from '@deepseek-ai/dsh-query/src/index.ts'

export const name = 'query-tool'
export const inject = ['tools']

/** Configuration for the query_data tool. */
export interface Config {
  /**
   * Max poll iterations for a pending query before returning the pending
   * state (the async-promote budget; maxc `--wait` derives pending vs
   * completed from real ODPS execution).
   */
  readonly maxPolls?: number
  /** Delay between progress polls in ms. */
  readonly pollIntervalMs?: number
  /**
   * Max rows rendered into model context (display cap). The engine row-cap
   * (maxc `--max-rows`) is deferred to the engine-wrapper CostGuard.
   */
  readonly maxDisplayRows?: number
}

/** Resolved config shape: schemastery has applied every default. */
export interface ResolvedConfig {
  readonly maxPolls: number
  readonly pollIntervalMs: number
  readonly maxDisplayRows: number
}

/** Runtime configuration schema for the query_data plugin. */
export const Config: z<Config> = z.object({
  maxPolls: z.number().default(60),
  pollIntervalMs: z.number().default(2000),
  maxDisplayRows: z.number().default(50),
})

/** Model-facing query result: the 3-state QueryOutcome projected for the agent. */
export interface QueryDataResult {
  readonly state: QueryState
  readonly sql: string
  /** completed: */
  readonly columns?: string[]
  readonly rows?: JsonValue[][]
  readonly rowCount?: number
  readonly truncated?: boolean
  /** Deterministic cache key injected by result-cache-memory post-execute hook. */
  readonly result_id?: string
  /** pending: */
  readonly instanceId?: InstanceId
  readonly stage?: string
  readonly elapsedMs?: number
  /** failed: */
  readonly error?: string
  readonly failureKind?: string
}

/** Model-facing tool arguments: SQL + the per-game scope (the trust boundary). */
export interface QueryDataArgs {
  readonly sql: string
  readonly scope_id: string
}

/** Minimal execution context the pure EXECUTION flow needs (cancel signal). */
export interface ExecLike {
  readonly signal: AbortSignal
}

/**
 * Apply config defaults (idempotent with the schemastery schema for name-mount).
 *
 * @param config The caller-supplied config; omitted/undefined fields receive defaults.
 * @returns The resolved config with maxPolls, pollIntervalMs, and maxDisplayRows filled in.
 */
export function resolveConfig(config: Config = {}): ResolvedConfig {
  return {
    maxPolls: config.maxPolls ?? 60,
    pollIntervalMs: config.pollIntervalMs ?? 2000,
    maxDisplayRows: config.maxDisplayRows ?? 50,
  }
}

/** Sleep without blocking when the interval is zero (test-friendly). */
function sleep(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolve) => { setTimeout(resolve, ms) })
}

/**
 * Project a settled QueryOutcome to the model-facing QueryDataResult (drops
 * executionMeta; keeps the 3-state fields the agent acts on). Exported so the
 * projection is testable without a Cordis context.
 *
 * @param outcome The 3-state query outcome from `ctx.query`.
 * @returns The model-facing result: completed rows / pending id / failed error.
 */
export function projectOutcome(outcome: QueryOutcome): QueryDataResult {
  const base: { readonly state: QueryState; readonly sql: string } = { state: outcome.state, sql: outcome.sql }
  switch (outcome.state) {
    case 'completed':
      return {
        ...base,
        ...(outcome.columns !== undefined ? { columns: outcome.columns } : {}),
        // cast safe: provider JSON-decodes sidecar cells (rows: unknown[][] -> JsonValue[][])
        ...(outcome.rows !== undefined ? { rows: outcome.rows as JsonValue[][] } : {}),
        ...(outcome.rowCount !== undefined ? { rowCount: outcome.rowCount } : {}),
        ...(outcome.truncated !== undefined ? { truncated: outcome.truncated } : {}),
      }
    case 'pending':
      return {
        ...base,
        ...(outcome.instanceId !== undefined ? { instanceId: outcome.instanceId } : {}),
        ...(outcome.stage !== undefined ? { stage: outcome.stage } : {}),
        ...(outcome.elapsedMs !== undefined ? { elapsedMs: outcome.elapsedMs } : {}),
      }
    case 'failed':
      return {
        ...base,
        ...(outcome.error !== undefined ? { error: outcome.error } : {}),
        ...(outcome.failureKind !== undefined ? { failureKind: outcome.failureKind } : {}),
      }
    default:
      // Defense-in-depth: decodeResult normalizes unknown sidecar states to
      // 'failed', so this is unreachable in production; a stray caller that
      // bypasses the boundary still gets a failed result, not undefined.
      return { ...base, error: `unknown outcome state ${JSON.stringify(outcome.state)}`, failureKind: 'transport' }
  }
}

/**
 * Poll a pending query instance to settlement (or the poll budget). Each
 * iteration calls `getProgress`; a non-pending state returns immediately. If
 * the budget is exhausted while still pending, the last pending progress is
 * returned honestly — never silently relabeled completed. Exported so the
 * 3-state EXECUTION flow is testable without a Cordis context.
 *
 * @param query The query engine whose pending instance to poll.
 * @param instanceId The opaque id of the pending query instance.
 * @param exec Execution context carrying outbound cancel.
 * @param cfg Resolved tool config (poll budget + interval).
 * @returns A 3-state outcome: settled (completed/failed) or the last pending.
 */
export async function pollToSettlement(
  query: QueryEngine,
  instanceId: InstanceId,
  exec: ExecLike,
  cfg: ResolvedConfig,
): Promise<QueryOutcome> {
  let last: QueryOutcome | undefined
  for (let i = 0; i < cfg.maxPolls; i += 1) {
    if (exec.signal.aborted) throw new Error('query_data: polling aborted')
    await sleep(cfg.pollIntervalMs)
    last = await query.getProgress(instanceId)
    if (last.state !== 'pending') return last
  }
  // Budget exhausted — return an honest pending outcome that preserves the
  // ORIGINAL instance id (a fallback poll may omit it), plus the last poll's
  // stage/elapsedMs when the provider supplied them. No silent truncation to
  // completed: the agent sees the instance is still running.
  return {
    state: 'pending',
    instanceId,
    ...(last !== undefined && last.stage !== undefined ? { stage: last.stage } : {}),
    ...(last !== undefined && last.elapsedMs !== undefined ? { elapsedMs: last.elapsedMs } : {}),
    sql: last?.sql ?? '',
  }
}

/**
 * Execute one query through the `ctx.query` seam and resolve the 3-state
 * outcome to a model-facing result. completed -> rows; pending -> poll to
 * settlement (or the budget, then honest pending); failed -> surface. Exported
 * so the full EXECUTION flow is testable against a stub or real QueryEngine.
 *
 * @param query The query engine to execute against (the MaxCompute provider).
 * @param args Model-facing arguments: SQL + scope_id.
 * @param exec Execution context carrying outbound cancel.
 * @param cfg Resolved tool config.
 * @returns The model-facing 3-state result.
 */
export async function executeQuery(
  query: QueryEngine,
  args: QueryDataArgs,
  exec: ExecLike,
  cfg: ResolvedConfig,
): Promise<QueryDataResult> {
  if (exec.signal.aborted) throw new Error('query_data: aborted before execute')
  let outcome = await query.execute({ sql: args.sql, scopeId: args.scope_id }, exec.signal)
  if (outcome.state === 'pending' && outcome.instanceId !== undefined) {
    const instanceId = outcome.instanceId
    try {
      outcome = await pollToSettlement(query, instanceId, exec, cfg)
    } catch (error) {
      // Abort or poll failure: best-effort cancel the pending ODPS instance so it
      // does not keep running/billing as an orphan. OrphanReaper (deferred) is
      // the backstop for instances that escape this path (e.g. cancel itself
      // failed). A failed cancel must not mask the original error.
      try {
        await query.cancel(instanceId)
      } catch {
        // best-effort: surface the original error, not the cancel failure
      }
      throw error
    }
  }
  return projectOutcome(outcome)
}

function formatCell(value: unknown): string {
  if (value === null) return 'NULL'
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

/** Render a completed result as a TSV table, display-capped to maxDisplayRows. */
function renderCompleted(value: QueryDataResult, cfg: ResolvedConfig): string {
  const columns = value.columns ?? []
  const rows = value.rows ?? []
  const shown = rows.slice(0, cfg.maxDisplayRows)
  const lines: string[] = []
  if (value.result_id !== undefined) lines.push(`result_id: ${value.result_id}`)
  if (columns.length > 0) lines.push(columns.join('\t'))
  for (const row of shown) lines.push(row.map(formatCell).join('\t'))
  const total = value.rowCount ?? rows.length
  const elided = rows.length - shown.length
  if (elided > 0 || value.truncated === true) {
    const parts: string[] = []
    if (elided > 0) parts.push(`${elided} more rows elided`)
    if (value.truncated === true) parts.push('result truncated by the engine')
    lines.push(`(... ${parts.join('; ')})`)
  }
  lines.push(`(${total} row${total === 1 ? '' : 's'})`)
  return lines.join('\n')
}

/** Render a query_data result as model-facing text. */
function formatResult(value: QueryDataResult, cfg: ResolvedConfig): string {
  switch (value.state) {
    case 'completed':
      return renderCompleted(value, cfg)
    case 'pending': {
      const parts: string[] = ['Query still running']
      if (value.instanceId !== undefined) parts.push(`instance ${value.instanceId}`)
      if (value.stage !== undefined) parts.push(`stage ${value.stage}`)
      if (value.elapsedMs !== undefined) parts.push(`${value.elapsedMs}ms elapsed`)
      return `${parts.join('; ')}. Poll budget exhausted; the instance is still pending.`
    }
    case 'failed': {
      const kind = value.failureKind ?? 'unknown'
      const error = value.error ?? '(no error detail)'
      return `Query failed (${kind}): ${error}`
    }
    default:
      return `Query failed (unknown): unrecognized outcome state ${JSON.stringify(value.state)}`
  }
}

export function apply(ctx: Context, config: Config = {}): void {
  const cfg = resolveConfig(config)
  ctx.tools.register(defineTool({
    name: 'query_data',
    description:
      'Execute a MaxCompute SQL statement against a per-game scope and return '
      + 'the result rows. Call this in the EXECUTION phase to run SQL the agent '
      + 'has written (after search_data_sources / load_* in UNDERSTANDING and '
      + 'SQL generation). Returns a 3-state outcome: completed rows, pending '
      + '(polled to settlement, then the instance id if the poll budget is '
      + 'exhausted), or failed with an error. Production hardening (cost guard, '
      + 'row cap, retry, orphan reaping) is deferred to the engine-wrapper.',
    parameters: {
      sql: {
        type: 'string',
        required: true,
        description: 'The MaxCompute SQL statement to execute.',
      },
      scope_id: {
        type: 'string',
        required: true,
        description: 'The per-game access-isolation scope to execute against (the trust boundary).',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          state: { type: 'string', required: true, enum: ['completed', 'pending', 'failed'] },
          sql: { type: 'string', required: true },
          columns: { type: 'array', items: { type: 'string' } },
          rows: { type: 'array', items: { type: 'array', items: { type: 'json' } } },
          rowCount: { type: 'number' },
          truncated: { type: 'boolean' },
          result_id: { type: 'string' },
          instanceId: { type: 'string' },
          stage: { type: 'string' },
          elapsedMs: { type: 'number' },
          error: { type: 'string' },
          failureKind: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatResult(value as QueryDataResult, cfg) }],
    },
    async execute(args, exec) {
      const query = ctx.get('query')
      if (query === undefined) {
        throw new Error(
          'query_data: no query engine registered; mount a provider such as '
          + '@deepseek-ai/dsh-query-maxcompute so ctx.query is available',
        )
      }
      return executeQuery(query, args, exec, cfg)
    },
  }))
}
