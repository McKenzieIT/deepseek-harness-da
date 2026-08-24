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
   *
   * @param request The NL->SQL query request to execute against the provider engine.
   * @param signal Optional abort signal carrying outbound cancel; threaded to the SDK request to emit `notifications/cancelled` and reject.
   * @returns A 3-state query outcome (success / pending / failure) resolved when the query finishes or yields control.
   */
  abstract execute(request: QueryRequest, signal?: AbortSignal): Promise<QueryOutcome>

  /**
   * Resume a pending instance — NOT through the guard chain (P4 decision B).
   *
   * @param instanceId The opaque id of the pending query instance to resume.
   * @returns A 3-state query outcome for the resumed instance.
   */
  abstract attach(instanceId: InstanceId): Promise<QueryOutcome>

  /**
   * Cancel a pending instance — the explicit user cancel tool (A1-split).
   *
   * @param instanceId The opaque id of the pending query instance to cancel.
   */
  abstract cancel(instanceId: InstanceId): Promise<void>

  /**
   * Poll progress of a pending instance (P4 polling; no push notifications — G4 HOLE-D).
   *
   * @param instanceId The opaque id of the pending query instance to poll.
   * @returns A 3-state query outcome reflecting the pending instance's current progress.
   */
  abstract getProgress(instanceId: InstanceId): Promise<QueryOutcome>

  /**
   * Qualify a bare table name with its project prefix (C: engine-agnostic).
   *
   * Moved off `SemanticLayerService.qualifyTableName` (which misread
   * `config.yaml project.name` — a game scope id, NOT an ODPS project) to the
   * query provider, whose `Config.defaultProject` (cordis.patch.yml fills
   * `ieu_cdm`) is the single source of truth for the engine's project. A
   * per-table `override` (Task 3: `SearchHit.project` / `update_table_config`)
   * takes precedence over the configured default. When both are absent (empty
   * default + no override), the bare table name is returned unchanged —
   * graceful degradation so a misconfigured engine still surfaces the bare
   * name rather than `undefined.table`.
   *
   * Optional: a provider that does not need project qualification (e.g. a
   * single-project engine) may omit this; callers probe with `?.`.
   *
   * @param tableName The bare table name to qualify.
   * @param override Optional per-table project override (wins over defaultProject).
   * @returns The qualified `<project>.<tableName>`, or the bare `tableName`
   * when no project resolves.
   */
  qualifyTable?(tableName: string, override?: string): string
}

export default QueryEngine
