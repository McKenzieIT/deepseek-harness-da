/**
 * Service Definition for the query-engine capability seam (`ctx.query`).
 *
 * NL->SQL execution over swappable engines (MaxCompute first). This seam is
 * the A1-split dumb-raw-executor boundary: providers program their sidecar's
 * tools by raw name and register NONE on `ctx.tools`, so control tools
 * (`set_credentials` / `invalidate_scope`) stay non-model-callable and the
 * control-channel gap closes. The engine-wrapper guard chain
 * (cost / timeout / retry / orphan) lives above the provider in
 * `ctx.query.execute` and is deferred to its own hardening (A1-split门); this
 * Definition is the minimal abstract seam plus the 3-state vocabulary P4
 * decision B already fixed.
 *
 * @module @deepseek-ai/dsh-query
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { InstanceId, QueryOutcome, QueryRequest } from './types.ts'

export type { InstanceId, QueryOutcome, QueryRequest, QuerySpec, QueryState, ScopeId } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    query: QueryEngine
  }
}

/**
 * Abstract query engine. Providers implement the four seam operations —
 * P4 decision B: `execute` / `attach` / `cancel` / `getProgress`.
 * `estimate_cost` is CostGuard-internal and deliberately NOT on this seam;
 * a provider exposes it as its own internal method the future engine-wrapper
 * calls, never as a model-facing operation.
 */
export abstract class QueryEngine extends Service {
  constructor(ctx: Context) {
    super(ctx, 'query')
  }

  /**
   * Execute one query; resolves with a 3-state outcome. The optional
   * `signal` carries outbound cancel: the engine-wrapper's TimeoutGuard
   * (deferred) threads it to the SDK `request()`, which sends
   * `notifications/cancelled` and rejects (G4 HOLE-D).
   */
  abstract execute(request: QueryRequest, signal?: AbortSignal): Promise<QueryOutcome>

  /** Resume a pending instance — NOT through the guard chain (P4 decision B). */
  abstract attach(instanceId: InstanceId): Promise<QueryOutcome>

  /** Cancel a pending instance — the explicit user cancel tool (A1-split). */
  abstract cancel(instanceId: InstanceId): Promise<void>

  /** Poll progress of a pending instance (P4 polling; no push notifications — G4 HOLE-D). */
  abstract getProgress(instanceId: InstanceId): Promise<QueryOutcome>
}

export default QueryEngine
