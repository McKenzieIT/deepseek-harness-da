---
description: "Model-facing edit_definition tool: apply partial patches to semantic layer asset definitions with audit trail"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-edit-definition

English | [中文](README.zh.md)

## Summary

TODO: fill in Summary — placeholder seeded from package.json description.

Model-facing edit_definition tool: apply partial patches to semantic layer asset definitions with audit trail

## Table of Contents

- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)


Model-facing edit_definition tool: apply partial patches to semantic layer asset definitions with audit trail

## Dev Note

None.


## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- Supports partial patches only — there is no full-replace mode.
- The audit trail is append-only; undo is bounded by `revert_edit` and there is no branching history.
- Asset names are capped at 200 characters.
