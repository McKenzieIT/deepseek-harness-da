/**
 * Type face of the forwarded-Host-event allowlist: the consumer key projection
 * and the selection seat it fills. The allowlist VALUE lives in
 * `./remote-events.ts`, keeping this module type-only per the package
 * convention; both compiler faces list both files, so the Host forwarding loop
 * and the consumer `ctx.remote.$on` key face read one declaration instead of
 * two copies that could drift.
 *
 * @module @deepseek-ai/dsh-api-remotes/types
 */

import type { API_REMOTE_FORWARDED_EVENTS } from './remote-events.ts'

/** Type projection of the allowlist; the consumer and the Host read this one. */
export type ApiRemoteForwardedEvent = typeof API_REMOTE_FORWARDED_EVENTS[number]

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteEventSelection extends Record<ApiRemoteForwardedEvent, true> {}
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * Emitted when an eval run finishes and every case is persisted, so the
     * evidence-query sidebar / dashboard can auto-refresh coverage and
     * pass-rate views without polling. Carries no payload — a listener that
     * needs the run id reads it from the eval store.
     *
     * @mode emit
     */
    'evidence/eval-run-completed'(): void
  }
}
