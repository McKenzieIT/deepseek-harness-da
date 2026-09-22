---
description: "Admin + access isolation: per-user login, identity, scope resolution, PAT self-service, fail-closed authz"
kind: "package-reference"
---

# @deepseek-ai/dsh-admin

English | [中文](README.zh.md)

## Summary

TODO: fill in Summary — placeholder seeded from package.json description.

Admin + access isolation: per-user login, identity, scope resolution, PAT self-service, fail-closed authz

## Table of Contents

- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)


Admin + access isolation: per-user login, identity, scope resolution, PAT self-service, fail-closed authz

No runtime invariant companion is published because `@deepseek-ai/dsh-admin` owns no independently observable relationship that can diverge from its runtime state.

## Dev Note

None.


## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- The user store is in-memory with no persistence seam wired here.
- PAT management is self-service only; there is no admin-issued token flow.
- Authz is fail-closed — a missing rule denies, not allows.
