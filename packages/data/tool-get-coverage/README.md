---
description: "Model-facing get_coverage tool: semantic layer coverage statistics (total assets by kind, domain breakdown, confirmation status)"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-get-coverage

English | [中文](README.zh.md)

## Summary

TODO: fill in Summary — placeholder seeded from package.json description.

Model-facing get_coverage tool: semantic layer coverage statistics (total assets by kind, domain breakdown, confirmation status)

## Table of Contents

- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)


Model-facing get_coverage tool: semantic layer coverage statistics (total assets by kind, domain breakdown, confirmation status)

No runtime invariant companion is published because `@deepseek-ai/dsh-tool-get-coverage` owns no independently observable relationship that can diverge from its runtime state.

## Dev Note

None.


## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- Read-only counts; it does not mutate the semantic layer.
- Coverage reflects the on-disk semantic layer — in-flight edits are not counted until persisted.
- Domain breakdown is by domain tag only.
