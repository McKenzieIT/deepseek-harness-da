import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { credentialRef, scopeId, userId } from '../src/index.ts'
import type { CredentialAddress, CredentialRef } from '../src/index.ts'
import { MemoryCredentials } from './memory.ts'

const REF = credentialRef('DEEPSEEK_API_KEY')

async function boot(seed: Record<string, string> = {}): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(MemoryCredentials, seed)
  return ctx
}

describe('credentialRef', () => {
  it('brands POSIX shell identifiers', () => {
    expect(credentialRef('DEEPSEEK_API_KEY')).toBe('DEEPSEEK_API_KEY')
    expect(credentialRef('_private')).toBe('_private')
    expect(credentialRef('lower_case9')).toBe('lower_case9')
  })

  it('rejects every other shape', () => {
    for (const invalid of ['', '9LEADING', 'WITH-DASH', 'WITH SPACE', 'ns:key']) {
      expect(() => credentialRef(invalid)).toThrow(TypeError)
    }
  })
})

describe('the credentials seam through the memory provider', () => {
  it('mounts as ctx.credentials and resolves a seeded reference with its source', async () => {
    const ctx = await boot({ DEEPSEEK_API_KEY: 'sk-seeded' })
    expect(await ctx.credentials.resolve(REF)).toEqual({ value: 'sk-seeded', source: 'memory' })
    expect(await ctx.credentials.describe(REF)).toEqual({ configured: true, source: 'memory', writable: true })
  })

  it('treats an empty stored value as absent everywhere', async () => {
    const ctx = await boot({ DEEPSEEK_API_KEY: '' })
    expect(await ctx.credentials.resolve(REF)).toBeUndefined()
    expect(await ctx.credentials.describe(REF)).toEqual({ configured: false, writable: true })
  })

  it('stores through set, removes through unset, and emits the committed change', async () => {
    const ctx = await boot()
    const events: CredentialRef[] = []
    ctx.on('credentials/updated', ref => void events.push(ref))

    await ctx.credentials.set(REF, 'sk-live')
    expect(await ctx.credentials.resolve(REF)).toEqual({ value: 'sk-live', source: 'memory' })
    await ctx.credentials.unset(REF)
    expect(await ctx.credentials.resolve(REF)).toBeUndefined()
    expect(events).toEqual([REF, REF])
  })

  it('rejects an empty set and keeps an absent unset silent', async () => {
    const ctx = await boot()
    const events: CredentialRef[] = []
    ctx.on('credentials/updated', ref => void events.push(ref))

    await expect(ctx.credentials.set(REF, '')).rejects.toThrow(/empty value/)
    await ctx.credentials.unset(REF)
    expect(events).toEqual([])
  })

  it('removes the service with its fiber', async () => {
    const ctx = new Context()
    const fiber = await ctx.plugin(MemoryCredentials)
    expect(ctx.get('credentials')).toBeDefined()
    await fiber.dispose()
    expect(ctx.get('credentials')).toBeUndefined()
  })
})

describe('per-user/scope addressing through the memory provider', () => {
  it('isolates a per-user value from the global slot and from other users', async () => {
    const ctx = await boot()
    const events: Array<{ ref: CredentialRef; address?: CredentialAddress }> = []
    ctx.on('credentials/updated', (ref, address) => events.push({ ref, ...(address !== undefined ? { address } : {}) }))

    await ctx.credentials.set(REF, 'sk-alice', { userId: userId('alice') })
    // A per-user value is invisible to the global slot and to another user.
    expect(await ctx.credentials.resolve(REF)).toBeUndefined()
    expect(await ctx.credentials.resolve(REF, { userId: userId('bob') })).toBeUndefined()
    expect(await ctx.credentials.resolve(REF, { userId: userId('alice') })).toEqual({ value: 'sk-alice', source: 'memory' })
    expect(await ctx.credentials.describe(REF, { userId: userId('alice') })).toEqual({ configured: true, source: 'memory', writable: true })

    // A global value coexists with the per-user one on the same reference.
    await ctx.credentials.set(REF, 'sk-global')
    expect(await ctx.credentials.resolve(REF)).toEqual({ value: 'sk-global', source: 'memory' })
    expect(await ctx.credentials.resolve(REF, { userId: userId('alice') })).toEqual({ value: 'sk-alice', source: 'memory' })

    // The committed-change event carries the address the change is scoped to.
    expect(events).toEqual([
      { ref: REF, address: { userId: userId('alice') } },
      { ref: REF, address: undefined },
    ])

    // Unset is scoped: removing alice's slot leaves the global value intact.
    await ctx.credentials.unset(REF, { userId: userId('alice') })
    expect(await ctx.credentials.resolve(REF, { userId: userId('alice') })).toBeUndefined()
    expect(await ctx.credentials.resolve(REF)).toEqual({ value: 'sk-global', source: 'memory' })
  })

  it('treats scopeId and userId as orthogonal dimensions on the same reference', async () => {
    const ctx = await boot()
    await ctx.credentials.set(REF, 'per-scope', { scopeId: scopeId('game-1') })
    await ctx.credentials.set(REF, 'per-user', { userId: userId('alice') })
    expect(await ctx.credentials.resolve(REF, { scopeId: scopeId('game-1') })).toEqual({ value: 'per-scope', source: 'memory' })
    expect(await ctx.credentials.resolve(REF, { userId: userId('alice') })).toEqual({ value: 'per-user', source: 'memory' })
    expect(await ctx.credentials.resolve(REF, { scopeId: scopeId('game-1'), userId: userId('alice') })).toBeUndefined()
  })
})
