/**
 * Programmatic Cordis context for the eval CLI.
 *
 * Boots a mini context with ctx.llm (LlmRuntime + llm-dashscope) and
 * ctx.schema (SemanticLayerService), then builds eval-runner Collaborators
 * by forking the adapter classes from eval-runner-service (D1: "复用/fork").
 *
 * When --with-query is set, also mounts ctx.credentials (EnvCredentialProvider)
 * and ctx.query (MaxComputeQueryEngine) for real SQL execution.
 */
import { Context } from '@deepseek-ai/cordis'
import { LlmRuntime, BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import * as llmDashscope from '@deepseek-ai/dsh-llm-dashscope'
import { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer'
import { Nl2sqlEngine, Bm25Linker, StandInOdps } from '@deepseek-ai/dsh-nl2sql-engine'

import type {
  Llm,
  LlmGenerateArgs,
  LlmGenerateResult,
  OdpsExecutor,
  QueryOutcome as EngineQueryOutcome,
  RelationGraphLike,
} from '@deepseek-ai/dsh-nl2sql-engine'
import type {
  AgentResponder,
  AgentRespondOpts,
  AgentResponse,
  QueryExecutor,
  QueryResult,
  JudgeExecutor,
  JudgeResult,
  Collaborators,
  SqlSemanticJudge,
} from '@deepseek-ai/dsh-eval-runner'
import { LlmSqlSemanticJudge } from '@deepseek-ai/dsh-eval-runner'

export interface BootOptions {
  readonly schemaDir: string
  readonly provider: string
  readonly model: string
  readonly today: string
  readonly withQuery: boolean
  readonly sidecarPath?: string
  readonly noSqlJudge?: boolean
  readonly queryExpansion?: boolean
}

export interface BootResult {
  readonly ctx: Context
  readonly collaborators: Collaborators
}

// ── ctx.llm → engine Llm (forked from eval-runner-service) ──────────────

function looksLikeSql(text: string): boolean {
  const upper = text.trim().toUpperCase()
  return /^\s*(SELECT|WITH|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/.test(upper)
}

class CtxLlmAdapter implements Llm {
  constructor(
    private readonly ctx: Context,
    private readonly provider: string,
    private readonly model: string,
  ) {}

  async generate(args: LlmGenerateArgs): Promise<LlmGenerateResult> {
    const prompt = args.prompt
    if (prompt === undefined || prompt.length === 0) {
      throw new Error('CtxLlmAdapter: engine did not pass a prompt')
    }
    const { text, reasoning } = await this.completeWithReasoning(prompt)
    return { sql: text, reasoning }
  }

  async completeText(prompt: string): Promise<string> {
    const { text } = await this.completeWithReasoning(prompt)
    return text
  }

  async completeWithReasoning(prompt: string): Promise<{ text: string; reasoning: string | null }> {
    const assembler = new BlockAssembler()
    const options = {
      provider: this.provider,
      model: this.model,
      messages: [
        createUserMessage({
          content: [{ type: 'text' as const, text: prompt }],
          source: { kind: 'plugin' as const, plugin: 'eval-cli' },
        }),
      ],
    }
    for await (const chunk of this.ctx.llm.stream(options)) assembler.push(chunk)
    const blocks = assembler.blocks()
    const textContent = blocks
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text)
      .join('')
    const reasoning = blocks
      .filter((b): b is { type: 'reasoning'; text: string } => b.type === 'reasoning')
      .map(b => b.text)
      .join('') || null

    // Thinking models often put SQL in reasoning and conversational text in content.
    // Prefer SQL from reasoning when text doesn't look like SQL.
    if (textContent.length > 0) {
      if (looksLikeSql(textContent)) return { text: textContent, reasoning }
      // Text is conversational — check if reasoning has SQL
      if (reasoning) {
        const fenced = reasoning.match(/```sql\n([\s\S]*?)```/)
        if (fenced && fenced[1] !== undefined) return { text: fenced[1], reasoning }
        if (looksLikeSql(reasoning)) return { text: reasoning, reasoning }
      }
      return { text: textContent, reasoning }
    }

    // No text content — extract SQL from reasoning
    if (reasoning) {
      const fenced = reasoning.match(/```sql\n([\s\S]*?)```/)
      if (fenced && fenced[1] !== undefined) return { text: fenced[1], reasoning }
      return { text: reasoning, reasoning }
    }

    // Empty response: degrade gracefully — the eval runner will naturally score
    // this as execution_match=false / delivery_match=false.
    console.warn('eval-cli: LLM returned no content (no text blocks, no reasoning)')
    return { text: '', reasoning: null }
  }
}

// ── ctx.query → engine OdpsExecutor (forked from eval-runner-service) ────

class CtxOdpsAdapter implements OdpsExecutor {
  constructor(private readonly ctx: Context) {}

  private engine(): { execute(req: unknown, signal?: AbortSignal): Promise<unknown>; attach(id: unknown): Promise<unknown> } | undefined {
    return this.ctx.get('query') as { execute(req: unknown, signal?: AbortSignal): Promise<unknown>; attach(id: unknown): Promise<unknown> } | undefined
  }

  async execute(sql: string, opts?: { signal?: AbortSignal }): Promise<EngineQueryOutcome> {
    const q = this.engine()
    if (q === undefined) return { state: 'failed', failureKind: 'permission_denied', error: 'no query provider mounted', sql } as unknown as EngineQueryOutcome
    const out = await q.execute({ sql, scopeId: 'k11', mode: 'fast' }, opts?.signal)
    return out as unknown as EngineQueryOutcome
  }

  async attach(instanceId: string): Promise<EngineQueryOutcome> {
    const q = this.engine()
    if (q === undefined) return { state: 'failed', failureKind: 'permission_denied', error: 'no query provider mounted', sql: '' } as unknown as EngineQueryOutcome
    const out = await q.attach(instanceId)
    return out as unknown as EngineQueryOutcome
  }
}

// ── ctx.query → eval-runner QueryExecutor (forked from eval-runner-service) ──

class CtxQueryExecutor implements QueryExecutor {
  constructor(private readonly ctx: Context) {}

  async execute(sql: string): Promise<QueryResult> {
    const q = this.ctx.get('query') as { execute(req: unknown): Promise<unknown> } | undefined
    if (q === undefined) return { success: false, rows: [], row_count: 0, error: 'no query provider mounted' }
    let out: Record<string, unknown>
    try {
      out = await q.execute({ sql, scopeId: 'k11', mode: 'fast' }) as Record<string, unknown>
    } catch (err) {
      return { success: false, rows: [], row_count: 0, error: err instanceof Error ? err.message : String(err) }
    }
    if (out.state === 'done' || out.state === 'completed') {
      const rows = (out.rows ?? []) as Record<string, unknown>[]
      return { success: true, rows, row_count: rows.length, error: null }
    }
    return { success: false, rows: [], row_count: 0, error: (out.error as string) ?? 'query failed' }
  }
}

// ── ctx.llm → eval-runner JudgeExecutor ─────────────────────────────────

class LlmJudgeExecutor implements JudgeExecutor {
  constructor(private readonly llm: CtxLlmAdapter) {}

  async judge(expected: unknown, actual: string, question: string): Promise<JudgeResult> {
    const prompt = [
      'You are an eval judge. Score whether the agent\'s answer correctly answers the user question, given the expected answer.',
      `Question: ${question}`,
      `Expected answer: ${JSON.stringify(expected)}`,
      `Agent answer: ${actual}`,
      'Reply with ONLY a single number between 0 and 1 (1 = fully correct, 0 = wrong).',
    ].join('\n')
    try {
      const raw = await this.llm.completeText(prompt)
      const score = Number.parseFloat(raw.replace(/[^0-9.]/g, ''))
      return { score: Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0, rationale: raw.slice(0, 200) }
    } catch (err) {
      return { score: 0, rationale: '', error: err instanceof Error ? err.message : String(err) }
    }
  }
}

// ── P15a: LLM query expansion ────────────────────────────────────────────

const EXPANSION_SYSTEM_PROMPT =
  '你是一个游戏数据分析数据仓库的搜索查询扩展器。'
  + '将用户问题改写为适合BM25检索的扩展query，用于匹配DWS宽表名和字段名。'
  + '规则：保留原词 + 补充缩写全称 + 中文同义词 + 数仓表名/字段名片段（snake_case英文）。'
  + '重点：生成可能出现在表名或字段名中的英文短语片段。'
  + '只输出一行空格分隔的关键词，不要解释。\n'
  + '示例：\n'
  + '用户：ARPPU是多少\n'
  + '输出：ARPPU ARPU 人均付费 付费人均收入 累计付费账号 pay_amt acc_summary 付费金额 账号汇总 paying\n'
  + '用户：昨天有多少场PVP对战\n'
  + '输出：PVP 对战 pvp_score 对战场次 竞技 积分变化 每日 角色 score 玩法 段位\n'
  + '用户：钻石的总产出量\n'
  + '输出：钻石 产出量 物品流水 资源产销 item_circle 道具 产出 get_amt 物品产出 物品类型\n'
  + '用户：大R用户有多少\n'
  + '输出：大R 大R玩家 大R付费账号 高付费 重度付费 big_r pay_order 付费订单 累计付费 高消费'

async function expandQuery(ctx: Context, question: string): Promise<string> {
  const llm = ctx.get('llm') as { stream?(options: unknown): AsyncIterable<unknown> } | undefined
  if (llm === undefined || typeof llm.stream !== 'function') return question
  try {
    const assembler = new BlockAssembler()
    const options = {
      provider: 'aga',
      model: 'qwen-flash',
      system: EXPANSION_SYSTEM_PROMPT,
      temperature: 0.1,
      maxTokens: 200,
      messages: [
        createUserMessage({
          content: [{ type: 'text' as const, text: question }],
          source: { kind: 'plugin' as const, plugin: 'eval-cli' },
        }),
      ],
    }
    for await (const chunk of llm.stream(options) as AsyncIterable<import('@deepseek-ai/dsh-llm').StreamChunk>) {
      assembler.push(chunk)
    }
    const blocks = assembler.blocks()
    const text = blocks
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()
      .replace(/\n/g, ' ')
    return text.length > 0 ? text : question
  } catch {
    return question
  }
}

// ── Nl2sqlEngine-backed AgentResponder ───────────────────────────────────

class Nl2sqlAgentResponder implements AgentResponder {
  private readonly llm: CtxLlmAdapter
  private readonly odps: OdpsExecutor
  private readonly queryExpansionEnabled: boolean

  constructor(
    private readonly ctx: Context,
    private readonly today: string,
    provider: string,
    model: string,
    withQuery: boolean,
    queryExpansion: boolean = true,
  ) {
    this.llm = new CtxLlmAdapter(ctx, provider, model)
    this.odps = withQuery ? new CtxOdpsAdapter(ctx) : new StandInOdps()
    this.queryExpansionEnabled = queryExpansion
  }

  async respond(question: string, _opts?: AgentRespondOpts): Promise<AgentResponse> {
    const schema = this.ctx.get('schema') as
      | { loadRetrievalCorpusAll?(): unknown[]; getRelationGraph?(): RelationGraphLike }
      | undefined
    const corpus = (schema?.loadRetrievalCorpusAll?.() ?? []) as readonly { id: string; description?: string; payload?: unknown }[]
    const baseLinker = new Bm25Linker(corpus)
    const graph = schema?.getRelationGraph?.()

    // P15a: expand query for BM25 retrieval (engine uses question for both
    // prompting and retrieval; wrap the linker so only retrieval sees the
    // expanded form).
    const expandedQuestion = this.queryExpansionEnabled
      ? await expandQuery(this.ctx, question)
      : question
    const retrieval: typeof baseLinker = expandedQuestion !== question
      ? { retrieve: (_q, opts) => baseLinker.retrieve(expandedQuestion, opts) } as typeof baseLinker
      : baseLinker

    const lookupDoc = (id: string) => corpus.find(d => d.id === id) as import('@deepseek-ai/dsh-nl2sql-engine').DataSourceDoc | undefined
    const engine = new Nl2sqlEngine({
      llm: this.llm,
      odps: this.odps,
      conventions: null,
      retrieval,
      lookupDoc,
      ...(graph !== undefined ? { graph } : {}),
    })

    const result = await engine.run({ question, today: this.today, evalMode: true })
    const sql = result.sql ?? null
    console.error(`[DIAG] SQL: ${sql?.slice(0, 400) ?? '(none)'}`)
    console.error(`[DIAG] ok=${result.ok} decline=${result.decline} rows=${Array.isArray(result.result) ? result.result.length : '?'}`)
    let reply: string
    if (result.ok && result.result !== undefined) {
      reply = await this.llm.completeText([
        'Answer the user question using ONLY the query result rows below. Be concise.',
        `Question: ${question}`,
        `Rows: ${JSON.stringify(result.result).slice(0, 4000)}`,
      ].join('\n'))
    } else if (result.decline) {
      reply = `Declined: ${result.reason ?? 'unable to answer'}`
    } else if (result.pending) {
      reply = 'The query is still running; no answer yet.'
    } else {
      reply = result.reason ?? 'No answer.'
    }
    // Build schema context from retrieved candidates for SQL semantic judge
    const schemaContext = this.buildSchemaContext(result.trace, corpus)
    return { reply, generated_sql: sql, transcript: result.trace, schema_context: schemaContext }
  }

  private buildSchemaContext(
    trace: readonly Record<string, unknown>[],
    corpus: readonly { id: string; description?: string; payload?: unknown }[],
  ): string {
    const linkingStep = trace.find(e => e.step === 'bm25_linking') as { candidates?: Array<{ id: string }> } | undefined
    if (!linkingStep?.candidates?.length) return '(no candidates)'
    const candidateIds = linkingStep.candidates.map(c => c.id)
    const lines: string[] = []
    for (const cid of candidateIds) {
      const item = corpus.find(c => c.id === cid)
      if (!item) { lines.push(`- ${cid}: (not found in corpus)`); continue }
      const payload = item.payload as Record<string, unknown> | undefined
      let detail = ''

      if (payload?.columns && Array.isArray(payload.columns)) {
        // Table corpus item: extract structured column info
        type TablePayload = {
          table_comment?: string
          description?: string
          granularity?: string
          columns: Array<{ name: string; type?: string; comment?: string; role?: string }>
        }
        const tableDef = payload as TablePayload
        detail = tableDef.table_comment ?? tableDef.description ?? cid
        if (tableDef.granularity) detail += ` [粒度: ${tableDef.granularity}]`
        const cols = tableDef.columns
          .map(c => `${c.name}(${c.type ?? '?'}${c.comment ? ', ' + c.comment : ''})`)
          .join('; ')
        detail += `\n  columns: ${cols}`
      } else if (payload?.params_fields && typeof payload.params_fields === 'object') {
        // Event corpus item: extract params_fields
        detail = item.description ?? cid
        const fields = Object.entries(payload.params_fields as Record<string, { description?: string }>)
          .map(([name, def]) => `${name}${def.description ? ' (' + def.description + ')' : ''}`)
          .join(', ')
        detail += ` | fields: ${fields}`
      } else {
        detail = item.description ?? cid
      }
      lines.push(`- ${cid}: ${detail}`)
    }
    return lines.join('\n')
  }
}

// ── Boot ────────────────────────────────────────────────────────────────

export async function boot(opts: BootOptions): Promise<BootResult> {
  const ctx = new Context()

  // 1. Mount LlmRuntime → provides ctx.llm
  await ctx.plugin(LlmRuntime)

  // 2. Mount llm-dashscope → registers the 'aga' provider route on ctx.llm
  await ctx.plugin(llmDashscope)

  // 3. Mount SemanticLayerService → provides ctx.schema
  await ctx.plugin(SemanticLayerService, { semanticRoot: opts.schemaDir, scopeId: 'k11' })

  // 4. Optionally mount query-maxcompute → provides ctx.query
  if (opts.withQuery) {
    const { CredentialProvider } = await import('@deepseek-ai/dsh-credentials')
    const { MaxComputeQueryEngine } = await import('@deepseek-ai/dsh-query-maxcompute')

    // Env-based credential provider: reads ODPS_* from process.env
    class EnvCredentialProvider extends CredentialProvider {
      resolve(ref: unknown): Promise<{ value: string; source: string } | undefined> {
        const name = String(ref)
        const value = process.env[name]
        return Promise.resolve(value ? { value, source: 'env' } : undefined)
      }
      describe(ref: unknown): Promise<{ configured: boolean; writable: boolean }> {
        return Promise.resolve({ configured: !!process.env[String(ref)], writable: false })
      }
      set(): Promise<void> { return Promise.reject(new Error('env credentials are read-only')) }
      unset(): Promise<void> { return Promise.reject(new Error('env credentials are read-only')) }
    }

    await ctx.plugin(EnvCredentialProvider)

    const sidecarPath = opts.sidecarPath ?? new URL('../../../query/query-maxcompute/dev/standin-sidecar.mjs', import.meta.url).pathname
    const fiber = ctx.plugin(MaxComputeQueryEngine, { args: [sidecarPath], credMode: 'sidecar-self' })
    await fiber
    // Wait for the sidecar to be ready
    const qe = ctx.query as { start?(): Promise<void> }
    if (qe?.start) await qe.start()

    console.log('  Query engine mounted (sidecar ready)')
  }

  // 5. Build Collaborators
  const llmAdapter = new CtxLlmAdapter(ctx, opts.provider, opts.model)
  const agent = new Nl2sqlAgentResponder(ctx, opts.today, opts.provider, opts.model, opts.withQuery, opts.queryExpansion !== false)
  const judge = new LlmJudgeExecutor(llmAdapter)
  const executor = opts.withQuery ? new CtxQueryExecutor(ctx) : null

  // 6. SQL Semantic Judge (enabled by default when no executor)
  let sqlJudge: SqlSemanticJudge | null = null
  if (!opts.noSqlJudge) {
    sqlJudge = new LlmSqlSemanticJudge(prompt => llmAdapter.completeText(prompt))
  }

  return { ctx, collaborators: { agent, judge, executor, sqlJudge } }
}
