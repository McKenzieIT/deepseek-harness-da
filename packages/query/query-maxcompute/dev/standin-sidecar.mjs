#!/usr/bin/env node
// PROTOTYPE STAND-IN (throwaway) — P4b query-maxcompute · fake MaxCompute sidecar.
//
// Speaks just enough real MCP (JSON-RPC 2.0, newline-delimited over stdio) for
// the da-side raw SDK Client to handshake (initialize + notifications/initialized)
// and call tools by raw name. Fakes ODPS behavior (a port of the P4 prototype's
// sidecar.mjs logic): per-scope credential + connection caches, a 3-state query
// outcome, pending/attach, and an idempotent `set_credentials` that drops the
// scope's connection cache on change (mirror reverse-bi `invalidate_credential`
// — G4 HOLE-C). A real pyodps sidecar is DEFERRED.
//
// This is a STAND-IN, not the production sidecar: it owns no real ODPS
// connection. Cred values are logged only as hashes.

// Fallback only if a client omits a protocol version; the real handshake echoes
// whatever the SDK proposed (its LATEST, which is supported).
const PROTOCOL_VERSION_FALLBACK = '2025-06-18'

// Fake per-scope state (mirror reverse-bi _CONNECTIONS + the cred cache).
const _CREDENTIALS = new Map() // scope_id -> { ODPS_ACCESS_ID, ODPS_ACCESS_KEY, ODPS_PROJECT, ODPS_ENDPOINT }
const _CONNECTIONS = new Map() // scope_id -> { snapshot, builtAt }  (fake per-scope ODPS connection cache)
const _INSTANCES = new Map() // instance_id -> { scope_id, sql, status, result }
const _BLOCKING_TIMERS = new Map() // requestId -> timer (blocking execute; cleared by notifications/cancelled)
let nextInstance = 1

function hash(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return '#' + (h >>> 0).toString(16).slice(0, 6)
}
function credSnapshot(scopeId) {
  const c = _CREDENTIALS.get(scopeId) ?? {}
  return {
    ODPS_ACCESS_ID: c.ODPS_ACCESS_ID ? hash(c.ODPS_ACCESS_ID) : '<unset>',
    ODPS_ACCESS_KEY: c.ODPS_ACCESS_KEY ? hash(c.ODPS_ACCESS_KEY) : '<unset>',
    ODPS_PROJECT: c.ODPS_PROJECT ?? '<unset>',
    ODPS_ENDPOINT: c.ODPS_ENDPOINT ?? '<unset>',
  }
}
function ensureConn(scopeId) {
  if (!_CONNECTIONS.has(scopeId)) _CONNECTIONS.set(scopeId, { snapshot: credSnapshot(scopeId), builtAt: Date.now() })
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}
function result(id, payload) {
  send({ jsonrpc: '2.0', id, result: payload })
}
function error(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } })
}
// MCP tools/call result envelope: a content array of text blocks + isError flag.
function content(text) {
  return { content: [{ type: 'text', text }], isError: false }
}

function executeOp(reqId, { scope_id, sql, mode }) {
  ensureConn(scope_id)
  const id = `inst_${nextInstance++}`
  if (mode === 'fail') {
    const r = { state: 'failed', error: 'ODPS: semantic error (col not found)', failureKind: 'unknown', instanceId: id, sql }
    _INSTANCES.set(id, { scope_id, sql, status: 'failed', result: r })
    return r
  }
  if (mode === 'slow') {
    const r = { state: 'pending', instanceId: id, elapsedMs: 30000, stage: 'running', hint: 'still running on MaxCompute; attach with instance_id', sql }
    _INSTANCES.set(id, { scope_id, sql, status: 'running', result: r })
    return r
  }
  if (mode === 'blocking') {
    // Hold the response ~5s so the da can abort mid-request (cancel scenario) or
    // so a crash (_test_crash) leaves it in-flight (crash-recovery scenario).
    const r = { state: 'pending', instanceId: id, elapsedMs: 0, stage: 'running', sql }
    _INSTANCES.set(id, { scope_id, sql, status: 'running', result: r })
    const timer = setTimeout(() => {
      _BLOCKING_TIMERS.delete(reqId)
      const done = {
        state: 'completed',
        columns: ['game_id', 'rev'],
        rows: [['game-x', 9999]],
        rowCount: 1,
        truncated: false,
        sql,
        executionMeta: { durationMs: 1200, instanceId: id, costCheck: 'passed', timedOut: false },
      }
      const inst = _INSTANCES.get(id)
      if (inst) {
        inst.status = 'completed'
        inst.result = done
      }
      result(reqId, content(JSON.stringify(done)))
    }, 1200)
    // Keep the event loop alive while the timer is pending (stdin keeps it alive
    // anyway, but be explicit in case the client stops reading).
    timer.unref?.()
    _BLOCKING_TIMERS.set(reqId, timer)
    return undefined // response deferred to the timer
  }
  // fast
  const r = {
    state: 'completed',
    columns: ['game_id', 'rev'],
    rows: [['game-x', 1234]],
    rowCount: 1,
    truncated: false,
    sql,
    executionMeta: { durationMs: 120, instanceId: id, costCheck: 'passed', timedOut: false },
  }
  _INSTANCES.set(id, { scope_id, sql, status: 'completed', result: r })
  return r
}

function handleCall(reqId, name, args) {
  switch (name) {
    case 'execute': {
      const r = executeOp(reqId, args)
      if (r !== undefined) result(reqId, content(JSON.stringify(r)))
      return // blocking returns undefined (response deferred)
    }
    case 'attach': {
      const inst = _INSTANCES.get(args.instance_id)
      if (!inst) {
        result(reqId, content(JSON.stringify({ state: 'failed', error: `unknown instance ${args.instance_id}`, failureKind: 'unknown', sql: '' })))
        return
      }
      if (inst.status === 'running') {
        inst.status = 'completed'
        inst.result = {
          state: 'completed',
          columns: ['game_id', 'rev'],
          rows: [['game-x', 9999]],
          rowCount: 1,
          truncated: false,
          sql: inst.sql,
          executionMeta: { durationMs: 99000, instanceId: args.instance_id, costCheck: 'passed', timedOut: false },
        }
      }
      result(reqId, content(JSON.stringify(inst.result)))
      return
    }
    case 'cancel': {
      const inst = _INSTANCES.get(args.instance_id)
      if (inst) inst.status = 'cancelled'
      result(reqId, content(JSON.stringify({ cancelled: inst !== undefined })))
      return
    }
    case 'get_progress': {
      const inst = _INSTANCES.get(args.instance_id)
      result(reqId, content(JSON.stringify(inst ? inst.result : { state: 'failed', error: `unknown instance ${args.instance_id}`, failureKind: 'unknown', sql: '' })))
      return
    }
    case 'estimate_cost': {
      ensureConn(args.scope_id)
      result(reqId, content(JSON.stringify({ input_bytes: 12345 })))
      return
    }
    case 'set_credentials': {
      // Idempotent (D3 + G4 HOLE-C drop): unchanged -> no-op (preserve the
      // per-scope connection cache + reuse); changed -> store new + drop that
      // scope's connection cache. In-flight queries hold their old connection
      // to completion.
      const prev = _CREDENTIALS.get(args.scope_id)
      const changed = !prev || JSON.stringify(prev) !== JSON.stringify(args.creds)
      if (changed) {
        _CREDENTIALS.set(args.scope_id, args.creds)
        const had = _CONNECTIONS.delete(args.scope_id)
        result(reqId, content(JSON.stringify({ pushed: true, dropped: had })))
        return
      }
      result(reqId, content(JSON.stringify({ pushed: false, dropped: false })))
      return
    }
    case 'invalidate_scope': {
      const had = _CONNECTIONS.delete(args.scope_id)
      result(reqId, content(JSON.stringify({ invalidated: had })))
      return
    }
    case 'get_state': {
      result(
        reqId,
        content(
          JSON.stringify({
            credentials: [..._CREDENTIALS.keys()].map((s) => [s, credSnapshot(s)]),
            connections: [..._CONNECTIONS.entries()].map(([s, c]) => [s, c.snapshot]),
            instances: [..._INSTANCES.entries()].map(([id, i]) => [id, i.status]),
          }),
        ),
      )
      return
    }
    case '_test_crash': {
      // Simulate a sidecar crash: exit without responding. The caller's
      // tools/call rejects with ConnectionClosed (SDK _onclose); any in-flight
      // blocking execute rejects too.
      process.exit(0)
    }
    default:
      error(reqId, -32601, `unknown tool ${name}`)
  }
}

function handle(msg) {
  // Notifications carry no id and take no response.
  if (msg.id === undefined) {
    if (msg.method === 'notifications/initialized') return // no-op
    if (msg.method === 'notifications/cancelled') {
      const t = _BLOCKING_TIMERS.get(msg.params?.requestId)
      if (t) {
        clearTimeout(t)
        _BLOCKING_TIMERS.delete(msg.params?.requestId)
      }
      return
    }
    return // other notifications: no-op
  }
  switch (msg.method) {
    case 'initialize':
      result(msg.id, {
        // Echo the client's proposed version (its LATEST is supported).
        protocolVersion: msg.params?.protocolVersion ?? PROTOCOL_VERSION_FALLBACK,
        capabilities: { tools: {} }, // declare tools so assertCapabilityForMethod('tools/call') passes
        serverInfo: { name: 'standin-odps', version: '0.0.0' },
      })
      return
    case 'ping':
      result(msg.id, {})
      return
    case 'tools/list':
      // The da never calls this (it programs by raw name), but handle it defensively.
      result(msg.id, {
        tools: [
          'execute', 'attach', 'cancel', 'get_progress', 'estimate_cost',
          'set_credentials', 'invalidate_scope', 'get_state',
        ].map((name) => ({ name, description: name, inputSchema: { type: 'object' } })),
      })
      return
    case 'tools/call':
      handleCall(msg.id, msg.params?.name, msg.params?.arguments ?? {})
      return
    default:
      error(msg.id, -32601, `method not found: ${msg.method}`)
  }
}

// Exit gracefully if the parent closes our stdout (EPIPE) — e.g. the da
// disposed mid-handshake. Avoids an unhandled 'error' event crashing the process.
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

process.stderr.write(`[standin-sidecar] booted | pid=${process.pid}\n`)
