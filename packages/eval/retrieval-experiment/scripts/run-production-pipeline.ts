/**
 * CL-7 Step 2b: Production pipeline retrieval experiment.
 *
 * Runs search_data_sources tool's execute through the REAL production pipeline:
 *   SemanticLayerService (enriched corpus + relation graph)
 *   → tool-search-data-sources (BM25 + blending + graph expansion + qualify)
 *
 * Compares: B(L1) vs C(L1) vs B(L3) vs C(L3)
 * where L1 = current state (4 tables with aliases), L3 = enriched (28 tables).
 *
 * Usage: npx tsx packages/eval/retrieval-experiment/scripts/run-production-pipeline.ts
 *
 * Differences from production:
 *   - No query expansion (no LLM provider; config.queryExpansion=false)
 *   - No qualification (no ctx.query; candidates stay un-qualified)
 *   - No ctx.retrieval (uses the ctx.schema enriched BM25 path)
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

// ── L3 aliases (same as enrich-l3-aliases.ts) ───────────────────────────
const L3_ENRICHED_TABLES = [
  'dws_10000251_com_pay_order_df', 'dws_10000251_acc_summary_df',
  'dws_10000251_role_server_base_df', 'dws_10000251_selfhelp_new_df',
  'dws_10000251_item_circle_df', 'dws_10000251_algo_role_churn_pred',
  'dws_10000251_play_pvp_df', 'dws_10000251_social_fteam_summary_df',
  'dws_10000251_play_rogue_df', 'dws_10000251_progression_card_df',
  'dws_10000251_battle_stage_df', 'dws_10000251_card_pvp_di',
  'dws_10000251_pve_progress_df', 'dws_10000251_pvp_battle_detail_di',
  'dws_10000251_recharge_shop_buy_di', 'dws_10000251_com_gm_activity_order_df',
  'dws_10000251_public_sentiment_df', 'dws_10000251_vip_acc_tag_df',
  'dws_10000251_role_common_feature_df', 'dws_10000251_role_tag_basic_df',
  'dws_10000251_finance_pay_order_di', 'dws_10000251_dev_summary_df',
  'dws_10000251_role_churn_pred_output', 'dim_10000251_server_info',
]

// ── Load eval cases ─────────────────────────────────────────────────────
interface EvalCase {
  caseId: string
  question: string
  coveredAssets: string[]
  isAlias: boolean
}

const cases: EvalCase[] = readdirSync(casesDir)
  .filter(f => f.endsWith('.yaml'))
  .sort()
  .map((f) => {
    const raw = parseYaml(readFileSync(join(casesDir, f), 'utf-8')) as Record<string, unknown>
    const input = raw.input as { question: string }
    const dims = raw.dimensions as { covered_assets?: string[] }
    return {
      caseId: raw.case_id as string,
      question: input.question,
      coveredAssets: dims?.covered_assets ?? [],
      isAlias: (raw.case_id as string).includes('alias'),
    }
  })
  .filter(c => c.coveredAssets.length > 0)

console.log(`Loaded ${cases.length} cases (${cases.filter(c => c.isAlias).length} alias-dependent)`)

// ── File state management (L1 ↔ L3) ────────────────────────────────────
const savedL3Content = new Map<string, string>()

function stripToL1(): void {
  for (const tableName of L3_ENRICHED_TABLES) {
    const path = join(tablesDir, `${tableName}.yaml`)
    if (!existsSync(path)) continue
    const content = readFileSync(path, 'utf-8')
    savedL3Content.set(tableName, content)
    const lines = content.split('\n')
    const prefIdx = lines.findIndex(l => l.startsWith('pref_label:'))
    if (prefIdx >= 0) {
      writeFileSync(path, lines.slice(0, prefIdx).join('\n') + '\n')
    }
  }
}

function restoreToL3(): void {
  for (const [tableName, content] of savedL3Content) {
    writeFileSync(join(tablesDir, `${tableName}.yaml`), content)
  }
}

// eval-cli-exp-2: restore L3 on signal exit — stripToL1 truncates committed
// YAMLs in place, and main().catch only fires on a rejected promise, not a
// SIGINT/SIGTERM (Ctrl+C / kill mid-run left the files truncated). OOM can't
// be caught (process dies); signal coverage is the achievable fix here.
process.on('SIGINT', () => { try { restoreToL3() } catch { /* best-effort */ } process.exit(130) })
process.on('SIGTERM', () => { try { restoreToL3() } catch { /* best-effort */ } process.exit(143) })

// ── Build tool from real SemanticLayerService ───────────────────────────
interface ToolDef {
  execute: (
    args: { readonly query: string; readonly top_k?: number },
    exec: { readonly signal: AbortSignal },
  ) => Promise<{ readonly candidates: readonly SearchHit[] }>
}

function buildTool(blendingMode: 'strategy-b' | 'continuous-blend'): ToolDef {
  const cordisCtx = new Context()
  const svc = new SemanticLayerService(cordisCtx, { semanticRoot })

  let toolDef: ToolDef | undefined
  const toolCtx = {
    tools: { register: (d: ToolDef) => { toolDef = d } },
    get: (key: string) => {
      if (key === 'schema') return svc
      return undefined
    },
  } as unknown as import('@deepseek-ai/cordis').Context

  const config: Config = { blendingMode, queryExpansion: false, topK }
  apply(toolCtx, config)
  if (toolDef === undefined) throw new Error('apply did not register a tool')
  return toolDef
}

// ── Metrics ─────────────────────────────────────────────────────────────
function computeMetrics(retrieved: string[], groundTruth: string[], k: number) {
  const retrievedSet = new Set(retrieved.slice(0, k))
  const gtSet = new Set(groundTruth)
  let hits = 0
  for (const id of retrievedSet) if (gtSet.has(id)) hits++
  return {
    // eval-cli-exp-3: precision@K = hits / k (standard, matches metrics.ts
    // computeRetrievalMetrics) — hits/retrievedSet.size (deduped actual count)
    // diverged when <k candidates returned, making cross-experiment numbers
    // not comparable.
    precisionAtK: k > 0 ? hits / k : 0,
    recallAtK: gtSet.size > 0 ? hits / gtSet.size : 0,
  }
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

// ── Run one configuration ───────────────────────────────────────────────
interface RunResult {
  label: string
  meanRecall: number
  medianRecall: number
  meanPrecision: number
  origRecall: number
  aliasRecall: number
  perCase: { caseId: string; recall: number; precision: number; retrievedIds: string[] }[]
}

async function runConfig(label: string, blendingMode: 'strategy-b' | 'continuous-blend'): Promise<RunResult> {
  const tool = buildTool(blendingMode)
  const signal = new AbortController().signal
  const perCase: RunResult['perCase'] = []

  for (const c of cases) {
    const out = await tool.execute({ query: c.question, top_k: topK }, { signal })
    const retrievedIds = out.candidates.map(h => h.id)
    const { precisionAtK, recallAtK } = computeMetrics(retrievedIds, c.coveredAssets, topK)
    perCase.push({ caseId: c.caseId, recall: recallAtK, precision: precisionAtK, retrievedIds })
  }

  const recalls = perCase.map(c => c.recall)
  const precisions = perCase.map(c => c.precision)
  const origCases = perCase.filter((_, i) => !cases[i]!.isAlias)
  const aliasCases = perCase.filter((_, i) => cases[i]!.isAlias)

  return {
    label,
    meanRecall: recalls.reduce((s, r) => s + r, 0) / recalls.length,
    medianRecall: median(recalls),
    meanPrecision: precisions.reduce((s, p) => s + p, 0) / precisions.length,
    origRecall: origCases.length > 0 ? origCases.reduce((s, c) => s + c.recall, 0) / origCases.length : 0,
    aliasRecall: aliasCases.length > 0 ? aliasCases.reduce((s, c) => s + c.recall, 0) / aliasCases.length : 0,
    perCase,
  }
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  const results: RunResult[] = []

  // Phase 1: L1 (strip enriched aliases)
  console.log('\n=== Phase L1: stripping L3 aliases to restore L1 state ===')
  stripToL1()
  console.log('Running B(L1)...')
  results.push(await runConfig('B(L1)', 'strategy-b'))
  console.log('Running C(L1)...')
  results.push(await runConfig('C(L1)', 'continuous-blend'))

  // Phase 2: L3 (restore enriched aliases)
  console.log('\n=== Phase L3: restoring enriched aliases ===')
  restoreToL3()
  console.log('Running B(L3)...')
  results.push(await runConfig('B(L3)', 'strategy-b'))
  console.log('Running C(L3)...')
  results.push(await runConfig('C(L3)', 'continuous-blend'))

  // ── Summary table ───────────────────────────────────────────────────
  console.log(`\n=== Production Pipeline Retrieval Experiment (${cases.length} cases, topK=${topK}) ===\n`)
  console.log('| Config | Mean R@20 | Median R@20 | Mean P@20 | Orig R@20 | Alias R@20 |')
  console.log('|--------|-----------|-------------|-----------|-----------|------------|')
  for (const r of results) {
    console.log(`| ${r.label.padEnd(6)} | ${r.meanRecall.toFixed(3).padStart(9)} | ${r.medianRecall.toFixed(3).padStart(11)} | ${r.meanPrecision.toFixed(3).padStart(9)} | ${r.origRecall.toFixed(3).padStart(9)} | ${r.aliasRecall.toFixed(3).padStart(10)} |`)
  }

  // ── Delta analysis ────────────────────────────────────────────────
  console.log('\n=== C vs B Delta ===\n')
  const bL1 = results[0]!, cL1 = results[1]!, bL3 = results[2]!, cL3 = results[3]!
  console.log(`L1: B=${bL1.meanRecall.toFixed(3)}, C=${cL1.meanRecall.toFixed(3)}, delta=${(cL1.meanRecall - bL1.meanRecall >= 0 ? '+' : '')}${((cL1.meanRecall - bL1.meanRecall) * 100).toFixed(1)}pp`)
  console.log(`L3: B=${bL3.meanRecall.toFixed(3)}, C=${cL3.meanRecall.toFixed(3)}, delta=${(cL3.meanRecall - bL3.meanRecall >= 0 ? '+' : '')}${((cL3.meanRecall - bL3.meanRecall) * 100).toFixed(1)}pp`)

  // ── Enrichment gain ───────────────────────────────────────────────
  console.log('\n=== Enrichment Gain (L1 → L3) ===\n')
  console.log(`B: ${bL1.meanRecall.toFixed(3)} → ${bL3.meanRecall.toFixed(3)}, delta=${((bL3.meanRecall - bL1.meanRecall) * 100).toFixed(1)}pp`)
  console.log(`C: ${cL1.meanRecall.toFixed(3)} → ${cL3.meanRecall.toFixed(3)}, delta=${((cL3.meanRecall - cL1.meanRecall) * 100).toFixed(1)}pp`)

  // ── Per-case flip analysis (C-L1 vs B-L1) ────────────────────────
  console.log('\n=== Flip Analysis: C(L1) vs B(L1) ===\n')
  let improved = 0, regressed = 0, unchanged = 0
  for (let i = 0; i < cases.length; i++) {
    const bCase = bL1.perCase[i]!, cCase = cL1.perCase[i]!
    const delta = cCase.recall - bCase.recall
    if (delta > 0.001) {
      improved++
      if (delta > 0.1) console.log(`  IMPROVED: ${cases[i]!.caseId} B=${bCase.recall.toFixed(3)} → C=${cCase.recall.toFixed(3)} (+${(delta * 100).toFixed(1)}pp)`)
    } else if (delta < -0.001) {
      regressed++
      console.log(`  REGRESSED: ${cases[i]!.caseId} B=${bCase.recall.toFixed(3)} → C=${cCase.recall.toFixed(3)} (${(delta * 100).toFixed(1)}pp)`)
    } else {
      unchanged++
    }
  }
  console.log(`\nSummary: ${improved} improved, ${regressed} regressed, ${unchanged} unchanged`)

  // ── Per-case flip analysis (C-L3 vs C-L1) ────────────────────────
  console.log('\n=== Flip Analysis: C(L3) vs C(L1) [enrichment gain] ===\n')
  let eImproved = 0, eRegressed = 0, eUnchanged = 0
  for (let i = 0; i < cases.length; i++) {
    const l1Case = cL1.perCase[i]!, l3Case = cL3.perCase[i]!
    const delta = l3Case.recall - l1Case.recall
    if (delta > 0.001) {
      eImproved++
      if (delta > 0.1) console.log(`  IMPROVED: ${cases[i]!.caseId} L1=${l1Case.recall.toFixed(3)} → L3=${l3Case.recall.toFixed(3)} (+${(delta * 100).toFixed(1)}pp)`)
    } else if (delta < -0.001) {
      eRegressed++
      console.log(`  REGRESSED: ${cases[i]!.caseId} L1=${l1Case.recall.toFixed(3)} → L3=${l3Case.recall.toFixed(3)} (${(delta * 100).toFixed(1)}pp)`)
    } else {
      eUnchanged++
    }
  }
  console.log(`\nSummary: ${eImproved} improved, ${eRegressed} regressed, ${eUnchanged} unchanged`)
}

main().catch((err) => {
  restoreToL3()
  console.error(err)
  process.exit(1)
})
