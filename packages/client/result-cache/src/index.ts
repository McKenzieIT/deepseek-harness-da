/**
 * Host node half. The result cache is a browser-only service: it holds a
 * session-scoped hot cache over the `result.get` RPC and never runs on the
 * host (the host already owns the authoritative `ctx.resultCache` store).
 * No host-side registration belongs here.
 *
 * @module @deepseek-ai/dsh-client-result-cache
 */

/** Host plugin body — intentionally empty (browser-only capability). */
export function apply(): void {}
