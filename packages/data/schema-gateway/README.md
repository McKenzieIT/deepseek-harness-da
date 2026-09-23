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

`getGraphData(query?, scopeId?)` returns a `SemanticGraphData` (`SemanticGraphNode[]` + `SemanticGraphEdge[]`). Node and relation `kind` are OPEN `string` values, not a closed union, so a Semantic-Layer kind registered after this package built (`concept`, or any future/test kind) reaches the client without a gateway change. Nodes come from `ctx.schema.projectGraphNodes()` — one contribution per registered kind's `toGraphNode`, plus whatever nodes those kinds declare through `derivedNodes` — so there are no hand-written per-kind loops; edges come from the RelationGraph. Node ids are branded `SemanticGraphNodeId` at this Remote boundary.

`query` fields: `domain` (filter to one domain/group), `focus` (BFS root — an empty subgraph is returned when it names no projected node), `depth` (bounded BFS from focus; `0` = focus only), and `includeMetrics` (default false; leaves derived nodes, today only `metric`, out of the projection). Unknown kinds are never dropped — the client presentation registry renders a generic accessible form.

**Derived metric.** `metric`-kind nodes are virtual — not a registered kind. The `table` and `event` kinds derive them from their own `metrics:` blocks through the `derivedNodes` capability they declare. `includeMetrics: false` (the default) reaches the projection, so the graph shows only curated assets and nothing is derived; `true` adds the metric nodes with a `derived_from` edge to their source table/event.

**Null opt-out.** A kind's `toGraphNode(def)` returning `null` declares that definition is not a graph node — no node and no edges from it. This is how a kind can be registered for corpus/retrieval indexing without entering the visual graph.

**Input + lifecycle.** The `SemanticGraphQuery` input is a plain serializable object (`domain?`, `focus?`, `depth?`, `includeMetrics?`) — no fiber or context handle crosses the wire. The relation-graph cache is invalidated on kind add/remove (the registry's `onChange` listener), so a disposed kind's nodes/edges do not linger and a re-registered kind flows through without a restart. The node projection (`projectGraphNodes`) is not cached — it iterates the live registry, so a newly registered kind's nodes appear on the next call.


## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- Read-only — there is no write path through this gateway.
- The BM25 linker index is rebuilt on corpus-version bump, with no live incremental update.
- The projection is client-facing, not the source of truth.
