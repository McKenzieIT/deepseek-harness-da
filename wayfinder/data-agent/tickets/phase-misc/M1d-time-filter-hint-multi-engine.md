# M1d-time-filter-hint-multi-engine — 时间过滤 hint 引擎无关化

**Type**: grilling
**Phase**: misc（M1 follow-up）
**Status**: resolved
**Blocked by**: 无
**Resolved**: 2026-08-27

## Question

`buildTimeFilterHint` 当前硬编码了 MaxCompute 特有语法（`MAX_PT()`、`ds` 分区假设）。后续引入其他数据库引擎（Hive/Spark/BigQuery/PostgreSQL）时，需要将 hint 模板引擎无关化，避免兼容问题。

## Resolution

### 决策 1 — hint 模板存放位置：两层分离（Ontology vs Operational）

**不放在 conventions.yaml，也不放在表定义上。** 采用语义层内部 Ontology/Operational 分层：

- **Ontology 层**（`TableDefinition.temporalPolicy`）：表声明自己的时间访问模式——纯语义事实，引擎无关。新增字段：
  ```typescript
  temporalPolicy: z.enum(['latest-partition', 'range-partition', 'static', 'none']).default('none')
  ```

- **Operational 层**（`semantic-layer/src/temporal-hints/templates/<engine>.yaml`）：给 LLM 的 hint 文案，按引擎分文件。独立于表定义，由 prompt 工程师维护：
  ```yaml
  # templates/maxcompute.yaml
  latest-partition: "ds 取最近可用分区（如 MAX_PT()），勿跨天 SUM/COUNT 避免重复计数"
  range-partition: "按 ds 分区过滤（日粒度），使用 WHERE ds = '...' 或 ds BETWEEN"
  static: ""
  none: ""
  ```

**关键区分**：`temporalPolicy` 是 Ontology（表的固有属性，稳定、引擎无关）；`time_filter_hints` 是 Operational 配置（LLM 操作指南，会迭代、引擎相关）。两者变更频率和负责人不同，不应混在一起。

### 决策 2 — 触发时机：enrichment 阶段 resolve，metric-engine 消费 string

- **Resolve**：语义层 enrichment（corpus 构建时）用 `resolveTimeHint(policy, engine)` 将 `(temporalPolicy, engine)` 解析为 plain string，挂在 enriched table 对象上
- **消费**：`buildTimeFilterHint` 退化为读 `hostTable.resolvedTimeHint`，不再有任何时间逻辑、正则、或 conventions 依赖
- **多消费者受益**：nl2sql-engine、prompt builder、query guard、eval 都直接消费 resolved string

### 决策 3 — 粒度标准化：固定枚举模式

采用四种固定模式（非灵活组合结构）：

| 模式 | 语义 |
|------|------|
| `latest-partition` | 快照表，取最新分区，禁止跨天聚合 |
| `range-partition` | 增量/日增表，按分区列范围过滤 |
| `static` | 静态参考表（维表），无需时间过滤 |
| `none` | 未声明 / 不适用，不生成 hint |

**选择固定模式而非灵活结构的原因**：
- 对 LLM：hint 输出可预测、token 少、合规验证简单
- 对 Harness：dispatch 逻辑 = enum switch，测试穷尽
- 灵活结构的回报需要多引擎 + 大量边缘 case 才能体现，当前不需要

**向后兼容**：新增 `classifyGranularity(raw: string): TemporalPolicy` 映射函数，将现有中文 granularity 文本映射到枚举（`/快照|_df|全量/` → `latest-partition`），已声明 `temporalPolicy` 的表直接使用枚举值。

## 架构概览

```
semantic-layer/
├── src/types.ts              ← Ontology: TableDefinition.temporalPolicy (enum)
├── src/temporal-hints/       ← Operational: hint 注册表
│   ├── index.ts              ← resolveTimeHint(policy, engine): string
│   └── templates/
│       ├── maxcompute.yaml
│       └── (future engines)
├── src/enrichment.ts         ← resolve 时机：corpus 构建时注入 resolvedTimeHint

nl2sql-engine/
├── src/metric-engine.ts      ← 消费者：读 hostTable.resolvedTimeHint，拼接
```

## 消费链路

```
TableDefinition.temporalPolicy (Ontology)
         +
temporal-hints/templates/<engine>.yaml (Operational)
         │
         ▼ enrichment (resolve once)
  enriched table.resolvedTimeHint: string
         │
         ├──→ nl2sql-engine (metric context)
         ├──→ prompt builder (future: 纯表查询)
         ├──→ query guard (future: 校验 SQL 合规)
         └──→ eval (future: 评估 LLM 执行质量)
```

## 触发条件

当项目引入第二个查询引擎（非 MaxCompute）时实施。单引擎阶段可选择性提前落地 `temporalPolicy` 字段 + 向后兼容 `classifyGranularity`，为后续切换做准备。

## 涉及文件（实施时）

- `packages/data/semantic-layer/src/types.ts` — 新增 `temporalPolicy` 字段
- `packages/data/semantic-layer/src/temporal-hints/` — 新建 hint 注册表
- `packages/data/semantic-layer/src/enrichment.ts` — resolve 逻辑
- `packages/data/nl2sql-engine/src/metric-engine.ts` — 简化 `buildTimeFilterHint`
- `packages/query/query-maxcompute/conventions.yaml` — 不再扩展（hint 不在此）
