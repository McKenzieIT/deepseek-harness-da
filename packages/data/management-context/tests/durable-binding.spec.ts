/**
 * Real-backend durable-binding tests for `ctx.managementContext`.
 *
 * Exercises the full create → append → flush → projection-cache write-back →
 * cold-list-read → process-close → reopen → recover pipeline against the
 * shipping JSONL event backend and the shipping SessionProjectionCache domain.
 * No fake lifecycle service: the real SessionStore, JsonlSessionPersistence,
 * SessionProjectionCache, SessionProjectionRegistry, WorkspaceRegistry,
 * ScopeRegistryService, and SessionController (via `createSessionTestController`)
 * all run end to end. Only the external model/agent factory is stubbed.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent, AgentFactory } from '@deepseek-ai/dsh-agent'
import { agentPresetProjectionDefinition } from '@deepseek-ai/dsh-agent-presets'
import ScopeRegistryService from '@deepseek-ai/dsh-scope-registry'
import SessionStore from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SessionProjectionCache from '@deepseek-ai/dsh-session-projection-cache'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import Storage from '@deepseek-ai/dsh-storage'
import {
  apply as storageJsonApply, Config as storageJsonConfig, inject as storageJsonInject, name as storageJsonName,
} from '@deepseek-ai/dsh-storage-json'
import {
  apply as storageDomainApply, Config as storageDomainConfig, inject as storageDomainInject, name as storageDomainName,
} from '@deepseek-ai/dsh-storage-domain'
import { WorkspaceId, WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSessionTestController } from '../../../api/session-controller/tests/test-remote.ts'
import ManagementContextService, { MANAGEMENT_PRESET_ID } from '../src/index.ts'
import { DataScopeId } from '../src/types.ts'

const contexts: Context[] = []
const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  for (const dir of tempDirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

function stubAgent(session: Session): Agent {
  return { id: session.id, session, status: 'idle' } as unknown as Agent
}

/** Lightweight preset roster that resolves the named ids and rejects the rest. */
function roster(ids: readonly string[]): unknown {
  const presetOf = (id: string): object => ({ id, trust: 'system', path: `/presets/${id}/agent.cordis.yml` })
  return {
    defaultId: ids[0],
    resolve: (id?: string) => {
      const wanted = id ?? ids[0] ?? ''
      if (!ids.includes(wanted)) return Promise.reject(new Error(`agent-presets: preset "${wanted}" not found`))
      return Promise.resolve(presetOf(wanted))
    },
    mount: (_ctx: Context, id?: string) => Promise.resolve(presetOf(id ?? ids[0] ?? '')),
  }
}

interface HarnessPaths {
  readonly jsonlRoot: string
  readonly storageRoot: string
  readonly workspaceDir: string
  readonly scopeRegistryPath: string
}

interface DurableHarness {
  readonly ctx: Context
  readonly workspaceId: WorkspaceId
}

async function makeDurableHarness(paths: HarnessPaths): Promise<DurableHarness> {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.baseUrl = pathToFileURL(process.cwd()).href + '/'

  await ctx.plugin(Storage)
  await ctx.plugin(
    { name: storageJsonName, inject: storageJsonInject, apply: storageJsonApply, Config: storageJsonConfig },
    { root: paths.storageRoot },
  )
  await ctx.plugin(
    { name: storageDomainName, inject: storageDomainInject, apply: storageDomainApply, Config: storageDomainConfig },
    { backend: 'json' },
  )

  await ctx.plugin(SessionStore)
  await ctx.plugin(JsonlSessionPersistence, { root: paths.jsonlRoot, compression: 'none' })
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SessionProjectionCache, { writeEveryEvents: 100, writeIntervalMs: 60_000 })

  ctx.provide('agentPresets', roster([MANAGEMENT_PRESET_ID, 'standard']) as never)

  const factory: AgentFactory = {
    async createAgent(_ownerCtx, agentOptions) {
      // Replicate the agent loop's persistence attachment: prepare (pre-
      // publication), create the persistence write handle, enter + announce.
      // After announcement the JSONL backend routes live `session/event`
      // dispatches into the handle by session id, so `data-scope/bound` and
      // every later append reach durable storage.
      const session = ctx.sessions.prepare(
        agentOptions.sessionId,
        agentOptions.meta === undefined ? {} : { meta: agentOptions.meta },
      )
      const persistence = ctx.get('sessionPersistence')
      const handle = persistence === undefined ? undefined : await persistence.create(session.header)
      const agent = stubAgent(session)
      ;(agent as { ctx?: Context }).ctx = ctx
      await agentOptions.setup?.(ctx, agent)
      const detach = ctx.sessions.enter(session)
      ctx.sessions.announce(session)
      const unregister = await ctx.agents.register(agent)
      return {
        agent,
        dispose: async () => {
          await unregister()
          detach()
          await handle?.close().catch(() => {})
        },
      }
    },
    resume() { throw new Error('this test has no persisted sessions to resume') },
  }
  ctx.agents.setFactory(factory)

  await ctx.plugin(WorkspaceRegistry)
  await ctx.plugin(ScopeRegistryService, { registryPath: paths.scopeRegistryPath })

  createSessionTestController(ctx, {
    defaultModelSelection: () => ({ provider: 'test', model: 'test-model' }),
    cwd: paths.workspaceDir,
  })
  ctx.sessionProjections.register(agentPresetProjectionDefinition)
  await ctx.plugin(ManagementContextService)

  const workspace = await ctx.workspaceRegistry.create(paths.workspaceDir)
  await ctx.scopes.register({ id: 'scope-a', semanticRoot: '/tmp/scope-a' })

  return { ctx, workspaceId: WorkspaceId(workspace.id) }
}

async function makePaths(prefix: string): Promise<HarnessPaths> {
  const jsonlRoot = realpathSync(await mkdtemp(join(tmpdir(), `dsh-mgmt-${prefix}-jsonl-`)))
  const storageRoot = realpathSync(await mkdtemp(join(tmpdir(), `dsh-mgmt-${prefix}-storage-`)))
  const workspaceDir = realpathSync(await mkdtemp(join(tmpdir(), `dsh-mgmt-${prefix}-ws-`)))
  const scopeRegistryPath = join(workspaceDir, 'scopes.yaml')
  tempDirs.push(jsonlRoot, storageRoot, workspaceDir)
  return { jsonlRoot, storageRoot, workspaceDir, scopeRegistryPath }
}

describe('managementContext durable binding (real JSONL + projection-cache backend)', () => {
  it('survives a process close and reopen: the binding is cold-readable and resolveOrCreate reuses it', async () => {
    const paths = await makePaths('reopen')

    // --- first process: create the binding ---
    const first = await makeDurableHarness(paths)
    const created = await first.ctx.managementContext.resolveOrCreate({
      workspaceId: first.workspaceId,
      dataScopeId: DataScopeId('scope-a'),
    })
    expect(created.created).toBe(true)

    // immediate cold read (within the same process): the projection cache
    // write-back ran inside createSession, so the list already carries the
    // binding without opening full history.
    const liveList = await first.ctx.sessionController.list({}, new AbortController().signal)
    const liveSummary = liveList.items.find(item => item.sessionId === created.sessionId)
    expect(liveSummary?.projections?.values.agentPreset).toBe(MANAGEMENT_PRESET_ID)
    expect(liveSummary?.projections?.values.dataScope?.dataScopeId).toBe('scope-a')

    // --- close the process ---
    await first.ctx.fiber.dispose()
    contexts.splice(contexts.indexOf(first.ctx), 1)

    // --- reopen a fresh process over the same roots ---
    const second = await makeDurableHarness(paths)

    // The cold list surfaces the binding: no session is live, the projection
    // cache row survives, and the workspace membership is durable.
    const coldList = await second.ctx.sessionController.list({}, new AbortController().signal)
    const coldSummary = coldList.items.find(item => item.sessionId === created.sessionId)
    expect(coldSummary).toBeDefined()
    expect(coldSummary?.projections?.values.agentPreset).toBe(MANAGEMENT_PRESET_ID)
    expect(coldSummary?.projections?.values.dataScope?.dataScopeId).toBe('scope-a')

    // resolveOrCreate reuses the recovered session — no duplicate creation.
    const reused = await second.ctx.managementContext.resolveOrCreate({
      workspaceId: second.workspaceId,
      dataScopeId: DataScopeId('scope-a'),
    })
    expect(reused.created).toBe(false)
    expect(reused.sessionId).toBe(created.sessionId)
  })

  it('fails loud when the projection cache is cold for a member session instead of silently creating a duplicate', async () => {
    const firstPaths = await makePaths('cold-first')
    // A DIFFERENT storage root for the second process so the projection-cache
    // domain is empty while the JSONL event log (jsonlRoot + workspace dir)
    // is shared and the session is visible from the event log.
    const secondStorageRoot = realpathSync(await mkdtemp(join(tmpdir(), 'dsh-mgmt-cold-second-storage-')))
    tempDirs.push(secondStorageRoot)

    // --- first process: create the binding and let the cache checkpoint ---
    const first = await makeDurableHarness(firstPaths)
    const created = await first.ctx.managementContext.resolveOrCreate({
      workspaceId: first.workspaceId,
      dataScopeId: DataScopeId('scope-a'),
    })
    await first.ctx.fiber.dispose()
    contexts.splice(contexts.indexOf(first.ctx), 1)

    // --- reopen with the projection-cache domain EMPTY (stale/evicted cache) ---
    const second = await makeDurableHarness({ ...firstPaths, storageRoot: secondStorageRoot })

    // The session's JSONL event log still exists, but the projection-cache
    // domain is empty — so the cold list hint for the member session carries
    // no projection block at all. findExisting must classify this as
    // "unknown" and fail loud, NOT silently create a duplicate.
    const coldList = await second.ctx.sessionController.list({}, new AbortController().signal)
    const coldSummary = coldList.items.find(item => item.sessionId === created.sessionId)
    expect(coldSummary).toBeDefined()
    expect(coldSummary?.projections).toBeUndefined()

    await expect(second.ctx.managementContext.resolveOrCreate({
      workspaceId: second.workspaceId,
      dataScopeId: DataScopeId('scope-a'),
    })).rejects.toThrow(/missing or stale/)
  })

  it('propagates a flush failure as a creation failure', async () => {
    const paths = await makePaths('fail')
    const harness = await makeDurableHarness(paths)

    // Sabotage the sessionProjectionCache so its write() rejects — the binding
    // flush must propagate the failure rather than swallow it and return a
    // session id whose binding is not durable.
    const cache = harness.ctx.get('sessionProjectionCache')!
    const writeSpy = vi.spyOn(cache, 'write').mockRejectedValue(new Error('projection cache disk full'))

    await expect(harness.ctx.managementContext.createNew({
      workspaceId: harness.workspaceId,
      dataScopeId: DataScopeId('scope-a'),
    })).rejects.toThrow('projection cache disk full')

    writeSpy.mockRestore()

    // A retry with a healthy cache succeeds — the single-flight slot cleared.
    await expect(harness.ctx.managementContext.createNew({
      workspaceId: harness.workspaceId,
      dataScopeId: DataScopeId('scope-a'),
    })).resolves.toMatchObject({ created: true })
  })
})
