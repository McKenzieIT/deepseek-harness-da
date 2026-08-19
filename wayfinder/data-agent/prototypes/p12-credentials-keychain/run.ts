/**
 * PROTOTYPE — throwaway. P12: validates the macOS Keychain credential
 * provider + per-user addressing design (`ctx.credentials.resolve(ref,
 * { userId })`) on a single-Mac deployment, against a scratch keychain wiped
 * on exit. Not the production package — that lands with full tests/coverage
 * and the runtime-exfil ACL + multi-host KMS/Vault hardening in ticket P12b.
 *
 * Run:
 *   pnpm exec tsx wayfinder/data-agent/prototypes/p12-credentials-keychain/run.ts
 */
import { Context } from '@deepseek-ai/cordis'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, rm } from 'node:fs/promises'
import { credentialRef, CredentialProvider } from '../../../../packages/credentials/credentials/src/index.ts'
import type {
  CredentialAddress,
  CredentialInfo,
  CredentialRef,
  ResolvedCredential,
} from '../../../../packages/credentials/credentials/src/index.ts'

const exec = promisify(execFile)

const SCRATCH = '/tmp/dsh-p12-prototype.keychain'
const SCRATCH_PW = 'dsh-prototype-wipe-me'
const REF = credentialRef('QODER_PERSONAL_ACCESS_TOKEN')

const log = (label: string, value: unknown): void => {
  console.log(`  ${label} → ${JSON.stringify(value)}`)
}

/** A `security` CLI call returning stdout (trimmed), or `undefined` on a not-found miss. */
async function security(args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await exec('/usr/bin/security', args, { maxBuffer: 1 << 20 })
    return stdout.replace(/\n+$/, '')
  } catch {
    // `security` exits non-zero when an item is absent; that is a miss, not a failure.
    return undefined
  }
}

/** A minimal global/shared fallback: the early-phase T1 personal PAT shared across users. */
function makeGlobalFallback(seed: Map<string, string>) {
  return {
    async resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
      const value = seed.get(ref)
      return value === undefined ? undefined : { value, source: 'global' }
    },
    async describe(ref: CredentialRef): Promise<CredentialInfo> {
      return seed.has(ref)
        ? { configured: true, source: 'global', writable: true }
        : { configured: false, writable: true }
    },
  }
}

/**
 * macOS Keychain credential provider (prototype). Stores per-user values as
 * `(service=ref, account=userId)` generic-password items in a target keychain.
 * A global/shared credential (no `userId`) and a per-user miss both delegate to
 * a fallback provider — G3's staged fallback (no per-user PAT → global T1).
 * The keychain DB is encrypted at rest, so bash cannot `cat` or `grep` a
 * stored PAT off disk: the at-rest bar P12 requires.
 */
class KeychainCredentialProvider extends CredentialProvider {
  constructor(
    ctx: Context,
    private readonly config: { keychain: string; fallback: ReturnType<typeof makeGlobalFallback> },
  ) {
    super(ctx)
  }

  override async resolve(ref: CredentialRef, address?: CredentialAddress): Promise<ResolvedCredential | undefined> {
    const account = address?.userId
    if (account !== undefined) {
      const value = await security(['find-generic-password', '-a', account, '-s', ref, '-w', this.config.keychain])
      if (value !== undefined) return { value, source: 'keychain' }
    }
    // Per-user miss or no userId: fall back to the global/shared credential.
    return this.config.fallback.resolve(ref)
  }

  override async describe(ref: CredentialRef, address?: CredentialAddress): Promise<CredentialInfo> {
    const account = address?.userId
    if (account !== undefined) {
      const value = await security(['find-generic-password', '-a', account, '-s', ref, '-w', this.config.keychain])
      if (value !== undefined) return { configured: true, source: 'keychain', writable: true }
      return { configured: false, writable: true }
    }
    return this.config.fallback.describe(ref)
  }

  override async set(ref: CredentialRef, value: string, address?: CredentialAddress): Promise<void> {
    if (value.length === 0) throw new Error('keychain: an empty value cannot be stored; use unset')
    const account = address?.userId
    if (account === undefined) throw new Error('keychain: a per-user set requires { userId }; the global slot is the fallback provider')
    await security(['add-generic-password', '-U', '-a', account, '-s', ref, '-w', value, this.config.keychain])
    this.notifyUpdated(ref, address)
  }

  override async unset(ref: CredentialRef, address?: CredentialAddress): Promise<void> {
    const account = address?.userId
    if (account === undefined) return
    const before = await security(['find-generic-password', '-a', account, '-s', ref, '-w', this.config.keychain])
    if (before === undefined) return
    await security(['delete-generic-password', '-a', account, '-s', ref, this.config.keychain])
    this.notifyUpdated(ref, address)
  }
}

async function setupScratchKeychain(): Promise<void> {
  await rm(SCRATCH, { force: true })
  await security(['create-keychain', '-p', SCRATCH_PW, SCRATCH])
  await security(['unlock-keychain', '-p', SCRATCH_PW, SCRATCH])
}

async function deleteScratchKeychain(): Promise<void> {
  await security(['delete-keychain', SCRATCH])
  await rm(SCRATCH, { force: true })
}

async function main(): Promise<void> {
  const updates: Array<{ ref: CredentialRef; address?: CredentialAddress }> = []

  console.log('[1] scratch keychain (PROTOTYPE — wiped on exit):', SCRATCH)
  await setupScratchKeychain()

  const fallback = makeGlobalFallback(new Map([[REF, 'sk-t1-global-demo']]))
  const ctx = new Context()
  ctx.on('credentials/updated', (ref, address) => updates.push({ ref, address }))
  const fiber = ctx.plugin(KeychainCredentialProvider, { keychain: SCRATCH, fallback })
  await fiber

  console.log('[2] set REF for alice (per-user, self-service)')
  await ctx.credentials.set(REF, 'sk-alice-demo', { userId: 'alice' })

  console.log('[3] per-user resolves')
  log('resolve REF {alice}', await ctx.credentials.resolve(REF, { userId: 'alice' }))
  log('resolve REF {bob}  ', await ctx.credentials.resolve(REF, { userId: 'bob' }))
  log('resolve REF (global)', await ctx.credentials.resolve(REF))

  console.log('[4] describe per slot')
  log('describe REF {alice}', await ctx.credentials.describe(REF, { userId: 'alice' }))
  log('describe REF {bob}  ', await ctx.credentials.describe(REF, { userId: 'bob' }))

  console.log('[5] credentials/updated events (per-user granularity):')
  for (const event of updates) log('  event', event)

  console.log('[6] at-rest bar: the stored PAT is not greppable in the keychain DB')
  const db = await readFile(SCRATCH)
  log('keychain DB bytes', db.length)
  log("grep 'sk-alice-demo' in DB", db.includes('sk-alice-demo') ? 'FOUND (BAD)' : 'absent (good — encrypted at rest)')

  console.log('[7] unset REF for alice, then re-resolve (falls back to global)')
  await ctx.credentials.unset(REF, { userId: 'alice' })
  log('resolve REF {alice} after unset', await ctx.credentials.resolve(REF, { userId: 'alice' }))

  await fiber.dispose()
  await deleteScratchKeychain()
  console.log('[8] scratch keychain deleted; done.')
}

main().catch(async (error) => {
  console.error('PROTOTYPE FAILED:', error)
  await deleteScratchKeychain()
  process.exit(1)
})
