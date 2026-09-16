---
description: "Model-facing resolve_term tool: exact alias resolution from SKOS pref_label/alt_labels via the relation graph's reverse index"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-resolve-term

English | [中文](README.zh.md)

## Summary

TODO: fill in Summary — placeholder seeded from package.json description.

Model-facing resolve_term tool: exact alias resolution from SKOS pref_label/alt_labels via the relation graph's reverse index

## Table of Contents

- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)


Model-facing resolve_term tool: exact alias resolution from SKOS pref_label/alt_labels via the relation graph's reverse index

No runtime invariant companion is published because `@deepseek-ai/dsh-tool-resolve-term` owns no independently observable relationship that can diverge from its runtime state.

## Dev Note

None.


## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- Exact alias resolution only — no fuzzy or typo tolerance.
- Resolution depends on the relation graph being available.
- Scope-bound — it does not resolve across scopes.
