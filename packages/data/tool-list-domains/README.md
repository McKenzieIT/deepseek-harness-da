---
description: "Model-facing list_domains tool: enumerate semantic layer domains with asset counts per kind"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-list-domains

English | [中文](README.zh.md)

## Summary

TODO: fill in Summary — placeholder seeded from package.json description.

Model-facing list_domains tool: enumerate semantic layer domains with asset counts per kind

## Table of Contents

- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)


Model-facing list_domains tool: enumerate semantic layer domains with asset counts per kind

## Dev Note

None.


## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- Enumerate only — there is no domain CRUD in this tool.
- Counts are per kind, not per relation.
- `alt_labels` are returned but not resolved.
