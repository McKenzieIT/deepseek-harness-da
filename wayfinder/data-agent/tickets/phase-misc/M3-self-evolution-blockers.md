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

1. **LLM 用裸名（不用 search qualified id）**：C Task 1 删了 load 的 qualified_name（"search 已 qualify"假设 LLM 用 search id），但 LLM 实际用 load 的 bare table_name。修复：load 返 qualified_name（回退 Task 1 删，用 ctx.query.qualifyTable）vs persona 教 LLM 用 search id vs 别的。
2. **F2 same-source 太严**：critique 无 ORDER BY，query_data 有 → violation。修复：F2 放宽（ORDER BY 等无害差异允许，或规范化比较）vs LLM 用同一 SQL vs 别的。
3. **phase-gate 阶段混乱**：LLM 跳 route:proceed（UNDERSTANDING 调 critique）。修复：persona 教 LLM route:proceed vs phase-gate 优化 vs 别的。

## 关联

- [M2-self-evolution-architecture](M2-self-evolution-architecture.md)（self-evolution 机制 C/#1/#2/#3 + RBAC）
- [map](../../map.md) M2 self-evolution
