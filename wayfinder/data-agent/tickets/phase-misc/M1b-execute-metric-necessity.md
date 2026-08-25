# M1b-execute-metric-necessity — execute_metric + Level 2.5 确定性路径必要性实验

**Type**: research（AFK；M1 决策 5 前置实验）
**Phase**: misc
**Assignee**: wayfinder-session 2026-08-24
**Status**: Open（research subagent fired）
**Surfaced by**: M1 grilling 决策 5（execute_metric 角色）——调研示确定性路径真实场景价值有限（触发窄、对 `_df` 快照型语义错），但删它需实验证实"确实不需要"，不能凭调研结论直接定。
**Scope**: 实验对比 Level 2.5 确定性执行路径 vs Level 2 `buildMetricContext` 注入 LLM 生 SQL 路径，在质量/开销/触发率三维度验证 execute_metric + Level 2.5 是否可删。
**Question**: execute_metric 工具 + engine Level 2.5 确定性分支，在真实 K11 场景下是否必要？删它（metric 统一走 Level 2 buildMetricContext 注入 + LLM 生 SQL）是否质量不退化、开销可接受？

## 实验任务

1. **触发率**：用 K11 metric 样本 + D2g 113 gold case，统计 `routeMetric` 返回 Level 2.5（纯单 metric + 0 其他候选 + 时间可提取）的占比。验证调研结论"~2/5 且最玩具"。
2. **质量对比**：对同一批纯单指标问题（如"昨天DAU"、"本月充值总额"），对比：
   - Level 2.5 路径：`buildExecutableSQL` 确定性执行
   - Level 2 路径：`buildMetricContext` 注入 prompt + LLM 生 SQL + critic + 执行
   结果是否一致？尤其 `_df` 快照型比率指标（pay_rate/arppu）——Level 2.5 是否确定性产出错误结果（跨天聚合快照重复计数）？Level 2 LLM 是否能识别快照语义？
3. **开销**：Level 2.5 = 0 LLM 调用；Level 2 = 1 次 GENERATION LLM 调用。对比 token/延迟。`buildMetricContext` 已给 expr，LLM 是否近似复制（开销小）还是重新推理？
4. **删的影响面**：删 execute_metric 工具（tool-execute-metric 包）+ engine Level 2.5 分支（routeMetric/buildExecutableSQL 的确定性部分）+ preset 的 tool-execute-metric 行。影响哪些测试/调用点？

## 报告要求

< 700 字，给 file:line + 实验数据 + 判断：execute_metric + Level 2.5 是否可删（可删/不可删/条件可删）。若可删，删的影响面清单。
