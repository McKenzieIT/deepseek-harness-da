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
- **Per-scope 凭证寻址** — `pushCredentials` 经 `{scopeId}` per-scope 解析（endpoint/project 来自 scope-registry `metadata.maxcompute`，access_id/key 来自 credentials seam）。Per-scope **密钥** 隔离依赖已挂载的 per-scope-aware 凭证提供方（shipped flat `credentials-local` 忽略该维度，故 access_id/key 全局解析）；endpoint/project 由 scope-registry 真正 per-scope 提供。
- **Bundle 挂载行对账** — `cordis.patch.yml` 有 query-engine 注释占位；trio 挂载时需取消注释并填入真实包名。
- **Post-connect crash-loop 界限** — `operationalCrashes` 计 post-connect 关闭（在 `crashLoopMaxAttempts` 处于 re-spawn 前门控），并在成功重连后重置为 0；connect 阶段关闭计入 `crashAttempts` 而非 `operationalCrashes`（无双重计数）。无滚动稳定性窗口计时器——永不达到成功重连的慢速 flap 仍会累积至该界限。
