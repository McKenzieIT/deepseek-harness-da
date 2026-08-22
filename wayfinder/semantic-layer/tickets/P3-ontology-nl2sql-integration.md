# P3 — Ontology Phase 2: NL2SQL 集成

**Type**: task
**Status**: Open
**Blocked by**: P2-ontology-relations-graph

## Question

将 ontology 关系图集成到 NL2SQL 引擎中，使多表查询能利用 join path 推理生成正确 SQL。

## Scope

### 1. Schema Linking 后查询关系图

NL2SQL 引擎在 schema linking（检索+加载相关 definitions）后：
- 调用 `findJoinPath(tableA, tableB)` 确认 join 合理性
- 若找到 path，自动注入 join condition 到 SQL 生成 prompt

### 2. Multi-table Join 注入

当用户问题涉及多张表时：
- 从关系图获取 join path
- 将 join condition 作为 hard constraint 注入 LLM prompt（不让 LLM 猜测 join key）
- 示例：`"dws_pay_order.user_id = ods_login.user_id"` 作为已知事实提供

### 3. Critic 校验增强

NL2SQL critic 新增检查：
- 生成的 SQL 中的 JOIN 是否在关系图中有声明
- 无声明的 JOIN → 警告（可能 hallucination）

### 4. 检索扩展（关系图增强召回）

搜索 "收入" → BM25 命中 pay_order → 通过关系图发现 `derived_from: refund_order` → 扩展召回 refund_order。

## 验收标准

- [ ] 多表查询时 join condition 从关系图获取（非 LLM 推断）
- [ ] Critic 校验未声明 JOIN 并发出警告
- [ ] 关系图增强检索召回（至少 1 个 case 验证）
- [ ] 对比实验：有/无 ontology 辅助的多表查询准确率
