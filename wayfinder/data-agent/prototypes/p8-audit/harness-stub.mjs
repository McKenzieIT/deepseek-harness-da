// PROTOTYPE (throwaway) — P8 audit · harness STAND-IN (fake Cordis ctx).
// The real impl wires ctx.on('tools/post-execute' | 'session/event') on the vendored Cordis harness
// (packages/core/tools + packages/core/session + packages/core/agent-loop). This stub simulates the
// tools/* pipeline (pre-execute → ctx.tools.guard → execute → post-execute → result) + session events
// so the audit listeners fire without the real harness. Like P6's schema-stub.mjs — it demos the WIRING
// POINT, not the harness.
//
// Simplification (state at top of README): Cordis waterfalls are async with next() delegation; this stub
// is synchronous and aggregates the decision (first deny wins). The load-bearing property mirrored = the
// harness tools/README claim that "tools/post-execute also runs for calls a tools/pre-execute listener
// denied" — so audit captures denials (which never produce a tool/result) at post-execute.

import { randomUUID } from 'node:crypto'

export function createHarness() {
  const listeners = {}                                  // event → [fn]
  const tools = { _guards: [], guard(g) { tools._guards.push(g) } }
  let requestScope = null                               // {session_id, scope_id, tenant_id, user_id} per call

  function on(event, fn) { (listeners[event] ||= []).push(fn) }
  function fire(event, ...args) { for (const fn of (listeners[event] || [])) fn(...args) }

  function dispatchToolCall({ name, arguments: args = {}, identity, result, deny = false, denyReason } = {}) {
    requestScope = identity
    const exec = {
      token: randomUUID(), callId: randomUUID().replace(/-/g, '').slice(0, 8),
      name, arguments: args, signal: {}, agent: null, parent: null,
    }
    // ── tools/pre-execute (reorderable waterfall; simplified: first deny wins) ──
    let decision = { kind: 'allow' }
    for (const fn of (listeners['tools/pre-execute'] || [])) {
      const d = fn(exec)                                 // returns a decision or undefined (delegate)
      if (d && d.kind) { decision = d; if (d.kind === 'deny') break }
    }
    // ── ctx.tools.guard (monotonic synchronous; string = deny reason, undefined = allow) ──
    if (decision.kind !== 'deny') {
      for (const g of tools._guards) {
        const reason = g(exec)
        if (reason) { decision = { kind: 'deny', reason }; break }
      }
    }
    // explicit deny (demo override)
    if (deny) decision = { kind: 'deny', reason: denyReason || 'denied' }
    // ── execute (skipped if denied) ──
    let execResult
    if (decision.kind === 'allow') execResult = result
    // ── tools/post-execute (runs for allowed AND denied — the audit capture point) ──
    for (const fn of (listeners['tools/post-execute'] || [])) fn(exec, decision, execResult)
    // ── tools/result (observe-only; allowed only — denied calls never produce a result) ──
    if (decision.kind === 'allow') for (const fn of (listeners['tools/result'] || [])) fn(exec, execResult)
    requestScope = null
    return { decision, result: execResult }
  }

  function emitSession(eventType, data, identity) {
    requestScope = identity
    fire('session/event', eventType, data)
    fire(`agent/${eventType}`, data)                    // specific agent/* listeners
    requestScope = null
  }

  return { on, tools, dispatchToolCall, emitSession, get requestScope() { return requestScope } }
}
