/**
 * CL-9 A/B test: compare recall@20 on the 80 original cases.
 *   A = original 27 tables enriched (CL-7 baseline)
 *   B = all 162 tables enriched (CL-9)
 *
 * Temporarily strips new enrichments for state A, then restores for state B.
 */
import { Context } from '@deepseek-ai/cordis'
import { SemanticLayerService } from '../../../../packages/data/semantic-layer/src/index.ts'
import { apply, type SearchHit, type Config } from '../../../../packages/data/tool-search-data-sources/src/index.ts'
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { load as parseYaml } from 'js-yaml'

const semanticRoot = join(import.meta.dirname!, '../../../../examples/k11-semantic-layer')
const casesDir = join(import.meta.dirname!, '../../../eval/eval/cases/k11-v2')
const tablesDir = join(semanticRoot, 'tables')
const topK = 20

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

interface EvalCase {
  caseId: string
  question: string
  coveredAssets: string[]
}

const cases: EvalCase[] = readdirSync(casesDir)
  .filter(f => /^k11v2_\d+\./.test(f))  // only original 80 cases
  .sort()
  .map((f) => {
    const raw = parseYaml(readFileSync(join(casesDir, f), 'utf-8')) as Record<string, unknown>
    const input = raw.input as { question: string }
    const dims = raw.dimensions as { covered_assets?: string[] }
    return {
      caseId: raw.case_id as string,
      question: input.question,
      coveredAssets: dims?.covered_assets ?? [],
    }
  })
  .filter(c => c.coveredAssets.length > 0)

console.log(`Loaded ${cases.length} original cases`)

// Save/restore new enrichments
const savedContent = new Map<string, string>()

function stripNewEnrichments(): void {
  for (const f of readdirSync(tablesDir)) {
    if (!f.startsWith('dws_') || !f.endsWith('.yaml')) continue
    const tableName = f.replace('.yaml', '')
    if (ORIGINAL_27.has(tableName)) continue
    const path = join(tablesDir, f)
    const content = readFileSync(path, 'utf-8')
    if (!content.includes('pref_label:') && !content.includes('alt_labels:')) continue
    savedContent.set(f, content)
    const lines = content.split('\n')
    const prefIdx = lines.findIndex(l => l.startsWith('pref_label:'))
    const altIdx = lines.findIndex(l => l.trimEnd() === 'alt_labels:')
    const cutIdx = Math.min(
      prefIdx >= 0 ? prefIdx : Infinity,
      altIdx >= 0 ? altIdx : Infinity,
    )
    if (cutIdx < lines.length) {
      writeFileSync(path, lines.slice(0, cutIdx).join('\n') + '\n')
    }
  }
}

function restoreEnrichments(): void {
  for (const [f, content] of savedContent) {
    writeFileSync(join(tablesDir, f), content)
  }
}

interface ToolDef {
  execute: (
    args: { readonly query: string; readonly top_k?: number },
    exec: { readonly signal: AbortSignal },
  ) => Promise<{ readonly candidates: readonly SearchHit[] }>
}

function buildTool(): ToolDef {
  const cordisCtx = new Context()
  const svc = new SemanticLayerService(cordisCtx, { semanticRoot })
  let toolDef: ToolDef | undefined
  const toolCtx = {
    tools: { register: (d: ToolDef) => { toolDef = d } },
    get: (key: string) => key === 'schema' ? svc : undefined,
  } as unknown as import('@deepseek-ai/cordis').Context
  const config: Config = { blendingMode: 'continuous-blend', queryExpansion: false, topK }
  apply(toolCtx, config)
  if (toolDef === undefined) throw new Error('apply did not register a tool')
  return toolDef
}

function computeRecall(retrieved: string[], groundTruth: string[], k: number): number {
  const retrievedSet = new Set(retrieved.slice(0, k))
  const gtSet = new Set(groundTruth)
  let hits = 0
  for (const id of retrievedSet) if (gtSet.has(id)) hits++
  return gtSet.size > 0 ? hits / gtSet.size : 0
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

async function runEval(label: string): Promise<{ mean: number; median: number; perCase: Map<string, number> }> {
  const tool = buildTool()
  const signal = new AbortController().signal
  const recalls: number[] = []
  const perCase = new Map<string, number>()

  for (const c of cases) {
    const out = await tool.execute({ query: c.question, top_k: topK }, { signal })
    const ids = out.candidates.map(h => h.id)
    const r = computeRecall(ids, c.coveredAssets, topK)
    recalls.push(r)
    perCase.set(c.caseId, r)
  }

  const mean = recalls.reduce((s, r) => s + r, 0) / recalls.length
  const med = median(recalls)
  console.log(`  ${label}: Mean R@${topK} = ${mean.toFixed(3)}, Median R@${topK} = ${med.toFixed(3)}`)
  return { mean, median: med, perCase }
}

async function main() {
  // State A: strip new enrichments (only original 27)
  console.log('\n=== State A: Original 27 tables enriched (CL-7 baseline) ===')
  stripNewEnrichments()
  console.log(`  Stripped ${savedContent.size} tables`)
  const stateA = await runEval('A (27 tables)')

  // State B: restore all enrichments (162 tables)
  console.log('\n=== State B: All 162 tables enriched (CL-9) ===')
  restoreEnrichments()
  const stateB = await runEval('B (162 tables)')

  // Comparison
  const delta = stateB.mean - stateA.mean
  console.log(`\n=== A/B Comparison (${cases.length} original cases, continuous-blend) ===`)
  console.log(`  A (27 tables):  R@${topK} = ${stateA.mean.toFixed(3)}`)
  console.log(`  B (162 tables): R@${topK} = ${stateB.mean.toFixed(3)}`)
  console.log(`  Delta: ${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}pp`)

  // Flip analysis
  let improved = 0, regressed = 0, unchanged = 0
  const regressions: string[] = []
  const improvements: string[] = []
  for (const c of cases) {
    const a = stateA.perCase.get(c.caseId)!
    const b = stateB.perCase.get(c.caseId)!
    const d = b - a
    if (d > 0.001) { improved++; if (d > 0.1) improvements.push(`  +${(d*100).toFixed(0)}pp ${c.caseId}: "${c.question}"`) }
    else if (d < -0.001) { regressed++; regressions.push(`  ${(d*100).toFixed(0)}pp ${c.caseId}: "${c.question}"`) }
    else unchanged++
  }
  console.log(`\n  Improved: ${improved}, Regressed: ${regressed}, Unchanged: ${unchanged}`)
  if (regressions.length > 0) {
    console.log('\n  Regressions:')
    regressions.forEach(r => console.log(r))
  }
  if (improvements.length > 0) {
    console.log('\n  Improvements (>10pp):')
    improvements.forEach(r => console.log(r))
  }
}

main().catch((err) => { restoreEnrichments(); console.error(err); process.exit(1) })
