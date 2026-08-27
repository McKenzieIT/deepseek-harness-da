/**
 * SQLiteAuditStore — relational node:sqlite audit store (mirror of RBI
 * SqlAlchemyAuditStore + AuditEvent/AuditOverride/AuditTag). `audit_event`
 * immutable append + `audit_override` append-only dotted-path patch +
 * `audit_tag` junction; WAL + foreign_keys + busy_timeout + STRICT tables;
 * ownership guard (NULL-safe IS, IDOR-safe null); P8b①a verdict-only patch
 * (identity fields not patchable — corrected by appendCorrection) + P8b②c
 * stats (immutable original) + correctedStats (override-applied re-aggregation).
 *
 * The store owns its `node:sqlite` `DatabaseSync` directly (P8 D2): it is a
 * sibling to the `ctx.audit` seam, NOT routed through `ctx.storage`/
 * `ctx.storageDomain` (which are KV-only — no cross-table transactions,
 * secondary indexes, or multi-segment keys, per the storage-domain contract).
 *
 * @module @deepseek-ai/dsh-audit/store
 */

import { createHash, randomUUID } from 'node:crypto'
import { closeSync, mkdirSync, openSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import {
  fromPayload,
  toPayload,
  TAG,
  IDENTITY_FIELDS,
  type AuditRecord,
} from './schema.ts'

/** On-disk schema version (PRAGMA user_version); bump only on a breaking table-layout change. */
const AUDIT_SCHEMA_VERSION = 2

const SCHEMA = `
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
  payload         TEXT NOT NULL,
  ingested_at     TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS ix_audit_tenant_scope_ts ON audit_event(tenant_id, scope_id, ts);
CREATE INDEX IF NOT EXISTS ix_audit_chat_session    ON audit_event(chat_session_id);
CREATE INDEX IF NOT EXISTS ix_audit_session         ON audit_event(session_id);
CREATE INDEX IF NOT EXISTS ix_audit_user_ts        ON audit_event(user_id, ts);
CREATE INDEX IF NOT EXISTS ix_audit_scope_ts       ON audit_event(scope_id, ts);
CREATE INDEX IF NOT EXISTS ix_audit_ts             ON audit_event(ts);

CREATE TABLE IF NOT EXISTS audit_override (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  log_id     TEXT NOT NULL,
  field      TEXT NOT NULL,
  value      TEXT,
  patched_by TEXT,
  patched_at TEXT NOT NULL,
  reason     TEXT
) STRICT;
CREATE INDEX IF NOT EXISTS ix_override_log_time ON audit_override(log_id, patched_at);

CREATE TABLE IF NOT EXISTS audit_tag (
  event_id  INTEGER NOT NULL,
  tag       TEXT NOT NULL,
  PRIMARY KEY (event_id, tag),
  FOREIGN KEY (event_id) REFERENCES audit_event(id) ON DELETE CASCADE
) STRICT;
CREATE INDEX IF NOT EXISTS ix_audit_tag ON audit_tag(tag);

CREATE TABLE IF NOT EXISTS definition_snapshot (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_name  TEXT NOT NULL,
  version     INTEGER NOT NULL,
  kind        TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  log_id      TEXT,
  UNIQUE(asset_name, version)
) STRICT;
CREATE INDEX IF NOT EXISTS ix_snapshot_asset ON definition_snapshot(asset_name, version);
`

const MIGRATION_V1_TO_V2 = `
CREATE TABLE IF NOT EXISTS definition_snapshot (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_name  TEXT NOT NULL,
  version     INTEGER NOT NULL,
  kind        TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  log_id      TEXT,
  UNIQUE(asset_name, version)
) STRICT;
CREATE INDEX IF NOT EXISTS ix_snapshot_asset ON definition_snapshot(asset_name, version);
`

/** Exclusively create a missing database file with owner-only permissions. */
function createDatabaseFileSync(path: string): void {
  try {
    const fd = openSync(path, 'wx', 0o600)
    closeSync(fd)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
}

/**
 * Open the audit database and apply schema + pragmas. Missing directories and
 * database files are created owner-only (`:memory:` skips filesystem setup,
 * for tests). A zero `user_version` is stamped with
 * {@link AUDIT_SCHEMA_VERSION}; every other non-current version rejects rather
 * than being migrated in place (the audit log is immutable history). Mirrors
 * the `dsh-storage-sqlite` open sequence (the third node:sqlite user in this
 * repo) but is self-contained — audit owns its DB, not the storage hub.
 * @param path - the SQLite database file to open, or `:memory:`.
 * @returns the open handle with pragmas + schema applied.
 */
export function openAuditDatabase(path: string): DatabaseSync {
  const actual = path === ':memory:' ? path : resolve(path)
  if (actual !== ':memory:') {
    mkdirSync(dirname(actual), { recursive: true, mode: 0o700 })
    createDatabaseFileSync(actual)
  }
  const db = new DatabaseSync(actual)
  try {
    db.exec('PRAGMA foreign_keys = ON')
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA busy_timeout = 5000')
    const onDisk = db.prepare('PRAGMA user_version').get() as { user_version: number }
    if (onDisk.user_version === 1) {
      db.exec(MIGRATION_V1_TO_V2)
      db.exec(`PRAGMA user_version = ${AUDIT_SCHEMA_VERSION}`)
    } else if (onDisk.user_version !== 0 && onDisk.user_version !== AUDIT_SCHEMA_VERSION) {
      throw new Error(
        `audit database at "${actual}" has schema version ${onDisk.user_version}, incompatible with this build (${AUDIT_SCHEMA_VERSION})`,
      )
    }
    db.exec(SCHEMA)
    if (onDisk.user_version === 0) db.exec(`PRAGMA user_version = ${AUDIT_SCHEMA_VERSION}`)
    return db
  } catch (error) {
    db.close()
    throw error
  }
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}
function newLogId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 8)
}
function nowIso(): string {
  return new Date().toISOString()
}
/** Normalize an identity value to the "unowned" bucket (mirror RBI _same_owner). */
function norm(v: unknown): string {
  return v === null || v === undefined || v === '' ? '' : String(v)
}

/** Coerce a caller identity value to a SQL bind value: empty/null/undefined → null (the unowned bucket). */
function bindIdentity(v: string | null | undefined): SQLInputValue {
  return v === undefined || v === null || v === '' ? null : v
}

interface RowIdentity {
  readonly tenant_id: string | null
  readonly scope_id: string | null
  readonly user_id: string | null
}

/**
 * Ownership guard (mirror RBI _assert_same_identity, extended with user_id).
 * Caller must match the record's tenant+scope+user (NULL-safe via IS), OR be
 * privileged (compliance officer / P9 admin — production bypass).
 */
function sameOwner(recIdent: RowIdentity, caller: AuditCaller | undefined): boolean {
  if (caller && caller.privileged) return true
  if (!caller) return false
  return norm(recIdent.tenant_id) === norm(caller.tenant_id)
    && norm(recIdent.scope_id) === norm(caller.scope_id)
    && norm(recIdent.user_id) === norm(caller.user_id)
}

/** Apply an override via dotted path (mirror RBI _apply_overrides dotted-path setter). */
function setDotted(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.')
  let o: Record<string, unknown> = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i] as string
    const next = o[k]
    o[k] = next !== null && typeof next === 'object' ? next : {}
    o = o[k] as Record<string, unknown>
  }
  o[parts[parts.length - 1] as string] = value
}

/** Caller identity for read ownership checks. */
export interface AuditCaller {
  readonly tenant_id?: string | null
  readonly scope_id?: string | null
  readonly user_id?: string | null
  /** Privileged callers (compliance officer / P9 admin) bypass the ownership guard. */
  readonly privileged?: boolean
}

/** Filter for query/stats (tags=ALL must have every; exclude_tags=ANY excludes). */
export interface AuditQueryFilter {
  readonly tenant_id?: string | null
  readonly scope_id?: string | null
  readonly user_id?: string | null
  readonly chat_session_id?: number | null
  readonly tags?: readonly string[] | string
  readonly exclude_tags?: readonly string[] | string
  readonly since?: string
  readonly until?: string
  readonly limit?: number
}

/** Corrected identity for an attribution correction (P8b①a). */
export interface AuditIdentity {
  readonly user_id?: string | null
  readonly scope_id?: string | null
  readonly tenant_id?: string | null
  readonly session_id?: string | null
  readonly chat_session_id?: number | null
}

/** Aggregated audit counts + Qoder cost/credits reconciliation (G3 driver). */
export interface AuditStats {
  readonly total: number
  readonly by_tag: Record<string, number>
  readonly qoder_cost_usd: number
  readonly qoder_credits: number
}

/** A record with its full override chain attached (mirror RBI get_with_history). */
export interface AuditRecordWithHistory extends AuditRecord {
  readonly overrides: Array<{
    readonly field: string
    readonly value: unknown
    readonly patched_by: string | null
    readonly patched_at: string
    readonly reason: string | null
  }>
}

interface AuditEventRow {
  readonly id: number
  readonly log_id: string
  readonly ts: string
  readonly session_id: string | null
  readonly chat_session_id: number | null
  readonly scope_id: string | null
  readonly tenant_id: string | null
  readonly user_id: string | null
  readonly model: string | null
  readonly review_status: string
  readonly payload: string
  readonly ingested_at: string
}

interface OverrideRow {
  readonly field: string
  readonly value: string | null
  readonly patched_by: string | null
  readonly patched_at: string
  readonly reason: string | null
}

/**
 * Relational audit store over a {@link DatabaseSync}. `audit_event` is an
 * immutable append log (payload EXCLUDES auto_tags); `audit_override` is
 * append-only dotted-path patches (original never mutated — ADR-0003 trust);
 * `audit_tag` is the single source of truth for tags. Reads apply the latest
 * override per field on materialization; SQL-level aggregates bypass overrides
 * (see {@link stats} vs {@link correctedStats}).
 */
interface CorrectionSourceRow {
  readonly id: number
  readonly tenant_id: string | null
  readonly scope_id: string | null
  readonly user_id: string | null
  readonly payload: string
}

/**
 * Relational audit store backing the {@link Audit} service. Owns its
 * `node:sqlite` {@link DatabaseSync} directly (a sibling to the `ctx.audit`
 * seam, NOT routed through `ctx.storage` — KV-only has no relational
 * tables/indexes). `audit_event` is an immutable append log; `audit_override`
 * is append-only dotted-path patches (original never mutated — ADR-0003
 * trust); `audit_tag` is the single source of truth for tags. Reads apply the
 * latest override per field on materialization; SQL-level aggregates bypass
 * overrides (see {@link stats} vs {@link correctedStats}). All guarded reads
 * enforce the ownership guard (NULL-safe IS, IDOR-safe null) unless
 * `caller.privileged`.
 */
export class SQLiteAuditStore {
  constructor(private readonly db: DatabaseSync) {}

  /**
   * Insert one audit_event + its tags (one txn). Mirror AuditStore.append.
   * payload EXCLUDES auto_tags (single source of truth = audit_tag table).
   *
   * @param record - the audit record payload (or a partial payload normalized via `fromPayload`).
   * @returns the appended record's `log_id`.
   */
  append(record: AuditRecord | Record<string, unknown>): string {
    const rec = fromPayload(record)
    const wire = toPayload(rec)
    const payloadBody: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(wire)) if (k !== 'auto_tags') payloadBody[k] = v
    const payloadJson = JSON.stringify(payloadBody)
    const ts = rec.timestamp || nowIso()
    const ingestedAt = nowIso()
    try {
      this.db.exec('BEGIN')
      const res = this.db.prepare(
        `INSERT INTO audit_event
           (log_id, ts, session_id, chat_session_id, scope_id, tenant_id, user_id, model, review_status, payload, ingested_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(rec.log_id, ts, rec.session_id, rec.chat_session_id, rec.scope_id, rec.tenant_id,
        rec.user_id, rec.model, rec.review_status, payloadJson, ingestedAt)
      const eventId = Number(res.lastInsertRowid)
      const insTag = this.db.prepare('INSERT OR IGNORE INTO audit_tag (event_id, tag) VALUES (?, ?)')
      for (const t of rec.auto_tags) insTag.run(eventId, t)
      this.db.exec('COMMIT')
      return rec.log_id
    } catch (error) {
      try { this.db.exec('ROLLBACK') } catch { /* ignore rollback failure */ }
      throw error
    }
  }

  /**
   * Read one record (latest override applied). Ownership guard → null if
   * mismatch (IDOR-safe, indistinguishable from not-found — no existence oracle
   * on the 32-bit log_id space; mirror RBI).
   *
   * @param log_id - the 8-char hex audit log id to look up.
   * @param caller - the caller identity for the ownership guard (privileged bypasses it).
   * @returns the materialized record (latest overrides applied), or `null` if not found / not owned.
   */
  get(log_id: string, caller: AuditCaller = {}): AuditRecord | null {
    const row = this.db.prepare('SELECT * FROM audit_event WHERE log_id=?').get(log_id) as AuditEventRow | undefined
    if (!row) return null
    if (!sameOwner({ tenant_id: row.tenant_id, scope_id: row.scope_id, user_id: row.user_id }, caller)) return null
    return this._materialize(row)
  }

  /**
   * Record + the full override chain (mirror RBI get_with_history).
   *
   * @param log_id - the 8-char hex audit log id to look up.
   * @param caller - the caller identity for the ownership guard (privileged bypasses it).
   * @returns the materialized record with its full override chain, or `null` if not found / not owned.
   */
  get_with_history(log_id: string, caller: AuditCaller = {}): AuditRecordWithHistory | null {
    const row = this.db.prepare('SELECT * FROM audit_event WHERE log_id=?').get(log_id) as AuditEventRow | undefined
    if (!row) return null
    if (!sameOwner({ tenant_id: row.tenant_id, scope_id: row.scope_id, user_id: row.user_id }, caller)) return null
    const rec = this._materialize(row)
    const overrides = (this.db.prepare(
      'SELECT field, value, patched_by, patched_at, reason FROM audit_override WHERE log_id=? ORDER BY patched_at, id',
    ).all(log_id) as unknown as OverrideRow[]).map(o => ({ ...o, value: o.value === null ? null : JSON.parse(o.value) }))
    return { ...rec, overrides }
  }

  /**
   * The immutable stored payload (for immutability checks; overrides NOT applied).
   *
   * @param log_id - the 8-char hex audit log id to look up.
   * @returns the stored payload object, or `null` if not found.
   */
  rawPayload(log_id: string): Record<string, unknown> | null {
    const row = this.db.prepare('SELECT payload FROM audit_event WHERE log_id=?').get(log_id) as { payload: string } | undefined
    return row ? (JSON.parse(row.payload) as Record<string, unknown>) : null
  }

  /**
   * Append a verdict override (original NEVER mutated). Mirror AuditStore.patch.
   *
   * P8b tension① decision (a): identity fields
   * (user_id/scope_id/tenant_id/session_id/chat_session_id/log_id) are NOT
   * patchable — patching them would split the read view from the indexed
   * column + ownership guard (split-brain). A patch whose first dotted
   * segment is an identity field THROWS (contract violation — fail loud so a
   * compliance tool cannot silently misattribute). Misattribution is corrected
   * by {@link appendCorrection} (append a new record + tag), not by patching.
   * Returns false on not-found or ownership mismatch (IDOR-safe silence,
   * indistinguishable from not-found).
   *
   * @param log_id - the 8-char hex audit log id of the record to patch.
   * @param field - the dotted-path field name to override (a non-identity verdict field).
   * @param value - the override value (JSON-encoded into `audit_override.value`).
   * @param opts - optional `by` (patcher) and `reason` provenance fields.
   * @param caller - the caller identity for the ownership guard (privileged bypasses it).
   * @returns `true` if the override was appended; `false` on not-found / ownership mismatch; throws if `field` is an identity field.
   */
  patch(log_id: string, field: string, value: unknown, opts: { by?: string; reason?: string } = {}, caller: AuditCaller = {}): boolean {
    const firstSegment = field.split('.')[0] as string
    if (IDENTITY_FIELDS.has(firstSegment)) {
      throw new Error(
        `audit patch refuses identity field "${firstSegment}": identity is immutable (P8b①a); correct misattribution via appendCorrection`,
      )
    }
    const row = this.db.prepare('SELECT tenant_id, scope_id, user_id FROM audit_event WHERE log_id=?').get(log_id) as RowIdentity | undefined
    if (!row) return false
    if (!sameOwner({ tenant_id: row.tenant_id, scope_id: row.scope_id, user_id: row.user_id }, caller)) return false
    this.db.prepare(
      'INSERT INTO audit_override (log_id, field, value, patched_by, patched_at, reason) VALUES (?,?,?,?,?,?)',
    ).run(log_id, field, value === undefined ? null : JSON.stringify(value), opts.by ?? null, nowIso(), opts.reason ?? null)
    return true
  }

  /**
   * Correct a misattribution by appending a NEW audit_event with the corrected
   * identity + an `attribution_correction` tag + `extra.corrects` pointing at
   * the original (P8b tension① decision (a)). The corrected identity is a real
   * new row, so it is queryable via the `user_id` index and guard-consistent;
   * the original is never mutated (ADR-0003 trust). The new record carries the
   * original's raw content (event data) + the corrected identity; its verdict
   * (override chain) starts fresh. Returns the new log_id, or null if the
   * original is absent or not owned by the caller.
   *
   * @param originalLogId - the 8-char hex audit log id of the misattributed record.
   * @param correctIdentity - the corrected identity fields to stamp on the new record.
   * @param opts - optional `by` (corrector) and `reason` provenance fields.
   * @param caller - the caller identity for the ownership guard on the original (privileged bypasses it).
   * @returns the new correction record's `log_id`, or `null` if the original is absent / not owned.
   */
  appendCorrection(
    originalLogId: string,
    correctIdentity: AuditIdentity,
    opts: { by?: string; reason?: string } = {},
    caller: AuditCaller = {},
  ): string | null {
    const row = this.db.prepare('SELECT id, tenant_id, scope_id, user_id, payload FROM audit_event WHERE log_id=?')
      .get(originalLogId) as CorrectionSourceRow | undefined
    if (!row) return null
    if (!sameOwner({ tenant_id: row.tenant_id, scope_id: row.scope_id, user_id: row.user_id }, caller)) return null
    const storedPayload = JSON.parse(row.payload) as Record<string, unknown>
    const origTags = this._tagsOf(row.id)
    const newId = newLogId()
    const corrected = fromPayload({
      ...storedPayload, // original content (known fields + flattened extra)
      log_id: newId, // NEW identity for the correction record
      timestamp: nowIso(),
      ...correctIdentity, // corrected identity fields
      corrects: originalLogId, // → extra.corrects (non-known key)
      ...(opts.by !== undefined ? { corrected_by: opts.by } : {}),
      ...(opts.reason !== undefined ? { correction_reason: opts.reason } : {}),
      auto_tags: [...origTags, TAG.ATTRIBUTION_CORRECTION],
    })
    this.append(corrected)
    return newId
  }

  /**
   * Filtered list. tags=ALL (must have every), exclude_tags=ANY (has any →
   * excluded) — mirror RBI. Ownership guard (NULL-safe IS) unless caller.privileged.
   *
   * @param f - the query filter (identity, tags, time window, limit).
   * @param caller - the caller identity for the ownership guard (privileged bypasses it).
   * @returns the matching records, materialized (latest overrides applied), newest-first.
   */
  query(f: AuditQueryFilter = {}, caller: AuditCaller = {}): AuditRecord[] {
    const { where, params } = this._where(f, caller)
    const sql = `SELECT * FROM audit_event WHERE ${where} ORDER BY ts DESC LIMIT ?`
    const rows = this.db.prepare(sql).all(...params, f.limit ?? 100) as unknown as AuditEventRow[]
    return rows.map(r => this._materialize(r))
  }

  /**
   * Immutable-original aggregation (P8b tension② decision (c)): SUM over the
   * IMMUTABLE payload column. Overrides (applied on read) do NOT flow into
   * SQL-level aggregates — this answers "what was recorded at the time" (the
   * compliance baseline, matches {@link rawPayload}). Use {@link correctedStats}
   * for the override-applied reconciliation view.
   *
   * @param f - the query filter scoping the aggregation (identity, tags, time window).
   * @param caller - the caller identity for the ownership guard (privileged bypasses it).
   * @returns the aggregated counts + Qoder cost/credits reconciliation over the immutable payloads.
   */
  stats(f: AuditQueryFilter = {}, caller: AuditCaller = {}): AuditStats {
    const { where, params } = this._where(f, caller)
    const total = (this.db.prepare(`SELECT COUNT(*) c FROM audit_event WHERE ${where}`).get(...params) as { c: number }).c
    const byTag = (this.db.prepare(
      `SELECT tag, COUNT(*) c FROM audit_tag WHERE event_id IN (SELECT id FROM audit_event WHERE ${where}) GROUP BY tag`,
    ).all(...params) as Array<{ tag: string; c: number }>).reduce((a, r) => { a[r.tag] = r.c; return a }, {} as Record<string, number>)
    const costWhere = `${where} AND EXISTS (SELECT 1 FROM audit_tag t WHERE t.event_id=audit_event.id AND t.tag=?)`
    const cost = this.db.prepare(
      `SELECT COALESCE(SUM(json_extract(payload,'$.credits.total_cost_usd')),0) cost_usd,
              COALESCE(SUM(json_extract(payload,'$.credits.total_credits')),0) credits
       FROM audit_event WHERE ${costWhere}`,
    ).get(...params, TAG.QODER_CALL) as { cost_usd: number; credits: number }
    return { total, by_tag: byTag, qoder_cost_usd: cost.cost_usd, qoder_credits: cost.credits }
  }

  /**
   * Override-applied (corrected) aggregation (P8b tension② decision (c)): O(n)
   * re-aggregation over the materialized view (overrides applied per record).
   * Answers "what is the corrected/current cost" for compliance reconciliation
   * against Qoder billing. by_tag counts are immutable (tags are not patchable
   * — identity is corrected via appendCorrection, verdicts don't touch tags),
   * so they match {@link stats}; only the cost/credits reflect overrides. No
   * LIMIT: reconciliation aggregates the full filtered set (the accepted O(n)
   * cost for an infrequent compliance query — not a hot path).
   *
   * @param f - the query filter scoping the aggregation (identity, tags, time window).
   * @param caller - the caller identity for the ownership guard (privileged bypasses it).
   * @returns the override-applied counts + corrected Qoder cost/credits reconciliation.
   */
  correctedStats(f: AuditQueryFilter = {}, caller: AuditCaller = {}): AuditStats {
    const { where, params } = this._where(f, caller)
    const rows = this.db.prepare(`SELECT * FROM audit_event WHERE ${where} ORDER BY ts DESC`).all(...params) as unknown as AuditEventRow[]
    const recs = rows.map(r => this._materialize(r))
    const matchedIds = new Set(recs.map(r => r.log_id))
    // P8b①a + ②c interaction: an appendCorrection supersedes its original, so the
    // corrected view dedups — it skips superseded originals (the correction record
    // carries the corrected identity + the same cost, counted once in its own
    // right). Corrections may sit OUTSIDE this filter (a different user_id), so
    // look across the whole table for `extra.corrects` links at a matched original.
    const superseded = new Set<string>()
    const corrections = this.db.prepare(
      'SELECT json_extract(payload, \'$.corrects\') AS original FROM audit_event WHERE json_extract(payload, \'$.corrects\') IS NOT NULL',
    ).all() as Array<{ original: string | null }>
    for (const c of corrections) {
      if (c.original !== null && matchedIds.has(c.original)) superseded.add(c.original)
    }
    let costUsd = 0
    let credits = 0
    let counted = 0
    const byTag: Record<string, number> = {}
    for (const rec of recs) {
      if (superseded.has(rec.log_id)) continue
      counted += 1
      if (rec.auto_tags.includes(TAG.QODER_CALL)) {
        const c = rec.extra.credits
        if (c !== null && c !== undefined && typeof c === 'object') {
          const cc = c as { total_cost_usd?: number; total_credits?: number }
          costUsd += Number(cc.total_cost_usd ?? 0)
          credits += Number(cc.total_credits ?? 0)
        }
      }
      for (const t of rec.auto_tags) byTag[t] = (byTag[t] ?? 0) + 1
    }
    return { total: counted, by_tag: byTag, qoder_cost_usd: costUsd, qoder_credits: credits }
  }

  /**
   * Update review_status — the ONE in-place mutable column (mirror RBI).
   *
   * @param log_id - the 8-char hex audit log id of the record to update.
   * @param status - the new review status string (e.g. 'pending'/'reviewed'/'flagged').
   * @param caller - the caller identity for the ownership guard (privileged bypasses it).
   * @returns `true` if the row was updated; `false` on not-found / ownership mismatch.
   */
  update_review_status(log_id: string, status: string, caller: AuditCaller = {}): boolean {
    const row = this.db.prepare('SELECT tenant_id, scope_id, user_id FROM audit_event WHERE log_id=?').get(log_id) as RowIdentity | undefined
    if (!row) return false
    if (!sameOwner({ tenant_id: row.tenant_id, scope_id: row.scope_id, user_id: row.user_id }, caller)) return false
    this.db.prepare('UPDATE audit_event SET review_status=? WHERE log_id=?').run(status, log_id)
    return true
  }

  /**
   * Surface full state (the /prototype "surface the state" rule; payload omitted for legibility).
   *
   * @returns the three tables as plain row arrays (`audit_event` rows omit the `payload` column for legibility).
   */
  dumpAll(): { audit_event: unknown[]; audit_tag: unknown[]; audit_override: unknown[] } {
    return {
      audit_event: this.db.prepare(
        'SELECT id, log_id, ts, scope_id, tenant_id, user_id, model, review_status, ingested_at FROM audit_event ORDER BY id',
      ).all(),
      audit_tag: this.db.prepare('SELECT * FROM audit_tag ORDER BY event_id, tag').all(),
      audit_override: this.db.prepare('SELECT * FROM audit_override ORDER BY id').all(),
    }
  }

  /**
   * Hash a payload body for tier-2 留痕 (hash NOT body — intranet-security-first).
   *
   * @param body - the serialized payload body to hash.
   * @returns the SHA-256 hex digest of the body.
   */
  hashBody(body: string): string {
    return sha256(body)
  }

  /** Close the underlying `DatabaseSync` handle (registered as the service unload effect). */
  close(): void {
    this.db.close()
  }

  // ── internals ──

  private _where(f: AuditQueryFilter, caller: AuditCaller): { where: string; params: SQLInputValue[] } {
    const where: string[] = ['1=1']
    const params: SQLInputValue[] = []
    const add = (col: string, val: SQLInputValue | undefined): void => {
      if (val !== undefined && val !== null) { where.push(`${col} = ?`); params.push(val) }
    }
    add('tenant_id', f.tenant_id)
    add('scope_id', f.scope_id)
    add('user_id', f.user_id)
    add('chat_session_id', f.chat_session_id)
    if (f.since) { where.push('ts >= ?'); params.push(f.since) }
    if (f.until) { where.push('ts < ?'); params.push(f.until) }
    const tags = (Array.isArray(f.tags) ? f.tags : f.tags ? [f.tags] : []).filter(Boolean)
    for (const t of tags) {
      where.push('EXISTS (SELECT 1 FROM audit_tag t WHERE t.event_id=audit_event.id AND t.tag=?)')
      params.push(t)
    }
    const ex = (Array.isArray(f.exclude_tags) ? f.exclude_tags : f.exclude_tags ? [f.exclude_tags] : []).filter(Boolean)
    if (ex.length) {
      where.push(`NOT EXISTS (SELECT 1 FROM audit_tag t WHERE t.event_id=audit_event.id AND t.tag IN (${ex.map(() => '?').join(',')}))`)
      params.push(...ex)
    }
    if (!caller.privileged) {
      // NULL-safe match (IS): an unowned caller (scope_id=''→null) matches an unowned record (scope_id NULL).
      where.push('tenant_id IS ?'); params.push(bindIdentity(caller.tenant_id))
      where.push('scope_id IS ?'); params.push(bindIdentity(caller.scope_id))
      where.push('user_id IS ?'); params.push(bindIdentity(caller.user_id))
    }
    return { where: where.join(' AND '), params }
  }

  /** Reconstruct an AuditRecord: parse payload, re-inject tags, apply latest overrides (dotted-path). */
  private _materialize(row: AuditEventRow): AuditRecord {
    const payload = JSON.parse(row.payload) as Record<string, unknown>
    payload.auto_tags = this._tagsOf(row.id)
    const latest = this._latestOverrides(row.log_id)
    for (const [field, value] of Object.entries(latest)) setDotted(payload, field, value)
    return fromPayload(payload)
  }

  private _tagsOf(eventId: number): string[] {
    return (this.db.prepare('SELECT tag FROM audit_tag WHERE event_id=? ORDER BY tag').all(eventId) as Array<{ tag: string }>).map(r => r.tag)
  }

  private _latestOverrides(log_id: string): Record<string, unknown> {
    const rows = this.db.prepare(
      'SELECT field, value, patched_at FROM audit_override WHERE log_id=? ORDER BY patched_at, id',
    ).all(log_id) as Array<{ field: string; value: string | null; patched_at: string }>
    const out: Record<string, unknown> = {}
    for (const r of rows) out[r.field] = r.value === null ? null : JSON.parse(r.value) // latest per field wins
    return out
  }

  // ── Definition snapshot (W11 S1: undo substrate) ────────────────────────

  /**
   * Record a before-snapshot for an asset edit. Auto-increments the per-asset
   * version number. Returns the assigned version.
   *
   * Safe under SQLite WAL single-writer serialization: concurrent writers wait
   * on busy_timeout, so MAX(version) is always consistent within the txn.
   */
  recordSnapshot(assetName: string, kind: 'table' | 'event', content: string, logId?: string): number {
    if (!content) throw new Error('recordSnapshot: content must be non-empty')
    try {
      this.db.exec('BEGIN')
      const row = this.db.prepare(
        'SELECT MAX(version) AS max_v FROM definition_snapshot WHERE asset_name = ?',
      ).get(assetName) as { max_v: number | null } | undefined
      const nextVersion = ((row?.max_v) ?? 0) + 1
      this.db.prepare(
        'INSERT INTO definition_snapshot (asset_name, version, kind, content, created_at, log_id) VALUES (?,?,?,?,?,?)',
      ).run(assetName, nextVersion, kind, content, nowIso(), logId ?? null)
      this.db.exec('COMMIT')
      return nextVersion
    } catch (error) {
      try { this.db.exec('ROLLBACK') } catch { /* ignore rollback failure */ }
      throw error
    }
  }

  /**
   * Get a snapshot's content by asset name + version.
   * Returns null when not found.
   */
  getSnapshot(assetName: string, version: number): { content: string; kind: string; created_at: string } | null {
    const row = this.db.prepare(
      'SELECT content, kind, created_at FROM definition_snapshot WHERE asset_name = ? AND version = ?',
    ).get(assetName, version) as { content: string; kind: string; created_at: string } | undefined
    return row ?? null
  }

  /**
   * List all snapshot versions for an asset (metadata only, no content).
   * Returns newest-first.
   */
  listSnapshots(assetName: string): Array<{ version: number; kind: string; created_at: string; log_id: string | null }> {
    return this.db.prepare(
      'SELECT version, kind, created_at, log_id FROM definition_snapshot WHERE asset_name = ? ORDER BY version DESC',
    ).all(assetName) as Array<{ version: number; kind: string; created_at: string; log_id: string | null }>
  }
}
