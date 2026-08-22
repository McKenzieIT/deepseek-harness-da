/**
 * P13b NL→SQL engine — the NL→SQL main loop. Ported from
 * `prototypes/p13-nl2sql-engine/engine.mjs`.
 *
 * BM25 linking → prompt → LLM → critic gate → execute → feedback
 * self-correction (`QueryOutcome.failed` → LLM reads error, rewrites → near-dup
 * gate prevents re-send → back to GENERATION, max `MAX_FEEDBACK_RETRIES`) →
 * honest decline. Aligns BIRD-FIXER / Databricks Genie Inspect (execution
 * feedback is more reliable than static critique).
 *
 * F2 同源: the SQL the critic checks = the SQL `odps.execute` receives
 * (`extractSqlCandidate` single source, no `tools/post-execute` rewrite).
 *
 * Production runtime is agent-loop-driven (P7) — the agent LLM generates SQL +
 * the phase-gate's `sql_syntax_gate` runs the critic. This `run()` is the
 * EVAL-RUNNER entry point (P13b grilling Q3: lightweight runner, not via real
 * harness session); the engine's logic modules are shared with production.
 *
 * code-review-low fix #3: a `running` outcome now continues via
 * `odps.attach(instanceId)` up to 3 times (the P13 prototype returned pending
 * without polling). fix #5: `NearDupGate.hash` removes ALL whitespace (not just
 * collapse) so `WHERE x=1` and `WHERE x = 1` dedupe.
 *
 * @module @deepseek-ai/dsh-nl2sql-engine/src/engine
 */
import {
  MAX_FEEDBACK_RETRIES,
  RECOVERABLE_FAILURES,
  UNRECOVERABLE_FAILURES,
  makeCriticCtx,
  type QueryOutcome,
} from './types.ts'
import { critiqueSql, extractSqlCandidate } from './critic.ts'
import { routeMetric, isMetricHit, metricFromHit, extractTimeParams, buildExecutableSQL } from './metric-engine.ts'
import { buildPrompt, type EventDefinitionLite } from './prompt.ts'
import { buildJoinConstraints, buildDeclaredJoinPairs, expandCandidates, type RelationGraphLike } from './ontology.ts'
import type { EngineConventions } from '@deepseek-ai/dsh-query-maxcompute/src/conventions.ts'
import { loadConventions } from '@deepseek-ai/dsh-query-maxcompute/src/conventions.ts'
import { Bm25Linker, type RetrievalLinker, type DataSourceDoc } from './bm25-linking.ts'
import type { OdpsExecutor } from './stand-in-odps.ts'
import type { Llm, LlmFeedback } from './replay-llm.ts'

const MAX_RUNNING_POLLS = 3
const RECOVERABLE = RECOVERABLE_FAILURES as readonly string[]
const UNRECOVERABLE = UNRECOVERABLE_FAILURES as readonly string[]

/** Near-dup gate (engine-internal thin version; F4's session-level tool-query near-dup is deferred — Not-yet-specified query-trio). */
class NearDupGate {
  private readonly seen = new Set<string>()

  /** fix #5: remove ALL whitespace (not just collapse) + lowercase, so spacing variants dedupe. */
  hash(sql: string): string {
    return sql.replace(/\s+/g, '').toLowerCase()
  }

  allow(sql: string): boolean {
    const h = this.hash(sql)
    if (this.seen.has(h)) return false
    this.seen.add(h)
    return true
  }
}

/** A single engine trace entry (step + payload) for eval diagnostics. */
export type EngineTraceEntry = Readonly<Record<string, unknown>>

/** The engine's injectable dependencies: LLM, ODPS executor, optional data sources, conventions, and retrieval linker. */
export interface EngineDeps {
  readonly dataSources?: readonly DataSourceDoc[]
  readonly llm: Llm
  readonly odps: OdpsExecutor
  readonly conventions?: EngineConventions | null
  /** Injectable retrieval (Q1: default is the in-process `Bm25Linker`; swap to P5 `ctx.retrieval` when P5b ships). */
  readonly retrieval?: RetrievalLinker
  /** P3: live relation graph (absent => no join injection / recall / undeclared-JOIN rule). */
  readonly graph?: RelationGraphLike
  /** P4 D2: resolve a table's partition columns (absent => Level 2.5 assumes ds). */
  readonly partitionResolver?: (tableName: string) => readonly string[] | null
}

/** The input arguments for a single engine run: the question + optional event definition + scope id. */
export interface EngineRunArgs {
  readonly question: string
  readonly eventDef?: EventDefinitionLite | null
  readonly scopeId?: string
  /** P4 D2: reference date YYYYMMDD for time-param extraction (eval reproducibility). */
  readonly today?: string
}

/** The engine run outcome: ok/fail, the SQL, the ODPS outcome, result rows, decline/pending flags, and the trace. */
export interface EngineRunResult {
  readonly ok: boolean
  readonly sql?: string
  readonly outcome?: QueryOutcome
  readonly result?: unknown[] | undefined
  readonly decline?: boolean
  readonly reason?: string
  readonly pending?: boolean
  readonly trace: EngineTraceEntry[]
}

/**
 * The NL→SQL engine: BM25 schema-linking → prompt → LLM → critic gate →
 * execute → feedback self-correction → honest decline. The eval runner is
 * the primary consumer (production runtime is agent-loop-driven via P7).
 */
export class Nl2sqlEngine {
  private readonly retrieval: RetrievalLinker
  private readonly llm: Llm
  private readonly odps: OdpsExecutor
  private readonly conventions: EngineConventions | null
  private readonly graph: RelationGraphLike | undefined
  private readonly partitionResolver: ((tableName: string) => readonly string[] | null) | undefined

  constructor(deps: EngineDeps) {
    this.retrieval = deps.retrieval ?? new Bm25Linker(deps.dataSources ?? [])
    this.llm = deps.llm
    this.odps = deps.odps
    this.conventions = deps.conventions ?? loadConventions('maxcompute')
    this.graph = deps.graph
    this.partitionResolver = deps.partitionResolver
  }

  /**
   * One NL→SQL run with execution-feedback self-correction.
   *
   * @param args - The run arguments (question + optional event definition).
   * @returns The run result (ok + sql + outcome, or decline + reason, or pending), with a trace.
   */
  async run(args: EngineRunArgs): Promise<EngineRunResult> {
    const { question, eventDef } = args
    const nearDup = new NearDupGate()
    const trace: EngineTraceEntry[] = []

    // 1. BM25 schema-linking (local RetrievalLinker; P5 ctx.retrieval seam when P5b ships)
    let candidates = this.retrieval.retrieve(question, { topK: 5, mode: 'bm25-only' })
    // P4 D2: route from PRE-expansion candidates so a graph's derived_from expansion
    // (which adds a metric's source table) does not flip a pure-metric query from
    // level-2.5 to level-2 (subverting the deterministic path when a graph is mounted).
    const route = routeMetric(candidates)
    // P3 C3: graph-enhanced recall (1-hop joins + derived) when a graph is wired
    if (this.graph !== undefined) {
      // cap > retrieve topK (5) so graph neighbors are actually ADDED, not
      // dropped by the originals-first slice (a full 5-hit BM25 result would
      // otherwise make expansion a silent no-op in production-sized corpora).
      candidates = expandCandidates(candidates, this.graph, 8)
    }
    trace.push({
      step: 'bm25_linking',
      candidates: candidates.map(c => ({ id: c.id, score: Number(c.score).toFixed(3) })),
    })

    // P3 C1/C2: graph-derived join constraints + declared-join pairs (no-op when no graph)
    const candidateIds = candidates.map(c => c.id)
    const declaredJoinPairs = this.graph !== undefined ? buildDeclaredJoinPairs(candidateIds, this.graph) : undefined
    const joinConstraints = this.graph !== undefined ? buildJoinConstraints(candidateIds, this.graph) : undefined
    if (joinConstraints !== undefined && joinConstraints.length > 0) {
      trace.push({ step: 'join_constraints', count: joinConstraints.length })
    }

    // critic ctx: candidate tables + event params + partition cols (from P6 substrate; not from conventions)
    const partitionCols = eventDef?.partitions?.map(p => p.name) ?? ['ds']
    const ctx = makeCriticCtx({
      candidateTables: candidateIds,
      eventParams: eventDef?.params_fields ?? {},
      partitionCols,
      ...(declaredJoinPairs !== undefined ? { declaredJoinPairs } : {}),
    })

    // P4 D2: metric routing — pure-metric => Level 2.5 deterministic execution (this
    // branch returns before the LLM loop; `route` was computed pre-expansion above so
    // graph-derived candidates don't flip the route). Mixed (metric + table) => Level 2
    // context injection is a later task; no metric => null (normal LLM path, unchanged).
    if (route === 'level-2.5') {
      const metricHit = candidates.find(isMetricHit)
      const metricDef = metricHit !== undefined ? metricFromHit(metricHit) : null
      if (metricHit !== undefined && metricDef !== null) {
        const params = extractTimeParams(question, args.today ?? '')
        const source = metricDef.computation.metadata.source
        const metricPartitionCols = this.partitionResolver ? (this.partitionResolver(source) ?? ['ds']) : ['ds']
        const sql = buildExecutableSQL(metricDef, params, metricPartitionCols)
        // guard: a deterministic path must not run an unpartitioned full-table scan —
        // the missing_partition_filter critic is only a warning, so decline when a ds
        // partition is required but no time param could be extracted from the question.
        const hasDs = metricPartitionCols.map(p => p.toLowerCase()).includes('ds')
        if (hasDs && !params.date && !(params.start_date && params.end_date)) {
          return { ok: false, decline: true, reason: 'Level 2.5: 无法从问题中提取时间参数，拒绝执行未分区扫描', sql, trace }
        }
        trace.push({ step: 'metric_level25', sql, source })
        // light critic: the source is the only candidate table + partition check
        const metricCtx = makeCriticCtx({ candidateTables: [source], partitionCols: metricPartitionCols })
        const critic = critiqueSql(sql, metricCtx)
        trace.push({ step: 'critic', passed: critic.passed, reason: critic.reason, findings: critic.findings.map(f => ({ rule: f.rule, sev: f.severity })) })
        if (!critic.passed) {
          return { ok: false, decline: true, reason: critic.reason ?? 'metric critic fail', sql, trace }
        }
        let out = await this.odps.execute(sql)
        trace.push({ step: 'execute', state: out.state, failureKind: out.failureKind })
        if (out.state === 'running') {
          let polls = 0
          while (out.state === 'running' && polls < MAX_RUNNING_POLLS) {
            polls += 1
            out = await this.odps.attach(out.instance_id ?? '')
            trace.push({ step: 'attach', poll: polls, state: out.state })
          }
          if (out.state === 'running') return { ok: false, pending: true, sql, outcome: out, trace }
        }
        if (out.state === 'done') return { ok: true, sql, outcome: out, result: out.rows, trace }
        return { ok: false, decline: true, reason: `指标执行失败 ${out.failureKind ?? ''}: ${out.error ?? ''}`, sql, trace }
      } else {
        trace.push({ step: 'metric_level25_skip', reason: 'metric hit unresolved' })
      }
    }

    let attempt = 0
    let lastFeedback: LlmFeedback | null = null
    while (attempt <= MAX_FEEDBACK_RETRIES) {
      // 2. prompt + 3. LLM generate
      const prompt = buildPrompt({ question, candidates, eventDef, conventions: this.conventions, phase: 'generation', ...(joinConstraints !== undefined ? { joinConstraints } : {}) })
      trace.push({ step: 'prompt_built', attempt, len: prompt.length })
      const gen = await this.llm.generate({ question, attempt, feedback: lastFeedback })
      const sql = extractSqlCandidate('```sql\n' + gen.sql + '\n```') ?? gen.sql
      trace.push({ step: 'llm_generate', attempt, sql })

      // LLM produced no SQL (null/empty) → critic-fail feedback (avoids nearDup.allow('') + stand-in default-done false success)
      if (!sql) {
        lastFeedback = { failureKind: 'critic_fail', error: 'LLM 未产出 SQL（空/无效）' }
        attempt += 1
        continue
      }

      // 4. critic gate (pre-exec; fills P7 sql_syntax_gate slot)
      const critic = critiqueSql(sql, ctx)
      trace.push({
        step: 'critic',
        passed: critic.passed,
        reason: critic.reason,
        findings: critic.findings.map(f => ({ rule: f.rule, sev: f.severity })),
      })
      if (!critic.passed) {
        lastFeedback = { failureKind: 'critic_fail', error: critic.reason ?? 'critic fail' }
        attempt += 1
        continue
      }

      // 5. near-dup gate (prevent re-sending the same failed SQL)
      if (!nearDup.allow(sql)) {
        trace.push({ step: 'near_dup_reject', sql })
        lastFeedback = { failureKind: 'near_dup', error: '近重复 SQL 拒重发，须重写' }
        attempt += 1
        continue
      }

      // 6. execute (F2 同源: the SQL here = the SQL the critic checked)
      let out = await this.odps.execute(sql)
      trace.push({ step: 'execute', state: out.state, failureKind: out.failureKind })

      // fix #3: running → continue via attach (check_query), up to MAX_RUNNING_POLLS
      if (out.state === 'running') {
        let polls = 0
        while (out.state === 'running' && polls < MAX_RUNNING_POLLS) {
          polls += 1
          out = await this.odps.attach(out.instance_id ?? '')
          trace.push({ step: 'attach', poll: polls, state: out.state })
        }
        if (out.state === 'running') {
          return { ok: false, pending: true, sql, outcome: out, trace }
        }
      }

      if (out.state === 'done') {
        return { ok: true, sql, outcome: out, result: out.rows, trace }
      }

      // failed
      const fk = out.failureKind
      if (fk !== undefined && UNRECOVERABLE.includes(fk)) {
        return { ok: false, decline: true, reason: `不可修复错误 ${fk}: ${out.error ?? ''}`, sql, trace }
      }
      if (fk !== undefined && RECOVERABLE.includes(fk)) {
        lastFeedback = { failureKind: fk, error: out.error ?? '' }
        attempt += 1
        continue
      }
      return { ok: false, decline: true, reason: `未知错误 ${fk ?? '?'}`, sql, trace }
    }
    return { ok: false, decline: true, reason: `自修 ${MAX_FEEDBACK_RETRIES} 次仍失败`, trace }
  }
}
