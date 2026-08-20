/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-audit`.
 * @module @deepseek-ai/dsh-audit/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-audit'

/** Cordis companion plugin name. */
export const name = 'audit-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: schema-version consistency is an open-time check that
 * rejects before a store exists, and the ownership guard + append-only
 * immutability invariants are enforced inline by the store itself; this
 * package exposes no continuously observable in-process relation beyond its
 * own service.
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
