#!/usr/bin/env node
// PROTOTYPE (throwaway) — P4 query-engine trio · fake MaxCompute sidecar subprocess.
// Mirrors reverse-bi OdpsExecutor + connection.ScopeConnection at stub fidelity.
// Creds arrive via SPAWN ENV (R2 §5.2c / decision F2): ODPS_ACCESS_ID/KEY/PROJECT/ENDPOINT.
//   (logged as hashes only — never raw values.)
// Owns: per-scope ODPS "connection" cache (Map scope_id -> snapshot, mirrors _CONNECTIONS)
//        + per-instance state (instance_id -> {scope_id, sql, status, result}) for Pending/attach.
// Speaks minimal line-delimited JSON over stdio — a STAND-IN for the MCP protocol, NOT real MCP.
// See README.md (assumption #1).

const CREDS = ['ODPS_ACCESS_ID', 'ODPS_ACCESS_KEY', 'ODPS_PROJECT', 'ODPS_ENDPOINT']
const connections = new Map()  // scope_id -> { snapshot, builtAt }
const instances = new Map()   // instance_id -> { scope_id, sql, status, result }

function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return '#' + (h >>> 0).toString(16).slice(0, 6) }
function credSnapshot() { const s = {}; for (const r of CREDS) s[r] = process.env[r] ? hash(process.env[r]) : '<unset>'; return s }
function logState(note) {
  process.stderr.write(`[sidecar] ${note} | conns=${JSON.stringify([...connections.entries()])} insts=${JSON.stringify([...instances.entries()].map(([id, i]) => [id, i.status]))} envCreds=${JSON.stringify(credSnapshot())}\n`)
}

let nextInstance = 1
function ensureConn(scope_id) { if (!connections.has(scope_id)) connections.set(scope_id, { snapshot: credSnapshot(), builtAt: Date.now() }) }

function handle(req) {
  const { op, scope_id, sql, mode, instance_id } = req
  if (op === 'query' || op === 'estimate_cost') ensureConn(scope_id)  // build per-scope conn from spawn-env creds
  switch (op) {
    case 'estimate_cost':
      return { ok: true, result: { state: 'cost', input_bytes: 12345 } }
    case 'query': {
      const id = `inst_${nextInstance++}`  // fresh instance per execute = per-query executor (no _instance overwrite across G1/G5/main)
      if (mode === 'fail') {
        const r = { state: 'failed', error: 'ODPS: semantic error (col not found)', failure_kind: 'unknown', instance_id: id, sql }
        instances.set(id, { scope_id, sql, status: 'failed', result: r }); logState(`query(fail) ${scope_id}`); return { ok: true, result: r }
      }
      if (mode === 'slow') {  // patience exceeded -> Pending (no cancel;作业继续)
        const r = { state: 'pending', instance_id: id, elapsed_ms: 30000, stage: 'running', hint: 'still running on MaxCompute; attach with instance_id', cost_check: 'passed' }
        instances.set(id, { scope_id, sql, status: 'running', result: r }); logState(`query(slow->pending) ${scope_id} id=${id}`); return { ok: true, result: r }
      }
      const r = { state: 'completed', columns: ['game_id', 'rev'], rows: [['game-x', 1234]], row_count: 1, truncated: false, sql, execution_meta: { duration_ms: 120, instance_id: id, cost_check: 'passed', timed_out: false } }
      instances.set(id, { scope_id, sql, status: 'completed', result: r }); logState(`query(fast->completed) ${scope_id} id=${id}`); return { ok: true, result: r }
    }
    case 'attach': {  // resume a pending instance; NOT through the guard chain
      const i = instances.get(instance_id)
      if (!i) return { ok: true, result: { state: 'failed', error: `unknown instance ${instance_id}`, failure_kind: 'unknown', sql: '' } }
      if (i.status === 'running') {
        i.status = 'completed'
        i.result = { state: 'completed', columns: ['game_id', 'rev'], rows: [['game-x', 9999]], row_count: 1, truncated: false, sql: i.sql, execution_meta: { duration_ms: 99000, instance_id, cost_check: 'passed', timed_out: false } }
        logState(`attach->completed ${instance_id}`); return { ok: true, result: i.result }
      }
      logState(`attach ${instance_id} (already ${i.status})`); return { ok: true, result: i.result }
    }
    case 'invalidate_scope': {  // surgical: drop ONE scope's connection cache (mirror invalidate_scope_connection)
      const had = connections.delete(scope_id); logState(`invalidate_scope ${scope_id} (had=${had})`); return { ok: true, result: { invalidated: had } }
    }
    case 'get_state':
      return { ok: true, result: { connections: [...connections.entries()], instances: [...instances.entries()].map(([id, i]) => [id, i.status]), envCreds: credSnapshot() } }
    default:
      return { ok: false, error: `unknown op ${op}` }
  }
}

let buf = ''
process.stdin.on('data', d => {
  buf += d; let i
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue
    try { const req = JSON.parse(line); const res = handle(req); process.stdout.write(JSON.stringify({ id: req.id, ...res }) + '\n') }
    catch (e) { process.stdout.write(JSON.stringify({ id: req?.id, ok: false, error: String(e) }) + '\n') }
  }
})
process.stderr.write(`[sidecar] booted | envCreds=${JSON.stringify(credSnapshot())}\n`)
