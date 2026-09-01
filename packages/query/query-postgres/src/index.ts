/**
 * Service Provider: Postgres query engine (`ctx.query`) — GA-GT2-D4 second-
 * engine stub. Proves the abstract `QueryEngine` seam (`@deepseek-ai/dsh-query`)
 * is engine-neutral: a second concrete provider that overrides
 * `getConventions()` to load a Postgres dialect, while the four seam
 * operations (`execute`/`attach`/`cancel`/`getProgress`) throw
 * not-implemented (this is a seam proof, NOT a real PG executor).
 *
 * The hardening (real `pg` driver, CostGuard/TimeoutGuard/RetryGuard guard
 * chain, real connection pooling, per-scope data-source resolution) is
 * deferred to a later task. This stub exists so the consolidated build
 * verifies the abstraction carries a second engine's conventions without
 * coupling to MaxCompute — GT2-D4 validates engine-neutrality by construction.
 *
 * @module @deepseek-ai/dsh-query-postgres
 */

import { QueryEngine } from '@deepseek-ai/dsh-query'
import type { InstanceId, QueryOutcome, QueryRequest, EngineConventions } from '@deepseek-ai/dsh-query'
import { loadConventions } from './conventions.ts'

/**
 * Postgres query engine — a stub proving the engine-neutral seam. Subclasses
 * the abstract {@link QueryEngine}; `getConventions()` returns a cached
 * Postgres dialect loaded from `conventions.yaml`; the four seam operations
 * (`execute`/`attach`/`cancel`/`getProgress`) throw not-implemented. Mirrors
 * how `MaxComputeQueryEngine` wires `getConventions()` (the provider owns the
 * YAML-loading runtime; the convention *types* live in the abstract package).
 *
 * `qualifyTable` is intentionally omitted (optional on the abstract base);
 * a single-database Postgres engine does not need project qualification, and
 * callers probe with `?.` per the abstract seam contract.
 */
export class PostgresQueryEngine extends QueryEngine {
  /**
   * The per-engine Postgres convention set for the nl2sql prompt dialect
   * grounding. The Postgres provider owns the YAML-loading runtime
   * (`loadConventions` in `./conventions.ts`, cached); the *types* live in
   * the abstract `@deepseek-ai/dsh-query` package. The injected query engine
   * (`ctx.query`) exposes this so consumers (the nl2sql-engine) obtain
   * conventions through the abstract seam rather than importing the Postgres
   * loader directly.
   *
   * @returns The cached Postgres convention set loaded from `conventions.yaml`.
   */
  override getConventions(): EngineConventions {
    return loadConventions('postgres')
  }

  override execute(_request: QueryRequest, _signal?: AbortSignal): Promise<QueryOutcome> {
    return Promise.reject(new Error('PostgresQueryEngine.execute: not implemented (stub; GA-GT2-D4)'))
  }

  override attach(_instanceId: InstanceId): Promise<QueryOutcome> {
    return Promise.reject(new Error('PostgresQueryEngine.attach: not implemented (stub; GA-GT2-D4)'))
  }

  override cancel(_instanceId: InstanceId): Promise<void> {
    return Promise.reject(new Error('PostgresQueryEngine.cancel: not implemented (stub; GA-GT2-D4)'))
  }

  override getProgress(_instanceId: InstanceId): Promise<QueryOutcome> {
    return Promise.reject(new Error('PostgresQueryEngine.getProgress: not implemented (stub; GA-GT2-D4)'))
  }
}

export default PostgresQueryEngine
