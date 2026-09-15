---
description: "Model-facing get_definition tool: load a unified data asset definition (table, event, or metric) by name from the semantic layer"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-get-definition

English | [中文](README.zh.md)

## Summary

TODO: fill in Summary — placeholder seeded from package.json description.

Model-facing get_definition tool: load a unified data asset definition (table, event, or metric) by name from the semantic layer

## Table of Contents

- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)


Model-facing get_definition tool: load a unified data asset definition (table, event, or metric) by name from the semantic layer

No runtime invariant companion is published because `@deepseek-ai/dsh-tool-get-definition` owns no independently observable relationship that can diverge from its runtime state.

## Dev Note

None.


## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- Single-asset lookup — there is no batch variant.
- The name must be exact-match resolved; there is no fuzzy matching.
- Names are capped at 200 characters.
