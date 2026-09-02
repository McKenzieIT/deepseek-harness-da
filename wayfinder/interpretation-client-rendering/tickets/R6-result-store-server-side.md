# R6 — Result store server-side 设计调研

**Type**: research
**Phase**: post-v1
**Status**: closed (resolved 2026-09-02)
**Assignee**: claude-code · 2026-09-02 (this session)
**Blocked by**: 无（独立；后续可能 feed grilling 票）
**Related**: [R5](R5-object-layer-result-cache.md)（client cache，本票是其上游依赖）、data-agent map `result-cache-service`（resolved 2026-08-26，host 侧 seam 已建）、[T4](T4-present-table-display-upgrade.md)（其 result_id 校验扫描是本票落地前的过渡 fallback；G1 决策 #2/#6 的 retry 依赖本票）

## Question

当前 v1 的 `present_table` 通过同 turn 的 `query_data` tool result（TSV 文本）直接获取数据行，绕过了正式的 server-side result store。这在以下场景会失败：

- **跨 turn 引用**："把刚才那张表再画个饼图" — `result_id` 指向的数据已不在当前 turn 消息流中
- **compute 二次计算**：`compute` 工具对查询结果做 pandas 运算后产生新结果，需要独立的 `result_id` + 存储
- **大结果分页**：超过 10000 行 cap 的结果需要 server 端分页，client 按需拉取

需要调研：

1. **data-agent map 的 `result-cache-service`** 已 resolved（host 侧 `ResultCacheService` seam 已建）——其当前能力边界是什么？是否已覆盖跨 turn 存储？
2. **RPC 协议**：client 如何按 `result_id` 从 server 拉数据？走 Typert Remote 还是独立 HTTP？
3. **存储后端**：内存 + file-backed（JSONL）？LRU eviction vs session-lifetime？
4. **GC 策略**：结果何时清理？session 结束？TTL？显式 release？

## Scope

仅 research（调研现状 + 技术选项）。是否开 grilling 票由调研结论决定——若当前 `result-cache-service` 已覆盖大部分需求，可能无需新决策。

## Resolution

调研收口（2026-09-02，primary-source 逐条核验）。

**结论：无需新决策。** 现有 server-side result store + 已 ship 的 rpcId 传输已覆盖三问的核心；唯一缺口是一行未注册的 `result.get` RPC——纯机械补齐，走既有 apiproxy 模式，无新协议/载体/决策。R6 scope 明示「若现有 service 已覆盖大部分需求则无需新决策」，本案命中，**不开新 grilling 票**。

### 1. 现状（核验自源码）

- **host 侧 `ctx.resultCache` 已存在且已 ship（2026-08-26）**：
  - 抽象 seam `packages/data/result-cache/src/index.ts:30-46`：`get(resultId)` / `put(resultId, entry)` / `has(resultId)`；`ResultEntry = { columns: string[], rows: unknown[][], metadata?: { sql?, truncated?, row_count? } }`。
  - in-memory Provider `packages/data/result-cache-memory/`：`Map<string, ResultEntry>` store；`tools/post-execute` hook 将完成的 `query_data` 结果存为 `qr_<sha256(sql)[0:12]>` 并把 `result_id` 注入 tool value；`cr_`（compute 衍生）一次写入不可变（冲突 throw），`qr_`（同 SQL 重跑）覆盖为最新行。
  - 挂载：`packages/bundle/data-agent/cordis.patch.yml`。
- **compute 衍生结果已 ship**：`packages/data/tool-compute/src/index.ts` 生成 `cr_<sha256(code+sourceResultId)[0:12]>`，经 `ctx.resultCache.put` 存储；`load_result` 是 `ctx.resultCache.get` 的薄封装。已测。
- **覆盖矩阵**：跨 turn ✅（session-scoped Map，存活于 event-window 压缩）/ compute 衍生 ✅ / **大结果分页 ❌**——`get()` 返全量 `ResultEntry`，无 offset/limit。按 safe-compute research open-q #5 显式延后：day-1 全量 get，后续加 `result.getPage` 非破坏性。

### 2. 传输（核验自源码）

- **rpcId 双向协议已 ship**（`packages/host/apiproxy`）：`RpcMethodMap`（`src/api/rpc-map.ts`）注册 ~50 个 client-request 方法（`session.*` / `subagent.*` / `host.*` / `workspace.*` / `skill.*` / `agentPreset.*` / `goal.*` / `settings.*` / `credentials.*` / `llm.*`）；`IApiClient`（`src/fetch/client.ts`）payload-direct client face；POST `/api/<method>` + 信封 zod 两层解析 + rpcId 回显；`packages/client/AGENTS.md` 固化「rpcId 严格双向」。
- **"Typert Remote" 在本仓不存在**（grep 零 hit）——apiproxy 才是真机制（Question #2 的 Typert Remote 假设不成立）。

### 3. 缺口（精确）

`RpcMethodMap` 无 `result.get` 行，亦无 `ResultsApi` 接口——host 侧 `ctx.resultCache.get(rid)` 存在但浏览器不可达。补齐 = 既有 apiproxy 模式四件，全机械、无新协议/载体：

1. `ResultsApi` 接口 + `results.schema.ts`（`{ resultId }` → `ResultEntry | not-found`）；
2. `RpcMethodMap` 一行 `'result.get': ResultsApi['get']`；
3. `IApiClient.results.get` + `AbstractApiClient.UNARY_VALUE_SCHEMAS` 一项；
4. host handler 包 `ctx.resultCache.get(rid)`，not-found 走 `RpcError`（`result-not-found` 码）。

client 消费走既有 inject-face 模式（参 `ui-suggest-followups/src/client/index.ts`）：`inject: (sessionId) => ({ fetchResult: (rid) => ... })`。

### 4. 后端 / GC（实现态）

纯 in-memory `Map`——无 JSONL / file-backed / 持久化（grep `jsonl|file-backed|persist|writeFile` 零 hit）。session-lifetime GC：无 LRU / TTL / maxEntries / 显式 `release()`，Map 随 session/plugin context 释放。`qr_` 同 SQL 重跑覆盖（新鲜非陈旧），`cr_` 不可变。与设计意图一致（「无持久化：仅 session 级；compute 衍生重建廉价」）。

### 移交

- 唯一实现项（`result.get` RPC 四件）是 **destination 工作**（wayfinder "plan don't do"）——无决策，走既有模式。接入后：R5 client cache 的 cache-miss = 调 `fetchResult(rid)`；G1 #2/#6 retry = 重发同一 unary RPC（自然落地，无独立 retry 协议）；T4 的 `parseQueryData` 同 turn TSV 扫描保留为未接入期 / cache-miss fallback。
- **R5 上游依赖已解**：R5 Q3（key = `result_id`，`qr_`/`cr_`）确认、Q5（cache-miss = `result.get` RPC，非 re-query）已答；R5 research 部分收窄，剩 grilling 决策（location / eviction / bounds）。已在 R5 ticket 同步。
- **不开新 grilling 票**——见上「结论」。

资产：
- 研究笔记（primary-source 逐条 file:line 引证）：[research/R6-result-store-server-side.md](../research/R6-result-store-server-side.md)
