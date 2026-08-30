---
type: task
status: open
blocked_by: []
---

# CL-13: Voice compound query 多表 join 完整性

## Question

CL-10 中 5 个 voice compound cases 失败原因为 SQL 只完成了查询的一半——缺少关键的多表 join。例如：
- voice_029 "充值最高十个服的留存数据对比"：SQL 只查了充值排名，完全没有留存数据
- voice_032 "各渠道付费转化率对比"：SQL 只查了新增用户数，没有 join 付费表算转化率
- voice_030 "副本通关率和玩家等级有没有关系"：只查了通关率，没有关联等级数据

这些 case 要求 LLM 在一个查询中联合多个数据源，暴露了 NL2SQL 在复合查询场景下的拆解和 join 能力不足。

## 具体内容

### 失败 cases

| case_id | question | 实际 SQL | 缺失部分 |
|---------|----------|---------|---------|
| voice_029 | 充值最高十个服的留存数据对比 | 只查 server 充值 TOP10 | 缺留存 join（selfhelp_new_remain_df） |
| voice_032 | 各渠道付费转化率对比 | 只查渠道新增用户 | 缺付费用户 join（com_pay_order_df） |
| voice_030 | 副本通关率和玩家等级有没有关系 | 只查通关率 | 缺等级数据 join（role_common_feature_df） |

### 可能根因

1. **检索只返回了一半相关表**：BM25 检索 + graph expansion 对"充值 + 留存"这类跨域查询可能只命中了一个域的表
2. **system prompt 对复合查询的拆解引导不足**：LLM 可能只回答了问题的"主"部分而忽略了"从"部分
3. **critic 约束**：`table_not_in_candidates` 可能阻止了 LLM 使用检索结果之外的表
4. **P3 graph expansion 范围**：当前 expand 只做 1-hop joins，跨域（如付费域→留存域）可能需要 2-hop 或 concept-anchored expansion

### 分析步骤

1. 对 5 个失败 compound case 重现检索结果，确认 topK candidates 是否包含两侧的表
2. 如果检索缺失 → 考虑 concept-anchored expansion（CL-2 的 related_to 边）
3. 如果检索完整但 LLM 只用了一半 → 考虑 system prompt 改进（强调"复合查询需联合所有相关表"）
4. 修复后以 sql-judge 模式验证

### 验收标准

- 5 个 compound failure cases 中至少 3 个修复为 pass
- 不引入 single-table case 的 regression
