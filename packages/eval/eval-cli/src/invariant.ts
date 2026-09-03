/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-eval-cli`.
 * @module @deepseek-ai/dsh-eval-cli/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-eval-cli'

/** Cordis companion plugin name. */
export const name = 'eval-cli-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: eval-cli is a standalone eval driver — its invariants
 * live in the eval-runner scorer + health-gate it shells, not as a Cordis
 * companion observed at runtime.
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
