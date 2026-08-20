/**
 * AuditRecord schema (zod mirror of RBI pydantic AuditRecord) + payload
 * round-trip helpers + the audit tag vocabulary. Mirrors
 * reverse-bi/libs/rbi-core/src/rbi_core/models/audit.py (AuditRecord +
 * from_payload/to_payload).
 *
 * LEAN adaptation (P8 D1 = RBI faithful lean): DROPS RBI ADR-0005 classification
 * fields (preliminary_root_cause / classification_confidence / confidence_zone)
 * — those feed the flywheel (map Out-of-scope). Keeps review_status as a
 * general mutable audit-status marker (RBI's one in-place-mutable column).
 *
 * NET-NEW (G3/P12 delta): `user_id` first-class field — RBI has NO per-user
 * dimension (caller_id is explicitly NOT identity; ownership guard checks
 * tenant+scope only). da's per-user Qoder PAT/Credits attribution needs
 * user_id as a first-class indexed column (P8 D3).
 *
 * Kind-specific payload (tool_name/args_hash/outcome/credits for tool-audit;
 * event_type for session-event; tier/tool_name/payload_hash for tier-2;
 * deny_reason/error for denials; corrects for attribution correction) lives in
 * `extra` — mirrors RBI's `extra` catch-all (extra="ignore" + from_payload
 * captures unknowns so round-trips lose nothing).
 *
 * @module @deepseek-ai/dsh-audit/schema
 */

import { z } from 'zod'

/**
 * The canonical audit record shape (mirror RBI AuditRecord, lean + user_id).
 * NOT `.passthrough()` (deprecated in zod 4) — mirror RBI's extra="ignore" +
 * explicit `extra` catch-all: unknowns live in `extra` (object form), NOT at
 * top level. The WIRE form ({@link toPayload}) flattens them back to top level.
 */
export const AuditRecord = z.object({
  // ── Identity / envelope (mirror RBI; +user_id NET-NEW) ──
  log_id: z.string(),                              // uuid[:8], required (RBI: str(uuid.uuid4())[:8])
  timestamp: z.string().default(''),               // UTC ISO-8601
  session_id: z.string().nullable().default(null),
  chat_session_id: z.number().int().nullable().default(null),
  scope_id: z.string().nullable().default(null),   // per-game scope (RBI scope_id)
  tenant_id: z.string().nullable().default(null),
  user_id: z.string().nullable().default(null),    // NET-NEW (G3 per-business-user Qoder PAT; RBI no analogue)
  model: z.string().nullable().default(null),      // LLM model name (RBI's only cost-adjacent field; +Credits in extra)
  // ── Tags (single source of truth = audit_tag table, NOT payload; mirror RBI) ──
  auto_tags: z.array(z.string()).default([]),     // qoder_call / tool_write / guard_deny / session_event / attribution_correction
  // ── Review status (RBI's ONE in-place mutable column; general audit-status marker) ──
  review_status: z.string().default('pending'),
  // ── Extensibility: undeclared payload keys survive round-trips (mirror RBI `extra`) ──
  extra: z.record(z.string(), z.unknown()).default({}),
})

/** Inferred AuditRecord type (all fields present in output — defaults fill them). */
export type AuditRecord = z.infer<typeof AuditRecord>

/** Known field set (for from_payload/to_payload split — mirrors RBI AuditRecord.from_payload). */
const KNOWN_KEYS = new Set(Object.keys(AuditRecord.shape))

/**
 * Build an AuditRecord from a raw payload dict (mirror RBI from_payload):
 * declared fields validate normally; undeclared keys captured into `extra`
 * (no data lost despite extra="ignore"). Accepts `unknown` so callers can pass
 * either a pre-parsed {@link AuditRecord} or a raw wire dict.
 * @param data - raw payload, possibly with undeclared keys.
 * @returns a validated AuditRecord with unknowns in `extra`.
 */
export function fromPayload(data: unknown): AuditRecord {
  const source = (data ?? {}) as Record<string, unknown>
  const init: Record<string, unknown> = {}
  for (const k of KNOWN_KEYS) if (k in source) init[k] = source[k]
  const existingExtra = (source.extra !== undefined && typeof source.extra === 'object')
    ? { ...(source.extra as Record<string, unknown>) }
    : {}
  const extra: Record<string, unknown> = { ...existingExtra }
  for (const k of Object.keys(source)) if (!KNOWN_KEYS.has(k)) extra[k] = source[k]
  init.extra = extra
  return AuditRecord.parse(init) as AuditRecord
}

/**
 * Flatten back to the legacy dict shape (mirror RBI to_payload): `extra`
 * merged at top level (extra overwrites known on collision — RBI parity). The
 * stored payload column is this shape with `auto_tags` excluded (single source
 * of truth = audit_tag table).
 * @param rec - a valid AuditRecord (or a payload dict to normalize).
 * @returns the flattened wire dict with `extra` keys at top level.
 */
export function toPayload(rec: unknown): Record<string, unknown> {
  const d = AuditRecord.parse(rec) as AuditRecord
  const out: Record<string, unknown> = {}
  for (const k of KNOWN_KEYS) if (k !== 'extra') out[k] = d[k as keyof AuditRecord]
  if (d.extra !== undefined && typeof d.extra === 'object') Object.assign(out, d.extra)
  return out
}

/**
 * Audit tag vocabulary. `qoder_call` is the G3 feed (per-user Qoder PAT +
 * Credits). `attribution_correction` marks a misattribution correction record
 * (P8b tension① decision (a): identity cannot be patched, only corrected by
 * appending a new record).
 */
export const TAG = {
  QODER_CALL: 'qoder_call', // subagent-qoder tool call (G3 feed — per-user PAT + Credits)
  TOOL_WRITE: 'tool_write', // tier-2 persistent write (recordTier2Write; P6 semantic-layer calls)
  GUARD_DENY: 'guard_deny', // a denied tool call (intranet tool-gate; security-relevant)
  SESSION_EVENT: 'session_event', // session/* + agent/* lifecycle
  ATTRIBUTION_CORRECTION: 'attribution_correction', // misattribution correction (P8b①a: append, not patch)
} as const

/**
 * Identity fields that MUST NOT be patched (P8b tension① decision (a):
 * verdict-only override). These are the load-bearing, indexed, ownership-guard
 * columns; patching them via the dotted-path override would split the read
 * view from the column/index/guard (split-brain). Misattribution is corrected
 * by {@link import('./store.ts').SQLiteAuditStore.appendCorrection} (append a
 * new record + tag), not by mutating the original. A patch whose first dotted
 * segment is one of these is refused.
 */
export const IDENTITY_FIELDS: ReadonlySet<string> = new Set([
  'user_id',
  'scope_id',
  'tenant_id',
  'session_id',
  'chat_session_id',
  'log_id',
])
