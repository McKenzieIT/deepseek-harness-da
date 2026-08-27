# M1-range-where-hint — buildMetricContext 时间范围 WHERE hint

**Type**: task
**Phase**: misc（M1 low follow-up）
**Status**: resolved (2026-08-27)
**Blocked by**: 无

## Question

M1 虚拟投影重构后，metric 统一走 `buildMetricContext` 注入 LLM prompt。当前注入内容只有 expr + aggregation + caliber_variants，**不含时间范围过滤提示**。LLM 在生成 metric SQL 时需自行推断 WHERE ds 条件，容易出错（尤其 `_df` 快照表的 ds 语义是"数据日期"非"行为日期"）。

## 方案

在 `buildMetricContext()` 输出中，基于宿主 table 的 `granularity` + `partitions` 字段自动追加 hint：
- 有 `ds` 分区 + 日粒度 → "时间过滤：该指标按 ds 分区过滤，使用 WHERE ds = 'YYYY-MM-DD' 或 ds BETWEEN"
- 有 `ds` 分区 + 快照粒度 → "时间过滤：该指标按日全量快照，ds 取最近可用日期（MAX_PT），勿跨天聚合"
- 无 `ds` 分区 → 不追加

## 文件

- `packages/data/nl2sql-engine/src/metric-engine.ts:buildMetricContext`

## 验证

- eval regression gate ≥67.5%（不降）
- 单 case debug: "查询K11过去一周的DAU" 生成的 SQL 包含合理 ds 过滤

## Resolution (2026-08-27)

实现完成：

1. **metric-engine.ts**：新增 `HostTableInfo` 接口 + `buildTimeFilterHint(hostTable)` 纯函数；`buildMetricContext` 增加可选第三参数 `hostTable?: HostTableInfo`，向后兼容。
2. **engine.ts**：新增 `resolveHostTableInfo(sourceTable)` 方法——通过 `partitionResolver` 获取分区列、从 DataSourceDoc payload 提取 granularity（fallback 从表名 `_df` 后缀推断）；metric 路径中传入 `buildMetricContext`。
3. **metric-engine.spec.ts**：7 个新测试覆盖快照表 hint、日粒度 hint、无 ds 分区空 hint、undefined partitions、string 格式分区、集成 buildMetricContext、向后兼容。

vitest 16/16 全绿；tsc 零新增错误。
