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
import { buildPrompt, type EventDefinitionLite } from './prompt.ts'
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

export type EngineTraceEntry = Readonly<Record<string, unknown>>

export interface EngineDeps {
  readonly dataSources?: readonly DataSourceDoc[]
  readonly llm: Llm
  readonly odps: OdpsExecutor
  readonly conventions?: EngineConventions | null
  /** Injectable retrieval (Q1: default is the in-process `Bm25Linker`; swap to P5 `ctx.retrieval` when P5b ships). */
  readonly retrieval?: RetrievalLinker
}

export interface EngineRunArgs {
  readonly question: string
  readonly eventDef?: EventDefinitionLite | null
  readonly scopeId?: string
}

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

export class Nl2sqlEngine {
  private readonly retrieval: RetrievalLinker
  private readonly llm: Llm
  private readonly odps: OdpsExecutor
  private readonly conventions: EngineConventions | null

  constructor(deps: EngineDeps) {
    this.retrieval = deps.retrieval ?? new Bm25Linker(deps.dataSources ?? [])
    this.llm = deps.llm
    this.odps = deps.odps
    this.conventions = deps.conventions ?? loadConventions('maxcompute')
  }

  /** One NL→SQL run with execution-feedback self-correction. */
  async run({ question, eventDef }: EngineRunArgs): Promise<EngineRunResult> {
    const nearDup = new NearDupGate()
    const trace: EngineTraceEntry[] = []

    // 1. BM25 schema-linking (local RetrievalLinker; P5 ctx.retrieval seam when P5b ships)
    const candidates = this.retrieval.retrieve(question, { topK: 5, mode: 'bm25-only' })
    trace.push({
      step: 'bm25_linking',
      candidates: candidates.map(c => ({ id: c.id, score: Number(c.score).toFixed(3) })),
    })

    // critic ctx: candidate tables + event params + partition cols (from P6 substrate; not from conventions)
    const partitionCols = eventDef?.partitions?.map(p => p.name) ?? ['ds']
    const ctx = makeCriticCtx({
      candidateTables: candidates.map(c => c.id),
      eventParams: eventDef?.params_fields ?? {},
      partitionCols,
    })

    let attempt = 0
    let lastFeedback: LlmFeedback | null = null
    while (attempt <= MAX_FEEDBACK_RETRIES) {
      // 2. prompt + 3. LLM generate
      const prompt = buildPrompt({ question, candidates, eventDef, conventions: this.conventions, phase: 'generation' })
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
