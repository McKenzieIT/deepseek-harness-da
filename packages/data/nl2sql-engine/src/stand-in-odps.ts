/**
 * P13b NL→SQL engine — stand-in ODPS (eval-only). Mirrors P4b's stand-in sidecar
 * (real pyodps deferred → real ODPS unreachable at prototype/eval stage; P13
 * grilling Q4). Scripted: the runner maps SQL substrings → preset 3-state
 * `QueryOutcome` (done/running/failed+failureKind). Error forms align
 * v2-baseline §3 阶段D: parse_failed (recoverable) / table_not_found /
 * field_not_found / semantic_mismatch / permission_denied (unrecoverable →
 * honest decline) / cost_exceeded (recoverable).
 *
 * code-review-low fix #3: adds `attach` (check_query continuation) so the
 * engine can poll a `running` outcome (the P13 prototype returned pending
 * without polling). Production uses `ctx.query.attach` (P4b).
 *
 * @module @deepseek-ai/dsh-nl2sql-engine/src/stand-in-odps
 */
import type { QueryOutcome, FailureKind } from './types.ts'

/** The executor contract the engine consumes; both `StandInOdps` (eval) and P4b's `ctx.query` satisfy it. */
export interface OdpsExecutor {
  execute(sql: string, opts?: { signal?: AbortSignal }): Promise<QueryOutcome>
  attach(instanceId: string): Promise<QueryOutcome>
}

/**
 * Stand-in ODPS. Deterministic (no `Date.now()` — eval reproducible). The
 * scripted map is keyed by SQL substring; the first match wins, else a default
 * `done` outcome with a stub result set.
 */
export class StandInOdps implements OdpsExecutor {
  private readonly scripted: Record<string, QueryOutcome>
  public execCount = 0

  constructor(scripted: Record<string, QueryOutcome> = {}) {
    this.scripted = scripted
  }

  async execute(sql: string, _opts: { signal?: AbortSignal } = {}): Promise<QueryOutcome> {
    this.execCount += 1
    for (const [sub, out] of Object.entries(this.scripted)) {
      if (sql.includes(sub)) return out
    }
    // default done + stub result set (deterministic rid from execCount)
    return { state: 'done', result_id: `rid-${this.execCount}`, rows: [{ cnt: 42 }] }
  }

  async attach(_instanceId: string): Promise<QueryOutcome> {
    // fix #3: stand-in transitions a running query to done on attach (production ctx.query.attach polls the real instance)
    return { state: 'done', result_id: 'rid-attach', rows: [{ cnt: 42 }] }
  }
}

/** Deterministic outcome helpers (no Date.now — prototype reproducible). */
export const outcome = {
  done(rows: unknown[] = [{ cnt: 42 }], rid?: string): QueryOutcome {
    return { state: 'done', result_id: rid ?? 'rid-stub', rows }
  },
  running(instanceId = 'inst-stub', stage = 'Map 62% / Reduce 0%'): QueryOutcome {
    return { state: 'running', instance_id: instanceId, stage }
  },
  failed(failureKind: FailureKind, error: string): QueryOutcome {
    return { state: 'failed', failureKind, error }
  },
}
