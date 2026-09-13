---
description: "Dedicated management agent session for the full-screen graph management UI — creates a scoped session under the semantic-layer-management preset with read-only parent context reference"
kind: "package-reference"
---

# @deepseek-ai/dsh-management-session

English | [中文](README.zh.md)

## Summary

TODO: fill in Summary — placeholder seeded from package.json description.

Dedicated management agent session for the full-screen graph management UI — creates a scoped session under the semantic-layer-management preset with read-only parent context reference

## Table of Contents

- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)


Dedicated management agent session for the full-screen graph management UI — creates a scoped session under the semantic-layer-management preset with read-only parent context reference

## Dev Note

None.


## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- The parent-context reference is read-only (no write-through).
- The management preset is a separate scope — edits do not auto-reflect in the parent session until reload.
