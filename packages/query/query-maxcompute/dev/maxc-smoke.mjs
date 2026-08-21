#!/usr/bin/env node
// P4c smoke (throwaway verification) — prove the maxc-backed sidecar returns
// REAL ODPS rows through the same raw-MCP-Client `tools/call` path the Provider
// uses (packages/query/query-maxcompute/src/index.ts `callTool`), WITHOUT
// booting the full Cordis + credentials stack. Runs RBI case `eval_10000251_037`'s
// expected SQL against ieu_cdm and asserts the result reproduces
// `expected.result_value` (dau=4336). This is the P4c(a) real-e2e: the hard
// execution-match gate, resolved via maxc.
//
// Run: node packages/query/query-maxcompute/dev/maxc-smoke.mjs
//   (optional env: MAXC_CONFIG, MAXC_BIN)

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { fileURLToPath } from 'node:url'
import { z as zod } from 'zod'

const SIDECAR = fileURLToPath(new URL('./maxc-sidecar.mjs', import.meta.url))
const MAXC_CONFIG = process.env.MAXC_CONFIG ?? '/Users/mckenzie/.maxc/config_ieu_cdm.yaml.bak'
const MAXC_BIN = process.env.MAXC_BIN ?? 'maxc'

// RBI case eval_10000251_037: anchor_ds 20260806 → ds_yesterday = 20260805.
const CASE_SQL =
  "SELECT COUNT(DISTINCT user_id) AS dau FROM ieu_cdm.dws_10000251_univ_acc_act_di WHERE ds = '20260805' AND act = 1"
const EXPECTED_DAU = 4336

// Permissive tools/call result schema (mirror the Provider's RawCallToolResultSchema).
const RawCallToolResultSchema = zod.record(zod.string(), zod.unknown())

function assert(cond, msg) {
  if (!cond) {
    console.error(`\n❌ FAIL: ${msg}`)
    process.exit(1)
  }
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [SIDECAR, '--maxc-config', MAXC_CONFIG, '--maxc-bin', MAXC_BIN],
})
const client = new Client({ name: 'maxc-smoke', version: '0.0.0' }, { capabilities: {} })

await client.connect(transport)
console.log('• sidecar connected via raw MCP Client (same path as Provider.callTool)')

const res = await client.request(
  { method: 'tools/call', params: { name: 'execute', arguments: { scope_id: '10000251', sql: CASE_SQL, mode: 'fast' } } },
  RawCallToolResultSchema,
  { timeout: 120_000 },
)
const text = res.content?.[0]?.text
const outcome = JSON.parse(text)
console.log('• execute outcome:\n' + JSON.stringify(outcome, null, 2))

assert(outcome.state === 'completed', `outcome state completed (got ${outcome.state})`)
const got = outcome.rows?.[0]?.[0]
console.log(`\n• expected dau=${EXPECTED_DAU} | got dau=${got}`)
assert(got === EXPECTED_DAU, `execution-match: case 037 reproduced expected.result_value (got ${got})`)
console.log('✅ PASS — maxc-sidecar execute → real ODPS row (4336); execution-match substrate proven via maxc')

// also exercise estimate_cost (CostGuard input) on the same SQL
const costRes = await client.request(
  { method: 'tools/call', params: { name: 'estimate_cost', arguments: { scope_id: '10000251', sql: CASE_SQL } } },
  RawCallToolResultSchema,
  { timeout: 60_000 },
)
const cost = JSON.parse(costRes.content?.[0]?.text)
console.log('• estimate_cost: ' + JSON.stringify(cost))
assert(typeof cost.input_bytes === 'number', 'estimate_cost returned input_bytes number')

await client.close()
console.log('• sidecar closed; smoke done.')
