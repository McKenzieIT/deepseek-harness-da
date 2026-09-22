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
- [Remote gateway](#remote-gateway)
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

- `data-scope/bound` (declaration-merged into `SessionEventMap`): `{ dataScopeId: string; workspaceId: WorkspaceId }`. Appended once immediately after a Management Session is created, before its first turn. Adding this event is session-vocabulary growth and does not bump `SESSION_FORMAT_VERSION`.
- `dataScope` projection (`SessionProjectionMap['dataScope']`): folds `data-scope/bound` into `{ dataScopeId } | null`. It surfaces the bound scope to the Session list cold, from the projection cache, so a listing consumer identifies the managed scope without opening full history.

## Remote gateway

`ManagementContextGateway` (a `TypertRemoteService`, `managementContext` namespace) exposes `managementContext/resolveOrCreate` and `managementContext/createNew`. It only forwards to the service — the service is the authority. Both the service and the gateway are wired through `packages/bundle/data-agent/cordis.patch.yml`.

## Model Experience

This service creates a separate Management Session; the model inside that session sees the `semantic-layer-management` preset's tools and prompt sections (documented by that preset). The resolution itself sends nothing to any model.

The `data-scope/bound` event is persistence and client-list metadata, not model-visible input: it is not projected into any system prompt or user message.

#### KV Cache effect

None on the primary agent loop: the service neither modifies the request prefix nor invalidates cache entries. The Management Session it creates is a distinct session with its own request prefix.

## Known Limitations and Deferred Work

- The predecessor `@deepseek-ai/dsh-management-session` (low-level `ctx.sessions.prepare/enter/announce`) is retired separately by W32; this package does not delete it.
- Default recovery lists every visible Session and filters by Workspace membership; a per-workspace cold index is deferred until listing cost warrants it.
