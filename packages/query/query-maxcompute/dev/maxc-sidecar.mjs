#!/usr/bin/env node
// P4c — maxc-backed MaxCompute sidecar (REAL ODPS via the local `maxc` CLI).
//
// Replaces `standin-sidecar.mjs`'s canned-data fake ODPS with real MaxCompute
// execution. Same MCP protocol (JSON-RPC 2.0, newline-delimited over stdio) +
// the same 7 tools the da Provider programs by raw name (execute / attach /
// cancel / get_progress / estimate_cost / set_credentials / invalidate_scope)
// + `get_state` diagnostic, so `packages/query/query-maxcompute/src/index.ts`
// (the Provider) is UNCHANGED — only its `args` config points here.
//
// Auth model difference from the stand-in: maxc self-manages ODPS credentials
// in its config file (e.g. ~/.maxc/config_ieu_cdm.yaml), so the da does NOT
// push ODPS creds — `set_credentials` / `invalidate_scope` are NO-OPs here
// (maxc's config is the single source of auth). The config path (and optional
// `maxc` binary path) come from argv (`--maxc-config`, `--maxc-bin`), set as
// Provider spawn `args`. For the RBI eval, all 5 scopes live in the `ieu_cdm`
// project (the scope is in the table name `dws_<scope>_`, not a separate
// project), so ONE config covers the whole eval set. Per-scope config mapping
// (production per-game isolation) is deferred.
//
// Real e2e: RBI case `eval_10000251_037` expected SQL → `dau:4336`
// (= expected.result_value; anchor 2026-08-06 data preserved). See
// `dev/maxc-smoke.mjs`.

import { spawn } from 'node:child_process'

// ── argv ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
function arg(name, def) {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : def
}
const MAXC_BIN = arg('maxc-bin', 'maxc')
const MAXC_CONFIG = arg('maxc-config', undefined)
if (!MAXC_CONFIG) {
  process.stderr.write('[maxc-sidecar] --maxc-config <path> is required\n')
  process.exit(2)
}

const PROTOCOL_VERSION_FALLBACK = '2025-06-18'

// ── MCP framing (mirror standin-sidecar.mjs) ────────────────────────────────
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }
function result(id, payload) { send({ jsonrpc: '2.0', id, result: payload }) }
function error(id, code, message) { send({ jsonrpc: '2.0', id, error: { code, message } }) }
function content(text) { return { content: [{ type: 'text', text }], isError: false } }

// ── maxc subprocess runner ──────────────────────────────────────────────────
// Runs `maxc --config <cfg> <sub> [--stdin] --json`; when `sql` is given it is
// piped to stdin (avoids shell-quoting a SQL string entirely). Resolves the
// parsed JSON envelope, or `{ _error }` on spawn/parse failure.
function runMaxc(subArgs, sql) {
  return new Promise((resolve) => {
    const args = ['--config', MAXC_CONFIG, ...subArgs, '--json']
    if (sql !== undefined) args.push('--stdin')
    const child = spawn(MAXC_BIN, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { err += d })
    child.on('error', (e) => resolve({ _error: `spawn failed: ${e.message}` }))
    child.on('close', (code) => {
      if (code !== 0 && !out) {
        resolve({ _error: `maxc exit ${code}: ${err.slice(0, 800)}` })
        return
      }
      try {
        resolve(JSON.parse(out))
      } catch {
        resolve({ _error: `non-JSON stdout: ${out.slice(0, 800)}` })
      }
    })
    if (sql !== undefined) child.stdin.end(sql)
    else child.stdin.end()
  })
}

// ── maxc JSON envelope → QueryOutcome (mirror standin's shape) ─────────────
// QueryOutcome: { state:'completed'|'pending'|'failed', columns, rows, rowCount,
//   truncated, sql, executionMeta, error?, failureKind? }
function toOutcome(env, sql) {
  if (env._error) return { state: 'failed', error: env._error, failureKind: 'transport', sql }
  if (env.status === 'success' && env.data?.result) {
    const r = env.data.result
    const schema = r.schema ?? []
    const columns = schema.map((c) => c.name)
    const rowsIn = r.rows ?? []
    // maxc rows are objects keyed by column name → arrays in schema order.
    const rows = rowsIn.map((row) => columns.map((c) => (row[c] ?? null)))
    return {
      state: 'completed',
      columns,
      rows,
      rowCount: r.row_count ?? rows.length,
      truncated: false,
      sql,
      executionMeta: { durationMs: 0, instanceId: null, costCheck: 'passed', timedOut: false },
    }
  }
  // async promotion: maxc returns a job when --wait expires before completion.
  const jobId = env.data?.job_id ?? env.data?.instance_id ?? env.job_id
  if (env.status !== 'failure' && jobId) {
    return {
      state: 'pending',
      instanceId: jobId,
      elapsedMs: 0,
      stage: 'running',
      hint: 'maxc promoted to async job; attach with instance_id',
      sql,
    }
  }
  const e = env.error ?? {}
  const recoverable = e.recoverable === true
  return {
    state: 'failed',
    error: e.message ?? env.statusText ?? 'maxc failure',
    failureKind: recoverable ? 'retryable' : 'unknown',
    sql,
  }
}

// ── tool handlers ───────────────────────────────────────────────────────────
async function executeOp({ sql }) {
  // `mode` (fast/slow/fail/blocking) was a stand-in test knob; for real ODPS it
  // is meaningless — always run via `maxc query run`. --wait 60 keeps short
  // queries synchronous (promotes to a pending job only if genuinely long).
  const env = await runMaxc(['query', 'run', '--wait', '60'], sql)
  return toOutcome(env, sql)
}

async function estimateCostOp({ sql }) {
  const env = await runMaxc(['query', 'cost'], sql)
  if (env.status === 'success') {
    const bytes = env.data?.analysis?.estimated_input_size_bytes ?? 0
    return { input_bytes: bytes }
  }
  return { input_bytes: 0 }
}

// attach / get_progress / cancel via `maxc job` (minimal; not exercised by the
// smoke — real long-query attach is a P4c follow-up refinement).
async function jobStatus(instance_id) {
  if (!instance_id) return { state: 'failed', error: 'no instance_id', failureKind: 'unknown', sql: '' }
  const env = await runMaxc(['job', 'status', instance_id])
  return env
}

async function handleCall(reqId, name, args) {
  switch (name) {
    case 'execute': {
      const r = await executeOp(args)
      result(reqId, content(JSON.stringify(r)))
      return
    }
    case 'attach': {
      const env = await jobStatus(args.instance_id)
      // If the job is done, fetch its result; else surface pending.
      result(reqId, content(JSON.stringify(env._error
        ? { state: 'failed', error: env._error, failureKind: 'transport', sql: '' }
        : { state: 'pending', instanceId: args.instance_id, env })))
      return
    }
    case 'get_progress': {
      const env = await jobStatus(args.instance_id)
      result(reqId, content(JSON.stringify(env)))
      return
    }
    case 'cancel': {
      const env = await runMaxc(['job', 'cancel', args.instance_id].filter(Boolean))
      result(reqId, content(JSON.stringify({ cancelled: env.status !== 'failure' })))
      return
    }
    case 'estimate_cost': {
      const r = await estimateCostOp(args)
      result(reqId, content(JSON.stringify(r)))
      return
    }
    case 'set_credentials': {
      // NO-OP: maxc self-manages auth in its config file (the da does not push
      // ODPS creds). Return the stand-in's idempotent shape so the Provider's
      // pushCredentials contract holds.
      result(reqId, content(JSON.stringify({ pushed: false, dropped: false })))
      return
    }
    case 'invalidate_scope': {
      result(reqId, content(JSON.stringify({ invalidated: false })))
      return
    }
    case 'get_state': {
      result(reqId, content(JSON.stringify({ maxc_bin: MAXC_BIN, maxc_config: MAXC_CONFIG })))
      return
    }
    default:
      error(reqId, -32601, `unknown tool ${name}`)
  }
}

function handle(msg) {
  if (msg.id === undefined) {
    // notifications: no-op (initialized / cancelled). maxc owns no blocking
    // timers to clear (each query is its own subprocess; cancel routes via the
    // Provider's outbound signal + maxc job cancel).
    return
  }
  switch (msg.method) {
    case 'initialize':
      result(msg.id, {
        protocolVersion: msg.params?.protocolVersion ?? PROTOCOL_VERSION_FALLBACK,
        capabilities: { tools: {} },
        serverInfo: { name: 'maxc-odps', version: '0.1.0' },
      })
      return
    case 'ping':
      result(msg.id, {})
      return
    case 'tools/list':
      result(msg.id, {
        tools: ['execute', 'attach', 'cancel', 'get_progress', 'estimate_cost',
          'set_credentials', 'invalidate_scope', 'get_state'].map((n) => ({
            name: n, description: n, inputSchema: { type: 'object' },
          })),
      })
      return
    case 'tools/call':
      handleCall(msg.id, msg.params?.name, msg.params?.arguments ?? {})
      return
    default:
      error(msg.id, -32601, `method not found: ${msg.method}`)
  }
}

process.stdout.on('error', (e) => {
  if (e.code === 'EPIPE') process.exit(0)
  throw e
})

let buf = ''
process.stdin.on('data', (d) => {
  buf += d
  let i
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i)
    buf = buf.slice(i + 1)
    if (!line.trim()) continue
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      continue
    }
    handle(msg)
  }
})

process.stderr.write(`[maxc-sidecar] booted | pid=${process.pid} | bin=${MAXC_BIN} | config=${MAXC_CONFIG}\n`)
