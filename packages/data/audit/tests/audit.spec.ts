import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Audit from '../src/index.ts'
import { fromPayload, TAG, toPayload } from '../src/schema.ts'
import { openAuditDatabase, SQLiteAuditStore, type AuditQueryFilter } from '../src/store.ts'
import { IdentityService } from '@deepseek-ai/dsh-identity'
import { userId, scopeId } from '@deepseek-ai/dsh-credentials'

const alice = { tenant_id: 'acme', scope_id: 'game-1', user_id: 'alice' }
const bob = { tenant_id: 'acme', scope_id: 'game-2', user_id: 'bob' }
const admin = { privileged: true }

describe('AuditRecord schema (zod mirror of RBI pydantic)', () => {
  it('round-trips known fields and captures unknowns into extra (no data lost)', () => {
    const rec = fromPayload({
      log_id: 'abc12345',
      timestamp: '2026-08-20T00:00:00Z',
      user_id: 'alice',
      auto_tags: ['tool_call'],
      review_status: 'pending',
      tool_name: 'some-tool',
      args_hash: 'h',
      result_summary: 'ok',
    })
    expect(rec.log_id).toBe('abc12345')
    expect(rec.user_id).toBe('alice')
    expect(rec.auto_tags).toEqual(['tool_call'])
    expect((rec.extra).tool_name).toBe('some-tool')
    const wire = toPayload(rec)
    expect(wire.tool_name).toBe('some-tool') // extra flattened back to top level
    expect(wire.user_id).toBe('alice')
  })
})

describe('SQLiteAuditStore', () => {
  let s: SQLiteAuditStore
  beforeEach(() => {
    s = new SQLiteAuditStore(openAuditDatabase(':memory:'))
  })
  afterEach(() =>{  s.close() })

  it('appends and retrieves with the override applied on read', () => {
    const logId = s.append(fromPayload({
      log_id: 'r1',
      timestamp: '2026-08-20T00:00:00Z',
      scope_id: 'game-1', tenant_id: 'acme', user_id: 'alice',
      auto_tags: ['tool_call'],
      extra: { tool_name: 'lookup', result_summary: 'ok' },
    }))
    expect(logId).toBe('r1')
    const rec = s.get('r1', alice)
    expect(rec?.extra.tool_name).toBe('lookup')
    expect(rec?.extra.result_summary).toBe('ok')
  })

  it('update_review_status is visible on read (no split-brain: column re-injected like auto_tags)', () => {
    // data-infra-1: update_review_status mutates the COLUMN, not the payload;
    // _materialize must re-inject row.review_status (mirroring auto_tags) or
    // get()/query() return the insert-time status and a compliance flip to
    // 'flagged' is invisible.
    s.append(fromPayload({
      log_id: 'r1', scope_id: 'game-1', tenant_id: 'acme', user_id: 'alice', auto_tags: ['tool_call'],
    }))
    expect(s.get('r1', alice)?.review_status).toBe('pending')
    expect(s.update_review_status('r1', 'flagged', alice)).toBe(true)
    expect(s.get('r1', alice)?.review_status).toBe('flagged')
    expect(s.query({ user_id: 'alice' }, admin).find(r => r.log_id === 'r1')?.review_status).toBe('flagged')
  })

  it('ownership guard: bob ⊥ alice record = null = not-found (IDOR-safe, no existence oracle)', () => {
    s.append(fromPayload({
      log_id: 'r1', scope_id: 'game-1', tenant_id: 'acme', user_id: 'alice', auto_tags: ['tool_call'],
    }))
    expect(s.get('r1', alice)).toBeDefined()
    expect(s.get('r1', bob)).toBeNull()
    expect(s.get('nonexistent', alice)).toBeNull() // same null as bob's deny
  })

  it('cross-scope per-user query via the user_id index (single DB, no per-scope federation)', () => {
    s.append(fromPayload({ log_id: 'a1', scope_id: 'game-1', tenant_id: 'acme', user_id: 'alice', auto_tags: ['tool_call'], extra: { tool_name: 'lookup' } }))
    s.append(fromPayload({ log_id: 'a2', scope_id: 'game-2', tenant_id: 'acme', user_id: 'alice', auto_tags: ['tool_call'], extra: { tool_name: 'lookup' } }))
    const aliceCalls = s.query({ tags: ['tool_call'], user_id: 'alice' }, admin)
    expect(aliceCalls).toHaveLength(2)
    expect(aliceCalls.map(r => r.scope_id).sort()).toEqual(['game-1', 'game-2'])
  })

  it('P8b①a: patch is verdict-only — identity fields throw, verdict fields append an override (original immutable)', () => {
    s.append(fromPayload({
      log_id: 'r1', scope_id: 'game-1', tenant_id: 'acme', user_id: 'alice', auto_tags: ['tool_call'],
      extra: { tool_name: 'lookup', result_summary: 'ok' },
    }))
    // Identity fields refuse (contract violation — fail loud)
    expect(() => s.patch('r1', 'user_id', 'mallory', {}, admin)).toThrow(/identity/)
    expect(() => s.patch('r1', 'scope_id', 'game-x', {}, admin)).toThrow(/identity/)
    expect(() => s.patch('r1', 'tenant_id', 'other', {}, admin)).toThrow(/identity/)
    // Verdict field patches (original NEVER mutated; read view corrected)
    expect(s.patch('r1', 'result_summary', 'corrected', { by: 'compliance', reason: 'reconciliation' }, admin)).toBe(true)
    const raw = s.rawPayload('r1') as Record<string, unknown>
    expect(raw.result_summary).toBe('ok') // immutable
    const rec = s.get('r1', admin)
    expect(rec?.extra.result_summary).toBe('corrected') // read view corrected
    const hist = s.get_with_history('r1', admin)
    expect(hist?.overrides).toHaveLength(1)
    expect(hist?.overrides[0]?.field).toBe('result_summary')
  })

  it('P8b①a: appendCorrection corrects misattribution by appending a new record (original immutable, index-consistent)', () => {
    s.append(fromPayload({
      log_id: 'r1', scope_id: 'game-1', tenant_id: 'acme', user_id: 'alice', auto_tags: ['tool_call'],
      extra: { tool_name: 'lookup' },
    }))
    const newId = s.appendCorrection('r1', { user_id: 'carol' }, { by: 'compliance', reason: 'misattribution' }, admin)
    expect(newId).not.toBeNull()
    expect(newId).not.toBe('r1')
    // Corrected record is a real new row queryable by the corrected user_id
    const corrected = s.query({ user_id: 'carol' }, admin).find(r => r.log_id === newId)
    expect(corrected).toBeDefined()
    expect(corrected?.user_id).toBe('carol')
    expect(corrected?.auto_tags).toContain(TAG.ATTRIBUTION_CORRECTION)
    expect((corrected?.extra as Record<string, unknown>).corrects).toBe('r1')
    // Original is immutable
    expect(s.get('r1', admin)?.user_id).toBe('alice')
    // appendCorrection refuses a non-owned original
    expect(s.appendCorrection('r1', { user_id: 'x' }, {}, bob)).toBeNull()
  })

  it('P8b②c: stats and correctedStats return the same shape over the immutable/override-applied views', () => {
    // Since auto_tags is not patchable and total counts rows (not payload
    // fields), no verdict override can shift these numbers → the two methods
    // return numerically identical output. The distinct method preserves the
    // seam for future extensions.
    s.append(fromPayload({ log_id: 'a', scope_id: 'game-1', tenant_id: 'acme', user_id: 'alice', auto_tags: ['tool_call'], extra: { tool_name: 'lookup' } }))
    s.append(fromPayload({ log_id: 'b', scope_id: 'game-2', tenant_id: 'acme', user_id: 'alice', auto_tags: ['tool_call'], extra: { tool_name: 'lookup' } }))
    const immutable = s.stats({ tags: ['tool_call'], user_id: 'alice' }, admin)
    const corrected = s.correctedStats({ tags: ['tool_call'], user_id: 'alice' }, admin)
    expect(immutable.total).toBe(2)
    expect(immutable.by_tag).toEqual({ tool_call: 2 })
    expect(corrected.total).toBe(immutable.total)
    expect(corrected.by_tag).toEqual(immutable.by_tag)
  })

  it('A11: correctedStats total/by_tag are consistent with stats() across a corrections scenario', () => {
    // Setup: alice x2, bob x1 (all tool_call) + 1 correction of alice's first call → carol.
    s.append(fromPayload({ log_id: 'a1', scope_id: 'g1', tenant_id: 'acme', user_id: 'alice', auto_tags: ['tool_call'], extra: { tool_name: 'lookup' } }))
    s.append(fromPayload({ log_id: 'a2', scope_id: 'g2', tenant_id: 'acme', user_id: 'alice', auto_tags: ['tool_call'], extra: { tool_name: 'lookup' } }))
    s.append(fromPayload({ log_id: 'b1', scope_id: 'g3', tenant_id: 'acme', user_id: 'bob', auto_tags: ['tool_call'], extra: { tool_name: 'lookup' } }))
    s.appendCorrection('a1', { user_id: 'carol' }, { by: 'compliance', reason: 'misattribution' }, admin)

    // For every filter scope, correctedStats.total === stats().total AND
    // correctedStats.by_tag deep-equals stats().by_tag (superseded originals
    // are counted in total/by_tag — the correction appends a real new row).
    const scopes: AuditQueryFilter[] = [
      {}, // all (admin)
      { user_id: 'alice' },
      { user_id: 'bob' },
      { user_id: 'carol' },
      { tags: ['tool_call'] },
      { tags: ['attribution_correction'] },
      { tags: ['tool_call'], user_id: 'alice' },
    ]
    for (const f of scopes) {
      const st = s.stats(f, admin)
      const cs = s.correctedStats(f, admin)
      expect(cs.total, `total mismatch for filter ${JSON.stringify(f)}`).toBe(st.total)
      expect(cs.by_tag, `by_tag mismatch for filter ${JSON.stringify(f)}`).toEqual(st.by_tag)
    }

    // Spot-checks on the recorded row counts.
    const aliceStats = s.stats({ tags: ['tool_call'], user_id: 'alice' }, admin)
    expect(aliceStats.total).toBe(2) // a1 + a2 (a1's original row remains — appendCorrection appends, does not mutate)
    const carolStats = s.stats({ tags: ['tool_call'], user_id: 'carol' }, admin)
    expect(carolStats.total).toBe(1) // the correction record
    const allStats = s.stats({ tags: ['tool_call'] }, admin)
    expect(allStats.total).toBe(4) // a1 + a2 + b1 + correction
  })

  it('tier-2 hashBody: hash not body (intranet-security-first)', () => {
    const body = JSON.stringify({ table: 'pay_order_di', columns: [{ name: 'pay_amt' }] })
    const hash = s.hashBody(body)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain('pay_amt')
  })

  it('A4: setDotted rejects __proto__ — bad override row must not pollute Object.prototype on read', () => {
    // A bad audit_override row whose dotted path walks `__proto__` would
    // reach Object.prototype and pollute every subsequent read. patch()
    // only denies IDENTITY_FIELDS + auto_tags, so the prototype-pollution
    // guard lives in setDotted (the materialization path) — fail loud.
    s.append(fromPayload({
      log_id: 'r1', scope_id: 'game-1', tenant_id: 'acme', user_id: 'alice', auto_tags: ['tool_call'],
    }))
    // patch admits the dangerous field (not an identity field) and stores
    // the override row — the guard fires on the next read (setDotted).
    expect(s.patch('r1', '__proto__.polluted', 'pwned', { by: 'compliance', reason: 'A4' }, admin)).toBe(true)
    expect(() => s.get('r1', admin)).toThrow(/refuses segment "__proto__"/) // setDotted throws
    expect(({} as Record<string, unknown>).polluted).toBeUndefined() // Object.prototype not polluted
  })

  it('A4: setDotted rejects constructor/prototype segments — no Object.prototype pollution on read', () => {
    s.append(fromPayload({
      log_id: 'r1', scope_id: 'game-1', tenant_id: 'acme', user_id: 'alice', auto_tags: ['tool_call'],
    }))
    expect(s.patch('r1', 'constructor.prototype.polluted', 'pwned', { by: 'compliance', reason: 'A4' }, admin)).toBe(true)
    expect(() => s.get('r1', admin)).toThrow(/refuses segment "constructor"/) // first dangerous segment
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

describe('Audit service (ctx.audit) wiring', () => {
  let ctx: Context
  beforeEach(async () => {
    ctx = new Context()
    await ctx.plugin(IdentityService)
    await ctx.plugin(Audit, { path: ':memory:' })
  })
  afterEach(async () => {
    await ctx.fiber.dispose()
  })

  it('tools/post-execute captures a tool_call (observe-only, calls next())', async () => {
    const exec = { name: 'lookup', arguments: { query: 'top 10 payers', model: 'aga' } }
    const result = {
      isError: false,
      value: { kind: 'foreground', runId: 'r', output: [] },
      content: [{ type: 'text', text: 'ok' }],
    }
    const decision = await ctx.waterfall(ctx as never, 'tools/post-execute', exec as never, result as never, () => Promise.resolve({ kind: 'accept' as const }))
    expect(decision.kind).toBe('accept') // observe-only: delegated to next()
    const recs = ctx.audit.store.query({ tags: ['tool_call'] }, admin)
    expect(recs).toHaveLength(1)
    expect(recs[0]!.auto_tags).toContain('tool_call')
    expect((recs[0]!.extra).tool_name).toBe('lookup')
    expect((recs[0]!.extra).is_error).toBe(false)
    expect(recs[0]!.model).toBe('aga')
  })

  it('tools/post-execute captures a denied call as isError with the deny reason (no decision param; distinct guard_deny via explicit record)', async () => {
    const exec = { name: 'tool-bash', arguments: { command: 'rm -rf /' } }
    const result = { isError: true, error: { message: 'business-user ⊥ bash (intranet tool-gate)' }, content: [] }
    await ctx.waterfall(ctx as never, 'tools/post-execute', exec as never, result as never, () => Promise.resolve({ kind: 'accept' as const }))
    const recs = ctx.audit.store.query({ tags: ['tool_call'] }, admin)
    expect(recs).toHaveLength(1)
    expect((recs[0]!.extra).is_error).toBe(true)
    expect((recs[0]!.extra).error).toBe('business-user ⊥ bash (intranet tool-gate)')
    // The intranet tool-gate (P10) records an explicit guard_deny when it denies:
    ctx.audit.record({
      log_id: 'g1', timestamp: '2026-08-20T00:00:00Z', scope_id: 'game-1', tenant_id: 'acme', user_id: 'bob',
      auto_tags: ['guard_deny'], extra: { tool_name: 'tool-bash', deny_reason: 'business-user ⊥ bash' },
    })
    expect(ctx.audit.store.query({ tags: ['guard_deny'] }, admin)).toHaveLength(1)
  })

  it('recordTier2Write stores hash not body (fail-silent to the business write)', () => {
    const logId = ctx.audit.recordTier2Write('update_table_meta', { table: 'pay_order_di', columns: [{ name: 'pay_amt' }] }, { scope_id: 'game-1', user_id: 'alice' })
    expect(typeof logId).toBe('string')
    const rec = ctx.audit.store.query({ tags: ['tool_write'] }, admin)[0]
    expect(rec).toBeDefined()
    expect((rec!.extra).tier).toBe('tier-2')
    expect((rec!.extra).payload_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(rec!.extra)).not.toContain('pay_amt') // body NOT in audit
  })

  it('attributes per-user identity from ctx.identity (stable opportunistic, decision 6)', async () => {
    const ctx2 = new Context()
    class FixedIdentity extends IdentityService {
      override current() { return { userId: userId('alice'), tenantId: 'acme', scopeId: scopeId('game-1') } }
    }
    await ctx2.plugin(FixedIdentity)
    await ctx2.plugin(Audit, { path: ':memory:' })
    const exec = { name: 'lookup', arguments: { query: 'p', model: 'aga' } }
    const result = { isError: false, value: { kind: 'foreground', runId: 'r', output: [] }, content: [{ type: 'text', text: 'ok' }] }
    await ctx2.waterfall(ctx2 as never, 'tools/post-execute', exec as never, result as never, () => Promise.resolve({ kind: 'accept' as const }))
    const recs = ctx2.audit.store.query({ tags: ['tool_call'] }, admin)
    expect(recs).toHaveLength(1)
    expect(recs[0]!.user_id).toBe('alice')
    expect(recs[0]!.scope_id).toBe('game-1')
    expect(recs[0]!.tenant_id).toBe('acme')
    await ctx2.fiber.dispose()
  })
})

describe('definition_snapshot (W11 S1)', () => {
  let store: SQLiteAuditStore

  beforeEach(() => {
    const db = openAuditDatabase(':memory:')
    store = new SQLiteAuditStore(db)
  })

  it('recordSnapshot increments version per-asset independently', () => {
    const v1 = store.recordSnapshot('dws_pay', 'table', 'table_name: dws_pay\n')
    const v2 = store.recordSnapshot('dws_pay', 'table', 'table_name: dws_pay\nversion: 2\n')
    const v1b = store.recordSnapshot('dim_user', 'table', 'table_name: dim_user\n')
    expect(v1).toBe(1)
    expect(v2).toBe(2)
    expect(v1b).toBe(1)
  })

  it('getSnapshot returns correct content', () => {
    store.recordSnapshot('dws_pay', 'table', 'original content')
    store.recordSnapshot('dws_pay', 'table', 'second content')
    const snap = store.getSnapshot('dws_pay', 1)
    expect(snap).not.toBeNull()
    expect(snap!.content).toBe('original content')
    expect(snap!.kind).toBe('table')
    const snap2 = store.getSnapshot('dws_pay', 2)
    expect(snap2!.content).toBe('second content')
  })

  it('getSnapshot returns null for missing version', () => {
    store.recordSnapshot('dws_pay', 'table', 'content')
    expect(store.getSnapshot('dws_pay', 99)).toBeNull()
    expect(store.getSnapshot('nonexistent', 1)).toBeNull()
  })

  it('listSnapshots returns metadata newest-first', () => {
    store.recordSnapshot('dws_pay', 'table', 'v1 content', 'log-aaa')
    store.recordSnapshot('dws_pay', 'table', 'v2 content', 'log-bbb')
    store.recordSnapshot('dws_pay', 'event', 'v3 content')
    const list = store.listSnapshots('dws_pay')
    expect(list).toHaveLength(3)
    expect(list[0]!.version).toBe(3)
    expect(list[1]!.version).toBe(2)
    expect(list[2]!.version).toBe(1)
    expect(list[2]!.log_id).toBe('log-aaa')
    expect(list[0]!.log_id).toBeNull()
  })

  it('migration from v1 creates snapshot table', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs')
    // module-level function, no this-binding
    // oxlint-disable-next-line typescript/unbound-method
    const { join } = await import('node:path')
    const { DatabaseSync } = await import('node:sqlite')
    const os = await import('node:os')
    const tmpDir = mkdtempSync(join(os.tmpdir(), 'audit-migration-'))
    const dbPath = join(tmpDir, 'audit.db')
    try {
      // Create a v1 database (without the snapshot table)
      const db = new DatabaseSync(dbPath)
      db.exec('PRAGMA foreign_keys = ON')
      db.exec('PRAGMA journal_mode = WAL')
      db.exec(`
        CREATE TABLE audit_event (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          log_id TEXT UNIQUE NOT NULL,
          ts TEXT NOT NULL,
          session_id TEXT, chat_session_id INTEGER,
          scope_id TEXT, tenant_id TEXT, user_id TEXT, model TEXT,
          review_status TEXT NOT NULL DEFAULT 'pending',
          payload TEXT NOT NULL, ingested_at TEXT NOT NULL
        ) STRICT;
        CREATE TABLE audit_override (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          log_id TEXT NOT NULL, field TEXT NOT NULL, value TEXT,
          patched_by TEXT, patched_at TEXT NOT NULL, reason TEXT
        ) STRICT;
        CREATE TABLE audit_tag (
          event_id INTEGER NOT NULL, tag TEXT NOT NULL,
          PRIMARY KEY (event_id, tag),
          FOREIGN KEY (event_id) REFERENCES audit_event(id) ON DELETE CASCADE
        ) STRICT;
      `)
      db.exec('PRAGMA user_version = 1')
      db.close()

      // Re-open via openAuditDatabase — should trigger v1→v2→v3 migration
      const db2 = openAuditDatabase(dbPath)
      const store2 = new SQLiteAuditStore(db2)
      const v = store2.recordSnapshot('test_asset', 'table', 'content')
      expect(v).toBe(1)
      const ver = db2.prepare('PRAGMA user_version').get() as { user_version: number }
      expect(ver.user_version).toBe(3)
      db2.close()
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('migration from v2 adds corrects/is_correction columns + index + backfills from payload', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs')
    // oxlint-disable-next-line typescript/unbound-method
    const { join } = await import('node:path')
    const { DatabaseSync } = await import('node:sqlite')
    const os = await import('node:os')
    const tmpDir = mkdtempSync(join(os.tmpdir(), 'audit-migration-v3-'))
    const dbPath = join(tmpDir, 'audit.db')
    try {
      // Create a v2 database (audit_event WITHOUT corrects/is_correction columns).
      const db = new DatabaseSync(dbPath)
      db.exec('PRAGMA foreign_keys = ON')
      db.exec('PRAGMA journal_mode = WAL')
      db.exec(`
        CREATE TABLE audit_event (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          log_id TEXT UNIQUE NOT NULL,
          ts TEXT NOT NULL,
          session_id TEXT, chat_session_id INTEGER,
          scope_id TEXT, tenant_id TEXT, user_id TEXT, model TEXT,
          review_status TEXT NOT NULL DEFAULT 'pending',
          payload TEXT NOT NULL, ingested_at TEXT NOT NULL
        ) STRICT;
        CREATE TABLE audit_override (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          log_id TEXT NOT NULL, field TEXT NOT NULL, value TEXT,
          patched_by TEXT, patched_at TEXT NOT NULL, reason TEXT
        ) STRICT;
        CREATE TABLE audit_tag (
          event_id INTEGER NOT NULL, tag TEXT NOT NULL,
          PRIMARY KEY (event_id, tag),
          FOREIGN KEY (event_id) REFERENCES audit_event(id) ON DELETE CASCADE
        ) STRICT;
        CREATE TABLE definition_snapshot (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          asset_name TEXT NOT NULL, version INTEGER NOT NULL,
          kind TEXT NOT NULL, content TEXT NOT NULL,
          created_at TEXT NOT NULL, log_id TEXT,
          UNIQUE(asset_name, version)
        ) STRICT;
        CREATE INDEX ix_snapshot_asset ON definition_snapshot(asset_name, version);
      `)
      // Insert the original + its correction (payload carries $.corrects) + a
      // plain row, all written by a v2-era store (corrects lives only in payload
      // JSON — the new columns do not exist yet).
      const insertEvent = db.prepare(
        'INSERT INTO audit_event (log_id, ts, scope_id, tenant_id, user_id, review_status, payload, ingested_at) VALUES (?,?,?,?,?,?,?,?)',
      )
      insertEvent.run('r0', '2026-09-07T00:00:00Z', 'g1', 'acme', 'alice', 'pending', JSON.stringify({ log_id: 'r0', tool_name: 'lookup' }), '2026-09-07T00:00:00Z')
      insertEvent.run('c0', '2026-09-07T00:00:01Z', 'g1', 'acme', 'carol', 'pending', JSON.stringify({ log_id: 'c0', corrects: 'r0', tool_name: 'lookup' }), '2026-09-07T00:00:01Z')
      insertEvent.run('p1', '2026-09-07T00:00:02Z', 'g2', 'acme', 'alice', 'pending', JSON.stringify({ log_id: 'p1', tool_name: 'lookup' }), '2026-09-07T00:00:02Z')
      const insertTag = db.prepare('INSERT OR IGNORE INTO audit_tag (event_id, tag) VALUES (?, ?)')
      const r0Id = (db.prepare('SELECT id FROM audit_event WHERE log_id=?').get('r0') as { id: number }).id
      const c0Id = (db.prepare('SELECT id FROM audit_event WHERE log_id=?').get('c0') as { id: number }).id
      const p1Id = (db.prepare('SELECT id FROM audit_event WHERE log_id=?').get('p1') as { id: number }).id
      insertTag.run(r0Id, 'tool_call')
      insertTag.run(c0Id, 'tool_call')
      insertTag.run(c0Id, 'attribution_correction')
      insertTag.run(p1Id, 'tool_call')
      db.exec('PRAGMA user_version = 2')
      db.close()

      // Re-open via openAuditDatabase — should trigger v2→v3 migration.
      const db2 = openAuditDatabase(dbPath)
      const store2 = new SQLiteAuditStore(db2)

      // Schema version bumped to 3.
      const ver = db2.prepare('PRAGMA user_version').get() as { user_version: number }
      expect(ver.user_version).toBe(3)

      // New columns exist on audit_event.
      const cols = (db2.prepare('PRAGMA table_info(audit_event)').all() as Array<{ name: string }>).map(r => r.name)
      expect(cols).toContain('corrects')
      expect(cols).toContain('is_correction')

      // Partial index was created.
      const idx = db2.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='ix_audit_is_correction'").get() as { name: string } | undefined
      expect(idx?.name).toBe('ix_audit_is_correction')

      // Backfill: c0 (a correction, payload.corrects='r0') → corrects='r0', is_correction=1.
      const c0Row = db2.prepare('SELECT corrects, is_correction FROM audit_event WHERE log_id=?').get('c0') as { corrects: string | null; is_correction: number }
      expect(c0Row.corrects).toBe('r0')
      expect(c0Row.is_correction).toBe(1)

      // Plain rows: corrects=NULL, is_correction=0.
      const r0Row = db2.prepare('SELECT corrects, is_correction FROM audit_event WHERE log_id=?').get('r0') as { corrects: string | null; is_correction: number }
      expect(r0Row.corrects).toBeNull()
      expect(r0Row.is_correction).toBe(0)
      const p1Row = db2.prepare('SELECT corrects, is_correction FROM audit_event WHERE log_id=?').get('p1') as { corrects: string | null; is_correction: number }
      expect(p1Row.corrects).toBeNull()
      expect(p1Row.is_correction).toBe(0)

      // stats/correctedStats return the same shape (numerically identical since
      // auto_tags is not patchable and total counts rows).
      const cs = store2.correctedStats({ tags: ['tool_call'] }, admin)
      const st = store2.stats({ tags: ['tool_call'] }, admin)
      expect(cs.total).toBe(st.total)
      expect(cs.by_tag).toEqual(st.by_tag) // {tool_call: 3, attribution_correction: 1 subset}

      // Re-opening is idempotent (migration is a no-op on a v3 DB).
      db2.close()
      const db3 = openAuditDatabase(dbPath)
      const ver3 = db3.prepare('PRAGMA user_version').get() as { user_version: number }
      expect(ver3.user_version).toBe(3)
      const c0Re = db3.prepare('SELECT corrects, is_correction FROM audit_event WHERE log_id=?').get('c0') as { corrects: string | null; is_correction: number }
      expect(c0Re.corrects).toBe('r0')
      expect(c0Re.is_correction).toBe(1)
      db3.close()
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
