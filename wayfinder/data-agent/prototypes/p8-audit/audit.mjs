// PROTOTYPE (throwaway) — P8 audit · the ctx.audit service stub + 3 audit surfaces.
// Mirrors reverse-bi audit wiring: tool-audit (per-call) + session-event + tier-2 write (record_tier2_write).
//   - tool-audit / guard-deny: observe tools/post-execute (runs for allowed AND denied — harness tools/README,
//     so denials are captured without a tool/result). observe-only, never blocks (always delegates).
//   - session-event: observe session/event (+ agent/*).
//   - record_tier2_write: mirror RBI write_tiers.record_tier2_write — hash NOT body, fail-silent to business.
// G3 feed: subagent-qoder tool calls → tag=qoder_call + Credits from SDK result (total_cost_usd / total_credits?
// / usage / modelUsage — research/qoder-sdk-dts.md:21 SDKResultSuccess). caller identity (user_id) from ctx.requestScope.
//
// D4 surface mapping (assumption): guard-deny is the deny-subset of tool-audit (tag=guard_deny), captured at
// post-execute — NOT a separate listener (post-execute carries the deny decision).
// D5 userId gap (assumption): prototype reads user_id from ctx.requestScope (stand-in for P9 login-state ctx);
// T1 fallback phase → user_id=null. Real per-user identity lands when P9/P3-per-user land.

import { createHash, randomUUID } from 'node:crypto'
import { fromPayload, TAG } from './types.mjs'

function sha256(text) { return createHash('sha256').update(text, 'utf8').digest('hex') }
function newLogId() { return randomUUID().replace(/-/g, '').slice(0, 8) }
function nowIso() { return new Date().toISOString() }
function scopeOf(ctx) { return ctx.requestScope || { session_id: null, scope_id: null, tenant_id: null, user_id: null } }

function summarize(result) {
  if (!result) return null
  if (result.isError) return `ERROR: ${(result.error || '').toString().slice(0, 80)}`
  const c = result.content
  if (typeof c === 'string') return c.slice(0, 80)
  return JSON.stringify(c).slice(0, 80)
}

export function installAudit(ctx, store) {
  const audit = {
    store,
    // ── tier-2 write helper (mirror RBI record_tier2_write). Called by P6 semantic-layer etc. ──
    // Hash, NOT body — answers "who/when/which scope/which version". Fail-silent (business write unbroken).
    recordTier2Write(toolName, payload, opts = {}) {
      const s = scopeOf(ctx)
      const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
      const rec = fromPayload({
        log_id: newLogId(), timestamp: nowIso(),
        session_id: s.session_id, scope_id: opts.scope_id ?? s.scope_id,
        tenant_id: opts.tenant_id ?? s.tenant_id, user_id: opts.user_id ?? s.user_id,
        auto_tags: [TAG.TOOL_WRITE],
        extra: { tier: 'tier-2', tool_name: toolName, payload_hash: sha256(body), payload_bytes: Buffer.byteLength(body) },
      })
      // fail-silent (Tier-2 must not block business writes) — but return null on failure so the caller
      // (P6) does NOT get a phantom log_id for a non-persisted record (undercutting the Tier-2 trail).
      let logId = null
      try { store.append(rec); logId = rec.log_id } catch (e) {
        console.warn(`[audit] Tier-2 留痕失败（业务写入不受影响）: tool=${toolName}: ${e.message}`)
      }
      return logId
    },
    // direct record (test hook)
    record(rec) { return store.append(fromPayload(rec)) },
  }
  ctx.audit = audit

  // ── tool-audit + guard-deny surface: observe tools/post-execute (allowed AND denied). ──
  ctx.on('tools/post-execute', (exec, decision, result) => {
    const s = scopeOf(ctx)
    const argsHash = sha256(JSON.stringify(exec.arguments ?? {}))
    const denied = decision && decision.kind === 'deny'
    const isQoder = exec.name === 'subagent-qoder'
    const tags = denied ? [TAG.GUARD_DENY] : (isQoder ? [TAG.QODER_CALL] : ['tool_call'])
    const extra = { tool_name: exec.name, args_hash: argsHash, decision: decision.kind }
    if (decision.reason) extra.deny_reason = decision.reason
    if (!denied && result) {
      extra.is_error = !!result.isError
      extra.result_summary = summarize(result)
      if (isQoder && result.value) {
        // G3 feed — Credits from Qoder SDKResultSuccess (total_cost_usd required, total_credits? optional).
        const v = result.value
        extra.credits = {
          total_cost_usd: v.total_cost_usd ?? null,    // required by SDK shape (null if adapter didn't surface)
          total_credits: v.total_credits ?? null,       // optional — null when SDK omits (SQ8: optionally fetch via getUsageInfo)
          usage: v.usage ?? null, modelUsage: v.modelUsage ?? null,
        }
        extra.outcome = { stop_reason: v.stop_reason ?? null, num_turns: v.num_turns ?? null, duration_ms: v.duration_ms ?? null }
      }
    }
    const rec = fromPayload({
      log_id: newLogId(), timestamp: nowIso(),
      session_id: s.session_id, scope_id: s.scope_id, tenant_id: s.tenant_id, user_id: s.user_id,
      model: exec.arguments?.model ?? null,
      auto_tags: tags, extra,
    })
    try { store.append(rec) } catch (e) {
      console.warn(`[audit] tool-audit 留痕失败: tool=${exec.name}: ${e.message}`)
    }
  })

  // ── session-event surface: observe session/event (+ agent/*). ──
  ctx.on('session/event', (eventType, data) => {
    const s = scopeOf(ctx)
    const rec = fromPayload({
      log_id: newLogId(), timestamp: nowIso(),
      session_id: s.session_id, scope_id: s.scope_id, tenant_id: s.tenant_id, user_id: s.user_id,
      auto_tags: [TAG.SESSION_EVENT], extra: { event_type: eventType, details: data ?? null },
    })
    try { store.append(rec) } catch (e) {
      console.warn(`[audit] session-event 留痕失败: ${eventType}: ${e.message}`)
    }
  })
}
