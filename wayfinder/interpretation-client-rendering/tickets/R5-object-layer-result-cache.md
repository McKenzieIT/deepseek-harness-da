# R5 — Object layer result cache 实现方案

**Type**: research + grilling（先调研 → 后决策）
**Phase**: post-v1
**Status**: open
**Assignee**: unclaimed
**Blocked by**: 无（独立；上游 R6 已解 2026-09-02）
**Related**: [G1](G1-design-decisions.md)（D10: result data 在 object layer LRU cache 管理）、[R3](R3-dsh-client-rendering-patterns.md)（数据行从同 turn query_data TSV 扫描）、[R6](R6-result-store-server-side.md)（上游已解：server store = `ctx.resultCache` in-memory/session-scoped；cache-miss = `result.get` RPC；key = `result_id` `qr_`/`cr_`）

## Question

`present_table` 渲染需要查询结果数据行。当前 v1 通过同 turn TSV 扫描 bypass 了正式缓存层。G1 决策 D10 确定了"object layer LRU cache"作为方向。需要明确：

1. **实现位置**：cache 放在 client runtime 内（`packages/client/runtime/` 的某个 store）还是独立 service 包（`packages/client/result-cache/`）？
2. **LRU eviction 策略**：TTL-based（过期时间）vs maxEntries-based（最大条目数）vs hybrid？
3. **cache key 设计**（R6 已解 2026-09-02）：`result_id`——`qr_<sha256(sql)>`（查询）/ `cr_<sha256(code+sourceResultId)>`（compute 衍生，一次写入不可变）；turn + tool_call_id 不必。
4. **内存上限**：单个结果可能几 MB（10000 行 × N 列）；总 cache 大小上限？
5. **与 server-side result store 的关系**（R6 已解 2026-09-02）：cache miss = 调 `result.get` RPC（apiproxy 一行，destination 工作；host 侧 `ctx.resultCache.get` 已存在）；**非 re-query**。T4 的 `parseQueryData` 同 turn TSV 扫描保留为未接入期 / cache-miss fallback。详见 [R6](R6-result-store-server-side.md)。

## Scope

- 调研：现有 client runtime 的 store 模式（projection-store 等）、内存 profile（R6 已收窄上游，无需再调研 server store）
- 决策（grilling）：位置 + eviction 策略 + 内存上限（key 与 cache-miss 路径已由 G1 / R6 定）
