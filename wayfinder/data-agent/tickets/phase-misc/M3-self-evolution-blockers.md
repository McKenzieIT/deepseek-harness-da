# M3-self-evolution-blockers — self-evolution 闭环前置阻碍（load qualified_name / F2 same-source / phase-gate 混乱）

**Type**: grilling（planning；3 阻碍待 grilled）
**Phase**: misc（cross-phase / self-evolution 闭环）
**Assignee**: wayfinder-session 2026-08-25
**Status**: Open（grilling 进行中）
**Surfaced by**: B 验证（defaultProject=game_xxx_wrong 触发自进化）—— self-evolution 机制（M2 #1/#2/#3）没机会触发，因 3 个前置阻碍让 query_data 没执行到 ODPS。
**Scope**: B self-evolution 闭环的 3 个前置阻碍修复决策。
**Question**: B（表 project 未知→问用户→写 override→重试）的 3 个前置阻碍怎么修？load 返 qualified_name？F2 same-source 放宽？phase-gate 阶段混乱？

## Evidence（B 验证 session-74ae9d7a）

- search candidate qualified `game_xxx_wrong.dws_..._univ_acc_summary_di`（C 用错 default ✓）
- **但 critique + query_data SQL 都用裸名** `FROM dws_10000251_univ_acc_summary_di`（非 game_xxx_wrong.dws_...）→ 裸名 + sidecar default ieu_cdm 兜底 → 不触发 not_found → 不触发 self-evolution
- **F2 same-source violation** ×2：critique SQL 无 `ORDER BY`，query_data 有 `ORDER BY ds` → 严格 same-source 判不等 → violation（无害差异被拒）
- **phase-gate 阶段混乱**：UNDERSTANDING 调 critique_sql_tool（跳 route:proceed）→ 拒 → critique/query_data 循环（critique ×4 + query_data ×2）
- 没 present_clarification / update_table_config 调用——self-evolution 机制没触发

## Open decisions（grilling 候选）

1. **LLM 用裸名 → Resolved A**：load 返 qualified_name（回退 Task 1 删）。Task 1 删的假设"search 已 qualify candidate id，LLM 用 search id"错——LLM 实际用 load 返的结构化 table_name 字段（权威 source）。search candidate 没失效（LLM 用它选 candidate + 提取 table name 调 load），但 search qualified id 的 project 前缀被丢弃（LLM 调 load 去前缀，load 返 bare，SQL bare）。根因：harness 的 search（qualified id）+ load（bare table_name）不一致，LLM 在冲突中选 load bare（合理行为）。A 让 load 也返 qualified_name（用 ctx.query.qualifyTable）→ search + load 一致 → LLM 用 load qualified_name → SQL qualified。
2. **F2 same-source 太严**：critique 无 ORDER BY，query_data 有 → violation。修复：F2 放宽（ORDER BY 等无害差异允许，或规范化比较）vs LLM 用同一 SQL vs 别的。
3. **phase-gate 阶段混乱**：LLM 跳 route:proceed（UNDERSTANDING 调 critique）。修复：persona 教 LLM route:proceed vs phase-gate 优化 vs 别的。

## 关联

- [M2-self-evolution-architecture](M2-self-evolution-architecture.md)（self-evolution 机制 C/#1/#2/#3 + RBAC）
- [map](../../map.md) M2 self-evolution
