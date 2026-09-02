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
import { FailureKind, type QueryOutcome } from './types.ts'

/**
 * E-DA5: extract the table refs a corpus check must resolve — the identifier
 * after every `FROM`/`JOIN` (case-insensitive), with `project.`-qualification
 * stripped to the bare name and alias tokens naturally skipped (only the
 * first identifier after the clause keyword is captured). Subquery `FROM (`
 * forms match no identifier and contribute no refs.
 */
function standInTableRefs(sql: string): string[] {
  const refs: string[] = []
  // replace() doubles as a typed matchAll: the capture parameter carries the
  // string type directly, and the original text is returned untouched.
  sql.replace(/\b(?:from|join)\s+([a-z_][\w.]*)/gi, (all: string, ident: string) => {
    // slice(lastIndexOf('.') + 1): a bare name yields slice(0) (whole), a
    // qualified name yields its last segment — no branching either way
    refs.push(ident.slice(ident.lastIndexOf('.') + 1))
    return all
  })
  return refs
}

/** The executor contract the engine consumes; both `StandInOdps` (eval) and P4b's `ctx.query` satisfy it. */
export interface OdpsExecutor {
  execute(sql: string, opts?: { signal?: AbortSignal }): Promise<QueryOutcome>
  attach(instanceId: string): Promise<QueryOutcome>
}

/**
 * Stand-in ODPS. Deterministic (no `Date.now()` — eval reproducible). The
 * scripted map is keyed by SQL substring; the first match wins, else a default
 * `done` outcome with a stub result set.
 *
 * E-DA5: with a scope corpus configured, unscripted SQL additionally gets a
 * corpus check — `FROM`/`JOIN` table refs (bare name after
 * `project.`-qualification stripping, aliases ignored) must all resolve in
 * the active scope's corpus, else the stand-in mirrors real MaxCompute's
 * `ODPS-0130131 Table not found` failure so the eval catches the B-DA5 class
 * of regression (live K11 DAU failed while a permissive stand-in
 * false-passed). Precedence: scripted outcome wins over the corpus check;
 * no/empty corpus keeps the permissive done-for-all backward-compat.
 */
export class StandInOdps implements OdpsExecutor {
  private readonly scripted: Record<string, QueryOutcome>
  private readonly corpus: Set<string> | undefined
  /** Number of times `execute` has been called (eval instrumentation). */
  public execCount = 0

  constructor(scripted: Record<string, QueryOutcome> = {}, corpus?: Set<string>) {
    this.scripted = scripted
    this.corpus = corpus
  }

  execute(sql: string, _opts: { signal?: AbortSignal } = {}): Promise<QueryOutcome> {
    this.execCount += 1
    for (const [sub, out] of Object.entries(this.scripted)) {
      if (sql.includes(sub)) return Promise.resolve(out)
    }
    if (this.corpus !== undefined && this.corpus.size > 0) {
      for (const table of standInTableRefs(sql)) {
        if (!this.corpus.has(table)) {
          return Promise.resolve({
            state: 'failed',
            failureKind: FailureKind.TABLE_NOT_FOUND,
            error: `ODPS-0130131:Table not found - table '${table}' cannot be resolved in the active scope corpus (stand-in)`,
          })
        }
      }
    }
    // default done + stub result set (deterministic rid from execCount)
    return Promise.resolve({ state: 'done', result_id: `rid-${this.execCount}`, rows: [{ cnt: 42 }] })
  }

  attach(_instanceId: string): Promise<QueryOutcome> {
    // fix #3: stand-in transitions a running query to done on attach (production ctx.query.attach polls the real instance)
    return Promise.resolve({ state: 'done', result_id: 'rid-attach', rows: [{ cnt: 42 }] })
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
