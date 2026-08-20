# `@deepseek-ai/dsh-semantic-layer`

English | [中文](README.zh.md)

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
import type { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer'
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

## Model Experience

### Discovered table descriptions

#### What the model sees

`ctx.schema.describe(tableName)` returns a `TableMeta` carrying the table's `table_name`, `columns` (each a `name`, a physical `type`, and an optional `comment` as the connector returns them), `partitions` (`name` / `type`), and an optional table `comment`; `discover(scopeId, kind?)` enumerates the available tables in a scope and `sample(tableName, n?)` returns formatted row samples. The NL→SQL engine renders these discovered data-source descriptions into the model prompt as candidate-table context. Live-ODPS `discover` / `describe` / `sample` throw "no provider" until a MaxCompute provider is mounted (see Known Limitations).

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

- **Live-ODPS provider** — `discover` / `describe` / `sample` throw "no provider" until a real MaxCompute provider (query-maxcompute sidecar or independent `schema-maxcompute`) is mounted. Deferred to a follow-up ticket.
- **`load_*` model-facing tool packages** — `load_table_definition` / `load_event_definition` are deferred as separate tool packages (named in the preset as `dsh-tool-load-table-definition` / `dsh-tool-load-event-definition`).
- **Canonicalize-on-write** — `writeTable` / `updateTableMeta` write raw data; on-disk faithfulness to canonical form is deferred (loaded data is already canonical so P13b swap is unaffected).
- **Definition name path-traversal guard** — rejecting `/` `\` `..` in definition names is deferred (intranet-security-first defense-in-depth; currently no model-facing tool calls these directly).
- **`updateTableMeta` concurrency lock** — read-merge-write should wrap `withFileLock` (`@deepseek-ai/dsh-atomic-write`) for concurrency safety. Deferred from prototype.
- **Bundle wiring** — the `semantic-layer` row in `cordis.patch.yml` is pending the live-ODPS provider + tool packages.
