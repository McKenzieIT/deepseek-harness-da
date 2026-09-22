/**
 * Unit coverage for the Management Context Remote gateway and the `dataScope`
 * projection fold — the pieces the real-composition host spec does not exercise
 * directly (the gateway forwarding methods and the projection's non-binding and
 * already-bound branches).
 */

import { Context } from '@deepseek-ai/cordis'
import { SESSION_FORMAT_VERSION, SessionId, SessionLogOffset } from '@deepseek-ai/dsh-session'
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { afterEach, describe, expect, it } from 'vitest'
import { ManagementContextGateway } from '../src/remote.ts'
import { dataScopeProjectionDefinition } from '../src/projection.ts'
import ManagementContextService from '../src/index.ts'
import { DataScopeId } from '../src/types.ts'
import type { ManagementContextRequest, ManagementContextResolution } from '../src/types.ts'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'

function gatewayOver(
  service: { resolveOrCreate: unknown; createNew: unknown },
): ManagementContextGateway {
  const ctx = new Context()
  ctx.provide('managementContext', service as never)
  return new ManagementContextGateway(ctx)
}

const request: ManagementContextRequest = { workspaceId: WorkspaceId('ws-1'), dataScopeId: DataScopeId('scope-a') }

describe('ManagementContextGateway', () => {
  it('registers the resolveOrCreate and createNew Remote methods', () => {
    const gateway = gatewayOver({ resolveOrCreate: () => undefined, createNew: () => undefined })
    const names = remoteMethods(gateway).map(method => method.exportName ?? method.method)
    expect(names).toContain('resolveOrCreate')
    expect(names).toContain('createNew')
  })

  it('forwards resolveOrCreate to ctx.managementContext', async () => {
    const value: ManagementContextResolution = { sessionId: SessionId('s-1'), created: true }
    const calls: ManagementContextRequest[] = []
    const gateway = gatewayOver({
      resolveOrCreate: (req: ManagementContextRequest) => { calls.push(req); return Promise.resolve(value) },
      createNew: () => undefined,
    })
    await expect(gateway.resolveOrCreate(request)).resolves.toEqual(value)
    expect(calls).toEqual([request])
  })

  it('forwards createNew to ctx.managementContext', async () => {
    const value: ManagementContextResolution = { sessionId: SessionId('s-2'), created: true }
    const calls: ManagementContextRequest[] = []
    const gateway = gatewayOver({
      resolveOrCreate: () => undefined,
      createNew: (req: ManagementContextRequest) => { calls.push(req); return Promise.resolve(value) },
    })
    await expect(gateway.createNew(request)).resolves.toEqual(value)
    expect(calls).toEqual([request])
  })
})

describe('dataScope projection fold', () => {
  const { init, apply } = dataScopeProjectionDefinition
  const header: SessionHeader = {
    version: SESSION_FORMAT_VERSION,
    id: SessionId('mgmt-1'),
    createdAt: 0,
    isSeeded: false,
  }
  const boundEvent = { type: 'data-scope/bound', data: { dataScopeId: 'scope-a' } } as unknown as SessionEvent
  const otherEvent = { type: 'turn/start', data: { turn: 0 } } as unknown as SessionEvent

  it('starts unbound', () => {
    expect(init(header, SessionLogOffset(0))).toBeNull()
  })

  it('binds on the first data-scope/bound event', () => {
    expect(apply(null, boundEvent)).toEqual({ dataScopeId: 'scope-a' })
  })

  it('ignores unrelated events', () => {
    const state = { dataScopeId: 'scope-a' }
    expect(apply(state, otherEvent)).toBe(state)
  })

  it('is immutable once bound', () => {
    const state = { dataScopeId: 'scope-a' }
    const rebind = { type: 'data-scope/bound', data: { dataScopeId: 'scope-b' } } as unknown as SessionEvent
    expect(apply(state, rebind)).toBe(state)
  })
})

const hmrContexts: Context[] = []
afterEach(async () => {
  await Promise.all(hmrContexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

describe('ManagementContextService contribution fiber (HMR lifecycle)', () => {
  it('registers the dataScope projection on mount and removes it when ONLY the service fiber disposes', async () => {
    const ctx = new Context()
    hmrContexts.push(ctx)
    await ctx.plugin(SessionProjectionRegistry)

    // Provide stubs for every injected dependency so the service starts.
    ctx.provide('sessionController', { list: () => ({ items: [] }) } as never)
    ctx.provide('sessions', { get: () => undefined, flush: () => Promise.resolve(true) } as never)
    ctx.provide('workspaceRegistry', { get: () => undefined } as never)
    ctx.provide('scopes', { get: () => undefined } as never)
    ctx.provide('agentPresets', { resolve: () => Promise.resolve({ id: 'x' }) } as never)

    // The registry's internal registrations map is the authority on which
    // projection keys are live.
    const registry = ctx.sessionProjections as unknown as {
      registrations: Map<string, { def: { key: string; stateVersion: number } }>
    }

    // Before mount: the dataScope projection key is not registered.
    expect(registry.registrations.has('dataScope')).toBe(false)

    // Mount the service — its constructor calls ctx.sessionProjections.register(
    // dataScopeProjectionDefinition), and that registration rides the service's
    // fiber (sessionProjections.register owns the ctx.effect; the service does
    // NOT add a redundant one).
    const serviceFiber = ctx.plugin(ManagementContextService)
    await serviceFiber

    // After mount: the registry holds the dataScope projection.
    expect(registry.registrations.has('dataScope')).toBe(true)

    // Dispose ONLY the service fiber — the registry and all other services stay.
    await (serviceFiber as unknown as { dispose: () => Promise<void> }).dispose()

    // The projection registration rode the service fiber, so it is gone.
    expect(registry.registrations.has('dataScope')).toBe(false)

    // The registry itself survives — it is NOT disposed.
    expect(registry.registrations).toBeDefined()

    // Reload (re-mount) the service: the projection comes back.
    const reloaded = ctx.plugin(ManagementContextService)
    await reloaded
    expect(registry.registrations.has('dataScope')).toBe(true)

    await (reloaded as unknown as { dispose: () => Promise<void> }).dispose()
  })

  it('settles an in-flight resolveOrCreate when the service fiber disposes mid-call', async () => {
    const ctx = new Context()
    hmrContexts.push(ctx)
    await ctx.plugin(SessionProjectionRegistry)

    // Provide minimal stubs so the service starts; resolveOrCreate will fail
    // (no workspace/scope/preset), but the promise must SETTLE (reject), not
    // hang, when the fiber disposes mid-flight.
    ctx.provide('sessionController', {
      list: () => ({ items: [] }),
      create: () => { throw new Error('not available') },
    } as never)
    ctx.provide('sessions', { get: () => undefined, flush: () => Promise.resolve(true) } as never)
    ctx.provide('workspaceRegistry', { get: () => undefined } as never)
    ctx.provide('scopes', { get: () => undefined } as never)
    ctx.provide('agentPresets', { resolve: () => Promise.resolve({ id: 'x' }) } as never)

    const serviceFiber = ctx.plugin(ManagementContextService)
    await serviceFiber

    // Start a resolveOrCreate that will reject (unknown workspace), then
    // dispose the fiber. The promise must settle (reject), not hang.
    const inflight = ctx.managementContext.resolveOrCreate({
      workspaceId: WorkspaceId('ws-x'),
      dataScopeId: DataScopeId('scope-x'),
    })

    // Dispose the service fiber while the call is in flight.
    await (serviceFiber as unknown as { dispose: () => Promise<void> }).dispose()

    // The in-flight call settles (rejects with the workspace-not-found error,
    // not a hang or an unhandled rejection that escapes the fiber disposal).
    await expect(inflight).rejects.toThrow(/workspace "ws-x" not found/)
  })
})
