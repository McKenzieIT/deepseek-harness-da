---
description: "Read-only Remote projection of ctx.schema (SemanticLayerService) for client UI consumption"
kind: "package-reference"
---

# @deepseek-ai/dsh-schema-gateway

English | [中文](README.zh.md)

## Summary

TODO: fill in Summary — placeholder seeded from package.json description.

Read-only Remote projection of ctx.schema (SemanticLayerService) for client UI consumption

## Table of Contents

- [Dev Note](#dev-note)
- [Semantic graph projection](#semantic-graph-projection)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)


Read-only Remote projection of ctx.schema (SemanticLayerService) for client UI consumption

No runtime invariant companion is published because `@deepseek-ai/dsh-schema-gateway` owns no independently observable relationship that can diverge from its runtime state.

## Dev Note

None.

## Semantic graph projection

`getGraphData(query?, scopeId?)` returns a `SemanticGraphData` (`SemanticGraphNode[]` + `SemanticGraphEdge[]`). Node and relation `kind` are OPEN `string` values, not a closed union, so a Semantic-Layer kind registered after this package built (`concept`, or any future/test kind) reaches the client without a gateway change. Nodes come from `ctx.schema.projectGraphNodes()` — one contribution per registered kind's `toGraphNode` plus the single derived-`metric` contributor — so there are no hand-written per-kind loops; edges come from the RelationGraph. Node ids are branded `SemanticGraphNodeId` at this Remote boundary.

`query` fields: `domain` (filter to one domain/group), `focus` (BFS root — an empty subgraph is returned when it names no projected node), `depth` (bounded BFS from focus; `0` = focus only), and `includeMetrics` (default false; drops `metric`-kind nodes). Unknown kinds are never dropped — the client presentation registry renders a generic accessible form.


## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- Read-only — there is no write path through this gateway.
- The BM25 linker index is rebuilt on corpus-version bump, with no live incremental update.
- The projection is client-facing, not the source of truth.
