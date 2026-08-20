/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-identity`.
 * @module @deepseek-ai/dsh-identity/invariant
 */

/* jscpd:ignore-start -- deliberate symmetry with the credential provider companions:
   the Service Definition companion (dsh-credentials/invariant) owns the
   credentials/updated lifecycle contract; this identity seam owns no
   lifecycle invariant today (it is a stub P9 will populate), so it mirrors the
   no-op shape. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-identity'

/** Cordis companion plugin name. */
export const name = 'identity-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the identity seam is a stub (T1 fallback, `current()`
 * returns `undefined`); P9 lands the real per-user population. Reserved here
 * so the package owns its invariant slot for a future login-state contract.
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
