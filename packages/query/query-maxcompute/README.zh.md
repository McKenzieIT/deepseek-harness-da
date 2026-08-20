# @deepseek-ai/dsh-query-maxcompute

[English](README.md) | 中文

MaxCompute 查询引擎提供方（`ctx.query`）：da 自持 raw MCP SDK Client 经 stdio sidecar 的 P1 接线（A1-split；控制工具非模型可调用）。

## 概述

实现 `MaxComputeQueryEngine extends QueryEngine`——一个自持 `@modelcontextprotocol/sdk` 原始 `Client` + `StdioClientTransport` 连接到 stdio sidecar 子进程的 Provider。所有 sidecar 工具（`execute`、`attach`、`cancel`、`get_progress`、`estimate_cost`、`set_credentials`、`invalidate_scope`）均通过 raw name 程序化调用，无一进入 `ctx.tools`（非模型可调用）。特性包括崩溃时懒重启（crash-loop 有界重试）、per-call 凭证推送经 `set_credentials`（幂等 drop）、出站取消经 `AbortSignal`。

## Model Experience

间接，通过 nl2sql engine 的 `query_data` 和 `check_query` 工具，将执行后的 SQL 结果送入模型 prompt；该 provider 自身不注册任何 tool、prompt 或 schema。

#### KV Cache effect

无直接失效；消费方 engine 拥有查询结果带来的任何请求前缀变更。

## Known Limitations and Deferred Work

- **真实 pyodps ODPS sidecar** — 当前 sidecar 为 Node.js stand-in（`dev/standin-sidecar.mjs`），行为为 fake ODPS；真实 Python pyodps sidecar 经 stdio MCP 延后。
- **Per-scope ODPS 连接缓存** — stand-in 使用 fake `Map`；真实 ODPS 连接绑定及 `set_credentials` drop 语义延后。
- **OrphanReaper** — dispose 后 ODPS 孤儿作业清理（在途 ODPS 作业）延后至 A1-split engine-wrapper 梯度（镜像 rbi `orphans.py`）。
- **真实 e2e 测试** — 4 个场景当前验证 P1 接线对 stand-in，非真实 ODPS / 真实凭证热切换对 MaxCompute。
- **Per-scope 凭证寻址** — `pushCredentials` 当前为全局 `ctx.credentials.resolve(ref)`，未 thread `scopeId`；多 scope 生产（per-game 隔离）需按 P9 决策实现 per-scope addressing。
- **Bundle 挂载行对账** — `cordis.patch.yml` 有 query-engine 注释占位；trio 挂载时需取消注释并填入真实包名。
- **稳定性窗口 crash-loop 计数器** — 当前计数器仅计 connect 失败（成功则重置）；post-connect 立即崩的紧密循环不会触发。生产硬化应增加稳定性窗口计时器。
