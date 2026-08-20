/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-retrieval`.
 * @module @deepseek-ai/dsh-retrieval/invariant
 */

/* jscpd:ignore-start -- deliberate symmetry with the credentials-local
   companion: this seam owns no lifecycle event contract; the hybrid
   retrieval + degradation behavior is pinned by the provider's unit suite. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-retrieval'

/** Cordis companion plugin name. */
export const name = 'retrieval-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: hybrid retrieval behavior is pinned by the provider's unit suite. */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
