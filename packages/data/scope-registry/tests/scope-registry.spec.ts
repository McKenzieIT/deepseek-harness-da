import { describe, test, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
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
    expect(env.svc.active()).toBeUndefined()
    expect(env.svc.activeId()).toBeUndefined()
  })

  test('register a scope makes it active (first-scope auto-activation)', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a' })
    expect(env.svc.activeId()).toBe('game-a')
    expect(env.svc.active()).toEqual({ id: 'game-a', semanticRoot: '/data/game-a' })
    expect(env.svc.list()).toHaveLength(1)
  })

  test('register second scope does not change active', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a' })
    await env.svc.register({ id: 'game-b', semanticRoot: '/data/game-b' })
    expect(env.svc.activeId()).toBe('game-a')
    expect(env.svc.list()).toHaveLength(2)
  })

  test('setActive switches the active scope', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a' })
    await env.svc.register({ id: 'game-b', semanticRoot: '/data/game-b' })
    await env.svc.setActive('game-b')
    expect(env.svc.activeId()).toBe('game-b')
    expect(env.svc.active()!.semanticRoot).toBe('/data/game-b')
  })

  test('setActive throws on unknown scope', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a' })
    await expect(env.svc.setActive('nonexistent')).rejects.toThrow('not found')
  })

  test('remove active scope clears activeId', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a' })
    await env.svc.remove('game-a')
    expect(env.svc.activeId()).toBeUndefined()
    expect(env.svc.list()).toHaveLength(0)
  })

  test('clearActive unsets the active scope', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a' })
    await env.svc.clearActive()
    expect(env.svc.activeId()).toBeUndefined()
    expect(env.svc.list()).toHaveLength(1)
  })

  test('get retrieves scope by id', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a', metadata: { engine: 'maxcompute' } })
    const scope = env.svc.get('game-a')
    expect(scope).toEqual({ id: 'game-a', semanticRoot: '/data/game-a', metadata: { engine: 'maxcompute' } })
    expect(env.svc.get('nonexistent')).toBeUndefined()
  })

  test('persistence: fresh instance reads state from disk', async () => {
    const env = setup()
    tmp = env.tmp
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a' })
    await env.svc.register({ id: 'game-b', semanticRoot: '/data/game-b' })
    await env.svc.setActive('game-b')

    const ctx2 = new Context()
    const svc2 = new ScopeRegistryService(ctx2, { registryPath: env.path })
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
    expect(svc.active()).toBeUndefined()
  })

  test('inert mode: setActive throws when registryPath is empty', async () => {
    const ctx = new Context()
    const svc = new ScopeRegistryService(ctx, { registryPath: '' })
    await expect(svc.setActive('x')).rejects.toThrow('registryPath not configured')
  })

  test('events: scopes/active-changed fires on setActive', async () => {
    const env = setup()
    tmp = env.tmp
    const events: (string | undefined)[] = []
    env.ctx.on('scopes/active-changed', (id) => { events.push(id) })
    await env.svc.register({ id: 'game-a', semanticRoot: '/data/game-a' })
    await env.svc.register({ id: 'game-b', semanticRoot: '/data/game-b' })
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
})
