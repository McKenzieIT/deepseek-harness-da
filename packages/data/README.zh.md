# data/ — data-agent 能力族

[English](README.md) | 中文

data-agent 的 data 能力包：query、retrieval/向量化、semantic layer、audit、admin——[`dsh-data-agent`](../bundle/data-agent/README.md) bundle 挂载（各包就绪前为注释占位）、四阶段 preset 按会话组合的能力。均为 **product** 包，跨 P4-P11 建设；当前均未发布，下表列计划包，名字由所属 ticket 定。

| Package | Role | ctx key |
|---|---|---|
| `query-engine/` *（计划，P4）* | 查询引擎 seam：`QueryEngine` 协议 + 每引擎 `conventions.yaml`；MaxCompute 为首引擎 | `ctx.query` |
| `embedder/` *（计划，P5）* | embedder seam；默认轻量进程内，重模型作可选外置插件 | `ctx.embedder` |
| `retrieval/` *（计划，P5）* | retrieval seam；默认 sqlite-vec/内存，hybrid 作 retriever 组合插件 | `ctx.retrieval` |
| `semantic-layer/` *（计划，P6）* | 语义层（埋点 + 表）——data-agent 一等公民能力；engine schema 读取解耦到查询引擎 | — |
| `audit/` *（计划，P8）* | guard/session-event + `tool-audit` + `ctx.storage`（SQLite） | — |
| `admin/` *（计划，P9）* | harness app：per-game scope/credential/access-link + 系统配置 | — |

规则：[package](../AGENTS.md)、[root](../../AGENTS.md#conventions)。新包随所属 ticket（P4-P11）发包加入本 group。
