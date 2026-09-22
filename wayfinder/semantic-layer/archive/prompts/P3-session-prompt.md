# P3 — Ontology NL2SQL 集成（收尾 + Live Eval）

## 当前状态

P3 的大部分工作已完成：

- ontology.ts 纯函数：buildJoinConstraints (C1), buildDeclaredJoinPairs (C2), expandCandidates (C3)
- engine.ts eval 路径集成（EngineDeps.graph 注入）
- critic.ts undeclared_join 规则（当 declaredJoinPairs 提供时触发）
- tool-search-data-sources 生产环境 graph-expanded recall + join constraints 输出
- tool-critique-sql 生产环境 declaredJoinPairs 接线
- eval/comparison-runner.ts + 3 个 join eval cases（scripted LLM）

## 剩余验收标准

P3 ticket（wayfinder/semantic-layer/tickets/P3-ontology-nl2sql-integration.md）最后一项：

> 对比实验：有/无 ontology 辅助的多表查询准确率

目前的 comparison-runner 使用 scripted LLM（固定返回 SQL），只能证明机制存在（join constraints 被注入 prompt、undeclared_join 规则触发），无法证明真实准确率提升。

## 需要实现

### 1. K11 Live Join Eval Cases

基于真实 K11 语义层数据创建 eval cases。

位置：packages/data/nl2sql-engine/src/eval/join-cases.ts（扩展）或新文件 k11-join-cases.ts

从 K11 scope 的 dimension_refs 中选 3-5 个多表查询场景：

- 已有 126 个 DWS 表有 dimension_refs，共 225 个 join 关系
- 选取典型场景：DWS 到 DIM join（如 pay_order 到 server_info）
- 编写自然语言问题 + 期望 SQL + 期望结果

参考 K11 已有数据：dws_pay_order_di.server_id 关联 dim_server_info.server_id，dws_role_login_di.server_id 关联 dim_server_info.server_id 等。

### 2. Live Comparison Runner

创建使用真实 LLM（DashScope/DeepSeek）的 comparison runner。

区别于 scripted comparison-runner：使用真实 LLM 而非 ReplayLlm。跑两组：

- A 组 graph ON：EngineDeps.graph = 从 K11 dimension_refs 构建的 RelationGraph
- B 组 graph OFF：EngineDeps.graph = undefined

比较两组的 pass_rate 差异。

关键：

- 使用 SemanticLayerService.getRelationGraph() 产生的真实图（非手工 fixture）
- partitionResolver 使用 (name) => loadTableDefinition(name)?.partitions.map(p => p.name)
- dataSources 使用 loadRetrievalCorpusAll() 的真实 corpus
- LLM 使用项目配置的 DashScope/DeepSeek provider

### 3. 运行实验并记录

- 跑 comparison eval，记录 with-graph vs without-graph 准确率
- 将结果写入 wayfinder/semantic-layer/research/experiment-audit-log.md（按 AGENTS.md 规则：setup + 数据 verbatim + verdict + fidelity caveat + ticket 指针）
- 如果环境无 LLM key，用 stand-in 结果标注 caveat

### 4. Close P3 Ticket

在 wayfinder/semantic-layer/tickets/P3-ontology-nl2sql-integration.md 中：

- 添加 Resolution 记录
- 将 Status 改为 Resolved
- 更新 map.md 的 Decisions so far

## 参考文件

| 文件 | 用途 |
|------|------|
| packages/data/nl2sql-engine/src/eval/comparison-runner.ts | 已有的 scripted comparison |
| packages/data/nl2sql-engine/src/eval/join-cases.ts | 已有的 3 个 fixture cases |
| packages/data/nl2sql-engine/src/engine.ts | graph 集成逻辑（约 line 90-120） |
| packages/data/nl2sql-engine/src/ontology.ts | 纯函数 |
| packages/data/semantic-layer/src/index.ts | getRelationGraph() + loadRetrievalCorpusAll() |
| packages/data/tool-search-data-sources/src/index.ts | 生产 tool（已有 graph 接线） |
| packages/data/tool-critique-sql/src/index.ts | 生产 critic（已有 declaredJoinPairs 接线） |

K11 语义层数据：scope root 配置在 bundle 中（semanticRoot 指向的目录含 tables/events/metrics）。

## 验收标准

- [ ] 至少 3 个基于 K11 真实数据的多表 join eval case
- [ ] Comparison runner 可跑（live LLM 或标注 caveat 的 scripted 降级）
- [ ] 实验结果写入 audit log
- [ ] P3 ticket closed + map updated
