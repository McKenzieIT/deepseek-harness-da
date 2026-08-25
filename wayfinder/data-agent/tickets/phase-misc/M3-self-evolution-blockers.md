# M3-self-evolution-blockers — self-evolution 闭环前置阻碍（load qualified_name / F2 same-source / phase-gate 混乱）

**Type**: grilling（planning；3 阻碍待 grilled）
**Phase**: misc（cross-phase / self-evolution 闭环）
**Assignee**: wayfinder-session 2026-08-25
**Status**: Implemented + verified 2026-08-25（#1 A load qualified_name 3dfb199d / #2 A F2 放宽 9b58eadeff+e0720684 / #3 B reply-keep-phase fe48074180 / #4 collectTableNames metric host 06d95d88）。B 验证（game_xxx_wrong）闭环：not_found→present_clarification→用户答 ieu_cdm→#3 reply-keep-phase（GENERATION critique/query_data 不拒）→critique ieu_cdm pass→query_data ieu_cdm 成功（0 rows，data date 问题非 self-evolution）。update_table_config 没调（LLM 直接用答，没持久化 override——LLM 行为，inject 指引教但 LLM 跳过）。
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
2. **F2 same-source 太严 → Resolved A**：normalizeSql 放宽 ORDER BY/LIMIT/trailing ;/空白（保留 FROM/WHERE/GROUP BY/HAVING 逻辑比较）。ORDER BY/LIMIT 是 presentation（不改结果集逻辑），LLM 加 ORDER BY 后 critique 不应 violation。F2 仍防 SQL 逻辑改变（FROM 改仍 block）。commit 见上。
3. **phase-gate reply reset → Resolved B**：resetQuestionScoped awaiting_clarification reply 保持 phase（不 reset UNDERSTANDING）+ grounding + SQL state，只 reset budget + HALT flag。reply 后 GENERATION critique/query_data/update_table_config 不拒。commit fe48074180。

## #4（B 验证暴露新阻碍）

- **collectTableNames metric host → Resolved**：search 返回 [metric] candidate（id=`host__key`），LLM 提取 host 生 SQL FROM，但 candidate_tables 只收 metric 全名（不含 host）→ critic table_not_in_candidates → confidence 0.50 → honest_decline（没 query_data）。collectTableNames 加收 `id.slice(0, lastIndexOf('__'))`（host），table ids 无 `__` no-op。commit 06d95d88。

## 关联

- [M2-self-evolution-architecture](M2-self-evolution-architecture.md)（self-evolution 机制 C/#1/#2/#3 + RBAC）
- [map](../../map.md) M2 self-evolution
