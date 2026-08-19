# R6 — 凭证热更机制：spawn-env 下 cred 变更如何不重启 sidecar 即生效（research）

**Type**: research
**Phase**: 2
**Status**: Unblocked
**Blocks**: 生产硬化 `packages/query/*`（非当前 ticket；阻生产正确性——陈旧凭据=真 bug）

**Question**: F2 spawn-env 凭证注入下，cred 变更如何**不重启 sidecar 即生效**？`invalidate_scope` 单用留**陈旧 spawn-env 凭据**（P4 prototype scenario 4 实测：da 侧 `ODPS_ACCESS_KEY=SK_NEW`，`invalidate_scope` 丢 sidecar 缓存后，下条连接仍 `#cefdd0`=SK_OLD；要 `restartSidecar` 才翻 `#cefdcb`=SK_NEW，但丢所有 scope）。三选项对账 + 推荐：

- (a) **reconnect-for-cred-change**：cred 变更走 reconnect（丢**所有** scope 缓存，与 P4 E 的 surgical `invalidate_scope` 冲突；`invalidate_scope` 退为仅适用**非-cred 配置变更**，如 scope config.yaml）。
- (b) **per-call `set_credentials` sidecar 工具**：da 每次 `ctx.query.execute` 前 per-call resolve + 调 sidecar `set_credentials(scope_id, creds)`——**creds 不进 model-visible tool args**（tool-query 入参只有 sql+scope_id），是 da→sidecar 内部工具调用；sidecar 用最新 creds 重建 per-scope 连接。偏离 R2 §5.2c「`StdioConfig.env` 注入」但保「不进 args」+ per-call resolve + surgical invalidate。
- (c) **streamable-http + per-request headers**：sidecar 走 streamable-http transport，creds 经 `StreamableHttpConfig.headers` per-request 注入（**待查**：mcp-client `headers` 是 per-call 还是 spawn-fixed？`index.ts` `StreamableHttpConfig` 注释 "Additional headers attached to MCP requests"——需确认每次 tools/call 是否重读 headers）。

主源：harness `packages/mcp/mcp-client/src/index.ts`（`StdioConfig.env` spawn-fixed、`StreamableHttpConfig.headers`、`apply`）+ `packages/mcp/mcp-client/src/connection.ts`（`ReconnectConfig`、dispose+reconnect）+ `packages/credentials/credentials/src/index.ts`（`credentials/updated` 事件、per-call resolve）+ R2 §5.2c-d（`research/r2-maxcompute-cred-cache.md`）+ P4 prototype scenario 4（`prototypes/p4-query-engine/`）。

**Context**: P4 prototype surface（`research/p4-build-defaults.md` §F 修正 + `prototypes/p4-query-engine/` scenario 4 + P4 ticket Resolution 的 Surfaced tension）。这是 P4 grilling 决的 **E（`invalidate_scope`）在生产形态下被 prototype 证伪后的 refine**——E 对非-cred 配置热更仍成立，对 **cred 变更不足**（spawn-env 固定）。

**Research note**: → `../../research/r6-cred-hot-reload.md`（待解时由 /research subagent 写 cited 笔记 + 回填 Finding）。
