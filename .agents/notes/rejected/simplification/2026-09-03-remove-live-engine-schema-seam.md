# Agent Note: Remove the deferred live-engine schema seam (SchemaProvider + StandInSchemaProvider + 3 throwing methods)

Status: proposed

## Problem

`packages/data/semantic-layer/src/index.ts` ships a live-engine schema seam deferred at P6b Q3 with ZERO production consumers: the `SchemaProvider` interface (`:157`), `setSchemaProvider(provider)` (`:596`), the `StandInSchemaProvider` class (`:1024`), and the three Service methods `discover`/`describe`/`sample` (`:920`/`:932`/`:945`) that throw "no provider mounted" until `setSchemaProvider` is called. A grep (excluding semantic-layer) for `setSchemaProvider`/`StandInSchemaProvider`/`SchemaProvider` finds only the api-catalog reflection (auto-generated, `tool-cordis/api-catalog.ts:1296`/`:4313`) + a `gen-cordis-catalog.ts` comment. No bundle/preset/script ever calls `setSchemaProvider` — the data-agent bundle mounts `semantic-layer` (+ its `llm-wiring-plugin`) but never mounts a schema provider. The three Service methods throw until a provider is mounted; `gen-tool-catalog.ts` labels these "callable but unwired until ctx.schema ships." The P6b grilling explicitly deferred the real provider as a follow-up; no follow-up has landed. `StandInSchemaProvider` is consumed only by `scenarios.spec.ts` (test) + README.

## Proposal

Remove the `SchemaProvider` interface + `StandInSchemaProvider` + `setSchemaProvider` + the three Service methods (pre-release "foundation over blast radius" — no external consumer to break). Re-add the seam when the query-maxcompute provider actually lands. If the interface is wanted for forward-looking typing, keep ONLY the interface + drop the throwing Service methods + `StandIn`.

## What we give up

A deferred live-engine schema seam someone might wire when a real MaxCompute schema provider lands. It is not wired, and the throwing methods are a footgun (any caller gets "no provider mounted").

## Alternatives considered

**Keep the seam until a real `SchemaProvider` lands.** It is a deferred P6b follow-up, so removal forces a re-add. It lost because no bundle/preset/script calls `setSchemaProvider`, the three Service methods throw "no provider mounted" until one is mounted, and `StandInSchemaProvider` is consumed only by a test + README — a throwing, unwired seam is a footgun, and re-adding against a real consumer later is the point (the pre-release "foundation over blast radius" stance).

**Keep only the `SchemaProvider` interface, drop the throwing methods and `StandIn`.** Preserve the forward-looking type. It lost as a conservative variant the proposal explicitly offers, so it is available as a scoped-down alternative for a team that wants the type; the default removes the whole seam because no consumer uses the type either and the api-catalog reflection regenerates from source.

## Acceptance criteria

- `grep -rn "setSchemaProvider|StandInSchemaProvider|SchemaProvider" packages/*/src examples/ scripts/` returns only definitions (then zero after removal, modulo the api-catalog reflection which regenerates).
- semantic-layer `pnpm test` green after dropping `scenarios.spec.ts`'s `StandIn` block.
- `eval-runner-service` + the data-agent bundle boot unchanged (they never mounted a provider).

## Risks

If a near-term ticket lands a real `SchemaProvider`, removal forces a re-add — but against a real consumer then. Keeping just the interface (drop methods + `StandIn`) is the conservative variant if the team wants the forward-looking type. The api-catalog reflection rows regenerate from source.
