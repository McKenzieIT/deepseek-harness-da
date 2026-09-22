---
description: "Resolves a Management Context (Workspace × Data Scope) to a persistent Management Session via upstream public interfaces, with per-context single-flight and a durable data-scope binding."
kind: "package-reference"
---

# @deepseek-ai/dsh-management-context

English | [中文](README.zh.md)

## Summary

`ctx.managementContext` resolves a **Management Context** — the pair `Workspace × Data Scope` — to a persistent **Management Session**. It uses only upstream public interfaces: it creates an ordinary Session through `ctx.sessionController.create()` pinned to the `semantic-layer-management` preset, then records the managed Data Scope as a durable `data-scope/bound` session event. The `dataScope` projection surfaces that binding to the client Session list without opening full history.

This package is fork-owned. It adds no data-agent behavior to the upstream `api-remotes` package, the Session Controller, or `packages/core/session` (the only edit under `core/session` is the generated persistence catalog that registers the `data-scope/bound` event vocabulary).

## Table of Contents

- [Service API](#service-api)
- [Semantics](#semantics)
- [Session event and projection](#session-event-and-projection)
- [Durable binding](#durable-binding)
- [Cold-cache recovery semantics](#cold-cache-recovery-semantics)
- [Remote gateway](#remote-gateway)
- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

No runtime invariant companion is published: this package owns no independently observable relationship that could diverge from its runtime state (membership lives in the Workspace registry, the binding in the session log and projection cache).

## Service API

- `resolveOrCreate({ workspaceId, dataScopeId }): Promise<{ sessionId, created }>` — resolve the context to its Management Session, creating one only when none exists yet.
- `createNew({ workspaceId, dataScopeId }): Promise<{ sessionId, created }>` — always create another Management Session for the context.

## Semantics

- **Concurrency (single-flight).** `resolveOrCreate` is single-flighted per `(workspaceId, dataScopeId)`. Two concurrent default calls for the same context create exactly one session and return the same `sessionId`. The in-flight map is a per-call de-duplication window only, deleted when the resolution settles — never the authority on which session a context maps to.
- **Idempotency and recovery.** A default resolve re-derives the session from the target Workspace's durable session membership (`workspace.sessionIds`) and the persisted `agentPreset` and `dataScope` projection values read cold from the Session list — never an in-memory binding map. It therefore survives a process restart. When several matching sessions exist it selects the newest by `updatedAt`.
- **No fallback (fail loud).** A missing Workspace, missing Data Scope, unavailable `semantic-layer-management` preset, or failed session creation each throw. There is no default preset and no active-scope fallback. The Data Scope id is never inferred from the Workspace name, path, Session title, or a process-level active scope; it is validated only via `ctx.scopes.get(dataScopeId)`.
- **Immutable binding; deletion.** The binding is recorded once and never rebound. After a Data Scope is deleted from the registry the prior `data-scope/bound` event stays readable (history is retained and the projection still surfaces it), but new management operations for that scope fail because validation no longer resolves the scope.

## Session event and projection

- `data-scope/bound` (declaration-merged into `SessionEventMap`): `{ dataScopeId: DataScopeId; workspaceId: WorkspaceId }`. The `dataScopeId` is a branded cross-process id (`Branded<'DataScopeId'>`), consistent with `SessionId` and `WorkspaceId`; the brand erases at runtime so the persisted event and wire payload stay plain JSON. Appended once immediately after a Management Session is created, before its first turn. Adding this event is session-vocabulary growth and does not bump `SESSION_FORMAT_VERSION`.
- `dataScope` projection (`SessionProjectionMap['dataScope']`): folds `data-scope/bound` into `{ dataScopeId } | null`. It surfaces the bound scope to the Session list cold, from the projection cache, so a listing consumer identifies the managed scope without opening full history.

## Durable binding

`createSession` flushes the binding to durable storage before `resolveOrCreate`/`createNew` returns. When the `sessionProjectionCache` service is available (the production path), its `write(session)` method takes the projection checkpoint cut, flushes the session log via `ctx.sessions.flush(session)`, and writes the cache rows — so a cold read or a reopened process sees the `dataScope` projection without opening full history. When the cache service is absent (the unit-test harness), the method falls back to a bare log flush.

## Cold-cache recovery semantics

The Session-list cold hint is explicitly partial: a member session may carry no projection block at all, or a block whose `agentPreset` or `dataScope` cell is missing. `findExisting` distinguishes three outcomes:

- **found** — a member session whose cold projection confirms the management preset and the target Data Scope; reuse it.
- **no-match** — every member session's cold projection is readable and none is a management session bound to the target scope; safe to create.
- **unknown** — at least one member session's cold projection is missing or stale. The scan cannot rule it out as the target, so `resolveOrCreate` **fails loud** (throwing a clear error) instead of silently creating a duplicate. The caller warms the projection cache and retries.

## Remote gateway

`ManagementContextGateway` (a `TypertRemoteService`, `managementContext` namespace) exposes `managementContext/resolveOrCreate` and `managementContext/createNew`. It only forwards to the service — the service is the authority. Both the service and the gateway are wired through `packages/bundle/data-agent/cordis.patch.yml`.

## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The `sessionProjections.register()` call in the `ManagementContextService` constructor already owns its fiber effect (the registry's `register` method uses `ctx.effect` internally). The service does NOT add a redundant `ctx.effect` around it — disposing the service fiber (e.g. during HMR) automatically unregisters the `dataScope` projection, and re-mounting the service re-registers it.

The test factory in `durable-binding.spec.ts` replicates the agent loop's persistence attachment (`prepare` → `persistence.create` → `enter` + `announce`) so that live `session/event` dispatches route into the JSONL backend by session id. A factory that uses `ctx.sessions.create()` (which publishes immediately, before the persistence handle exists) would leave events un-persisted — the same gotcha the production agent loop avoids by splitting prepare from announce.

</details>

## Model Experience

None, as the service resolves a Management Context to a persistent Management Session and records a durable data-scope binding; it sends nothing to any model and registers no prompt, tool, or model-facing event. The `data-scope/bound` event is persistence and client-list metadata, not model-visible input.

#### KV Cache effect

No effect on the primary agent loop: the service neither modifies the request prefix nor invalidates cache entries. The Management Session it creates is a distinct session with its own request prefix.

## Known Limitations and Deferred Work

- The durable binding does not yet constrain tool-edit-definition execution: a Session bound to scope A still has source-code paths through `ctx.schema` / `schema.semanticRoot` that can read or write under a different (process-active) scope, and a tool invocation after the bound scope is deleted is not yet rejected. This requires a fork-owned execution-entry owner that consumes the durable binding and coordinates with W22's patrol write duties. It is recorded as a Known Limitation, not a separate ticket, pending the ownership boundary with W22.
- The predecessor `@deepseek-ai/dsh-management-session` (low-level `ctx.sessions.prepare/enter/announce`) is retired separately by W32; this package does not delete it.
- Default recovery lists every visible Session and filters by Workspace membership; a per-workspace cold index is deferred until listing cost warrants it.
