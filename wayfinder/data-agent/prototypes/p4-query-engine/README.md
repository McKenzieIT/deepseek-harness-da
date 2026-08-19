# P4 query-engine trio — PROTOTYPE (throwaway)

> ⚠️ **THROWAWAY PROTOTYPE.** Not a shipped package. Not production code. The validated shape will be reimplemented as real `packages/query/{query,query-maxcompute,query-tool}` Cordis packages (TS, Schemastery, real `dsh-mcp-client`) — that is a **production step**, not this prototype. This dir is the primary-source artifact for wayfinder ticket **P4**; do not promote it. See `/wayfinder/data-agent/tickets/phase-2/P4-query-engine.md`.

## The question it answers

Does the **query-engine trio** state model feel right? — `ctx.query` seam (engine-wrapper guard chain) + `query-maxcompute` provider (external sidecar via mcp-client, creds via spawn env) + `tool-query` consumer (session gates, 3-execute) + 3-state `QueryOutcome`, and the `credentials/updated → invalidate_scope` flow.

## Locked decisions (see ticket P4 + research notes)

- **A1-split**: `ctx.query.execute` owns engine-wrapper gates (cost/timeout/retry/orphan — mirror `pipeline.py`+`core/guards`); session gates (G1/G5/budget/near-dup/halt/cache) stay in `tool-query` (mirror `execution.py`). Sidecar = dumb raw executor + per-scope cache. (`research/p4-guard-chain-placement.md`)
- **C1**: tool-query takes strict SQL (+ scope_id); NL→SQL is semantic layer P6 (separate).
- **B**: seam exposes `execute/attach/cancel/get_progress` + 3-state `QueryOutcome`; `estimate_cost` internal to CostGuard; no `getEngine`; `health_check` deferred. (`research/p4-build-defaults.md`)
- **D**: real impl = `packages/query/{query,query-maxcompute,query-tool}` (`@deepseek-ai/dsh-*`, mirror credentials seam/provider split).
- **E**: `credentials/updated → invalidate_scope` sidecar tool (surgical); reconnect as crash fallback only.
- **F2**: fake MCP server subprocess via mcp-client stand-in (demos stdio-env cred injection + cross-process `invalidate_scope` + sidecar per-scope cache).
- **G**: stub both guard layers; 3-execute pattern load-bearing; must-demo cost+timeout+G5; retry/orphan/G1 minimal.

## Run

```
node run.mjs            # interactive menu
node run.mjs --demo     # auto-run all 4 scenarios, print state after each, exit
```

## Assumptions (react to these)

1. **Stand-in mcp-client link.** parent↔sidecar speaks minimal line-delimited JSON over stdio, **not** the real MCP protocol, and does **not** use the real `dsh-mcp-client` Cordis plugin. It demonstrates the R2 wiring *points* (creds via spawn env, cross-process `invalidate_scope`, sidecar per-scope cache) without the full Cordis/Schemastery/MCP machinery. Real `dsh-mcp-client` wiring is a production step.
2. **`.mjs`, not TS.** Throwaway; no build step. Real impl is TS.
3. **Gates stubbed.** cost/timeout/retry/orphan + G1/G5 are cheap stubs (mode-controlled outcomes), not real MaxCompute.

## Surfaced tension (the prototype's main finding)

**F2 spawn-env cred injection is incoherent with "per-call resolve + invalidate without restart".** The sidecar receives creds via SPAWN env (fixed at spawn). A `credentials/updated` change → `invalidate_scope` drops the sidecar's per-scope connection cache, but the sidecar rebuilds the next connection from **stale spawn-env creds**. To actually pick up a new cred you must either (a) **restart the sidecar** (reconnect) — which drops *all* scopes' caches (over-broad, contra E) — or (b) switch cred injection from spawn-env to a **per-call `set_credentials` sidecar channel** (creds flow da→sidecar per call, not spawn env), which diverges from R2 §5.2c "StdioConfig.env".

Run scenario 4 to see it. This likely **refines E/F2**: either accept reconnect-for-cred-change (then `invalidate_scope` is only for non-cred config changes), or move cred injection off spawn-env onto a per-call channel.

## Files

- `run.mjs` — da-side orchestrator (ctx.credentials, mcp-client stand-in, ctx.query seam + engine-wrapper chain, tool-query consumer, interactive menu).
- `sidecar.mjs` — fake MaxCompute sidecar subprocess (per-scope connection cache + instances, creds from spawn env, minimal stdio JSON).
