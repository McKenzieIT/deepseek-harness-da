# CI: Pack "Verify release version" gate failure

**Type**: task (CI/release infra)
**Status**: open
**Source**: surfaced 2026-09-06 during the GA-AUDIT1-followup ui-context-layer ④ batch recovery + CLAUDE.md CI-fix investigation (PR #12). The `Pack npm tarballs` job fails at the "Verify release version" step on every CI run (master + PRs), independent of the CLAUDE.md checkout fix.

## Question

Why does `pnpm run verify` (release version gate — `DshFamily.verifyVersions` at `scripts/release/families.ts:338` → `main` at `scripts/release/verify.ts:83`) exit 1, and how to fix it so the `Pack npm tarballs` job passes?

## Evidence

- CI log (PR #12, run 33909607838 / job 101108413651): `Pack npm tarballs` fails (38s) at "Verify release version" — `DshFamily.verifyVersions` (`scripts/release/families.ts:338`) → `main` (`scripts/release/verify.ts:83`) → `Node.js v24.20.0` → exit 1. The step lists all packages at `0.1.0-rc.8` then fails.
- Pre-existing: failed before the CLAUDE.md fix (PR #12) + after — unrelated to the checkout/CLAUDE.md ENAMETOOLONG issue (which PR #12 fixed). The CLAUDE.md fix unblocked the checkout, but this version-gate failure remains.

## Scope

Investigate `verifyVersions` (`scripts/release/families.ts:338`) — what version inconsistency it detects. Likely: a package (or set) at a version != the expected `0.1.0-rc.8`, OR a version-sync requirement (all packages must match the family root). Fix: align the versions OR adjust the gate. Re-verify the `Pack npm tarballs` job passes.
