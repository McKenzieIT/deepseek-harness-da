#!/usr/bin/env node
// PROTOTYPE (throwaway) — P4 query-engine trio · da-side orchestrator.
// Demonstrates the trio state model: ctx.query seam (engine-wrapper guard chain) +
// query-maxcompute provider (mcp-client stand-in -> fake sidecar subprocess, creds via spawn env / F2) +
// tool-query consumer (session gates G1/G5, 3-execute) + 3-state QueryOutcome +
// credentials/updated -> invalidate_scope. See README.md for decisions + assumptions + surfaced tension.

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const SIDECAR = fileURLToPath(new URL('sidecar.mjs', import.meta.url))
const CREDS = ['ODPS_ACCESS_ID', 'ODPS_ACCESS_KEY', 'ODPS_PROJECT', 'ODPS_ENDPOINT']
const note = m => console.log(`• ${m}`)

// ---- fake ctx.credentials (per-call resolve, NO cross-op cache; mirrors CredentialProvider) ----
const credStore = new Map([
  ['ODPS_ACCESS_ID', { value: 'AK_OLD', source: 'file' }],
  ['ODPS_ACCESS_KEY', { value: 'SK_OLD', source: 'file' }],
  ['ODPS_PROJECT', { value: 'proj-game-x', source: 'file' }],
  ['ODPS_ENDPOINT', { value: 'odps.cn', source: 'file' }],
])
const credListeners = new Set()
const resolve = async ref => { const e = credStore.get(ref); return e ? { value: e.value, source: e.source } : undefined }  // per-call, no cache
const setCredential = async (ref, val) => { credStore.set(ref, { value: val, source: 'file' }); for (const l of credListeners) await l(ref) }  // emits credentials/updated
const onCredentialsUpdated = fn => credListeners.add(fn)

// ---- mcp-client STAND-IN: spawn sidecar; StdioConfig.env = resolved creds over scrubbed ambient; minimal stdio JSON ----
let child = null, buf = '', pending = new Map(), nextId = 1
const scrubbedEnv = () => { const e = { ...process.env }; for (const r of CREDS) delete e[r]; return e }
async function startSidecar() {
  const env = { ...scrubbedEnv() }
  for (const r of CREDS) { const c = await resolve(r); if (c) env[r] = c.value }  // per-call resolve -> spawn env (F2 / R2 §5.2c)
  child = spawn('node', [SIDECAR], { env, stdio: ['pipe', 'pipe', 'pipe'] })
  buf = ''
  child.stdout.on('data', d => {
    buf += d; let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue
      try { const res = JSON.parse(line); const p = pending.get(res.id); if (p) { pending.delete(res.id); p(res) } } catch { /* malformed */ }
    }
  })
  child.stderr.on('data', d => process.stderr.write(d))
  return new Promise((res, rej) => { child.on('spawn', res); child.on('error', rej) })
}
const stopSidecar = () => { if (child) { child.kill(); child = null } }
async function restartSidecar() { note('reconnect: dispose + re-spawn sidecar (drops ALL scope caches — over-broad per E)'); stopSidecar(); await startSidecar() }
async function callSidecar(op, args = {}) {
  const id = nextId++
  return new Promise((res, rej) => {
    pending.set(id, res)
    child.stdin.write(JSON.stringify({ id, op, ...args }) + '\n')
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error(`sidecar timeout op=${op}`)) } }, 5000)
  })
}

// ---- ctx.query seam: engine-wrapper guard chain (cost->timeout->retry->orphan) INSIDE execute (A1-split, mirrors pipeline.py) ----
const ctxQueryExecute = async (sql, scope_id, { mode = 'fast' } = {}) => {
  // per-query executor: each execute is independent (sidecar hands a fresh instance_id) ->
  // no _instance overwrite across G1/G5/main (SIMPLER than rbi's 3-execute-on-one-executor; no canceller_for overwrite risk).
  const cost = await callSidecar('estimate_cost', { scope_id, sql })                  // CostGuard: estimate_cost on same provider
  const outcome = await callSidecar('query', { scope_id, sql, mode })                  // TimeoutGuard: patience window; mode=slow -> QueryPending (no cancel)
  // RetryGuard / OrphanReaper: stubbed in this prototype
  return outcome.result
}
const ctxQueryAttach = async (instance_id) => (await callSidecar('attach', { instance_id })).result  // resume; NOT through guard chain

// ---- credentials/updated -> invalidate sidecar scope (decision E) ----
let currentScope = 'game-x'
onCredentialsUpdated(async (ref) => {
  const r = await callSidecar('invalidate_scope', { scope_id: currentScope })
  note(`credentials/updated(${ref}) -> invalidate_scope(${currentScope}) -> ${JSON.stringify(r.result)}`)
  note(`⚠ F2 spawn-env tension: sidecar env is FIXED at spawn. invalidate_scope dropped ${currentScope}'s cache, but the sidecar rebuilds the next connection from STALE spawn-env creds. To pick up the new value: restart sidecar (drops ALL scopes — over-broad, contra E) OR switch cred injection to a per-call set_credentials sidecar channel (diverges from R2 §5.2c "StdioConfig.env").`)
})

// ---- tool-query consumer: session gates G1/G5 + 3-execute (A1-split, mirrors execution.py) ----
async function toolQuery(sql, scope_id, { mode = 'fast' } = {}) {
  currentScope = scope_id
  note(`tool-query(sql, scope_id=${scope_id}, mode=${mode}) -> session gates (mirror execution.py)`)
  const g1 = await ctxQueryExecute(`--G1 sample probe\nSELECT 1`, scope_id, { mode: 'fast' })   // 3-execute #1
  note(`  G1 sampling gate: probe -> ${g1.state} ✓`)
  const g5 = await ctxQueryExecute(`--G5 COUNT(*) probe\nSELECT COUNT(*)`, scope_id, { mode: 'fast' })  // 3-execute #2
  note(`  G5 COUNT gate: probe -> ${g5.state} ✓`)
  note(`  main -> ctx.query.execute (engine-wrapper: cost->timeout->retry->orphan, mirror pipeline.py)`)  // 3-execute #3
  const main = await ctxQueryExecute(sql, scope_id, { mode })
  note(`  main -> ${main.state}`)
  return { g1, g5, main }
}

async function printState() {
  const s = (await callSidecar('get_state')).result
  console.log('\n===== STATE =====')
  console.log('[da] cred store   :', Object.fromEntries([...credStore.entries()].map(([r, e]) => [r, `${e.value} (${e.source})`])))
  console.log('[da] currentScope :', currentScope)
  console.log('[sidecar] envCreds:', JSON.stringify(s.envCreds))
  console.log('[sidecar] conns   :', JSON.stringify(s.connections))
  console.log('[sidecar] insts   :', JSON.stringify(s.instances))
  console.log('=================\n')
}

const SCENARIOS = {
  '1': async () => { note('SCENARIO 1: fast-Completed'); await toolQuery('SELECT game_id, rev FROM sales', 'game-x', { mode: 'fast' }) },
  '2': async () => {
    note('SCENARIO 2: slow -> Pending -> attach -> Completed')
    const { main } = await toolQuery('SELECT * FROM big_sales', 'game-x', { mode: 'slow' })
    if (main.state === 'pending') { note(`main pending (instance_id=${main.instance_id}); attach (resume, no guard chain)`); const r = await ctxQueryAttach(main.instance_id); note(`attach -> ${r.state}`) }
  },
  '3': async () => { note('SCENARIO 3: Failed'); await toolQuery('SELECT bogus FROM', 'game-x', { mode: 'fail' }) },
  '4': async () => {
    note('SCENARIO 4: cred-change -> invalidate (surfaces F2 spawn-env tension)')
    note('warm: a query to populate sidecar scope cache:'); await toolQuery('SELECT 1', 'game-x', { mode: 'fast' })
    await printState()
    note('rotate ODPS_ACCESS_KEY (SK_OLD -> SK_NEW) -> emits credentials/updated:')
    await setCredential('ODPS_ACCESS_KEY', 'SK_NEW')
    await printState()
    note('next query rebuilds sidecar connection from STALE spawn-env (SK_OLD), NOT da-side SK_NEW:')
    await toolQuery('SELECT 1', 'game-x', { mode: 'fast' })
    await printState()
    note('restart sidecar (reconnect) with fresh env -> picks up SK_NEW (but drops ALL scopes):')
    await restartSidecar()
    await toolQuery('SELECT 1', 'game-x', { mode: 'fast' })
    await printState()
  },
  '5': printState,
}

async function main() {
  await startSidecar()
  note('sidecar booted (creds via spawn env per F2)')
  if (process.argv.includes('--demo')) {
    for (const k of ['1', '2', '3', '4']) { await SCENARIOS[k](); await printState() }
    stopSidecar(); return
  }
  const rl = readline.createInterface({ input, output })
  while (true) {
    console.log('\nP4 query-engine prototype — pick:\n  1 fast-Completed\n  2 slow->Pending->attach->Completed\n  3 Failed\n  4 cred-change->invalidate (F2 tension)\n  5 print state\n  q quit')
    const a = (await rl.question('> ')).trim()
    if (a === 'q') break
    if (SCENARIOS[a]) { try { await SCENARIOS[a]() } catch (e) { console.error(e) }; await printState() }
    else console.log('?')
  }
  stopSidecar(); rl.close()
}
main().catch(e => { console.error(e); stopSidecar(); process.exit(1) })
