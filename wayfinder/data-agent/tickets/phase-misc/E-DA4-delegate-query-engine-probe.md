# E-DA4 — delegate_query Nl2sqlEngine 可行性实验

**Type**: task (AFK)
**Phase**: misc
**Status**: open
**Assignee**: (unclaimed)
**Blocked by**: 无
**Related**: [P-DA4](P-DA4-scope-routing-tools.md)（resolved，设计方向）

## Question

P-DA4 决定 delegate_query 通过直接实例化 `Nl2sqlEngine`（packages/data/nl2sql-engine）实现跨 scope 查询，不走 subagent / 独立 Cordis root。需要用实验验证这条路径端到端可行。

## 实验清单

### 1. Nl2sqlEngine 对 X63 scope 的 corpus 可用性

- 从 `examples/x63-semantic-layer` 加载 corpus（`loadRetrievalCorpus`）
- 构建 `Bm25Linker`
- 对"X63 昨日登录日活"做 BM25 检索
- 验证：能否正确召回 `ods_10000334_all_view` + 相关事件定义

### 2. Engine 跨 scope 生成 SQL

- 用 X63 corpus 初始化 engine（当前默认是 K11）
- 调用 `engine.run({ question: 'X63 昨日登录人数' })`
- 验证：生成的 SQL 使用 `hdyl_data_sg.ods_10000334_all_view`（非 K11 的 `ieu_ods.ods_10000251_all_view`）

### 3. ODPS executor 跨 workspace 执行

- X63 在 `overseas-prod` 环境（config.yaml: `maxcompute.environment: overseas-prod`）
- K11 在 `domestic-prod` 环境
- 验证：`OdpsExecutor` / `MaxComputeQueryEngine` 能否根据 SQL 中的 workspace 前缀路由到正确的 ODPS endpoint

### 4. Conventions 加载

- 从 X63 的 `config.yaml` 加载 SQL conventions（partition format、guards、params_extract_template）
- 传入 `Nl2sqlEngine({ conventions })`
- 验证：生成的 SQL 遵循 X63 的 conventions（正确的分区字段、GET_JSON_OBJECT 模板）

### 5. 并行实例化

- 同时创建 K11 engine + X63 engine
- 并行运行 engine.run()
- 验证：无竞态、结果正确

## 成功标准

- 所有 5 项通过 → P-DA4 方案确认可行，进入实现
- 第 3 项失败（ODPS 跨 workspace）→ 需要 per-scope ODPS config adapter，复杂度提升但仍可行
- 第 1/2 项失败 → 需要重新评估（可能 corpus 质量不足，需要 delegate 前由主 agent 预检索）

## 实验形式

参考 eval-cli 的 smoke test 模式（`packages/query/query-tool/dev/query-tool-smoke.ts`），写一个 dev script：
```
packages/data/tool-scope-routing/dev/delegate-probe.ts
```
