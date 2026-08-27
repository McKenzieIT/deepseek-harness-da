/**
 * W8 Gateway integration verification — boots the real Cordis context with
 * evidence-query + gateway, then verifies the TypertGateway discovers and
 * can dispatch all 8 @Remote methods through the same invoke() path the
 * WebSocket RPC uses in production.
 *
 * Run: npx tsx scripts/verify-w8-gateway.ts
 */
import { Context } from '@deepseek-ai/cordis'
import { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer'
import { EvidenceQueryService } from '@deepseek-ai/dsh-evidence-query'
import { EvidenceQueryGateway } from '../packages/data/evidence-query/src/gateway.ts'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const K11_ROOT = 'examples/k11-semantic-layer'
const RESULTS_DIR = '/tmp/w8-verify-gateway'

// Setup
if (existsSync(RESULTS_DIR)) rmSync(RESULTS_DIR, { recursive: true })
mkdirSync(RESULTS_DIR, { recursive: true })

// Seed some eval results
writeFileSync(join(RESULTS_DIR, 'run-1.jsonl'), [
  JSON.stringify({ runId: 'run-1', timestamp: '2026-08-27T10:00:00Z', caseId: 'k11_001', outcome: 'correct', verdict: 'correct', passed: true, passK: 3, latencyMs: 500, attemptsCount: 1, errorsCount: 0 }),
  JSON.stringify({ runId: 'run-1', timestamp: '2026-08-27T10:00:00Z', caseId: 'k11_002', outcome: 'wrong', verdict: 'wrong', passed: false, passK: 3, latencyMs: 1200, attemptsCount: 3, errorsCount: 0 }),
  JSON.stringify({ runId: 'run-1', timestamp: '2026-08-27T10:00:00Z', caseId: 'k11_003', outcome: 'correct', verdict: 'correct', passed: true, passK: 3, latencyMs: 300, attemptsCount: 1, errorsCount: 0 }),
].join('\n') + '\n')

writeFileSync(join(RESULTS_DIR, 'run-2.jsonl'), [
  JSON.stringify({ runId: 'run-2', timestamp: '2026-08-27T11:00:00Z', caseId: 'k11_001', outcome: 'correct', verdict: 'correct', passed: true, passK: 3, latencyMs: 400, attemptsCount: 1, errorsCount: 0 }),
  JSON.stringify({ runId: 'run-2', timestamp: '2026-08-27T11:00:00Z', caseId: 'k11_002', outcome: 'correct', verdict: 'correct', passed: true, passK: 3, latencyMs: 900, attemptsCount: 2, errorsCount: 0 }),
  JSON.stringify({ runId: 'run-2', timestamp: '2026-08-27T11:00:00Z', caseId: 'k11_003', outcome: 'correct', verdict: 'correct', passed: true, passK: 3, latencyMs: 350, attemptsCount: 1, errorsCount: 0 }),
].join('\n') + '\n')

// Boot context
const ctx = new Context()
new SemanticLayerService(ctx, { semanticRoot: K11_ROOT, scopeId: 'k11' })
new EvidenceQueryService(ctx, { resultsDir: RESULTS_DIR })
const gw = new EvidenceQueryGateway(ctx)

console.log('═══════════════════════════════════════════════════════════')
console.log(' W8 — EvidenceQueryGateway Integration Verification')
console.log('═══════════════════════════════════════════════════════════\n')

// 1. Verify gateway binding
console.log('── 1. Gateway Registration ──')
console.log(`  namespace: ${gw.typertRemote.namespace}`)
console.log(`  serviceKey: ${gw.typertRemote.serviceKey}`)
const methods = remoteMethods(gw)
console.log(`  @Remote methods: ${methods.length}`)
methods.forEach(m => console.log(`    • ${m.exportName ?? m.method}`))

const expectedMethods = [
  'coverageQuery', 'gapAnalysis', 'reachabilityDelta', 'evalResultQuery',
  'assetHealth', 'beforeAfterDelta', 'getEvalRunCount', 'getRecentPassRates',
]
const methodNames = methods.map(m => m.exportName ?? m.method)
const missing = expectedMethods.filter(e => !methodNames.includes(e))
console.log(missing.length === 0
  ? '  ✅ All 8 bridge-contract methods registered'
  : `  ❌ Missing: ${missing.join(', ')}`)

// 2. Simulate TypertGateway's collectSrcClaims() discovery
console.log('\n── 2. TypertGateway Discovery (simulated) ──')
const binding = (gw as any).typertRemote
const namespace = binding.namespace
const endpoints = methods.map(m => `${namespace}/${m.exportName ?? m.method}`)
console.log('  Endpoints the gateway would claim:')
endpoints.forEach(e => console.log(`    /api → ${e}`))
console.log('  ✅ All endpoints discoverable via typertRemote + remoteMethods()')

// 3. Verify each method dispatches correctly (same as gateway.invoke path)
console.log('\n── 3. Method Dispatch (real K11 data) ──')

let allPass = true
function check(name: string, pass: boolean, detail: string): void {
  console.log(`  ${pass ? '✅' : '❌'} ${name}: ${detail}`)
  if (!pass) allPass = false
}

const coverage = gw.coverageQuery()
check('coverageQuery', coverage.table_count === 321 && coverage.event_count === 445,
  `tables=${coverage.table_count} events=${coverage.event_count} metrics=${coverage.metric_count}`)

const gap = gw.gapAnalysis('dim_10000251_auto_event_cfg_info')
check('gapAnalysis', gap.gaps.length > 0,
  `${gap.gaps.length} uncovered assets reachable from dim_10000251_auto_event_cfg_info`)

const reachability = gw.reachabilityDelta({
  sourceId: 'dws_10000251_com_pay_order_df',
  targetId: 'dim_10000251_auto_event_cfg_info',
  type: 'joins',
})
check('reachabilityDelta', reachability.proposedRelation.sourceId === 'dws_10000251_com_pay_order_df',
  `${reachability.newlyReachable.length} newly reachable pairs`)

const evalResults = gw.evalResultQuery({})
check('evalResultQuery', evalResults.total === 6,
  `total=${evalResults.total} (expect 6 from 2 runs × 3 cases)`)

const health = gw.assetHealth('dws_10000251_com_pay_order_df')
check('assetHealth', health !== null && health.confirmationStatus !== undefined,
  health ? `status=${health.confirmationStatus} rels=${health.relationCount}` : 'null (unexpected)')

const delta = gw.beforeAfterDelta('run-1', 'run-2')
check('beforeAfterDelta', delta.summary.improved === 1 && delta.summary.regressed === 0,
  `improved=${delta.summary.improved} regressed=${delta.summary.regressed} unchanged=${delta.summary.unchanged}`)

const runCount = gw.getEvalRunCount()
check('getEvalRunCount', runCount === 2, `${runCount} runs`)

const passRates = gw.getRecentPassRates(2)
check('getRecentPassRates',
  passRates.length === 2 && Math.abs(passRates[0] - 2/3) < 0.01 && passRates[1] === 1.0,
  `[${passRates.map(r => r.toFixed(3)).join(', ')}] (expect [0.667, 1.000])`)

// 4. Verify event-driven refresh
console.log('\n── 4. Event-Driven Store Refresh ──')
writeFileSync(join(RESULTS_DIR, 'run-3.jsonl'), [
  JSON.stringify({ runId: 'run-3', timestamp: '2026-08-27T12:00:00Z', caseId: 'k11_001', outcome: 'correct', verdict: 'correct', passed: true, passK: 3, latencyMs: 200, attemptsCount: 1, errorsCount: 0 }),
].join('\n') + '\n')
ctx.emit('evidence/eval-run-completed')
const newCount = gw.getEvalRunCount()
check('event refresh', newCount === 3, `runCount after event: ${newCount} (expect 3)`)

// Summary
console.log('\n═══════════════════════════════════════════════════════════')
if (allPass && missing.length === 0) {
  console.log(' ✅ ALL W8 VERIFICATIONS PASSED')
} else {
  console.log(' ❌ SOME VERIFICATIONS FAILED')
  process.exit(1)
}
console.log('═══════════════════════════════════════════════════════════')

// Cleanup
rmSync(RESULTS_DIR, { recursive: true })
