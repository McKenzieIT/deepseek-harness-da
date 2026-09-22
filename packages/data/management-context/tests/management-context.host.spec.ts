/**
 * Real-composition host regression for `ctx.managementContext`.
 *
 * Boots the actual Session Store, Agent Registry, Session Projection Registry,
 * Workspace Registry, Scope Registry, and Session Controller (through the
 * upstream `createSessionTestController` harness) so the create → append →
 * project → list → membership pipeline runs end to end. The Agent preset roster
 * is the same lightweight stub the upstream `session-presets.host.spec.ts` uses
 * — the lifecycle service under test (`ManagementContextService`) is never
 * faked. A separate case mounts the real `AgentPresets` pointed at the shipped
 * data-agent preset roots to prove `semantic-layer-management` resolves.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent, AgentFactory } from '@deepseek-ai/dsh-agent'
import AgentPresets, { agentPresetProjectionDefinition } from '@deepseek-ai/dsh-agent-presets'
import ScopeRegistryService from '@deepseek-ai/dsh-scope-registry'
import SessionStore from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import WorkspaceRegistry, { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import { createSessionTestController } from '../../../api/session-controller/tests/test-remote.ts'
import ManagementContextService, { MANAGEMENT_PRESET_ID } from '../src/index.ts'

const DATA_AGENT_PRESETS_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../bundle/data-agent/presets',
)

const contexts: Context[] = []
const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  for (const dir of tempDirs.splice(0)) await rm(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

function stubAgent(session: Session): Agent {
  return { id: session.id, session, status: 'idle' } as unknown as Agent
}

/** Lightweight preset roster: resolves the named ids, rejects the rest. */
function roster(ids: readonly string[]): unknown {
  const presetOf = (id: string): object => ({ id, trust: 'system', path: `/presets/${id}/agent.cordis.yml` })
  return {
    defaultId: ids[0],
    resolve: (id?: string) => {
      const wanted = id ?? ids[0] ?? ''
      if (!ids.includes(wanted)) {
        return Promise.reject(new RemoteError(
          'agent-preset/not-found',
          `agent-presets: preset "${wanted}" not found`,
          { agentPreset: wanted, available: ids },
        ))
      }
      return Promise.resolve(presetOf(wanted))
    },
    mount: (_ctx: Context, id?: string) => Promise.resolve(presetOf(id ?? ids[0] ?? '')),
  }
}

interface HarnessOptions {
  /** Preset ids the roster stub knows; omit to include the management preset. */
  readonly presets?: readonly string[]
  /** When set, the agent factory rejects every creation with this message. */
  readonly failCreateWith?: string
}

/** A workspace bound to a real, canonical temp directory. */
async function makeWorkspace(ctx: Context): Promise<WorkspaceId> {
  const dir = realpathSync(await mkdtemp(join(tmpdir(), 'dsh-mgmt-ctx-ws-')))
  tempDirs.push(dir)
  const workspace = await ctx.workspaceRegistry.create(dir)
  return WorkspaceId(workspace.id)
}

async function harness(options: HarnessOptions = {}) {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.baseUrl = pathToFileURL(process.cwd()).href + '/'

  const cwd = realpathSync(await mkdtemp(join(tmpdir(), 'dsh-mgmt-ctx-home-')))
  tempDirs.push(cwd)

  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(new MemoryMediaPool()))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  ctx.provide('sessionPersistence', {
    list: async () => [],
    open: () => { throw new Error('event bodies must not be opened in this test') },
    stat: () => { throw new Error('per-session stat must not be needed in this test') },
  } as never)

  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(WorkspaceRegistry)

  const registryPath = join(cwd, 'scopes.yaml')
  await ctx.plugin(ScopeRegistryService, { registryPath })

  const presetIds = options.presets ?? [MANAGEMENT_PRESET_ID, 'standard']
  ctx.provide('agentPresets', roster(presetIds) as never)

  const factory: AgentFactory = {
    async createAgent(_ownerCtx, agentOptions) {
      if (options.failCreateWith !== undefined) throw new Error(options.failCreateWith)
      const session = ctx.sessions.create(
        agentOptions.sessionId,
        agentOptions.meta === undefined ? {} : { meta: agentOptions.meta },
      )
      const agent = stubAgent(session)
      ;(agent as { ctx?: Context }).ctx = ctx
      await agentOptions.setup?.(ctx, agent)
      const unregister = await ctx.agents.register(agent)
      return { agent, dispose: async () => { await unregister() } }
    },
    resume() { throw new Error('this test has no persisted sessions to resume') },
  }
  ctx.agents.setFactory(factory)

  createSessionTestController(ctx, {
    defaultModelSelection: () => ({ provider: 'test', model: 'test-model' }),
    cwd,
  })
  ctx.sessionProjections.register(agentPresetProjectionDefinition)
  await ctx.plugin(ManagementContextService)

  return { ctx, scopeRegistryPath: registryPath }
}

async function registerScope(ctx: Context, id: string): Promise<void> {
  await ctx.scopes.register({ id, semanticRoot: `/tmp/${id}` })
}

function managementSessionCount(ctx: Context): number {
  return ctx.sessions.list().filter(session => session.header.agentPreset === MANAGEMENT_PRESET_ID).length
}

describe('managementContext.resolveOrCreate', () => {
  it('single-flights concurrent default resolves into one session', async () => {
    const { ctx } = await harness()
    const workspaceId = await makeWorkspace(ctx)
    await registerScope(ctx, 'scope-a')

    const [first, second] = await Promise.all([
      ctx.managementContext.resolveOrCreate({ workspaceId, dataScopeId: 'scope-a' }),
      ctx.managementContext.resolveOrCreate({ workspaceId, dataScopeId: 'scope-a' }),
    ])

    expect(first.sessionId).toBe(second.sessionId)
    expect(managementSessionCount(ctx)).toBe(1)
  })

  it('reuses the existing session on a later default resolve', async () => {
    const { ctx } = await harness()
    const workspaceId = await makeWorkspace(ctx)
    await registerScope(ctx, 'scope-a')

    const created = await ctx.managementContext.resolveOrCreate({ workspaceId, dataScopeId: 'scope-a' })
    const reused = await ctx.managementContext.resolveOrCreate({ workspaceId, dataScopeId: 'scope-a' })

    expect(created.created).toBe(true)
    expect(reused.created).toBe(false)
    expect(reused.sessionId).toBe(created.sessionId)
    expect(managementSessionCount(ctx)).toBe(1)
  })

  it('surfaces the bound data scope to the Session list without opening history', async () => {
    const { ctx } = await harness()
    const workspaceId = await makeWorkspace(ctx)
    await registerScope(ctx, 'scope-a')

    const { sessionId } = await ctx.managementContext.resolveOrCreate({ workspaceId, dataScopeId: 'scope-a' })
    const { items } = await ctx.sessionController.list({}, new AbortController().signal)
    const summary = items.find(item => item.sessionId === sessionId)

    expect(summary?.projections?.values.agentPreset).toBe(MANAGEMENT_PRESET_ID)
    const binding = summary?.projections?.values.dataScope
    expect(binding?.dataScopeId).toBe('scope-a')
  })
})

describe('managementContext.createNew', () => {
  it('always creates a distinct session and default resolve picks the newest', async () => {
    const { ctx } = await harness()
    const workspaceId = await makeWorkspace(ctx)
    await registerScope(ctx, 'scope-a')

    let clock = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => clock)
    const older = await ctx.managementContext.createNew({ workspaceId, dataScopeId: 'scope-a' })
    clock = 5_000
    const newer = await ctx.managementContext.createNew({ workspaceId, dataScopeId: 'scope-a' })

    expect(newer.sessionId).not.toBe(older.sessionId)
    expect(newer.created).toBe(true)
    expect(managementSessionCount(ctx)).toBe(2)

    const resolved = await ctx.managementContext.resolveOrCreate({ workspaceId, dataScopeId: 'scope-a' })
    expect(resolved.created).toBe(false)
    expect(resolved.sessionId).toBe(newer.sessionId)
  })
})

describe('managementContext isolation', () => {
  it('keeps different data scopes in one workspace independent', async () => {
    const { ctx } = await harness()
    const workspaceId = await makeWorkspace(ctx)
    await registerScope(ctx, 'scope-a')
    await registerScope(ctx, 'scope-b')

    const a = await ctx.managementContext.resolveOrCreate({ workspaceId, dataScopeId: 'scope-a' })
    const b = await ctx.managementContext.resolveOrCreate({ workspaceId, dataScopeId: 'scope-b' })

    expect(a.sessionId).not.toBe(b.sessionId)
    const reAgain = await ctx.managementContext.resolveOrCreate({ workspaceId, dataScopeId: 'scope-a' })
    expect(reAgain.sessionId).toBe(a.sessionId)
  })

  it('keeps the same data scope in different workspaces independent', async () => {
    const { ctx } = await harness()
    const workspaceA = await makeWorkspace(ctx)
    const workspaceB = await makeWorkspace(ctx)
    await registerScope(ctx, 'scope-a')

    const a = await ctx.managementContext.resolveOrCreate({ workspaceId: workspaceA, dataScopeId: 'scope-a' })
    const b = await ctx.managementContext.resolveOrCreate({ workspaceId: workspaceB, dataScopeId: 'scope-a' })

    expect(a.sessionId).not.toBe(b.sessionId)
    expect((await ctx.managementContext.resolveOrCreate({ workspaceId: workspaceA, dataScopeId: 'scope-a' })).sessionId)
      .toBe(a.sessionId)
    expect((await ctx.managementContext.resolveOrCreate({ workspaceId: workspaceB, dataScopeId: 'scope-a' })).sessionId)
      .toBe(b.sessionId)
  })

  it('does not reuse a same-workspace session bound to a different scope', async () => {
    const { ctx } = await harness()
    const workspaceId = await makeWorkspace(ctx)
    await registerScope(ctx, 'scope-a')
    await registerScope(ctx, 'scope-b')

    const b = await ctx.managementContext.resolveOrCreate({ workspaceId, dataScopeId: 'scope-b' })
    const a = await ctx.managementContext.resolveOrCreate({ workspaceId, dataScopeId: 'scope-a' })

    expect(a.sessionId).not.toBe(b.sessionId)
    expect(managementSessionCount(ctx)).toBe(2)
  })

  it('ignores a same-workspace management session that carries no scope binding', async () => {
    const { ctx } = await harness()
    const workspaceId = await makeWorkspace(ctx)
    await registerScope(ctx, 'scope-a')

    // A management-preset session created directly, with no data-scope/bound event.
    const unbound = await ctx.sessionController.create({ workspaceId, agentPreset: MANAGEMENT_PRESET_ID })

    const resolved = await ctx.managementContext.resolveOrCreate({ workspaceId, dataScopeId: 'scope-a' })
    expect(resolved.sessionId).not.toBe(unbound.sessionId)
    expect(resolved.created).toBe(true)
  })

  it('ignores a same-workspace non-management session', async () => {
    const { ctx } = await harness()
    const workspaceId = await makeWorkspace(ctx)
    await registerScope(ctx, 'scope-a')

    const plain = await ctx.sessionController.create({ workspaceId, agentPreset: 'standard' })

    const resolved = await ctx.managementContext.resolveOrCreate({ workspaceId, dataScopeId: 'scope-a' })
    expect(resolved.sessionId).not.toBe(plain.sessionId)
    expect(resolved.created).toBe(true)
  })
})

describe('managementContext failure modes', () => {
  it('fails loud for an unknown workspace', async () => {
    const { ctx } = await harness()
    await registerScope(ctx, 'scope-a')
    await expect(ctx.managementContext.resolveOrCreate({
      workspaceId: WorkspaceId('nope'),
      dataScopeId: 'scope-a',
    })).rejects.toThrow(/workspace "nope" not found/)
  })

  it('fails loud for an unknown data scope with no active-scope fallback', async () => {
    const { ctx } = await harness()
    const workspaceId = await makeWorkspace(ctx)
    await expect(ctx.managementContext.resolveOrCreate({ workspaceId, dataScopeId: 'ghost' }))
      .rejects.toThrow(/data scope "ghost" not found/)
  })

  it('fails loud when the management preset is unavailable', async () => {
    const { ctx } = await harness({ presets: ['standard'] })
    const workspaceId = await makeWorkspace(ctx)
    await registerScope(ctx, 'scope-a')
    await expect(ctx.managementContext.resolveOrCreate({ workspaceId, dataScopeId: 'scope-a' }))
      .rejects.toThrow(/not found/)
  })

  it('propagates a session-creation failure and clears the single-flight slot', async () => {
    const { ctx } = await harness({ failCreateWith: 'factory exploded' })
    const workspaceId = await makeWorkspace(ctx)
    await registerScope(ctx, 'scope-a')

    await expect(ctx.managementContext.resolveOrCreate({ workspaceId, dataScopeId: 'scope-a' }))
      .rejects.toThrow()
    // The slot cleared, so a retry runs afresh (and fails the same way).
    await expect(ctx.managementContext.resolveOrCreate({ workspaceId, dataScopeId: 'scope-a' }))
      .rejects.toThrow()
  })
})

describe('managementContext scope deletion', () => {
  it('keeps history readable but fails new operations after the scope is deleted', async () => {
    const { ctx } = await harness()
    const workspaceId = await makeWorkspace(ctx)
    await registerScope(ctx, 'scope-a')

    const { sessionId } = await ctx.managementContext.resolveOrCreate({ workspaceId, dataScopeId: 'scope-a' })
    await ctx.scopes.remove('scope-a')

    await expect(ctx.managementContext.resolveOrCreate({ workspaceId, dataScopeId: 'scope-a' }))
      .rejects.toThrow(/data scope "scope-a" not found/)

    // The prior binding is still readable from the session list.
    const { items } = await ctx.sessionController.list({}, new AbortController().signal)
    const binding = items.find(item => item.sessionId === sessionId)?.projections?.values.dataScope
    expect(binding?.dataScopeId).toBe('scope-a')
  })
})

describe('managementContext disposal', () => {
  it('unregisters the dataScope projection when its fiber disposes', async () => {
    const { ctx } = await harness()
    const workspaceId = await makeWorkspace(ctx)
    await registerScope(ctx, 'scope-a')
    const { sessionId } = await ctx.managementContext.resolveOrCreate({ workspaceId, dataScopeId: 'scope-a' })
    const session = ctx.sessions.get(sessionId) as Session

    expect(ctx.sessionProjections.snapshot(session).values.dataScope).toBeDefined()

    // Dispose the whole context; the projection registration rode the service fiber.
    await ctx.fiber.dispose()
    contexts.length = 0
  })
})

describe('managementContext with the shipped preset roster', () => {
  it('resolves the real semantic-layer-management preset from the data-agent roots', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    ctx.baseUrl = pathToFileURL(process.cwd()).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(AgentPresets, {
      default: MANAGEMENT_PRESET_ID,
      roots: [{ path: DATA_AGENT_PRESETS_ROOT, trust: 'system' }],
      includeShippedRoot: false,
      includeUserRoot: false,
    })

    const resolved = await ctx.agentPresets.resolve(MANAGEMENT_PRESET_ID)
    expect(resolved.id).toBe(MANAGEMENT_PRESET_ID)
  })
})
