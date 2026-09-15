---
description: "Scope-routing tools for the data agent: list_scopes, switch_scope + alias-based system-prompt hints for automatic scope detection"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-scope-routing

English | [中文](README.zh.md)

## Summary

TODO: fill in Summary — placeholder seeded from package.json description.

Scope-routing tools for the data agent: list_scopes, switch_scope + alias-based system-prompt hints for automatic scope detection

## Table of Contents

- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)


Scope-routing tools for the data agent: list_scopes, switch_scope + alias-based system-prompt hints for automatic scope detection

No runtime invariant companion is published because `@deepseek-ai/dsh-tool-scope-routing` owns no independently observable relationship that can diverge from its runtime state.

## Dev Note

None.


## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- The alias-based scope hint is advisory — the model may still misroute.
- `list_scopes`/`switch_scope` mutate session scope state.
- There is no scope CRUD here.
