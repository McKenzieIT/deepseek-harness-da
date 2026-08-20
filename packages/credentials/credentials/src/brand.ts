/**
 * dsh-credentials' owned branded ids: the per-user and per-scope slot keys of
 * a {@link CredentialAddress}. The `Branded<B>` primitive itself lives in
 * `@deepseek-ai/dsh-brand` (a zero-dependency, type-only package) so this seam
 * brands its cross-boundary slot keys without a runtime dependency beyond the
 * primitive; see that package's README for the nominal-typing policy.
 *
 * The values are opaque to this seam — their format and provenance belong to
 * the identity and access-isolation layers (the web-login `Tenant` for
 * `userId`, the per-game `scope_id` for `scopeId`) — so the factories perform
 * a plain cast with no validation, mirroring the seam's own {@link credentialRef}
 * factory rather than the validating POSIX-identifier factories of other owners.
 *
 * @module @deepseek-ai/dsh-credentials/brand
 */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Opaque per-user slot key; absent for a global/shared credential. */
export type UserId = Branded<'UserId'>

/**
 * Brand a per-user slot key.
 * @param id - the opaque user identifier from the identity layer.
 * @returns the same string, branded; no validation is performed.
 */
export function userId(id: string): UserId {
  return id as UserId
}

/** Opaque per-scope slot key, orthogonal to `userId`; absent for a cross-scope credential. */
export type ScopeId = Branded<'ScopeId'>

/**
 * Brand a per-scope slot key.
 * @param id - the opaque scope identifier from the access-isolation layer.
 * @returns the same string, branded; no validation is performed.
 */
export function scopeId(id: string): ScopeId {
  return id as ScopeId
}
