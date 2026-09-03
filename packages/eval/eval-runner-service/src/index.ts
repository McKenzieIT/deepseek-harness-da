/**
 * EvalRunnerService — the Cordis Service that wires the `ctx.evalRunner` seam
 * (declared by `@deepseek-ai/dsh-tool-trigger-eval` and consumed by
 * `dsh-goal-eval-policy`'s no-progress backstop). It drives the REAL NL2SQL
 * engine + ctx.query + ctx.llm collaborators against the case set, persists
 * JSONL in the format `FileBackedEvalResultStore` reads, and tracks
 * last / last-two runs for delta.
 *
 * Activating this Service makes:
 *  - `trigger_eval` full_run reachable (was: not_configured — the seam was
 *    declared but unmounted; W6a wired the policy against an absent seam).
 *  - the ③ autonomous goal loop's no-progress backstop live (goal-eval-policy
 *    reads ctx.evalRunner.runBatch + delta).
 *
 * The agent under test is the `Nl2sqlEngine` (the engine's own doc names
 * `run()` "the EVAL-RUNNER entry point"). It reuses the same logic modules as
 * production (the agent-loop path is a separate runtime); adapters bridge the
 * engine's `Llm`/`OdpsExecutor` contracts to `ctx.llm`/`ctx.query`.
 *
 * @module @deepseek-ai/dsh-eval-runner-service
 */
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Events {
    /** Emitted after an eval batch is persisted to JSONL. @mode parallel */
    'evidence/eval-run-completed'(): void
  }
}
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import { runBatch, compareDelta } from '@deepseek-ai/dsh-eval-runner'
import type {
  AgentResponder,
  AgentRespondOpts,
  AgentResponse,
  QueryExecutor,
  QueryResult,
  JudgeExecutor,
  JudgeResult,
  RunResult,
  RunConfig,
  DeltaReport,
  RunnerVerdict,
} from '@deepseek-ai/dsh-eval-runner'
import { Nl2sqlEngine, Bm25Linker } from '@deepseek-ai/dsh-nl2sql-engine'
import type {
  Llm,
  LlmGenerateArgs,
  LlmGenerateResult,
  OdpsExecutor,
  QueryOutcome as EngineQueryOutcome,
  RelationGraphLike,
  EngineConventions,
} from '@deepseek-ai/dsh-nl2sql-engine'
import type { QueryEngine, ScopeId, QueryOutcome } from '@deepseek-ai/dsh-query'
import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const name = 'eval-runner-service'
export const inject = ['llm']

export interface Config {
  /** Directory holding the eval case YAMLs (default: the K11 case set). */
  readonly caseDir?: string
  /** Directory where JSONL run results are persisted (evidence-query reads it). */
  readonly resultsDir?: string
  /** pass_k attempts per case (default 3). */
  readonly passK?: number
  /** LLM provider/model for SQL generation + judging + answering (mirrors llm-wiring-plugin). */
  readonly provider?: string
  readonly model?: string
  /** Reference date YYYYMMDD for time-param extraction (eval reproducibility). */
  readonly today?: string
}

// ── ctx.llm → engine Llm ────────────────────────────────────────────────────

/**
 * Bridges the engine's `Llm` contract to `ctx.llm.stream`. The engine builds
 * the NL2SQL generation prompt and passes it via `args.prompt` (a clean
 * improvement: the engine assembles it, the LLM consumes it — no re-derivation).
 */
class CtxLlmAdapter implements Llm {
  constructor(
    private readonly ctx: Context,
    private readonly provider: string,
    private readonly model: string,
  ) {}

  async generate(args: LlmGenerateArgs): Promise<LlmGenerateResult> {
    const prompt = args.prompt
    if (prompt === undefined || prompt.length === 0) {
      throw new Error('CtxLlmAdapter: engine did not pass a prompt; the Llm contract requires args.prompt')
    }
    const text = await this.complete(prompt)
    return { sql: text }
  }

  /** One-shot text completion via ctx.llm.stream. Exposed for the judge + answer steps. */
  async complete(prompt: string): Promise<string> {
    const assembler = new BlockAssembler()
    const options = {
      provider: this.provider,
      model: this.model,
      messages: [
        createUserMessage({
          content: [{ type: 'text' as const, text: prompt }],
          source: { kind: 'plugin' as const, plugin: 'eval-runner-service' },
        }),
      ],
    }
    for await (const chunk of this.ctx.llm.stream(options)) assembler.push(chunk)
    const text = assembler.blocks()
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text)
      .join('')
    if (text.length === 0) throw new Error('eval-runner-service: LLM returned no text blocks')
    return text
  }
}

// ── ctx.query → engine OdpsExecutor + eval-runner QueryExecutor ─────────────

/** Bridges the engine's `OdpsExecutor` (used in the NL2SQL self-correction loop) to `ctx.query`. */
class CtxOdpsAdapter implements OdpsExecutor {
  constructor(private readonly ctx: Context, private readonly scopeId: ScopeId) {}

  private engine(): QueryEngine | undefined {
    return this.ctx.get('query')
  }

  async execute(sql: string, opts?: { signal?: AbortSignal }): Promise<EngineQueryOutcome> {
    const q = this.engine()
    if (q === undefined) return { state: 'failed', failureKind: 'permission_denied', error: 'no query provider mounted', sql }
    const out = await q.execute({ sql, scopeId: this.scopeId, mode: 'fast' }, opts?.signal)
    return this.toEngineOutcome(out)
  }

  async attach(instanceId: string): Promise<EngineQueryOutcome> {
    const q = this.engine()
    if (q === undefined) return { state: 'failed', failureKind: 'permission_denied', error: 'no query provider mounted', sql: '' }
    const out = await q.attach(instanceId)
    return this.toEngineOutcome(out)
  }

  /** Map a dsh-query QueryOutcome ('completed'|'pending'|'failed', rows
   *  unknown[][], instanceId) to the engine's QueryOutcome vocabulary
   *  ('done'|'running'|'failed', rows unknown[], instance_id). The two types
   *  diverged in state names + field casing; a bare `as unknown as` cast is a
   *  no-op at runtime, so a real ctx.query provider returning state:'completed'
   *  passed through unchanged and never matched the engine's 'done'/'running'
   *  checks (every completed query fell to the failed/decline path). */
  private toEngineOutcome(out: QueryOutcome): EngineQueryOutcome {
    switch (out.state) {
      case 'completed':
        return {
          state: 'done',
          ...(out.executionMeta?.instanceId !== undefined ? { result_id: out.executionMeta.instanceId } : {}),
          ...(out.rows !== undefined ? { rows: out.rows } : {}),
          sql: out.sql,
        }
      case 'pending':
        return {
          state: 'running',
          ...(out.instanceId !== undefined ? { instance_id: out.instanceId } : {}),
          ...(out.stage !== undefined ? { stage: out.stage } : {}),
          sql: out.sql,
        }
      case 'failed':
        return {
          state: 'failed',
          ...(out.failureKind !== undefined ? { failureKind: out.failureKind } : {}),
          ...(out.error !== undefined ? { error: out.error } : {}),
          sql: out.sql,
        }
    }
  }
}

/** Bridges the eval-runner's result-match `QueryExecutor` to `ctx.query` (maps QueryOutcome → QueryResult). */
class CtxQueryExecutor implements QueryExecutor {
  constructor(private readonly ctx: Context, private readonly scopeId: ScopeId) {}

  async execute(sql: string): Promise<QueryResult> {
    const q = this.ctx.get('query')
    if (q === undefined) return { success: false, rows: [], row_count: 0, error: 'no query provider mounted' }
    let out: QueryOutcome
    try {
      out = await q.execute({ sql, scopeId: this.scopeId, mode: 'fast' })
    } catch (err) {
      return { success: false, rows: [], row_count: 0, error: err instanceof Error ? err.message : String(err) }
    }
    return this.mapOutcome(out)
  }

  private mapOutcome(out: QueryOutcome): QueryResult {
    if (out.state === 'completed') {
      const cols = out.columns ?? []
      const rows = (out.rows ?? []).map((row): Record<string, unknown> => {
        if (Array.isArray(row)) {
          return Object.fromEntries(row.map((cell, i) => [cols[i] ?? `col_${i}`, cell]))
        }
        return row
      })
      return { success: true, rows, row_count: out.rowCount ?? rows.length, error: null }
    }
    if (out.state === 'pending') {
      return { success: false, rows: [], row_count: 0, error: 'query still running' }
    }
    return { success: false, rows: [], row_count: 0, error: out.error ?? 'query failed' }
  }
}

// ── ctx.llm → eval-runner JudgeExecutor ─────────────────────────────────────

/** LLM-backed judge: scores whether the actual reply correctly answers the question (0–1). */
class LlmJudgeExecutor implements JudgeExecutor {
  constructor(private readonly llm: CtxLlmAdapter) {}

  async judge(expected: unknown, actual: string, question: string): Promise<JudgeResult> {
    const prompt = [
      'You are an eval judge for a data query agent. Score whether the agent\'s answer is acceptable given the expected answer.',
      '',
      'Evaluation rules:',
      '1. The expected answer describes the KEY POINTS a good response should cover — it is NOT the exact text the agent must produce.',
      '2. Score based on semantic alignment: does the agent\'s response address the same core points as the expected answer?',
      '3. For decline/clarification responses: award high scores if the agent (a) correctly identifies why the question cannot be answered directly, (b) explains the limitation accurately, and (c) offers useful alternatives or asks for clarification.',
      '4. Do NOT penalize for different wording, additional helpful context, or different structure — only penalize for missing key points or factual errors.',
      '',
      `Question: ${question}`,
      `Expected answer: ${JSON.stringify(expected)}`,
      `Agent answer: ${actual}`,
      '',
      'Reply with ONLY a single number between 0 and 1 (1 = fully acceptable, 0 = unacceptable).',
    ].join('\n')
    try {
      const raw = await this.llm.complete(prompt)
      const score = Number.parseFloat(raw.replace(/[^0-9.]/g, ''))
      return { score: Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0, rationale: raw.slice(0, 200) }
    } catch (err) {
      return { score: 0, rationale: '', error: err instanceof Error ? err.message : String(err) }
    }
  }
}

// ── Nl2sqlEngine-backed AgentResponder ───────────────────────────────────────

/**
 * The agent under test: wraps `Nl2sqlEngine` (link → prompt → ctx.llm SQL →
 * ctx.query execute → critic/self-correct → honest decline), then generates a
 * natural-language answer over the result rows. Returns the model-facing
 * `{reply, generated_sql, transcript}` the eval runner compares.
 */
class Nl2sqlAgentResponder implements AgentResponder {
  private readonly llm: CtxLlmAdapter
  constructor(
    private readonly ctx: Context,
    private readonly conventions: EngineConventions | null,
    private readonly scopeId: ScopeId,
    private readonly today: string,
    provider: string,
    model: string,
  ) {
    this.llm = new CtxLlmAdapter(ctx, provider, model)
  }

  async respond(question: string, opts?: AgentRespondOpts): Promise<AgentResponse> {
    const scopeId = opts?.scope_id ?? this.scopeId
    const odps = new CtxOdpsAdapter(this.ctx, scopeId)
    const schema = this.ctx.get('schema') as
      | { loadRetrievalCorpusAll?(): unknown[]; getRelationGraph?(scopeId?: string): RelationGraphLike }
      | undefined
    const corpus = (schema?.loadRetrievalCorpusAll?.() ?? []) as readonly { id: string; description?: string; payload?: unknown }[]
    const retrieval = new Bm25Linker(corpus)
    const graph = schema?.getRelationGraph?.(scopeId)
    const engine = new Nl2sqlEngine({
      llm: this.llm,
      odps,
      conventions: this.conventions,
      retrieval,
      ...(graph !== undefined ? { graph } : {}),
    })
    const result = await engine.run({ question, scopeId, today: this.today })
    const sql = result.sql ?? null
    let reply: string
    if (result.ok && result.result !== undefined) {
      reply = await this.answer(question, result.result)
    } else if (result.decline) {
      reply = `Declined: ${result.reason ?? 'unable to answer'}`
    } else if (result.pending) {
      reply = 'The query is still running; no answer yet.'
    } else {
      reply = result.reason ?? 'No answer.'
    }
    return { reply, generated_sql: sql, transcript: result.trace }
  }

  /** Generate a natural-language answer over the executed rows. */
  private async answer(question: string, rows: unknown): Promise<string> {
    const prompt = [
      'Answer the user question using ONLY the query result rows below. Be concise.',
      `Question: ${question}`,
      `Rows: ${JSON.stringify(rows).slice(0, 4000)}`,
    ].join('\n')
    try {
      return await this.llm.complete(prompt)
    } catch {
      // answer-gen LLM call failed; degrade to raw rows so the case still scores.
      return JSON.stringify(rows).slice(0, 1000)
    }
  }
}

// ── JSONL persistence bridge (RunResult → evidence-query record format) ─────

/** One persisted JSONL line — the shape `FileBackedEvalResultStore` parses. */
interface PersistedCaseRecord {
  readonly runId: string
  readonly timestamp: string
  readonly caseId: string
  readonly outcome: string
  readonly verdict: string
  readonly passed: boolean
  readonly passK: number
  readonly latencyMs: number
  readonly attemptsCount: number
  readonly errorsCount: number
}

/** Map a runner verdict to an eval-core outcome string (infra_failure → unjudged). */
function verdictToOutcome(v: RunnerVerdict): string {
  if (v === 'infra_failure') return 'unjudged'
  return v
}

/**
 * Persist a RunResult as JSONL in the format evidence-query's
 * `FileBackedEvalResultStore` reads. This IS the W3→W4 format bridge (the
 * eval-runner RunResult and the evidence-query record differ in shape).
 */
function persistRunResultJsonl(result: RunResult, dir: string, passK: number): string {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const safeTimestamp = result.timestamp.replace(/[:.]/g, '-')
  const path = join(dir, `${safeTimestamp}_${result.run_id}.jsonl`)
  const lines = result.cases.map((c): PersistedCaseRecord => ({
    runId: result.run_id,
    timestamp: result.timestamp,
    caseId: c.case_id,
    outcome: verdictToOutcome(c.verdict),
    verdict: c.verdict,
    passed: c.verdict === 'correct',
    passK,
    latencyMs: c.latency_ms,
    attemptsCount: c.pass_k_results.length,
    errorsCount: c.pass_k_results.filter(a => a.infra_error !== undefined || a.error !== undefined).length,
  }))
  writeFileSync(path, lines.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8')
  return path
}

// ── EvalRunnerService ───────────────────────────────────────────────────────

/**
 * The Cordis Service owning `ctx.evalRunner`. Wires the real NL2SQL engine +
 * ctx.query + ctx.llm collaborators, persists JSONL, and tracks last/last-two
 * runs. Structurally satisfies the `EvalRunnerService` seam declared by
 * `dsh-tool-trigger-eval` (duck-typed via `ctx.get('evalRunner')`).
 */
export class EvalRunnerService extends Service {
  private readonly caseDir: string
  private readonly resultsDir: string
  private readonly passK: number
  private readonly provider: string
  private readonly model: string
  private readonly today: string
  private lastRun: RunResult | null = null

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'evalRunner')
    this.caseDir = config.caseDir ?? 'packages/eval/eval/cases/k11'
    this.resultsDir = config.resultsDir ?? '.tmp/eval-results'
    this.passK = config.passK ?? 3
    // R8 (PB-COMPLY): no silent vendor default — '' is a non-runnable sentinel;
    // runBatch fails loud if provider/model were not explicitly configured.
    this.provider = config.provider ?? ''
    this.model = config.model ?? ''
    this.today = config.today ?? '20260825'
  }

  /** Case file paths (sorted) under the configured case dir. */
  private casePaths(): string[] {
    if (!existsSync(this.caseDir)) return []
    return readdirSync(this.caseDir)
      .filter(f => /^k11_\d+\.yaml$/.test(f))
      .sort()
      .map(f => resolve(this.caseDir, f))
  }

  getCaseCount(): number {
    return this.casePaths().length
  }

  getResultsDir(): string {
    return this.resultsDir
  }

  /** Build the collaborators from the live ctx seams. */
  private buildCollaborators(scopeId: ScopeId): { agent: AgentResponder; executor: QueryExecutor | null; judge: JudgeExecutor | null } {
    // D2 (GA-GT1 Phase 6): thread scopeId to getConventions so the per-call
    // resolution honors the active scope (dormant seam — current providers
    // ignore scopeId, but the wiring is in place for a future per-scope engine
    // mapping without a service rebuild).
    const conventions = (this.ctx.get('nl2sql') as { getConventions?(scopeId?: string): EngineConventions } | undefined)?.getConventions?.(scopeId) ?? null
    const agent = new Nl2sqlAgentResponder(this.ctx, conventions, scopeId, this.today, this.provider, this.model)
    const executor = this.ctx.get('query') !== undefined ? new CtxQueryExecutor(this.ctx, scopeId) : null
    const judge = new LlmJudgeExecutor(new CtxLlmAdapter(this.ctx, this.provider, this.model))
    return { agent, executor, judge }
  }

  async runBatch(options?: { runId?: string; skipHealthGate?: boolean; scopeId?: string }): Promise<RunResult> {
    const paths = this.casePaths()
    if (paths.length === 0) {
      throw new Error(`eval-runner-service: no cases found in ${this.caseDir}`)
    }
    // D3ii: no default pointer — explicit scopeId required, fail-loud when
    // absent rather than silently falling back to a hardcoded 'k11'.
    if (options?.scopeId === undefined) {
      throw new Error('eval-runner-service runBatch: explicit scopeId required (D3ii: no default pointer)')
    }
    // R8 (PB-COMPLY): the eval LLM gateway (provider/model) must be explicitly
    // configured in cordis.yml — fail loud at runBatch (the earliest resolvable
    // point that doesn't break mechanics tests, which don't call runBatch) rather
    // than silently running with a vendor default.
    if (!this.provider || !this.model) {
      throw new Error('eval-runner-service runBatch: provider and model are required (R8: configure the eval LLM gateway in cordis.yml; no silent vendor default)')
    }
    const scopeId = options.scopeId
    const { agent, executor, judge } = this.buildCollaborators(scopeId)
    // GA-EVAL-REBASELINE item 4: stamp the run's protocol/semantics/concurrency/
    // model onto the artifact so a contaminated/mis-attributed run is detectable
    // from its JSON alone. The service has fixed engine-mode semantics
    // (Nl2sqlAgentResponder, no SQL semantic judge, no query expansion); the
    // runtime-dependent with_query reflects whether ctx.query is mounted.
    const skipHealthGate = options.skipHealthGate ?? false
    const runConfig: RunConfig = {
      provider: this.provider,
      model: this.model,
      pass_k: this.passK,
      concurrency: 1,
      sql_judge: false,
      verdict_semantics: 'pass^k',
      responder: 'engine',
      scope_id: scopeId,
      today: this.today,
      query_expansion: false,
      with_query: this.ctx.get('query') !== undefined,
      skip_health_gate: skipHealthGate,
    }
    const result = await runBatch(paths, { agent, executor, judge }, {
      pass_k: this.passK,
      skip_health_gate: skipHealthGate,
      ...(options.runId !== undefined ? { run_id: options.runId } : {}),
      config: runConfig,
    })
    // Persist JSONL (the W3→W4 bridge) so evidence-query + goal-eval-policy read it.
    persistRunResultJsonl(result, this.resultsDir, this.passK)
    this.ctx.emit('evidence/eval-run-completed')
    this.lastRun = result
    return result
  }

  getLastRun(): RunResult | null {
    return this.lastRun
  }

  computeDelta(runA: RunResult, runB: RunResult): DeltaReport {
    return compareDelta(runA, runB)
  }
}

/** Plugin apply: mount the Service onto ctx.evalRunner. */
export function apply(ctx: Context, config: Config = {}): void {
  new EvalRunnerService(ctx, config)
}
