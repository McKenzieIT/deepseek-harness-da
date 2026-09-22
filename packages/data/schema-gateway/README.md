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
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)


Read-only Remote projection of ctx.schema (SemanticLayerService) for client UI consumption

No runtime invariant companion is published because `@deepseek-ai/dsh-schema-gateway` owns no independently observable relationship that can diverge from its runtime state.

## Dev Note

None.


## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- Read-only — there is no write path through this gateway.
- The BM25 linker index is rebuilt on corpus-version bump, with no live incremental update.
- The projection is client-facing, not the source of truth.
