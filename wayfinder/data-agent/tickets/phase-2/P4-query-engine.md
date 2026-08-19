# P4 — query-engine trio

**Type**: prototype
**Phase**: 2
**Assignee**: claude
**Status**: Resolved（A1-split + C1 + B/D/E/F2/G；prototype 验证）
**Blocked by**: ~~R2~~（已解）

**Question**: `ctx.query` Service Definition + `query-maxcompute` Provider（外置 sidecar 经 mcp-client）+ `tool-query` Consumer + Guard chain。Phase 2。

**Design (per R2)**: query-maxcompute sidecar = mcp-client 实例（serverName:query-maxcompute），per-call `ctx.credentials.resolve(ref)`，`scope_id` 显式工具入参，凭证经 stdio env 注入（不进 args），sidecar 自有 per-scope ODPS 缓存（复刻 ScopeConnection），监听 credentials/updated → invalidate；不复制 override-factory。

## Resolution（resolved）

**Locked decisions**（grilling + 2 篇 cited research 笔记 + prototype 验证）：

- **A1-split**：`ctx.query.execute` owns **engine-wrapper 门**（cost/timeout/retry/orphan，镜像 rbi `pipeline.py:run_query_async` + `core/guards/*`）；**会话门**（G1 采样/G5 COUNT/budget/near-dup/halt/cache/required_predicates）留 `tool-query` consumer（镜像 `execution.py:_query_data_impl`）。sidecar = dumb raw executor + 自有 per-scope 缓存。da 侧每次 `ctx.query.execute` 各取一个 per-query executor → `self._instance` 不被 G1/G5/主查询覆写 → canceller_for 纪律比 rbi 更简单。〔research/p4-guard-chain-placement.md〕
- **C1**：tool-query 入参 strict SQL（+ scope_id）；NL→SQL 归语义层 P6（独立组件）。
- **B**：`ctx.query` 暴露 `execute/attach/cancel/get_progress` + 3-state `QueryOutcome`（Completed/Pending/Failed）；`estimate_cost` 是 CostGuard 内部调 provider、不进 seam 公开面；`attach` 是 da 侧续取入口增补（镜像 rbi `check_query→attach`，不经 guard 链）；不暴露 `getEngine`（A1-split 内部持 executor）；`health_check` defer。〔research/p4-build-defaults.md〕
- **D**：`packages/query/{query,query-maxcompute,query-tool}`（`@deepseek-ai/dsh-*`，镜像 `credentials/credentials` seam + `credentials/credentials-local` provider 切分；tool 插件独立包）。
- **E**：`credentials/updated → invalidate_scope` sidecar 工具（surgical，镜像 `invalidate_scope_connection`）；reconnect 留作 sidecar 崩溃兜底。
- **F2**：fake MCP server 子进程经 mcp-client（验 `StdioConfig.env` 凭证注入 + 跨进程 `invalidate_scope` + sidecar per-scope 缓存）。
- **G**：两层 gate 都 stub；3-execute 模式（G1 探针/G5 探针/主查询）承重；必演示 cost+timeout+G5；retry/orphan/G1 最简。

**Prototype**：`../../prototypes/p4-query-engine/`（throwaway，`node run.mjs --demo`）。镜像 rbi `OdpsExecutor`/`ScopeConnection` at stub fidelity；stand-in mcp-client link（minimal stdio JSON，**非真 MCP 协议**——真 `dsh-mcp-client` Cordis 接线是生产步骤，非原型范围）。4 scenario 全绿：fast-Completed / slow→Pending→attach→Completed / Failed / cred-change→invalidate。

**Surfaced tension（待生产硬化前定，见 map Not-yet-specified）**：F2 spawn-env 凭证注入与「per-call resolve + 不重启 invalidate」**不相容**。sidecar env spawn 时固定 → cred 变更后 `invalidate_scope` 丢缓存但下条连接从**陈旧** spawn-env 重建（原型 scenario 4 演示：da SK_NEW，sidecar 连接仍 `#cefdd0`=SK_OLD）；要生效须重启 sidecar（丢**所有** scope，与 E 的 surgical 冲突）或改 per-call `set_credentials` sidecar 通道（偏离 R2 §5.2c `StdioConfig.env`）。→ map Not-yet-specified「凭证热更机制」（sharp，待 ticket）。
