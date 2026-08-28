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

const DEFAULT_EXPANSION_MODEL = 'qwen-flash'
const DEFAULT_EXPANSION_PROVIDER = 'aga'

/** Options for {@link expandQuery}. */
export interface ExpandQueryOptions {
  /** LLM provider route for the expansion call (defaults to `aga`). */
  readonly provider?: string | undefined
  /** LLM model id for the expansion call (defaults to `qwen-flash`). */
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
 * `ctx.llm` is unavailable or on any error (graceful degradation).
 */
export async function expandQuery(
  ctx: Context,
  question: string,
  opts: ExpandQueryOptions = {},
): Promise<string> {
  const llm = ctx.get('llm') as { stream?(options: unknown): AsyncIterable<unknown> } | undefined
  if (llm === undefined || typeof llm.stream !== 'function') return question

  try {
    const assembler = new BlockAssembler()
    const options = {
      provider: opts.provider ?? DEFAULT_EXPANSION_PROVIDER,
      model: opts.model ?? DEFAULT_EXPANSION_MODEL,
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
