# P4 — Ontology Phase 3: 指标计算引擎

**Type**: task
**Status**: Open
**Blocked by**: P2-ontology-relations-graph

## Question

实现 Level 2.5 路径的指标计算引擎：已注册 metric 遇到匹配查询时走确定性执行路径（直接使用计算规则生成 SQL），而非 LLM 推断。

## Scope

### 1. Metric 匹配路由

当用户问题命中 metric 节点时：
- 检索阶段：BM25/向量检索命中 metric corpus item
- 路由判断：是否为纯指标查询（如 "昨天 DAU 是多少"）
- 若匹配：走 Level 2.5 路径（确定性执行）
- 若混合（如 "付费用户的 DAU"）：走 Level 2 路径（metric 规则作为 context 辅助 NL2SQL）

### 2. 确定性执行路径（Level 2.5）

```
用户: "昨天的 DAU"
→ 检索命中 metric:DAU
→ MetricPlugin.toExecutableRule() 返回 SQL 模板
→ 填充参数（date = yesterday）
→ 直接执行，不经 LLM SQL 生成
```

需要：
- SQL 模板参数解析（`{{date}}`、`{{start_date}}`、`{{end_date}}` 等）
- 参数从用户问题中提取（时间识别可用 LLM 或规则）
- 执行结果格式化返回

### 3. Level 2 Context 注入路径

非纯指标查询时，将 metric 计算规则注入 LLM prompt：
```
已知指标：DAU = COUNT(DISTINCT user_id) FROM ods_login WHERE ds = '{date}'
请基于此规则回答用户的复合问题...
```

### 4. 实验对比

提供 eval case 验证两条路径的准确率差异：
- Level 2.5（纯指标查询确定性执行）vs Level 2（所有查询走 LLM）
- 用于支撑后续路由策略的实验数据

## 验收标准

- [ ] 纯指标查询走确定性路径，SQL 正确执行返回结果
- [ ] 混合查询走 Level 2 路径，metric 规则作为 context 注入
- [ ] 参数提取（至少支持日期参数）
- [ ] 至少 5 个 eval case 对比两条路径的准确率
