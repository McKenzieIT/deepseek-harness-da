# M1d-time-filter-hint-multi-engine — 时间过滤 hint 引擎无关化

**Type**: grilling
**Phase**: misc（M1 follow-up）
**Status**: open
**Blocked by**: 无（低优先级，当前仅 MaxCompute 单引擎；引入第二引擎时升优先级）

## Question

`buildTimeFilterHint` 当前硬编码了 MaxCompute 特有语法（`MAX_PT()`、`ds` 分区假设）。后续引入其他数据库引擎（Hive/Spark/BigQuery/PostgreSQL）时，需要将 hint 模板引擎无关化，避免兼容问题。

### 现状

- `metric-engine.ts:buildTimeFilterHint` 输出中文字面量，含 `MAX_PT()`（MaxCompute 特有）
- 项目已有 per-engine `conventions.yaml` seam（`packages/query/query-maxcompute/conventions.yaml`），但 `buildTimeFilterHint` 未接入

### 需决策

1. **hint 模板存放位置**：是扩展现有 `conventions.yaml`（加 `time_filter_hints` 段），还是在语义层 table definition 上新增 `timeFilterPolicy` 字段？
2. **触发时机**：继续由 `metric-engine` 纯函数渲染（读 conventions），还是移入 prompt builder 统一管理？
3. **粒度判断逻辑**：当前用 regex 匹配 `granularity` 字段（`/快照|_df|全量/`），多引擎后粒度命名可能不同——是否标准化为枚举（`snapshot` / `incremental` / `accumulative`）？

### 建议方向（待 grill 确认）

```yaml
# conventions.yaml — 每引擎一份
time_filter_hints:
  snapshot: "ds 取最近可用分区（如 MAX_PT()），勿跨天 SUM/COUNT"
  daily: "按 ds 分区过滤，使用 WHERE ds = '...' 或 ds BETWEEN"
```

`buildTimeFilterHint` 改为接收 conventions 对象，按 granularity 枚举选模板。改动量约 10-15 行，不涉及架构变更。

## 文件

- `packages/data/nl2sql-engine/src/metric-engine.ts:buildTimeFilterHint`
- `packages/query/query-maxcompute/conventions.yaml`（扩展）
- `packages/query/query-maxcompute/src/conventions.ts`（EngineConventions 类型扩展）

## 触发条件

当项目引入第二个查询引擎（非 MaxCompute）时，此票应优先解决。单引擎阶段不需要行动。
