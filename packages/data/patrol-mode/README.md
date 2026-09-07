# @deepseek-ai/dsh-patrol-mode

Autonomous patrol loop for the DeepSeek Harness data agent's semantic layer. Iteratively finds the weakest assets (via `evidenceQuery` health/gap analysis), diagnoses each, proposes a fix, requests explicit user confirmation, and triggers an eval batch after each round's confirmed edits.

## Overview

A function plugin (`apply(ctx)`) that mounts a `PatrolService` on `ctx.patrol`. The service owns one long-running patrol loop, scoped per management session, with between-round "btw" interruption handling.

The patrol loop:

1. Finds weakest assets via `ctx.get('evidenceQuery')` (`coverageQuery` / `assetHealth` / `gapAnalysis` / `evalResultQuery`).
2. For each weak asset (up to `maxEditsPerRound`):
   1. Diagnoses via the management session + evidence query.
   2. Proposes a fix and emits `patrol/confirm-request`.
   3. Waits for user confirmation (timeout `confirmTimeoutMs` → reject + pause).
   4. If confirmed: executes the edit (see Known Limitations).
3. After edits: triggers an eval batch on the processed assets (C3).
4. Emits `patrol/round-complete` (drives C2 batch rendering).
5. Waits for the next round or continues.

## Configuration

`PatrolConfig` is passed to `start(opts)`:

- `maxEditsPerRound` (default `3`, constant `DEFAULT_MAX_EDITS_PER_ROUND`) — pauses after N confirmed edits per round.
- `confirmTimeoutMs` (default `60000`, constant `DEFAULT_CONFIRM_TIMEOUT_MS`) — user must confirm within this window or the edit is rejected and the patrol pauses.
- `scope` (default `''`) — optional domain filter restricting patrol to a subset of assets.

> The safety contract: every edit requires explicit user confirmation — no silent execution.

## Events

All events are parallel broadcasts (`@mode parallel`):

- `patrol/started(config)` — loop has started.
- `patrol/stopped()` — loop has stopped (clean teardown).
- `patrol/round-start(roundNumber)` — a new round is beginning.
- `patrol/round-complete(summary)` — a round finished (drives C2 batch rendering).
- `patrol/confirm-request(edit)` — requesting user confirmation for a proposed edit.
- `patrol/edit-executed(edit)` — a confirmed edit was audited (audit only; see Known Limitations).
- `patrol/confirm-timeout(edit)` — user did not respond within `confirmTimeoutMs`.
- `patrol/btw-received(message)` — a "by the way" user message arrived mid-patrol.
- `patrol/paused(reason)` — patrol paused (no weak assets, max edits, or confirm timeout).

## Verification

```sh
tsc -b packages/data/patrol-mode/tsconfig.json   # typecheck
pnpm vitest run packages/data/patrol-mode        # specs
pnpm verify-package-invariants                   # invariant companion resolves
```

## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- **`executeEdit` is an unimplemented no-op stub (W11 TODO).** `PatrolService.executeEdit` currently audits the confirmed edit (`patrol/edit-executed`) and returns `true` **without applying** the edit to the management session's edit API. As shipped, confirmed edits are silently NOT executed; the round counter still increments `editsExecuted` and the post-round eval still fires over assets that were never modified. Wiring `executeEdit` to the management-session edit API (or making the stub honest about non-application) is required before this package's improvement loop is functional. Do not rely on patrol-mode to actually mutate assets.
- **`triggerEval` eval-runner seam is untyped.** `triggerEval` reads `ctx.get('evalRunner')` via an inline cast (`{ runBatch(opts?: object): Promise<unknown> }`); the declaring package (`@deepseek-ai/dsh-eval-runner-service`) is declared as a peer, but the `ctx.evalRunner` Context augmentation is not imported as a type augmentation, so the access stays loosely typed. Importing the seam's type augmentation for typed `ctx.evalRunner` access is deferred.
- **No schemastery `Config` schema.** `PatrolConfig` is a plain `interface` and the tunables (`maxEditsPerRound`, `confirmTimeoutMs`, `scope`) are module constants / `start(opts)` arguments, not validated `cordis.yml` Config fields. Adding a `z<Config>` schemastery schema and threading `apply(ctx, config)` is deferred (it adds a dependency and changes the plugin signature).
- **Duplicate `inject` declaration.** `PatrolService` carries both a `static inject` and the module-level `export const inject` (same values). Deduplication (keeping one) is deferred — it is DI-sensitive and needs verification against the Cordis loader's mount path for the Service-vs-function-plugin combination.
- **`requestConfirm` abort listener.** The abort listener registered on the shared patrol signal is not removed on the normal confirm/timeout resolve path (only on abort). Removing the listener in `clearPendingConfirm` is deferred polish.
