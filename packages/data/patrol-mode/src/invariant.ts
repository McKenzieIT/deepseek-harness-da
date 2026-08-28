/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-patrol-mode`.
 * @module @deepseek-ai/dsh-patrol-mode/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-patrol-mode'

/** Cordis companion plugin name. */
export const name = 'patrol-mode-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: patrol-mode registers the patrol Service
 * (fiber-scoped, auto-disposed via the ctx.effect cleanup in the PatrolService
 * constructor) and emits patrol/* events; it owns no additional persistent
 * registry slot. The `invariants` companion only reserves package ownership so
 * a second mount of the same package fails loud.
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
