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
import type { EngineConventions } from './conventions.ts'

export type { InstanceId, QueryOutcome, QueryRequest, QuerySpec, QueryState, ScopeId } from './types.ts'
export type { EngineConventions, ConventionFunction, ConventionCast, ConventionTemplate } from './conventions.ts'

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
   * `config.yaml project.name` — a game scope id, NOT an engine project) to the
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

  /**
   * The per-engine convention set for the nl2sql prompt dialect grounding
   * (key_differences / functions / cast_map / sql_templates) + the future
   * query-guard/cost/dialect consumer. D1 (GA-GT2-impl): the *types* live in
   * the abstract package (`./conventions.ts`); a concrete provider subclass
   * overrides this to return its locally-loaded convention set (the
   * YAML-loading runtime stays the provider's concern). Default throws so a
   * provider that does not ground a dialect surfaces the gap loudly rather
   * than silently injecting an empty conventions block.
   *
   * D2 (GA-GT1 Phase 6): the optional `scopeId` is a per-request-scope seam —
   * callers thread the active scope so a future per-scope engine mapping can
   * return a different convention set per tenant/scope without the consumer
   * (`Nl2sqlEngineService`) caching at construction. Concrete providers
   * TODAY ignore `scopeId` (return their single loaded dialect); the param is
   * a dormant forward-looking seam (additive, undefined → current behavior).
   * A provider that wants per-scope conventions overrides
   * `getConventions(scopeId)` and reads scope metadata; until then the
   * `scopeId` is threaded end-to-end but unused at the terminal.
   *
   * @param scopeId Optional per-request-scope key (dormant seam; ignored by
   * current concrete providers — undefined yields the provider's single
   * loaded convention set).
   * @returns The resolved per-engine convention set for this concrete provider.
   */
  getConventions(scopeId?: string): EngineConventions {
    void scopeId
    throw new Error('QueryEngine.getConventions: not implemented; override in a concrete provider subclass')
  }
}

export default QueryEngine
