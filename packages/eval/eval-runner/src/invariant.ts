/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-eval-runner`.
 * @module @deepseek-ai/dsh-eval-runner/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-eval-runner'

/** Cordis companion plugin name. */
export const name = 'eval-runner-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: eval-runner is a batch evidence library (pass_k
 * scoring, result persistence, before/after delta comparison, health-gate,
 * infra-retry); its invariants are encoded in the scorer and health-gate
 * logic rather than observed at runtime as a Cordis companion.
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
