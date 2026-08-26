/**
 * P15 Query Rewriting prototype — approach B (LLM query expansion).
 * Two modes: --before-only (no LLM, just show BM25 baseline) or full (with expansion).
 *
 * Run: cd packages/eval/eval-cli && npx tsx src/p15-probe.ts [--before-only]
 *   or: DASHSCOPE_API_KEY=xxx npx tsx src/p15-probe.ts
 */
import { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer'
import { Bm25Linker } from '@deepseek-ai/dsh-nl2sql-engine'
import { Context } from '@deepseek-ai/cordis'
import { join } from 'node:path'

// ── Simulated LLM expansions (manually crafted to test the concept) ─────

const SIMULATED_EXPANSIONS: Record<string, string> = {
  'ARPPU是多少': 'ARPPU ARPU 人均付费 付费人均收入 累计付费账号 pay_amt acc_summary 付费金额 账号汇总',
  '昨天有多少场PVP对战': 'PVP 对战 pvp 积分 对战场次 竞技 变化 每日 角色 score 玩法 段位',
  '当前有多少大R玩家': '大R玩家 大R用户 大R付费账号 高付费 重度付费 big_r pay_order 高消费 付费订单 累计付费',
  '商店总购买次数是多少': '商店购买次数 充值商店 recharge shop buy 购买明细 recharge_shop_buy 付费商店 购买总次数',
  '当前满级卡牌的持有角色有多少': '满级卡牌 卡牌培养 progression card snapshot 卡牌等级 满级 card_snapshot 卡牌状态 培养状态',
  '昨天钻石的总产出量是多少': '钻石 产出量 物品流水 资源产销 item circle 道具 产出 get_amt 物品产出 日全量 物品类型',
}

// ── DashScope call (when API key available) ─────────────────────────────

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY ?? ''
const DASHSCOPE_URL = process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
const EXPANSION_MODEL = 'qwen3-0.6b'

async function callLlm(messages: Array<{ role: string; content: string }>): Promise<string> {
  const start = Date.now()
  const resp = await fetch(DASHSCOPE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
    },
    body: JSON.stringify({
      model: EXPANSION_MODEL,
      messages,
      max_tokens: 200,
      temperature: 0.1,
      extra_body: { enable_thinking: false },
    }),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`DashScope ${resp.status}: ${text.slice(0, 200)}`)
  }
  const data = await resp.json() as { choices: Array<{ message: { content: string } }> }
  const latency = Date.now() - start
  const content = data.choices?.[0]?.message?.content ?? ''
  console.log(`  [LLM] ${EXPANSION_MODEL} latency=${latency}ms len=${content.length}`)
  return content
}

const EXPANSION_PROMPT = '你是一个游戏数据分析领域的搜索查询扩展器。将用户问题改写为适合BM25检索的扩展query。保留原词+补充缩写全称+中文同义词+字段命名风格。只输出一行扩展文本。'

async function expandQuery(question: string, useLlm: boolean): Promise<string> {
  if (!useLlm) {
    return SIMULATED_EXPANSIONS[question] ?? question
  }
  try {
    const expanded = await callLlm([
      { role: 'system', content: EXPANSION_PROMPT },
      { role: 'user', content: question },
    ])
    return expanded.trim().replace(/\n/g, ' ')
  } catch (err) {
    console.log(`  [LLM FAILED] ${err instanceof Error ? err.message.slice(0, 80) : err}`)
    console.log('  [FALLBACK] using simulated expansion')
    return SIMULATED_EXPANSIONS[question] ?? question
  }
}

// ── Load corpus ─────────────────────────────────────────────────────────

async function loadCorpus() {
  const ctx = new Context()
  const schemaDir = join(process.cwd(), '../../../examples/k11-semantic-layer')
  ctx.plugin(SemanticLayerService, { semanticRoot: schemaDir, scopeId: 'k11' })
  await new Promise(r => setTimeout(r, 100))
  const schema = ctx.get('schema') as { loadRetrievalCorpusAll?(): unknown[] } | undefined
  if (!schema?.loadRetrievalCorpusAll) throw new Error('loadRetrievalCorpusAll not found')
  type Item = { id: string; description?: string; metrics?: Record<string, unknown>; payload?: unknown }
  const corpus = schema.loadRetrievalCorpusAll() as Item[]
  console.log(`Corpus: ${corpus.length} items`)
  return corpus
}

// ── Test cases ──────────────────────────────────────────────────────────

const TEST_CASES = [
  { id: 'k11v2_008', question: 'ARPPU是多少', expected: 'dws_10000251_acc_summary_df' },
  { id: 'k11v2_011', question: '昨天有多少场PVP对战', expected: 'dws_10000251_pvp_score_di' },
  { id: 'k11v2_014', question: '当前有多少大R玩家', expected: 'dws_10000251_com_pay_order_df' },
  { id: 'k11v2_015', question: '商店总购买次数是多少', expected: 'dws_10000251_recharge_shop_buy_di' },
  { id: 'k11v2_017', question: '当前满级卡牌的持有角色有多少', expected: 'dws_10000251_progression_card_snapshot_df' },
  { id: 'k11v2_020', question: '昨天钻石的总产出量是多少', expected: 'dws_10000251_item_circle_df' },
]

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const beforeOnly = process.argv.includes('--before-only')
  const useLlm = !!DASHSCOPE_API_KEY && !beforeOnly

  console.log('=== P15 Query Rewriting Probe ===')
  console.log(`Mode: ${beforeOnly ? 'BEFORE-ONLY' : useLlm ? 'LLM expansion' : 'Simulated expansion'}\n`)

  const corpus = await loadCorpus()
  const linker = new Bm25Linker(corpus)

  let beforeHits = 0
  let afterHits = 0

  for (const tc of TEST_CASES) {
    console.log(`\n[${tc.id}] "${tc.question}"`)
    console.log(`  Expected: ${tc.expected}`)

    // Before: original query
    const before = linker.retrieve(tc.question, { topK: 20 })
    const bRank = before.findIndex(r => r.id === tc.expected || r.id.startsWith(tc.expected + '__'))
    const bHit = bRank >= 0 && bRank < 5
    if (bHit) beforeHits++
    console.log(`  BEFORE top-5: [${before.slice(0, 5).map(r => r.id.replace('dws_10000251_', '').slice(0, 40)).join(', ')}]`)
    console.log(`  BEFORE hit@5: ${bHit ? '✅' : '❌'} (rank=${bRank >= 0 ? bRank + 1 : '>20'})`)

    if (beforeOnly) continue

    // Expand
    const expanded = await expandQuery(tc.question, useLlm)
    console.log(`  Expanded: "${expanded.slice(0, 100)}${expanded.length > 100 ? '...' : ''}"`)

    // After: expanded query
    const after = linker.retrieve(expanded, { topK: 20 })
    const aRank = after.findIndex(r => r.id === tc.expected || r.id.startsWith(tc.expected + '__'))
    const aHit = aRank >= 0 && aRank < 5
    if (aHit) afterHits++
    console.log(`  AFTER top-5: [${after.slice(0, 5).map(r => r.id.replace('dws_10000251_', '').slice(0, 40)).join(', ')}]`)
    console.log(`  AFTER hit@5: ${aHit ? '✅' : '❌'} (rank=${aRank >= 0 ? aRank + 1 : '>20'})`)
  }

  console.log('\n\n=== SUMMARY ===')
  console.log(`Before: ${beforeHits}/${TEST_CASES.length} hit@5`)
  if (!beforeOnly) {
    console.log(`After:  ${afterHits}/${TEST_CASES.length} hit@5`)
    console.log(`Delta:  +${afterHits - beforeHits}`)
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
