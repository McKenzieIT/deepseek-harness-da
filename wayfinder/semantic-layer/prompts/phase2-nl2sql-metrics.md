# Phase 2 — NL2SQL 集成 + 指标计算引擎（P3 + P4 并行）

## 前置条件

Phase 1 已完成：
- K11 321 tables + 453 events 已迁移
- dimension_refs 已由 enrichment 填充（162 DWS 表有 join 声明）
- metrics 已提取为独立实体（~1000+ 条）
- RelationGraph 已包含 joins + derived_from 关系

## P3：NL2SQL 集成

**Ticket**: `wayfinder/semantic-layer/tickets/P3-ontology-nl2sql-integration.md`

### 3.1 Join-path 注入 Prompt

NL2SQL 引擎在 schema linking 后，对涉及多表的查询：
1. 调用 `RelationGraph.findJoinPath(tableA, tableB)` 获取 join path
2. 将 join condition 作为 hard constraint 注入 LLM prompt：
   ```
   已知 JOIN 关系（请使用这些条件，不要自行推断 JOIN key）：
   - dws_pay_order_di.server_id = dim_server_info.server_id
   - dws_pay_order_di.role_id = ...
   ```
3. LLM 只负责 SELECT/WHERE/GROUP BY，JOIN 条件从关系图获取

### 3.2 Critic 校验未声明 JOIN

NL2SQL critic 新增规则：
- 解析生成的 SQL 中的 JOIN clause
- 检查每个 JOIN 是否在 RelationGraph 中有对应关系声明
- 无声明的 JOIN → 输出警告 `"⚠️ 未声明的 JOIN: tableA ⟷ tableB，可能是 hallucination"`
- 不阻断执行，但在结果中标注

### 3.3 关系图增强召回

搜索阶段扩展：
- BM25 命中 table A → 通过 `RelationGraph.getRelated(A, 'joins')` 扩展召回关联 DIM 表
- 通过 `RelationGraph.getDerived(A)` 扩展召回 derived_from 相关表
- 扩展深度 = 1 hop（避免噪音）

### 3.4 验收

- [ ] 多表查询 join condition 从关系图获取（非 LLM 推断）
- [ ] Critic 校验未声明 JOIN 并发出警告
- [ ] 关系图增强检索召回（至少 3 个 eval case 验证）
- [ ] 对比实验：有/无 ontology 辅助的多表查询准确率（用 K11 eval cases）

---

## P4：指标计算引擎

**Ticket**: `wayfinder/semantic-layer/tickets/P4-ontology-metric-engine.md`

### 4.1 Metric 匹配路由

用户问题进入后：
1. 检索阶段：BM25 命中 metric corpus item（metrics 已作为 kind plugin 注册到 registry）
2. 路由判断逻辑：
   - **纯指标查询**（"昨天 DAU 是多少"、"上周付费总额"）→ Level 2.5
   - **混合查询**（"付费用户中等级 > 50 的 DAU"）→ Level 2（metric 规则作为 context）
3. 路由判断可用简单规则：如果用户问题只涉及 1 个 metric 且无额外 WHERE 条件 → Level 2.5

### 4.2 Level 2.5 确定性执行路径

```
用户: "昨天的 DAU"
→ 检索命中 metric: daily_active_users
→ metric.expression = "COUNT(DISTINCT user_id)"
→ metric.source_table = "ods_login_di"
→ 参数提取: {date: "2026-08-21"}
→ 生成 SQL: SELECT COUNT(DISTINCT user_id) FROM ods_login_di WHERE ds = '20260821'
→ 直接执行，不经 LLM SQL 生成
```

**实现要素：**
- `MetricKindPlugin.toExecutableSQL(metric, params)` — 从 metric 定义 + 参数生成可执行 SQL
- 参数提取：时间参数（date/start_date/end_date）从用户问题中提取
  - 简单情况用规则（"昨天" → yesterday）
  - 复杂情况用 LLM 小模型快速提取
- SQL 模板化：`expression` + `source_table` + `WHERE ds = '{date}'`

### 4.3 Level 2 Context 注入路径

非纯指标查询时，将 metric 计算规则注入 NL2SQL prompt：
```
已知指标定义（请基于此规则构建查询）：
- DAU = COUNT(DISTINCT user_id) FROM ods_login_di WHERE ds = '{date}'
- 付费金额 = SUM(pay_amt) FROM dws_pay_order_di WHERE ds = '{date}'

用户问题：付费用户中等级 > 50 的 DAU
请生成 SQL...
```

### 4.4 验收

- [ ] 纯指标查询走 Level 2.5 确定性路径，SQL 正确执行返回结果
- [ ] 混合查询走 Level 2 路径，metric 规则作为 context 注入 prompt
- [ ] 参数提取至少支持：昨天/今天/上周/本月/指定日期
- [ ] 至少 5 个 K11 eval case 对比 Level 2.5 vs Level 2 准确率
- [ ] 路由判断准确率 > 90%（纯指标 vs 混合 分类正确）

---

## 执行建议

P3 和 P4 可并行开发：
- P3 依赖 RelationGraph（Phase 1 已实现）+ NL2SQL 引擎现有代码
- P4 依赖 MetricKindPlugin（Phase 1 已实现）+ 参数提取能力

建议分两个 worktree 或分支并行推进，最后合并。
