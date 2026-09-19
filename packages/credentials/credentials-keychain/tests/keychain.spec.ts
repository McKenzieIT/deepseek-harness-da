import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { credentialKey, credentialRef, scopeId, userId } from '@deepseek-ai/dsh-credentials'
import type { CredentialRecord, CredentialRef } from '@deepseek-ai/dsh-credentials'
import { KeychainCredentialProvider, resolveSpec, securityCli } from '../src/index.ts'
import type { KeychainFallback, SecurityResult, SecurityRunner } from '../src/index.ts'

const REF = credentialRef('QODER_PERSONAL_ACCESS_TOKEN')

/**
 * In-memory `security` CLI simulator: a writable per-user keychain with fault
 * injectors, so the provider's logic is covered on non-mac CI without spawning
 * `/usr/bin/security` (which the live macOS e2e exercises off-CI).
 */
class FakeKeychain {
  private readonly items = new Map<string, string>()
  exists = false
  locked = false
  created = false
  settingsApplied = false
  /** Last `set-keychain-settings` args, so a test can assert the lock-policy flags (e.g. `-u` gated on autoLockSeconds). */
  settingsArgs: string[] | undefined
  unlocked = false
  lockOutcome: SecurityResult = { ok: true, stdout: '' }
  lockThrows = false
  addOutcome: SecurityResult = { ok: true, stdout: '' }
  deleteOutcome: SecurityResult = { ok: true, stdout: '' }
  /** stderr returned on a find miss. Default matches the not-found regex (a miss);
    set to a non-matching string to simulate a real fault. */
  missStderr = 'The specified item could not be found in the keychain.'
  /** Count of find-generic-password invocations (erc-3: unset must not read the secret → 0). */
  findCalls = 0

  private key(account: string, service: string): string {
    return `${account}\u0000${service}`
  }

  readonly run: SecurityRunner = async (args) => {
    const cmd = args[0]
    const flag = (f: string): string | undefined => {
      const i = args.indexOf(f)
      return i >= 0 ? args[i + 1] : undefined
    }
    switch (cmd) {
      case 'show-keychain-info':
        return this.exists ? { ok: true, stdout: '' } : { ok: false, stderr: 'The keychain could not be found.', exitCode: 1 }
      case 'create-keychain':
        this.exists = true
        this.created = true
        return { ok: true, stdout: '' }
      case 'set-keychain-settings':
        this.settingsApplied = true
        this.settingsArgs = args
        return { ok: true, stdout: '' }
      case 'unlock-keychain':
        this.unlocked = true
        this.locked = false
        return { ok: true, stdout: '' }
      case 'lock-keychain':
        if (this.lockThrows) throw new Error('fake lock-keychain threw')
        this.locked = true
        return this.lockOutcome
      case 'add-generic-password': {
        if (!this.addOutcome.ok) return this.addOutcome
        this.items.set(this.key(flag('-a') as string, flag('-s') as string), flag('-w') as string)
        return { ok: true, stdout: '' }
      }
      case 'find-generic-password': {
        this.findCalls++
        if (this.locked) return { ok: false, stderr: 'User interaction is not allowed.', exitCode: -25308 }
        const value = this.items.get(this.key(flag('-a') as string, flag('-s') as string))
        if (value !== undefined) return { ok: true, stdout: value }
        return { ok: false, stderr: this.missStderr, exitCode: 128 }
      }
      case 'delete-generic-password': {
        if (!this.deleteOutcome.ok) return this.deleteOutcome
        const k = this.key(flag('-a') as string, flag('-s') as string)
        // Match the real `security` CLI: deleting an absent item returns
        // not-found (erc-3: the find preflight was removed, so the provider
        // relies on delete's not-found to detect absence + TOCTOU).
        if (!this.items.has(k)) return { ok: false, stderr: 'The specified item could not be found in the keychain.', exitCode: 128 }
        this.items.delete(k)
        return { ok: true, stdout: '' }
      }
      default:
        return { ok: false, stderr: `fake: unknown command ${cmd}`, exitCode: 1 }
    }
  }
}

function makeFallback(seed: Map<string, string>): KeychainFallback {
  return {
    async resolve(ref: CredentialRef) {
      const value = seed.get(ref)
      return value === undefined ? undefined : { value, source: 'fallback' }
    },
    async describe(ref: CredentialRef) {
      return seed.has(ref) ? { configured: true, source: 'fallback', writable: true } : { configured: false, writable: true }
    },
  }
}

/**
 * A read-only fallback plus the optional writable global half (G3c decision A:
 * the host's file shim over `.credentials.yaml`), so a global set/unset has
 * somewhere to land. `unset` returns whether a value was actually removed —
 * the fact the provider gates the global event on.
 */
function makeWritableFallback(seed: Map<string, string>): KeychainFallback {
  return {
    ...makeFallback(seed),
    async set(ref: CredentialRef, value: string) { seed.set(ref, value) },
    async unset(ref: CredentialRef) { return seed.delete(ref) },
  }
}

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!()
})

type ProviderConfig = ConstructorParameters<typeof KeychainCredentialProvider>[1]

async function boot(config: ProviderConfig): Promise<Context> {
  const ctx = new Context()
  const fiber = ctx.plugin(KeychainCredentialProvider, config)
  cleanups.push(async () => { await fiber.dispose() })
  await fiber
  return ctx
}

function events(ctx: Context): Array<{ ref: CredentialRef; address?: string }> {
  const seen: Array<{ ref: CredentialRef; address?: string }> = []
  ctx.on('credentials/reference-updated', (ref, address) => {
    const uid = address?.userId
    seen.push({ ref, ...(uid !== undefined ? { address: uid } : {}) })
  })
  return seen
}

describe('resolveSpec', () => {
  it('defaults to credentials.keychain under the harness home with a 300s auto-lock', () => {
    const spec = resolveSpec({ runner: new FakeKeychain().run, dshHome: '/custom/home' })
    // `resolveSpec` composes this as `join(resolveDshHome(dshHome), KEYCHAIN_FILENAME)`, and
    // `resolveDshHome` ends in `resolve()` — which on Windows completes a root-relative
    // `/custom/home` with the current drive. Deriving through the same helper covers both
    // halves of that composition; pinning only the `join` half still fails on Windows.
    expect(spec).toEqual({ keychain: join(resolveDshHome('/custom/home'), 'credentials.keychain'), autoLockSeconds: 300, lockOnSleep: true })
  })

  it('lets an explicit path and lock policy win over the defaults', () => {
    const spec = resolveSpec({ runner: new FakeKeychain().run, path: '/etc/dsh/creds.keychain', autoLockSeconds: 0, lockOnSleep: false })
    expect(spec).toEqual({ keychain: '/etc/dsh/creds.keychain', autoLockSeconds: 0, lockOnSleep: false })
  })
})

describe('keychain setup at init', () => {
  it('creates, configures, and unlocks a new keychain', async () => {
    const fake = new FakeKeychain()
    await boot({ path: '/tmp/dsh-probe.keychain', unlockPassword: 'pw', runner: fake.run })
    expect(fake.created).toBe(true)
    expect(fake.settingsApplied).toBe(true)
    expect(fake.unlocked).toBe(true)
  })

  it('skips creation when the keychain already exists, but still applies settings and unlocks', async () => {
    const fake = new FakeKeychain()
    fake.exists = true
    await boot({ path: '/tmp/dsh-probe.keychain', unlockPassword: 'pw', runner: fake.run })
    expect(fake.created).toBe(false)
    expect(fake.settingsApplied).toBe(true)
    expect(fake.unlocked).toBe(true)
  })

  it('skips unlock when no password is supplied to an existing keychain', async () => {
    const fake = new FakeKeychain()
    fake.exists = true
    await boot({ path: '/tmp/dsh-probe.keychain', runner: fake.run })
    expect(fake.unlocked).toBe(false)
    expect(fake.settingsApplied).toBe(true)
  })

  it('applies settings with no auto-lock and no lock-on-sleep when both are disabled', async () => {
    const fake = new FakeKeychain()
    await boot({ path: '/tmp/dsh-probe.keychain', unlockPassword: 'pw', runner: fake.run, autoLockSeconds: 0, lockOnSleep: false })
    expect(fake.settingsArgs).toEqual(['set-keychain-settings', '/tmp/dsh-probe.keychain'])
  })

  it('applies the auto-lock and lock-on-sleep flags by default (300s, lock on sleep)', async () => {
    const fake = new FakeKeychain()
    await boot({ path: '/tmp/dsh-probe.keychain', unlockPassword: 'pw', runner: fake.run })
    expect(fake.settingsArgs).toEqual(['set-keychain-settings', '-u', '-t', '300', '-l', '/tmp/dsh-probe.keychain'])
  })

  it('fails loud when a new keychain is needed but no password is supplied', async () => {
    const fake = new FakeKeychain()
    const ctx = new Context()
    await expect(ctx.plugin(KeychainCredentialProvider, { path: '/tmp/dsh-probe.keychain', runner: fake.run }))
      .rejects.toThrow(/supply unlockPassword/)
  })

  it('fails loud when create-keychain faults', async () => {
    const fake = new FakeKeychain()
    // Override run to fail create-keychain.
    const failing: SecurityRunner = async args => args[0] === 'create-keychain'
      ? { ok: false, stderr: 'create failed', exitCode: 1 }
      : fake.run(args)
    const ctx = new Context()
    await expect(ctx.plugin(KeychainCredentialProvider, { path: '/tmp/dsh-probe.keychain', unlockPassword: 'pw', runner: failing }))
      .rejects.toThrow(/create-keychain failed/)
  })

  it('fails loud when set-keychain-settings faults', async () => {
    const failing: SecurityRunner = async args => args[0] === 'show-keychain-info'
      ? { ok: false, stderr: 'absent', exitCode: 1 }
      : args[0] === 'create-keychain'
        ? { ok: true, stdout: '' }
        : args[0] === 'set-keychain-settings'
          ? { ok: false, stderr: 'settings failed', exitCode: 1 }
          : { ok: true, stdout: '' }
    const ctx = new Context()
    await expect(ctx.plugin(KeychainCredentialProvider, { path: '/tmp/dsh-probe.keychain', unlockPassword: 'pw', runner: failing }))
      .rejects.toThrow(/set-keychain-settings failed/)
  })

  it('fails loud when unlock-keychain faults', async () => {
    const failing: SecurityRunner = async args => args[0] === 'unlock-keychain'
      ? { ok: false, stderr: 'wrong password', exitCode: 1 }
      : { ok: true, stdout: '' }
    const ctx = new Context()
    await expect(ctx.plugin(KeychainCredentialProvider, { path: '/tmp/dsh-probe.keychain', unlockPassword: 'pw', runner: failing }))
      .rejects.toThrow(/unlock-keychain failed/)
  })
})

describe('teardown locks the keychain', () => {
  it('locks the keychain on dispose', async () => {
    const fake = new FakeKeychain()
    const ctx = new Context()
    const fiber = ctx.plugin(KeychainCredentialProvider, { path: '/tmp/dsh-probe.keychain', unlockPassword: 'pw', runner: fake.run })
    await fiber
    await fiber.dispose()
    expect(fake.locked).toBe(true)
  })

  it('warns but still disposes when lock-keychain fails', async () => {
    const fake = new FakeKeychain()
    fake.lockOutcome = { ok: false, stderr: 'already locked', exitCode: 1 }
    const ctx = new Context()
    const fiber = ctx.plugin(KeychainCredentialProvider, { path: '/tmp/dsh-probe.keychain', unlockPassword: 'pw', runner: fake.run })
    await fiber
    await expect(fiber.dispose()).resolves.toBeUndefined()
  })

  it('warns but still disposes when lock-keychain throws', async () => {
    const fake = new FakeKeychain()
    fake.lockThrows = true
    const ctx = new Context()
    const fiber = ctx.plugin(KeychainCredentialProvider, { path: '/tmp/dsh-probe.keychain', unlockPassword: 'pw', runner: fake.run })
    await fiber
    await expect(fiber.dispose()).resolves.toBeUndefined()
  })
})

describe('per-user CRUD with G3 staged fallback', () => {
  it('isolates a per-user value from other users and from the global fallback', async () => {
    const fallback = makeFallback(new Map([[REF, 'sk-t1-global']]))
    const fake = new FakeKeychain()
    const ctx = await boot({ path: '/tmp/dsh-probe.keychain', unlockPassword: 'pw', runner: fake.run, fallback })

    await ctx.credentials.set(REF, 'sk-alice', { userId: userId('alice') })
    expect(await ctx.credentials.resolve(REF, { userId: userId('alice') })).toEqual({ value: 'sk-alice', source: 'keychain' })
    // A per-user miss falls through to the global fallback (G3 staged).
    expect(await ctx.credentials.resolve(REF, { userId: userId('bob') })).toEqual({ value: 'sk-t1-global', source: 'fallback' })
    // A global resolve (no userId) also falls through to the fallback.
    expect(await ctx.credentials.resolve(REF)).toEqual({ value: 'sk-t1-global', source: 'fallback' })

    expect(await ctx.credentials.describe(REF, { userId: userId('alice') })).toEqual({ configured: true, source: 'keychain', writable: true })
    expect(await ctx.credentials.describe(REF, { userId: userId('bob') })).toEqual({ configured: true, source: 'fallback', writable: true })

    // Unset is scoped: alice's slot goes away, the global fallback remains.
    await ctx.credentials.unset(REF, { userId: userId('alice') })
    expect(await ctx.credentials.resolve(REF, { userId: userId('alice') })).toEqual({ value: 'sk-t1-global', source: 'fallback' })
  })

  it('resolves to undefined when a per-user miss has no fallback', async () => {
    const fake = new FakeKeychain()
    const ctx = await boot({ path: '/tmp/dsh-probe.keychain', unlockPassword: 'pw', runner: fake.run })
    expect(await ctx.credentials.resolve(REF, { userId: userId('alice') })).toBeUndefined()
    expect(await ctx.credentials.describe(REF, { userId: userId('alice') })).toEqual({ configured: false, writable: true })
    expect(await ctx.credentials.resolve(REF)).toBeUndefined()
    // embedder-retrieval-creds-4: no userId + no fallback → set() throws
    // ('a per-user set requires userId'), so writable is false (not the prior
    // contract-violating true). Host always supplies a writable fallback.
    expect(await ctx.credentials.describe(REF)).toEqual({ configured: false, writable: false })
  })

  it('gates the per-user→global fallback by perUserFallbackRefs (G3 stable: per-user required)', async () => {
    const fallback = makeFallback(new Map([[REF, 'sk-t1-global']]))
    const fake = new FakeKeychain()
    // stable: an empty set gates every ref's per-user miss off → per-user required.
    const ctx = await boot({ path: '/tmp/dsh-probe.keychain', unlockPassword: 'pw', runner: fake.run, fallback, perUserFallbackRefs: new Set() })
    // A per-user miss no longer degrades to the global T1 PAT (stable, fallback gated off for this ref).
    expect(await ctx.credentials.resolve(REF, { userId: userId('alice') })).toBeUndefined()
    expect(await ctx.credentials.describe(REF, { userId: userId('alice') })).toEqual({ configured: false, writable: true })
    // A global resolve (no userId) still falls through to the fallback — global creds stay served.
    expect(await ctx.credentials.resolve(REF)).toEqual({ value: 'sk-t1-global', source: 'fallback' })
    expect(await ctx.credentials.describe(REF)).toEqual({ configured: true, source: 'fallback', writable: true })

    // A set listing only a different ref gates QODER off but lets the listed ref fall back (per-ref granularity).
    const OTHER = credentialRef('OTHER_FALLBACK_REF')
    const fallback2 = makeFallback(new Map([[REF, 'sk-t1-global'], [OTHER, 'sk-other-global']]))
    const fake2 = new FakeKeychain()
    const ctx2 = await boot({ path: '/tmp/dsh-probe.keychain', unlockPassword: 'pw', runner: fake2.run, fallback: fallback2, perUserFallbackRefs: new Set([OTHER]) })
    expect(await ctx2.credentials.resolve(REF, { userId: userId('alice') })).toBeUndefined()
    expect(await ctx2.credentials.resolve(OTHER, { userId: userId('alice') })).toEqual({ value: 'sk-other-global', source: 'fallback' })

    // Default (undefined = early): every per-user miss falls back (backward compat with P12b).
    const fake3 = new FakeKeychain()
    const ctx3 = await boot({ path: '/tmp/dsh-probe.keychain', unlockPassword: 'pw', runner: fake3.run, fallback: makeFallback(new Map([[REF, 'sk-t1-global']])) })
    expect(await ctx3.credentials.resolve(REF, { userId: userId('alice') })).toEqual({ value: 'sk-t1-global', source: 'fallback' })
  })

  it('treats scopeId and userId as orthogonal (scopeId does not index a keychain slot)', async () => {
    const fallback = makeFallback(new Map())
    const fake = new FakeKeychain()
    const ctx = await boot({ path: '/tmp/dsh-probe.keychain', unlockPassword: 'pw', runner: fake.run, fallback })
    // scopeId alone has no keychain slot (the keychain is per-user), so it falls through.
    expect(await ctx.credentials.resolve(REF, { scopeId: scopeId('game-1') })).toBeUndefined()
    expect(await ctx.credentials.describe(REF, { scopeId: scopeId('game-1') })).toEqual({ configured: false, writable: true })
  })

  it('emits credentials/reference-updated with the per-user address on set and unset', async () => {
    const fake = new FakeKeychain()
    const ctx = await boot({ path: '/tmp/dsh-probe.keychain', unlockPassword: 'pw', runner: fake.run })
    const seen = events(ctx)
    await ctx.credentials.set(REF, 'sk-alice', { userId: userId('alice') })
    await ctx.credentials.unset(REF, { userId: userId('alice') })
    expect(seen).toEqual([
      { ref: REF, address: 'alice' },
      { ref: REF, address: 'alice' },
    ])
  })

  it('unset on an absent slot is a silent no-op (no event)', async () => {
    const fake = new FakeKeychain()
    const ctx = await boot({ path: '/tmp/dsh-probe.keychain', unlockPassword: 'pw', runner: fake.run })
    const seen = events(ctx)
    await ctx.credentials.unset(REF, { userId: userId('alice') })
    expect(seen).toEqual([])
  })

  it('unset without a userId is a silent no-op', async () => {
    const fake = new FakeKeychain()
    const ctx = await boot({ path: '/tmp/dsh-probe.keychain', unlockPassword: 'pw', runner: fake.run })
    const seen = events(ctx)
    await ctx.credentials.unset(REF)
    expect(seen).toEqual([])
  })

  it('rejects an empty set and a global set without a userId', async () => {
    const fake = new FakeKeychain()
    const ctx = await boot({ path: '/tmp/dsh-probe.keychain', unlockPassword: 'pw', runner: fake.run })
    await expect(ctx.credentials.set(REF, '', { userId: userId('alice') })).rejects.toThrow(/empty value/)
    await expect(ctx.credentials.set(REF, 'sk-global')).rejects.toThrow(/requires \{ userId \}/)
  })

  it('rejects a global unset silently and propagates add/delete faults', async () => {
    const fake = new FakeKeychain()
    fake.addOutcome = { ok: false, stderr: 'add fault', exitCode: 1 }
    const ctx = await boot({ path: '/tmp/dsh-probe.keychain', unlockPassword: 'pw', runner: fake.run })
    await expect(ctx.credentials.set(REF, 'sk-alice', { userId: userId('alice') })).rejects.toThrow(/add-generic-password.*failed/)

    // A delete fault after a present item surfaces too.
    fake.addOutcome = { ok: true, stdout: '' }
    fake.deleteOutcome = { ok: false, stderr: 'delete fault', exitCode: 1 }
    await ctx.credentials.set(REF, 'sk-alice', { userId: userId('alice') })
    await expect(ctx.credentials.unset(REF, { userId: userId('alice') })).rejects.toThrow(/delete-generic-password.*failed/)
  })

  it('throws on a real security fault (not a not-found miss) during find', async () => {
    const fake = new FakeKeychain()
    fake.missStderr = 'SecKeychainItemCopyContent: an unexpected error occurred'
    const ctx = await boot({ path: '/tmp/dsh-probe.keychain', unlockPassword: 'pw', runner: fake.run })
    await expect(ctx.credentials.resolve(REF, { userId: userId('alice') })).rejects.toThrow(/find-generic-password.*failed/)
  })

  it('throws on a keychain-missing fault rather than silently degrading to a miss', async () => {
    const fake = new FakeKeychain()
    fake.missStderr = 'The keychain could not be found.'
    const ctx = await boot({ path: '/tmp/dsh-probe.keychain', unlockPassword: 'pw', runner: fake.run })
    await expect(ctx.credentials.resolve(REF, { userId: userId('alice') })).rejects.toThrow(/find-generic-password.*failed/)
  })

  it('re-unlocks the keychain after an auto-lock and retries the find', async () => {
    const fake = new FakeKeychain()
    const ctx = await boot({ path: '/tmp/dsh-probe.keychain', unlockPassword: 'pw', runner: fake.run })
    await ctx.credentials.set(REF, 'sk-alice', { userId: userId('alice') })
    fake.unlocked = false
    fake.locked = true
    expect(await ctx.credentials.resolve(REF, { userId: userId('alice') })).toEqual({ value: 'sk-alice', source: 'keychain' })
    expect(fake.locked).toBe(false)
    expect(fake.unlocked).toBe(true)
  })

  it('treats a TOCTOU delete-not-found as an idempotent no-op (no throw, no event)', async () => {
    const fake = new FakeKeychain()
    fake.deleteOutcome = { ok: false, stderr: 'The specified item could not be found in the keychain.', exitCode: 128 }
    const ctx = await boot({ path: '/tmp/dsh-probe.keychain', unlockPassword: 'pw', runner: fake.run })
    const seen = events(ctx)
    await ctx.credentials.set(REF, 'sk-alice', { userId: userId('alice') })
    // The item was set present, but the delete returns not-found (an injected
    // TOCTOU — a concurrent delete won the race) → idempotent no-op (no event).
    await expect(ctx.credentials.unset(REF, { userId: userId('alice') })).resolves.toBeUndefined()
    expect(seen).toEqual([{ ref: REF, address: 'alice' }])
  })

  it('unset does not read the secret value (no find-generic-password call) — erc-3', async () => {
    const fake = new FakeKeychain()
    const ctx = await boot({ path: '/tmp/dsh-probe.keychain', unlockPassword: 'pw', runner: fake.run })
    await ctx.credentials.set(REF, 'sk-alice', { userId: userId('alice') }) // item present
    fake.findCalls = 0 // isolate unset's find calls (set uses add-generic-password)
    await ctx.credentials.unset(REF, { userId: userId('alice') })
    // erc-3: unset must not run find-generic-password (which reads the secret value
    // via `-w`); delete-generic-password's not-found handling already covers
    // absence + TOCTOU, so the find preflight is redundant + leaks the secret.
    expect(fake.findCalls).toBe(0)
  })
})

describe('global writes delegate to the writable fallback (G3c decision A)', () => {
  it('lands a global set in the fallback layer, not in a per-user keychain slot, and fires a global event', async () => {
    const seed = new Map<string, string>()
    const fake = new FakeKeychain()
    const ctx = await boot({ path: '/tmp/dsh-probe.keychain', unlockPassword: 'pw', runner: fake.run, fallback: makeWritableFallback(seed) })
    const seen = events(ctx)

    await ctx.credentials.set(REF, 'sk-global')

    // The value lands in the writable global layer (the host's .credentials.yaml shim)…
    expect(seed.get(REF)).toBe('sk-global')
    expect(await ctx.credentials.resolve(REF)).toEqual({ value: 'sk-global', source: 'fallback' })
    // …and no per-user slot was written: alice reads the same global value through
    // the staged fallback, and her own slot still wins once she has one.
    expect(await ctx.credentials.resolve(REF, { userId: userId('alice') })).toEqual({ value: 'sk-global', source: 'fallback' })
    await ctx.credentials.set(REF, 'sk-alice', { userId: userId('alice') })
    expect(await ctx.credentials.resolve(REF, { userId: userId('alice') })).toEqual({ value: 'sk-alice', source: 'keychain' })
    expect(seed.get(REF)).toBe('sk-global')

    // The global write's event carries no address, so remote clients reload the
    // global surfaces; the per-user write that followed carries alice's.
    expect(seen).toEqual([{ ref: REF }, { ref: REF, address: 'alice' }])
    // Writability now reflects reality: a global set would succeed.
    expect(await ctx.credentials.describe(REF)).toEqual({ configured: true, source: 'fallback', writable: true })
  })

  it('notifies a global unset only when the fallback actually removed a value', async () => {
    const seed = new Map<string, string>([[REF, 'sk-global']])
    const fake = new FakeKeychain()
    // A global unset must never reach the keychain: a keychain delete would fault here.
    fake.deleteOutcome = { ok: false, stderr: 'delete must not be reached by a global unset', exitCode: 1 }
    const ctx = await boot({ path: '/tmp/dsh-probe.keychain', unlockPassword: 'pw', runner: fake.run, fallback: makeWritableFallback(seed) })
    const seen = events(ctx)

    await ctx.credentials.unset(REF)
    expect(seed.has(REF)).toBe(false)
    expect(await ctx.credentials.resolve(REF)).toBeUndefined()
    expect(seen).toEqual([{ ref: REF }])

    // Unsetting the now-absent global slot removes nothing → silent no-op, no second event.
    await expect(ctx.credentials.unset(REF)).resolves.toBeUndefined()
    expect(seen).toEqual([{ ref: REF }])
  })

  it('keeps a global set rejected and a global unset silent when the fallback is read-only', async () => {
    const seed = new Map<string, string>([[REF, 'sk-global']])
    const fake = new FakeKeychain()
    // makeFallback has no set/unset: the global layer is read-only here.
    const ctx = await boot({ path: '/tmp/dsh-probe.keychain', unlockPassword: 'pw', runner: fake.run, fallback: makeFallback(seed) })
    const seen = events(ctx)

    await expect(ctx.credentials.set(REF, 'sk-new')).rejects.toThrow(/provide a writable fallback for global sets/)
    await expect(ctx.credentials.unset(REF)).resolves.toBeUndefined()
    // Neither write touched the read-only layer, and neither emitted.
    expect(seed.get(REF)).toBe('sk-global')
    expect(seen).toEqual([])
  })
})

describe('record management is unsupported (the keychain is a ref-only PAT store)', () => {
  const KEY = credentialKey('qoder', 'oauth')

  it('reports every record slot absent and unwritable, and enumerates none', async () => {
    const fake = new FakeKeychain()
    const ctx = await boot({ path: '/tmp/dsh-probe.keychain', unlockPassword: 'pw', runner: fake.run })
    expect(await ctx.credentials.readRecord(KEY)).toBeUndefined()
    // writable: false is what routes a configuration surface's record writes to
    // the document-backed provider instead of here.
    expect(await ctx.credentials.describeRecord(KEY)).toEqual({ configured: false, writable: false })
    expect(await ctx.credentials.listRecords()).toEqual([])
  })

  it('refuses a record modification before running the mutator, so no rotation can look landed', async () => {
    const fake = new FakeKeychain()
    const ctx = await boot({ path: '/tmp/dsh-probe.keychain', unlockPassword: 'pw', runner: fake.run })
    let mutateCalls = 0
    const mutate = async (): Promise<CredentialRecord> => {
      mutateCalls++
      return { kind: 'grant', payload: { refreshToken: 'rt-1' } }
    }
    await expect(ctx.credentials.modifyRecord(KEY, mutate)).rejects.toThrow(/record modification is not supported/)
    // The read-modify-write never began: a caller cannot believe its rotation committed.
    expect(mutateCalls).toBe(0)
    // The record half stays empty and a delete of an absent record is a no-op.
    expect(await ctx.credentials.readRecord(KEY)).toBeUndefined()
    await expect(ctx.credentials.deleteRecord(KEY)).resolves.toBeUndefined()
    expect(await ctx.credentials.listRecords()).toEqual([])
  })
})

describe.skipIf(process.platform !== 'darwin' || !process.env.DSH_KEYCHAIN_LIVE)('live macOS keychain e2e (set DSH_KEYCHAIN_LIVE=1 on darwin)', () => {
  const SCRATCH = '/tmp/dsh-p12b-live.keychain'
  const PW = 'dsh-p12b-live-wipe-me'

  afterEach(async () => {
    await securityCli(['delete-keychain', SCRATCH]).catch(() => undefined)
    await rm(SCRATCH, { force: true })
  })

  it('round-trips a per-user PAT through the real security CLI on a scratch keychain', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(KeychainCredentialProvider, { path: SCRATCH, unlockPassword: PW, runner: securityCli })
    cleanups.push(async () => { await fiber.dispose() })
    await fiber

    await ctx.credentials.set(REF, 'sk-alice-live', { userId: userId('alice') })
    expect(await ctx.credentials.resolve(REF, { userId: userId('alice') })).toEqual({ value: 'sk-alice-live', source: 'keychain' })
    expect(await ctx.credentials.resolve(REF, { userId: userId('bob') })).toBeUndefined()
    expect(await ctx.credentials.describe(REF, { userId: userId('alice') })).toEqual({ configured: true, source: 'keychain', writable: true })

    await ctx.credentials.unset(REF, { userId: userId('alice') })
    expect(await ctx.credentials.resolve(REF, { userId: userId('alice') })).toBeUndefined()
  })
})
