---
description: "Model-facing discover_alt_labels tool: AI-native SKOS alias discovery over the semantic layer (CL-1 Phase 3 enrichment), for the management agent's enrichment phase"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-discover-alt-labels

English | [中文](README.zh.md)

## Summary

TODO: fill in Summary — placeholder seeded from package.json description.

Model-facing discover_alt_labels tool: AI-native SKOS alias discovery over the semantic layer (CL-1 Phase 3 enrichment), for the management agent's enrichment phase

## Table of Contents

- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)


Model-facing discover_alt_labels tool: AI-native SKOS alias discovery over the semantic layer (CL-1 Phase 3 enrichment), for the management agent's enrichment phase

No runtime invariant companion is published because `@deepseek-ai/dsh-tool-discover-alt-labels` owns no independently observable relationship that can diverge from its runtime state.

## Dev Note

None.


## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- Pure suggestion — discovered labels are not written back to the semantic layer.
- Names are capped at 200 characters.
- Callable in the enrichment phase only.
