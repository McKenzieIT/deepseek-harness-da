import { describe, test, expect, afterEach } from 'vitest'
import { existsSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import ScopeRegistryService from '../src/index.ts'

function setup(registryPath?: string) {
  const tmp = mkdtempSync(join(tmpdir(), 'scope-reg-'))
  const path = registryPath ?? join(tmp, 'scopes.yaml')
  const ctx = new Context()
  const svc = new ScopeRegistryService(ctx, { registryPath: path })
  return { ctx, svc, tmp, path }
}

describe('ScopeRegistryService', () => {
  let tmp: string

  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  })

  test('empty registry when file does not exist', () => {
    const env = setup()
    tmp = env.tmp
    expect(env.svc.list()).toEqual([])
    // oxlint-disable-next-line typescript/no-deprecated -- tests verify deprecated compat API
    expect(env.svc.active()).toBeUndefined()
    // oxlint-disable-next-line typescript/no-deprecated -- tests verify deprecated compat API
    expect(env.svc.activeId()).toBeUndefined()
  })

  test('register a scope makes it active (first-scope auto-activation)', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a' })
    // oxlint-disable-next-line typescript/no-deprecated -- tests verify deprecated compat API
    expect(env.svc.activeId()).toBe('game-a')
    // oxlint-disable-next-line typescript/no-deprecated -- tests verify deprecated compat API
    expect(env.svc.active()).toEqual({ id: 'game-a', semanticRoot: '/data/game-a', tenant: 'default' })
    expect(env.svc.list()).toHaveLength(1)
  })

  test('register second scope does not change active', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a' })
    await env.svc.register({ id: 'game-b', semanticRoot: '/data/game-b' })
    // oxlint-disable-next-line typescript/no-deprecated -- tests verify deprecated compat API
    expect(env.svc.activeId()).toBe('game-a')
    expect(env.svc.list()).toHaveLength(2)
  })

  test('setActive switches the active scope', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a' })
    await env.svc.register({ id: 'game-b', semanticRoot: '/data/game-b' })
    // oxlint-disable-next-line typescript/no-deprecated -- tests verify deprecated compat API
    await env.svc.setActive('game-b')
    // oxlint-disable-next-line typescript/no-deprecated -- tests verify deprecated compat API
    expect(env.svc.activeId()).toBe('game-b')
    // oxlint-disable-next-line typescript/no-deprecated -- tests verify deprecated compat API
    expect(env.svc.active()!.semanticRoot).toBe('/data/game-b')
  })

  test('setActive throws on unknown scope', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a' })
    // oxlint-disable-next-line typescript/no-deprecated -- tests verify deprecated compat API
    await expect(env.svc.setActive('nonexistent')).rejects.toThrow('not found')
  })

  test('remove active scope clears activeId', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a' })
    await env.svc.remove('game-a')
    // oxlint-disable-next-line typescript/no-deprecated -- tests verify deprecated compat API
    expect(env.svc.activeId()).toBeUndefined()
    expect(env.svc.list()).toHaveLength(0)
  })

  test('clearActive unsets the active scope', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a' })
    // oxlint-disable-next-line typescript/no-deprecated -- tests verify deprecated compat API
    await env.svc.clearActive()
    // oxlint-disable-next-line typescript/no-deprecated -- tests verify deprecated compat API
    expect(env.svc.activeId()).toBeUndefined()
    expect(env.svc.list()).toHaveLength(1)
  })

  test('get retrieves scope by id', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a', metadata: { engine: 'maxcompute' } })
    const scope = env.svc.get('game-a')
    expect(scope).toEqual({ id: 'game-a', semanticRoot: '/data/game-a', tenant: 'default', metadata: { engine: 'maxcompute' } })
    expect(env.svc.get('nonexistent')).toBeUndefined()
  })

  test('persistence: fresh instance reads state from disk', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a' })
    await env.svc.register({ id: 'game-b', semanticRoot: '/data/game-b' })
    // oxlint-disable-next-line typescript/no-deprecated -- tests verify deprecated compat API
    await env.svc.setActive('game-b')

    const ctx2 = new Context()
    const svc2 = new ScopeRegistryService(ctx2, { registryPath: env.path })
    // oxlint-disable-next-line typescript/no-deprecated -- tests verify deprecated compat API
    expect(svc2.activeId()).toBe('game-b')
    expect(svc2.list()).toHaveLength(2)
    expect(svc2.get('game-a')!.semanticRoot).toBe('/data/game-a')
  })

  test('YAML file is valid after mutations', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a', metadata: { project: 'proj_a' } })
    const content = readFileSync(env.path, 'utf-8')
    expect(content).toContain('active: game-a')
    expect(content).toContain('semanticRoot: /data/game-a')
    expect(content).toContain('project: proj_a')
  })

  test('register updates existing scope definition', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a' })
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a-v2', metadata: { version: 2 } })
    expect(env.svc.list()).toHaveLength(1)
    expect(env.svc.get('game-a')!.semanticRoot).toBe('/data/game-a-v2')
  })

  test('inert mode: empty registryPath disables all writes', () => {
    const ctx = new Context()
    const svc = new ScopeRegistryService(ctx, { registryPath: '' })
    expect(svc.list()).toEqual([])
    // oxlint-disable-next-line typescript/no-deprecated -- tests verify deprecated compat API
    expect(svc.active()).toBeUndefined()
  })

  test('inert mode: setActive throws when registryPath is empty', async () => {
    const ctx = new Context()
    const svc = new ScopeRegistryService(ctx, { registryPath: '' })
    // oxlint-disable-next-line typescript/no-deprecated -- tests verify deprecated compat API
    await expect(svc.setActive('x')).rejects.toThrow('registryPath not configured')
  })

  test('events: scopes/active-changed fires on setActive', async () => {
    const env = setup()
    tmp = env.tmp
    const events: (string | undefined)[] = []
    env.ctx.on('scopes/active-changed', (id) => { events.push(id) })
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a' })
    await env.svc.register({ id: 'game-b', semanticRoot: '/data/game-b' })
    // oxlint-disable-next-line typescript/no-deprecated -- tests verify deprecated compat API
    await env.svc.setActive('game-b')
    expect(events).toContain('game-b')
  })

  test('events: scopes/changed fires on register and remove', async () => {
    const env = setup()
    tmp = env.tmp
    let changeCount = 0
    env.ctx.on('scopes/changed', () => { changeCount++ })
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a' })
    await env.svc.remove('game-a')
    expect(changeCount).toBe(2)
  })

  // ── Phase 1: per-request tenant capacity (GA-GT1) ──────────────────────

  test('forTenant: scopeId provided returns the scope when tenant matches', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a', tenant: 'acme' })
    expect(env.svc.forTenant('acme', 'game-a')).toEqual({ id: 'game-a', semanticRoot: '/data/game-a', tenant: 'acme' })
  })

  test('forTenant: scopeId provided returns undefined on tenant mismatch', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a', tenant: 'acme' })
    expect(env.svc.forTenant('other', 'game-a')).toBeUndefined()
  })

  test('forTenant: scopeId provided returns undefined when scope does not exist', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a', tenant: 'acme' })
    expect(env.svc.forTenant('acme', 'nonexistent')).toBeUndefined()
  })

  test('forTenant: omitted scopeId returns the single scope for the tenant (1:1)', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a', tenant: 'acme' })
    expect(env.svc.forTenant('acme')).toEqual({ id: 'game-a', semanticRoot: '/data/game-a', tenant: 'acme' })
  })

  test('forTenant: omitted scopeId returns undefined when tenant owns 0 scopes', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a', tenant: 'acme' })
    expect(env.svc.forTenant('other')).toBeUndefined()
  })

  test('forTenant: omitted scopeId throws when tenant owns >1 scopes (1:N ambiguous)', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a', tenant: 'acme' })
    await env.svc.register({ id: 'game-b', semanticRoot: '/data/game-b', tenant: 'acme' })
    expect(() => env.svc.forTenant('acme')).toThrow('ambiguous')
  })

  test('forTenant: 1:N tenant disambiguates by passing scopeId', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a', tenant: 'acme' })
    await env.svc.register({ id: 'game-b', semanticRoot: '/data/game-b', tenant: 'acme' })
    expect(env.svc.forTenant('acme', 'game-b')).toEqual({ id: 'game-b', semanticRoot: '/data/game-b', tenant: 'acme' })
  })

  test('forTenant: a scope with no tenant belongs to the "default" tenant', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a' })
    expect(env.svc.forTenant('default')).toEqual({ id: 'game-a', semanticRoot: '/data/game-a', tenant: 'default' })
    expect(env.svc.forTenant('default', 'game-a')).toEqual({ id: 'game-a', semanticRoot: '/data/game-a', tenant: 'default' })
  })

  test('forTenant: "default" tenant mismatches an explicitly-set other tenant', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a', tenant: 'acme' })
    expect(env.svc.forTenant('default', 'game-a')).toBeUndefined()
    expect(env.svc.forTenant('default')).toBeUndefined()
  })

  test('list(tenant): filters scopes by tenant', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a', tenant: 'acme' })
    await env.svc.register({ id: 'game-b', semanticRoot: '/data/game-b', tenant: 'acme' })
    await env.svc.register({ id: 'game-c', semanticRoot: '/data/game-c', tenant: 'other' })
    await env.svc.register({ id: 'game-d', semanticRoot: '/data/game-d' })
    expect(env.svc.list('acme')).toHaveLength(2)
    expect(env.svc.list('other')).toHaveLength(1)
    expect(env.svc.list('default')).toHaveLength(1)
    expect(env.svc.list('nonexistent')).toHaveLength(0)
  })

  test('list(): no-arg returns all scopes (backward-compatible)', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a', tenant: 'acme' })
    await env.svc.register({ id: 'game-b', semanticRoot: '/data/game-b' })
    expect(env.svc.list()).toHaveLength(2)
  })

  test('list(): each scope resolves absent tenant to "default"', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a' })
    const all = env.svc.list()
    expect(all[0]!.tenant).toBe('default')
  })

  test('round-trip: register with tenant persists and reads back', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a', tenant: 'acme' })
    const ctx2 = new Context()
    const svc2 = new ScopeRegistryService(ctx2, { registryPath: env.path })
    expect(svc2.get('game-a')).toEqual({ id: 'game-a', semanticRoot: '/data/game-a', tenant: 'acme' })
    expect(svc2.forTenant('acme', 'game-a')!.tenant).toBe('acme')
    const content = readFileSync(env.path, 'utf-8')
    expect(content).toContain('tenant: acme')
  })

  test('round-trip: register without tenant reads back as "default"', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a' })
    const ctx2 = new Context()
    const svc2 = new ScopeRegistryService(ctx2, { registryPath: env.path })
    expect(svc2.get('game-a')).toEqual({ id: 'game-a', semanticRoot: '/data/game-a', tenant: 'default' })
    // the YAML keeps the old (tenantless) shape — no tenant field written
    const content = readFileSync(env.path, 'utf-8')
    expect(content).not.toContain('tenant')
  })

  test('round-trip: re-writing an old tenantless file keeps the old shape', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a' })
    expect(readFileSync(env.path, 'utf-8')).not.toContain('tenant')
    // a mutate() that re-writes the file (register a second scope) must not
    // upgrade the existing tenantless entry to `tenant: default`
    await env.svc.register({ id: 'game-b', semanticRoot: '/data/game-b' })
    const content = readFileSync(env.path, 'utf-8')
    expect(content).not.toContain('tenant')
  })

  test('active() returns the scope with an explicit tenant after setActive', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a', tenant: 'acme' })
    // oxlint-disable-next-line typescript/no-deprecated -- tests verify deprecated compat API
    await env.svc.setActive('game-a')
    // oxlint-disable-next-line typescript/no-deprecated -- tests verify deprecated compat API
    expect(env.svc.active()?.tenant).toBe('acme')
    // oxlint-disable-next-line typescript/no-deprecated -- tests verify deprecated compat API
    expect(env.svc.active()?.id).toBe('game-a')
  })

  // ── registryPath resolution ────────────────────────────────────────────

  test('registryPath beginning with "~/" resolves against the home directory', async () => {
    const env = setup()
    tmp = env.tmp
    const previousHome = process.env.HOME
    const previousUserProfile = process.env.USERPROFILE
    // os.homedir() reads $HOME on POSIX and %USERPROFILE% on Windows, so
    // pointing both at the temp dir keeps the expansion off the real home.
    process.env.HOME = env.tmp
    process.env.USERPROFILE = env.tmp
    try {
      const svc = new ScopeRegistryService(new Context(), { registryPath: '~/home-scopes.yaml' })
      await svc.register({ id: 'game-a', semanticRoot: '/data/game-a' })
      expect(existsSync(join(env.tmp, 'home-scopes.yaml'))).toBe(true)
      expect(svc.list()).toHaveLength(1)
      expect(svc.get('game-a')?.semanticRoot).toBe('/data/game-a')
    } finally {
      if (previousHome === undefined) delete process.env.HOME
      else process.env.HOME = previousHome
      if (previousUserProfile === undefined) delete process.env.USERPROFILE
      else process.env.USERPROFILE = previousUserProfile
    }
  })

  // ── remove() on a scope that is not the active one ──────────────────────

  test('remove: dropping a non-active scope keeps the active selection', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a' })
    await env.svc.register({ id: 'game-b', semanticRoot: '/data/game-b' })
    const activeEvents: (string | undefined)[] = []
    let changed = 0
    env.ctx.on('scopes/active-changed', (id) => { activeEvents.push(id) })
    env.ctx.on('scopes/changed', () => { changed++ })

    await env.svc.remove('game-b')

    expect(env.svc.list().map(s => s.id)).toEqual(['game-a'])
    // oxlint-disable-next-line typescript/no-deprecated -- tests verify deprecated compat API
    expect(env.svc.activeId()).toBe('game-a')
    expect(changed).toBe(1)
    // removing a scope that was not active announces no active-scope change
    expect(activeEvents).toEqual([])
  })

  // ── malformed registry files (read guards) ──────────────────────────────

  test('load: a registry file that is not a YAML mapping reads as an empty registry', () => {
    const env = setup()
    tmp = env.tmp
    // An empty document parses to undefined; neither shape may throw.
    writeFileSync(env.path, '')
    expect(env.svc.list()).toEqual([])
    // oxlint-disable-next-line typescript/no-deprecated -- tests verify deprecated compat API
    expect(env.svc.activeId()).toBeUndefined()

    writeFileSync(env.path, 'not-a-mapping\n')
    expect(env.svc.list()).toEqual([])
    expect(env.svc.get('not-a-mapping')).toBeUndefined()
    // oxlint-disable-next-line typescript/no-deprecated -- tests verify deprecated compat API
    expect(env.svc.active()).toBeUndefined()
  })

  test('load: a registry file with no scopes map reads as empty with nothing active', () => {
    const env = setup()
    tmp = env.tmp
    writeFileSync(env.path, 'active: game-a\n')
    expect(env.svc.list()).toEqual([])
    // an active id naming a scope the file never defines activates nothing
    // oxlint-disable-next-line typescript/no-deprecated -- tests verify deprecated compat API
    expect(env.svc.activeId()).toBeUndefined()
    // oxlint-disable-next-line typescript/no-deprecated -- tests verify deprecated compat API
    expect(env.svc.active()).toBeUndefined()
    expect(env.svc.forTenant('default')).toBeUndefined()
  })

  test('load: scope entries without a string semanticRoot are skipped', () => {
    const env = setup()
    tmp = env.tmp
    writeFileSync(env.path, [
      'active: no-root',
      'scopes:',
      '  null-entry:',
      '  no-root:',
      '    tenant: acme',
      '  wrong-type:',
      '    semanticRoot: 42',
      '  good:',
      '    semanticRoot: /data/good',
      '    tenant: acme',
      '',
    ].join('\n'))

    expect(env.svc.list().map(s => s.id)).toEqual(['good'])
    expect(env.svc.get('null-entry')).toBeUndefined()
    expect(env.svc.get('no-root')).toBeUndefined()
    expect(env.svc.get('wrong-type')).toBeUndefined()
    // a skipped entry does not count toward its tenant's ownership: "acme"
    // owns exactly one loadable scope, so the 1:1 lookup stays unambiguous
    expect(env.svc.forTenant('acme')).toEqual({ id: 'good', semanticRoot: '/data/good', tenant: 'acme' })
    // the file's active id names a skipped entry, so no scope is active
    // oxlint-disable-next-line typescript/no-deprecated -- tests verify deprecated compat API
    expect(env.svc.activeId()).toBeUndefined()
  })
})
