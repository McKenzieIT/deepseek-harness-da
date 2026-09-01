# data/ — data-agent capability family

English | [中文](README.zh.md)

The data-agent's data capability packages: query, retrieval/vectorization, semantic layer, audit, and admin — the capabilities the [`dsh-data-agent`](../bundle/data-agent/README.md) bundle mounts (as commented placeholders until each ships) and the four-phase preset composes per session. All are **product** packages, built across P4-P11; none ship yet, so the table below lists planned packages with names resolved by their owning ticket.

| Package | Role | ctx key |
|---|---|---|
| `query-engine/` *(planned, P4)* | The query engine seam: `QueryEngine` protocol + per-engine `conventions.yaml`; MaxCompute as the first engine | `ctx.query` |
| `embedder/` *(planned, P5)* | The embedder seam; default lightweight in-process, heavy models as optional external plugins | `ctx.embedder` |
| `retrieval/` *(planned, P5)* | The retrieval seam; default sqlite-vec/in-memory, hybrid as a retriever-composition plugin | `ctx.retrieval` |
| `semantic-layer/` *(planned, P6)* | The semantic layer (loaders + tables) — a first-class data-agent capability; engine schema read decoupled to the query engine | — |
| `audit/` *(planned, P8)* | guard/session-event + `tool-audit` + `ctx.storage` (SQLite) | — |
| `admin/` *(planned, P9)* | The harness app: per-game scope/credential/access-link + system config | — |

Rules: [package](../AGENTS.md), [root](../../AGENTS.md#conventions). New packages join this group as their owning tickets (P4-P11) ship them.
