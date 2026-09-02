# V1 — 审计 structured delta

**Type**: task (AFK)
**Phase**: post-G6
**Status**: open
**Assignee**: unclaimed
**Blocked by**: 无
**Related**: G6（D4 决策）、W6e（edit_definition）、audit store

## Question

`edit_definition` 写入时计算 before/after 结构化差异（added/modified/removed），持久化到审计记录。

### 需求

1. 在 `edit_definition` 的写入路径中，利用已有的 before snapshot 和 after 状态，计算 structured delta：
   ```ts
   interface StructuredDelta {
     added: Record<string, unknown>      // 新增的顶层字段或嵌套项
     modified: Record<string, { from: unknown; to: unknown }>  // 变更的字段
     removed: string[]                   // 删除的字段
   }
   ```
2. 将 delta 存入审计记录（audit store 新增字段或扩展现有 `recordTier2Write`）
3. 覆盖所有 definition kind（table / event / metric / concept）
4. delta 计算须处理嵌套结构：`columns`（按 name key）、`dimension_refs`（按 dim_table key）、`domains`/`alt_labels`（集合语义）

### 验收标准

- edit_definition 每次写入后，审计记录中可查询到对应的 structured delta
- delta 准确反映实际变更（新增/修改/删除）
- 现有 audit 测试 + 新增 delta 测试全绿
