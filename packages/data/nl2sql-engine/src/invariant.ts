/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-nl2sql-engine`.
 * @module @deepseek-ai/dsh-nl2sql-engine/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-nl2sql-engine'

/** Cordis companion plugin name. */
export const name = 'nl2sql-engine-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: nl2sql-engine owns no persistent registry slot — its
 * state is the loaded per-engine conventions (immutable after `Service`
 * construction) and the standalone logic exports (`critiqueSql` / `buildPrompt`
 * / `Bm25Linker`). The `invariants` companion only reserves package ownership
 * so a second mount of the same package fails loud.
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
