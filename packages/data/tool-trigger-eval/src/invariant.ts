/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-tool-trigger-eval`.
 * @module @deepseek-ai/dsh-tool-trigger-eval/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-tool-trigger-eval'

/** Cordis companion plugin name. */
export const name = 'tool-trigger-eval-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: tool-trigger-eval registers only the trigger_eval tool
 * (fiber-scoped, auto-disposed) and owns no persistent registry slot. The
 * `invariants` companion only reserves package ownership so a second mount of
 * the same package fails loud.
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
