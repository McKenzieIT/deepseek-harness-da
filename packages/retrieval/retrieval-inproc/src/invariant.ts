/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-retrieval-inproc`.
 * @module @deepseek-ai/dsh-retrieval-inproc/invariant
 */

/* jscpd:ignore-start -- deliberate symmetry with the credentials-local
   companion: the Service Definition companion owns any lifecycle contract;
   this provider's hybrid + degradation behavior is pinned by its unit suite. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-retrieval-inproc'

/** Cordis companion plugin name. */
export const name = 'retrieval-inproc-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: hybrid + degradation behavior is pinned by the unit suite. */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
