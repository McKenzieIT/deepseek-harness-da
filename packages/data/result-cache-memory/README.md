# @deepseek-ai/dsh-result-cache-memory

In-memory, session-scoped implementation of the `ctx.resultCache` storage seam
from `@deepseek-ai/dsh-result-cache`. Stores entries in a `Map` keyed by
`result_id` and hooks `tools/post-execute` to capture `query_data` completed
results automatically, so the model can reference a query's rows by id in
subsequent `present_table` / `compute` calls.

## Overview

A Cordis function plugin (`name` / `inject` / `apply`) that instantiates a
`MemoryResultCache` and registers a `tools/post-execute` waterfall listener.
The listener inspects completed `query_data` results, derives a deterministic
`qr_<hash>` id from the SQL string, caches the `{ columns, rows, metadata }`
entry, and injects `result_id` into the returned value.

Result id prefixes:

- `qr_` — query-engine results, auto-captured from `query_data`. SQL-derived;
  rows may change between executions (time-windowed / real-time queries), so the
  entry is overwritten with the latest result (idempotent when unchanged). The
  post-execute listener never throws — it runs inside `execute`'s outer
  try/catch, and a throw would turn a successful query into `isError` and serve
  stale rows under the returned `result_id`.
- `cr_` — compute-derived results, stored via explicit `put` by
  `@deepseek-ai/dsh-tool-compute`. Immutable-once-written: `put` throws on a
  conflicting entry, enforcing the deterministic-compute contract.

## Verification

```sh
tsc -b packages/data/result-cache-memory/tsconfig.json   # typecheck
pnpm vitest run packages/data/result-cache-memory         # unit specs
```

## Model Experience

The cache makes a `query_data` result self-describing: each completed result is
augmented with a short `result_id` token (`qr_<12-char hex>`) that the model can
pass to `present_table` (`result_id`) or `compute` (chained `source_result_id`)
instead of re-embedding the full row set in the prompt. This keeps tool
arguments compact and lets the model reference prior results by id across
turns within the same session.

### KV Cache effect

Minimal and indirect. The cache itself is in-process `Map` memory and never
enters a model prompt; only the short `result_id` string is surfaced in the
`query_data` result value. Because the augmented value is deterministic for a
given SQL string (the id is a stable hash), repeated `query_data` calls against
the same SQL produce the same `result_id`, which helps prompt-prefix stability
for tools that echo the id back.

## Known Limitations and Deferred Work

- **Session-scoped, no durability** — entries live in a `Map` on the plugin
  context and are GC'd with it; there is no persistence across process restarts
  or sessions. A durable backend (e.g. on top of `storage-domain`) is deferred.
- **No row/byte bound here** — this store enforces only `cr_` immutability; it
  does not bound row count or total size of a cached entry. `tool-compute`
  enforces its own bounds on the compute results it `put`s; a store-level bound
  is deferred to a future hardening pass.
- **`qr_` overwrite is last-write-wins** — if the same SQL returns different
  rows across executions (real-time queries), the latest result shadows earlier
  ones under the same `result_id`; a model that cached a `result_id` from an
  earlier turn may present rows that have since changed. Versioned ids are
  deferred.
- **Export shape** — the package ships the function-plugin form
  (`name` / `inject` / `apply`) as the sole export shape; `export default` was
  removed because the cordis Loader's `unwrapExports` would otherwise discard
  the function-plugin namespace (and the `tools/post-execute` auto-capture
  hook) when a `default` is present.
