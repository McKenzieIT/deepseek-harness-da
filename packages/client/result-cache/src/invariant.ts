/**
 * Package-owned invariant companion for
 * `@deepseek-ai/dsh-client-result-cache`.
 *
 * @module @deepseek-ai/dsh-client-result-cache/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-result-cache'

/** Cordis companion plugin name. */
export const name = 'client-result-cache-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the cache is internal session-scoped state over a
 * well-typed RPC seam — byte-bounded eviction, admission, and the
 * miss/not-found/error paths are all exercised directly by this package's
 * behavior specs. It owns no cross-plugin mutable relation; the single
 * `ctx.results` service name is reserved by the Cordis Service tracker, and
 * the `connection/reset` flush is a registration-time effect owned by the
 * runtime's event, not a relation this package must assert.
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
