/**
 * The one `ctx.query` → `QueryExecutor` adapter. Both hosts (`eval-cli` and
 * `eval-runner-service`) previously carried their own copy, and the copies had
 * already diverged: one accepted `state === 'done'` as success and the other did
 * not, and one zipped columns onto rows while the other passed rows through raw.
 * Those are grading-relevant differences that no ticket ever chose.
 *
 * The port yields the provider's outcome rather than a verdict, so this adapter
 * has exactly one job beyond forwarding: reconcile state vocabularies. It never
 * decides whether a result matches, and never flattens rows — evaluation's
 * `normalizeOutcome` owns that, under a recorded policy.
 *
 * @module @deepseek-ai/dsh-eval-runner/ctx_query_executor
 */

import type { Context } from '@deepseek-ai/cordis'
import type { QueryOutcomeView } from '@deepseek-ai/dsh-eval'
import type { QueryExecutor } from './types.ts'

/**
 * Provider states that mean the query finished and its rows are the answer.
 * Declared explicitly because the two forked adapters disagreed here: the
 * `dsh-query` `QueryOutcome` union is `completed`/`pending`/`failed`, but a
 * provider path returning the engine vocabulary's `done` was treated as success
 * by one host and silently as a failure by the other. Dropping `done` from this
 * list would turn those results into `environment-blocked` with no error to
 * explain it.
 */
const COMPLETED_STATES: readonly string[] = ['completed', 'done']

/** Provider states that mean the query is still running. */
const PENDING_STATES: readonly string[] = ['pending', 'running']

/** The `ctx.query` surface this adapter calls; the capability owns submission, routing, and credentials. */
interface QueryCapability {
  execute(request: { sql: string; scopeId: string; mode: string }, signal?: AbortSignal): Promise<unknown>
  attach?(instanceId: string): Promise<unknown>
}

/**
 * Bridges the evaluation executor port to a mounted `ctx.query` capability.
 * Errors thrown by the provider are left to propagate: the runner's infra-retry
 * only sees thrown errors, and catching them into a `failed` outcome here is
 * what made that retry path unreachable.
 */
export class CtxQueryExecutor implements QueryExecutor {
  constructor(private readonly ctx: Context, private readonly scopeId: string) {}

  /**
   * Execute one SQL statement through `ctx.query`.
   * @param sql - the SQL to run.
   * @param signal - abort signal for the caller's timeout.
   * @returns the provider's outcome, with its state mapped to the evaluation vocabulary.
   */
  async execute(sql: string, signal?: AbortSignal): Promise<QueryOutcomeView> {
    const query = this.capability()
    if (query === undefined) return { state: 'failed', error: 'no query provider mounted', failureKind: 'permission_denied' }
    return toOutcomeView(await query.execute({ sql, scopeId: this.scopeId, mode: 'fast' }, signal), sql)
  }

  /**
   * Resolve a query left running.
   * @param instanceId - the instance id from a `pending` outcome.
   * @returns the provider's outcome, with its state mapped to the evaluation vocabulary.
   */
  async attach(instanceId: string): Promise<QueryOutcomeView> {
    const query = this.capability()
    if (query?.attach === undefined) return { state: 'failed', error: 'query provider cannot attach', failureKind: 'permission_denied' }
    return toOutcomeView(await query.attach(instanceId), '')
  }

  /** The mounted query capability, or `undefined` when none is. */
  private capability(): QueryCapability | undefined {
    return this.ctx.get('query') as QueryCapability | undefined
  }
}

/**
 * Map one provider outcome onto the evaluation `QueryOutcomeView`, reconciling
 * the state vocabularies and nothing else.
 * @param raw - the provider's outcome object.
 * @param sql - the SQL submitted, used when the provider does not echo it back.
 * @returns the outcome view.
 */
function toOutcomeView(raw: unknown, sql: string): QueryOutcomeView & { sql: string } {
  const out = raw as Record<string, unknown>
  const state = String(out.state)
  const common = {
    sql: typeof out.sql === 'string' ? out.sql : sql,
    ...(typeof out.instanceId === 'string' ? { instanceId: out.instanceId } : {}),
    ...(typeof out.failureKind === 'string' ? { failureKind: out.failureKind } : {}),
  }

  if (COMPLETED_STATES.includes(state)) {
    return {
      ...common,
      state: 'completed',
      ...(Array.isArray(out.columns) ? { columns: out.columns as string[] } : {}),
      ...(Array.isArray(out.rows) ? { rows: out.rows as unknown[][] } : {}),
      ...(typeof out.rowCount === 'number' ? { rowCount: out.rowCount } : {}),
    }
  }
  if (PENDING_STATES.includes(state)) {
    return { ...common, state: 'pending' }
  }
  return {
    ...common,
    state: 'failed',
    error: typeof out.error === 'string' ? out.error : `query returned unrecognized state ${JSON.stringify(out.state)}`,
  }
}
