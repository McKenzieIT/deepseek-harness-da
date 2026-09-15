---
description: "Postgres query-engine provider (ctx.query): GA-GT2-D4 second-engine stub proving the engine-neutral abstraction — getConventions loads a Postgres dialect; execute/attach/cancel/getProgress throw not-implemented (seam proof, not a real PG executor)"
kind: "package-reference"
---

# @deepseek-ai/dsh-query-postgres

English | [中文](README.zh.md)

## Summary

TODO: fill in Summary — placeholder seeded from package.json description.

Postgres query-engine provider (ctx.query): GA-GT2-D4 second-engine stub proving the engine-neutral abstraction — getConventions loads a Postgres dialect; execute/attach/cancel/getProgress throw not-implemented (seam proof, not a real PG executor)

## Table of Contents

- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)


Postgres query-engine provider (ctx.query): GA-GT2-D4 second-engine stub proving the engine-neutral abstraction — getConventions loads a Postgres dialect; execute/attach/cancel/getProgress throw not-implemented (seam proof, not a real PG executor)

No runtime invariant companion is published because `@deepseek-ai/dsh-query-postgres` owns no independently observable relationship that can diverge from its runtime state.

## Dev Note

None.


## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- Stub only — `getConventions` loads a Postgres dialect, but `execute`/`attach`/`cancel`/`getProgress` throw not-implemented.
- This is a seam proof for the engine-neutral abstraction, not a real Postgres executor.
