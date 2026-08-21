#!/usr/bin/env node
// P4c(c) smoke (throwaway verification) — prove the model-facing `query_data`
// tool returns REAL ODPS rows THROUGH THE TOOL PATH (defineTool execute ->
// ctx.query.execute -> MaxCompute provider -> maxc-sidecar -> real ODPS), NOT
// a direct sidecar call (that was the P4c(a) maxc-smoke.mjs). Boots a minimal
// cordis ctx + fake credentials + the MaxCompute provider (whose [Service.init]
// spawns the maxc-sidecar and connects a raw SDK Client), captures the
// query_data tool definition the plugin registers (on a proxy ctx that
// delegates ctx.get('query') to the real provider), and calls its execute with
// RBI case eval_10000251_037's expected SQL, asserting the result reproduces
// expected.result_value (dau=4336). This is the P4c(c) real-e2e: the agent-side
// execution-match gate, through the tool the preset mounts.
//
// Run: node --import tsx/esm packages/query/query-tool/dev/query-tool-smoke.ts
//   (optional env: MAXC_CONFIG, MAXC_BIN)

import { Context } from '@deepseek-ai/cordis'
import { fileURLToPath } from 'node:url'
import { MaxComputeQueryEngine } from '../../query-maxcompute/src/index.ts'
import { FakeCredsProvider } from '../../query-maxcompute/dev/fake-credentials.ts'
import { apply, type QueryDataResult } from '../src/index.ts'

const SIDECAR = fileURLToPath(new URL('../../query-maxcompute/dev/maxc-sidecar.mjs', import.meta.url))
const MAXC_CONFIG = process.env.MAXC_CONFIG ?? '/Users/mckenzie/.maxc/config_ieu_cdm.yaml.bak'
const MAXC_BIN = process.env.MAXC_BIN ?? 'maxc'

// RBI case eval_10000251_037: anchor_ds 20260806 -> ds_yesterday = 20260805.
const CASE_SQL =
  "SELECT COUNT(DISTINCT user_id) AS dau FROM ieu_cdm.dws_10000251_univ_acc_act_di WHERE ds = '20260805' AND act = 1"
const EXPECTED_DAU = 4336

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`\n❌ FAIL: ${msg}`)
    process.exit(1)
  }
}

/** The subset of the registered tool definition the smoke exercises. */
interface QueryDataDef {
  readonly name: string
  readonly execute: (
    args: { sql: string; scope_id: string },
    exec: { signal: AbortSignal },
  ) => Promise<QueryDataResult>
}

async function main(): Promise<void> {
  const ctx = new Context()
  ctx.plugin(FakeCredsProvider)
  const fiber = ctx.plugin(MaxComputeQueryEngine, {
    command: process.execPath,
    args: [SIDECAR, '--maxc-config', MAXC_CONFIG, '--maxc-bin', MAXC_BIN],
  })
  await fiber
  const provider = ctx.query as MaxComputeQueryEngine
  // cordis `await fiber` registers the fiber but does NOT await [Service.init]'s
  // eager connect; start() guarantees the sidecar is connected before first use.
  await provider.start()
  console.log('• booted cordis ctx + FakeCreds + MaxCompute provider (maxc-sidecar)')

  // Capture the query_data tool def the plugin registers, on a proxy ctx that
  // delegates ctx.get('query') to the real provider. This is the defineTool
  // execute the preset mounts (with arg validation), called against the real
  // provider — the tool path, not a direct sidecar call.
  let def: QueryDataDef | undefined
  const proxyCtx = {
    tools: {
      register: (d: QueryDataDef) => {
        if (def === undefined && d?.name === 'query_data') def = d
      },
    },
    get: (key: string) => (key === 'query' ? provider : undefined),
  } as unknown as Context
  apply(proxyCtx, {})
  if (def === undefined) throw new Error('apply did not register the query_data tool')
  console.log(`• captured tool def: ${def.name}`)

  const result = await def.execute({ sql: CASE_SQL, scope_id: '10000251' }, { signal: new AbortController().signal })
  console.log('• query_data execute result:\n' + JSON.stringify(result, null, 2))

  assert(result.state === 'completed', `outcome state completed (got ${result.state})`)
  const got = result.rows?.[0]?.[0]
  console.log(`\n• expected dau=${EXPECTED_DAU} | got dau=${got}`)
  assert(
    got === EXPECTED_DAU,
    `execution-match through the tool path: case 037 reproduced expected.result_value (got ${got})`,
  )
  console.log('✅ PASS — query_data tool execute -> real ODPS row (4336) via maxc; tool-path execution-match proven')

  await fiber.dispose()
  console.log('• provider disposed; smoke done.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
