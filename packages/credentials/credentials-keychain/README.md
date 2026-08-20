# dsh-credentials-keychain

English | [中文](README.zh.md)

macOS Keychain [credentials](../credentials/README.md) provider: per-user PATs in an
independent (non-login) keychain, addressed by `account=userId`, with an injectable
global/shared fallback for the G3 staged fallback (a per-user miss falls through to
the early global T1 PAT).

| Slot | Source id | Writable |
|---|---|---|
| per-user keychain item `(service=ref, account=userId)` | `keychain` | yes (`set`/`unset`) |
| global/shared fallback (e.g. credentials-local/env) | `fallback` | not here |

The keychain database is encrypted at rest, so a process that reads the keychain file
off disk (`cat`, `grep`) sees ciphertext, not the PAT. An independent keychain with a
short auto-lock and lock-on-sleep, locked again on the harness's own teardown, narrows
the runtime-exfiltration window: while the keychain is locked, no process — not the
harness, not `bash` — can read an item without the unlock password.

## Config

| Field | Default | Meaning |
|---|---|---|
| `path` | `<harness home>/credentials.keychain` | Keychain location. |
| `dshHome` | `$DSH_HOME` or `~/.dsh` | Harness home used when `path` is omitted. |
| `unlockPassword` | — | Creates and unlocks the keychain at startup. A new secret-to-protect (see [Security boundary](#security-boundary)). |
| `autoLockSeconds` | `300` | Auto-lock after N seconds idle; `0` disables. |
| `lockOnSleep` | `true` | Lock the keychain on sleep. |
| `fallback` | — | Read-only global/shared fallback for per-user misses and global resolves. |
| `runner` | — | Injectable `security` CLI runner; production passes the exported `securityCli`, unit tests a fake. |

The provider takes its config programmatically (not from `cordis.yml`): `runner` and
`fallback` are injection seams, and `unlockPassword` is a secret that does not belong
in a composition file. Defaulting is an explicit `resolveSpec` step, never an inline `??`.

## The keychain items

A generic-password item per `(service=ref, account=userId)`. `set` writes
`security add-generic-password -U -a <userId> -s <ref> -w <value>`; `resolve` reads
`security find-generic-password -a <userId> -s <ref> -w`; `unset` deletes. A per-user
miss, or a resolve with no `userId`, falls through to the `fallback` (G3 staged: no
per-user PAT → the global T1). `set`/`unset` without a `userId` are not the keychain's
to serve — the global slot is the fallback provider.

<a id="security-boundary"></a>

## Security boundary

Two bars, only the first met here:

- **At rest**: ✓. The keychain database is encrypted on disk, so `bash` `cat`/`grep` of the file yields ciphertext, not the PAT — the bar [`credentials-local`](../credentials-local/README.md#security-boundary) reserves for an OS-keychain provider. An independent keychain with a short auto-lock and lock-on-sleep, re-locked on the harness's teardown, narrows the window further: while locked, no process can read an item without the unlock password.
- **Runtime exfiltration**: ✗ via the `security` CLI. Once the harness unlocks the keychain at startup so it can resolve PATs, any process running as the same user (including the agent's `bash`) can spawn `security find-generic-password -w` to read an item: macOS evaluates the **calling process** (`/usr/bin/security`, Apple-signed) as the ACL accessor — not its spawner — so a `security`-CLI-based provider cannot distinguish the harness from `bash`. The `security` CLI exposes only `-T appPath` (path-based, forgeable) and `set-keychain-settings` (keychain-level); it cannot set per-item Touch-ID `SecAccessControl` (that needs the Security framework's `SecItemAdd` + `kSecUseDataProtectionKeychain`), and an identity-based ACL needs a Developer-ID-signed harness binary — a distribution-layer concern. See [`research/p12b-keychain-acl-feasibility.md`](../../../wayfinder/data-agent/research/p12b-keychain-acl-feasibility.md).

Per-item Touch-ID ACL (reads restricted to the harness binary, excluding `bash`/`terminal`) was evaluated as **over-spec and is not a requirement** — ticket P12c is **dropped (2026-08-21)**. The Apple-Developer path (a native Security-framework binding + Developer-ID signing + notarization) breaks dsh's out-of-the-box constraint (the harness runs as `tsx`/`node` scripts with no binary to sign); per-item Touch-ID is an enhancement, not an intranet-security-first hard edge; and the runtime-exfil threat is already covered by this package's at-rest + locked-keychain + auto-lock plus P10 tool-gating (business-user agents forbid `bash` → cannot reach `security`; the admin residual unlock-window is trusted-operator self-risk; per-item biometry is also infeasible in the multi-user single-host topology). The locked keychain is therefore an at-rest and when-locked enhancement, and **the final state under out-of-the-box**, not a placeholder for P12c: it narrows the runtime-exfil window to the unlocked period, it does not close it. See [`research/p12b-keychain-acl-feasibility.md`](../../../wayfinder/data-agent/research/p12b-keychain-acl-feasibility.md) §0 (conclusion correction).

The `unlockPassword` is itself a new secret-to-protect: interactive entry at startup
is secure; a password stored where `bash` can read it (an env var, a file) weakens the
lock to convenience, because the same-spawner indistinguishability means anything the
harness can unlock, `bash` can unlock too.

## Model Experience

Indirectly, through the consuming LLM adapters: stored values authorize their provider
requests, and the adapter owns every model-visible surface. The harness never loads a
resolved PAT into `process.env`.

#### KV Cache effect

No direct invalidation; credentials never enter a request prefix. A `set`/`unset`
publishes `credentials/updated(ref, address?)` so per-operation re-resolution picks up
the change without a restart.

## Known Limitations and Deferred Work

- **Runtime-exfil ACL is over-spec (P12c dropped)** — see [Security boundary](#security-boundary): per-item Touch-ID ACL + harness code-signing was evaluated and dropped as over-spec (breaks out-of-the-box; not a hard edge; threat covered by at-rest + locked-keychain + auto-lock + P10 tool-gating). This `security`-CLI-only, additive package is the final state.
- **The unlocked window is residual** — while the harness runs with the keychain unlocked, `bash` can read an item via `security`. Auto-lock + lock-on-sleep + teardown-lock narrow but do not eliminate it.
- **Multi-host central backend is deferred** — per-host keychains do not sync; a central KMS/Vault backend is a cross-network/multi-host deployment concern, orthogonal to this package.
- **Cross-platform is out of scope** — this is macOS-only (`/usr/bin/security`). libsecret (Linux) / Credential Manager (Windows) have different ACL models and are a separate effort.
- **`set-keychain-settings` flag surface varies by macOS version** — this package uses only `-l` (lock-on-sleep), `-u` (lock-after-timeout), and `-t` (timeout), the flags confirmed live; `-c` (lock-on-logout) is not in the current CLI and is not set.
