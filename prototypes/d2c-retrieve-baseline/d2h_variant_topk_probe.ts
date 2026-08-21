/**
 * D2h variant + topK probe (2026-08-21). Confirms the D2h build — term-only
 * selectable variant (SemanticLayerConfig.corpusVariant) + default prefetch
 * topK raised 5→20 — takes effect on the SHIPPED code over REAL RBI scope
 * 10000147, via a real SemanticLayerService (config -> Service -> io -> corpus.ts)
 * + shipped tool-search execute (getEnrichedLinker).
 *
 * Smoke (not a 113-case re-measure). The D2g-audited recall numbers
 * (term-only 77.0% strict / term@topK=20 85.0% vs params+term 68.1% / 81.4%)
 * hold by construction: the D2g probe (d2g_larger_caseset.py, a faithful python
 * port of corpus.ts) IS corpus.ts logic, and this probe exercises the shipped
 * TS corpus.ts variant branching directly. This probe confirms the WIRING
 * (variant switches the packed slices; topK=20 default caps candidates), not
 * the recall floor (D2g-audited).
 *
 * Run: cd /Users/mckenzie/workspace/deepseek-harness-da && \
 *   pnpm exec tsx prototypes/d2c-retrieve-baseline/d2h_variant_topk_probe.ts
 */
import { loadRetrievalCorpus, loadEvents } from '../../packages/data/semantic-layer/src/io.ts'
import { SemanticLayerService } from '../../packages/data/semantic-layer/src/index.ts'
import { apply, type SearchHit } from '../../packages/data/tool-search-data-sources/src/index.ts'
import type { Context } from '../../vendor/cordis/src/index.ts'

const RBI = '/Users/mckenzie/workspace/reverse-bi/resources/semantic-layer/10000147'

interface ToolDef {
  name: string
  execute: (args: { query: string; top_k?: number }, exec: { signal: AbortSignal }) => Promise<{ candidates: SearchHit[] }>
}

// Real SemanticLayerService over RBI — corpusVariant is mount-time config. The
// ctx shell only needs reflect.provide (Cordis Service registration); the
// Service delegates loadRetrievalCorpus/corpusVersion to real io over RBI.
function makeSchema(corpusVariant?: 'params+term' | 'term-only'): SemanticLayerService {
  const ctx = { reflect: { provide: () => {} } } as unknown as Context
  return new SemanticLayerService(ctx, {
    semanticRoot: RBI,
    scopeId: '',
    ...(corpusVariant !== undefined ? { corpusVariant } : {}),
  })
}

// Each tool is registered on its own ctx whose ctx.get('schema') returns the
// given Service. The module-level enrichedLinkers WeakMap (tool-search) keys by
// Service instance, so the params+term and term-only linkers are cached
// separately (no cross-contamination).
function makeTool(svc: SemanticLayerService): ToolDef {
  let def: ToolDef | undefined
  const ctx = {
    tools: { register: (d: ToolDef) => { def = d } },
    get: (key: string) => (key === 'schema' ? svc : undefined),
  } as unknown as Context
  apply(ctx, {})
  if (def === undefined) throw new Error('apply did not register a tool')
  return def
}

const exec = { signal: new AbortController().signal }

async function run() {
  const sampleName = 'role.online'
  const sampleRaw = loadEvents(RBI).find(e => e.name === sampleName)?.raw
  const baseDesc = (sampleRaw?.description as string | undefined) ?? '(no role.online event)'

  // [1] default (params+term, shipped) Service: packs BOTH params + slang.
  const defSvc = makeSchema() // no corpusVariant -> default params+term
  const defTool = makeTool(defSvc)
  const defSample = defSvc.loadRetrievalCorpus().find(c => c.id === sampleName)
  const defParams = (defSample?.description ?? '').includes('角色id')
  const defSlang = (defSample?.description ?? '').includes('日活')
  console.log(`[1] default (params+term) Service — ${sampleName}:`)
  console.log(`    base description    : ${baseDesc}`)
  console.log(`    enriched description: ${defSample?.description ?? '(missing)'}`)
  console.log(`    params "角色id" packed? ${defParams} | slang "日活" packed? ${defSlang}`)
  console.log(`    corpusVariant config: ${defSvc.corpusVariant}`)

  // [2] term-only Service: packs slang, NOT params (the variant switch).
  const termSvc = makeSchema('term-only')
  const termTool = makeTool(termSvc)
  const termSample = termSvc.loadRetrievalCorpus().find(c => c.id === sampleName)
  const termParams = (termSample?.description ?? '').includes('角色id')
  const termSlang = (termSample?.description ?? '').includes('日活')
  console.log(`[2] term-only Service — ${sampleName}:`)
  console.log(`    enriched description: ${termSample?.description ?? '(missing)'}`)
  console.log(`    params "角色id" packed? ${termParams} | slang "日活" packed? ${termSlang}`)
  console.log(`    corpusVariant config: ${termSvc.corpusVariant}`)
  console.log(`    variant switched the corpus? ${defSample?.description !== termSample?.description}`)

  // [3] topK=20 default: execute with NO top_k — default 20 caps candidates.
  // (pre-D2h default was 5; D2h raises to 20. A 充值 query matches many
  // events; the cap proves the 5->20 wiring on the shipped execute path.)
  const defOut = await defTool.execute({ query: '充值' }, exec) // no top_k
  const termOut = await termTool.execute({ query: '充值' }, exec) // no top_k
  console.log(`[3] default topK (no top_k) — 充值 query:`)
  console.log(`    params+term candidates: ${defOut.candidates.length} (cap ≤20; pre-D2h would be ≤5)`)
  console.log(`    term-only candidates:   ${termOut.candidates.length} (cap ≤20)`)
  console.log(`    params+term top-1: ${defOut.candidates[0]?.id} (score ${defOut.candidates[0] ? Number(defOut.candidates[0].score.toFixed(3)) : 'n/a'})`)
  console.log(`    term-only top-1:   ${termOut.candidates[0]?.id} (score ${termOut.candidates[0] ? Number(termOut.candidates[0].score.toFixed(3)) : 'n/a'})`)

  // [4] variant recall signal (D2g bridge): a CJK-synonym slang where term-only
  // ranks the bridged event higher than params+term (params dilute via BM25
  // length-norm). Try the D2g-cited bridges; report whichever resolves.
  const bridges = [
    { query: '道具产出', expect: 'item.add' },
    { query: '商城购买', expect: 'shop.buy' },
    { query: '创角', expect: 'game.role.create' },
  ]
  console.log(`[4] D2g bridge signals (top-1 params+term vs term-only):`)
  for (const { query, expect: exp } of bridges) {
    const d = await defTool.execute({ query }, exec)
    const t = await termTool.execute({ query }, exec)
    console.log(`    "${query}" (D2g maps to ${exp}): params+term top-1=${d.candidates[0]?.id} | term-only top-1=${t.candidates[0]?.id}`)
  }

  const ok = defParams && defSlang && !termParams && termSlang && defSample?.description !== termSample?.description
  console.log(`[verdict] D2h wiring ${ok ? 'CONFIRMED' : 'NOT CONFIRMED'}: default packs params+slang (${defParams && defSlang}) + term-only drops params keeps slang (${!termParams && termSlang}) + variant switches corpus (${defSample?.description !== termSample?.description})`)
}

run().catch(e => { console.error(e); process.exit(1) })
