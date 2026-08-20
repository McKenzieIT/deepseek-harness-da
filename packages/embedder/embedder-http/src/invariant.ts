/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-embedder-http`.
 * @module @deepseek-ai/dsh-embedder-http/invariant
 */

/* jscpd:ignore-start -- deliberate symmetry with the credentials-local
   companion: the Service Definition companion owns any lifecycle contract;
   this provider's HTTP wire + InferenceError mapping is pinned by its unit
   suite (injectable fetch, no live port). */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-embedder-http'

/** Cordis companion plugin name. */
export const name = 'embedder-http-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: HTTP wire + InferenceError mapping pinned by the unit suite. */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
