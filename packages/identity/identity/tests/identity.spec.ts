import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import { IdentityService } from '../src/index.ts'
import * as invariant from '../src/invariant.ts'

describe('ctx.identity stub (T1 fallback)', () => {
  it('mounts as ctx.identity and returns undefined before P9 lands per-user login', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(IdentityService)
    await fiber
    expect(ctx.identity).toBeInstanceOf(IdentityService)
    expect(ctx.identity.current()).toBeUndefined()
    await fiber.dispose()
  })

  it('registers the package-owned no-op invariant companion', async () => {
    const dispose = vi.fn()
    const register = vi.fn((_packageName: string, _installer: InvariantInstaller) => dispose)
    const ctx = { invariants: { register } } as unknown as Context
    await expect(invariant.apply(ctx)).resolves.toBe(dispose)
    expect(register).toHaveBeenCalledWith('@deepseek-ai/dsh-identity', expect.any(Function))
    expect(invariant.name).toBe('identity-invariant')
    expect(invariant.inject).toEqual(['invariants'])
  })
})
