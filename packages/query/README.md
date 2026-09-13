---
description: "The query-engine capability group: the abstract ctx.query seam for SQL execution, the MaxCompute and Postgres providers, and the model-facing query-tool consumer for the data agent."
kind: "package-group"
---

# query/ — query-engine seam family

English | [中文](README.zh.md)

## Summary

The `query/` group owns the data agent's SQL-execution capability. The core `query` package defines the abstract `QueryEngine` (`ctx.query`) contract — the four seam operations `execute` / `attach` / `cancel` / `getProgress`, the `getConventions()` dialect-grounding seam, and the 3-state `QueryOutcome` vocabulary (Completed / Pending / Failed) — and is the Def half of the query-trio. `query-maxcompute` is the first Provider (raw MCP SDK client over a stdio sidecar), `query-postgres` a second engine, and `query-tool` the model-facing consumer surface. NL-to-SQL translation is deliberately out of scope (C1: the seam accepts strict SQL; NL→SQL lives in the semantic layer). All are **product** packages built across P4; each README owns its per-package contract.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

| Package | Role | ctx key |
|---|---|---|
| [`query/`](query/README.md) | Abstract `QueryEngine` seam (Def): 4 seam ops + `getConventions()` + `QueryOutcome` | `ctx.query` |
| [`query-maxcompute/`](query-maxcompute/README.md) | MaxCompute Provider over a stdio MCP sidecar with per-call credential push | registers on `ctx.query` |
| [`query-postgres/`](query-postgres/README.md) | Postgres query-engine Provider | registers on `ctx.query` |
| [`query-tool/`](query-tool/README.md) | Model-facing query tool consumer surface over `ctx.query.execute` | consumes `ctx.query` |

-----

<a id="related-documentation"></a>
## Related documentation

- [Data Agent subsystem — `ctx.query`](../../docs/subsystems/data-agent.md#ctxquery--queryengine-abstract-seam) — the generated Cordis-surface contract for the query-engine seam and its place in the data-agent overlay.

<a id="dev-note"></a>
## Dev Note

None.
