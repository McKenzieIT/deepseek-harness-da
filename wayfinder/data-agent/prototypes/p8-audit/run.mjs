#!/usr/bin/env node
// PROTOTYPE (throwaway) — P8 audit · demo driver. See README.md.
// `node run.mjs --demo` auto-runs all 6 scenarios + prints full audit state after each.
// `node run.mjs`        interactive menu.
//
// Scratch DB: ./audit.PROTOTYPE-wipe-me.db (+ -wal/-shm sidecars) — wiped at start of every run.

import { unlinkSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { createHarness } from './harness-stub.mjs'
import { installAudit } from './audit.mjs'
import { SQLiteAuditStore } from './store.mjs'

const DB = new URL('./audit.PROTOTYPE-wipe-me.db', import.meta.url).pathname
for (const s of ['', '-wal', '-shm']) { try { unlinkSync(DB + s) } catch {} }   // clean scratch DB

const store = new SQLiteAuditStore(DB)
const ctx = createHarness()
installAudit(ctx, store)

// ── identities (simulated per-request login state; P9 will supply the real ctx.identity) ──
const alice = { tenant_id: 'acme', scope_id: 'game-1', user_id: 'alice', session_id: 'sess-alice-1' }
const bob   = { tenant_id: 'acme', scope_id: 'game-2', user_id: 'bob',   session_id: 'sess-bob-1' }
const admin = { privileged: true }                                              // compliance officer / P9 admin
const t1fb  = { tenant_id: 'acme', scope_id: 'game-1', user_id: null,  session_id: 'sess-t1' } // T1 global fallback (no per-user PAT)

const banner = (s) => console.log(`\n${'═'.repeat(72)}\n  ${s}\n${'═'.repeat(72)}`)
function dump(label) {
  const d = store.dumpAll()
  console.log(`\n── ${label} · full audit state ──`)
  console.log('audit_event:', JSON.stringify(d.audit_event, null, 2))
  console.log('audit_tag   :', JSON.stringify(d.audit_tag))
  console.log('audit_override:', JSON.stringify(d.audit_override))
}

const scenarios = [
  {
    n: '1', title: 'Qoder subagent call audited (G3 feed: who/when/PAT-scope/Credits)',
    run: async () => {
      banner('S1 · Qoder subagent call audited (G3 feed: who/when/PAT-scope/Credits)')
      const qoderResult = { isError: false, content: 'analysis done', value: {
        type: 'result', subtype: 'success', is_error: false, result: '…',
        stop_reason: 'end_turn', total_cost_usd: 0.1042, total_credits: 42,
        usage: { input: 1200, output: 800 }, modelUsage: { 'qoder-max': { input: 1200, output: 800 } },
        num_turns: 3, duration_ms: 5400, session_id: 'q-sess-1',
      } }
      const { decision } = ctx.dispatchToolCall({
        name: 'subagent-qoder', arguments: { query: 'top 10 payers last 7d', model: 'qoder-max' },
        identity: alice, result: qoderResult,
      })
      console.log(`dispatched subagent-qoder → ${decision.kind}; audit captured tag=qoder_call + Credits (total_cost_usd/total_credits/usage)`)
      const rec = store.query({ tags: ['qoder_call'] }, admin)[0]
      console.log('qoder_call record:', JSON.stringify(rec, null, 2))
      dump('after S1')
    },
  },
  {
    n: '2', title: 'Guard denial audited (intranet tool-gate: business user ⊾ bash)',
    run: async () => {
      banner('S2 · Guard denial audited (intranet tool-gate: business user ⊾ bash)')
      const { decision } = ctx.dispatchToolCall({
        name: 'tool-bash', arguments: { command: 'rm -rf /' }, identity: bob,
        deny: true, denyReason: 'business-user ⊾ bash (intranet tool-gate)',
      })
      console.log(`dispatched tool-bash → ${decision.kind}: ${decision.reason}; audit captured tag=guard_deny (args_hash + deny_reason; no tool/result ever produced)`)
      const rec = store.query({ tags: ['guard_deny'] }, admin)[0]
      console.log('guard_deny record:', JSON.stringify(rec, null, 2))
      dump('after S2')
    },
  },
  {
    n: '3', title: 'Tier-2 semantic-layer write audited (record_tier2_write: hash NOT body)',
    run: async () => {
      banner('S3 · Tier-2 semantic-layer write audited (record_tier2_write: hash NOT body)')
      const payload = JSON.stringify({ table: 'pay_order_di', columns: [{ name: 'pay_amt', type: 'bigint' }] })
      const logId = ctx.audit.recordTier2Write('update_table_meta', payload, { scope_id: 'game-1', user_id: 'alice', session_id: 'sess-alice-1' })
      console.log(`record_tier2_write → ${logId}; tag=tool_write, extra.tier=tier-2, payload_hash (NOT body)`)
      const rec = store.query({ tags: ['tool_write'] }, admin)[0]
      console.log('tool_write record:', JSON.stringify(rec, null, 2))
      const bodyInAudit = JSON.stringify(rec.extra).includes('pay_amt')
      console.log(`body in audit record? ${bodyInAudit ? 'YES (LEAK!)' : 'NO — hash only ✓ (intranet-security-first: 留痕 answers who/when/which scope/which version, not body)'}`)
      dump('after S3')
    },
  },
  {
    n: '4', title: 'Analyst override/patch + get_with_history (immutable original + append-only correction)',
    run: async () => {
      banner('S4 · Analyst override/patch + get_with_history (immutable original + append-only correction)')
      const rec = store.query({ tags: ['qoder_call'] }, admin)[0]
      const logId = rec.log_id
      console.log('before patch: credits.total_cost_usd =', rec.extra.credits.total_cost_usd)
      const ok = store.patch(logId, 'credits.total_cost_usd', 0.05,
        { by: 'compliance-officer', reason: 'Qoder bill reconciliation: $0.05 not $0.1042' }, admin)
      console.log(`patch → ${ok}; original audit_event row UNCHANGED (append-only override row added)`)
      const after = store.get(logId, admin)
      console.log('after patch (read view): credits.total_cost_usd =', after.extra.credits.total_cost_usd, '(dotted-path override applied on read)')
      const rawP = store.rawPayload(logId)
      console.log('raw payload column still:', rawP.credits.total_cost_usd, '(immutable ✓ — ADR-0003 trust; override is a separate append-only row)')
      const hist = store.get_with_history(logId, admin)
      console.log('override chain:', JSON.stringify(hist.overrides, null, 2))
      dump('after S4')
    },
  },
  {
    n: '5', title: 'Ownership guard / IDOR (bob ⊾ alice\'s record; null = indistinguishable from not-found)',
    run: async () => {
      banner('S5 · Ownership guard / IDOR (bob ⊾ alice\'s record; null = indistinguishable from not-found)')
      const rec = store.query({ tags: ['qoder_call'] }, admin)[0]
      const logId = rec.log_id
      const asAlice = store.get(logId, alice)
      const asBob = store.get(logId, bob)
      const asNone = store.get('nonexistent', alice)
      console.log(`alice get(${logId}): ${asAlice ? 'SEEN' : 'null'}        (alice owns it)`)
      console.log(`bob   get(${logId}): ${asBob ? 'SEEN (LEAK!)' : 'null  (IDOR-safe ✓)'}   (bob ⊾ alice's record)`)
      console.log(`alice get(nonexistent): ${asNone ? 'SEEN' : 'null'}  (same as bob's deny → no existence oracle on 32-bit log_id ✓)`)
      dump('after S5')
    },
  },
  {
    n: '6', title: 'Per-user-cross-scope query + cost/credits reconciliation (G3 driver; single DB index)',
    run: async () => {
      banner('S6 · Per-user-cross-scope query + cost/credits reconciliation (G3 driver; single DB index)')
      const q2 = { isError: false, content: 'done', value: { total_cost_usd: 0.07, total_credits: 25, usage: { input: 900, output: 600 }, stop_reason: 'end_turn', num_turns: 2, duration_ms: 3000 } }
      ctx.dispatchToolCall({ name: 'subagent-qoder', arguments: { query: 'DAU last 7d', model: 'qoder-max' },
        identity: { ...alice, scope_id: 'game-2', session_id: 'sess-alice-2' }, result: q2 })
      const aliceQoder = store.query({ tags: ['qoder_call'], user_id: 'alice' }, admin)
      console.log(`query(qoder_call, user_id=alice) → ${aliceQoder.length} records across scopes: ${aliceQoder.map(r => r.scope_id).join(', ')}`)
      console.log('  → single DB + user_id index answers the cross-scope per-user compliance query natively (per-user ⊥ per-scope; no per-scope-DB federation needed)')
      const stats = store.stats({ tags: ['qoder_call'], user_id: 'alice' }, admin)
      console.log('stats (alice qoder_call):', JSON.stringify(stats, null, 2))
      console.log('  ⚠ surfaced tension: stats SUM(json_extract payload) reflects the IMMUTABLE original ($0.1042+$0.07=$0.1742), NOT S4\'s override ($0.05). Override applies on READ (get/query); SQL-level aggregates bypass it. → aggregation-over-overrides needs a policy decision.')
      dump('after S6')
    },
  },
]

async function main() {
  if (process.argv.slice(2).includes('--demo')) {
    for (const s of scenarios) await s.run()
    banner('demo complete · PROTOTYPE-wipe-me scratch DB at ./audit.PROTOTYPE-wipe-me.db')
    store.close()
    return
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  while (true) {
    console.log('\nP8 audit prototype — pick a scenario (q to quit):')
    for (const s of scenarios) console.log(`  ${s.n}: ${s.title}`)
    const ans = (await rl.question('> ')).trim()
    if (ans === 'q' || ans === 'quit') break
    const s = scenarios.find(x => x.n === ans)
    if (s) await s.run(); else console.log('unknown — try again')
  }
  store.close(); rl.close()
}

main().catch(e => { console.error(e); try { store.close() } catch {}; process.exit(1) })
