/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-credentials-keychain`.
 * @module @deepseek-ai/dsh-credentials-keychain/invariant
 */

/* jscpd:ignore-start -- deliberate symmetry with credentials-local's companion:
   the Service Definition companion (dsh-credentials/invariant) owns the
   credentials/updated lifecycle contract; this provider mirrors the no-op shape. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-credentials-keychain'

/** Cordis companion plugin name. */
export const name = 'credentials-keychain-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the Service Definition companion (`dsh-credentials/invariant`) owns the
 * `credentials/updated` lifecycle contract; this provider's keychain/`security`-CLI behavior is
 * asynchronous I/O pinned by its unit suite, and the runtime-exfil ACL gap is documented
 * (deferred to ticket P12c), not asserted.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
