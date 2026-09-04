import { describe, expect, it, vi } from 'vitest'

// CB-4 bypass: the typert generator emits `import { z } from 'zod'` in the
// generated typert.remote-client.js (wire schemas). CB-4 removed zod from
// schema-gateway's deps (knip false-positive — src doesn't use zod, but the
// generated lib does), and evidence-query never declared it, so the runtime
// import breaks with "Cannot find package 'zod'". This stub makes zod
// chainable so the generated remote-client LOADS; the contribution
// (evidenceQueryRemote) and the assembly (apply) under test are production
// code — only the broken zod dep is stubbed. Remove when CB-4 wires zod
// (dep + knip exemption) for schema-gateway and evidence-query.
vi.mock('zod', () => {
  let proxy: unknown = null
  proxy = new Proxy(function () {}, {
    get: () => proxy,
    apply: () => proxy,
  })
  return { z: proxy }
})

import { Context } from '@deepseek-ai/cordis'
import { apply, inject } from '../src/client/index.ts'
import evidenceQueryRemote from '@deepseek-ai/dsh-evidence-query/remote'

// W12/W13/W16 were masked by component tests that injected fake clients while
// the real resolution path (scope.get('remote.evidenceQuery')) was dead. These
// checks exercise the real path: the generated evidence-query remote-client
// (served by evidence-query's ./remote export) and the real api-remotes client
// assembly apply() that mounts it. The only double is the recording $mount
// sink + the zod stub above; the contribution and the assembly are production
// code. The namespace proxy (ctx.remote.evidenceQuery) is the
// TypertClientRemote's job and is covered end-to-end by the browser check.
describe('evidence-query client remote — real-path resolution (W16)', () => {
  it('serves the generated evidence-query remote contribution from ./remote', () => {
    // Before W16 this import failed (TS2307 Cannot find module): evidence-query
    // declared no ./remote export, so the typert generator skipped the package.
    expect(evidenceQueryRemote).toBeDefined()
    expect(typeof evidenceQueryRemote).toBe('object')
  })

  it('mounts the real evidence-query contribution via the client assembly apply()', async () => {
    const mounted: unknown[] = []
    const ctx = new Context()
    ctx.reflect.provide('remote', {
      $mount: async (contribution: unknown) => {
        mounted.push(contribution)
        return async () => {}
      },
    } as never)
    expect(inject).toContain('remote')
    const dispose = await apply(ctx)
    expect(mounted).toContain(evidenceQueryRemote)
    await dispose()
    await ctx.fiber.dispose()
  })
})
