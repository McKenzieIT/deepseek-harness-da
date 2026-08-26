#!/usr/bin/env node
// E-DA4 delegate_query Nl2sqlEngine feasibility probe — verifies end-to-end
// that a standalone Nl2sqlEngine can be instantiated per-scope (X63) without
// the Cordis service layer, using only the semantic-layer IO + engine deps.
//
// Run: node --import tsx/esm packages/data/tool-scope-routing/dev/delegate-probe.ts

import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { load as yamlLoad } from 'js-yaml'
import {
  Nl2sqlEngine,
  Bm25Linker,
  ReplayLlm,
  StandInOdps,
  outcome,
  buildPrompt,
  type DataSourceDoc,
  type RetrievalHit,
} from '@deepseek-ai/dsh-nl2sql-engine'
import { loadRetrievalCorpus } from '@deepseek-ai/dsh-semantic-layer'
import { loadConventions } from '@deepseek-ai/dsh-query-maxcompute/src/conventions.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../../../..')
const X63_LAYER = resolve(ROOT, 'examples/x63-semantic-layer')
const K11_LAYER = resolve(ROOT, 'examples/k11-semantic-layer')

interface ScopeConfig {
  project: { name: string; scope_id: string }
  maxcompute: { environment: string; config_file: string }
  event_view: { workspace: string; view_name: string; full_name: string; params_extract_template?: string }
  partition: { field: string; format: string }
  guards: Record<string, unknown>
}

function loadScopeConfig(layerPath: string): ScopeConfig {
  return yamlLoad(readFileSync(resolve(layerPath, 'config.yaml'), 'utf8')) as ScopeConfig
}

let passed = 0
let failed = 0

function assert(cond: boolean, msg: string): void {
  if (cond) {
    passed++
    console.log(`  ✓ ${msg}`)
  } else {
    failed++
    console.error(`  ✗ FAIL: ${msg}`)
  }
}

// ── Experiment 1: BM25 retrieval on X63 corpus ────────────────────────────

function experiment1(): void {
  console.log('\n━━ Experiment 1: Nl2sqlEngine corpus availability for X63 ━━')

  const corpus = loadRetrievalCorpus(X63_LAYER) as readonly DataSourceDoc[]
  console.log(`  corpus size: ${corpus.length} items`)
  assert(corpus.length > 0, `X63 corpus is non-empty (got ${corpus.length} items)`)

  const linker = new Bm25Linker(corpus)
  const hits = linker.retrieve('X63 昨日登录日活', { topK: 5 })
  console.log(`  BM25 hits for "X63 昨日登录日活": ${hits.map(h => `${h.id}(${h.score.toFixed(2)})`).join(', ')}`)

  const hitIds = hits.map(h => h.id)
  assert(hitIds.includes('game.role.online'), 'game.role.online is in top-5 BM25 hits (login = online event)')

  // Verify the corpus does NOT contain K11-specific items
  const hasK11Table = corpus.some(d => d.id.includes('10000251'))
  assert(!hasK11Table, 'X63 corpus contains no K11-specific items (scope isolation)')
}

// ── Experiment 2: Engine cross-scope SQL generation ───────────────────────

async function experiment2(): Promise<void> {
  console.log('\n━━ Experiment 2: Engine cross-scope SQL generation ━━')

  const x63Config = loadScopeConfig(X63_LAYER)
  const corpus = loadRetrievalCorpus(X63_LAYER) as readonly DataSourceDoc[]
  const linker = new Bm25Linker(corpus)

  // The expected SQL for X63 references hdyl_data_sg.ods_10000334_all_view
  const X63_SQL = `SELECT COUNT(DISTINCT role_id) AS dau FROM ${x63Config.event_view.full_name} WHERE ds = '20260825' AND event = 'game.role.online'`

  // 2a: Scripted LLM produces X63-scoped SQL
  const llm = new ReplayLlm({ '登录': { sql: X63_SQL } })

  // 2b: StandInOdps returns a scripted result for X63 table
  const odps = new StandInOdps({ [x63Config.event_view.view_name]: outcome.done([{ dau: 1234 }]) })

  // 2c: Engine with X63 retrieval — test WITHOUT injecting the event view
  const engine = new Nl2sqlEngine({
    llm,
    odps,
    conventions: loadConventions('maxcompute'),
    retrieval: linker,
  })

  const result = await engine.run({ question: 'X63 昨日登录人数', today: '20260826' })
  console.log(`  engine.run result: ok=${result.ok}, sql=${result.sql?.slice(0, 80)}...`)
  console.log(`  trace steps: ${result.trace.map(t => t.step).join(' → ')}`)

  // The critic may reject because ods_10000334_all_view is not in BM25 candidates
  // This is a KNOWN issue the probe is designed to surface
  if (!result.ok && result.trace.some(t => t.step === 'critic' && !(t as Record<string, unknown>).passed)) {
    console.log('  ⚠ Critic rejected: event view not in BM25 candidate set (expected finding)')
    console.log('  → delegate_query must inject event_view into candidateTables')

    // 2d: Verify the fix path — engine with event_view injected into retrieval
    const augmentedCorpus: DataSourceDoc[] = [
      ...corpus,
      { id: x63Config.event_view.view_name, description: `X63 主事件视图 ${x63Config.event_view.full_name}` },
    ]
    const augLinker = new Bm25Linker(augmentedCorpus)
    const llm2 = new ReplayLlm({ '登录': { sql: X63_SQL } })
    const odps2 = new StandInOdps({ [x63Config.event_view.view_name]: outcome.done([{ dau: 1234 }]) })
    const engineAug = new Nl2sqlEngine({ llm: llm2, odps: odps2, conventions: loadConventions('maxcompute'), retrieval: augLinker })
    const result2 = await engineAug.run({ question: 'X63 昨日登录人数', today: '20260826' })
    console.log(`  augmented engine result: ok=${result2.ok}, sql=${result2.sql?.slice(0, 80)}...`)
    assert(result2.ok === true, 'Engine produces correct X63 SQL when event_view is in corpus (augmented path)')
    assert(
      result2.sql?.includes(x63Config.event_view.full_name) ?? false,
      `SQL references ${x63Config.event_view.full_name} (not K11 table)`,
    )
  } else {
    assert(result.ok === true, 'Engine produces correct X63 SQL')
    assert(
      result.sql?.includes(x63Config.event_view.full_name) ?? false,
      `SQL references ${x63Config.event_view.full_name} (not K11 table)`,
    )
  }
}

// ── Experiment 3: ODPS executor cross-workspace config ────────────────────

function experiment3(): void {
  console.log('\n━━ Experiment 3: ODPS executor cross-workspace routing ━━')

  const x63Config = loadScopeConfig(X63_LAYER)
  const k11Config = loadScopeConfig(K11_LAYER)

  console.log(`  X63 environment: ${x63Config.maxcompute.environment}`)
  console.log(`  K11 environment: ${k11Config.maxcompute.environment}`)
  console.log(`  X63 workspace:   ${x63Config.event_view.workspace}`)
  console.log(`  K11 workspace:   ${k11Config.event_view.workspace}`)

  assert(
    x63Config.maxcompute.environment === 'overseas-prod',
    'X63 uses overseas-prod environment',
  )
  assert(
    k11Config.maxcompute.environment === 'domestic-prod',
    'K11 uses domestic-prod environment',
  )
  assert(
    x63Config.event_view.workspace !== k11Config.event_view.workspace,
    `workspaces differ: ${x63Config.event_view.workspace} vs ${k11Config.event_view.workspace}`,
  )
  assert(
    x63Config.event_view.full_name.startsWith(x63Config.event_view.workspace + '.'),
    'X63 full_name is workspace-qualified (hdyl_data_sg.ods_10000334_all_view)',
  )

  // The SQL workspace prefix IS the routing signal — MaxComputeQueryEngine
  // uses the project/workspace in the SQL itself. Per-scope ODPS config routing
  // (different endpoints for overseas-prod vs domestic-prod) is the open question.
  console.log('  → SQL workspace prefix routes to correct ODPS project')
  console.log('  → Per-scope OdpsExecutor config adapter needed if endpoints differ')
}

// ── Experiment 4: Per-scope conventions loading ───────────────────────────

function experiment4(): void {
  console.log('\n━━ Experiment 4: Conventions loading from X63 config ━━')

  const x63Config = loadScopeConfig(X63_LAYER)
  const k11Config = loadScopeConfig(K11_LAYER)

  // Engine-level conventions (SQL dialect) are shared across scopes
  const conventions = loadConventions('maxcompute')
  assert(conventions.engine === 'maxcompute', 'Engine conventions load for maxcompute dialect')
  assert(conventions.functions.length > 0, `conventions has ${conventions.functions.length} function defs`)

  // Per-scope config is what differs: partition, guards, params_extract_template
  assert(x63Config.partition.field === 'ds', 'X63 partition field is ds')
  assert(x63Config.partition.format === 'yyyyMMdd', 'X63 partition format is yyyyMMdd')
  assert(x63Config.guards.select_only === true, 'X63 guards enforce select_only')

  // params_extract_template comes from event_view config
  const x63Template = x63Config.event_view.params_extract_template
  const k11Template = k11Config.event_view.params_extract_template
  console.log(`  X63 params_extract_template: ${x63Template}`)
  console.log(`  K11 params_extract_template: ${k11Template}`)
  assert(
    x63Template === "GET_JSON_OBJECT(params, '$.{field_name}')",
    'X63 params_extract_template matches expected GET_JSON_OBJECT pattern',
  )
  assert(
    x63Template === k11Template,
    'Both scopes use same params_extract_template (same engine dialect)',
  )

  // Prompt injection uses conventions + event_view config — verify buildPrompt works
  const corpus = loadRetrievalCorpus(X63_LAYER) as readonly DataSourceDoc[]
  const linker = new Bm25Linker(corpus)
  const hits = linker.retrieve('登录人数', { topK: 3 })
  const prompt = buildPrompt({
    question: 'X63 昨日登录人数',
    candidates: hits,
    eventDef: null,
    conventions,
  })
  assert(prompt.includes('maxcompute'), 'buildPrompt includes maxcompute dialect grounding')
  assert(prompt.includes('X63 昨日登录人数'), 'buildPrompt includes the question')
  assert(hits.length > 0 && prompt.includes(hits[0]!.id), 'buildPrompt includes BM25 candidate IDs')
  console.log(`  prompt length: ${prompt.length} chars (conventions + question + candidates)`)
}

// ── Experiment 5: Parallel instantiation ──────────────────────────────────

async function experiment5(): Promise<void> {
  console.log('\n━━ Experiment 5: Parallel instantiation (K11 + X63) ━━')

  const x63Corpus = loadRetrievalCorpus(X63_LAYER) as readonly DataSourceDoc[]
  const k11Corpus = loadRetrievalCorpus(K11_LAYER) as readonly DataSourceDoc[]
  console.log(`  K11 corpus: ${k11Corpus.length} items | X63 corpus: ${x63Corpus.length} items`)

  // Augment both with their event views for critic passage
  const x63Config = loadScopeConfig(X63_LAYER)
  const k11Config = loadScopeConfig(K11_LAYER)
  const x63Full: DataSourceDoc[] = [...x63Corpus, { id: x63Config.event_view.view_name, description: 'X63 event view' }]
  const k11Full: DataSourceDoc[] = [...k11Corpus, { id: k11Config.event_view.view_name, description: 'K11 event view' }]

  const X63_SQL = `SELECT COUNT(DISTINCT role_id) AS dau FROM ${x63Config.event_view.full_name} WHERE ds = '20260825' AND event = 'game.role.online'`
  const K11_SQL = `SELECT COUNT(DISTINCT role_id) AS dau FROM ${k11Config.event_view.full_name} WHERE ds = '20260825' AND event = 'game.role.online'`

  const x63Engine = new Nl2sqlEngine({
    llm: new ReplayLlm({ '登录': { sql: X63_SQL } }),
    odps: new StandInOdps({ [x63Config.event_view.view_name]: outcome.done([{ dau: 500 }]) }),
    conventions: loadConventions('maxcompute'),
    retrieval: new Bm25Linker(x63Full),
  })

  const k11Engine = new Nl2sqlEngine({
    llm: new ReplayLlm({ '登录': { sql: K11_SQL } }),
    odps: new StandInOdps({ [k11Config.event_view.view_name]: outcome.done([{ dau: 4336 }]) }),
    conventions: loadConventions('maxcompute'),
    retrieval: new Bm25Linker(k11Full),
  })

  // Run both in parallel
  const [x63Result, k11Result] = await Promise.all([
    x63Engine.run({ question: 'X63 昨日登录人数', today: '20260826' }),
    k11Engine.run({ question: 'K11 昨日登录人数', today: '20260826' }),
  ])

  console.log(`  X63 result: ok=${x63Result.ok}, sql=${x63Result.sql?.slice(0, 60)}...`)
  console.log(`  K11 result: ok=${k11Result.ok}, sql=${k11Result.sql?.slice(0, 60)}...`)

  assert(x63Result.ok === true, 'X63 engine run succeeded in parallel')
  assert(k11Result.ok === true, 'K11 engine run succeeded in parallel')
  assert(
    x63Result.sql?.includes('hdyl_data_sg') ?? false,
    'X63 SQL references hdyl_data_sg workspace (no cross-contamination)',
  )
  assert(
    k11Result.sql?.includes('ieu_ods') ?? false,
    'K11 SQL references ieu_ods workspace (no cross-contamination)',
  )
  assert(
    x63Result.result?.[0] !== k11Result.result?.[0],
    'Results are independent (different row values)',
  )
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('E-DA4 delegate_query Nl2sqlEngine feasibility probe')
  console.log(`  X63 layer: ${X63_LAYER}`)
  console.log(`  K11 layer: ${K11_LAYER}`)

  experiment1()
  await experiment2()
  experiment3()
  experiment4()
  await experiment5()

  console.log('\n━━ Summary ━━')
  console.log(`  passed: ${passed}`)
  console.log(`  failed: ${failed}`)

  if (failed > 0) {
    console.log('\n⚠ Some assertions failed — see details above for required adaptations.')
    console.log('  Key findings feed back into the delegate_query implementation design.')
    process.exit(1)
  } else {
    console.log('\n✅ All experiments passed — P-DA4 delegate_query via Nl2sqlEngine is viable.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(2)
})
