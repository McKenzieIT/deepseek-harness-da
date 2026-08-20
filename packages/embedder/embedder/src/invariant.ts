/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-embedder`.
 * @module @deepseek-ai/dsh-embedder/invariant
 */

/* jscpd:ignore-start -- deliberate symmetry with the credentials-local
   companion: this seam owns no lifecycle event contract (the
   credentials seam companion owns `credentials/updated`); the embedder
   seam's provider behavior is pinned by its unit suite, so the companion
   reserves package ownership with a no-op installer. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-embedder'

/** Cordis companion plugin name. */
export const name = 'embedder-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the embedder seam owns no lifecycle event contract;
 * provider behavior (FakeHash determinism, Infinity HTTP wire, InferenceError
 * degradation) is pinned by each provider's unit suite.
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
