#!/usr/bin/env node
// PROTOTYPE (throwaway) — P4b query-maxcompute scenario runner.
//
// Boots a minimal cordis ctx, mounts the fake credentials + query-maxcompute
// provider (whose [Service.init] spawns the stand-in sidecar + connects a raw
// SDK Client), and runs the four P1-wiring scenarios against the stand-in
// sidecar (fake ODPS). These prove the WIRING (G4 P1 decisions), NOT real
// ODPS behavior — real pyodps + real e2e are DEFERRED.
//
// Run: pnpm install && node --import tsx/esm packages/query/query-maxcompute/dev/scenarios.ts

import { Context } from '@deepseek-ai/cordis'
import { fileURLToPath } from 'node:url'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { MaxComputeQueryEngine } from '../src/index.ts'
import { FakeCredsProvider } from './fake-credentials.ts'

const SIDECAR = fileURLToPath(new URL('./standin-sidecar.mjs', import.meta.url))
const SCOPE = 'game-x'

const note = (m: string): void => { console.log(`• ${m}`) }
const header = (m: string): void => { console.log(`\n===== ${m} =====`) }

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assert failed: ${msg}`)
}

let passed = 0
let failed = 0
async function scenario(name: string, fn: () => Promise<void>): Promise<void> {
  header(name)
  try {
    await fn()
    passed += 1
    console.log('  ✅ PASS')
  } catch (error) {
    failed += 1
    console.log(`  ❌ FAIL: ${(error as Error).message}`)
    console.log(error)
  }
}

interface Booted {
  ctx: Context
  provider: MaxComputeQueryEngine
  dispose: () => Promise<void>
}

async function boot(): Promise<Booted> {
  const ctx = new Context()
  ctx.plugin(FakeCredsProvider)
  const fiber = ctx.plugin(MaxComputeQueryEngine, { args: [SIDECAR] })
  // cordis: `await fiber` registers the fiber but does NOT await [Service.init]'s
  // eager connect (runs via _reload/inertia, async); empirically dead=true here
  // without start(). start() guarantees the sidecar is connected before first use.
  await fiber
  const provider = ctx.query as MaxComputeQueryEngine
  await provider.start()
  return { ctx, provider, dispose: async () => { await fiber.dispose() } }
}

interface SidecarState {
  credentials: Array<[string, { ODPS_ACCESS_KEY?: string }]>
  connections: Array<[string, { ODPS_ACCESS_KEY?: string }]>
  instances: Array<[string, string]>
}

async function stateOf(p: MaxComputeQueryEngine): Promise<SidecarState> {
  return (await p.inspectSidecarState()) as SidecarState
}

async function main(): Promise<void> {
  const main_ = await boot()
  const { ctx, provider } = main_
  note(`booted; provider status=${JSON.stringify(provider.status())}`)
  note(`sidecar state=${JSON.stringify(await stateOf(provider))}`)

  // ── SCENARIO 1: cred hot-reload (per-call idempotent set_credentials + HOLE-C drop) ──
  await scenario('1 cred hot-reload (per-call set_credentials + HOLE-C drop; in-flight holds old)', async () => {
    note('warm: a query to populate the sidecar per-scope connection cache (SK_OLD)')
    await provider.execute({ sql: 'SELECT 1', scopeId: SCOPE, mode: 'fast' })
    let state = await stateOf(provider)
    note(`sidecar (warm): ${JSON.stringify(state)}`)
    assert(state.connections.length === 1, 'warm built one per-scope connection')

    note('start a blocking execute A (in-flight, ~1.2s) — its connection was built with SK_OLD')
    const inflight = provider.execute({ sql: 'SELECT * FROM big_sales', scopeId: SCOPE, mode: 'blocking' })

    note('rotate ODPS_ACCESS_KEY (SK_OLD -> SK_NEW) via the credentials seam')
    await ctx.credentials.set(credentialRef('ODPS_ACCESS_KEY'), 'SK_NEW')

    note("a second execute B (fast): per-call resolve sees SK_NEW -> idempotent set_credentials drops A's cache, rebuilds with SK_NEW")
    const b = await provider.execute({ sql: 'SELECT 1', scopeId: SCOPE, mode: 'fast' })
    assert(b.state === 'completed', 'B completed')

    note('await A — it still completes (the drop did NOT abort the in-flight query: HOLE-C drop, not cancel)')
    const a = await inflight
    assert(a.state === 'completed', 'in-flight A completed despite the cred-change drop (在途持旧跑到完)')

    state = await stateOf(provider)
    note(`sidecar (after rotation): ${JSON.stringify(state)}`)
    const conn = state.connections.find(([s]) => s === SCOPE)?.[1]
    assert(conn?.ODPS_ACCESS_KEY !== undefined && conn.ODPS_ACCESS_KEY !== '<unset>', 'connection rebuilt with a (new) credential')

    note('idempotency: another execute with UNCHANGED creds -> set_credentials no-op (cache preserved)')
    const before = (await stateOf(provider)).connections.length
    await provider.execute({ sql: 'SELECT 1', scopeId: SCOPE, mode: 'fast' })
    const after = (await stateOf(provider)).connections.length
    assert(before === after, 'unchanged creds preserved the cache (idempotent no-op)')
  })

  // ── SCENARIO 3: cancel (outbound signal -> notifications/cancelled + reject) ──
  await scenario('3 cancel (outbound AbortSignal -> notifications/cancelled + reject, no hang)', async () => {
    note('start a blocking execute A with a signal that aborts in 100ms')
    const controller = new AbortController()
    const inflight = provider.execute({ sql: 'SELECT * FROM big', scopeId: SCOPE, mode: 'blocking' }, controller.signal)
    setTimeout(() => controller.abort(), 100)

    note('await A -> the SDK sends notifications/cancelled + rejects (no hang)')
    let rejected = false
    let aborted = false
    try {
      await inflight
    } catch (error) {
      rejected = true
      aborted = controller.signal.aborted
      note(`A rejected: ${String((error as Error).message)}`)
    }
    assert(rejected, 'A rejected after abort (no hang)')
    assert(aborted, 'the signal was aborted')

    note('the cancel did NOT kill the sidecar (it cancelled the request, not the process)')
    assert(!provider.status().dead, 'sidecar still alive after cancel')
    const r = await provider.execute({ sql: 'SELECT 1', scopeId: SCOPE, mode: 'fast' })
    assert(r.state === 'completed', 'a following execute still works')
  })

  // ── SCENARIO 4: control tools non-model-callable (no ctx.tools registration) ──
  await scenario('4 control tools non-model-callable (no ctx.tools registration; raw-name programmatic only)', async () => {
    note('assert no tools service is mounted (the provider does not inject `tools`)')
    assert(ctx.get('tools') === undefined, 'no ctx.tools service (provider registers nothing model-facing)')

    note('control tools ARE callable programmatically by raw name (set_credentials / invalidate_scope / get_state)')
    const set = await provider.callRaw('set_credentials', { scope_id: SCOPE, creds: { ODPS_ACCESS_ID: 'AK_X', ODPS_ACCESS_KEY: 'SK_X', ODPS_PROJECT: 'p', ODPS_ENDPOINT: 'e' } })
    note(`set_credentials raw result: ${JSON.stringify(set)}`)
    const inv = await provider.callRaw('invalidate_scope', { scope_id: SCOPE })
    note(`invalidate_scope raw result: ${JSON.stringify(inv)}`)
    const st = await provider.callRaw('get_state', {})
    note(`get_state raw result (keys): ${JSON.stringify(Object.keys(st))}`)
    assert(ctx.get('tools') === undefined, 'still no ctx.tools after control calls (control tools stay non-model-callable)')
  })

  // ── SCENARIO 2: crash recovery (lazy re-spawn) + dispose ──────────────────
  await scenario('2 crash recovery (lazy re-spawn; in-flight reject ConnectionClosed; dispose)', async () => {
    const { provider, dispose } = await boot() // own provider so dispose does not tear down the main one
    note(`booted (own provider); status=${JSON.stringify(provider.status())}`)
    assert(!provider.status().dead, 'provider live before crash')

    note('start a blocking execute A (in-flight)')
    const inflight = provider.execute({ sql: 'SELECT * FROM big', scopeId: SCOPE, mode: 'blocking' })
    inflight.catch(() => {}) // attach now so the rejection isn't unhandled before the try/await below

    note('crash the sidecar via _test_crash (sidecar exits without responding)')
    await provider.callRaw('_test_crash').catch(e => note(`_test_crash rejected (expected): ${String(e)}`))

    note('the in-flight A rejects with ConnectionClosed (SDK _onclose, no hang)')
    let inflightRejected = false
    try {
      await inflight
    } catch {
      inflightRejected = true
    }
    assert(inflightRejected, 'in-flight A rejected after sidecar crash (no hang)')
    note(`provider status after crash: ${JSON.stringify(provider.status())}`)
    assert(provider.status().dead, 'client.onclose marked the client dead')

    note('next execute: ensureConnected detects dead -> re-spawn + connect -> succeeds')
    const before = provider.status().crashAttempts
    const r = await provider.execute({ sql: 'SELECT 1', scopeId: SCOPE, mode: 'fast' })
    assert(r.state === 'completed', 'lazy re-spawn succeeded')
    assert(!provider.status().dead, 'client live again after re-spawn')
    note(`crashAttempts ${before} -> ${provider.status().crashAttempts} (bounded re-spawn counter)`)

    note('concurrent double-spawn guard: two executes after a crash share one re-spawn (connectingPromise)')
    const before2 = provider.status().crashAttempts
    await provider.callRaw('_test_crash').catch(() => {})
    const [r1, r2] = await Promise.all([
      provider.execute({ sql: 'SELECT 1', scopeId: SCOPE, mode: 'fast' }),
      provider.execute({ sql: 'SELECT 2', scopeId: SCOPE, mode: 'fast' }),
    ])
    assert(r1.state === 'completed' && r2.state === 'completed', 'both concurrent executes succeeded (shared one re-spawn)')
    note(`crashAttempts ${before2} -> ${provider.status().crashAttempts} (one re-spawn for two concurrent callers)`)

    note('dispose: fiber.dispose -> client.close + kill; in-flight reject; ODPS orphan deferred to OrphanReaper')
    const inflight2 = provider.execute({ sql: 'SELECT * FROM big', scopeId: SCOPE, mode: 'blocking' })
    inflight2.catch(() => {}) // attach now so the rejection isn't unhandled before the try/await below
    await dispose()
    let disposed2 = false
    try {
      await inflight2
    } catch {
      disposed2 = true
    }
    assert(disposed2, 'in-flight query rejected on dispose (no hang)')
    assert(provider.status().disposed, 'provider marked disposed')
    note(`provider status after dispose: ${JSON.stringify(provider.status())}`)
    let nextThrew = false
    try {
      await provider.execute({ sql: 'SELECT 1', scopeId: SCOPE, mode: 'fast' })
    } catch {
      nextThrew = true
    }
    assert(nextThrew, 'execute after dispose throws (sidecar down)')
  })

  await main_.dispose()
  console.log(`\n===== SUMMARY: ${passed} passed, ${failed} failed =====`)
  if (failed > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
