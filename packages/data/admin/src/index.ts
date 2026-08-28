/**
 * `@deepseek-ai/dsh-admin` — Admin + access isolation production package.
 *
 * Single additive Cordis plugin providing:
 * - Real {@link IdentityService} impl (overrides the G3b stub's `current()`)
 * - Per-user login baseline (bcrypt + session; hardening deferred)
 * - Scope server-side resolution (AccessLink.linkToken → scopeId)
 * - Per-user PAT self-service (`/admin/api/me/pat` → keychain)
 * - Fail-closed authz gate (role=admin required for admin routes)
 * - PAT-miss UX (per-user PAT not configured → reject + lazy prompt)
 *
 * RBI model entities persisted via `ctx.storageDomain`:
 * - `users`: userId → {passwordHash, role, tenantId, displayName, createdAt}
 * - `sessions`: sessionToken → {userId, tenantId, scopeId, role, createdAt}
 * - `access_links`: linkToken → {scopeId, tenantId, createdAt}
 *
 * @module @deepseek-ai/dsh-admin
 */

import { randomBytes, timingSafeEqual } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { Context } from '@deepseek-ai/cordis'
import { IdentityService, type CallerIdentity } from '@deepseek-ai/dsh-identity'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { userId as toUserId, scopeId as toScopeId } from '@deepseek-ai/dsh-credentials'
import { defineDomain, domainTable, type Domain } from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'

// ── Domain spec ─────────────────────────────────────────────────────────────

const UserSchema = z.object({
  passwordHash: z.string(),
  role: z.string(),
  tenantId: z.string(),
  displayName: z.string().optional(),
  createdAt: z.string(),
})
type UserRecord = z.infer<typeof UserSchema>

const SessionSchema = z.object({
  userId: z.string(),
  tenantId: z.string(),
  scopeId: z.string().optional(),
  role: z.string(),
  createdAt: z.string(),
})
type SessionRecord = z.infer<typeof SessionSchema>

const AccessLinkSchema = z.object({
  scopeId: z.string(),
  tenantId: z.string(),
  createdAt: z.string(),
})
type AccessLinkRecord = z.infer<typeof AccessLinkSchema>

export const AdminDomain = defineDomain({
  name: 'admin',
  version: 1,
  tables: {
    users: domainTable<string, UserRecord>(UserSchema),
    sessions: domainTable<string, SessionRecord>(SessionSchema),
    access_links: domainTable<string, AccessLinkRecord>(AccessLinkSchema),
  },
})

type AdminDomainHandle = Domain<typeof AdminDomain>

// ── Bcrypt-lite (node:crypto scrypt, constant-time compare) ─────────────────

const SCRYPT_KEYLEN = 64
const SCRYPT_SALT_LEN = 16

async function hashPassword(password: string): Promise<string> {
  const { scrypt } = await import('node:crypto')
  const salt = randomBytes(SCRYPT_SALT_LEN).toString('hex')
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEYLEN, (err, key) => {
      if (err) { reject(err); return }
      resolve(`${salt}:${key.toString('hex')}`)
    })
  })
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const { scrypt } = await import('node:crypto')
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEYLEN, (err, key) => {
      if (err) { reject(err); return }
      const expected = Buffer.from(hash, 'hex')
      resolve(timingSafeEqual(key, expected))
    })
  })
}

function generateSessionToken(): string {
  return randomBytes(32).toString('hex')
}

// ── HTTP helpers ────────────────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    const MAX = 64 * 1024
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX) { req.destroy(); reject(new Error('body too large')) }
      chunks.push(chunk)
    })
    req.on('end', () => { resolve(Buffer.concat(chunks).toString('utf-8')) })
    req.on('error', reject)
  })
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) })
  res.end(payload)
}

function extractBearerToken(req: IncomingMessage): string | undefined {
  const auth = req.headers.authorization
  if (auth?.startsWith('Bearer ')) return auth.slice(7)
  return undefined
}

// ── Plugin ──────────────────────────────────────────────────────────────────

export const name = 'admin'
export const inject = ['storageDomain', 'credentials', 'webServer']

export interface Config {
  /** Default admin user id seeded on first boot (no users table → create). */
  readonly seedAdminId?: string
  /** Default admin password (only used on first-boot seed). */
  readonly seedAdminPassword?: string
  /** Default tenant id for the seeded admin. */
  readonly seedTenantId?: string
}

export function apply(ctx: Context, config: Config = {}): void {
  let domain: AdminDomainHandle | undefined
  let identityService: AdminIdentityService | undefined

  ctx.effect(async () => {
    domain = await ctx.storageDomain.open(AdminDomain)

    // Seed admin user on first boot (empty users table).
    if (domain.table('users').size === 0 && config.seedAdminId && config.seedAdminPassword) {
      const hash = await hashPassword(config.seedAdminPassword)
      await domain.table('users').put(config.seedAdminId, {
        passwordHash: hash,
        role: 'admin',
        tenantId: config.seedTenantId ?? 'default',
        createdAt: new Date().toISOString(),
      })
    }

    // Mount real identity service (overrides the G3b stub).
    identityService = new AdminIdentityService(ctx, domain)

    // Register admin routes.
    const disposeRoutes = registerRoutes(ctx, domain, identityService)

    return () => {
      disposeRoutes()
      void domain?.close()
      domain = undefined
    }
  }, 'admin: domain + identity + routes')
}

// ── Real IdentityService ────────────────────────────────────────────────────

class AdminIdentityService extends IdentityService {
  private readonly als = new AsyncLocalStorage<SessionRecord>()

  constructor(ctx: Context, private readonly domain: AdminDomainHandle) {
    super(ctx)
  }

  override current(): CallerIdentity | undefined {
    const session = this.als.getStore()
    if (!session) return undefined
    return {
      userId: toUserId(session.userId),
      tenantId: session.tenantId,
      role: session.role,
      ...(session.scopeId !== undefined ? { scopeId: toScopeId(session.scopeId) } : {}),
    }
  }

  /** Run `fn` with `session` as the active caller identity (request-scoped). */
  run<T>(session: SessionRecord, fn: () => Promise<T>): Promise<T> {
    return this.als.run(session, fn)
  }

  /** Resolve a session token to its record (for request-scoped identity). */
  resolveSession(token: string): SessionRecord | undefined {
    return this.domain.table('sessions').get(token)
  }
}

// ── Route registration ──────────────────────────────────────────────────────

function registerRoutes(
  ctx: Context,
  domain: AdminDomainHandle,
  identity: AdminIdentityService,
): () => void {
  const dispose = ctx.webServer.register({
    kind: 'prefix',
    path: '/admin/api',
    handler: async (req, res) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
      const pathname = url.pathname

      // ── Public routes (no auth required) ──
      if (pathname === '/admin/api/login' && req.method === 'POST') {
        return handleLogin(domain, req, res)
      }
      if (pathname === '/admin/api/resolve-scope' && req.method === 'POST') {
        return handleResolveScope(domain, req, res)
      }

      // ── Authenticated routes (session required) ──
      const token = extractBearerToken(req)
      if (!token) { json(res, 401, { error: 'authentication required' }); return }

      const session = identity.resolveSession(token)
      if (!session) { json(res, 401, { error: 'invalid or expired session' }); return }

      // Run the authenticated dispatch under a request-scoped identity
      // (AsyncLocalStorage) so concurrent requests don't clobber each other.
      return identity.run(session, async () => {
        // ── /admin/api/me/pat — PAT self-service ──
        if (pathname === '/admin/api/me/pat' && req.method === 'POST') {
          return handlePatSet(ctx, session, req, res)
        }
        if (pathname === '/admin/api/me/pat' && req.method === 'GET') {
          return handlePatDescribe(ctx, session, res)
        }

        // ── /admin/api/me — current user info ──
        if (pathname === '/admin/api/me' && req.method === 'GET') {
          json(res, 200, {
            userId: session.userId,
            tenantId: session.tenantId,
            role: session.role,
            scopeId: session.scopeId ?? null,
          })
          return
        }

        // ── /admin/api/logout ──
        if (pathname === '/admin/api/logout' && req.method === 'POST') {
          return handleLogout(domain, token, res)
        }

        // ── Admin-only routes (fail-closed gate: role=admin required) ──
        if (session.role !== 'admin') {
          json(res, 403, { error: 'admin role required' })
          return
        }

        // ── /admin/api/users — user management ──
        if (pathname === '/admin/api/users' && req.method === 'GET') {
          handleListUsers(domain, res)
          return
        }
        if (pathname === '/admin/api/users' && req.method === 'POST') {
          return handleCreateUser(domain, req, res)
        }

        // ── /admin/api/access-links — access link management ──
        if (pathname === '/admin/api/access-links' && req.method === 'POST') {
          return handleCreateAccessLink(domain, req, res)
        }

        json(res, 404, { error: 'not found' })
      })
    },
  })

  return dispose
}

// ── Route handlers ──────────────────────────────────────────────────────────

async function handleLogin(
  domain: AdminDomainHandle,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let body: { userId?: string; password?: string; linkToken?: string }
  try {
    body = JSON.parse(await readBody(req)) as typeof body
  } catch {
    json(res, 400, { error: 'invalid JSON body' })
    return
  }

  if (!body.userId || !body.password) {
    json(res, 400, { error: 'userId and password are required' })
    return
  }

  const user = domain.table('users').get(body.userId)
  if (!user) { json(res, 401, { error: 'invalid credentials' }); return }

  const valid = await verifyPassword(body.password, user.passwordHash)
  if (!valid) { json(res, 401, { error: 'invalid credentials' }); return }

  // Resolve scope from access link if provided.
  let scopeId: string | undefined
  if (body.linkToken) {
    const link = domain.table('access_links').get(body.linkToken)
    if (link) scopeId = link.scopeId
  }

  const token = generateSessionToken()
  const session: SessionRecord = {
    userId: body.userId,
    tenantId: user.tenantId,
    role: user.role,
    scopeId,
    createdAt: new Date().toISOString(),
  }
  await domain.table('sessions').put(token, session)

  json(res, 200, { token, userId: body.userId, role: user.role, tenantId: user.tenantId, scopeId: scopeId ?? null })
}

async function handleResolveScope(
  domain: AdminDomainHandle,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let body: { linkToken?: string }
  try {
    body = JSON.parse(await readBody(req)) as typeof body
  } catch {
    json(res, 400, { error: 'invalid JSON body' })
    return
  }

  if (!body.linkToken) {
    json(res, 400, { error: 'linkToken is required' })
    return
  }

  const link = domain.table('access_links').get(body.linkToken)
  if (!link) { json(res, 404, { error: 'access link not found' }); return }

  json(res, 200, { scopeId: link.scopeId, tenantId: link.tenantId })
}

async function handlePatSet(
  ctx: Context,
  session: SessionRecord,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let body: { ref?: string; value?: string }
  try {
    body = JSON.parse(await readBody(req)) as typeof body
  } catch {
    json(res, 400, { error: 'invalid JSON body' })
    return
  }

  if (!body.ref || !body.value) {
    json(res, 400, { error: 'ref and value are required' })
    return
  }

  try {
    await ctx.credentials.set(
      body.ref as CredentialRef,
      body.value,
      { userId: toUserId(session.userId) },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'credential set failed'
    json(res, 500, { error: message })
    return
  }

  json(res, 200, { ok: true, ref: body.ref, userId: session.userId })
}

async function handlePatDescribe(
  ctx: Context,
  session: SessionRecord,
  res: ServerResponse,
): Promise<void> {
  const ref = 'DEEPSEEK_API_KEY' as CredentialRef
  const info = await ctx.credentials.describe(ref, { userId: toUserId(session.userId) })
  json(res, 200, {
    ref,
    configured: info.configured,
    source: info.source ?? null,
    userId: session.userId,
    setUrl: '/admin/api/me/pat',
  })
}

async function handleLogout(
  domain: AdminDomainHandle,
  token: string,
  res: ServerResponse,
): Promise<void> {
  await domain.table('sessions').delete(token)
  json(res, 200, { ok: true })
}

function handleListUsers(domain: AdminDomainHandle, res: ServerResponse): void {
  const users: Array<{ userId: string; role: string; tenantId: string; displayName?: string }> = []
  for (const [id, record] of domain.table('users').entries()) {
    users.push({
      userId: id,
      role: record.role,
      tenantId: record.tenantId,
      ...(record.displayName ? { displayName: record.displayName } : {}),
    })
  }
  json(res, 200, { users })
}

async function handleCreateUser(
  domain: AdminDomainHandle,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let body: { userId?: string; password?: string; role?: string; tenantId?: string; displayName?: string }
  try {
    body = JSON.parse(await readBody(req)) as typeof body
  } catch {
    json(res, 400, { error: 'invalid JSON body' })
    return
  }

  if (!body.userId || !body.password) {
    json(res, 400, { error: 'userId and password are required' })
    return
  }

  if (domain.table('users').get(body.userId)) {
    json(res, 409, { error: 'user already exists' })
    return
  }

  const hash = await hashPassword(body.password)
  await domain.table('users').put(body.userId, {
    passwordHash: hash,
    role: body.role ?? 'user',
    tenantId: body.tenantId ?? 'default',
    displayName: body.displayName,
    createdAt: new Date().toISOString(),
  })

  json(res, 201, { userId: body.userId, role: body.role ?? 'user' })
}

async function handleCreateAccessLink(
  domain: AdminDomainHandle,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let body: { scopeId?: string; tenantId?: string }
  try {
    body = JSON.parse(await readBody(req)) as typeof body
  } catch {
    json(res, 400, { error: 'invalid JSON body' })
    return
  }

  if (!body.scopeId) {
    json(res, 400, { error: 'scopeId is required' })
    return
  }

  const linkToken = randomBytes(24).toString('hex')
  await domain.table('access_links').put(linkToken, {
    scopeId: body.scopeId,
    tenantId: body.tenantId ?? 'default',
    createdAt: new Date().toISOString(),
  })

  json(res, 201, { linkToken, scopeId: body.scopeId })
}

// ── PAT-miss UX (decision 5): per-user PAT not configured → guidance ────────

declare module '@deepseek-ai/cordis' {
  interface Events {
    'admin/pat-miss'(userId: string, ref: string): void
  }
}

/**
 * Exported for P3/subagent-qoder to call when a per-user credential resolve
 * returns `undefined`. The emitted event carries a user-facing message that
 * the client UI can surface as a notification/toast.
 */
export function notifyPatMiss(ctx: Context, userId: string, ref: string): string {
  ctx.emit('admin/pat-miss', userId, ref)
  return `Credential "${ref}" is not configured for your account. Set it at: POST /admin/api/me/pat { "ref": "${ref}", "value": "<your-key>" }`
}
