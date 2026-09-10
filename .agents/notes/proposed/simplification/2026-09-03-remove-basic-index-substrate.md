# Agent Note: Remove the unused BasicIndex substrate

Status: proposed

## Problem

`packages/data/semantic-layer/src/basic-index.ts` (147 lines: `export class BasicIndex` + `EventIndexEntry`/`TableIndexEntry`), re-exported at `index.ts:107`, has ZERO production consumers. A grep (excluding semantic-layer) for `BasicIndex` across `packages/ + examples/ + scripts/ + apps/` finds only the api-catalog reflection (auto-generated from this source via `gen-cordis-catalog.ts`) + README + `package.json` description. No production source constructs or queries a `BasicIndex`. The Service reads via `loadEventDefinition`/`loadTableDefinition` (disk, `io.ts`), NOT through `BasicIndex`. The "P13b swap" the `index.ts` comment references is `CriticGuardData` swapping to `ctx.schema.load_*` — which bypasses `BasicIndex` entirely. It is a parallel lookup accelerator with no accelerator user.

## Proposal

Remove `basic-index.ts` (147 lines) + its `index.ts:107` re-export + the S4 test block in `scenarios.spec.ts`.

## What we give up

A lookup accelerator someone might swap the disk reads to. It is not wired, and the live read path is `load_*` from disk — keeping it invites the next reader to assume indexing is in the read path when it is not.

## Alternatives considered

**Keep `BasicIndex` as a forward-looking accelerator.** A P13b/P14 indexing ticket might mount it as the read path. It lost because no production source constructs or queries a `BasicIndex`, the live read path is `loadEventDefinition`/`loadTableDefinition` from disk, and the referenced "P13b swap" (`CriticGuardData` to `ctx.schema.load_*`) bypasses `BasicIndex` entirely — keeping it invites the next reader to assume indexing is in the read path when it is not.

**Keep only the class, drop the test block.** Preserve the substrate for typing while removing the test. It lost as a partial measure that leaves a 147-line unused class re-exported at `index.ts:107` with no consumer — the api-catalog reflection row regenerates from source, so removing the source is clean, and re-adding against a real consumer later is the point.

## Acceptance criteria

- `grep -rn "BasicIndex" packages/*/src examples/ scripts/` returns only the api-catalog reflection row (which dies with the source) then zero.
- semantic-layer `pnpm test` green after dropping the S4 test block.

## Risks

Small. If a P13b/P14 indexing ticket is actively about to mount `BasicIndex` as the read path, defer. The api-catalog reflection row for `BasicIndex` auto-regenerates from source via `gen-cordis-catalog.ts` — removing the source removes the row on the next catalog gen.
