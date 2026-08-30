# R5 — Object layer result cache 实现方案

**Type**: research + grilling（先调研 → 后决策）
**Phase**: post-v1
**Status**: open
**Assignee**: unclaimed
**Blocked by**: 无（独立）
**Related**: [G1](G1-design-decisions.md)（D10: result data 在 object layer LRU cache 管理）、[R3](R3-dsh-client-rendering-patterns.md)（数据行从同 turn query_data TSV 扫描）

## Question

`present_table` 渲染需要查询结果数据行。当前 v1 通过同 turn TSV 扫描 bypass 了正式缓存层。G1 决策 D10 确定了"object layer LRU cache"作为方向。需要明确：

1. **实现位置**：cache 放在 client runtime 内（`packages/client/runtime/` 的某个 store）还是独立 service 包（`packages/client/result-cache/`）？
2. **LRU eviction 策略**：TTL-based（过期时间）vs maxEntries-based（最大条目数）vs hybrid？
3. **cache key 设计**：用 `result_id`？turn + tool_call_id？如何处理 compute 工具产生的衍生结果？
4. **内存上限**：单个结果可能几 MB（10000 行 × N 列）；总 cache 大小上限？
5. **与 server-side result store 的关系**：cache miss 时的 fallback 路径（当前无 server store → 只能 re-query）

## Scope

- 调研：现有 client runtime 的 store 模式（projection-store 等）、内存 profile、竞品 cache 实现
- 决策（grilling）：位置 + 策略 + key 设计 + 上限
