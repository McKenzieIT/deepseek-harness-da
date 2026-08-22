/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-preset-autojoin`.
 *
 * @module @deepseek-ai/dsh-preset-autojoin/invariant
 */

/* jscpd:ignore-start -- deliberate symmetry with the identity/credentials
   companion no-op shape: this wrapper owns no lifecycle invariant today (it
   registers one `agent/created` listener whose join is idempotent and
   guarded), so the companion reserves the package's invariant slot without
   installing checks. The repo's test-invariants host requires every package
   whose tests mount it via `ctx.plugin` to carry this companion. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-preset-autojoin'

/** Cordis companion plugin name. */
export const name = 'preset-autojoin-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the wrapper's contract (idempotent guarded join on
 * `agent/created`) is enforced in `src/index.ts`, which also logs + re-throws
 * a mount failure so it surfaces at ERROR (the fire-and-forget dispatch's WARN
 * report is filtered at the default INFO threshold); a companion check would
 * only duplicate that. Reserved so the package owns its invariant slot for a
 * future composition contract.
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
