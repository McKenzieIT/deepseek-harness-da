/**
 * CL-9 Round 4a: Remove overly generic labels from newly enriched tables.
 *
 * Usage: npx tsx packages/eval/retrieval-experiment/scripts/cl9-cleanup-labels.ts
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const tablesDir = join(import.meta.dirname!, '../../../../examples/k11-semantic-layer/tables')

const ORIGINAL_27 = new Set([
  'dws_10000251_acc_summary_df', 'dws_10000251_algo_role_churn_pred',
  'dws_10000251_battle_stage_df', 'dws_10000251_card_pvp_di',
  'dws_10000251_com_gm_activity_order_df', 'dws_10000251_com_pay_order_df',
  'dws_10000251_com_pay_order_di', 'dws_10000251_dev_summary_df',
  'dws_10000251_finance_pay_order_di', 'dws_10000251_item_circle_df',
  'dws_10000251_play_pvp_df', 'dws_10000251_play_rogue_df',
  'dws_10000251_progression_card_df', 'dws_10000251_public_sentiment_df',
  'dws_10000251_pve_progress_df', 'dws_10000251_pvp_battle_detail_di',
  'dws_10000251_recharge_shop_buy_di', 'dws_10000251_role_churn_pred_output',
  'dws_10000251_role_common_feature_df', 'dws_10000251_role_server_base_df',
  'dws_10000251_role_tag_basic_df', 'dws_10000251_selfhelp_new_df',
  'dws_10000251_social_fteam_summary_df', 'dws_10000251_vip_acc_tag_df',
  'dws_10000251_univ_acc_act_di', 'dws_10000251_univ_role_act_di',
  'dws_10000251_univ_role_tag_df',
])

const GENERIC_BLOCKLIST = new Set([
  '活跃', '角色', '标签', '日增量', '画像', '账号', '设备',
  '累计', '快照', '全量', '汇总', '统计', '属性', '特征',
  '事件', '测试', '基础', '详情', '明细', '情况',
])

let cleaned = 0
let skipped = 0
let totalRemoved = 0

for (const f of readdirSync(tablesDir).sort()) {
  if (!f.startsWith('dws_') || !f.endsWith('.yaml')) continue
  const tableName = f.replace('.yaml', '')
  if (ORIGINAL_27.has(tableName)) continue

  const filePath = join(tablesDir, f)
  const content = readFileSync(filePath, 'utf-8')
  if (!content.includes('alt_labels:')) continue

  const lines = content.split('\n')
  const altIdx = lines.findIndex(l => l.trimEnd() === 'alt_labels:')
  if (altIdx < 0) continue

  // Collect labels
  const labels: string[] = []
  let endIdx = altIdx + 1
  while (endIdx < lines.length && lines[endIdx]!.startsWith('  - ')) {
    labels.push(lines[endIdx]!.slice(4).trim())
    endIdx++
  }

  const kept = labels.filter(l => !GENERIC_BLOCKLIST.has(l))
  const removed = labels.length - kept.length
  if (removed === 0) continue

  if (kept.length === 0) {
    console.log(`SKIP (all generic): ${tableName}`)
    skipped++
    continue
  }

  // Rebuild: everything before alt_labels line + new labels + everything after
  const before = lines.slice(0, altIdx)
  const after = lines.slice(endIdx)
  const newAltBlock = ['alt_labels:', ...kept.map(l => `  - ${l}`)]
  const rebuilt = [...before, ...newAltBlock, ...after].join('\n')

  writeFileSync(filePath, rebuilt.endsWith('\n') ? rebuilt : rebuilt + '\n')
  totalRemoved += removed
  cleaned++
  console.log(`CLEAN: ${tableName} ${labels.length}→${kept.length} (−${removed})`)
}

console.log(`\nDone: ${cleaned} cleaned, ${skipped} skipped, ${totalRemoved} labels removed`)
