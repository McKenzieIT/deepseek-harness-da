# p12-credentials-keychain — PROTOTYPE (throwaway)

> **PROTOTYPE — wipe me.** Not the production package. Validates the P12
> design (macOS Keychain credential provider + per-user addressing
> `ctx.credentials.resolve(ref, { userId })`) on a single-Mac deployment
> against a scratch keychain deleted on exit. The production package — with
> full tests/coverage, cross-platform backends, and the runtime-exfil ACL +
> multi-host KMS/Vault hardening — lands in ticket **P12b**.

## Run

```sh
pnpm exec tsx wayfinder/data-agent/prototypes/p12-credentials-keychain/run.ts
```

Runs only on macOS (shells out to `/usr/bin/security`). Creates and deletes a
scratch keychain at `/tmp/dsh-p12-prototype.keychain`; writes only demo
values, never a real PAT.

## What it validates

1. Per-user keychain CRUD: `set(ref, value, { userId })` → `(service=ref,
   account=userId)` generic-password item; `resolve`/`describe`/`unset` per-user.
2. Per-user isolation: alice's PAT is invisible to bob's slot and to the
   global slot.
3. G3 staged fallback: a per-user miss (bob has no PAT) resolves to the
   global T1 PAT via the fallback provider; the global slot coexists.
4. `credentials/updated` carries the per-user `address` (per-user granularity).
5. **At-rest bar**: the stored PAT is not greppable in the keychain DB on disk
   — bash `cat`/`grep` cannot read it at rest, the bar
   `packages/credentials/credentials-local` reserves for a keychain provider.

## What it does NOT do (deferred to P12b)

- Runtime-exfil hardening: per-item ACLs restricting reads to the harness
  binary (code-signing) so the agent's `bash`/`terminal` cannot query the
  keychain at runtime; a separate locked keychain + interactive/Touch-ID unlock.
- Cross-platform backends (libsecret on Linux, Windows Credential Manager) and
  central KMS/Vault for multi-host deployments.
- The real `@deepseek-ai/dsh-credentials-keychain` package with the repo's
  per-file 100% coverage gate.
