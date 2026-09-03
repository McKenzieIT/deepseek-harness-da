# Agent Note: result.get RPC — exposing the result-cache seam over the apiproxy wire

Status: implemented

## Problem

The host-side result-cache seam (`ctx.resultCache` — `@deepseek-ai/dsh-result-cache`, in-memory and session-scoped, keyed by `qr_`/`cr_` ids) stores every `query_data` and `compute` result so later turns can reference them by `result_id`. It was browser-unreachable: `RpcMethodMap` registered no `result.get` row, so a client holding a `result_id` could not fetch its rows. The v1 client workaround scanned the same turn's `query_data` TSV text, which fails for any cross-turn reference and once event-window compaction drops the carrying message. A client object-layer result cache needs a cache-miss path, and that path is this RPC.

## Decision

`result.get` is registered over the established apiproxy pattern — one new contract file pair (`api/results.ts` + `api/results.schema.ts`) plus one row in each of the four compiler-locked mirrors (`RpcMethodMap`, `IApiClient`, `AbstractApiClient.UNARY_VALUE_SCHEMAS`, the handler's `UNARY_ROUTES`), exactly as every other unary domain is added ([GUI layering and the RPC protocol](2026-07-19-gui-layering-and-rpc-protocol.md)). The host handler in `createApiProxy` reads the seam and returns its entry.

- **Optional seam: `ctx.get('resultCache')`, not `ctx.resultCache`.** The result-cache provider is mounted by data bundles, not by every composition; a deployment without it still serves every other domain. The handler resolves the service optionally and answers `internal` (service absent) rather than dereference an unset property — the package convention that optional services use `ctx.get(name)`, matching `credentials`, `settings`, and `approval`.
- **`result-not-found` is a business miss, not a transport fault.** A `result_id` that is cross-session, aged out with the session, or never stored returns `{ code: 'result-not-found', details: { resultId } }` — a new row in `RpcErrorDetailsMap` and its `rpcErrorSchema` branch. A client can branch on it (retry, re-query, or show "no longer available") without conflating it with a carrier failure, the way `session-not-found` and `queue-item-not-found` already do for their lookups.
- **Day-1 returns the full entry; pagination is deferred.** `get()` returns the complete `ResultEntry` (columns/rows/metadata). A later `result.getPage` lands non-destructively alongside, never changing this method.
- **The wire `ResultEntry` is defined locally in the contract, not imported.** `api/results.ts` declares its own `ResultEntry`/`ResultMetadata` mirroring the host type, so the browser-safe contract layer (`api/`, zero Node dependencies) stays free of the result-cache package's `Service`/`Context` surface — the same stance `CredentialView` takes for the credentials seam. The host handler returns the seam's `ResultEntry` directly; structural identity makes it assignable without a cast.

## Alternatives considered

### Why not `ctx.resultCache` (the declared property) over `ctx.get('resultCache')`?

The augmentation declares `resultCache: ResultCache` on `Context`, so `ctx.resultCache` typechecks as always-present. But the property proxy is topology-sensitive and a composition without a result-cache provider would dereference `undefined`; `ctx.get` reads the global service store and returns `undefined` cleanly, which the handler turns into the `internal` (service-absent) error.

### Why not import `ResultEntry` from `@deepseek-ai/dsh-result-cache` into the contract?

A type-only import would erase at runtime, but the emitted client declaration would carry a transitive edge to the result-cache package, and the value type would resolve through the package root that also declares the `ResultCache` service and the `Context` merge — risking the gateway-drag failure the `agentPresets` member documents. Defining the wire shape locally keeps `api/` self-contained and browser-safe by construction.

### Why not overload `internal` for a missing id instead of a new `result-not-found` code?

A missing `result_id` is an expected, recoverable client condition (retry or re-query), not an internal fault. Folding it into `internal` would deny the client a branch point and read as a server bug. The dedicated code closes the set the way `session-not-found` and `queue-item-not-found` already do.

### Why not paginate now?

The seam's `get()` returns the full entry and no consumer yet exceeds the day-1 row cap (the table render virtualizes and caps). Pagination adds a second method, a cursor contract, and a partial-entry wire shape before any caller needs it; `result.getPage` can be added later without touching `result.get`.

## Consequences

The result-cache seam is now reachable from the browser, which unblocks the client object-layer result cache (the miss path) and, with it, cross-turn `result_id` references and `compute`-derived results in the INTERPRETATION renderers. The seam stays optional: a composition without a result-cache provider answers `internal` for this one method and every other domain is unaffected. The four-mirror registration keeps the contract mechanically complete — a future `result.getPage` adds a fifth row in each mirror the same way. Pagination, file-backed persistence, and cross-session sharing remain deferred (the seam is session-scoped in-memory by design).
