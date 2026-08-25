# M4-update-table-config-persistence — LLM 不调 update_table_config（override 没持久化）

**Type**: grilling（planning；LLM 行为引导决策待 grilled）
**Phase**: misc（self-evolution 持久化）
**Assignee**: wayfinder-session 2026-08-25
**Status**: Resolved 2026-08-25（选项 4：phase-gate 自动调 update_table_config）
**Surfaced by**: M3 B 验证——self-evolution 闭环 work（not_found→present_clarification→用户答 ieu_cdm→#3 reply-keep-phase→critique ieu_cdm pass→query_data ieu_cdm 成功），但 **update_table_config 没调**——LLM 直接用用户答 ieu_cdm 在 SQL，没持久化 override。inject 指引教"call update_table_config"，但 LLM 跳过。
**Scope**: 让 LLM 在 self-evolution 答案后调 update_table_config 持久化 override（下次同表不重问）。
**Question**: 怎么让 LLM 调 update_table_config 持久化 override？更强 inject 指引 vs persona 教 vs phase-gate 强制 vs 别的？

## Evidence（M3 B 验证 session-825912fe）

- not_found → present_clarification 问 project → 用户答 ieu_cdm
- reply-keep-phase（#3）→ critique SQL `FROM ieu_cdm.dws_...` pass → query_data ieu_cdm 成功
- **但 tool calls 无 update_table_config**——LLM 直接用答 ieu_cdm 在 SQL，没写 override
- inject 指引（#2b executionDecision not_found fallback inject）教"call update_table_config"，但 LLM 跳过

## Open decisions（grilling 候选）

1. **更强 inject 指引**：inject 文本更强调"必须先调 update_table_config 写 override，再重试"——LLM 行为引导。
2. **persona 教**：UNDERSTANDING/GENERATION persona 教"用户答 project 后，调 update_table_config 持久化"。
3. **phase-gate 强制**：phase-gate 在 self-evolution fallback 后检测 update_table_config 调用（没调则 retry/decline）。
4. **update_table_config 自动调**：present_clarification reply 后 phase-gate 自动调 update_table_config（不靠 LLM）。

## 关联

- [M3-self-evolution-blockers](M3-self-evolution-blockers.md)（#1#2#3#4 修 + B 验证）
- [M2-self-evolution-architecture](M2-self-evolution-architecture.md)（#2b inject 指引 + #3b update_table_config 工具）


## Resolution（2026-08-25）

**决策**：选项 4（phase-gate 自动调 update_table_config，不靠 LLM）。

**Grilling 结论**：
- 选项 1/2（prompt 引导）被否——证据证明 LLM 看到指引但跳过（不调也能成功 SQL）
- 选项 3（检测+retry）被否——query 已成功却 retry/decline 用户体验差；LLM 二次补调概率低
- 选项 4 最优——100% 确定性、零 LLM 依赖、无额外 round-trip、用户体验无感

**实现设计**：
- Hook point：EXECUTION completed（query_data 成功后）——确认 project 真能用才写
- 参数提取：not_found 时从 last_sql 用 extractTableNames 记录裸表名（→ self_evolution_table）；completed 时 regex `(\w+)\.{table}` 从成功 SQL 提取 project
- RBAC：尊重——走正常 tool execute 路径，非 admin 返回 { ok: false }，auto-call 忽略（query 照样成功）
- 失败处理：fire-and-forget（.catch 吞错误），提取失败 = skip，不影响正常流程
- inject：静默（不通知 LLM）

**改动**：
- `types.ts`：PhaseGateState + `self_evolution_table: string | null`
- `phase-gate.ts`：
  - import `extractTableNames`
  - `executionDecision` not_found 分支记录 `self_evolution_table`
  - `executionDecision` completed 分支调 `autoPersistOverride(s)`
  - 新 private method `autoPersistOverride`
  - `resetQuestionScoped`：awaiting_clarification 保留、full-reset 清 null
- 7 个新测试全 pass（69/69）
