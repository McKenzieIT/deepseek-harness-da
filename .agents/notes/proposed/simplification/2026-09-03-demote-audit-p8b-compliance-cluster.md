# Agent Note: Demote the audit P8b compliance cluster (test-only methods)

Status: proposed

## Problem

`packages/data/audit/src/store.ts` ships five compliance-cluster methods with ZERO production callers: `correctedStats` (`:520`), `appendCorrection` (`:438`), `get_with_history` (`:364`), `rawPayload` (`:381`), `dumpAll` (`:578`). A grep (excluding audit) for these five symbols across `packages/ + examples/ + scripts/ + apps/` finds nothing — they are consumed only by `audit/tests` (`correctedStats` 9 test refs, `appendCorrection` 6, `get_with_history` 1, `rawPayload` 1, `dumpAll` 0). The audit README self-admits `dumpAll` is "not in production paths (code-review L3, edge-case)" (`audit/README.md:41`). No implemented Agent Note for P8b. They were built for a compliance-officer / P9-admin consumer that does not exist; `resolveIdentity` (the per-user attribution dimension these methods depend on) returns `{}` (T1 fallback) today, so the attribution dimension is NULL. (`hashBody` is excluded — it has an internal caller in `recordTool`/`recordTier2Write`; `stats`, the immutable aggregation, stays as the live baseline.)

## Proposal

Demote to test-only helpers or remove until the compliance consumer ships; `stats` (immutable aggregation) stays. The `correctedStats` O(n) re-aggregation + the `appendCorrection` tag machinery + their SQL go with them; the `ATTRIBUTION_CORRECTION` tag can stay (cheap) but its only producer goes.

## What we give up

A compliance / attribution-correction substrate someone might wire when the P9-admin or compliance-officer consumer lands. It is not wired, and `resolveIdentity` returns `{}` so the attribution dimension it depends on is NULL today — keeping it is speculative.

## Alternatives considered

**Keep the methods until the P9-admin / compliance-officer consumer ships.** They were built for that consumer, so removing them risks re-adding. It lost because the consumer does not exist, `resolveIdentity` returns `{}` today so the attribution dimension they depend on is NULL, and the audit README itself flags `dumpAll` as out of production paths — keeping speculative, dependency-null code is the cost, not the safety.

**Remove entirely instead of demoting to test-only.** Full deletion shrinks the public API more than demotion. It lost because the methods have test-only consumers (9/6/1/1/0 refs in `audit/tests`), so demoting to test-only helpers preserves that coverage while removing the production surface; full deletion would discard the test fixtures with no extra correctness gain.

## Acceptance criteria

- `grep -rn "correctedStats|appendCorrection|get_with_history|rawPayload|dumpAll" packages/` (excluding `audit/tests`) returns zero after removal.
- audit `pnpm test` green after dropping the consuming specs (or keeping them as test-only internal helpers).
- `stats` + `recordTool`/`recordTier2Write` unaffected.

## Risks

If a P9-admin / compliance-officer ticket is actively implementing the consumer, coordinate. The methods are public on `SQLiteAuditStore` (lib `.d.ts`) — removal shrinks the audit public API; confirm no out-of-tree eval consumer imports them (grep the monorepo first). `resolveIdentity` returning `{}` (T1) is a separate fallback decision — this note does not touch it.
