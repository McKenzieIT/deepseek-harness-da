/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-result-cache-memory`.
 * @module @deepseek-ai/dsh-result-cache-memory/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-result-cache-memory'

export const name = 'result-cache-memory-invariant'
export const inject = ['invariants']

/**
 * No runtime invariant: the cache is a passive in-process store — `cr_` id
 * immutability is enforced inline by `put` (which throws on a conflicting
 * entry) and `qr_` overwrite is idempotent, so no continuously observable
 * in-process relation exists beyond the store's own `get`/`put`/`has`
 * semantics. This companion reserves the package's invariant slot only.
 */
const install: InvariantInstaller = () => {}

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
