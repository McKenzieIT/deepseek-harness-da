/**
 * Client-safe type surface of the credential-reference seam: the reference
 * brand and the seam's Cordis event declaration. Types only — no runtime code,
 * and nothing here reaches a Host-only symbol, so a Client compilation face
 * reads exactly the signature the Host emits.
 *
 * @module @deepseek-ai/dsh-credentials/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Nominal reference to one credential: a POSIX-style environment-variable name. */
export type CredentialRef = Branded<'CredentialRef'>

/**
 * Optional per-operation addressing for a credential: which user or scope the
 * value is for. Absent for a global/shared credential — the flat namespace a
 * provider without richer addressing serves. `userId` and `scopeId` are
 * orthogonal: the same reference may resolve per-user (a personal PAT) and
 * per-scope (a per-game data credential) along independent dimensions, and a
 * provider that does not distinguish a dimension ignores it.
 *
 * The values are opaque to this seam; their format and provenance belong to
 * the identity and access-isolation layers (the web-login `Tenant` and the
 * per-game `scope_id`). Branding them as cross-boundary ids is deferred to the
 * production hardening of the per-user store.
 */
export interface CredentialAddress {
  /** Per-user slot key; absent for a global/shared credential. */
  readonly userId?: string
  /** Per-scope slot key, orthogonal to `userId`; absent for a cross-scope credential. */
  readonly scopeId?: string
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * Committed change to a provider-managed credential source: a `set`, an
     * `unset`, or an external edit observed in storage. Ambient
     * process-environment changes are not observable and never emit. Listener
     * failures are contained and logged — a sync throw and an async rejection
     * alike — without changing the committed operation's outcome, except
     * `INVARIANT`-coded failures, which rethrow after every listener ran;
     * that rethrow reaches the emitter only from synchronous listeners, so
     * invariant checks on this event must not be async functions.
     * @param ref - the reference whose stored value changed.
     * @param address - per-user/scope slot this change is scoped to; absent for a global/shared change.
     * @mode emit
     */
    'credentials/updated'(ref: CredentialRef, address?: CredentialAddress): void
  }
}
