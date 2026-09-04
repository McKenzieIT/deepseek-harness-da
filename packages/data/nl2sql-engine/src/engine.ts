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
import { critiqueSql, extractSqlCandidate, stripLineComments } from './critic.ts'
import { routeMetric, isMetricHit, metricFromHit, extractTimeParams, buildMetricContext, type HostTableInfo } from './metric-engine.ts'
import { buildPrompt, type EventDefinitionLite } from './prompt.ts'
import { buildJoinConstraints, buildDeclaredJoinPairs, expandCandidates, type RelationGraphLike } from './ontology.ts'
import { detectTrendIntent, rerankByGranularity } from './granularity.ts'
import type { EngineConventions } from '@deepseek-ai/dsh-query'
import { loadConventions } from '@deepseek-ai/dsh-query-maxcompute/src/conventions.ts'
import { Bm25Linker, type RetrievalLinker, type DataSourceDoc } from './bm25-linking.ts'
import type { OdpsExecutor } from './stand-in-odps.ts'
import type { Llm, LlmFeedback } from './replay-llm.ts'

const MAX_RUNNING_POLLS = 3
const RECOVERABLE = RECOVERABLE_FAILURES as readonly string[]
const UNRECOVERABLE = UNRECOVERABLE_FAILURES as readonly string[]

/**
 * Post-process LLM-generated SQL: replace runtime date functions (GETDATE,
 * CURRENT_TIMESTAMP, DATEADD) with literal dates based on the `today` param.
 * Also strips inline comments that may contain reasoning leakage.
 */
function postProcessSql(sql: string, today?: string): string {
  if (!today || !/^\d{8}$/.test(today)) return sql
  let out = sql
  // Strip single-line comments (reasoning leakage like "-- Wait, DATEDIFF returns...");
  // string-literal-aware so a `--` inside a SQL string literal isn't truncated (nl2sql-3).
  out = stripLineComments(out)
  // Replace GETDATE() / CURRENT_TIMESTAMP with today literal
  out = out.replace(/\bGETDATE\s*\(\s*\)/gi, `'${today}'`)
  out = out.replace(/\bCURRENT_TIMESTAMP\b/gi, `'${today}'`)
  // Replace TO_CHAR(DATEADD('today', -N, 'dd'), 'yyyyMMdd') patterns with computed date
  out = out.replace(
    /TO_CHAR\s*\(\s*DATEADD\s*\(\s*'(\d{8})'\s*,\s*(-?\d+)\s*,\s*'dd'\s*\)\s*,\s*'yyyyMMdd'\s*\)/gi,
    (_m: string, base: string, offset: string) => {
      return `'${computeDate(base, Number(offset))}'`
    },
  )
  // Replace DATEADD(GETDATE(), -N, 'dd') → computed literal. A bare-literal-base
  // DATEADD (no TO_CHAR wrapper) is already deterministic and left untouched; the
  // TO_CHAR(DATEADD('YYYYMMDD', …), 'yyyyMMdd') form is handled by the regex above.
  const dateAddRe = /(?:TO_CHAR\s*\(\s*)?DATEADD\s*\(\s*GETDATE\s*\(\s*\)\s*,\s*(-?\d+)\s*,\s*'dd'\s*\)(?:\s*,\s*'yyyyMMdd'\s*\))?/gi
  out = out.replace(dateAddRe, (_m, offset) => {
    return `'${computeDate(today, Number(offset))}'`
  })
  return out.trim()
}

function computeDate(base: string, offsetDays: number): string {
  // nl2sql-engine-6: use UTC (matching metric-engine shiftDays/fmt) — local
  // components drift vs UTC near a timezone boundary for the same YYYYMMDD today.
  const y = Number(base.slice(0, 4))
  const m = Number(base.slice(4, 6)) - 1
  const d = Number(base.slice(6, 8))
  const dt = new Date(Date.UTC(y, m, d + offsetDays))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}${mm}${dd}`
}

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
  /**
   * P4 D2: resolve a table's partition columns. Read by resolveHostTableInfo
   * in the Level 2 (metric) path to build the time-filter hint; unused only
   * on the removed Level 2.5 deterministic arm.
   */
  readonly partitionResolver?: (tableName: string) => readonly string[] | null
  /** P14b: payload lookup for graph-expanded neighbors (injected, does not change RetrievalLinker interface). */
  readonly lookupDoc?: (id: string) => DataSourceDoc | undefined
  /** GA-EXP2: optional prompt builder override for prompt language experiments. */
  readonly promptBuilder?: (args: import('./prompt.ts').BuildPromptArgs) => string
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
  private readonly lookupDoc: ((id: string) => DataSourceDoc | undefined) | undefined
  private readonly partitionResolver: ((tableName: string) => readonly string[] | null) | undefined
  private readonly promptBuilder: (args: import('./prompt.ts').BuildPromptArgs) => string

  constructor(deps: EngineDeps) {
    this.retrieval = deps.retrieval ?? new Bm25Linker(deps.dataSources ?? [])
    this.llm = deps.llm
    this.odps = deps.odps
    this.conventions = deps.conventions ?? loadConventions('maxcompute')
    this.graph = deps.graph
    this.lookupDoc = deps.lookupDoc
    this.partitionResolver = deps.partitionResolver
    this.promptBuilder = deps.promptBuilder ?? buildPrompt
  }

  private resolveHostTableInfo(sourceTable: string): HostTableInfo | undefined {
    const partitions = this.partitionResolver?.(sourceTable)
    if (partitions === null || partitions === undefined) return undefined
    const doc = this.lookupDoc?.(sourceTable)
    const payload = doc?.payload as { granularity?: string } | undefined
    const granularity = payload?.granularity || (/_df$/.test(sourceTable) ? '_df' : '')
    return { partitions: partitions.map(name => ({ name })), granularity }
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
    // P4 D2 (M1b): route from PRE-expansion candidates. Post-M1b both metric
    // routes collapse to 'level-2' (the Level 2.5 deterministic arm was removed —
    // wrong on SUM-on-_df snapshot metrics), so graph expansion can no longer flip
    // the route; pre-expansion routing is retained for parity + trace ordering.
    const route = routeMetric(candidates)
    // P3 C3: graph-enhanced recall (1-hop joins + derived) when a graph is wired
    if (this.graph !== undefined) {
      // cap > retrieve topK (5) so graph neighbors are actually ADDED, not
      // dropped by the originals-first slice (a full 5-hit BM25 result would
      // otherwise make expansion a silent no-op in production-sized corpora).
      candidates = expandCandidates(candidates, this.graph, 8, this.lookupDoc)
    }
    // P14b: soft rerank — boost _di candidates for trend intent
    const isTrend = detectTrendIntent(question)
    candidates = rerankByGranularity(candidates, isTrend)
    trace.push({
      step: 'bm25_linking',
      candidates: candidates.map(c => ({ id: c.id, score: c.score.toFixed(3) })),
    })

    // P3 C1/C2: graph-derived join constraints + declared-join pairs (no-op when no graph)
    const candidateIds = candidates.map(c => c.id)
    const declaredJoinPairs = this.graph !== undefined ? buildDeclaredJoinPairs(candidateIds, this.graph) : undefined
    const joinConstraints = this.graph !== undefined ? buildJoinConstraints(candidateIds, this.graph) : undefined
    if (joinConstraints !== undefined && joinConstraints.length > 0) {
      trace.push({ step: 'join_constraints', count: joinConstraints.length })
    }

    // critic ctx: candidate tables + event params + partition cols (from P6 substrate; not from conventions)
    const partitionCols = eventDef?.partitions?.map(p => p.name) ?? []
    let ctx = makeCriticCtx({
      candidateTables: candidateIds,
      eventParams: eventDef?.params_fields ?? {},
      partitionCols,
      ...(declaredJoinPairs !== undefined ? { declaredJoinPairs } : {}),
    })

    // P4 D2 (M1b): metric routing — metric present => Level 2 context injection
    // (the Level 2.5 deterministic arm was removed: deterministically wrong on
    // SUM-on-_df snapshot metrics — over-counting; ~0% real-case trigger rate).
    // No metric => null (normal LLM path, unchanged).
    let metricContext: string | undefined
    if (route === 'level-2') {
      const metricHit = candidates.find(isMetricHit)
      const metricDef = metricHit !== undefined ? metricFromHit(metricHit) : null
      if (metricHit !== undefined && metricDef !== null) {
        // The metric context introduces the source table as a legitimate reference —
        // augment the critic's candidate tables so the LLM's SQL referencing the source
        // (JOIN ods_login ...) is not falsely rejected by table_not_in_candidates.
        const sourceTables = [metricDef.computation.metadata.source]
        ctx = makeCriticCtx({
          candidateTables: [...new Set([...candidateIds, ...sourceTables])],
          eventParams: eventDef?.params_fields ?? {},
          partitionCols,
          ...(declaredJoinPairs !== undefined ? { declaredJoinPairs } : {}),
        })
        const hostTableInfo = this.resolveHostTableInfo(metricDef.computation.metadata.source)
        metricContext = buildMetricContext(metricDef, extractTimeParams(question, args.today ?? ''), hostTableInfo)
      }
    }

    let attempt = 0
    let lastFeedback: LlmFeedback | null = null
    while (attempt <= MAX_FEEDBACK_RETRIES) {
      // 2. prompt + 3. LLM generate
      const prompt = this.promptBuilder({ question, candidates, eventDef, conventions: this.conventions, phase: 'generation', isTrend, today: args.today, ...(joinConstraints !== undefined ? { joinConstraints } : {}), ...(metricContext !== undefined ? { metricContext } : {}) })
      trace.push({ step: 'prompt_built', attempt, len: prompt.length })
      const gen = await this.llm.generate({ question, attempt, feedback: lastFeedback, prompt })
      const rawSql = extractSqlCandidate('```sql\n' + gen.sql + '\n```') ?? gen.sql
      const sql = rawSql ? postProcessSql(rawSql, args.today) : rawSql
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
