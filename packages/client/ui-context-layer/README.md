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

The graph RPC types (`SemanticGraphNode`/`SemanticGraphEdge`/`SemanticGraphData`/`SemanticGraphQuery`) are owned by `@deepseek-ai/dsh-schema-gateway`; this package imports them (type-only) rather than re-declaring them. Node/relation `kind` is an OPEN `string`. `graph-presentation.ts` is the client presentation registry keyed by node kind: known kinds resolve to a localized label + palette color; an unknown kind falls back to the raw kind string as an accessible label plus a neutral color, so a kind registered on the Host renders without a client change, is never dropped, and never crashes. The graph core (`ContextLayerGraph`/`graph-styles`) reads only the node `kind` key through this registry — no table/metric/concept business fields.


## Model Experience

None, as this browser-side context layer surface registers nothing model-facing.

#### KV Cache effect

The package registers nothing model-facing, so no KV-cache prefix is extended or invalidated.

## Known Limitations and Deferred Work

- G6 v5 is a hard dependency — the graph will not render without it.
- The graph re-renders on domain-filter change (no incremental diff), so large graphs can thrash on rapid filter changes.
- Semantic-zoom levels are hand-tuned thresholds, not auto-computed from the data.
