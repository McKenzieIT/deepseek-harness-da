/**
 * Analyze which covered_assets need aliases to be retrievable via alias resolution.
 * For each case, check if the query terms can resolve to the covered assets
 * via the current L1 graph. Output the gap analysis.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { load as parseYaml } from 'js-yaml'
import { snapshotLevel1 } from '../src/index.ts'
import { extractQueryTerms, computeQueryCoverage } from '../src/blending.ts'

const semanticRoot = join(import.meta.dirname!, '../../../../examples/k11-semantic-layer')
const casesDir = join(import.meta.dirname!, '../../../eval/eval/cases/k11-v2')

const snap = snapshotLevel1(semanticRoot)

interface MinCase { caseId: string; question: string; coveredAssets: string[] }

const cases: MinCase[] = readdirSync(casesDir)
  .filter(f => f.endsWith('.yaml'))
  .sort()
  .map((f) => {
    const raw = parseYaml(readFileSync(join(casesDir, f), 'utf-8')) as Record<string, unknown>
    const input = raw.input as { question: string }
    const dims = raw.dimensions as { covered_assets?: string[] }
    return { caseId: raw.case_id as string, question: input.question, coveredAssets: dims?.covered_assets ?? [] }
  })
  .filter(c => c.coveredAssets.length > 0)

// Collect all unique covered_assets and their frequency
const assetFreq = new Map<string, number>()
for (const c of cases) {
  for (const a of c.coveredAssets) {
    assetFreq.set(a, (assetFreq.get(a) ?? 0) + 1)
  }
}

// Check which assets have existing aliases
const assetsWithAlias: string[] = []
const assetsWithoutAlias: string[] = []
for (const [asset] of [...assetFreq.entries()].sort((a, b) => b[1] - a[1])) {
  const aliases = snap.graph.getAliases(asset)
  if (aliases.length > 0) {
    assetsWithAlias.push(asset)
  } else {
    assetsWithoutAlias.push(asset)
  }
}

console.log('=== Coverage Gap Analysis ===\n')
console.log(`Total cases: ${cases.length}`)
console.log(`Unique covered_assets: ${assetFreq.size}`)
console.log(`Assets WITH aliases: ${assetsWithAlias.length}`)
console.log(`Assets WITHOUT aliases: ${assetsWithoutAlias.length}\n`)

// For each case, can any query term resolve to any covered_asset?
let casesHit = 0
let casesMiss = 0
const missedCases: MinCase[] = []
for (const c of cases) {
  const terms = extractQueryTerms(c.question)
  let anyHit = false
  for (const t of terms) {
    const resolved = snap.graph.resolveAlias(t)
    if (resolved.some(id => c.coveredAssets.includes(id))) {
      anyHit = true
      break
    }
  }
  if (anyHit) casesHit++
  else { casesMiss++; missedCases.push(c) }
}

console.log(`Cases where alias resolves to a covered_asset: ${casesHit}/${cases.length} (${(casesHit / cases.length * 100).toFixed(1)}%)`)
console.log(`Cases with NO alias hit on covered_assets: ${casesMiss}/${cases.length}\n`)

// Top-20 most frequent assets without aliases
console.log('=== Top 20 Most Referenced Assets WITHOUT Aliases ===\n')
const topMissing = assetsWithoutAlias
  .map(a => ({ asset: a, freq: assetFreq.get(a) ?? 0 }))
  .sort((a, b) => b.freq - a.freq)
  .slice(0, 20)

for (const { asset, freq } of topMissing) {
  // Extract description from the snapshot linker's corpus
  const hits = snap.linker.retrieve(asset, { topK: 1 })
  const desc = (hits[0]?.payload as { description?: string } | undefined)?.description?.slice(0, 60) ?? ''
  console.log(`  ${asset} (${freq} cases) — ${desc}`)
}

// Analyze what query terms appear in missed cases
console.log('\n=== Query Term → Needed Asset Mapping (for L2/L3 construction) ===\n')
const termToAssets = new Map<string, Set<string>>()
for (const c of missedCases.slice(0, 50)) {
  const terms = extractQueryTerms(c.question)
  for (const t of terms) {
    for (const a of c.coveredAssets) {
      if (!termToAssets.has(t)) termToAssets.set(t, new Set())
      termToAssets.get(t)!.add(a)
    }
  }
}

const termEntries = [...termToAssets.entries()]
  .map(([term, assets]) => ({ term, assets: [...assets], count: assets.size }))
  .sort((a, b) => b.count - a.count)
  .slice(0, 30)

for (const { term, assets } of termEntries) {
  console.log(`  "${term}" → [${assets.slice(0, 3).join(', ')}${assets.length > 3 ? `, ... (${assets.length} total)` : ''}]`)
}
