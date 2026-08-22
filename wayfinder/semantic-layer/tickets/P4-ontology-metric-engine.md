# P4 — Ontology Phase 3: 指标计算引擎

**Type**: task
**Status**: Resolved
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

- [x] 纯指标查询走确定性路径，SQL 正确执行返回结果
- [x] 混合查询走 Level 2 路径，metric 规则作为 context 注入
- [x] 参数提取（至少支持日期参数）
- [x] 至少 5 个 eval case 对比两条路径的准确率

## Resolution

**Eval 验收（engine.ts Level 2.5 路径）+ 生产 tool 实现（execute_metric）。**

### Eval 路径（已有）

- `packages/data/nl2sql-engine/src/metric-engine.ts`：routeMetric / extractTimeParams / buildExecutableSQL / buildMetricContext 四个纯函数
- `packages/data/nl2sql-engine/src/engine.ts` Level 2.5 确定性路径（纯指标查询 0 LLM 调用）+ Level 2 context 注入（混合查询 metric 规则入 prompt）
- `packages/data/nl2sql-engine/src/eval/metric-cases.ts`：5 个 eval cases（m01-m05）
- `packages/data/nl2sql-engine/src/eval/metric-comparison-runner.ts`：Level 2.5 vs Level 2 对比验证

### 生产集成（本次实现）

1. **`execute_metric` Tool**（`packages/data/tool-execute-metric/`）：
   - 参数：metric_name, question, today（可选）
   - 结构化 probe ctx.schema.loadMetricDefinition + ctx.schema.loadTableDefinition（分区列）
   - 结构化 probe ctx.query.execute（SQL 执行）+ ctx.scopes.activeId（scope 路由）
   - 安全检查：有 ds 分区但无时间参数 → 拒绝执行（防全表扫描）
   - 优雅降级：metric 不存在 / schema 未挂载 / query 未挂载 → 返回 error（不 crash）
   - 14 tests 全绿

2. **Bundle 注册**：`agent.cordis.yml` 新增 `tool-execute-metric` row（UNDERSTANDING 阶段）

3. **Phase-gate 白名单**：`UNDERSTANDING_TOOLS` 新增 `'execute_metric'`（55 tests 全绿）

4. **Agent System Prompt**：
   - BASE_PERSONA rule 1 更新（提及 execute_metric）
   - UNDERSTANDING PHASE_INSTRUCTIONS 新增 METRIC SHORTCUT 段落：search 命中 metric + 纯指标查询 → 直接调 execute_metric → 跳过 GENERATION/EXECUTION → 进 INTERPRETATION

5. **Semantic-layer 扩展**：`SemanticLayerService.loadMetricDefinition(name)` 方法（139 tests 全绿）
