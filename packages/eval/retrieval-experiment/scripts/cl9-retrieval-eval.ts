/**
 * CL-9: Retrieval-level eval — measure recall@20 with full DWS enrichment (162 tables).
 * Compare against CL-7 baseline (L3 = 27 tables, recall = 0.804).
 *
 * Usage: npx tsx packages/eval/retrieval-experiment/scripts/cl9-retrieval-eval.ts
 */
import { Context } from '@deepseek-ai/cordis'
import { SemanticLayerService } from '../../../../packages/data/semantic-layer/src/index.ts'
import { apply, type SearchHit, type Config } from '../../../../packages/data/tool-search-data-sources/src/index.ts'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { load as parseYaml } from 'js-yaml'

const semanticRoot = join(import.meta.dirname!, '../../../../examples/k11-semantic-layer')
const casesDir = join(import.meta.dirname!, '../../../eval/eval/cases/k11-v2')
const topK = 20

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
    get: (key: string) => key === 'schema' ? svc : undefined,
  } as unknown as import('@deepseek-ai/cordis').Context

  const config: Config = { blendingMode, queryExpansion: false, topK }
  apply(toolCtx, config)
  if (toolDef === undefined) throw new Error('apply did not register a tool')
  return toolDef
}

function computeMetrics(retrieved: string[], groundTruth: string[], k: number) {
  const retrievedSet = new Set(retrieved.slice(0, k))
  const gtSet = new Set(groundTruth)
  let hits = 0
  for (const id of retrievedSet) if (gtSet.has(id)) hits++
  return {
    precisionAtK: retrievedSet.size > 0 ? hits / retrievedSet.size : 0,
    recallAtK: gtSet.size > 0 ? hits / gtSet.size : 0,
  }
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

async function main() {
  const tool = buildTool('continuous-blend')
  const signal = new AbortController().signal

  const perCase: { caseId: string; recall: number; precision: number; isAlias: boolean; retrievedIds: string[] }[] = []

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]!
    const out = await tool.execute({ query: c.question, top_k: topK }, { signal })
    const retrievedIds = out.candidates.map(h => h.id)
    const { precisionAtK, recallAtK } = computeMetrics(retrievedIds, c.coveredAssets, topK)
    perCase.push({ caseId: c.caseId, recall: recallAtK, precision: precisionAtK, isAlias: c.isAlias, retrievedIds })

    if (i % 20 === 0) process.stdout.write(`  ${i}/${cases.length}\r`)
  }

  const recalls = perCase.map(c => c.recall)
  const precisions = perCase.map(c => c.precision)
  const origCases = perCase.filter(c => !c.isAlias)
  const aliasCases = perCase.filter(c => c.isAlias)

  const meanRecall = recalls.reduce((s, r) => s + r, 0) / recalls.length
  const medianRecall = median(recalls)
  const meanPrecision = precisions.reduce((s, p) => s + p, 0) / precisions.length
  const origRecall = origCases.length > 0 ? origCases.reduce((s, c) => s + c.recall, 0) / origCases.length : 0
  const aliasRecall = aliasCases.length > 0 ? aliasCases.reduce((s, c) => s + c.recall, 0) / aliasCases.length : 0

  console.log(`\n=== CL-9 Retrieval Eval (${cases.length} cases, topK=${topK}, continuous-blend) ===\n`)
  console.log(`Mean R@${topK}:   ${meanRecall.toFixed(3)} (${(meanRecall * 100).toFixed(1)}%)`)
  console.log(`Median R@${topK}: ${medianRecall.toFixed(3)}`)
  console.log(`Mean P@${topK}:   ${meanPrecision.toFixed(3)}`)
  console.log(`Orig R@${topK}:   ${origRecall.toFixed(3)} (${origCases.length} cases)`)
  console.log(`Alias R@${topK}:  ${aliasRecall.toFixed(3)} (${aliasCases.length} cases)`)

  console.log('\n=== vs CL-7 baseline (L3=27 tables, continuous-blend) ===')
  const CL7_RECALL = 0.804
  console.log(`CL-7 L3:  R@${topK} = ${CL7_RECALL.toFixed(3)}`)
  console.log(`CL-9 All: R@${topK} = ${meanRecall.toFixed(3)}`)
  console.log(`Delta:    ${((meanRecall - CL7_RECALL) * 100).toFixed(1)}pp`)

  // Show cases with recall < 1.0
  const misses = perCase.filter(c => c.recall < 1.0 - 0.001)
  if (misses.length > 0) {
    console.log(`\n=== Recall < 1.0 (${misses.length} cases) ===\n`)
    for (const m of misses.sort((a, b) => a.recall - b.recall)) {
      console.log(`  ${m.caseId}: recall=${m.recall.toFixed(3)}${m.isAlias ? ' [alias]' : ''}`)
    }
  } else {
    console.log(`\nPerfect recall on all ${cases.length} cases!`)
  }
}

main().catch(console.error)
