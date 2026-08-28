/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-goal-eval-context`.
 * @module @deepseek-ai/dsh-goal-eval-context/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-goal-eval-context'

/** Cordis companion plugin name. */
export const name = 'goal-eval-context-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: goal-eval-context registers only a system-prompt
 * section + a goal/changed listener (both fiber-scoped, auto-disposed) and
 * owns no persistent registry slot. The `invariants` companion only
 * reserves package ownership so a second mount of the same package fails
 * loud.
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
