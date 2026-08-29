/**
 * CL-7 Step 2a: Inject L3 aliases into K11 semantic layer YAML files.
 * Sources alias mapping from the CL-5 gradient experiment's L3_ALIASES.
 * Idempotent — skips tables that already have alt_labels.
 *
 * Usage: npx tsx packages/eval/retrieval-experiment/scripts/enrich-l3-aliases.ts
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const semanticRoot = join(import.meta.dirname!, '../../../../examples/k11-semantic-layer')
const tablesDir = join(semanticRoot, 'tables')

const L3_ALIASES = new Map<string, { pref: string; alts: readonly string[] }>([
  ['dws_10000251_com_pay_order_df', { pref: '付费订单总表', alts: ['付费', '充值', '订单', '金额', 'ARPU', 'ARPPU', '消费'] }],
  ['dws_10000251_acc_summary_df', { pref: '账号汇总表', alts: ['账号', '注册', '活跃', '转化', '累计'] }],
  ['dws_10000251_role_server_base_df', { pref: '角色区服基础表', alts: ['全服', '角色', '在线', '区服'] }],
  ['dws_10000251_selfhelp_new_df', { pref: '新增用户表', alts: ['新增', '新注', '拉新', '注册'] }],
  ['dws_10000251_item_circle_df', { pref: '道具产销表', alts: ['道具', '物品', '产销', '资源', '流水'] }],
  ['dws_10000251_algo_role_churn_pred', { pref: '流失预测表', alts: ['流失', '预测', '预警', '留存'] }],
  ['dws_10000251_play_pvp_df', { pref: 'PVP对战表', alts: ['PVP', '对战', '演武', '竞技'] }],
  ['dws_10000251_social_fteam_summary_df', { pref: '小队汇总表', alts: ['小队', '组队', '队伍'] }],
  ['dws_10000251_play_rogue_df', { pref: '古战场肉鸽表', alts: ['古战', '肉鸽', 'rogue'] }],
  ['dws_10000251_progression_card_df', { pref: '卡牌升级表', alts: ['卡牌', '卡片', '升级'] }],
  ['dws_10000251_battle_stage_df', { pref: '关卡通关表', alts: ['关卡', '通关', '副本', '挑战'] }],
  ['dws_10000251_card_pvp_di', { pref: '卡战日表', alts: ['出战', '战力', '卡战'] }],
  ['dws_10000251_pve_progress_df', { pref: 'PVE进度表', alts: ['PVE', '闯关', '进度'] }],
  ['dws_10000251_pvp_battle_detail_di', { pref: 'PVP战斗详情表', alts: ['场次', '战斗', '胜率'] }],
  ['dws_10000251_recharge_shop_buy_di', { pref: '商城购买表', alts: ['商城', '商店', '购买', '礼包'] }],
  ['dws_10000251_com_gm_activity_order_df', { pref: '活动订单表', alts: ['活动', '运营', 'GM'] }],
  ['dws_10000251_public_sentiment_df', { pref: '舆情表', alts: ['舆情', '论坛', '评价', '口碑'] }],
  ['dws_10000251_vip_acc_tag_df', { pref: 'VIP账号标签表', alts: ['VIP', '大R', '鲸鱼'] }],
  ['dws_10000251_role_common_feature_df', { pref: '角色通用特征表', alts: ['等级', '属性', '特征', '战力'] }],
  ['dws_10000251_role_tag_basic_df', { pref: '角色基础标签表', alts: ['标签', '画像', '分类'] }],
  ['dws_10000251_finance_pay_order_di', { pref: '现金收入日表', alts: ['现金', '财务', '收入'] }],
  ['dws_10000251_dev_summary_df', { pref: '研发汇总表', alts: ['研发', '版本', '汇总'] }],
  ['dws_10000251_role_churn_pred_output', { pref: '流失预测输出表', alts: ['流失标签', '预测输出', '模型'] }],
  ['dim_10000251_server_info', { pref: '服务器信息维表', alts: ['服务器', '区服'] }],
])

let enriched = 0
let skipped = 0
for (const [tableName, { pref, alts }] of L3_ALIASES) {
  const filePath = join(tablesDir, `${tableName}.yaml`)
  if (!existsSync(filePath)) {
    console.log(`SKIP (not found): ${tableName}`)
    skipped++
    continue
  }
  const content = readFileSync(filePath, 'utf-8')
  if (content.includes('alt_labels:')) {
    console.log(`SKIP (already has alt_labels): ${tableName}`)
    skipped++
    continue
  }
  const altLabelsYaml = `pref_label: ${pref}\nalt_labels:\n${alts.map(a => `  - ${a}`).join('\n')}\n`
  const updated = content.trimEnd() + '\n' + altLabelsYaml
  writeFileSync(filePath, updated)
  console.log(`ENRICHED: ${tableName} (+${alts.length} aliases)`)
  enriched++
}
console.log(`\nDone: ${enriched} enriched, ${skipped} skipped`)
