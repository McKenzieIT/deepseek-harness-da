// PROTOTYPE (throwaway) — P8 audit · AuditRecord schema (zod mirror of RBI pydantic).
// Mirrors reverse-bi/libs/rbi-core/src/rbi_core/models/audit.py (AuditRecord + from_payload/to_payload).
//
// LEAN adaptation (Q1 = a): DROPS RBI ADR-0005 classification fields (preliminary_root_cause /
//   classification_confidence / confidence_zone) — those feed the flywheel (map Out-of-scope). Keeps
//   review_status as a general mutable audit-status marker (RBI's one in-place-mutable column).
// NET-NEW (G3/P12 delta): `user_id` first-class field — RBI has NO per-user dimension (caller_id is
//   explicitly NOT identity; ownership guard checks tenant+scope only). da's per-user Qoder PAT/Credits
//   attribution needs user_id as a first-class indexed column (Q3).
// Kind-specific payload (tool_name/args_hash/outcome/credits for tool-audit; event_type for session-event;
// tier/tool_name/payload_hash for tier-2; deny_reason for guard-deny) lives in `extra` — mirrors RBI's
// `extra` catch-all (ConfigDict extra="ignore" + from_payload captures unknowns so round-trips lose nothing).

import { z } from 'zod'

// The canonical audit record shape (mirror RBI AuditRecord, lean + user_id).
export const AuditRecord = z.object({
  // ── Identity / envelope (mirror RBI; +user_id NET-NEW) ──
  log_id: z.string(),                              // uuid[:8], required (RBI: str(uuid.uuid4())[:8])
  timestamp: z.string().default(''),               // UTC ISO-8601
  session_id: z.string().nullable().default(null),
  chat_session_id: z.number().int().nullable().default(null),
  scope_id: z.string().nullable().default(null),   // per-game scope (RBI scope_id; routes to per-scope data)
  tenant_id: z.string().nullable().default(null),
  user_id: z.string().nullable().default(null),    // NET-NEW (G3 per-business-user Qoder PAT; RBI no analogue)
  model: z.string().nullable().default(null),      // LLM model name (RBI's only cost-adjacent field; +Credits in extra)
  // ── Tags (single source of truth = audit_tag table, NOT payload; mirror RBI) ──
  auto_tags: z.array(z.string()).default([]),     // e.g. qoder_call / tool_write / guard_deny / session_event
  // ── Review status (RBI's ONE in-place mutable column; kept as a general audit-status marker) ──
  review_status: z.string().default('pending'),
  // ── Extensibility: undeclared payload keys survive round-trips (mirror RBI `extra`) ──
  extra: z.record(z.string(), z.unknown()).default({}),
})
// NOTE: NOT .passthrough() — mirror RBI's extra="ignore" + explicit `extra` catch-all: unknowns live in
// `extra` (object form), NOT at top level. The WIRE form (to_payload) flattens them back to top level.

// Known field set (for from_payload/to_payload split — mirrors RBI AuditRecord.from_payload).
const KNOWN_KEYS = new Set(Object.keys(AuditRecord.shape))

// Build an AuditRecord from a raw payload dict (mirror RBI from_payload): declared fields validate
// normally; undeclared keys captured into `extra` (no data lost despite extra="ignore").
export function fromPayload(data) {
  const init = {}
  for (const k of KNOWN_KEYS) if (k in (data || {})) init[k] = data[k]
  const existingExtra = (data && data.extra && typeof data.extra === 'object') ? data.extra : {}
  const extra = { ...existingExtra }
  for (const k of Object.keys(data || {})) if (!KNOWN_KEYS.has(k)) extra[k] = data[k]
  init.extra = extra
  return AuditRecord.parse(init)
}

// Flatten back to the legacy dict shape (mirror RBI to_payload): `extra` merged at top level.
export function toPayload(rec) {
  const d = AuditRecord.parse(rec)
  const out = {}
  for (const k of KNOWN_KEYS) if (k !== 'extra') out[k] = d[k]
  if (d.extra && typeof d.extra === 'object') Object.assign(out, d.extra) // extra overwrites known on collision (RBI parity)
  return out
}

// Tag set (SQ6 assumption) — extensible; these are the kinds the 3 audit surfaces emit.
export const TAG = {
  QODER_CALL: 'qoder_call',        // subagent-qoder tool call (G3 feed — per-user PAT + Credits)
  TOOL_WRITE: 'tool_write',       // tier-2 persistent write (record_tier2_write; P6 semantic-layer calls)
  GUARD_DENY: 'guard_deny',        // tools/pre-execute deny decision (intranet tool-gate; security-relevant)
  SESSION_EVENT: 'session_event',  // session/* + agent/* lifecycle
}
