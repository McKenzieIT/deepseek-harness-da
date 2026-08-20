# @deepseek-ai/dsh-identity

Per-user caller identity seam (`ctx.identity`) for the DeepSeek Harness.

`ctx.identity.current()` resolves the caller a request acts for — which business
user (Qoder PAT authn), tenant, and scope (data isolation) — so per-user
credentials and per-user audit attribute to the right principal.

## Status: stub (T1 fallback)

The harness has no per-user login state yet (its only identity is an anonymous
install id, which is not per-user), so `current()` returns `undefined` today.
That keeps G3 stable's **opportunistic threading** a no-op now:

- **P3 `subagent-qoder`** calls `resolve(QODER_PERSONAL_ACCESS_TOKEN, { userId:
  ctx.identity.current()?.userId })`. With `userId` absent, the keychain
  provider resolves the T1 global PAT (the no-`userId`/fallback path) — no
  behavior change from the MVP.
- **P8b `audit`** `resolveIdentity()` reads `ctx.identity.current()` → `{}` →
  NULL user columns — the T1 fallback it already records.

P9's `@deepseek-ai/dsh-admin` lands the real per-user login and populates this
seam (override `current()` to return the logged-in caller + access-link-resolved
scope); the same `current()` call then attributes per-user. No P3/P8b change is
needed when that lands — the seam is the contract.

## Orthogonality (G3 decision 7)

`userId` (Qoder authn) and `scopeId` (data isolation) are independent
dimensions. The keychain provider serves only the `userId` dimension; per-scope
isolation lives at the query sidecar's `set_credentials`/`scope_id` and
`OdpsConfig` region — not through this seam's `scopeId` on `ctx.credentials`
today. `scopeId` is a forward-compat field, currently unused via `ctx.credentials`.
