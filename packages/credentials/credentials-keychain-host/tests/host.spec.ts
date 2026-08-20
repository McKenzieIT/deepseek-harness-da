import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { credentialRef, userId } from '@deepseek-ai/dsh-credentials'
import type { SecurityRunner } from '@deepseek-ai/dsh-credentials-keychain'
import * as hostPkg from '../src/index.ts'

const PAT = credentialRef('QODER_PERSONAL_ACCESS_TOKEN')
const GLOBAL = credentialRef('DEEPSEEK_API_KEY')

/** In-memory `security` CLI simulator (per-user keychain, exists by default). */
class FakeKeychain {
  private readonly items = new Map<string, string>()
  exists = true
  unlocked = false
  settingsApplied = false
  readonly run: SecurityRunner = async (args) => {
    const flag = (f: string): string | undefined => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }
    switch (args[0]) {
      case 'show-keychain-info':
        return this.exists ? { ok: true, stdout: '' } : { ok: false, stderr: 'not found', exitCode: 1 }
      case 'set-keychain-settings':
        this.settingsApplied = true
        return { ok: true, stdout: '' }
      case 'unlock-keychain':
        this.unlocked = true
        return { ok: true, stdout: '' }
      case 'add-generic-password':
        this.items.set(`${flag('-a')} ${flag('-s')}`, flag('-w') as string)
        return { ok: true, stdout: '' }
      case 'find-generic-password': {
        const v = this.items.get(`${flag('-a')} ${flag('-s')}`)
        return v !== undefined ? { ok: true, stdout: v } : { ok: false, stderr: 'could not be found in the keychain.', exitCode: 128 }
      }
      case 'delete-generic-password':
        this.items.delete(`${flag('-a')} ${flag('-s')}`)
        return { ok: true, stdout: '' }
      case 'lock-keychain':
        return { ok: true, stdout: '' }
      default:
        return { ok: false, stderr: `unknown ${args[0]}`, exitCode: 1 }
    }
  }
}

describe('credentials-keychain-host mount', () => {
  let dir: string
  let credFile: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dsh-host-'))
    credFile = join(dir, 'creds.yaml')
  })
  afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

  async function boot(overrides: Partial<hostPkg.HostConfig> = {}) {
    const ctx = new Context()
    const fake = new FakeKeychain()
    await ctx.plugin(hostPkg, {
      runner: fake.run,
      path: join(dir, 'kc.keychain'),
      unlockPasswordSource: 'none', // fake exists=true → no create/unlock needed
      credentialsPath: credFile,
      ...overrides,
    })
    return { ctx, fake, dispose: () => ctx.fiber.dispose() }
  }

  it('mounts KeychainCredentialProvider as ctx.credentials (single provider; base local not mounted)', async () => {
    const { ctx, dispose } = await boot()
    expect(typeof ctx.credentials.resolve).toBe('function')
    // A global resolve (no userId) hits the fallback shim (empty credFile → undefined).
    expect(await ctx.credentials.resolve(GLOBAL)).toBeUndefined()
    await dispose()
  })

  it('resolves a per-user PAT from the keychain and isolates users', async () => {
    const { ctx, dispose } = await boot()
    await ctx.credentials.set(PAT, 'sk-alice', { userId: userId('alice') })
    expect(await ctx.credentials.resolve(PAT, { userId: userId('alice') })).toEqual({ value: 'sk-alice', source: 'keychain' })
    // bob's per-user miss → shim fallback (empty file) → undefined (no leak across users).
    expect(await ctx.credentials.resolve(PAT, { userId: userId('bob') })).toBeUndefined()
    await dispose()
  })

  it('writes a global credential via the fallback shim (G3c global-writes gap, decision A)', async () => {
    const { ctx, dispose } = await boot()
    // A global set (no userId) delegates to the writable shim → .credentials.yaml.
    await ctx.credentials.set(GLOBAL, 'sk-deepseek')
    expect(await ctx.credentials.resolve(GLOBAL)).toEqual({ value: 'sk-deepseek', source: 'file' })
    // The file actually holds it (comment-preserving round-trip).
    const text = await readFile(credFile, 'utf8')
    expect(text).toContain('DEEPSEEK_API_KEY')
    await dispose()
  })

  it('unsets a global credential via the fallback shim', async () => {
    const { ctx, dispose } = await boot()
    await ctx.credentials.set(GLOBAL, 'sk-deepseek')
    await ctx.credentials.unset(GLOBAL)
    expect(await ctx.credentials.resolve(GLOBAL)).toBeUndefined()
    await dispose()
  })

  it('gates the per-user→global fallback off in stable mode (per-user PAT required)', async () => {
    // Seed the fallback file with a global PAT (T1).
    await writeFile(credFile, 'QODER_PERSONAL_ACCESS_TOKEN: sk-t1-global\n', 'utf8')
    const { ctx, dispose } = await boot({ perUserFallbackRefs: [] }) // stable: empty set = no per-user fallback
    // Per-user miss → undefined (QODER gated off, NOT the global T1).
    expect(await ctx.credentials.resolve(PAT, { userId: userId('alice') })).toBeUndefined()
    // Global resolve (no userId) still falls through the shim to the T1 global PAT.
    expect(await ctx.credentials.resolve(PAT)).toEqual({ value: 'sk-t1-global', source: 'file' })
    await dispose()
  })

  it('rejects an empty global set and a global set shadowed by the inherited env', async () => {
    const { ctx, dispose } = await boot()
    await expect(ctx.credentials.set(GLOBAL, '')).rejects.toThrow(/empty value/)
    // env-shadow: process.env supplying the ref makes a file write a silent no-op → refuse.
    const prev = process.env.DEEPSEEK_API_KEY
    process.env.DEEPSEEK_API_KEY = 'from-env'
    try {
      await expect(ctx.credentials.set(GLOBAL, 'to-file')).rejects.toThrow(/read-only by the launching environment/)
      expect(await ctx.credentials.resolve(GLOBAL)).toEqual({ value: 'from-env', source: 'env' })
    } finally {
      if (prev === undefined) delete process.env.DEEPSEEK_API_KEY
      else process.env.DEEPSEEK_API_KEY = prev
    }
    await dispose()
  })
})
