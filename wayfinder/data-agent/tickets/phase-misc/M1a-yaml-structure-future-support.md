# M1a-yaml-structure-future-support — 语义层 YAML 结构对后续功能（多引擎/自进化/检索质量）的支撑缺口

**Type**: research（AFK；M1 grilling 决策 0(c) 并行实验）
**Phase**: misc
**Assignee**: wayfinder-session 2026-08-24
**Status**: Open（research subagent fired）
**Surfaced by**: M1 grilling 前置问题——"语义层 YAML 结构不一定最优，理由充分可重构实验"。决策 1（虚拟投影去独立 yaml）与 A/B（派生方式）正交，故 (c) YAML 结构支撑度并行 research，不阻塞 A/B grilling。
**Scope**: 当前语义层 YAML 结构（metrics 内嵌 table/event 的 metrics 块 + config.yaml project.name + table/field schema）对后续功能的支撑缺口调研。
**Question**: 当前 YAML 结构在 (1) 多引擎/多 project 查询 (2) 自进化（运行时写 YAML 修 metric project override）(3) 检索质量（description 打包策略）三方面有什么缺口？是否需要结构优化（理由充分时可重构）？

## 实验任务

1. **多引擎/多 project**：当前 `qualifyTableName` 读 `config.yaml → project.name`（单 project）。调研：
   - 多 scope/多 project 场景（一个语义层 root 跨多 ODPS project）下，config.yaml 单 project.name 是否够？
   - scope-registry 的 `default_project` 字段是否已存在？是否该 schema 化？
   - `packages/data/scope-registry/src/index.ts` 的 metadata bag 能否承载 default_project？
   - 多引擎（MySQL/Hologres）时 qualifyTable 的 namespace 模型是否引擎无关？

2. **自进化**：M1 后续 Phase 2 要 `update_table_config` 工具写 metric project override 到 table yaml。调研：
   - table 的 metrics 块 schema（`MetricDefSchema`）当前支持 per-metric `project` 字段吗？还是只在 table 顶层？
   - `.loose()` passthrough 能否承载？还是需 schema 化？
   - 运行时写 YAML 的 io.ts write API（updateTableMeta）能否精准更新 metrics 块内某 metric 的字段？

3. **检索质量**：当前 description 打包策略。调研：
   - table-kind `toCorpusItem` 不打包 metrics 描述（召回 0.00 根因）——虚拟投影后 metric description 进哪？
   - event-kind 已设 CorpusItem.metrics 字段但 BM25 只索引 key 名——description 该怎么打包 metric 描述才最优？
   - D2g/D2h 已测的 corpusVariant（params+term vs term-only）与 metric description 打包的关系？

## 报告要求

< 700 字，给 file:line 证据 + 具体缺口清单 + "是否需结构优化"的判断（需/不需/条件需）。
