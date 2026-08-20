import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { IdentityService } from '../src/index.ts'

describe('ctx.identity stub (T1 fallback)', () => {
  it('mounts as ctx.identity and returns undefined before P9 lands per-user login', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(IdentityService)
    await fiber
    expect(ctx.identity).toBeInstanceOf(IdentityService)
    expect(ctx.identity.current()).toBeUndefined()
    await fiber.dispose()
  })
})
