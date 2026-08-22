# P2 — Ontology Phase 1: 关系声明 + In-Memory 图

**Type**: task
**Status**: Resolved (2026-08-22)
**Blocked by**: G1, G2

## Question

实现 ontology 的基础层：DataSource definition 中的 `relations` 声明 + in-memory 关系图 + Metric kind plugin。

## Scope

### 1. Relations 声明

在 DataSource definition YAML 中增加 `relations` 字段：

```yaml
relations:
  - type: joins
    target: ods_login
    on: "user_id = user_id"
  - type: derived_from
    target: ods_pay_event
    description: "DWS 汇总自 ODS 支付事件"
  - type: related_to
    target: dws_social_behavior
    description: "同一用户群体的社交行为"
```

三种基础关系类型：`joins`（join key）/ `derived_from`（派生溯源）/ `related_to`（业务关联）。

### 2. In-Memory 关系图

- 运行时加载所有 definitions 的 relations → 构建 adjacency list
- 暴露 API：
  - `findJoinPath(sourceA, sourceB): JoinPath[]` — 寻找合法 join 路径
  - `getRelated(source, type?): DataSource[]` — 获取关联数据源
  - `getDerived(source): DataSource[]` — 获取派生链

### 3. Metric Kind Plugin

新增 `MetricPlugin` 实现 `DataSourceKindPlugin<MetricDefinition>`：

```yaml
kind: metric
name: DAU
description: "日活跃用户数"
computation:
  sql: "SELECT COUNT(DISTINCT user_id) FROM ods_login WHERE ds = '{{date}}'"
  metadata:
    aggregation: count_distinct
    field: user_id
    source: ods_login
    time_grain: daily
relations:
  - type: derived_from
    target: ods_login
    description: "基于登录事件的用户去重计数"
```

MetricPlugin 实现：
- `toCorpusItem()` — 可被检索命中
- `toPromptContext()` — Level 2 路径：将计算规则格式化为 LLM 可读描述
- `toExecutableRule()` — Level 2.5 路径：返回可执行 SQL 模板
- `relations()` — 返回 derived_from 边

### 4. Plugin.relations() 接口

`DataSourceKindPlugin` 接口新增 `relations(def: T): RelationDef[]` 方法。已有的 EventPlugin 和 TablePlugin 也可声明 relations（从 YAML 中读取）。

## 验收标准

- [ ] definitions YAML 支持 relations 字段，schema 校验通过
- [ ] 启动时构建 in-memory 关系图
- [ ] `findJoinPath` / `getRelated` API 可用
- [ ] MetricPlugin 注册到 DataSourceRegistry，检索可命中 metric
- [ ] 单元测试覆盖关系图遍历和 metric 加载
