# @deepseek-ai/dsh-identity

English | [中文](README.zh.md)

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

## Known Limitations and Deferred Work

- **Stub implementation (T1 fallback)** — `current()` returns `undefined` today; no per-user login state exists in the harness. The only identity is an anonymous install id, which is not per-user.
- **Per-user login (P9)** — real per-user identity resolution requires `@deepseek-ai/dsh-admin` (P9) to land, which overrides `current()` with the logged-in caller + access-link-resolved scope.
- **`scopeId` unused** — the `scopeId` dimension on `ctx.credentials` is a forward-compat field with no current consumer; per-scope isolation is handled at the query sidecar level.
- **No multi-tenant isolation** — tenant-level isolation through this seam is not yet implemented; the seam carries `tenantId` as a placeholder for future G3 stable requirements.
