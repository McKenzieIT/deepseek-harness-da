---
description: "Model-facing discover_relations tool: AI-native DWS→DIM relation discovery over the semantic layer (G3 enrichment), for the data agent's enrichment phase"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-discover-relations

English | [中文](README.zh.md)

## Summary

TODO: fill in Summary — placeholder seeded from package.json description.

Model-facing discover_relations tool: AI-native DWS→DIM relation discovery over the semantic layer (G3 enrichment), for the data agent's enrichment phase

## Table of Contents

- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)


Model-facing discover_relations tool: AI-native DWS→DIM relation discovery over the semantic layer (G3 enrichment), for the data agent's enrichment phase

## Dev Note

None.


## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- Pure suggestion — proposed relations are not persisted.
- Relation direction is DWS→DIM only.
- Does not infer cardinality.
