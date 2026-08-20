# @deepseek-ai/dsh-query-maxcompute

English | [中文](README.zh.md)

MaxCompute query-engine provider (`ctx.query`): da-self-held raw MCP SDK Client over a stdio sidecar with P1 wiring (A1-split; control tools non-model-facing).

## Overview

Implements `MaxComputeQueryEngine extends QueryEngine` — a Provider that self-holds a raw `@modelcontextprotocol/sdk` `Client` + `StdioClientTransport` connected to a stdio sidecar subprocess. All sidecar tools (`execute`, `attach`, `cancel`, `get_progress`, `estimate_cost`, `set_credentials`, `invalidate_scope`) are called programmatically via raw name; none enter `ctx.tools` (non-model-callable). Features lazy re-spawn on crash (with crash-loop bounded retry), per-call credential push via `set_credentials` (idempotent drop), and outbound cancel via `AbortSignal`.

## Known Limitations and Deferred Work

- **Real pyodps ODPS sidecar** — current sidecar is a Node.js stand-in (`dev/standin-sidecar.mjs`) with fake ODPS behavior; a real Python pyodps sidecar over stdio MCP is deferred.
- **Per-scope ODPS connection cache** — stand-in uses a fake `Map`; real ODPS connection binding with `set_credentials` drop semantics is deferred.
- **OrphanReaper** — ODPS orphan job cleanup after dispose (in-flight ODPS jobs) is deferred to the A1-split engine-wrapper tier (mirrors rbi `orphans.py`).
- **Real e2e testing** — 4 scenarios currently validate P1 wiring against the stand-in, not real ODPS / real credential hot-swap against MaxCompute.
- **Per-scope credential addressing** — `pushCredentials` currently does global `ctx.credentials.resolve(ref)` without threading `scopeId`; multi-scope production (per-game isolation) needs per-scope addressing per P9 decisions.
- **Bundle mount reconciliation** — `cordis.patch.yml` has commented placeholder for query-engine; requires uncommenting with real package names when trio mounts.
- **Stability-window crash-loop counter** — current counter only counts connect failures (reset on success); a tight post-connect crash loop does not trip it. Production hardening should add a stability-window timer.
