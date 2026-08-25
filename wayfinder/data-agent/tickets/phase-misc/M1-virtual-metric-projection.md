# M1-virtual-metric-projection — 语义层 metric 存储模型：独立 yaml vs 运行时虚拟投影派生

**Type**: grilling（planning；destination + 依赖决策待 grilled）
**Phase**: misc（cross-phase / semantic-layer 存储模型）
**Assignee**: wayfinder-session 2026-08-24
**Status**: Implemented + merged to master 2026-08-24（7 commits bfa194bf→3b8371d7，fast-forward merge，226 tests pass on merged；plan docs/superpowers/plans/2026-08-24-virtual-metric-projection.md）。1 Low follow-up：buildMetricContext range query WHERE（hint-quality，LLM 推断+critic 兜底）。
**Surfaced by**: 「查询K11过去一周的DAU」查询阻塞调研（LLM 未走 execute_metric → 候选不标注 type → metric 独立 yaml 是检索粒度根因）+ metric 独立 yaml 双重表示调研（3916 文件 vs table/event 内嵌 metrics 块）+ 一致性实验（独立 yaml 是纯机械投影，零精修）。
**Scope**: 语义层 metric 的存储与检索模型——是否从 3916 个独立 metric yaml（双重表示 + seedMetrics 提取 + 无同步 watcher）改为运行时虚拟投影派生（单一数据源 = table/event yaml，检索时为每个内嵌 metric 发射带 `kind:'metric'` 的虚拟 CorpusItem）。
**Question**: 语义层的 metric 当前是双重表示（table/event yaml 内嵌 `metrics:` 块 + 3916 个独立 metric yaml 机械提取副本）。独立 yaml 的真价值不在执行（execute_metric 真实场景价值有限）而在检索粒度（table-kind `toCorpusItem` 不打包 metrics 块，table-only 对"DAU"召回 0.00）+ Level 2.5 `kind:'metric'` 路由信号 + 关系图一等节点。是否重构为运行时虚拟投影？若重构，派生逻辑、metric-kind 去留、loadMetricDefinition 契约、execute_metric 角色、召回验证义务如何定？

## Resolution（2026-08-24，grilling + 3 research tickets）

8 决策 grilled resolved（M1a/M1b/M1c research 辅助）：

| # | 决策 | 结果 |
|---|---|---|
| 1 | destination | **A** 虚拟投影重构（去 3916 独立 metric yaml，运行时派生） |
| 2 | 派生触发点 | **B** 独立派生 pass（`loadRetrievalCorpusAll` 后处理，`toCorpusItem` 契约不变） |
| 3 | metric-kind 去留 | **C** 彻底重构（删 `metric-kind.ts`，schema 搬 types.ts，relations/toCorpusItem 搬 metrics.ts 纯函数，删 dead code） |
| 4 | loadMetricDefinition 契约 | **A** 契约不变，实现改（解析 `name→host+key` 从宿主派生） |
| 5 | execute_metric 角色 | **B** 删 execute_metric + Level 2.5（M1b 证实：触发率 ~0% + 204 SUM-on-`_df` 指标确定性错误），metric 统一走 buildMetricContext 注入 |
| 6 | 召回验证 | **A** 所有修改后重测（项目准则）+ D2g 113 gold 召回对比 |
| 7 | caliber_variants | **A** 派生带（M1c 证实：修复 schema gap 恢复 planner Type B 消歧信号；冗余是误读） |
| 8 | 迁移 | **A** 直接删除（验证通过后删 metrics/ + seedMetrics） |

**核心方向**：metric 从"独立 data source kind + 3916 yaml"重构为"table/event 的运行时派生视图"——单一数据源，消除双重表示 + 同步负担。派生 pass 复用 `metrics.ts` 现成 `toMetricDefinition`/`extractMetricsFromTable/Event`。metric-kind 删除，schema 搬 types.ts，relations/toCorpusItem 搬 metrics.ts 纯函数，删 dead code（toPromptContext/toExecutableRule/toCriticContext/getId）。execute_metric + Level 2.5 删（M1b 证实有害）。caliber_variants 派生带（M1c 证实恢复消歧信号）。

**实施**：plan `docs/superpowers/plans/2026-08-24-virtual-metric-projection.md`；subagent-driven 执行 8 task（每 task implementer + spec/quality review）；7 commits on `m1-virtual-metric-projection` 分支 → fast-forward merge master；275 tests pass + host typecheck M1-clean + verify-cordis-config 135 + dsh web HTTP 200；final review READY TO MERGE。

**下一步**：buildMetricContext range WHERE follow-up（Low）（C 重构影响面：删 metric-kind.ts + index.ts getRelationGraph/loadByStorageDir/loadMetricDefinition 改 + metrics.ts loadMetricDefinitions 改派生 + 删 tool-execute-metric 包 + engine L2.5 分支删 + preset 行删 + phase-gate whitelist/prompt 改 + 删 metrics/ 目录 + seedMetrics），按决策 6 全程重测。

## Why mandatory（非可选）

- **双重表示同步负担**：`seedMetrics`（`metrics.ts:215`）一次性快照提取，**无 watcher、无反向同步**——人改 table/event 的 metrics 块 → 独立 yaml 过期直到重跑 seed；人丰富独立 yaml → table 块不更新。双向漂移。且提取**有损**（`caliber_variants` 丢失，`metrics.ts:71-72` 注释明说"no home … not carried over"）。
- **检索粒度根因**：`table-kind.toCorpusItem`（`table-kind.ts:21-30`）**完全不打包 metrics 块**，BM25 索引器只读 `description ×1` + `Object.keys(metrics) ×1`（`bm25-linking.ts:163-165`）。table-only 对"DAU"召回 **0.00**，独立 metric 才有正分。**这是必须保留独立 yaml 的唯一硬约束**——但虚拟投影（table-kind 为每 metric 发射一条虚拟 item）能等效满足。
- **当前阻塞**：LLM 命中 metric 候选后未走 execute_metric（候选 `SearchHit` 只有 `{id, score, description, mode}`，`mode` 是检索模式非数据源类型，无 type 标注 → LLM 无法稳定识别 metric 走捷径 → 自己写 SQL 用错表名 → critic `table_not_in_candidates` → 无限重试）。虚拟投影派生的 metric payload 自带 `kind:'metric'`，search 返回时能标注 type → 附带解决当前阻塞。

## Evidence（已调研，grilling 依据）

- **execute_metric 适用性**（subagent A）：能力边界极窄——仅裸聚合 + 单时间段 + 无 GROUP BY/JOIN/多指标/对比；触发需 BM25 恰好命中 1 metric + 0 其他候选；对 `_df` 快照型比率指标（pay_rate）确定性产出**错误结果**（跨天聚合快照重复计数）。真实业务问题（多指标/分组/对比/环比）大多走 GENERATION。rbi 的"一指标一SQL"是 LLM 拆解 + GENERATION 生成，非确定性执行。→ execute_metric 捷径价值有限；metric 独立 yaml 真价值在检索召回 + Level 2 上下文注入（`buildMetricContext` `metric-engine.ts:124-130`）。
- **独立 yaml vs table 块**（subagent B）：字段层面独立 yaml 无不可派生字段（`kind:'metric'` 除外，aggregation/field/source/domains/relations 全可运行时从 SQL+宿主派生，且当前对复杂 SQL 的 field 派生**反而是坏的** `y) / NULLIF(COUNT(*), 0`）。结构层面 3 个不可替代价值：检索粒度 / `kind:'metric'` 路由信号 / 关系图一等节点。
- **一致性实验**（subagent C）：3916/3916 description 100% 一致（零精修），无独有字段，relations 全是 derived_from 指向 source（0 跨表）。**关键修正**：71%（2762）metric 来自 **event yaml 的 metrics 块**，仅 29%（1154）来自 table——虚拟投影必须**同时覆盖 table-kind 和 event-kind**。

## Open decisions（grilling 候选，breadth-first）

0. **前置（需 research/实验）→ Resolved 选项2（并行）**：M1a research ticket fired + resolved——YAML 结构支撑缺口已查（见 M1a：area1 多引擎 conditionally needed/scope-registry defer；area2 自进化 per-table project 推荐+schema 化；area3 检索 metric description 必须进派生虚拟 item，B 已解决）。A/B 派生方式与 YAML 结构正交，并行 grill。
1. **destination 本身 → Resolved A**：虚拟投影重构（去 3916 独立 metric yaml，运行时派生）。
2. **派生触发点 → Resolved B**：独立派生 pass（`loadRetrievalCorpusAll` 后处理，`toCorpusItem` 契约不变）。复用 `metrics.ts` 现成 `toMetricDefinition`/`extractMetricsFromTable/Event`。
3. **metric-kind 去留 → Resolved C（彻底重构）**：删 `metric-kind.ts`——schema（`MetricDefinitionSchema`）搬 types.ts；`relations`/`toCorpusItem` 搬 metrics.ts 作纯函数；删 dead code（`toPromptContext`/`toExecutableRule`/`toCriticContext`/`getId`，生产不调，仅 registry.spec 覆盖）。metric 不再是 data source kind，是 table/event 的派生计算。影响面：`index.ts` getRelationGraph（:239-240 改派生）/loadByStorageDir（:287 删 metrics 分支）/loadMetricDefinition（:448 改派生）、`metrics.ts` loadMetricDefinitions（改派生）、evidence-query 调用点、registry 测试（metricKindPlugin 测试删/迁移）。
4. **loadMetricDefinition 契约 → Resolved A**：契约不变（`loadMetricDefinition(name): MetricDefinition | null`），实现改——解析 `name`（`lastIndexOf('__')` 拆 host+key，event name 含 `.` 不含 `__` 安全）→ loadTableDefinition/loadEventDefinition 尝试找宿主 → 取 `host.metrics[key]` → `toMetricDefinition` 派生。调用方（execute_metric 若留、evidence-query）零改。
5. **execute_metric 角色 → Resolved B（M1b 实验证实可删）**：删 execute_metric 工具（tool-execute-metric 包）+ engine Level 2.5 确定性分支，metric 统一走 Level 2 `buildMetricContext` 注入 GENERATION + LLM 生 SQL + critic。M1b 证据：触发率 ~0%（D2g 113 gold 全 event-retrieval）；**204 个 SUM-on-`_df` 指标 L2.5 确定性错误**（跨天聚合累计快照重复计数 ~24×）；L2 有 prompt rule 1（`_df` 用 MAX_PT）+ `_df` 后缀 + "累计"描述 → 快照语义感知。删影响面：tool-execute-metric 包、engine.ts:165-210 L2.5 分支、metric-engine.ts:117 buildExecutableSQL、metric-engine.spec.ts L2.5 断言、metric-comparison.spec.ts+runner、agent.cordis.yml:104-105 preset 行、phase-gate types.ts:160 whitelist + phase-gate.ts:86,91 METRIC SHORTCUT prompt。保留 buildMetricContext/routeMetric 的 level-2/null 臂。
5. **execute_metric 角色**：重构后仍作确定性捷径 vs 降为纯 Level 2 上下文注入（调研示真实场景价值有限，且对 `_df` 快照型有语义错误风险）。
6. **召回验证义务 → Resolved A**：所有修改后重测（项目开发准则）。重构后跑 D2g 113 gold 召回对比 baseline（term-only 77.0% strict / 79.6% loose），退化则修，结果入 experiment-audit-log。派生 `field` 修复（当前坏值→干净值）会改 metric corpus item description token，故必测。
7. **caliber_variants 回填 → Resolved A（M1c 证实带）**：派生带 caliber_variants。M1c 纠正冗余误读——rbi 多口径用多表（role/acc/dev act_di），非同表多 caliber；caliber_variants 是 per-metric 计算变体（win_rate 分母语义），metric-local，4 文件用，无跨表冗余。前沿（dbt/Cube/Looker）都内嵌 measure 无口径字典。真用途：planner Type B `metric_caliber` 消歧信号（≥2 variants 触发 L2-declare/L3-confirm）。当前 seedMetrics 丢 caliber_variants 是 schema gap（MetricDefinitionSchema 无该字段）非设计选择——派生 MetricDefinition 必须加 `caliber_variants: CaliberVariantSchema[]`（default []，保 at-most-one-default refine），toMetricDefinition 传递 def.caliber_variants。虚拟 corpus item description 序列化 caliber 词汇增益 BM25 召回。K11 0 实例不影响（rbi-faithful 保信号）。
8. **迁移 → Resolved A（直接删除）**：验证通过后删 `metrics/` 目录 + `seedMetrics` 脚本。Pre-release stance 背书自由重构 + 单一数据源原则 + git 历史可恢复 + 决策 6 重测兜底。B 并存不可行（C 重构后独立 yaml 不再被加载，seedMetrics 重跑重生已删文件）；C `_archived/` 多余。

## 关联

- [map](../../map.md) Decisions so far（D2e/D2f/D2g/D2h corpus enrichment 链 + P13b nl2sql-engine + G3 AI-native enrichment）
- [research/experiment-audit-log](../../research/experiment-audit-log.md)（D2g 113 gold 召回基准）
- [AGENTS.md](../../../../AGENTS.md) Pre-release stance（自由重构）+ 「composition 是选择不是代码分叉」+ capability seam 三角色
- [dsh-plugin-development](../../../../.agents/skills/dsh-plugin-development/SKILL.md) + [da-plugin-development-guidelines](../../../../docs/da-plugin-development-guidelines.md)
