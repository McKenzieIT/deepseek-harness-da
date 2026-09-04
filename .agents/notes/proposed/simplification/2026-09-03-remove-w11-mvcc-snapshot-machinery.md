# Agent Note: Remove the unused W11 MVCC snapshot machinery

Status: proposed

## Problem

`packages/data/semantic-layer/src/snapshot.ts` (239 lines, 9 tests) + the Service methods `acquireSnapshot(scopeId?)` (`index.ts:816`) and `withSnapshot<T>(fn)` (`:839`) + 5 re-exports (`DefinitionSnapshot`, `captureSnapshot`, `clearSnapshotCache`, `getSnapshotCacheSize`, `SNAPSHOT_CACHE_MAX` at `index.ts:76`) form an MVCC snapshot substrate with ZERO production consumers. A grep (excluding semantic-layer) for `withSnapshot|acquireSnapshot|captureSnapshot|clearSnapshotCache|getSnapshotCacheSize|SNAPSHOT_CACHE_MAX|DefinitionSnapshot` across `packages/ + examples/ + scripts/ + apps/` returns nothing — only the definitions, the internal `this.acquireSnapshot()` call inside `withSnapshot`, and JSDoc/comments. The "Usage" JSDoc (`ctx.schema.withSnapshot(async snap => { ... })`) is aspirational — no NL2SQL query path wraps queries in it. The GA-GT1 multi-tenant-scope ticket explicitly records "acquireSnapshot 0 live caller" (only `getRelationGraph`/`corpusVersion`/`loadRetrievalCorpus` have live callers among the read methods).

## Proposal

Remove `snapshot.ts` (239 lines), the 2 Service snapshot methods, the 5 re-exports, and the 9 tests until the query-engine consumer lands. The pre-release stance ("foundation over blast radius — no external consumer to break") makes removal-until-consumer-lands the cleaner default. The `toMetricDefinition` calls inside `snapshot.ts` die via this, but `toMetricDefinition` stays alive via the Service `loadMetricDefinition`.

## What we give up

A read-consistency substrate someone might wire into the NL2SQL query path. It is not wired, and carrying it invites the next reader to assume queries are snapshot-isolated when they are not.

## Alternatives considered

**Keep the snapshot substrate until the NL2SQL query path wires it for read consistency.** `withSnapshot` could give queries a consistent view. It lost because no NL2SQL query path wraps queries in it (the "Usage" JSDoc is aspirational), `acquireSnapshot` has zero live callers per the GA-GT1 ticket, and carrying it invites the next reader to assume queries are snapshot-isolated when they are not — re-adding against a real consumer later is the point.

**Keep only the types/exports, drop the `snapshot.ts` machinery.** Preserve `DefinitionSnapshot` for typing. It lost because the 5 re-exports (`DefinitionSnapshot`, `captureSnapshot`, `clearSnapshotCache`, `getSnapshotCacheSize`, `SNAPSHOT_CACHE_MAX`) all back the `snapshot.ts` implementation with no external consumer, and keeping exported names that point at a removed implementation is worse than removing both — the pre-release stance lets the surface re-add cleanly against a real consumer.

## Acceptance criteria

- `grep -rn "withSnapshot|acquireSnapshot" packages/*/src examples/ scripts/` returns only definitions (then zero after removal).
- semantic-layer `pnpm test` green after dropping the 9 snapshot tests.
- `eval-runner-service` boots and runs a k11 eval unchanged (it never wrapped queries in `withSnapshot`).

## Risks

If a near-term ticket wires `withSnapshot` into the NL2SQL query path for read consistency, removal forces a re-add — but the re-add is against a real consumer then, which is the point. Confirm the W11 C1 ticket is not actively implementing the consumer before removing. Verify with a grep across `scripts/` + `dev/` that `captureSnapshot`/`clearSnapshotCache` have no hidden dev-script caller (they do not, per the grep).
