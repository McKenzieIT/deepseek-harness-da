# P4 — 指标计算引擎（Production 集成 + Close）

## 当前状态

P4 的 eval 路径已完整实现：

- metric-engine.ts：routeMetric, extractTimeParams, buildExecutableSQL, buildMetricContext
- engine.ts Level 2.5 确定性路径（纯指标查询 0 LLM 调用）
- engine.ts Level 2 context 注入（混合查询 metric 规则入 prompt）
- metric-comparison-runner.ts + 5 个 eval cases
- tool-search-data-sources full corpus（metrics 可被 BM25 检索命中）

## 问题

Eval 验收标准已满足，但生产环境（agent-loop 驱动）缺少 Level 2.5 的触发机制：

- Agent LLM 调用 search_data_sources，结果含 metric hit
- Agent LLM 不知道该走确定性执行，仍然尝试自己生成 SQL
- 相当于所有查询都走 Level 2 或 normal path，Level 2.5 永远不触发

## 需要实现

### 1. 新增 execute_metric Tool

创建 packages/data/tool-execute-metric/

Tool 定义：

- name: execute_metric
- description: 对已注册的计算指标执行确定性查询（Level 2.5）。当 search_data_sources 返回 metric 命中且用户问题是纯指标查询时，优先调用此工具而非自己写 SQL — 0 LLM 生成开销，确定性执行。
- parameters:
  - metric_name (string, required): 指标 id（如 dau, pay_amt_sum）
  - question (string, required): 用户原始问题（用于时间参数提取）
  - today (string, optional): YYYYMMDD 参考日期（默认今天）

实现逻辑：

1. 从 ctx.schema 加载 metric definition（通过 registry getKind('metric') + loadByStorageDir）
2. extractTimeParams(question, today) 提取时间参数
3. partitionResolver: ctx.schema.loadTableDefinition(source)?.partitions?.map(p => p.name) ?? ['ds']
4. buildExecutableSQL(metric, params, partitionCols) 生成 SQL
5. 安全检查：有 ds 分区但无时间参数则拒绝执行（防止全表扫描）
6. ctx.query.execute(sql) 执行 SQL
7. 返回 { ok, sql, result, metric: {name, description, source} }

依赖：

- @deepseek-ai/dsh-nl2sql-engine（extractTimeParams, buildExecutableSQL）
- @deepseek-ai/cordis
- @deepseek-ai/dsh-tools（defineTool）
- 结构化 probe ctx.get('schema') + ctx.get('query')

### 2. Bundle 注册

在 data-agent preset/bundle 中注册 tool-execute-metric 插件。

### 3. Agent System Prompt 更新

在 data-agent 的 persona/system prompt 中添加使用指引：

当 search_data_sources 结果中出现 metric 类数据源（通常 description 含指标或明确是聚合计算如 DAU/MAU/付费金额），且用户问题是简单的指标查询（如"昨天DAU是多少"、"本月充值总额"），优先调用 execute_metric(metric_name, question) 走确定性执行路径。仅当问题涉及额外筛选/分组/多表关联时才自己写 SQL。

### 4. Tool 测试

- 单元测试：mock ctx.schema + ctx.query，验证 5 个 metric cases
- 验证 metric 不存在时的优雅降级
- 验证无时间参数时的拒绝执行

### 5. Close P4 Ticket

在 wayfinder/semantic-layer/tickets/P4-ontology-metric-engine.md 中：

- 添加 Resolution 记录（eval 验收 + 生产 tool 实现）
- Status 改为 Resolved
- 更新 map.md Decisions so far

## 参考文件

| 文件 | 用途 |
|------|------|
| packages/data/nl2sql-engine/src/metric-engine.ts | 核心逻辑（直接 import 使用） |
| packages/data/nl2sql-engine/src/engine.ts | eval 路径 Level 2.5 实现（约 line 130-170） |
| packages/data/nl2sql-engine/src/eval/metric-cases.ts | 5 个 eval cases |
| packages/data/nl2sql-engine/src/eval/metric-comparison-runner.ts | Level 2.5 vs Level 2 对比 |
| packages/data/semantic-layer/src/kinds/metric-kind.ts | MetricPlugin |
| packages/data/semantic-layer/src/metrics.ts | loadMetricDefinitions |
| packages/data/tool-search-data-sources/src/index.ts | 参考 tool 注册 pattern |
| packages/data/tool-discover-relations/ | 参考 ctx.schema probe pattern |
| packages/data/phase-gate/src/phase-gate.ts | agent loop 工具调用流程 |

## 验收标准

- [ ] execute_metric tool 实现并注册
- [ ] 纯指标查询通过 tool 确定性执行返回正确结果
- [ ] 无时间参数时优雅拒绝（不做全表扫描）
- [ ] metric 不存在时返回 error（不 crash）
- [ ] 至少 5 个单元测试覆盖
- [ ] Agent prompt 更新
- [ ] P4 ticket closed + map updated
