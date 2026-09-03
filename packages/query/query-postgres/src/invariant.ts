/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-query-postgres`.
 * @module @deepseek-ai/dsh-query-postgres/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-query-postgres'

/** Cordis companion plugin name. */
export const name = 'query-postgres-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this is a GA-GT2-D4 engine-neutrality stub whose
 * seam operations (`execute`/`attach`/`cancel`/`getProgress`) throw
 * not-implemented; it contributes a Postgres dialect and exposes no
 * continuously observable in-process relation beyond that.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - plugin context carrying the invariant registry.
 * @returns the installed registration's disposer.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
