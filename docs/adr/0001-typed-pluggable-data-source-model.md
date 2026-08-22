# ADR-0001: Typed Pluggable Data Source Model

**Status**: Accepted (2026-08-21)
**Context**: semantic-layer map, G1 ticket

## Decision

The semantic layer uses a **typed pluggable** architecture: each data source kind (event, table, future kinds) is a `DataSourceKindPlugin<T>` with its own zod schema, while sharing a unified type-agnostic retrieval corpus layer.

## Context

The semantic layer needs to support multiple data source kinds (currently events + tables, potentially Excel/API/stream in future). Two viable approaches:

- **A (Unified abstraction)**: One `DataSourceDefinition` with a `kind` discriminator and a `metadata: Record<string, unknown>` bag for kind-specific fields.
- **B (Typed pluggable)**: Each kind has its own full schema + a plugin interface that projects it into shared abstractions (corpus items, prompt text, critic fields).

## Consequences

### Chosen: B (typed pluggable)

- Each `DataSourceKindPlugin<T>` owns: `schema` (zod), `toCorpusItem`, `toPromptContext`, `toCriticContext?`, `relations?`
- The retrieval layer (BM25/hybrid) indexes `CorpusItem = { id, description, metrics, payload }` — kind-agnostic
- NL2SQL critic receives `CriticFields` aggregated from per-kind `toCriticContext()` — no per-kind branching in engine code
- New kinds cost ~50 lines of plugin code; existing kinds (event, table) wrap their existing zod schemas

### Why not A

- TypeScript safety loss: `metadata: Record<string, unknown>` is untyped; every consumer needs `kind`-switch + cast
- NL2SQL critic already consumes type-specific structures (`params_fields` for events, `partitions` for tables) — forcing these into a generic bag adds indirection without value
- The retrieval layer is ALREADY kind-agnostic (`EventCorpusItem`), so the "unified" benefit of A is already realized by the shared `CorpusItem` projection

### Ontology integration

Each plugin optionally exposes `relations()` returning `RelationDef[]`. All relations from all definitions are collected into an in-memory adjacency list at load time, providing `findJoinPath` and `getRelated` APIs for NL2SQL join reasoning. No graph database needed at current scale (hundreds of definitions, thousands of relations).
