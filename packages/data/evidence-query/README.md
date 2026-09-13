---
description: "Unified evidence-query backend layer — coverage, gap analysis, reachability, eval results, and asset health for both sidebar and dashboard consumption."
kind: "package-reference"
---

# @deepseek-ai/dsh-evidence-query

English | [中文](README.zh.md)

## Summary

TODO: fill in Summary — placeholder seeded from package.json description.

Unified evidence-query backend layer — coverage, gap analysis, reachability, eval results, and asset health for both sidebar and dashboard consumption.

## Table of Contents

- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)


Unified evidence-query backend layer — coverage, gap analysis, reachability, eval results, and asset health for both sidebar and dashboard consumption.

## Dev Note

None.


## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- Read-only projection — it never writes back to the semantic layer.
- Gap analysis proposes relations but does not persist them.
- Reachability is BFS-bounded with no path-length cap beyond the default.
