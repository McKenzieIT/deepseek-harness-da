---
description: "Cordis adapter for @semantic-grounding/substrate: provides the substrate's SemanticGroundingCore as ctx.schema, bridges the fiber lifetime to core.dispose(), reactively wires the optional audit + scopes collaborators, and ships the enrichment-llm-wiring plugin that feeds ctx.llm into the enrichment seam."
kind: "package-reference"
---

# `@deepseek-ai/dsh-semantic-layer`

English | [中文](README.zh.md)

## Summary

A thin cordis adapter over `@semantic-grounding/substrate`, vendored as a tarball under `vendor-tarballs/`. The semantic layer itself — definition kinds, the alias and relation graph, retrieval projections, enrichment, and the two-tier audited write path — now lives in the substrate and is consumed as a vendored tarball. This package is the ~40-line host shell that mounts it into dsh.

## Table of Contents

- [Dev Note](#dev-note)
- [What it provides](#what-it-provides)
- [Shape: `ctx.schema` IS the core](#shape-ctxschema-is-the-core)
- [Optional collaborators](#optional-collaborators)
- [Structure](#structure)
- [Verification](#verification)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

No runtime invariant companion is published because `@deepseek-ai/dsh-semantic-layer` owns no independently observable relationship that can diverge from its runtime state.

## Dev Note

None.

## What it provides

Two cordis plugins:

| Plugin | Entry | Role |
| --- | --- | --- |
| `semantic-layer` | `src/index.ts` (default export) | Constructs a `SemanticGroundingCore` and provides it as `ctx.schema`. |
| `enrichment-llm-wiring` | `src/llm-wiring-plugin.ts` | Adapts `ctx.llm.stream()` to the substrate's `TextLlm` and calls `wireEnrichmentLlm`, enabling the LLM semantic round. |

Both are mounted as separate rows by `packages/bundle/data-agent/cordis.patch.yml` — the second through this package's `exports["./src/*"]` deep path.

## Shape: `ctx.schema` IS the core

`apply` provides the `SemanticGroundingCore` instance directly and forwards nothing. `SemanticGroundingCore` declares 24 `private` members, so it is **nominally** typed: a forwarding `class extends Service` wrapper would not be assignable to it, and tarball-bound consumers could never type `ctx.schema` with the substrate's own class. Providing the instance makes every `as SemanticGroundingCore` cast true, reaches all 32 public members, and leaves no forwarding code to drift.

`ctx.effect(() => () => core.dispose())` is the fiber↔core lifetime bridge. `core.dispose()` releases the data-source-kind registrations and the graph cache-invalidation listeners the core owns; without it a withdrawn kind's nodes survive a fiber reload inside the cached graph.

## Optional collaborators

`audit` and `scopes` are deliberately **absent** from the plugin's `inject` list — `ctx.schema` must mount whether or not they exist. They are wired through nested `ctx.inject(...)` child fibers, which gate only themselves. The wiring is reactive rather than one-shot because the host may provide either service *after* the semantic layer mounts; a single apply-time probe would latch `undefined` forever.

While `audit` is unmounted the Tier-2 recorder stays `undefined` and **every auditable write throws**. That is intentional (D5 / ADR-0001): there is no silent no-op recorder here. Audit-off is only legitimate as an explicit no-op recorder passed on purpose, never as a wiring accident.

## Structure

```
src/index.ts              the semantic-layer adapter plugin (ctx.schema)
src/llm-wiring-plugin.ts  the enrichment-llm-wiring plugin
tests/service-wiring.spec.ts   the lifetime bridge (1 test)
tests/llm-wiring-cl8.spec.ts   provider/model resolution (5 tests)
```

The substrate's own domain suite is green in the substrate repo; dsh does not re-test its dependency. The only behaviour this package owns is the lifetime bridge and the CL8 provider/model resolution, which is what `tests/` covers.

## Verification

```bash
pnpm vitest run packages/data/semantic-layer/tests/
pnpm run verify-cordis-config
```

`apps/web/tests/semantic-graph-remote.e2e.ts` is the adapter's contract test: it exercises the default export, the `ctx.schema` Context augmentation, the `Config` schema, and the `schema` service name across the real Remote boundary.

## Model Experience

### Discovered table descriptions

#### What the model sees

`ctx.schema.describe(tableName)` returns a `TableMeta` carrying the table's `table_name`, `columns` (each a `name`, a physical `type`, and an optional `comment` as the connector returns them), `partitions` (`name` / `type`), and an optional table `comment`; `discover(scopeId, kind?)` enumerates the available tables in a scope and `sample(tableName, n?)` returns formatted row samples. The NL→SQL engine renders these discovered data-source descriptions into the model prompt as candidate-table context. Live-engine `discover` / `describe` / `sample` throw "no provider" until a query provider is mounted (see Known Limitations).

##### Sample discovered table description

```markdown
table_name: dws_trade_order_di
comment: trade order detail fact table
columns:
  - name: order_id
    type: string
    comment: order id
  - name: pay_amt
    type: decimal
    comment: payment amount
partitions:
  - name: ds
    type: string
```

#### Token effect

The description tokens scale with the column and partition count of each discovered table, and `discover` multiplies this by the table count in the scope; `sample` adds a bounded extra block. The context is included per NL→SQL turn.

#### KV Cache effect

Table descriptions repeat across NL→SQL turns over the same table or scope, so the description block sits in the reusable request prefix and may be cached. A `syncWrite` Tier-2 refresh that overwrites `columns` or `partitions` invalidates the affected table's cached context; unrelated tables stay cacheable.

### Substrate definition params

#### What the model sees

`ctx.schema.loadEventDefinition(name)` and `loadTableDefinition(name)` return validated substrate definitions whose column and parameter `type` values are canonicalized through `canonicalizeType` into a small DB-agnostic vocabulary so the model never sees dialect noise (bigint and int8 both become `int`). The event `params_fields` and table `partitions` are what P13b's `CriticGuardData` swaps into `makeCriticCtx({ candidateTables, eventParams, partitionCols })`, grounding the SQL critique the model performs.

#### Token effect

The parameter and partition tokens scale with the event or table field count and are included per critique turn; `load_*` is a sync read, so only the matched definition contributes.

#### KV Cache effect

Substrate definitions are stable on disk, so their rendered context repeats as a cacheable prefix across critiques of the same definition. A `syncWrite` or `updateTableMeta` Tier-2 write that changes a definition invalidates only that definition's cached context.

## Known Limitations and Deferred Work

- **The domain limitations moved with the domain code.** Live-engine provider, canonicalize-on-write, the definition-name path-traversal guard and the `updateTableMeta` concurrency lock are all `@semantic-grounding/substrate` concerns now and are tracked there, not here.
- **`ctx.schema` is absent from this repo's generated Cordis catalog.** The adapter provides an instance whose class ships in the tarball, so the catalog's source-walking projection cannot render it; it is named in `SERVICE_WALK_EXEMPTIONS` instead. Where the seam's API reference should live is still open.
- **`SemanticLayerConfig` is declared locally and must track the substrate by hand.** A plugin's config type has to live in its own package (`gen-config-catalog` enforces it), so this interface and its `corpusVariant` union are a deliberate duplicate of the substrate's; a substrate-side change does not break the build here, it drifts silently.
- **The substrate is not a release member, so dsh cannot publish while it is unpublished.** This package IS a release member (`packages/*/*`), so `release:pack` packs it and `release:verify-packed-install` resolves `@semantic-grounding/substrate` from the registry, where it is currently E404 — the `file:` override only applies inside this workspace. **Publishing `@semantic-grounding/substrate` is a blocking precondition for the next dsh publish.** (The release lane is independently red on master today for an unrelated `koffi` native build, and publishing is manual-only via `workflow_dispatch`, which is why this did not block the cutover.)
- **`setScopeRegistry(ctx.get('scopes') as never)` is an unchecked cast.** The substrate does not export `ScopeRegistryLike`, so the scope-registry shape is not verified at this boundary.
