/**
 * Per-user caller identity seam (`ctx.identity`). Resolves the current caller's
 * identity — which business user, tenant, and scope a request acts for — so
 * per-user credentials (the Qoder PAT) and per-user audit attribute to the
 * right principal.
 *
 * Today this is a stub: the harness has no per-user login state yet (its only
 * identity is an anonymous install id, which is not per-user), so
 * {@link IdentityService.current} returns `undefined`. That keeps G3 stable's
 * "opportunistic threading" a no-op now — P3's `resolve(ref, { userId })`
 * resolves the T1 global PAT (the keychain's no-`userId`/fallback path), and
 * P8b's audit records NULL user columns — and lets P9's `@deepseek-ai/dsh-admin`
 * land the real per-user login and populate this seam with a small additive
 * wire (override `current()` to return the logged-in caller), after which the
 * same `current()` call attributes per-user. The seam exists now so the
 * threading compiles and runs; P9b fills it.
 *
 * Orthogonality (G3 decision 7): `userId` (Qoder authn) and `scopeId` (data
 * isolation) are independent dimensions; the keychain provider serves only the
 * `userId` dimension, and per-scope isolation lives at the query sidecar's
 * `set_credentials`/scope_id and OdpsConfig region — never through this seam's
 * `scopeId` on `ctx.credentials` today.
 *
 * @module @deepseek-ai/dsh-identity
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { UserId, ScopeId } from '@deepseek-ai/dsh-credentials'

/** The current caller's identity; every field optional (T1 fallback: `undefined`). */
export interface CallerIdentity {
  /** Per-user slot key for a personal PAT (Qoder authn); absent for a global/anonymous caller. */
  readonly userId?: UserId
  /** Per-scope slot key (data isolation); absent for a cross-scope caller. */
  readonly scopeId?: ScopeId
  /** Tenant id (the web-login `Tenant`); absent for a global/anonymous caller. */
  readonly tenantId?: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    identity: IdentityService
  }
}

/**
 * Per-user caller identity service. The default implementation returns
 * `undefined` (the T1 fallback: no per-user login state yet); P9's admin
 * package overrides {@link current} to return the logged-in caller's identity,
 * after which per-user PAT resolution and audit attribute to that principal.
 */
export class IdentityService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'identity')
  }

  /**
   * The current caller's identity, or `undefined` while no per-user login state
   * is populated (the T1 fallback). P9 populates this from the web-login
   * `Tenant` and the access-link-resolved scope.
   * @returns the caller identity, or `undefined` for an anonymous/global caller.
   */
  current(): CallerIdentity | undefined {
    return undefined
  }
}

export default IdentityService
