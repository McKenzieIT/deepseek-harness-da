# R6 — Result store server-side 设计调研

**Type**: research
**Phase**: post-v1
**Status**: open
**Assignee**: unclaimed
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
