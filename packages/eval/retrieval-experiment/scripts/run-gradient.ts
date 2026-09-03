/**
 * CL-5 full gradient experiment: L0/L1/L2/L3 × blending strategies.
 * L2/L3 alias maps constructed from table descriptions + domain knowledge.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { load as parseYaml } from 'js-yaml'
import { buildGraphSnapshot, snapshotLevel0, snapshotLevel1, runRetrieval } from '../src/index.ts'
import { computeQueryCoverage, extractQueryTerms } from '../src/blending.ts'
import { computeRetrievalMetrics, aggregateMetrics } from '../src/metrics.ts'
import type { ExperimentConfig, GraphSnapshot, BlendingConfig } from '../src/types.ts'

const semanticRoot = join(import.meta.dirname!, '../../../../examples/k11-semantic-layer')
const casesDir = join(import.meta.dirname!, '../../../eval/eval/cases/k11-v2')

const casePaths = readdirSync(casesDir)
  .filter(f => f.endsWith('.yaml'))
  .sort()
  .map(f => join(casesDir, f))

// ── L2 aliases: top ~14 high-frequency assets (target ~50% case hit) ────
// Use short 2-char CJK terms (match bigram tokenizer) + key business terms.
const L2_ALIASES = new Map<string, readonly string[]>([
  ['dws_10000251_com_pay_order_df', ['付费', '充值', '订单', '金额', 'ARPU', 'ARPPU', '消费']],
  ['dws_10000251_acc_summary_df', ['账号', '注册', '活跃', '转化', '累计']],
  ['dws_10000251_role_server_base_df', ['全服', '角色', '在线', '区服']],
  ['dws_10000251_selfhelp_new_df', ['新增', '新注', '拉新', '注册']],
  ['dws_10000251_item_circle_df', ['道具', '物品', '产销', '资源', '流水']],
  ['dws_10000251_algo_role_churn_pred', ['流失', '预测', '预警', '留存']],
  ['dws_10000251_play_pvp_df', ['PVP', '对战', '演武', '竞技']],
  ['dws_10000251_social_fteam_summary_df', ['小队', '组队', '队伍']],
  ['dws_10000251_play_rogue_df', ['古战', '肉鸽', 'rogue']],
  ['dws_10000251_progression_card_df', ['卡牌', '卡片', '升级']],
  ['dws_10000251_battle_stage_df', ['关卡', '通关', '副本', '挑战']],
  ['dws_10000251_card_pvp_di', ['出战', '战力', '卡战']],
  ['dws_10000251_pve_progress_df', ['PVE', '闯关', '进度']],
  ['dws_10000251_pvp_battle_detail_di', ['场次', '战斗', '胜率']],
])

// ── L3 aliases: all 25+ assets (target ~90% case hit) ───────────────────
const L3_ALIASES = new Map<string, readonly string[]>([
  ...L2_ALIASES,
  ['dws_10000251_recharge_shop_buy_di', ['商城', '商店', '购买', '礼包']],
  ['dws_10000251_com_gm_activity_order_df', ['活动', '运营', 'GM']],
  ['dws_10000251_public_sentiment_df', ['舆情', '论坛', '评价', '口碑']],
  ['dws_10000251_vip_acc_tag_df', ['VIP', '大R', '鲸鱼']],
  ['dws_10000251_role_common_feature_df', ['等级', '属性', '特征', '战力']],
  ['dws_10000251_role_tag_basic_df', ['标签', '画像', '分类']],
  ['dws_10000251_finance_pay_order_di', ['现金', '财务', '收入', '流水']],
  ['dws_10000251_dev_summary_df', ['研发', '版本', '汇总']],
  ['dws_10000251_role_churn_pred_output', ['流失标签', '预测输出', '模型']],
  ['dim_10000251_server_info', ['服务器', '区服']],
  ['dim_10000251_role_info', ['角色信息', '角色维度']],
])

// ── Build snapshots ─────────────────────────────────────────────────────
console.log('Building snapshots...')
const snapL0 = snapshotLevel0(semanticRoot)
const snapL1 = snapshotLevel1(semanticRoot)
const snapL2 = buildGraphSnapshot(semanticRoot, { extraAliases: L2_ALIASES }, 'L2')
const snapL3 = buildGraphSnapshot(semanticRoot, { extraAliases: L3_ALIASES }, 'L3')

console.log(`L0: ${snapL0.stats.aliasCount} aliases, ${snapL0.stats.conceptCount} concepts`)
console.log(`L1: ${snapL1.stats.aliasCount} aliases, ${snapL1.stats.conceptCount} concepts`)
console.log(`L2: ${snapL2.stats.aliasCount} aliases, ${snapL2.stats.conceptCount} concepts`)
console.log(`L3: ${snapL3.stats.aliasCount} aliases, ${snapL3.stats.conceptCount} concepts`)

// ── Verify coverage rates ───────────────────────────────────────────────
interface MinCase { caseId: string; question: string; coveredAssets: string[] }
const cases: MinCase[] = casePaths.map((p) => {
  const raw = parseYaml(readFileSync(p, 'utf-8')) as Record<string, unknown>
  const input = raw.input as { question: string }
  const dims = raw.dimensions as { covered_assets?: string[] }
  return { caseId: raw.case_id as string, question: input.question, coveredAssets: dims?.covered_assets ?? [] }
}).filter(c => c.coveredAssets.length > 0)

function aliasHitRate(snap: GraphSnapshot, cases: MinCase[]): number {
  let hit = 0
  for (const c of cases) {
    const terms = extractQueryTerms(c.question)
    for (const t of terms) {
      const resolved = snap.graph.resolveAlias(t)
      if (resolved.some(id => c.coveredAssets.includes(id))) { hit++; break }
    }
  }
  return hit / cases.length
}

console.log('\nAlias → covered_asset hit rate:')
console.log(`  L0: ${(aliasHitRate(snapL0, cases) * 100).toFixed(1)}%`)
console.log(`  L1: ${(aliasHitRate(snapL1, cases) * 100).toFixed(1)}%`)
console.log(`  L2: ${(aliasHitRate(snapL2, cases) * 100).toFixed(1)}%`)
console.log(`  L3: ${(aliasHitRate(snapL3, cases) * 100).toFixed(1)}%`)

// ── Pre-cache snapshots for runExperiment ────────────────────────────────
// runExperiment builds snapshots internally by level name, but we need
// custom L2/L3. So we run per-level manually.
const topK = 20

function runLevel(snap: GraphSnapshot, configs: BlendingConfig[]): void {
  for (const blending of configs) {
    const caseResults = cases.map((c) => {
      const candidates = runRetrieval(snap, c.question, topK, blending)
      const retrievedIds = candidates.map(r => r.id)
      const { precisionAtK, recallAtK } = computeRetrievalMetrics(retrievedIds, c.coveredAssets, topK)
      const queryCoverage = computeQueryCoverage(snap.graph, c.question)
      return { caseId: c.caseId, query: c.question, coveredAssets: c.coveredAssets, retrievedIds, precisionAtK, recallAtK, queryCoverage }
    })
    const agg = aggregateMetrics(caseResults)
    const original = caseResults.filter(c => !c.caseId.includes('alias'))
    const alias = caseResults.filter(c => c.caseId.includes('alias'))
    const avgR = (cs: typeof original) => cs.length > 0
      ? (cs.reduce((s, c) => s + c.recallAtK, 0) / cs.length).toFixed(3)
      : 'N/A'

    let label: string
    switch (blending.mode) {
      case 'strategy-b': label = `strategy-b(boost=${blending.aliasBoost ?? 2.0})`; break
      case 'hard-switch': label = `hard-switch(t=${blending.threshold ?? 0.5})`; break
      case 'continuous-blend': label = 'continuous-blend'; break
    }
    console.log(`| ${(snap.level + ' / ' + label).padEnd(39)} | ${agg.meanPrecision.toFixed(3).padStart(8)} | ${agg.meanRecall.toFixed(3).padStart(8)} | ${agg.medianRecall.toFixed(3).padStart(10)} | R:orig=${avgR(original)} alias=${avgR(alias)} |`)
  }
}

// ── Full gradient matrix ────────────────────────────────────────────────
console.log(`\n=== Full Gradient Experiment (${cases.length} cases, topK=${topK}) ===\n`)
const header = '| Config                                  | Mean P@K | Mean R@K | Median R@K | Breakdown                            |'
const sep =    '|-----------------------------------------|----------|----------|------------|--------------------------------------|'
console.log(header)
console.log(sep)

const blendings: BlendingConfig[] = [
  { mode: 'strategy-b' },
  { mode: 'hard-switch', threshold: 0.3 },
  { mode: 'hard-switch', threshold: 0.5 },
  { mode: 'hard-switch', threshold: 0.7 },
  { mode: 'continuous-blend' },
]

for (const snap of [snapL0, snapL1, snapL2, snapL3]) {
  runLevel(snap, blendings)
}

console.log()

// ── Ripping point analysis ──────────────────────────────────────────────
console.log('=== Tipping Point: Where C (continuous-blend) > B (strategy-b) ===\n')
for (const snap of [snapL0, snapL1, snapL2, snapL3]) {
  let bRecallSum = 0, cRecallSum = 0
  for (const c of cases) {
    const bHits = runRetrieval(snap, c.question, topK, { mode: 'strategy-b' })
    const cHits = runRetrieval(snap, c.question, topK, { mode: 'continuous-blend' })
    bRecallSum += computeRetrievalMetrics(bHits.map(h => h.id), c.coveredAssets, topK).recallAtK
    cRecallSum += computeRetrievalMetrics(cHits.map(h => h.id), c.coveredAssets, topK).recallAtK
  }
  const bMean = bRecallSum / cases.length
  const cMean = cRecallSum / cases.length
  const delta = cMean - bMean
  console.log(`  ${snap.level}: B=${bMean.toFixed(3)}, C=${cMean.toFixed(3)}, delta=${delta >= 0 ? '+' : ''}${delta.toFixed(3)} ${delta > 0 ? '← C wins' : delta === 0 ? '(tie)' : '← B wins'}`)
}
