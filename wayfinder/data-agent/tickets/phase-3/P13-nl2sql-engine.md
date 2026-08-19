# P13 — NL→SQL 引擎（极简 (B) 路径）

**Type**: prototype
**Phase**: 3
**Assignee**: —（unclaimed）
**Status**: Blocked by P4, P5, P6
**Graduated from**: map Not-yet-specified「语义层设计细节 / Text2DSL 选型」+ P6 research（`../research/p6-nl2sql-feasibility.md`）

**Question**: 在 P6 语义层 substrate 之上，ship 一个**极简 NL→SQL 引擎**（research 推荐的 (B) 路径），让 data-agent 具备 per-game「问句→数据」能力。完整引擎 (C) 已被研究判为单期不可行——本 ticket 只做 (B)：BM25 schema-linking + 改编 RBI v2-baseline prompt + ODPS 执行（P4）+ execution-feedback 自纠错 + 薄 regex 守卫 + eval gate；**主动 drop** plan_query（LATENT）/ sqlglot AST critic（无 TS 等价、RBI 用 hive 代理）/ answer-RAG（新域空语料）/ cross-encoder reranker。

**Design sketch（per research/p6-nl2sql-feasibility.md §4.4，待 grilling 细化）**:
- **(1) substrate**：P6 已 ship（EventDefinition/TableDefinition + BasicIndex + terminology + accumulated_definitions）。
- **(2) BM25 schema-linking 检索**：`search_data_sources`（UNDERSTANDING 工具）用 rank-bm25 算法直译 + jieba CJK 分词 + per-field 权重；向量侧用 DashScope text-embedding API + 内存余弦（或首期纯 BM25）。经 P5 `ctx.retrieval` seam。
- **(3) SQL 生成 prompt**：移植 RBI `v2-baseline.md` §3 staged SOP（A 准备/B 生成/C 校验/D 执行）+ §6 八规则 + §5 诚实拒答 + 工具目录映射 harness tool；MAX_SQL_PER_TURN 预算。适配 harness phase（P7 四阶段 preset）。
- **(4) 执行层**：ODPS query（HTTP API 或 odps-js）+ CostGuard + result_id 句柄 + 三态返回 + 近重复 SQL 门——复用 P4 `ctx.query.execute`。
- **(5) execution-feedback 自纠错**：parse_failed/TABLE_NOT_FOUND/SEMANTIC_MISMATCH → LLM 读错重写 → 近重复门防重发；最多 N 次。比 RBI 静态 critique 更可靠（对齐 BIRD-FIXER / Databricks Genie Inspect 路线）。
- **(6) 薄 regex 守卫**（替 sqlglot AST critic）：ds 分区必带、SELECT \* 告警、表名∈检索候选、GET_JSON_OBJECT 字段∈event params（字符串匹配）。
- **drop**：plan_query / UnifiedQueryIndex(answer RAG) / sqlglot AST critic / cross-encoder reranker。

**前置项（须先解，否则 (B) 重演 RBI 9% 而不知）**:
- **eval gate**：P6/P13 须配自建 per-scope eval cases + L1 pass-rate 门（RBI 的 161 cases 是 RBI 游戏专用，data-agent 需自建）。
- **DashScope text-embedding 探针**：是否经内网 AGA 网关可用（qwen text-embedding 模型）；不可用首期纯 BM25（仿 P2 探针法）。
- **sqlglot critic drop 的漏判风险**：GET_JSON_OBJECT 字段名校验从 AST 降为字符串匹配（嵌套/动态路径漏判）；执行反馈兜底。

**Blocked by**: P4（`ctx.query.execute` 执行 + CostGuard）、P5（`ctx.retrieval` seam + embedder）、P6（substrate：types/reader/writer/BasicIndex/terminology/accumulated）。P6 已 resolved（2026-08-19）。

**Research**: → `../../research/p6-nl2sql-feasibility.md`（RBI NL→SQL 一手源 file:line + 前沿 BIRD/Spider SOTA + 语义层杠杆 + sqlglot MaxCompute 缺席 + (A)/(B)/(C) 三选项判定）。
