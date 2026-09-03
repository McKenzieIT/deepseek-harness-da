/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-retrieval-experiment`.
 * @module @deepseek-ai/dsh-retrieval-experiment/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-retrieval-experiment'

/** Cordis companion plugin name. */
export const name = 'retrieval-experiment-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: retrieval-experiment is a gradient experiment library
 * (Level 0-3 graph snapshots, blending variants, precision@K / recall@K
 * harness); its invariants live in the experiment harness and metrics, not as
 * a Cordis companion observed at runtime.
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
