---
description: "Model-facing revert_edit tool: roll back a semantic layer asset to a prior definition snapshot"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-revert-edit

English | [中文](README.zh.md)

## Summary

TODO: fill in Summary — placeholder seeded from package.json description.

Model-facing revert_edit tool: roll back a semantic layer asset to a prior definition snapshot

## Table of Contents

- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)


Model-facing revert_edit tool: roll back a semantic layer asset to a prior definition snapshot

## Dev Note

None.


## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- Rolls back to a prior snapshot only — no branching history.
- Snapshot availability is audit-trail-dependent.
- The revert itself is audited.
