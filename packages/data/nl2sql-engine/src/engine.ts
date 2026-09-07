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
import { critiqueSql, extractSqlCandidate, looksLikeToolCall, stripLineComments } from './critic.ts'
import { routeMetric, isMetricHit, metricFromHit, extractTimeParams, buildMetricContext, type HostTableInfo } from './metric-engine.ts'
import { buildPrompt, type EventDefinitionLite, type EventViewLite } from './prompt.ts'
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
  /**
   * GA-EVAL-EVENTDEF-PREFETCH: the event-view grounding that goes with
   * `eventDef` — the FROM table + params-extraction template read from the
   * scope's `config.yaml` (G-DA4). Passed alongside rather than folded into
   * `eventDef` because it is scope-level, not an event property, and because
   * the prompt renders it as its own section. Absent → no event-view section
   * and no extra critic candidate table (byte-stable, pre-(a) behaviour).
   */
  readonly eventView?: EventViewLite | null
  readonly scopeId?: string
  /** P4 D2: reference date YYYYMMDD for time-param extraction (eval reproducibility). */
  readonly today?: string
}

/**
 * GA-EVAL-EVENTDEF-PREFETCH: the event view's table names for the critic's
 * candidate set. Mirrors G-DA4's phase-gate `captureToolData`, which adds
 * `event_view.full_name` to `candidate_tables`. Without this the critic rejects
 * the very table this ticket injects (`table_not_in_candidates`) and the engine
 * burns every retry on a table it just told the model to use. Both the qualified
 * and the bare name are added because `extractTableNames` strips the `db.`
 * prefix — the bare name is what actually matches today, the qualified one keeps
 * a prefix-preserving extractor working.
 * @param view - the event view, or null/undefined when no event was detected.
 * @returns the table names to add to the critic's candidate set (empty when absent).
 */
function eventViewTableNames(view: EventViewLite | null | undefined): readonly string[] {
  const full = view?.full_name
  if (full === undefined || full === '') return []
  const bare = full.replace(/^.*\./, '')
  return bare === full ? [full] : [full, bare]
}

/** The engine run outcome: ok/fail, the SQL, the ODPS outcome, result rows, decline/pending flags, and the trace. */
export interface EngineRunResult {
  readonly ok: boolean
  readonly sql?: string
  readonly outcome?: QueryOutcome
  readonly result?: unknown[] | undefined
  readonly decline?: boolean
  /** Why the engine declined, when the reason is machine-actionable (CL-23, CL-20). */
  readonly declineKind?: 'tool_call_emitted' | 'beyond_single_query'
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
    // GA-EVAL-EVENTDEF-PREFETCH: the event view is a legitimate FROM target the
    // BM25 candidates never contain (it is config-level, not a corpus item).
    const eventViewTables = eventViewTableNames(args.eventView)
    let ctx = makeCriticCtx({
      candidateTables: [...candidateIds, ...eventViewTables],
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
          candidateTables: [...new Set([...candidateIds, ...sourceTables, ...eventViewTables])],
          eventParams: eventDef?.params_fields ?? {},
          partitionCols,
          ...(declaredJoinPairs !== undefined ? { declaredJoinPairs } : {}),
        })
        const hostTableInfo = this.resolveHostTableInfo(metricDef.computation.metadata.source)
        metricContext = buildMetricContext(metricDef, extractTimeParams(question, args.today ?? ''), hostTableInfo)
      }
    }

    // CL-20: capability triage — refuse requests whose DELIVERABLE no single
    // query can produce (report / forecast / recommendation). Scoped to
    // deliverable-kind, not vagueness: see triageQuestion for why the vagueness
    // boundary is not implementable against this case set.
    const triageResult = await this.triageQuestion(question)
    if (triageResult !== null) {
      trace.push({ step: 'capability_triage', result: 'beyond_single_query' })
      return {
        ok: false,
        decline: true,
        declineKind: 'beyond_single_query',
        reason: triageResult,
        trace,
      }
    }

    let attempt = 0
    let lastFeedback: LlmFeedback | null = null
    while (attempt <= MAX_FEEDBACK_RETRIES) {
      // 2. prompt + 3. LLM generate
      // GA-EVAL-RETRY-FEEDBACK: render lastFeedback into the prompt (# 上次失败反馈)
      // so the LLM self-corrects. The CtxLlmAdapter streams args.prompt only, so
      // feedback must live IN the prompt — not the vestigial args.feedback side-channel.
      // attempt 0 → lastFeedback null → section omitted → byte-identical to pre-fix.
      const prompt = this.promptBuilder({ question, candidates, eventDef, conventions: this.conventions, phase: 'generation', isTrend, today: args.today, ...(joinConstraints !== undefined ? { joinConstraints } : {}), ...(metricContext !== undefined ? { metricContext } : {}), feedback: lastFeedback, ...(args.eventView != null ? { eventView: args.eventView } : {}) })
      trace.push({ step: 'prompt_built', attempt, len: prompt.length })
      const gen = await this.llm.generate({ question, attempt, feedback: lastFeedback, prompt })

      // CL-23: the model emitted a tool-call instead of SQL. Retrying does not
      // help — the prompt's TOOL_CATALOG is what elicits it (CL-19) — and
      // feeding it downstream would let `nearDup.allow('')` and the stand-in
      // executor's default-done turn it into a false success. Decline cleanly so
      // the reply layer can synthesise a real answer for the user.
      if (looksLikeToolCall(gen.sql)) {
        trace.push({ step: 'tool_call_detected', attempt, text: gen.sql.slice(0, 200) })
        return {
          ok: false,
          decline: true,
          declineKind: 'tool_call_emitted',
          reason: `LLM 发射 tool-call 而非 SQL: ${gen.sql.slice(0, 100)}`,
          trace,
        }
      }

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

  /**
   * CL-20: capability triage — does the question ask for a DELIVERABLE that no
   * single query can produce (a compiled report, a forecast, a strategy
   * recommendation), as opposed to a data value?
   *
   * Deliberately narrow. It does NOT judge whether a question is vague,
   * subjective, or under-specified — that boundary is not self-consistent in
   * the case set (`076 服务器之间有没有不平衡` expects SQL while `079 卡牌平衡性
   * 怎么样` expects a refusal, same word stem, opposite ground truth), so any
   * classifier drawn on it only trades one class of error for the other.
   * Scoping the gate to deliverable-kind keeps it domain-agnostic: "give me a
   * weekly report" is not a single query in ANY business domain, which is what
   * makes this判据 transfer without a per-domain vocabulary (contrast
   * `TREND_PATTERN`'s keyword list — GA-GRILL2 D3 measured it at 85% recall and
   * opened GA-I18N-R1 to escape that ceiling via LLM intent classification).
   *
   * Under-specification is left to the model's own §5 honest-decline, which
   * already produces judge-passing refusals in 7 of 9 observed prose attempts.
   *
   * ## Do not "fix" the report example (measured 2026-09-06)
   *
   * CL-20 recorded `052 最近7天每天的商店销售额` as a 3-in-5 false positive here,
   * blamed on 「7天/每天」 reading as 「周报」 next to the "periodic report" example,
   * and asked for the wording to be rewritten. Measuring the gate directly with
   * `packages/eval/eval-cli/bin/probe-triage.ts` (n=5, trace-based) falsified that:
   * this prompt classifies 052 as `data_request` **5/5**, along with 073/076/077
   * and four paraphrased multi-day shapes (「最近30天每天的活跃用户数」,
   * 「这个月每天的充值金额」, 「上周每天的订单量」, 「各个渠道昨天的新增用户数」).
   * The original claim came from inferring gate firing from latency, because eval
   * artefacts do not persist the trace — but the CL-23 tool-call decline lands on
   * the same `generated_sql: null`, so low-latency empty SQL never distinguished
   * the two paths.
   *
   * A rewrite was attempted anyway and **regressed**: adding an
   * unspecified-subject clause (to make `voice_041` fire, which this prompt does
   * NOT do — 0/5, another CL-20 claim the probe corrected) pulled `077 玩家留存有
   * 什么问题吗` to 5/5 firing and `076` to 2/5. Both expect SQL, so both became
   * guaranteed failures. Re-measure before touching the wording.
   *
   * Returns `null` to proceed to generation, or a reason string to decline.
   */
  private async triageQuestion(question: string): Promise<string | null> {
    const prompt = [
      'Classify what the user is ASKING FOR — the kind of deliverable, not its topic.',
      '',
      'Reply `beyond_single_query` when the request is for an artefact that no',
      'single database query can produce, regardless of what data exists:',
      '  - a compiled/periodic report or summary ("weekly report", "summarise the month")',
      '  - a forecast or projection of future values ("predict next week")',
      '  - a recommendation, strategy, or course of action ("how do we raise revenue",',
      '    "should we run a promotion")',
      '',
      'Reply `data_request` for everything else — any request whose answer is a',
      'value, a list, a comparison, or a trend that could be read out of a table.',
      'This includes vague, broad, or subjectively-worded requests: if the user is',
      'ultimately after numbers, it is a data_request even when it is unclear WHICH',
      'numbers. Under-specification is NOT your concern here.',
      '',
      `Request: ${question}`,
      '',
      'Reply with exactly one word: beyond_single_query or data_request',
    ].join('\n')

    const gen = await this.llm.generate({
      question: prompt,
      attempt: 0,
      feedback: null,
      prompt,
    })

    const answer = gen.sql.trim().toLowerCase()
    if (answer.includes('beyond_single_query')) {
      return '该请求要求的产物（报告/预测/策略建议）超出单条数据查询的能力范围'
    }
    return null
  }
}
