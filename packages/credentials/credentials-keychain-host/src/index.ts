/**
 * Mount face that registers `KeychainCredentialProvider` as `ctx.credentials`,
 * composing a plain writable file/env fallback so global credentials stay
 * writable when the keychain replaces credentials-local (G3c global-writes
 * gap, decision A).
 *
 * The keychain provider has no Schemastery `Config` (its `runner`/`fallback`
 * are injectable), so it cannot be yml-mounted directly. This host is the
 * mountable face: a function plugin (`apply(ctx, config)`) that takes scalar
 * config + an injectable `runner` (default `securityCli`; tests pass a fake),
 * resolves the unlock password per its source, builds a plain `KeychainFallback`
 * shim over the credentials-local file+env layers (reusing `parseCredentialsDocument`
 * + `renderDocument` + `writeFileAtomic` + `withFileLock` + `assertOwnerOnly`),
 * and programmaticaly `ctx.plugin`s the `KeychainCredentialProvider`, which
 * auto-registers as `ctx.credentials`.
 *
 * The data-agent bundle disables base `credentials` (credentials-local) and
 * mounts this host as `credentials`, so the keychain is the single
 * `ctx.credentials` provider; the shim is a plain object (not a Service), so it
 * does not double-register (`vendor/cordis/src/reflect.ts` `provide` throws on
 * a same-name second provider in one scope — verified for G3b/G3c).
 *
 * @module @deepseek-ai/dsh-credentials-keychain-host
 */

import type { Context } from '@deepseek-ai/cordis'
import { readSync } from 'node:fs'
import { readFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { credentialRef, type CredentialInfo, type CredentialRef, type ResolvedCredential } from '@deepseek-ai/dsh-credentials'
import {
  KeychainCredentialProvider,
  securityCli,
  type KeychainFallback,
  type SecurityRunner,
} from '@deepseek-ai/dsh-credentials-keychain'
import {
  assertOwnerOnly,
  parseCredentialsDocument,
  renderDocument,
  resolveSpec as resolveLocalSpec,
} from '@deepseek-ai/dsh-credentials-local'

export const name = 'credentials-keychain-host'
export const inject: readonly string[] = []

/** Deployment config: keychain location/lock policy, unlock-password source, fallback refs, injectable runner. */
export interface HostConfig {
  /** Filesystem path to the keychain store, forwarded to `KeychainCredentialProvider` when set. */
  readonly path?: string
  /**
   * DSH home directory used to resolve the keychain store path when `path` is
   * unset; forwarded to `KeychainCredentialProvider` when set.
   */
  readonly dshHome?: string
  /** Seconds of keychain inactivity after which the store auto-locks (re-encrypts); forwarded to `KeychainCredentialProvider` when set. */
  readonly autoLockSeconds?: number
  /** Whether to lock the keychain on system sleep/suspend; forwarded to `KeychainCredentialProvider` when set. */
  readonly lockOnSleep?: boolean
  /** unlock password source: interactive (default, tty stdin, non-tty→undefined) | env | none. */
  readonly unlockPasswordSource?: 'interactive' | 'env' | 'none'
  /** Name of the environment variable holding the keychain unlock password (required when `unlockPasswordSource` is `'env'`). */
  readonly unlockPasswordEnv?: string
  /** refs eligible for per-user→global fallback; undefined=early(all), list=stable(gated). */
  readonly perUserFallbackRefs?: readonly string[]
  /** Filesystem path to the credentials-local fallback file, overriding the default `.credentials.yaml` location. */
  readonly credentialsPath?: string
  /** DSH home directory used to resolve the credentials-local fallback file path when `credentialsPath` is unset. */
  readonly credentialsDshHome?: string
  /** Injectable `security` runner; default `securityCli`, a fake in tests. */
  readonly runner?: SecurityRunner
}

function isENOENT(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

function readInteractivePassword(): string | undefined {
  const stdin = process.stdin as NodeJS.ReadStream & { isTTY?: boolean }
  if (!stdin.isTTY) return undefined
  process.stderr.write('credentials-keychain-host: enter keychain unlock password: ')
  const buf = Buffer.alloc(512)
  try {
    const n = readSync(0, buf, 0, buf.length, null)
    if (n <= 0) return undefined
    return buf.toString('utf8', 0, n).replace(/\r?\n$/, '')
  } catch {
    // readSync on a tty stdin can only throw on a closed/EINTR/EAGAIN stdin;
    // the isTTY gate above excludes non-tty, so nothing else reaches here —
    // treat as 'no password entered'.
    return undefined
  }
}

function resolveUnlockPassword(config: HostConfig): string | undefined {
  const source = config.unlockPasswordSource ?? 'interactive'
  if (source === 'none') return undefined
  if (source === 'env') {
    const v = config.unlockPasswordEnv
    if (v === undefined) {
      throw new Error('credentials-keychain-host: unlockPasswordSource:env requires unlockPasswordEnv (the env var name)')
    }
    return process.env[v]
  }
  return readInteractivePassword()
}

/**
 * Plain `KeychainFallback` over the credentials-local file+env layers. Not a
 * Service, so it does not double-register `ctx.credentials`. The read path
 * caches the parsed file; writes invalidate + refresh the cache. Mirrors
 * credentials-local's `assertOwnerOnly` mode guard + env-shadow refusal.
 *
 * erc-5 (documented limitation): unlike credentials-local (which installs a
 * chokidar watcher for hot-publish of external edits + re-runs assertOwnerOnly
 * on every change), this fallback sets `watch: false` + installs NO watcher:
 *  (1) an external edit to `.credentials.yaml` (by another process or the user)
 *      stays stale in `cache` until the next set/unset on THIS provider refreshes
 *      it — restart the host to pick up external edits;
 *  (2) `assertOwnerOnly` (the 0600 mode guard) runs only on first load + on
 *      writes, NOT on cached reads between writes — a mode loosened by an
 *      external editor is caught only on the next write, not the next read.
 * The env/dotenv layers stay live (re-read each resolve); only the FILE layer
 * is cached once. Install a chokidar watcher mirroring credentials-local's
 * awaitWriteFinish + queueRefresh + reconcileFromDisk to restore hot-publish +
 * per-read mode guard (follow-up — the fallback is a plain object with no ctx,
 * so it can invalidate the cache but cannot publish changed refs on its own).
 */
function makeFileFallback(ctx: Context, config: HostConfig): KeychainFallback {
  const filename = resolveLocalSpec({
    watch: false,
    ...(config.credentialsPath !== undefined ? { path: config.credentialsPath } : {}),
    ...(config.credentialsDshHome !== undefined ? { dshHome: config.credentialsDshHome } : {}),
  }).filename
  let cache: Map<string, string> | undefined

  async function load(): Promise<Map<string, string>> {
    if (cache !== undefined) return cache
    // Reject a group/other-readable .credentials.yaml before serving any secret (mirror
    // credentials-local's mode guard; assertOwnerOnly no-ops on an absent file).
    await assertOwnerOnly(filename)
    try {
      const text = await readFile(filename, 'utf8')
      cache = parseCredentialsDocument(text, filename)
    } catch (error) {
      if (!isENOENT(error)) throw error
      cache = new Map()
    }
    return cache
  }

  return {
    async resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
      const env = launchEnvironmentOf(ctx).getFrom(ref, ['process'])
      if (env !== undefined && env.value.length > 0) return { value: env.value, source: 'env' }
      const stored = (await load()).get(ref)
      if (stored !== undefined) return { value: stored, source: 'file' }
      const dotenv = launchEnvironmentOf(ctx).getFrom(ref, ['project-env', 'user-env'])
      if (dotenv !== undefined && dotenv.value.length > 0) return { value: dotenv.value, source: dotenv.source }
      return undefined
    },
    async describe(ref: CredentialRef): Promise<CredentialInfo> {
      const env = launchEnvironmentOf(ctx).getFrom(ref, ['process'])
      if (env !== undefined && env.value.length > 0) return { configured: true, source: 'env', writable: false }
      const stored = (await load()).get(ref)
      if (stored !== undefined) return { configured: true, source: 'file', writable: true }
      const dotenv = launchEnvironmentOf(ctx).getFrom(ref, ['project-env', 'user-env'])
      if (dotenv !== undefined && dotenv.value.length > 0) return { configured: true, source: dotenv.source, writable: true }
      return { configured: false, writable: true }
    },
    async set(ref: CredentialRef, value: string): Promise<void> {
      if (value.length === 0) {
        throw new Error(`credentials-keychain-host: an empty value cannot be stored for "${ref}"; use unset`)
      }
      // Mirror credentials-local: a write shadowed by the inherited env would appear
      // to succeed while resolve keeps returning the env value.
      const env = launchEnvironmentOf(ctx).getFrom(ref, ['process'])
      if (env !== undefined && env.value.length > 0) {
        throw new Error(
          `credentials-keychain-host: "${ref}" is supplied read-only by the launching environment; unset it in the shell before storing`,
        )
      }
      await withFileLock(filename, async () => {
        // Re-check the mode before every write (an external editor or restored backup can
        // loosen it after boot), mirroring credentials-local.
        await assertOwnerOnly(filename)
        let text: string | undefined
        try {
          text = await readFile(filename, 'utf8')
        } catch (error) {
          if (!isENOENT(error)) throw error
          text = undefined
        }
        const nextText = renderDocument(text, ref, value)
        await mkdir(dirname(filename), { recursive: true, mode: 0o700 })
        await writeFileAtomic(filename, nextText, { mode: 0o600, dirMode: 0o700 })
        cache = parseCredentialsDocument(nextText, filename)
      })
    },
    async unset(ref: CredentialRef): Promise<boolean> {
      // Mirror credentials-local: unsetting a ref the env shadows is an apparent no-op.
      const env = launchEnvironmentOf(ctx).getFrom(ref, ['process'])
      if (env !== undefined && env.value.length > 0) {
        throw new Error(
          `credentials-keychain-host: "${ref}" is supplied read-only by the launching environment; unset it in the shell before removing`,
        )
      }
      let removed = false
      await withFileLock(filename, async () => {
        await assertOwnerOnly(filename)
        let text: string | undefined
        try {
          text = await readFile(filename, 'utf8')
        } catch (error) {
          if (!isENOENT(error)) throw error
          text = undefined
        }
        const current = text === undefined ? new Map<string, string>() : parseCredentialsDocument(text, filename)
        if (!current.has(ref)) {
          cache = current
          return
        }
        const nextText = renderDocument(text, ref, undefined)
        await writeFileAtomic(filename, nextText, { mode: 0o600, dirMode: 0o700 })
        cache = parseCredentialsDocument(nextText, filename)
        removed = true
      })
      return removed
    },
  }
}

/**
 * Mount `KeychainCredentialProvider` as `ctx.credentials` with a writable
 * file/env fallback (G3c global-writes gap, decision A). The data-agent
 * bundle disables base `credentials` and mounts this host as `credentials`.
 */
export async function apply(ctx: Context, config: HostConfig = {}): Promise<void> {
  const unlockPassword = resolveUnlockPassword(config)
  const fallback = makeFileFallback(ctx, config)
  const perUserFallbackRefs = config.perUserFallbackRefs === undefined
    ? undefined
    : new Set(config.perUserFallbackRefs.map(r => credentialRef(r)))
  // Await the keychain fiber so its [Service.init] (create/unlock/lock-policy)
  // completes before dependents use ctx.credentials.
  await ctx.plugin(KeychainCredentialProvider, {
    ...(config.path !== undefined ? { path: config.path } : {}),
    ...(config.dshHome !== undefined ? { dshHome: config.dshHome } : {}),
    ...(config.autoLockSeconds !== undefined ? { autoLockSeconds: config.autoLockSeconds } : {}),
    ...(config.lockOnSleep !== undefined ? { lockOnSleep: config.lockOnSleep } : {}),
    ...(unlockPassword !== undefined ? { unlockPassword } : {}),
    fallback,
    ...(perUserFallbackRefs !== undefined ? { perUserFallbackRefs } : {}),
    runner: config.runner ?? securityCli,
  })
}
