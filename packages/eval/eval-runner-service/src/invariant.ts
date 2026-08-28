/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-eval-runner-service`.
 * @module @deepseek-ai/dsh-eval-runner-service/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-eval-runner-service'

/** Cordis companion plugin name. */
export const name = 'eval-runner-service-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: eval-runner-service registers the evalRunner Service
 * (fiber-scoped, auto-disposed) and emits the evidence/eval-run-completed
 * event; it owns no additional persistent registry slot. The `invariants`
 * companion only reserves package ownership so a second mount of the same
 * package fails loud.
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
