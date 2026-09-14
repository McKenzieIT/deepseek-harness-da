---
description: "Retrieval strategy gradient experiment infrastructure: Level 0-3 graph snapshots, blending function variants, precision@K/recall@K harness"
kind: "package-reference"
---

# @deepseek-ai/dsh-retrieval-experiment

English | [中文](README.zh.md)

## Summary

TODO: fill in Summary — placeholder seeded from package.json description.

Retrieval strategy gradient experiment infrastructure: Level 0-3 graph snapshots, blending function variants, precision@K/recall@K harness

## Table of Contents

- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)


Retrieval strategy gradient experiment infrastructure: Level 0-3 graph snapshots, blending function variants, precision@K/recall@K harness

## Dev Note

None.


## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- Level 0-3 graph snapshots are point-in-time — no live streaming.
- Blending variants are research scaffolding, not production-tuned.
- Metrics are precision@K/recall@K only — no nDCG.
