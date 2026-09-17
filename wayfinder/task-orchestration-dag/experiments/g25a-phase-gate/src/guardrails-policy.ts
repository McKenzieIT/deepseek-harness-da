/**
 * `guardrails-policy` — the G25a policy-only arm's critic-context observer and
 * query-admission policy, and the diagnostic-floor arm's observer alone.
 *
 * This is the counterfactual to `@deepseek-ai/dsh-phase-gate`. It keeps only the
 * deterministic checks that must hold before a query runs and drops everything
 * that makes those checks a state machine. Concretely it has no phase enum, no
 * phase index, no per-phase prompt substitution, no automatic advance, no
 * fallback, no phase-scoped tool whitelist, no reasoning-effort override, no
 * stall watchdog, and — load-bearing — it never calls `agent.inject`. A query
 * error goes straight back to the model, which decides on its own whether to
 * retry, re-query, clarify, or decline.
 *
 * Two responsibilities:
 *
 * 1. **Critic context.** The `critique_sql_tool` and `evaluate_sql_quality`
 *    tools read `ctx.get('criticCtx')` and fail closed without it: with empty
 *    candidate sets the critic flags every referenced table
 *    `table_not_in_candidates`, confidence lands at or below 0.5, and admission
 *    rule 2 can never pass. So this plugin publishes a `criticCtx` service with
 *    the same `forAgent(agentId)` shape phase-gate's `CriticCtxService` exposes,
 *    populated by mirroring phase-gate's `captureToolData` harvest. The harvest
 *    helpers below are transcribed from `packages/data/phase-gate/src/phase-gate.ts`
 *    (`normalizeSql` `:1102`, `collectTableNames` `:1115`, `isCandidatesEmpty`
 *    `:1158`, `collectFields` `:1165`) because they are module-private there.
 *    `tests/harvest-parity.spec.ts` pins them against the phase-gate source, so
 *    a drift that would silently change the critic verdict — and with it the arm
 *    comparison — fails the build instead.
 *
 * 2. **Admission.** When `enforce_admission` is true, a monotonic
 *    `ctx.tools.guard` denies `query_data` unless all four rules hold. The guard
 *    seam is deliberate: it runs after the reorderable `tools/pre-execute`
 *    waterfall and cannot be un-denied, and its reason string reaches the model
 *    verbatim as `Error: <reason>`, which is the only feedback this plugin ever
 *    gives.
 *
 * Budget enforcement is NOT conditional on `enforce_admission`. The unified run
 * control applies identically to all three arms, floor included, so the
 * `query_data` cap lives here while the runner owns model-call and wall-clock
 * budget.
 *
 * @module g25a/guardrails-policy
 */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent'
import type { ToolExecution, PostToolDecision, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { extractSqlCandidate, type CriticCtx } from '@deepseek-ai/dsh-nl2sql-engine'

/** Cordis plugin name. */
export const name = 'guardrails-policy'

/** Registries this plugin subscribes to. */
export const inject = ['tools']

/** Admission floors, read from phase-gate's `PipelineConfig` so the arms cannot drift. */
export interface Config {
  /** `true` = policy-only arm (enforce the four rules); `false` = diagnostic floor (observe only). */
  enforce_admission: boolean
  /** `critique_sql_tool` confidence floor. */
  critique_confidence_floor: number
  /** `evaluate_sql_quality` score floor. */
  quality_score_floor: number
  /** Unified `query_data` budget; applies to every arm including the floor. */
  max_query_data_calls: number
}

export const Config: z<Config> = z.object({
  enforce_admission: z.boolean().default(true),
  critique_confidence_floor: z.number().default(0.6),
  quality_score_floor: z.number().default(60),
  max_query_data_calls: z.number().default(8),
})

// ── observable per-Attempt state ──────────────────────────────────────────────

/**
 * Per-agent observation. Every field is either critic input or evidence the
 * session observer reads; none of it is a resumable business state, and nothing
 * here forms a phase.
 */
export interface PolicyState {
  /** Rule 1: a `load_*_definition` has succeeded at least once. */
  definition_loaded: boolean
  /** Rule 2 input: last `critique_sql_tool` confidence, or `null` if never called. */
  last_critique: number | null
  /** Rule 3 input: last `evaluate_sql_quality` score, or `null` if never called. */
  last_quality: number | null
  /** Rule 4 input: the normalized SQL that most recently cleared both floors. */
  admitted_sql: string | null
  /**
   * The normalized SQL the critic most recently judged. Bookkeeping for
   * `settleAdmitted`, not published evidence: it is what makes "critique a good
   * SQL, then execute a different one" fail rule 4.
   */
  pendingSql: string | null
  /** Critic context, harvested from tool results. */
  candidate_tables: Set<string>
  event_params: Set<string>
  partition_cols: Set<string>
  /** Evidence counters. */
  query_attempts: number
  query_successes: number
  admission_denials: { reason: string; sql: string | null }[]
  last_query_outcome: 'completed' | 'pending' | 'failed' | null
  last_failure_kind: string | null
  search_returned_candidates: boolean
  clarification_presented: boolean
}

function freshState(): PolicyState {
  return {
    definition_loaded: false,
    last_critique: null,
    last_quality: null,
    admitted_sql: null,
    pendingSql: null,
    candidate_tables: new Set(),
    event_params: new Set(),
    partition_cols: new Set(),
    query_attempts: 0,
    query_successes: 0,
    admission_denials: [],
    last_query_outcome: null,
    last_failure_kind: null,
    search_returned_candidates: false,
    clarification_presented: false,
  }
}

// ── the plugin ────────────────────────────────────────────────────────────────

/** Policy-only admission and critic-context harvest, keyed per agent. */
export class GuardrailsPolicy {
  private readonly states = new Map<string, PolicyState>()
  private readonly cfg: Config

  constructor(cfg: Config) {
    this.cfg = cfg
  }

  /** Per-agent state, created on first touch. */
  state(agentId: string): PolicyState {
    let s = this.states.get(agentId)
    if (s === undefined) {
      s = freshState()
      this.states.set(agentId, s)
    }
    return s
  }

  /** Per-agent state without creating it — the service's read path. */
  peekState(agentId: string): PolicyState | undefined {
    return this.states.get(agentId)
  }

  /** Snapshot for the session observer; Sets become sorted arrays so it is JSON-safe. */
  snapshot(agentId: string): Record<string, unknown> | undefined {
    const s = this.states.get(agentId)
    if (s === undefined) return undefined
    return {
      definition_loaded: s.definition_loaded,
      last_critique: s.last_critique,
      last_quality: s.last_quality,
      admitted_sql: s.admitted_sql,
      candidate_tables: [...s.candidate_tables].sort(),
      event_params: [...s.event_params].sort(),
      partition_cols: [...s.partition_cols].sort(),
      query_attempts: s.query_attempts,
      query_successes: s.query_successes,
      admission_denials: s.admission_denials,
      last_query_outcome: s.last_query_outcome,
      last_failure_kind: s.last_failure_kind,
      search_returned_candidates: s.search_returned_candidates,
      clarification_presented: s.clarification_presented,
    }
  }

  /**
   * The four admission rules plus the unified query budget.
   *
   * Returns a denial reason the tool runtime surfaces to the model verbatim as
   * `Error: <reason>`, or `undefined` to allow. Budget is checked first and
   * unconditionally, because it is unified run control rather than arm policy.
   */
  guard = (execution: Readonly<ToolExecution>): string | undefined => {
    const agent = execution.agent
    if (agent === undefined) return undefined // host probe, no agent — allow
    if (execution.name !== 'query_data') return undefined
    const s = this.state(String(agent.id))

    if (s.query_attempts >= this.cfg.max_query_data_calls) {
      return `budget: query_data called ${s.query_attempts} times, limit is ${this.cfg.max_query_data_calls}`
    }
    if (!this.cfg.enforce_admission) return undefined

    const sqlArg = (execution.arguments as { sql?: unknown } | undefined)?.sql
    const sql = typeof sqlArg === 'string' ? sqlArg : ''

    const deny = (reason: string): string => {
      s.admission_denials.push({ reason, sql: sql === '' ? null : sql })
      return reason
    }

    if (!s.definition_loaded) {
      return deny('admission rule 1: no definition loaded — call load_table_definition (DWS tables) or load_event_definition (events) successfully before query_data')
    }
    if (s.last_critique === null) {
      return deny('admission rule 2: critique_sql_tool has not been called — critique this SQL before executing it')
    }
    if (s.last_critique < this.cfg.critique_confidence_floor) {
      return deny(`admission rule 2: critique_sql_tool confidence ${s.last_critique} is below the ${this.cfg.critique_confidence_floor} floor — revise the SQL and re-critique`)
    }
    if (s.last_quality === null) {
      return deny('admission rule 3: evaluate_sql_quality has not been called — score this SQL before executing it')
    }
    if (s.last_quality < this.cfg.quality_score_floor) {
      return deny(`admission rule 3: evaluate_sql_quality score ${s.last_quality} is below the ${this.cfg.quality_score_floor} floor — revise the SQL and re-score`)
    }
    if (s.admitted_sql === null) {
      return deny('admission rule 4: no SQL has cleared both critique_sql_tool and evaluate_sql_quality yet')
    }
    if (normalizeSql(sql) !== s.admitted_sql) {
      return deny('admission rule 4: the SQL passed to query_data differs from the SQL that cleared critique_sql_tool and evaluate_sql_quality — critique and score the SQL you intend to run')
    }
    return undefined
  }

  /**
   * Harvest critic context and evidence from every tool result, mirroring
   * phase-gate's `captureToolData`. Observation only: this handler always
   * delegates to `next()` and never blocks, transforms, or injects.
   */
  onPostExecute = async (
    exec: ToolExecution,
    result: Readonly<ToolExecutionResult>,
    next: () => Promise<PostToolDecision>,
  ): Promise<PostToolDecision> => {
    const agent = exec.agent
    if (agent !== undefined) {
      try {
        this.capture(this.state(String(agent.id)), exec.name, result)
      } catch {
        // Observation must never break the arm under test.
      }
    }
    return next()
  }

  /** Mirrors phase-gate `captureToolData`; errored results never harvest. */
  private capture(s: PolicyState, toolName: string, result: Readonly<ToolExecutionResult>): void {
    if (result.isError) {
      // A failed query still counts against the unified budget and is evidence.
      if (toolName === 'query_data') {
        s.query_attempts += 1
        s.last_query_outcome = 'failed'
      }
      return
    }
    const value = (result as { value?: unknown }).value

    if (toolName === 'query_data') {
      s.query_attempts += 1
      const v = value as { state?: unknown; failureKind?: unknown } | undefined
      const st = v?.state
      s.last_query_outcome = st === 'completed' || st === 'pending' || st === 'failed' ? st : 'failed'
      s.last_failure_kind = typeof v?.failureKind === 'string' ? v.failureKind : null
      if (s.last_query_outcome === 'completed') s.query_successes += 1
      return
    }

    if (toolName === 'critique_sql_tool') {
      const v = value as { confidence?: unknown; sql?: unknown } | undefined
      s.last_critique = typeof v?.confidence === 'number' ? v.confidence : null
      // The critic returns the normalized SQL it actually judged; rule 4 compares
      // against that, not against whatever the model typed into the tool call.
      if (typeof v?.sql === 'string') s.pendingSql = normalizeSql(v.sql)
      this.settleAdmitted(s)
      return
    }

    if (toolName === 'evaluate_sql_quality') {
      const v = value as { score?: unknown } | undefined
      s.last_quality = typeof v?.score === 'number' ? v.score : null
      this.settleAdmitted(s)
      return
    }

    if (toolName === 'present_clarification') {
      s.clarification_presented = true
      return
    }

    if (toolName === 'search_data_sources') {
      collectTableNames(value, s.candidate_tables)
      s.search_returned_candidates = !isCandidatesEmpty(value)
      return
    }

    if (toolName === 'load_event_definition') {
      s.definition_loaded = true
      collectFields((value as { event?: unknown } | undefined)?.event, s.event_params, 'params_fields', 'params')
      const full = (value as { event_view?: { full_name?: unknown } } | undefined)?.event_view?.full_name
      if (typeof full === 'string' && full !== '') {
        const lower = full.toLowerCase()
        s.candidate_tables.add(lower)
        s.candidate_tables.add(lower.replace(/^.*\./, ''))
      }
      return
    }

    if (toolName === 'load_table_definition') {
      s.definition_loaded = true
      const tbl = (value as { table?: { qualified_name?: unknown; table_name?: unknown } } | undefined)?.table
      collectFields((value as { table?: unknown } | undefined)?.table, s.partition_cols, 'partition_cols', 'partitions')
      const nameRaw = typeof tbl?.qualified_name === 'string' && tbl.qualified_name !== ''
        ? tbl.qualified_name
        : tbl?.table_name
      if (typeof nameRaw === 'string' && nameRaw !== '') {
        const lower = nameRaw.toLowerCase()
        s.candidate_tables.add(lower)
        s.candidate_tables.add(lower.replace(/^.*\./, ''))
      }
    }
  }

  /**
   * Rule 4's bookkeeping: a SQL is admitted only once BOTH floors are cleared
   * for it. Tracking `pendingSql` separately from `admitted_sql` is what makes
   * "critique a good SQL, then execute a different one" fail — re-critiquing
   * replaces `pendingSql`, and the previously admitted SQL stays admitted only
   * if it is still the one both tools scored.
   */
  private settleAdmitted(s: PolicyState): void {
    const pending = s.pendingSql
    if (pending === null) return
    const okCritique = s.last_critique !== null && s.last_critique >= this.cfg.critique_confidence_floor
    const okQuality = s.last_quality !== null && s.last_quality >= this.cfg.quality_score_floor
    s.admitted_sql = okCritique && okQuality ? pending : null
  }

  /** Register the guard and the observer. No prompt sections, no injections. */
  register(ctx: Context): void {
    ctx.tools.guard(this.guard)
    ctx.on('tools/post-execute', this.onPostExecute)
    ctx.on('agent/disposed', ({ agent }) => { this.states.delete(String(agent.id)) })
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    criticCtx: CriticCtxPolicyService
  }
}

/**
 * Publishes `ctx.criticCtx` with the same `forAgent(agentId)` shape the critique
 * tools probe. Returns the live `Set` references, matching phase-gate, so a
 * later harvest is visible to an already-issued context.
 */
export class CriticCtxPolicyService extends Service {
  private readonly policy: GuardrailsPolicy

  constructor(ctx: Context, policy: GuardrailsPolicy) {
    super(ctx, 'criticCtx')
    this.policy = policy
  }

  forAgent(agentId: string): CriticCtx | undefined {
    const s = this.policy.peekState(agentId)
    if (s === undefined) return undefined
    return {
      candidateTables: s.candidate_tables,
      eventParams: s.event_params,
      partitionCols: s.partition_cols,
    }
  }
}

/** Mount for the calling agent's scope. */
export function apply(ctx: Context, config: Config): void {
  const policy = new GuardrailsPolicy(config)
  policy.register(ctx)
  new CriticCtxPolicyService(ctx, policy)
}

// ── harvest helpers, transcribed from phase-gate (pinned by tests) ────────────

/** phase-gate `normalizeSql` (`phase-gate.ts:1102`). */
export function normalizeSql(sql: string): string {
  return sql
    .replace(/;\s*$/, '')
    .replace(/\bORDER\s+BY\b[^();]*/gi, '')
    .replace(/\bLIMIT\b[^();]*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** phase-gate `collectTableNames` (`phase-gate.ts:1115`). */
export function collectTableNames(value: unknown, out: Set<string>): void {
  if (value === null || value === undefined) return
  const v = value as { tables?: unknown; table_names?: unknown; candidates?: unknown }
  const names = v.tables ?? v.table_names ?? v.candidates
  if (!Array.isArray(names)) return
  for (const t of names) {
    if (typeof t === 'string') {
      out.add(t.toLowerCase())
      out.add(t.toLowerCase().replace(/^.*\./, ''))
    } else if (t !== null && typeof t === 'object') {
      const id = (t as { id?: unknown }).id
      if (typeof id === 'string') {
        out.add(id.toLowerCase())
        out.add(id.toLowerCase().replace(/^.*\./, ''))
        const sep = id.lastIndexOf('__')
        if (sep > 0) out.add(id.slice(0, sep).toLowerCase())
      }
    }
  }
}

/** phase-gate `isCandidatesEmpty` (`phase-gate.ts:1158`). */
export function isCandidatesEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true
  const v = value as { candidates?: unknown; tables?: unknown; table_names?: unknown }
  const arr = v.candidates ?? v.tables ?? v.table_names
  return !Array.isArray(arr) || arr.length === 0
}

/** phase-gate `collectFields` (`phase-gate.ts:1165`). */
export function collectFields(value: unknown, out: Set<string>, ...keys: string[]): void {
  if (value === null || typeof value !== 'object') return
  const obj = value as Record<string, unknown>
  for (const k of keys) {
    const v = obj[k]
    if (Array.isArray(v)) {
      for (const f of v) {
        if (typeof f === 'string') {
          out.add(f.toLowerCase())
        } else if (f !== null && typeof f === 'object') {
          const n = (f as { name?: unknown }).name
          if (typeof n === 'string') out.add(n.toLowerCase())
        }
      }
    } else if (v !== null && typeof v === 'object') {
      for (const f of Object.keys(v)) out.add(f.toLowerCase())
    }
  }
}

/** Re-exported so the runner can assert rule-4 semantics without importing internals. */
export { extractSqlCandidate }
