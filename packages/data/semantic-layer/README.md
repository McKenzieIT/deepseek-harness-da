# `@deepseek-ai/dsh-semantic-layer`

Semantic-layer **substrate** for the data agent: zod-mirrored RBI pydantic `EventDefinition` / `TableDefinition` + reader/writer + `BasicIndex` + write-tiers + the `ctx.schema` seam. P6b production hardening (ports the throwaway `prototypes/p6-semantic-layer/`).

The semantic layer is a **first-class citizen** of the data agent — NL→SQL success rides on it (MDL / metric layer / Text2DSL). The substrate stays cross-compatible with RBI's 531 curated tables/events/terminology (zod mirrors pydantic `extra=allow` / `model_validator` / `canonicalize_type` / round-trip).

## P6b grilling (5 decisions, all = A)

- **Q1 package form**: `packages/data/semantic-layer/` single package (`@deepseek-ai/dsh-semantic-layer`), group=data (mirrors `audit` / `phase-gate` / `nl2sql-engine`). `load_*` model-facing tools are DEFERRED separate tool packages (mirror `tool-search-data-sources`; the preset already names them `dsh-tool-load-table-definition` / `dsh-tool-load-event-definition`). Independent analysis grounded this: data capability packages are single-package Services; tools are always separate from their Service package; an independent `semantic/` group is over-abstraction for one package.
- **Q2 seam scope**: `ctx.schema` covers BOTH live-ODPS (`discover` / `describe` / `sample`) AND substrate definitions (`loadEventDefinition` / `loadTableDefinition`). P13b `CriticGuardData` swaps to `ctx.schema.load_*` (params_fields / partitions).
- **Q3 live-ODPS implementation**: DEFERRED — P6b ships the Service Definition + substrate + a stand-in provider for sync demo/tests; the real MaxCompute provider (query-maxcompute sidecar adding schema tools, or an independent `schema-maxcompute`) is a follow-up. `discover` / `describe` / `sample` throw "no provider" until mounted; the P13b swap only needs substrate definitions, so it is unblocked.
- **Q4 Tier-2 audit**: routes through `ctx.audit.recordTier2Write` (P8b real sqlite audit), NOT the prototype's flat JSON log — unified audit trail, intranet-security-first. The substrate `Tier2Recorder` interface is satisfied by `ctx.audit`; Tier-2 writes fail-loud if audit is not mounted (D5 "不可关").
- **grounded**: `zod` (mirrors pydantic; `schemastery` has no `.passthrough`) + `js-yaml` substrate deps; reuse `@deepseek-ai/dsh-atomic-write` (`writeFileAtomic`: temp+wx+rename, mode stamped) for atomic writes.

## Structure

| file | role |
| --- | --- |
| `src/types.ts` | zod schemas mirroring RBI pydantic (`EventDefinition` / `TableDefinition` + sub-models, `TableMeta`, `canonicalizeType`). |
| `src/io.ts` | reader (sync) / writer (async via `writeFileAtomic`) / sync-write / cache-invalidate (ADR-0011) / `Tier2Recorder` interface. |
| `src/basic-index.ts` | `BasicIndex` — dep-free lookup accelerator; rebuilds on invalidation (NOT a validation cache). |
| `src/pending.ts` | Tier-1 pending queue (suggest -> pending -> approve; approve-side P9-gated). Tier-2 is `ctx.audit` (not here). |
| `src/index.ts` | `ctx.schema` Service Definition (`SemanticLayerService`) + `SchemaProvider` interface + `StandInSchemaProvider` + substrate re-exports. |

## `ctx.schema` seam

```ts
declare module '@deepseek-ai/cordis' { interface Context { schema: SemanticLayerService } }
```

- `loadEventDefinition(name)` / `loadTableDefinition(name)` — substrate definitions (the P13b swap target: `params_fields` / `partitions`).
- `discover(scopeId, kind?)` / `describe(table)` / `sample(table, n?)` — live-ODPS (deferred; `setSchemaProvider` mounts a real one).
- `syncWrite(metas, opts)` / `updateTableMeta(name, updates, opts)` — Tier-2 persistent writes via `ctx.audit.recordTier2Write`.

## P13b swap

P13b's local `CriticGuardData` (params_fields/partitions from a thin YAML reader) swaps additively to `ctx.schema.load_*`. `CriticCtx{candidateTables, eventParams, partitionCols}` contract unchanged; P13b engine logic unchanged. `makeCriticCtx({ candidateTables, eventParams: EventDefinition.params_fields, partitionCols: TableDefinition.partitions.map(p => p.name) })`.

## Verification

```sh
tsc -b packages/data/semantic-layer/tsconfig.json   # typecheck
pnpm vitest run packages/data/semantic-layer        # 5 scenarios (4 prototype + P13b swap)
pnpm verify-cordis-config                            # bundle/preset mount resolves
```

Bundle wiring (the `semantic-layer` row in `packages/bundle/data-agent/cordis.patch.yml`) is a follow-up with the live-ODPS provider + the `load_*` tool packages.
