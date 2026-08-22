# T1 — 手动导入 RBI K11 语义层定义

**Type**: task
**Status**: Resolved (2026-08-22)
**Blocked by**: —

## Resolution

Phase 1（2026-08-22）从 RBI 源仓库 `reverse-bi/resources/semantic-layer/10000251/` 完整迁移到 `examples/k11-semantic-layer/`：

- **tables**: 321 YAML（162 DWS + 159 DIM），扁平存放；跳过 1 个 `.lock`。原 10 张 ODPS-metadata 生成的种子被 RBI curated 版覆盖。
- **events**: 453 文件（445 可加载 + 7 `_index.yaml` 域清单 + 1 损坏 `funcPoint_activity.yaml`）。
- **顶层**: config / domains / terminology / **field_samples**（新增）。

**Schema 兼容性**：321/321 表 + 445/445 事件 `safeParse` 全绿，0 失败；159 DIM 全部满足 `primary_key` 非空 superRefine。RBI 格式与 `TableDefinitionSchema`/`EventDefinitionSchema` 兼容（原「P6b 解析与 RBI 不兼容」预判 bug 未出现）。

`k11-seed.spec.ts` 断言更新为 445 events / 321 tables / 445 corpus，9 测试全绿。

> 此前的 partial resolution（10 表 + 12 事件由 enrichment agent 从 ODPS metadata 生成、丢失 relations）已由完整 RBI 迁移取代。步骤 5-6（检索 + 全链路验证）随 G3 enrichment + RelationGraph 落地而解锁（见 [dws-dim-discovery-report](../research/dws-dim-discovery-report.md)）。

## Question

将 reverse-bi 中 K11 的 curated YAML 定义手动复制到运行时目录，验证当前链路。

## 执行步骤

1. 确认 reverse-bi 仓库中 K11 语义层定义目录位置
2. 确认目标目录结构要求（config.yaml / events/ / tables/）
3. 复制 events、tables、terminology YAML 到目标目录
4. 临时配置 semanticRoot 指向该目录
5. 验证 search_data_sources 能返回 K11 数据源
6. 验证「查询K11昨天的DAU」全链路

## 注意

- 一次性操作，用于验证和实际工作
- per-scope 机制实现后迁移此配置
- 如果 P6b YAML 解析与 RBI 格式不兼容，记录为 bug
