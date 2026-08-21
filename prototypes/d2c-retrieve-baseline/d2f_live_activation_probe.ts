/**
 * D2f live-activation probe (2026-08-21). Confirms the D2e shipped enriched
 * corpus is active over REAL RBI scope 10000147 via the SHIPPED tool-search
 * execute path (getEnrichedLinker + D2f corpusVersion version-check) + shipped
 * semantic-layer io (loadRetrievalCorpus / getCorpusVersion / loadEvents) +
 * shipped Bm25Linker.
 *
 * Smoke (not a 31-case re-measure). Activation is CONFIRMED by: (1) enriched
 * corpus non-empty; (2) a sample event's enriched description visibly packs
 * params_fields + terminology slang vs its base description; (3) "充值" ->
 * recharge top-1 via the packed slang/params_field. NOTE: a single slang like
 * "日活" does NOT retrieve role.online - the packed role.online doc is very long
 * so BM25 length-norm dilutes it and "活" matches activity events instead
 * (consistent with D2e's length-norm finding); the enrichment is still active
 * (slang packed in [1]), the full 31-case recall floor (54.8% strict / 58.1%
 * loose) is D2e-audited (probe_hypotheses.py, RBI-YAML-simulated) and accounts
 * for this - this probe does not re-measure.
 *
 * Run: cd /Users/mckenzie/workspace/deepseek-harness-da && \
 *        pnpm exec tsx prototypes/d2c-retrieve-baseline/d2f_live_activation_probe.ts
 */
import { loadRetrievalCorpus, getCorpusVersion, loadEvents } from '../../packages/data/semantic-layer/src/io.ts'
import { Bm25Linker } from '../../packages/data/nl2sql-engine/src/bm25-linking.ts'
import { apply, type SearchHit } from '../../packages/data/tool-search-data-sources/src/index.ts'
import type { Context } from '../../vendor/cordis/src/index.ts'

const RBI = '/Users/mckenzie/workspace/reverse-bi/resources/semantic-layer/10000147'

// SHIPPED activation wiring: ctx.schema delegates to real io over RBI. apply()
// + execute exercise getEnrichedLinker (lazy build + D2f version-check).
const schema = {
  loadRetrievalCorpus: () => loadRetrievalCorpus(RBI),
  corpusVersion: () => getCorpusVersion(RBI),
}
interface ToolDef {
  name: string
  execute: (args: { query: string; top_k?: number }, exec: { signal: AbortSignal }) => Promise<{ candidates: SearchHit[] }>
}
let def: ToolDef | undefined
const ctx = {
  tools: { register: (d: ToolDef) => { def = d } },
  get: (key: string) => (key === 'schema' ? schema : undefined),
} as unknown as Context
apply(ctx, {})
if (def === undefined) throw new Error('apply did not register a tool')
const exec = { signal: new AbortController().signal }

async function run() {
  const enriched = loadRetrievalCorpus(RBI)
  console.log(`[1] enriched corpus size: ${enriched.length}`)

  // role.online: base "玩家上线" vs enriched (packed params_fields + slang).
  const sampleName = 'role.online'
  const sample = enriched.find(c => c.id === sampleName)
  const sampleRaw = loadEvents(RBI).find(e => e.name === sampleName)?.raw
  const baseDesc = (sampleRaw?.description as string | undefined) ?? '(no role.online event)'
  const slangPacked = (sample?.description ?? '').includes('日活')
  const paramsPacked = (sample?.description ?? '').includes('角色id')
  console.log(`[1] sample ${sampleName}:`)
  console.log(`    base description    : ${baseDesc}`)
  console.log(`    enriched description: ${sample?.description ?? '(missing)'}`)
  console.log(`    slang "日活" packed? ${slangPacked} | params "角色id" packed? ${paramsPacked}`)

  // base corpus = id + base description only (no packed params_fields/slang)
  const baseCorpus = loadEvents(RBI).map(e => ({
    id: e.name,
    description: (e.raw.description as string | undefined) ?? '',
  }))
  const baseLinker = new Bm25Linker(baseCorpus)

  // A/B "充值": recharge via packed slang 充值 + params_field 充值金额.
  const q = '充值'
  const enrichedOut = await def!.execute({ query: q, top_k: 10 }, exec)
  const baseHits = baseLinker.retrieve(q, { topK: 10, mode: 'bm25-only' })
  const enrichedTop = enrichedOut.candidates[0]?.id
  const rechargeEnriched = enrichedOut.candidates.find(c => c.id === 'recharge')
  const rechargeBase = baseHits.find((h: { id: string }) => h.id === 'recharge')
  console.log(`[2] A/B "${q}" (recharge via packed slang 充值 + params_field 充值金额):`)
  console.log(`    enriched top-1: ${enrichedTop} (recharge score ${rechargeEnriched ? Number(rechargeEnriched.score.toFixed(3)) : 'n/a'})`)
  console.log(`    base recharge? ${rechargeBase ? 'yes' : 'no (recharge base desc lacks 充值 -> enriched-only hit)'}`)
  console.log(`    enriched top 10: ${JSON.stringify(enrichedOut.candidates.map(c => ({ id: c.id, score: Number(c.score.toFixed(3)) })))}`)

  // "角色": hits via packed 角色id/role_id params_field (not event ids).
  const q2 = '角色'
  const out2 = await def!.execute({ query: q2, top_k: 5 }, exec)
  console.log(`[3] params_field query "${q2}" (hits via packed 角色id field):`)
  console.log(`    ${JSON.stringify(out2.candidates.map(c => ({ id: c.id, score: Number(c.score.toFixed(3)) })))}`)

  // honest: single-slang "日活" does NOT cleanly retrieve role.online (long-doc
  // BM25 length-norm dilution + broad 活 token -> activity events rank higher).
  const slangQ = '日活'
  const slangOut = await def!.execute({ query: slangQ, top_k: 5 }, exec)
  console.log(`[4] single-slang "${slangQ}" hits (role.online packed-but-long-diluted; NOT a clean single-query hit):`)
  console.log(`    ${JSON.stringify(slangOut.candidates.map(c => c.id))}`)
  console.log(`    role.online in these? ${slangOut.candidates.some(c => c.id === 'role.online')}`)

  const ok = enriched.length > 0 && slangPacked && paramsPacked && enrichedTop === 'recharge'
  console.log(`[verdict] activation ${ok ? 'CONFIRMED' : 'NOT CONFIRMED'}: enriched non-empty (${enriched.length}) + slang+params packed (${slangPacked && paramsPacked}) + 充值->recharge top-1 enriched (${enrichedTop === 'recharge'})`)
}

run().catch(e => { console.error(e); process.exit(1) })
