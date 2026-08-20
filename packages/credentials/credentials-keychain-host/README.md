# @deepseek-ai/dsh-credentials-keychain-host

English | [中文](README.zh.md)

Mount face that registers `KeychainCredentialProvider` as `ctx.credentials`,
composing a plain writable file/env fallback (G3c global-writes gap, decision A).

## Why

`KeychainCredentialProvider` (P12b) has no Schemastery `Config` — its `runner`
and `fallback` are injectable — so it cannot be yml-mounted directly. This host
is the yml-mountable face: a function plugin that takes scalar config + an
injectable `runner`, resolves the unlock password, builds a plain `KeychainFallback`
shim over the credentials-local file/env layers, and programmaticaly
`ctx.plugin`s the keychain (which auto-registers as `ctx.credentials`).

## G3c global-writes gap (decision A)

P12b's `KeychainFallback` was read-only `{resolve, describe}`. Mounting the
keychain as `ctx.credentials` (replacing credentials-local) exposes a gap:
**global credential writes** (no `{ userId }` — e.g. the Models page storing
`DEEPSEEK_API_KEY`) need a writable layer, but `keychain set(no userId)` threw.
This host's shim is **writable** — it reuses credentials-local's
`parseCredentialsDocument` + `renderDocument` (comment-preserving) +
`writeFileAtomic` + `withFileLock` — and `keychain set(no userId)` delegates to
`fallback.set`. (`vendor/cordis/src/reflect.ts` `provide` throws on a same-name
second provider in one scope, so option C "keep base local + keychain composite"
is OUT — verified for G3c.)

## Bundle wiring (G3c)

The data-agent bundle disables base `credentials` (credentials-local) and mounts
this host as `credentials`, so the keychain is the single `ctx.credentials`
provider; the shim is a plain object (not a Service), so it does not
double-register.

```yaml
- id: credentials
  disabled: true   # disable base credentials-local (additive disable-only)
- insert:
    - id: credentials
      name: '@deepseek-ai/dsh-credentials-keychain-host'
      config:
        unlockPasswordSource: interactive   # interactive (default, secure) | env | none
        unlockPasswordEnv: DSH_KEYCHAIN_PW  # for 'env' (unattended, bash-readable — weakens lock)
        perUserFallbackRefs: []             # stable: per-user PAT required (early: omit = all fall back)
```

## unlockPassword source

- `interactive` (default): prompts stdin at boot (tty-only, best-effort — the
  secure option; a stored password is bash-readable per P12b's finding). Non-tty
  (launchd server) returns `undefined` → the keychain must be pre-created +
  already unlocked.
- `env`: reads `process.env[unlockPasswordEnv]` (unattended, but bash can read
  env — weakens the lock to convenience; documented).
- `none`: omits the password (pre-created + already-unlocked keychain).

P12c (native Security-framework binding + harness code-signing) is the real
runtime-exfil fix; this host lands what the security-CLI can do (at-rest +
locked-keychain + per-user CRUD + branding + writable global fallback).

## Known Limitations and Deferred Work

- **Runtime-exfil ACL** — per-item ACL restricting keychain reads to the harness binary (excluding bash/terminal) requires native Security-framework binding + Developer-ID code-signing. Deferred to P12c; the security-CLI cannot distinguish the spawner from the direct caller.
- **Multi-host KMS / central backend** — when multiple hosts need synchronized credentials, a central backend (KMS envelope / Vault transit) is required. Deferred pending multi-host deployment topology decisions.
- **Cross-platform support** — Linux (`libsecret`) and Windows (`CredManager`) credential stores are not implemented. macOS Keychain only. Deferred to P12c alongside native binding work.
