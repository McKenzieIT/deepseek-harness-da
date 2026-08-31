/**
 * LLM-powered query expansion for BM25 retrieval. Rewrites a natural-language
 * question into a broader BM25-friendly form: original terms + abbreviation
 * expansions + Chinese synonyms + field naming conventions.
 *
 * Graceful degradation: returns the original question on any LLM failure.
 */
import type { Context } from '@deepseek-ai/cordis'
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'

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

/**
 * Resolve the enrichment LLM provider/model from explicit opts, falling back
 * to the deployment env-var contract (`ENRICHMENT_LLM_PROVIDER` /
 * `ENRICHMENT_LLM_MODEL`). Throws when neither opts nor env supplies both
 * values — fail-loud instead of silently falling back to a vendor default.
 *
 * CL8 centralization: this exact resolver (env-var names + error message) is
 * duplicated locally in `eval-cli/src/main.ts` and
 * `semantic-layer/src/llm-wiring-plugin.ts` — the shared contract is the
 * env-var names + error message, not shared code (no new cross-package dep).
 */
function resolveEnrichmentLlmConfig(
  input: { provider?: string | undefined; model?: string | undefined },
): { provider: string; model: string } {
  const provider = input.provider || process.env.ENRICHMENT_LLM_PROVIDER || ''
  const model = input.model || process.env.ENRICHMENT_LLM_MODEL || ''
  if (!provider || !model) {
    throw new Error('enrichment-llm-wiring: no provider/model configured')
  }
  return { provider, model }
}

/** Options for {@link expandQuery}. */
export interface ExpandQueryOptions {
  /** LLM provider route for the expansion call (env `ENRICHMENT_LLM_PROVIDER`
   * when omitted; throws if unconfigured — no silent vendor fallback). */
  readonly provider?: string | undefined
  /** LLM model id for the expansion call (env `ENRICHMENT_LLM_MODEL` when
   * omitted; throws if unconfigured — no silent vendor fallback). */
  readonly model?: string | undefined
  /** Caller cancellation forwarded to the LLM stream so an abort halts the
   * auxiliary expansion round-trip, not just the boundary check in `execute`. */
  readonly signal?: AbortSignal
}

/**
 * Expand a natural-language question into a BM25-friendly query using ctx.llm.
 *
 * @param ctx - Cordis context soft-probed for `ctx.llm` (returns the original
 * `question` when no LLM provider is mounted).
 * @param question - the natural-language data question to expand for BM25 recall.
 * @param opts - deployment-varying LLM route (`provider`/`model`) and the caller
 * abort `signal` forwarded into the LLM stream.
 * @returns the expanded BM25-friendly query, or the original `question` when
 * `ctx.llm` is unavailable or on a runtime LLM stream error (graceful
 * degradation).
 * @throws {Error} `enrichment-llm-wiring: no provider/model configured` when
 * `ctx.llm` IS mounted but neither `opts` nor the `ENRICHMENT_LLM_*` env vars
 * supply both provider and model (CL8: fail-loud, no silent vendor fallback).
 * Callers wrap the call to degrade gracefully (see `index.ts` execute).
 */
export async function expandQuery(
  ctx: Context,
  question: string,
  opts: ExpandQueryOptions = {},
): Promise<string> {
  const llm = ctx.get('llm') as { stream?(options: unknown): AsyncIterable<unknown> } | undefined
  if (llm === undefined || typeof llm.stream !== 'function') return question

  // CL8: resolve provider/model from opts → env-var contract. Throws when
  // unconfigured (no silent 'aga'/'qwen-flash' fallback). The throw propagates
  // to the caller — callers wrap the call to degrade gracefully (see
  // tool-search-data-sources/src/index.ts execute). Placed AFTER the ctx.llm
  // probe so "no LLM mounted" still degrades without needing provider/model.
  const { provider, model } = resolveEnrichmentLlmConfig({ provider: opts.provider, model: opts.model })

  try {
    const assembler = new BlockAssembler()
    const options = {
      provider,
      model,
      system: EXPANSION_SYSTEM_PROMPT,
      temperature: 0.1,
      maxTokens: 200,
      signal: opts.signal,
      messages: [
        createUserMessage({
          content: [{ type: 'text' as const, text: question }],
          source: { kind: 'plugin' as const, plugin: 'tool-search-data-sources' },
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
