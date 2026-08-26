# P14 — 引擎消费 Ontology 元数据做表选择优化（粒度感知 + 关系图扩展）

**Type**: prototype
**Phase**: misc（nl2sql-engine 增强；跨 P6/P13 lineage）
**Status**: open
**Blocked by**: 无（P6b ctx.schema 已 ship + dimension_refs 已建模 + granularity 字段已填充）

## Question

当前 nl2sql-engine 的检索→生成管道中，BM25 返回候选表后**直接交给 LLM 生成 SQL**，不利用 ontology 已有的两类元数据：
1. **表粒度**（`granularity` 字段：`_df` 日全量快照 vs `_di` 日增量）
2. **表间关系**（`dimension_refs`：JOIN 条件 + 外键映射）

导致两类系统性错误（P11e eval 67.5% pass rate 的主要失败模式）：
- trend 类问题选中 `_df` 快照表，错误用 `ds` 分区做行为时间过滤（pass rate 仅 33.3%）
- multi-table 对比/关联问题只拿到单表，无法生成 JOIN（comparison pass rate 55.6%）

## 现状（ontology 侧已就绪）

**粒度信息**：
- 每张 DWS 表 YAML 已有 `granularity` 字段（如 "日全量快照(_df)：每业务日每账号一行累计汇总"、"日增量(_di)：每账号每日一行增量"）
- `table-kind.ts` `toCorpusItem()` 把整个 TableDefinition 作为 `payload` 放入 corpus item
- `toPromptContext()` 已输出 granularity 给 LLM prompt

**关系信息**：
- 每张 DWS 表 YAML 已有 `dimension_refs`（含 `dim_table` + `join_keys[{dws_column, dim_column}]`）
- `table-kind.ts` `relations()` 已提取为 `RelationDef[]`（type:'joins', target, on）
- `SemanticLayerService.getRelationGraph()` 已暴露关系图
- `Nl2sqlAgentResponder`（eval-cli context.ts）已调用 `schema?.getRelationGraph?.()` 传入 engine

**缺失（引擎侧未消费）**：
- `nl2sql-engine` grep `granularity` / `_df.*_di` / `dimension_refs` → **0 匹配**
- 引擎无粒度感知：不区分 trend 问题该用 `_di` 还是 `_df`
- 引擎无关系扩展：BM25 返回 1 张表就只用 1 张表，不沿 dimension_refs 扩展

## 设计方向（待 grill）

### A. 粒度感知候选过滤/重排

在 BM25 检索返回候选表后、送入 SQL 生成 prompt 前，加一个过滤/重排步骤：
- 检测问题意图信号（"趋势/变化/每天/每周" → 增量 `_di` 优先；"当前/总共/累计/快照" → 全量 `_df` 优先）
- 从候选表 payload 读取 `granularity` 字段，做 prefer/demote
- 可能实现：LLM prompt 中注入粒度规则 vs 确定性正则+启发式

### B. 关系图扩展（Relation Graph Expansion）

BM25 返回主表后，沿 `dimension_refs` 或 `getRelationGraph()` 自动发现关联表：
- 当问题涉及多维度（"各服务器的付费率" → 需要 server_info 维度表）时扩展
- 把扩展后的多表上下文（含 JOIN ON 条件）注入 SQL 生成 prompt
- 控制扩展深度（1-hop vs 2-hop）避免上下文爆炸

### C. 两者集成点

- 都在 `Nl2sqlEngine.run()` 内、BM25 linking 之后、prompt build 之前
- 不改 BM25 检索逻辑本身（那是 D2e/D2f 的 domain）
- 属于 "post-retrieval enrichment" 环节

## 依据 / 证据

- **P11e eval 结果**（k11v2-full-run-01，2026-08-26）：80 case，67.5% pass rate
  - trend 类 9 case 仅 3 pass（33.3%）—— 7/9 错误源于选中 `_df` 表
  - comparison 类 9 case 仅 5 pass（55.6%）—— 4/9 错误源于只有单表
- **Judge 维度分析**（典型 trend 失败）：table_selection=1, field_selection=0, filter_conditions=0 → 表对了（BM25 找到了），但字段/过滤逻辑错（用错了 ds 语义）
- **Ontology 数据验证**：grep `examples/k11-semantic-layer/tables/` 全部 162 张 DWS 表均有 `granularity` 字段；dimension_refs 覆盖率 >90%

## 关联

- [D2e](D2e-corpus-enrichment.md) / [D2f](D2f-activate-corpus-enrichment.md)：corpus enrichment 解决"BM25 能不能找到相关表"（recall）；本票解决"找到多个候选后选哪个 + 怎么扩展"（precision + multi-table）
- [P13/P13b](../phase-3/P13-nl2sql-engine.md)：nl2sql-engine 实现；本票是其 post-retrieval 增强
- [P11e](../phase-4/P11e-eval-case-set-v2-realistic.md)：eval case set 暴露此缺陷
- [G-DA4](G-DA4-event-table-name-grounding.md)：event→ODS 表名 grounding（已解决事件查表问题，本票解决 DWS 表间选择问题）

## Out of scope

- BM25 检索召回率提升（→ D2e/D2f/D2c-revisit，corpus enrichment + real embedder）
- Query rewriting（→ P15 独立票）
- Clarification/route-gate（→ G-DA2/P-DA1 已 resolved）
- SQL critic 工具（→ data-agent-conversation-readiness）
