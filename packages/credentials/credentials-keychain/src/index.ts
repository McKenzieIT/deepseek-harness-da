/**
 * macOS Keychain credentials provider over an independent (non-login)
 * keychain, addressed per-user by `account=userId`. Layered against an
 * injectable global/shared fallback for the G3 staged fallback (a per-user
 * miss, or a global resolve with no `userId`, falls through to the early
 * global T1 PAT).
 *
 * ```text
 * per-user keychain item (service=ref, account=userId)   (provider-managed, writable)
 * > global/shared fallback                                (read-only here, e.g. credentials-local)
 * ```
 *
 * The keychain database is encrypted at rest, so a process that reads the
 * keychain file off disk (`cat`, `grep`) sees ciphertext, not the PAT — the
 * at-rest bar `packages/credentials/credentials-local` reserves for an
 * OS-keychain provider. An independent keychain with a short auto-lock and
 * lock-on-sleep, locked again on the harness's own teardown, narrows the
 * runtime-exfiltration window: while the keychain is locked, no process — not
 * the harness, not bash — can read an item without the unlock password.
 *
 * That is an at-rest and when-locked enhancement, not a per-item ACL. Once the
 * harness unlocks the keychain at startup so it can resolve PATs, any process
 * running as the same user (including the agent's `bash`) can spawn
 * `security find-generic-password -w` to read an item: macOS evaluates the
 * calling process (`/usr/bin/security`, Apple-signed) as the accessor — not
 * its spawner — so a `security`-CLI-based provider cannot distinguish the
 * harness from bash. Per-item Touch-ID ACL (reads restricted to the harness
 * binary, excluding bash/terminal) needs a native Security-framework binding
 * (the harness calls `SecItemCopyMatching` directly) plus a Developer-ID-signed
 * harness binary — a distribution-layer concern, deferred to ticket P12c. See
 * `wayfinder/data-agent/research/p12b-keychain-acl-feasibility.md`.
 *
 * @module @deepseek-ai/dsh-credentials-keychain
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type {
  CredentialAddress,
  CredentialInfo,
  CredentialRef,
  ResolvedCredential,
  UserId,
} from '@deepseek-ai/dsh-credentials'

const exec = promisify(execFile)

/** Basename of the keychain inside the harness home when no path is configured. */
export const KEYCHAIN_FILENAME = 'credentials.keychain'

/**
 * One `security` CLI run: success carries stdout; a non-zero exit carries
 * stderr and the exit code so the caller can tell a not-found miss from a fault.
 */
export type SecurityResult = { ok: true; stdout: string } | { ok: false; stderr: string; exitCode: number }

/**
 * Injectable `security` CLI runner. Production uses the real `/usr/bin/security`
 * spawn; unit tests inject a fake that simulates the keychain without macOS.
 */
export type SecurityRunner = (args: string[]) => Promise<SecurityResult>

/**
 * Read-only global/shared fallback for per-user misses and global resolves
 * (G3 staged fallback: no per-user PAT → the early global T1). Provided
 * programmatically by the deployment; absent makes misses resolve to `undefined`.
 */
export interface KeychainFallback {
  resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined>
  describe(ref: CredentialRef): Promise<CredentialInfo>
}

/** Plugin config: keychain location, lock policy, startup unlock, fallback, runner. */
export interface Config {
  /** Keychain path; defaults to `credentials.keychain` under the harness home. */
  path?: string
  /** Harness home used when `path` is omitted; defaults to `$DSH_HOME` or `~/.dsh`. */
  dshHome?: string
  /**
   * Password that creates and unlocks the keychain at startup. Required to
   * create a new keychain or to auto-unlock an existing locked one; a
   * pre-created, already-unlocked keychain can omit it. The password is a new
   * secret-to-protect: interactive entry at startup is secure, while a password
   * stored where bash can read it weakens the lock to convenience.
   */
  unlockPassword?: string
  /** Auto-lock the keychain after N seconds idle; 0 disables. Defaults to 300. */
  autoLockSeconds?: number
  /** Lock the keychain on sleep; defaults to true. */
  lockOnSleep?: boolean
  /** Global/shared fallback for per-user misses and global resolves. */
  fallback?: KeychainFallback
  /** Injectable `security` runner: the real `/usr/bin/security` spawn (exported as
   * {@link securityCli}) in production and the live macOS e2e, a fake in unit tests. */
  runner: SecurityRunner
}

/** Fully resolved provider parameters; defaulting happens here, never inline. */
export interface ResolvedSpec {
  keychain: string
  autoLockSeconds: number
  lockOnSleep: boolean
}

/**
 * Resolve the runtime spec from plugin config: an explicit `path` wins,
 * otherwise the keychain lives at `<harness home>/credentials.keychain`.
 * @param config - raw plugin config.
 * @returns the resolved keychain location and lock policy.
 */
export function resolveSpec(config: Config): ResolvedSpec {
  return {
    keychain: config.path ?? join(resolveDshHome(config.dshHome), KEYCHAIN_FILENAME),
    autoLockSeconds: config.autoLockSeconds ?? 300,
    lockOnSleep: config.lockOnSleep ?? true,
  }
}

/** Whether a `security` failure means the item is absent, so a find is a miss rather than a fault. */
function isItemNotFound(stderr: string): boolean {
  return /could not be found|not be found in the keychain|errSecItemNotFound/i.test(stderr)
}

/**
 * The real `security` CLI spawn. macOS-only (`/usr/bin/security` exists only on
 * darwin), so this is exercised by the live macOS e2e — which self-skips off
 * darwin — and excluded from non-mac CI coverage; unit tests inject a fake runner.
 */
/* v8 ignore start -- macOS live e2e covers this; non-mac CI has no /usr/bin/security, and unit tests inject a runner. */
export async function securityCli(args: string[]): Promise<SecurityResult> {
  try {
    const { stdout } = await exec('/usr/bin/security', args, { maxBuffer: 1 << 20 })
    return { ok: true, stdout }
  } catch (error) {
    const e = error as { stderr?: string; code?: number }
    if (typeof e.stderr === 'string') return { ok: false, stderr: e.stderr, exitCode: e.code ?? 1 }
    throw error
  }
}
/* v8 ignore stop */

/** macOS Keychain credentials provider (independent locked keychain, per-user addressing). */
export class KeychainCredentialProvider extends CredentialProvider {
  private readonly spec: ResolvedSpec
  private readonly runner: SecurityRunner
  private readonly fallback: KeychainFallback | undefined
  private readonly unlockPassword: string | undefined

  constructor(ctx: Context, public config: Config) {
    super(ctx)
    this.spec = resolveSpec(config)
    this.runner = config.runner
    this.fallback = config.fallback
    this.unlockPassword = config.unlockPassword
  }

  async*[Service.init](): AsyncGenerator<() => Promise<void> | void, void, void> {
    await this.ensureKeychain()
    yield async () => {
      // Teardown: lock the keychain so it is at-rest while the harness is down.
      await this.lockAtRest()
    }
  }

  /**
   * Best-effort lock on teardown. A failure (already locked, keychain removed,
   * or the context tearing down) is not fatal to disposal and there is no
   * further consumer to surface it to, so it is only warned.
   */
  private async lockAtRest(): Promise<void> {
    try {
      const result = await this.runner(['lock-keychain', this.spec.keychain])
      if (!result.ok) {
        this.ctx.logger.warn('credentials-keychain: lock-keychain at dispose failed: %s', result.stderr)
      }
    } catch (error) {
      // lock-keychain at dispose threw (already locked, keychain removed, or
      // ctx tearing down): not fatal to disposal, no further consumer to warn.
      this.ctx.logger.warn('credentials-keychain: lock-keychain at dispose threw', error)
    }
  }

  /** Ensure the keychain exists, carries the configured lock policy, and is unlocked for this process. */
  private async ensureKeychain(): Promise<void> {
    const probe = await this.runner(['show-keychain-info', this.spec.keychain])
    if (!probe.ok) {
      if (this.unlockPassword === undefined) {
        throw new Error(`credentials-keychain: cannot create ${this.spec.keychain}; supply unlockPassword or pre-create the keychain`)
      }
      const created = await this.runner(['create-keychain', '-p', this.unlockPassword, this.spec.keychain])
      if (!created.ok) throw new Error(`credentials-keychain: create-keychain failed: ${created.stderr}`)
    }
    const settings = ['set-keychain-settings', '-u']
    if (this.spec.autoLockSeconds > 0) settings.push('-t', String(this.spec.autoLockSeconds))
    if (this.spec.lockOnSleep) settings.push('-l')
    settings.push(this.spec.keychain)
    const applied = await this.runner(settings)
    if (!applied.ok) throw new Error(`credentials-keychain: set-keychain-settings failed: ${applied.stderr}`)
    if (this.unlockPassword !== undefined) {
      const unlocked = await this.runner(['unlock-keychain', '-p', this.unlockPassword, this.spec.keychain])
      if (!unlocked.ok) throw new Error(`credentials-keychain: unlock-keychain failed: ${unlocked.stderr}`)
    }
  }

  override async resolve(ref: CredentialRef, address?: CredentialAddress): Promise<ResolvedCredential | undefined> {
    const account = address?.userId
    if (account === undefined) return this.fallback?.resolve(ref)
    const value = await this.find(ref, account)
    if (value !== undefined) return { value, source: 'keychain' }
    return this.fallback?.resolve(ref)
  }

  override async describe(ref: CredentialRef, address?: CredentialAddress): Promise<CredentialInfo> {
    const account = address?.userId
    if (account === undefined) return this.fallback?.describe(ref) ?? { configured: false, writable: true }
    const value = await this.find(ref, account)
    if (value !== undefined) return { configured: true, source: 'keychain', writable: true }
    return this.fallback?.describe(ref) ?? { configured: false, writable: true }
  }

  override async set(ref: CredentialRef, value: string, address?: CredentialAddress): Promise<void> {
    if (value.length === 0) throw new Error(`credentials-keychain: an empty value cannot be stored for "${ref}"; use unset`)
    const account = address?.userId
    if (account === undefined) throw new Error('credentials-keychain: a per-user set requires { userId }; the global slot is the fallback provider')
    const added = await this.runner(['add-generic-password', '-U', '-a', account, '-s', ref, '-w', value, this.spec.keychain])
    if (!added.ok) throw new Error(`credentials-keychain: add-generic-password for "${ref}"/${account} failed: ${added.stderr}`)
    this.notifyUpdated(ref, address)
  }

  override async unset(ref: CredentialRef, address?: CredentialAddress): Promise<void> {
    const account = address?.userId
    if (account === undefined) return
    const before = await this.find(ref, account)
    if (before === undefined) return
    const removed = await this.runner(['delete-generic-password', '-a', account, '-s', ref, this.spec.keychain])
    if (!removed.ok) throw new Error(`credentials-keychain: delete-generic-password for "${ref}"/${account} failed: ${removed.stderr}`)
    this.notifyUpdated(ref, address)
  }

  /** Read one per-user item: the value on a hit, `undefined` on a not-found miss, throws on a real fault. */
  private async find(ref: CredentialRef, account: UserId): Promise<string | undefined> {
    const result = await this.runner(['find-generic-password', '-a', account, '-s', ref, '-w', this.spec.keychain])
    if (result.ok) return result.stdout.replace(/\n+$/, '')
    if (isItemNotFound(result.stderr)) return undefined
    throw new Error(`credentials-keychain: find-generic-password for "${ref}"/${account} failed: ${result.stderr}`)
  }
}
