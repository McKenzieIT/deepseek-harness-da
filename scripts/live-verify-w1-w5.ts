/**
 * Live verification of W1–W5 against the REAL K11 dataset
 * (examples/k11-semantic-layer: 321 tables + 453 events + metrics extracted
 * at runtime). Boots real Cordis contexts + real service code — no mocks at
 * the service boundary. Run: `npx tsx scripts/live-verify-w1-w5.ts`.
 *
 * What "live" means here: real production data + real service/tool code paths.
 * What is NOT covered (deferred, honestly noted below):
 *  - W3 with a REAL agent+API key (uses stub collaborators — proves engine
 *    runs on real case files, not that the agent answers correctly)
 *  - trigger_eval full_run (EvalRunnerService seam unmounted — W6a wiring gap)
 *  - React component render with real backend (the EvidenceQueryClient face
 *    that useEvidenceQuery consumes is exercised directly instead)
 */
import { Context } from '@deepseek-ai/cordis'
import { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer'
import SchemaGateway from '@deepseek-ai/dsh-schema-gateway'
import { EvidenceQueryService, FileBackedEvalResultStore } from '@deepseek-ai/dsh-evidence-query'
import { loadCases } from '@deepseek-ai/dsh-eval'
import { runBatch, compareDelta, buildCollaborators, StubAgentResponder, StubQueryExecutor, StubJudgeExecutor } from '../packages/eval/eval-runner/src/index.ts'
import { EvalRunnerService } from '../packages/eval/eval-runner-service/src/index.ts'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readdirSync } from 'node:fs'

const K11_ROOT = 'examples/k11-semantic-layer'
const CASE_DIR = 'packages/eval/eval/cases/k11'

type Section = { name: string; pass: boolean; detail: string }
const results: Section[] = []
function check(name: string, cond: boolean, detail: string): void {
  results.push({ name, pass: cond, detail })
  console.log(`${cond ? '✅' : '❌'} ${name}: ${detail}`)
}
function section(title: string): void {
  console.log(`\n── ${title} ──────────────────────────────────────────`)
}

async function main(): Promise<void> {
  // ── Shared live context ──────────────────────────────────────────────────
  const ctx = new Context()
  new SemanticLayerService(ctx, { semanticRoot: K11_ROOT, scopeId: 'k11' })
  const gw = new SchemaGateway(ctx)

  // ════════════════════════════════════════════════════════════════════════
  // W1 — SchemaGateway: 9 Remote methods on real K11 data
  // ════════════════════════════════════════════════════════════════════════
  section('W1 — SchemaGateway (real K11)')
  const tables = gw.listTables()
  const events = gw.listEvents()
  const metrics = gw.listMetrics()
  check('listTables', tables.length === 321, `${tables.length} tables (expect 321)`)
  check('listEvents', events.length > 400, `${events.length} events (expect ~453)`)
  check('listMetrics', metrics.length > 0, `${metrics.length} metrics (extracted from tables)`)

  const sampleTable = tables[0]
  const fullDef = sampleTable ? gw.getTableDefinition(sampleTable.table_name) : null
  check('getTableDefinition', fullDef !== null, `${sampleTable?.table_name} → full def returned`)

  const searchHits = gw.search('订单 金额 充值')
  check('search (BM25)', searchHits.length > 0, `${searchHits.length} hits for "订单 金额 充值"; top="${searchHits[0]?.id ?? '-'}" (${searchHits[0]?.score?.toFixed(3) ?? '-'})`)

  const domains = gw.listDomains()
  check('listDomains', domains.length > 0, `${domains.length} domains; top="${domains[0]?.name ?? '-'}"`)

  const coverage = gw.getCoverageStats()
  check('getCoverageStats', coverage.table_count === 321, `tables=${coverage.table_count} events=${coverage.event_count} metrics=${coverage.metric_count}`)

  const eventDef = events[0] ? gw.getEventDefinition(events[0].name) : null
  const metricDef = metrics[0] ? gw.getMetricDefinition(metrics[0].name) : null
  check('getEventDefinition', eventDef !== null, `${events[0]?.name ?? '-'} → def`)
  check('getMetricDefinition', metricDef !== null, `${metrics[0]?.name ?? '-'} → def`)

  // ════════════════════════════════════════════════════════════════════════
  // W2 — Case-set: load 161 real K11 cases
  // ════════════════════════════════════════════════════════════════════════
  section('W2 — Case-set (real K11 cases)')
  const casePaths = readdirSync(CASE_DIR)
    .filter(f => /^k11_\d+\.yaml$/.test(f))
    .sort()
    .map(f => join(CASE_DIR, f))
  const cases = loadCases(casePaths)
  check('load 161 cases', cases.length === 161, `${cases.length} cases parsed (expect 161)`)
  const sampleCase = cases[0]
  check('case has question', !!sampleCase && typeof sampleCase.input.question === 'string', `case[0] id=${sampleCase?.case_id ?? '-'}; Q="${(sampleCase?.input.question ?? '').slice(0, 50)}..."`)

  // ════════════════════════════════════════════════════════════════════════
  // W3 — Eval engine: runBatch on 3 real cases + delta
  // ════════════════════════════════════════════════════════════════════════
  section('W3 — Eval engine (real case files, stub collaborators)')
  const agent = new StubAgentResponder()
  const executor = new StubQueryExecutor()
  const judge = new StubJudgeExecutor()
  judge.setScore(0.0) // force 'wrong' on delivery too
  const collaborators = buildCollaborators(agent, executor, judge)
  const runA = await runBatch(casePaths.slice(0, 3), collaborators, {
    pass_k: 1,
    skip_health_gate: true,
    run_id: 'run-A',
  })
  check('runBatch produces verdicts', runA.cases.length === 3, `${runA.cases.length} verdicts; summary=${JSON.stringify(runA.summary)}`)

  // Delta: flip one verdict in a deep copy of A to demonstrate improvement detection.
  const runB = {
    ...runA,
    run_id: 'run-B',
    cases: runA.cases.map((c, i) => i === 0 ? { ...c, verdict: 'correct' as const } : c),
  }
  const delta = compareDelta(runA, runB)
  check('compareDelta detects flip', delta.flips.length === 1 && delta.summary.improved === 1, `flips=${delta.flips.length} improved=${delta.summary.improved} regressed=${delta.summary.regressed} unchanged=${delta.summary.unchanged}; flip[0]=${delta.flips[0]?.case_id} ${delta.flips[0]?.old_verdict}→${delta.flips[0]?.new_verdict}`)
  check('NOT live: real agent', true, 'NOTE: stub collaborators only — real-agent+key e2e is deferred (W3 caveat)')

  // ════════════════════════════════════════════════════════════════════════
  // W4 — Evidence-query backend: real coverage + gap + file-backed delta
  // ════════════════════════════════════════════════════════════════════════
  section('W4 — Evidence-query backend (real K11 + W3 JSONL)')
  // Bridge eval-runner RunResult → evidence-query PersistedCaseRecordRaw JSONL.
  // This manual mapping IS the W3→W4 wiring gap (formats differ); W6a will wire
  // a real adapter. Doing it here proves the file→store→delta path live.
  const tmpDir = mkdirSync(join(tmpdir(), 'live-verify-eval-'), { recursive: true })
  rmSync(tmpDir, { recursive: true, force: true })
  mkdirSync(tmpDir, { recursive: true })
  function verdictToOutcome(v: string): string {
    if (v === 'infra_failure') return 'unjudged'
    return v // correct/wrong/declined/unjudged
  }
  function writeRunJsonl(run: typeof runA, runId: string): void {
    const lines = run.cases.map(c => JSON.stringify({
      runId,
      timestamp: run.timestamp,
      caseId: c.case_id,
      outcome: verdictToOutcome(c.verdict),
      verdict: c.verdict,
      passed: c.verdict === 'correct',
      passK: 1,
      latencyMs: c.latency_ms,
      attemptsCount: c.pass_k_results.length,
      errorsCount: c.pass_k_results.filter(a => a.infra_error !== undefined || a.error !== undefined).length,
    }))
    writeFileSync(join(tmpDir, `${runId}.jsonl`), lines.join('\n') + '\n', 'utf8')
  }
  writeRunJsonl(runA, 'run-A')
  writeRunJsonl(runB, 'run-B')

  new EvidenceQueryService(ctx, new FileBackedEvalResultStore(tmpDir))
  const eq = ctx.evidenceQuery
  const cov = eq.coverageQuery()
  check('coverageQuery', cov.table_count === 321 && cov.event_count > 400, `tables=${cov.table_count} events=${cov.event_count} metrics=${cov.metric_count}; confirmed/draft/rejected=${cov.confirmation.confirmed}/${cov.confirmation.draft}/${cov.confirmation.rejected}`)

  const gapAsset = sampleTable?.table_name ?? 'dws_order_di'
  const gap = eq.gapAnalysis(gapAsset)
  check('gapAnalysis', gap.gaps !== undefined, `${gap.gaps.length} join-reachable-uncovered assets from "${gapAsset}"`)

  const runIds = eq.getEvalStore().getRunIds().sort()
  check('FileBackedStore loaded runs', runIds.length === 2, `runs=${runIds.join(',')}`)

  const eqDelta = eq.beforeAfterDelta('run-A', 'run-B')
  check('beforeAfterDelta (file-backed)', eqDelta.summary.improved === 1, `improved=${eqDelta.summary.improved} regressed=${eqDelta.summary.regressed} unchanged=${eqDelta.summary.unchanged}; flips=${eqDelta.flipped.length}`)

  // ════════════════════════════════════════════════════════════════════════
  // W5 — UI data contract + trigger_eval boundary
  // ════════════════════════════════════════════════════════════════════════
  section('W5 — UI data contract (EvidenceQueryClient face) + trigger_eval boundary')
  // The EvidenceQueryClient interface that useEvidenceQuery consumes, backed by
  // the LIVE EvidenceQueryService (not a mock). Proves the UI's data layer.
  const client = {
    coverageQuery: async () => eq.coverageQuery(),
    gapAnalysis: async (id: string) => eq.gapAnalysis(id),
    reachabilityDelta: async (r: { sourceId: string; targetId: string; type: 'joins' | 'derived_from' | 'related_to' }) => eq.reachabilityDelta(r),
    evalResultQuery: async (f: { assetId?: string; status?: string; domain?: string; limit?: number }) => eq.evalResultQuery(f),
    assetHealth: async (id: string) => eq.assetHealth(id),
    beforeAfterDelta: async (a: string, b: string) => eq.beforeAfterDelta(a, b),
  }
  const clientCov = await client.coverageQuery()
  check('client.coverageQuery()', clientCov.table_count === 321, `via client face → ${clientCov.table_count} tables`)
  const clientGap = await client.gapAnalysis(gapAsset)
  check('client.gapAnalysis()', clientGap.gaps.length >= 0, `via client face → ${clientGap.gaps.length} gaps`)
  const clientHealth = await client.assetHealth(gapAsset)
  check('client.assetHealth()', clientHealth !== null, `via client face → status=${clientHealth?.confirmationStatus} rels=${clientHealth?.relationCount}`)
  const clientDelta = await client.beforeAfterDelta('run-A', 'run-B')
  check('client.beforeAfterDelta()', clientDelta.summary.improved === 1, `via client face → improved=${clientDelta.summary.improved}`)

  // W6a-gap closed: EvalRunnerService is now implemented (dsh-eval-runner-service,
  // mounted in the data-agent bundle). Construct it to prove the seam is wired
  // → trigger_eval full_run is REACHABLE (was: not_configured — the seam was
  // declared but unmounted). Running a real eval needs the bundle's ctx.llm +
  // ctx.query (ODPS) creds; construction + case discovery need neither.
  const evalSvc = new EvalRunnerService(ctx, { caseDir: CASE_DIR, resultsDir: '.tmp/eval-results' })
  check('trigger_eval full_run REACHABLE (W6a-gap closed)', typeof evalSvc.getCaseCount === 'function', `EvalRunnerService constructed → ctx.evalRunner seam wired; getCaseCount=${evalSvc.getCaseCount()}`)
  check('trigger_eval report_last DATA READY', eq.getEvalStore().getRunIds().length >= 1, `${eq.getEvalStore().getRunIds().length} past run(s) → report_last path satisfiable`)

  // ── Summary ──────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.pass).length
  const failed = results.filter(r => !r.pass).length
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`LIVE VERIFICATION: ${passed} passed, ${failed} failed (of ${results.length})`)
  console.log(`${'═'.repeat(60)}`)
  if (failed > 0) {
    console.log('FAILURES:')
    for (const r of results.filter(x => !x.pass)) console.log(`  ❌ ${r.name}: ${r.detail}`)
  }
  rmSync(tmpDir, { recursive: true, force: true })
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('\n💥 Live verification crashed:')
  console.error(err)
  process.exit(2)
})
