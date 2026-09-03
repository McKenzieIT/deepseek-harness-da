import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Audit from '../src/index.ts'
import { fromPayload, TAG, toPayload } from '../src/schema.ts'
import { openAuditDatabase, SQLiteAuditStore } from '../src/store.ts'
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
      auto_tags: ['qoder_call'],
      review_status: 'pending',
      tool_name: 'subagent-qoder',
      args_hash: 'h',
      credits: { total_cost_usd: 0.1 },
    })
    expect(rec.log_id).toBe('abc12345')
    expect(rec.user_id).toBe('alice')
    expect(rec.auto_tags).toEqual(['qoder_call'])
    expect((rec.extra).tool_name).toBe('subagent-qoder')
    const wire = toPayload(rec)
    expect(wire.tool_name).toBe('subagent-qoder') // extra flattened back to top level
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
      auto_tags: ['qoder_call'],
      extra: { credits: { total_cost_usd: 0.1042, total_credits: 42 } },
    }))
    expect(logId).toBe('r1')
    const rec = s.get('r1', alice)
    expect(rec?.extra.credits).toMatchObject({ total_cost_usd: 0.1042, total_credits: 42 })
  })

  it('update_review_status is visible on read (no split-brain: column re-injected like auto_tags)', () => {
    // data-infra-1: update_review_status mutates the COLUMN, not the payload;
    // _materialize must re-inject row.review_status (mirroring auto_tags) or
    // get()/query() return the insert-time status and a compliance flip to
    // 'flagged' is invisible.
    s.append(fromPayload({
      log_id: 'r1', scope_id: 'game-1', tenant_id: 'acme', user_id: 'alice', auto_tags: ['qoder_call'],
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
    s.append(fromPayload({ log_id: 'a1', scope_id: 'game-1', tenant_id: 'acme', user_id: 'alice', auto_tags: ['qoder_call'], extra: { credits: { total_cost_usd: 0.1 } } }))
    s.append(fromPayload({ log_id: 'a2', scope_id: 'game-2', tenant_id: 'acme', user_id: 'alice', auto_tags: ['qoder_call'], extra: { credits: { total_cost_usd: 0.07 } } }))
    const aliceQoder = s.query({ tags: ['qoder_call'], user_id: 'alice' }, admin)
    expect(aliceQoder).toHaveLength(2)
    expect(aliceQoder.map(r => r.scope_id).sort()).toEqual(['game-1', 'game-2'])
  })

  it('P8b①a: patch is verdict-only — identity fields throw, verdict fields append an override (original immutable)', () => {
    s.append(fromPayload({
      log_id: 'r1', scope_id: 'game-1', tenant_id: 'acme', user_id: 'alice', auto_tags: ['qoder_call'],
      extra: { credits: { total_cost_usd: 0.1042 } },
    }))
    // Identity fields refuse (contract violation — fail loud)
    expect(() => s.patch('r1', 'user_id', 'mallory', {}, admin)).toThrow(/identity/)
    expect(() => s.patch('r1', 'scope_id', 'game-x', {}, admin)).toThrow(/identity/)
    expect(() => s.patch('r1', 'tenant_id', 'other', {}, admin)).toThrow(/identity/)
    // Verdict field patches (original NEVER mutated; read view corrected)
    expect(s.patch('r1', 'credits.total_cost_usd', 0.05, { by: 'compliance', reason: 'reconciliation' }, admin)).toBe(true)
    const raw = s.rawPayload('r1') as Record<string, unknown>
    expect((raw.credits as { total_cost_usd: number }).total_cost_usd).toBe(0.1042) // immutable
    const rec = s.get('r1', admin)
    expect((rec?.extra.credits as { total_cost_usd: number }).total_cost_usd).toBe(0.05) // read view corrected
    const hist = s.get_with_history('r1', admin)
    expect(hist?.overrides).toHaveLength(1)
    expect(hist?.overrides[0]?.field).toBe('credits.total_cost_usd')
  })

  it('P8b①a: appendCorrection corrects misattribution by appending a new record (original immutable, index-consistent)', () => {
    s.append(fromPayload({
      log_id: 'r1', scope_id: 'game-1', tenant_id: 'acme', user_id: 'alice', auto_tags: ['qoder_call'],
      extra: { credits: { total_cost_usd: 0.1042 } },
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

  it('P8b②c: stats = immutable original; correctedStats = override-applied (corrected totals)', () => {
    s.append(fromPayload({ log_id: 'a', scope_id: 'game-1', tenant_id: 'acme', user_id: 'alice', auto_tags: ['qoder_call'], extra: { credits: { total_cost_usd: 0.1042, total_credits: 42 } } }))
    s.append(fromPayload({ log_id: 'b', scope_id: 'game-2', tenant_id: 'acme', user_id: 'alice', auto_tags: ['qoder_call'], extra: { credits: { total_cost_usd: 0.07, total_credits: 25 } } }))
    s.patch('a', 'credits.total_cost_usd', 0.05, { by: 'c', reason: 'recon' }, admin)
    const immutable = s.stats({ tags: ['qoder_call'], user_id: 'alice' }, admin)
    expect(immutable.total).toBe(2)
    expect(immutable.qoder_cost_usd).toBeCloseTo(0.1742, 4) // 0.1042 + 0.07 (immutable original)
    expect(immutable.qoder_credits).toBe(67) // 42 + 25
    const corrected = s.correctedStats({ tags: ['qoder_call'], user_id: 'alice' }, admin)
    expect(corrected.total).toBe(2)
    expect(corrected.qoder_cost_usd).toBeCloseTo(0.12, 4) // 0.05 + 0.07 (override applied)
    expect(corrected.qoder_credits).toBe(67) // credits not overridden → same
  })

  it('P8b①a+②c interaction: correctedStats dedups a superseded original after appendCorrection (M1)', () => {
    s.append(fromPayload({ log_id: 'a', scope_id: 'game-1', tenant_id: 'acme', user_id: 'alice', auto_tags: ['qoder_call'], extra: { credits: { total_cost_usd: 0.1042, total_credits: 42 } } }))
    s.append(fromPayload({ log_id: 'b', scope_id: 'game-2', tenant_id: 'acme', user_id: 'alice', auto_tags: ['qoder_call'], extra: { credits: { total_cost_usd: 0.07, total_credits: 25 } } }))
    s.appendCorrection('a', { user_id: 'carol' }, { by: 'compliance', reason: 'misattribution' }, admin)
    // correctedStats(alice): a superseded (correction is carol's, outside the alice filter) → skip a, count b.
    const aliceCorrected = s.correctedStats({ tags: ['qoder_call'], user_id: 'alice' }, admin)
    expect(aliceCorrected.total).toBe(1)
    expect(aliceCorrected.qoder_cost_usd).toBeCloseTo(0.07, 4)
    // correctedStats(carol): the correction record (0.1042) — the call's cost attributed to carol.
    const carolCorrected = s.correctedStats({ tags: ['qoder_call'], user_id: 'carol' }, admin)
    expect(carolCorrected.total).toBe(1)
    expect(carolCorrected.qoder_cost_usd).toBeCloseTo(0.1042, 4)
    // correctedStats(admin, no user filter): a superseded → skip; correction (0.1042) + b (0.07) = 0.1742, no double-count.
    const allCorrected = s.correctedStats({ tags: ['qoder_call'] }, admin)
    expect(allCorrected.total).toBe(2)
    expect(allCorrected.qoder_cost_usd).toBeCloseTo(0.1742, 4)
    // stats (immutable original) counts all 3 recorded rows — the "recorded at the time" baseline.
    const immutable = s.stats({ tags: ['qoder_call'] }, admin)
    expect(immutable.total).toBe(3)
    expect(immutable.qoder_cost_usd).toBeCloseTo(0.1042 + 0.1042 + 0.07, 4)
  })

  it('tier-2 hashBody: hash not body (intranet-security-first)', () => {
    const body = JSON.stringify({ table: 'pay_order_di', columns: [{ name: 'pay_amt' }] })
    const hash = s.hashBody(body)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain('pay_amt')
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

  it('tools/post-execute captures a qoder_call + Credits from result.value.costs (observe-only, calls next())', async () => {
    const exec = { name: 'subagent', arguments: { prompt: 'top 10 payers', model: 'qoder-max' } }
    const result = {
      isError: false,
      value: { kind: 'foreground', runId: 'r', output: [], costs: { total_cost_usd: 0.1042, total_credits: 42, usage: { input: 1200 }, modelUsage: { 'qoder-max': { input: 1200 } } } },
      content: [],
    }
    const decision = await ctx.waterfall(ctx as never, 'tools/post-execute', exec as never, result as never, () => Promise.resolve({ kind: 'accept' as const }))
    expect(decision.kind).toBe('accept') // observe-only: delegated to next()
    const recs = ctx.audit.store.query({ tags: ['qoder_call'] }, admin)
    expect(recs).toHaveLength(1)
    expect(recs[0]!.auto_tags).toContain(TAG.QODER_CALL)
    expect((recs[0]!.extra).credits).toMatchObject({ total_cost_usd: 0.1042, total_credits: 42 })
    expect((recs[0]!.extra).tool_name).toBe('subagent')
    expect((recs[0]!.extra).is_error).toBe(false)
    expect(recs[0]!.model).toBe('qoder-max')
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

  it('attributes per-user identity from ctx.identity (G3 stable opportunistic, decision 6)', async () => {
    const ctx2 = new Context()
    class FixedIdentity extends IdentityService {
      override current() { return { userId: userId('alice'), tenantId: 'acme', scopeId: scopeId('game-1') } }
    }
    await ctx2.plugin(FixedIdentity)
    await ctx2.plugin(Audit, { path: ':memory:' })
    const exec = { name: 'subagent', arguments: { prompt: 'p', model: 'qoder-max' } }
    const result = { isError: false, value: { kind: 'foreground', runId: 'r', output: [], costs: { total_cost_usd: 0.1 } }, content: [] }
    await ctx2.waterfall(ctx2 as never, 'tools/post-execute', exec as never, result as never, () => Promise.resolve({ kind: 'accept' as const }))
    const recs = ctx2.audit.store.query({ tags: ['qoder_call'] }, admin)
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

      // Re-open via openAuditDatabase — should trigger v1→v2 migration
      const db2 = openAuditDatabase(dbPath)
      const store2 = new SQLiteAuditStore(db2)
      const v = store2.recordSnapshot('test_asset', 'table', 'content')
      expect(v).toBe(1)
      const ver = db2.prepare('PRAGMA user_version').get() as { user_version: number }
      expect(ver.user_version).toBe(2)
      db2.close()
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
