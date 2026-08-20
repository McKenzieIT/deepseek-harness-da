// PROTOTYPE (throwaway) — P8 audit · SQLiteAuditStore (node:sqlite mirror of RBI SqlAlchemyAuditStore).
// Mirrors reverse-bi/libs/rbi-data/src/rbi_data/audit.py (SqlAlchemyAuditStore + AuditEvent/AuditOverride/
// AuditTag ORM + AuditStore Protocol). ADR-0009: swappable seam (Protocol-not-concrete), SQLite-WAL first
// adapter, audit_event immutable + audit_override append-only (original never mutated; ADR-0003 trust).
//
// Decisions baked in:
//  Q2 = relational own-node:sqlite. ctx.storage is KV-only — storage-domain README confirms "No cross-table
//       transactions, secondary indexes, or multi-segment keys; each write touches one record" + durability
//       "on the routed backend first" (= the kv facet). So RBI's relational 3-table indexed shape CANNOT live
//       in ctx.storage. P8 owns its sqlite, exposed via a ctx.audit service (sibling ctx.* seam, additive).
//  Q3 = single audit DB + scope_id/user_id first-class columns + ownership guard (RBI P1-2 IDOR fix extended
//       with user_id for G3 per-user dimension). Isolation = gate (X-RBI-Scope + P10 mTLS) + guard (defense-in-
//       depth); privileged caller (compliance officer / P9 admin) bypasses the guard.
//  Q1 = lean — drops RBI ADR-0005 classification columns (preliminary_root_cause/classification_confidence/
//       confidence_zone — flywheel, map Out-of-scope). Keeps review_status (RBI's one mutable column, general
//       audit-status marker).
//
// 3 tables: audit_event (immutable append log; payload EXCLUDES auto_tags) + audit_override (append-only
//   patches; reads apply latest per field via DOTTED PATH — mirror RBI _apply_overrides) + audit_tag (junction,
//   single source of truth for tags — NOT in payload). PRAGMA WAL + foreign_keys + busy_timeout.

import { DatabaseSync } from 'node:sqlite'
import { fromPayload, toPayload } from './types.mjs'

const SCHEMA = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=5000;

CREATE TABLE IF NOT EXISTS audit_event (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  log_id          TEXT UNIQUE NOT NULL,
  ts              TEXT NOT NULL,
  session_id      TEXT,
  chat_session_id INTEGER,
  scope_id        TEXT,
  tenant_id       TEXT,
  user_id         TEXT,
  model           TEXT,
  review_status   TEXT NOT NULL DEFAULT 'pending',
  payload         TEXT NOT NULL,            -- full AuditRecord JSON, auto_tags EXCLUDED (→ audit_tag)
  ingested_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_audit_tenant_scope_ts ON audit_event(tenant_id, scope_id, ts);
CREATE INDEX IF NOT EXISTS ix_audit_chat_session    ON audit_event(chat_session_id);
CREATE INDEX IF NOT EXISTS ix_audit_session         ON audit_event(session_id);
CREATE INDEX IF NOT EXISTS ix_audit_user_ts        ON audit_event(user_id, ts);   -- NET-NEW (G3 per-user queries)
CREATE INDEX IF NOT EXISTS ix_audit_scope_ts       ON audit_event(scope_id, ts);
CREATE INDEX IF NOT EXISTS ix_audit_ts             ON audit_event(ts);

CREATE TABLE IF NOT EXISTS audit_override (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  log_id     TEXT NOT NULL,
  field      TEXT NOT NULL,
  value      TEXT,                  -- JSON-serialized
  patched_by TEXT,
  patched_at TEXT NOT NULL,
  reason     TEXT
);
CREATE INDEX IF NOT EXISTS ix_override_log_time ON audit_override(log_id, patched_at);

CREATE TABLE IF NOT EXISTS audit_tag (
  event_id  INTEGER NOT NULL,
  tag       TEXT NOT NULL,
  PRIMARY KEY (event_id, tag),
  FOREIGN KEY (event_id) REFERENCES audit_event(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_audit_tag ON audit_tag(tag);
`

// Normalize an identity value to the "unowned" bucket (mirror RBI _same_owner: None/'' → same bucket).
function norm(v) { return (v === null || v === undefined || v === '') ? '' : String(v) }

// Ownership guard (mirror RBI _assert_same_identity, extended with user_id). Caller must match the record's
// tenant+scope+user (NULL-safe via IS), OR be privileged (compliance officer / P9 admin — production bypass).
function sameOwner(recIdent, caller) {
  if (caller && caller.privileged) return true
  if (!caller) return false
  return norm(recIdent.tenant_id) === norm(caller.tenant_id)
      && norm(recIdent.scope_id) === norm(caller.scope_id)
      && norm(recIdent.user_id) === norm(caller.user_id)
}

// Apply an override via dotted path (mirror RBI _apply_overrides dotted-path setter): 'a.b.c' → payload.a.b.c.
// (RBI supports dotted paths because AuditRecord has nested stage dicts; da keeps it for nested extra like
//  `credits.total_cost_usd`. A flat field like `result_summary` is a 1-segment path — works identically.)
function setDotted(obj, path, value) {
  const parts = path.split('.')
  let o = obj
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] ?? (o[parts[i]] = {})
  o[parts[parts.length - 1]] = value
}

export class SQLiteAuditStore {
  constructor(dbPath) {
    this.db = new DatabaseSync(dbPath)
    this.db.exec(SCHEMA)
  }

  // ── append: insert audit_event + tags (one txn). Mirror AuditStore.append. payload EXCLUDES auto_tags. ──
  append(record) {
    const rec = fromPayload(record)
    const wire = toPayload(rec)                   // flattened: known fields + extra at top level
    const { auto_tags, ...payloadBody } = wire    // payload EXCLUDES auto_tags (single source of truth = audit_tag)
    const payloadJson = JSON.stringify(payloadBody)
    const ts = rec.timestamp || new Date().toISOString()
    try {
      this.db.exec('BEGIN')
      const res = this.db.prepare(
        `INSERT INTO audit_event
           (log_id, ts, session_id, chat_session_id, scope_id, tenant_id, user_id, model, review_status, payload, ingested_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      ).run(rec.log_id, ts, rec.session_id, rec.chat_session_id, rec.scope_id, rec.tenant_id,
            rec.user_id, rec.model, rec.review_status, payloadJson, ts)
      const eventId = Number(res.lastInsertRowid)
      const insTag = this.db.prepare('INSERT OR IGNORE INTO audit_tag (event_id, tag) VALUES (?, ?)')
      for (const t of rec.auto_tags) insTag.run(eventId, t)
      this.db.exec('COMMIT')
      return rec.log_id
    } catch (e) {
      try { this.db.exec('ROLLBACK') } catch {}
      throw e
    }
  }

  // ── get: read one record (latest override applied). Ownership guard → null if mismatch (IDOR-safe,
  //    indistinguishable from not-found — no existence oracle on the 32-bit log_id space; mirror RBI). ──
  get(log_id, caller) {
    const row = this.db.prepare('SELECT * FROM audit_event WHERE log_id=?').get(log_id)
    if (!row) return null
    if (!sameOwner({ tenant_id: row.tenant_id, scope_id: row.scope_id, user_id: row.user_id }, caller)) return null
    return this._materialize(row)
  }

  // ── get_with_history: record + the full override chain (mirror RBI get_with_history). ──
  get_with_history(log_id, caller) {
    const row = this.db.prepare('SELECT * FROM audit_event WHERE log_id=?').get(log_id)
    if (!row) return null
    if (!sameOwner({ tenant_id: row.tenant_id, scope_id: row.scope_id, user_id: row.user_id }, caller)) return null
    const rec = this._materialize(row)
    const overrides = this.db.prepare(
      'SELECT field, value, patched_by, patched_at, reason FROM audit_override WHERE log_id=? ORDER BY patched_at'
    ).all(log_id).map(o => ({ ...o, value: o.value === null ? null : JSON.parse(o.value) }))
    return { ...rec, overrides }
  }

  // ── rawPayload: the immutable stored payload (for immutability checks; overrides NOT applied). ──
  rawPayload(log_id) {
    const row = this.db.prepare('SELECT payload FROM audit_event WHERE log_id=?').get(log_id)
    return row ? JSON.parse(row.payload) : null
  }

  // ── patch: append an override row (original NEVER mutated). Mirror AuditStore.patch. ──
  patch(log_id, field, value, { by, reason } = {}, caller) {
    const row = this.db.prepare('SELECT tenant_id, scope_id, user_id FROM audit_event WHERE log_id=?').get(log_id)
    if (!row) return false
    if (!sameOwner({ tenant_id: row.tenant_id, scope_id: row.scope_id, user_id: row.user_id }, caller)) return false
    this.db.prepare(
      'INSERT INTO audit_override (log_id, field, value, patched_by, patched_at, reason) VALUES (?,?,?,?,?,?)'
    ).run(log_id, field, value === undefined ? null : JSON.stringify(value), by ?? null, new Date().toISOString(), reason ?? null)
    return true
  }

  // ── query: filtered list. tags=ALL (must have every), exclude_tags=ANY (has any → excluded) — mirror RBI.
  //    Ownership guard (NULL-safe IS) unless caller.privileged. ──
  query(f = {}, caller = {}) {
    const { where, params } = this._where(f, caller)
    const sql = `SELECT * FROM audit_event WHERE ${where} ORDER BY ts DESC LIMIT ?`
    const rows = this.db.prepare(sql).all(...params, f.limit ?? 100)
    return rows.map(r => this._materialize(r))
  }

  // ── stats: counts by tag + Qoder cost/credits reconciliation (G3 driver). ──
  //    ⚠ SUM uses json_extract on the IMMUTABLE payload column — overrides (applied on read by get/query)
  //    do NOT flow into SQL-level aggregates. Surfaced tension (S6): aggregation-over-overrides needs a policy.
  stats(f = {}, caller = {}) {
    const { where, params } = this._where(f, caller)
    const total = this.db.prepare(`SELECT COUNT(*) c FROM audit_event WHERE ${where}`).get(...params).c
    const byTag = this.db.prepare(
      `SELECT tag, COUNT(*) c FROM audit_tag WHERE event_id IN (SELECT id FROM audit_event WHERE ${where}) GROUP BY tag`
    ).all(...params).reduce((a, r) => { a[r.tag] = r.c; return a }, {})
    const costWhere = `${where} AND EXISTS (SELECT 1 FROM audit_tag t WHERE t.event_id=audit_event.id AND t.tag='qoder_call')`
    const cost = this.db.prepare(
      `SELECT COALESCE(SUM(json_extract(payload,'$.credits.total_cost_usd')),0) cost_usd,
              COALESCE(SUM(json_extract(payload,'$.credits.total_credits')),0) credits
       FROM audit_event WHERE ${costWhere}`
    ).get(...params)
    return { total, by_tag: byTag, qoder_cost_usd: cost.cost_usd, qoder_credits: cost.credits }
  }

  // ── update_review_status: the ONE in-place mutable column (mirror RBI). ──
  update_review_status(log_id, status, caller) {
    const row = this.db.prepare('SELECT tenant_id, scope_id, user_id FROM audit_event WHERE log_id=?').get(log_id)
    if (!row) return false
    if (!sameOwner({ tenant_id: row.tenant_id, scope_id: row.scope_id, user_id: row.user_id }, caller)) return false
    this.db.prepare('UPDATE audit_event SET review_status=? WHERE log_id=?').run(status, log_id)
    return true
  }

  // ── dumpAll: surface full state (the /prototype "surface the state" rule; payload omitted for legibility —
  //    use rawPayload(log_id) to inspect the immutable stored payload). ──
  dumpAll() {
    return {
      audit_event: this.db.prepare(
        'SELECT id, log_id, ts, scope_id, tenant_id, user_id, model, review_status, ingested_at FROM audit_event ORDER BY id'
      ).all(),
      audit_tag: this.db.prepare('SELECT * FROM audit_tag ORDER BY event_id, tag').all(),
      audit_override: this.db.prepare('SELECT * FROM audit_override ORDER BY id').all(),
    }
  }

  close() { this.db.close() }

  // ── internals ──

  _where(f = {}, caller = {}) {
    const { tenant_id, scope_id, user_id, chat_session_id, tags = [], exclude_tags = [], since, until } = f
    const where = ['1=1']
    const params = []
    const add = (col, val) => { if (val !== undefined && val !== null) { where.push(`${col} = ?`); params.push(val) } }
    add('tenant_id', tenant_id); add('scope_id', scope_id); add('user_id', user_id); add('chat_session_id', chat_session_id)
    if (since) { where.push('ts >= ?'); params.push(since) }
    if (until) { where.push('ts < ?'); params.push(until) }
    for (const t of (Array.isArray(tags) ? tags : [tags]).filter(Boolean)) {
      where.push(`EXISTS (SELECT 1 FROM audit_tag t WHERE t.event_id=audit_event.id AND t.tag=?)`)
      params.push(t)
    }
    const ex = (Array.isArray(exclude_tags) ? exclude_tags : [exclude_tags]).filter(Boolean)
    if (ex.length) {
      where.push(`NOT EXISTS (SELECT 1 FROM audit_tag t WHERE t.event_id=audit_event.id AND t.tag IN (${ex.map(() => '?').join(',')}))`)
      params.push(...ex)
    }
    if (!caller.privileged) {
      // NULL-safe match (IS): an unowned caller (scope_id=''→null) matches an unowned record (scope_id NULL).
      where.push('tenant_id IS ?'); params.push(norm(caller.tenant_id) === '' ? null : caller.tenant_id)
      where.push('scope_id IS ?'); params.push(norm(caller.scope_id) === '' ? null : caller.scope_id)
      where.push('user_id IS ?'); params.push(norm(caller.user_id) === '' ? null : caller.user_id)
    }
    return { where: where.join(' AND '), params }
  }

  // Reconstruct an AuditRecord from a row: parse payload, re-inject tags from audit_tag, apply latest overrides
  // (dotted-path — mirror RBI _apply_overrides).
  _materialize(row) {
    const payload = JSON.parse(row.payload)
    payload.auto_tags = this._tagsOf(row.id)
    const latest = this._latestOverrides(row.log_id)
    for (const [field, value] of Object.entries(latest)) setDotted(payload, field, value)
    return fromPayload(payload)
  }

  _tagsOf(eventId) {
    return this.db.prepare('SELECT tag FROM audit_tag WHERE event_id=? ORDER BY tag').all(eventId).map(r => r.tag)
  }

  _latestOverrides(log_id) {
    const rows = this.db.prepare(
      'SELECT field, value, patched_at FROM audit_override WHERE log_id=? ORDER BY patched_at'
    ).all(log_id)
    const out = {}
    for (const r of rows) out[r.field] = (r.value === null ? null : JSON.parse(r.value))  // latest per field wins
    return out
  }
}
