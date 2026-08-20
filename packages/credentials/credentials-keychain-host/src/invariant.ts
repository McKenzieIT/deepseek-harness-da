/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-credentials-keychain-host`.
 * @module @deepseek-ai/dsh-credentials-keychain-host/invariant
 */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-credentials-keychain-host'
export const name = 'credentials-keychain-host-invariant'
export const inject = ['invariants']

/** No runtime invariant: the host mounts the keychain (P12b owns its companion); reserves the package's invariant slot. */
const install: InvariantInstaller = () => {}

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
