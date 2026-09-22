---
description: "The query-engine capability group: the abstract ctx.query seam for SQL execution, the MaxCompute and Postgres providers, and the model-facing query-tool consumer for the data agent."
kind: "package-group"
---

# query/ — query-engine seam family

English | [中文](README.zh.md)

## Summary

The `query/` group owns SQL execution for the data agent. `query` defines the `ctx.query` contract, dialect conventions, and completed, pending, or failed outcomes. `query-maxcompute` and `query-postgres` provide engines; `query-tool` exposes execution to the model. Natural-language translation remains in the semantic layer, while this family accepts explicit SQL and owns execution, cancellation, attachment, progress, and dialect grounding.

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
