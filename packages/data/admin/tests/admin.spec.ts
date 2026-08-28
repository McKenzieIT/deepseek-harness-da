/**
 * @deepseek-ai/dsh-admin — unit tests covering the exported surface:
 * - Domain spec structure (tables, version)
 * - notifyPatMiss guidance message
 * - Plugin shape (name, inject, apply)
 *
 * Integration tests (full Cordis context with storageDomain + webServer +
 * credentials) exercise login → identity fill → PAT set → authz gate. These
 * require the storage backend; a memory backend exercises the functional path.
 *
 * Run: `pnpm vitest run packages/data/admin`
 */
import { test, expect, describe } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { AdminDomain, notifyPatMiss, name, inject, apply } from '../src/index.ts'

// ── Domain spec ─────────────────────────────────────────────────────────────

describe('AdminDomain spec', () => {
  test('domain is named "admin" with version 1', () => {
    expect(AdminDomain.name).toBe('admin')
    expect(AdminDomain.version).toBe(1)
  })

  test('declares users, sessions, and access_links tables', () => {
    const tables = Object.keys(AdminDomain.tables)
    expect(tables).toContain('users')
    expect(tables).toContain('sessions')
    expect(tables).toContain('access_links')
    expect(tables).toHaveLength(3)
  })

  test('has no global slot (per-table KV only)', () => {
    expect((AdminDomain as { global?: unknown }).global).toBeUndefined()
  })
})

// ── Plugin shape ────────────────────────────────────────────────────────────

describe('plugin exports', () => {
  test('name is "admin"', () => {
    expect(name).toBe('admin')
  })

  test('injects storageDomain, credentials, webServer', () => {
    expect(inject).toContain('storageDomain')
    expect(inject).toContain('credentials')
    expect(inject).toContain('webServer')
  })

  test('apply is a function', () => {
    expect(typeof apply).toBe('function')
  })
})

// ── PAT-miss UX ─────────────────────────────────────────────────────────────

describe('notifyPatMiss', () => {
  test('returns guidance message mentioning the ref', () => {
    const ctx = new Context()
    const msg = notifyPatMiss(ctx, 'user1', 'DEEPSEEK_API_KEY')
    expect(msg).toContain('DEEPSEEK_API_KEY')
    expect(msg).toContain('not configured')
    expect(msg).toContain('/admin/api/me/pat')
  })

  test('emits admin/pat-miss event', () => {
    const ctx = new Context()
    let emittedUser: string | undefined
    let emittedRef: string | undefined
    ctx.on('admin/pat-miss', (userId, ref) => {
      emittedUser = userId
      emittedRef = ref
    })
    notifyPatMiss(ctx, 'alice', 'MY_KEY')
    expect(emittedUser).toBe('alice')
    expect(emittedRef).toBe('MY_KEY')
  })
})

// ── Schema validation (zod schemas reject invalid records) ──────────────────

describe('domain schema validation', () => {
  test('users table schema rejects missing passwordHash', () => {
    const schema = AdminDomain.tables.users.valueSchema
    const result = schema.safeParse({ role: 'admin', tenantId: 't1', createdAt: '2026-01-01' })
    expect(result.success).toBe(false)
  })

  test('users table schema accepts valid user record', () => {
    const schema = AdminDomain.tables.users.valueSchema
    const result = schema.safeParse({
      passwordHash: 'abc123:def456',
      role: 'admin',
      tenantId: 'tenant-1',
      createdAt: '2026-01-01T00:00:00Z',
    })
    expect(result.success).toBe(true)
  })

  test('sessions table schema accepts valid session', () => {
    const schema = AdminDomain.tables.sessions.valueSchema
    const result = schema.safeParse({
      userId: 'user1',
      tenantId: 'tenant-1',
      role: 'admin',
      createdAt: '2026-01-01T00:00:00Z',
    })
    expect(result.success).toBe(true)
  })

  test('sessions table schema accepts session with scopeId', () => {
    const schema = AdminDomain.tables.sessions.valueSchema
    const result = schema.safeParse({
      userId: 'user1',
      tenantId: 'tenant-1',
      role: 'user',
      scopeId: 'scope-abc',
      createdAt: '2026-01-01T00:00:00Z',
    })
    expect(result.success).toBe(true)
  })

  test('access_links table schema rejects missing scopeId', () => {
    const schema = AdminDomain.tables.access_links.valueSchema
    const result = schema.safeParse({ tenantId: 't1', createdAt: '2026-01-01' })
    expect(result.success).toBe(false)
  })

  test('access_links table schema accepts valid link', () => {
    const schema = AdminDomain.tables.access_links.valueSchema
    const result = schema.safeParse({
      scopeId: 'game-10001',
      tenantId: 'tenant-1',
      createdAt: '2026-01-01T00:00:00Z',
    })
    expect(result.success).toBe(true)
  })
})
