# P9 prototype — admin harness app + access isolation (THROWAWAY)

> **Throwaway logic/state prototype.** Not production, not wired to real
> `ctx.webServer` / `ctx.storageDomain` / query sidecar / P12 keychain provider.
> Mirrors their *shapes* to validate the access-isolation state model. Run:
>
> ```
> node run.mjs
> ```
>
> One command, no npm deps (`node:crypto` only). All checks must pass.

## Question settled

Does the **single-link-single-scope + server-resolved-scope** state model
enforce isolation, fail-closed authz, revocation, and per-user PAT
orthogonality — given the standing constraints?

- **additive-only** (no core changes; admin is one additive plugin
  `@deepseek-ai/dsh-admin`).
- **reverse-bi read-only** (reimplement RBI's model in TS, don't modify RBI).
- **rbi-web out of scope** (no RBI HTTP gates to modify).
- **R6/G4 stdio sidecar**: `scope_id` is a da per-call *program arg*, not an
  HTTP `X-RBI-Scope` header — so there is no client-supplied scope to override.
- **intranet-security-first**: single trust boundary at the gate (the da→sidecar
  call point).

## The crux: "门覆盖 X-RBI-Scope" reinterpreted

The ticket/map wording came from the research note's *RBI-HTTP* frame (modify
rbi-web's `AgentGateAuth` to override the client header). Three constraints
make that literal frame impossible: rbi-web is out of scope, reverse-bi is
read-only, and R6/G4 route queries over stdio with `scope_id` as a program arg
(no `X-RBI-Scope` in the query path).

The harness-native equivalent — validated here — is **server-resolved scope by
construction**: the gate resolves `scope_id` from the link token (`AccessLink
→ scopeId`) and da passes it programmatically to the sidecar. The client
**never supplies scope**, so there is no header to override. This is *stronger*
than RBI's header-override (which left a self-reported-scope spoofing hole: one
shared Bearer token could read any scope) and gives a single trust boundary.

## What the prototype mirrors (shapes only)

| Concern | Real harness mechanism | Prototype stub |
|---|---|---|
| HTTP routes (gate + admin) | `ctx.webServer.register({kind,path,handler})` | inline `gateQuery` fn |
| Persistent tables | `ctx.storageDomain.open(defineDomain(spec))` + sqlite (`u_<unit>_<table>`) | in-mem `openDomain` Map-per-table |
| Lifecycle | `apply(ctx)` + `ctx.effect` / `Service` | n/a (no fiber) |
| Query sidecar | da raw SDK Client + stdio, `scope_id` per-call arg (R6/G4) | inline `sidecarExecute` (logs received `{scope_id, creds}`) |
| Per-user keychain (PAT) | P12 macOS Keychain via `security` CLI, at-rest encrypted | in-mem `keychain` map keyed by `(ref, userId)` |
| Password hash | bcrypt cost 12 (RBI) | scrypt (`node:crypto`, no dep) — same flow |

## Scenarios (all green = state model holds)

- **S1 issue + isolation + override-by-construction** — link bound to `scopeA`;
  client "requests" `scopeB`; server resolves `scopeA`; sidecar never sees
  `scopeB`. Client cannot escalate scope.
- **S2 revocation** — revoke link → next query denied (fail-closed, no long-TTL
  cache bypass); newly-issued link works.
- **S3 fail-closed authz branches** — unknown token, expired token, empty
  `allowedScopeIds`, inactive tenant, non-existent tenant, **db error** all →
  deny (never silently allow on unreadable auth data).
- **S4 per-user login + PAT self-service + at-rest** — bcrypt login; alice
  self-pastes her Qoder PAT into her per-user keychain slot; `resolve(ref,
  {userId})` returns it; bob cannot see alice's PAT (`{userId}⊥{scopeId}`); the
  PAT plaintext is **absent from the admin store** (at-rest; admin never touches
  the PAT — G3 red line), present only in the keychain seam.
- **S5 per-scope ODPS credential addressing (i)** — `OdpsConfig` is a
  **singleton** (access_id/access_key shared across scopes); per-scope
  difference is only region selecting project/endpoint. `set_credentials` shape
  `{scope_id, creds}` reaches the sidecar.
- **S6 TTL/expiry** — unexpired link works; expired link denied.

## Surfaced tensions / deferred (for the ticket backfill)

1. **OdpsConfig singleton — research note erratum.** Subagent ground-check
   confirmed `odps_config_service.py` docstring says "singleton row (id=1)";
   `access_id`/`access_key` are shared, per-scope difference is only
   `region`→project/endpoint. The existing
   `research/access-isolation-options.md` §1.2 ("per-scope because DB rows have
   domestic_*/overseas_* fields") is **factually wrong** and needs an erratum.
   Does not change the Option 1 conclusion.
2. **Per-scope credential addressing.** R6 says da per-call resolves 4 refs
   (`ODPS_ACCESS_ID/KEY/PROJECT/ENDPOINT`), but `OdpsConfig` is singleton with
   shared access_id/key. Prototype picks **(i)** global ref for access_id/key +
   per-scope project/endpoint by region (matches RBI singleton reality).
   Alternative **(ii)** per-scope 4-ref (admin pre-resolves into keychain by
   `{scopeId}`) is a **P9/P4b build-time** choice — flagged, not finalized
   here.
3. **P12 per-user keychain provider not yet in tree.** `credentials-local` is
   still the upstream single-doc provider (`set(ref,value)`, no `userId`). The
   PAT self-service surface is **delivery-sequenced after P12**; this prototype
   stubs the seam shape. P9 ships gate + scope/credential-ref/access-link/users
   /sys-config + login first; PAT self-service wires in post-P12.
4. **No login/session infra in harness.** `identity`=anonymous-user-id only;
   `session`=agent session log (not login). Per-user login is **net-new
   additive** (bcrypt + session token + `users` domain). The admin plugin
   self-manages a small auth subsystem (token rotation/expiry/CSRF) — a
   production-hardening ticket (akin to P12b) is likely.
5. **Single plugin, not split.** One `@deepseek-ai/dsh-admin` carries gate +
   admin + login (shared domain handle — duplicate `open` of the same domain is
   rejected; shared login state; webserver route table is a composition-level
   contract that throws on duplicate path; matches map ⑤e + the pre-scaffolded
   `id: admin` placeholder in `packages/bundle/data-agent/cordis.patch.yml`).

## Data model (faithful RBI reimplementation + net-new)

- `Tenant` — id/name/username(unique=login)/passwordHash/allowedScopeIds(JSON,
  default `[]`=deny)/isActive. admin = `username ∈ adminUsernameSet` (no role
  col).
- `ScopeRecord` — scopeId(PK `^[A-Za-z0-9_-]+$`)/name/region. No tenantId
  (mapping via `Tenant.allowedScopeIds`). Scope IS the game (ADR-0006
  migration #35 renamed game→scope).
- `OdpsConfig` — **singleton** (shared access_id/key + domestic*/overseas*).
- `AccessLink` (net-new) — linkToken/scopeId/ownerTenantId/isActive/expiresAt/
  revokedAt/rotatedFrom. Issue (shown once), revoke (fail-closed), TTL/rotation.
- `SystemConfig` (net-new singleton), `User`/`UserSession` (net-new login).
- per-user PAT — **not** a plaintext table; via P12 keychain `{userId}`.
