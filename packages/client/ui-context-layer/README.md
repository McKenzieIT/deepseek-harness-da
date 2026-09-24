---
description: "Context layer graph — G6 v5 interactive relation graph with semantic zoom and domain filtering"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-context-layer

English | [中文](README.zh.md)

## Summary

TODO: fill in Summary — placeholder seeded from package.json description.

Context layer graph — G6 v5 interactive relation graph with semantic zoom and domain filtering

## Table of Contents

- [Dev Note](#dev-note)
- [Open-kind presentation](#open-kind-presentation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)


Context layer graph — G6 v5 interactive relation graph with semantic zoom and domain filtering

Localization: the plugin registers the typed `contextLayer` namespace in English and Simplified Chinese; slot-rendered components receive `t`, and exported presentation components require the same translator.

No runtime invariant companion is published because `@deepseek-ai/dsh-client-ui-context-layer` owns no independently observable relationship that can diverge from its runtime state.

## Dev Note

None.

## Open-kind presentation

The graph RPC types (`SemanticGraphNode`/`SemanticGraphEdge`/`SemanticGraphData`/`SemanticGraphQuery`) are owned by `@deepseek-ai/dsh-schema-gateway`; this package imports them type-only from that package's `./types` leaf rather than re-declaring them. Importing the gateway root instead would pull its `SchemaGateway extends TypertRemoteService` declaration and the transitive host types into the client tsconfig program, which the repository keeps split from the host program; the gateway's own generated `lib/typert.remote-client.d.ts` imports the same `./types` leaf. Resolution goes through the declared export, not a source-level `paths` alias: an alias also rewrites the specifier inside that generated declaration, so an artifact-plane `.d.ts` would resolve its sibling to `src/types.ts`, pull that source into the client program, and emit stray `types.{js,d.ts}` next to it.

Node `kind` and relation `type` are OPEN strings. `graph-presentation.ts` is the client presentation registry over both. `createGraphPresentationRegistry()` is the registration seam:

- `registerNode(kind, spec)` / `registerRelation(type, spec)` supply one kind's localized label key, icon glyph, canvas style, and detail renderer, and return the disposer.
- `resolveNode(node, t)` / `resolveRelation(edge, t)` always answer. A registered kind gets its label, icon, style, and its renderer's detail rows. An unregistered kind gets the generic fallback: the raw projected kind string as its accessible label, `GENERIC_NODE_ICON`/`GENERIC_RELATION_ICON`, `GENERIC_NODE_COLOR`/`GENERIC_EDGE_COLOR`, and the generic detail rows — so a kind registered on the Host renders without a client change, is never dropped, and never crashes. Every resolved presentation carries at least one detail row.
- Each handle is independent. The plugin creates one in `apply` and threads its read face (`GraphPresentationReader` — the two resolvers, no registration surface) to components as an ordinary prop; a test creates its own handle. No module-level state decides how a kind looks.

The graph core consumes only resolved presentations. `nodeStyle`/`edgeStyle` map a presentation onto a G6 spec and hold no kind table; each G6 node payload carries the resolved fill so `useOverlayMode` restores it when leaving a diagnostic overlay instead of re-deriving it from a node kind; each edge carries its relation label as `labelText`, which is what names an unregistered relation kind on the canvas. `evalPassRate` remains a core read: it is a field of every `SemanticGraphNode`, it decorates every kind's border identically, and it is the whole subject of the `coverage` and `heatmap` overlay modes, so routing it through a kind-keyed seam would make the seam overlay-aware without removing a kind branch.

**Prototype-member kinds.** The registry's kind tables are `Map`s, so a lookup for a prototype member name (`toString`, `constructor`, `__proto__`) can never return an inherited member: `resolveNode`/`resolveRelation` yield the generic fallback, whose label is the raw kind string and whose fill and stroke are CSS color strings, never `undefined` and never a function.

**Public surface.** `createGraphPresentationRegistry`, `GENERIC_NODE_ICON`, `GENERIC_RELATION_ICON`, and the registry's types are exported from `./client`, alongside the palette constants `GENERIC_NODE_COLOR`, `GENERIC_EDGE_COLOR`, `DOMAIN_PALETTE`, and `DOMAIN_BORDER_PALETTE` and the style mappers `nodeStyle`, `edgeStyle`, `comboStyle`, and `evalBorderColor`. The kind→color table is not exported; it lives inside the registry's built-in specs. `graphDataBridge` imports `RemoteResult` and the generated `schemaGateway` namespace type from their owners (`@deepseek-ai/dsh-typert-protocol` + `@deepseek-ai/dsh-schema-gateway/remote`) and throws `getGraphData RPC failed: ok response missing value` for an `{ ok: true }` that carries no value, matching the rule `ui-semantic-layer/src/client/remoteResult.ts` documents for the evidence-query and schema-gateway bridges.


## Model Experience

None, as this browser-side context layer surface registers nothing model-facing.

#### KV Cache effect

The package registers nothing model-facing, so no KV-cache prefix is extended or invalidated.

## Known Limitations and Deferred Work

- G6 v5 is a hard dependency — the graph will not render without it.
- The graph re-renders on domain-filter change (no incremental diff), so large graphs can thrash on rapid filter changes.
- Semantic-zoom levels are hand-tuned thresholds, not auto-computed from the data.
