# P6 · NL→SQL 可行性调研（data-agent 完整引擎 vs 仅语义层基底）

> 研究问题：dsh-data-agent 能否在 P6 单期 ship 一个**完整** NL→SQL 引擎（re-implement RBI 的 plan_query→生成→critique→执行 链到 TS harness），还是只能 ship **语义层基底**？RBI 的 NL→SQL 真实成熟度几何？"DSL" 到底是什么？TS 移植成本？最小可行路径？给 P6 scope 决策（A 仅基底 / B 基底+极简 NL→SQL / C 完整 NL→SQL）一个有据的推荐。
>
> 本笔记读 RBI 一手源（planner/sql_critic/unified_search/query_index/eval-cases runs/prompts/phases）+ 前沿 web（BIRD SOTA、语义层增强 NL2SQL、sqlglot 方言）。每条论断给出处。

## TL;DR

- **RBI 的 NL→SQL 链 = 原型级，非生产级**。实测 L1 执行通过率：全量 per-scope 中位 ~7–9%，**同 scope 同 model 跨 run 波动 7%↔74%**（infra 敏感 / eval flaky），最好单 run 也只 ~74%（仍低于 BIRD 通用 SOTA 72%，而本域是**约束域**、本应更高）。〔§1.4 eval-cases/_runs〕
- **"DSL" 不是 LLM 生成的结构化 IR**。两件事被叫 "DSL"：(a) `plan_query` 产出的 `IntentSignature`——**规则式** regex 抽取（time/measures/dimensions/filters/subject/event_names），无 LLM；(b) `critique_sql_tool` 的 `dsl_json` 入参——**LLM 自报**的自由 JSON（metrics/dimensions/filters/tables/join_keys），描述"我打算写啥"，critic 校验 SQL≡自报。**无 canonical Text2DSL 步骤**。〔§1.1〕
- **`plan_query` 整支是潜伏代码**：不在任何 phase allowlist（`GENERATION_TOOLS = {critique_sql_tool, evaluate_sql_quality}`，无 plan_query；源码注释自承 "latent, not dead — external MCP client can still call it directly, but nothing in the agent track reaches it"）。RBI 实跑链 = UNDERSTANDING(search+load) → GENERATION(LLM 直接写 SQL + 自报 dsl → critique_sql_tool) → EXECUTION(query_data)。**planner 被绕过**。〔§1.2〕
- **critique_sql 是预执行静态校验**（sqlglot AST，`_DIALECT="hive"` 作 MaxCompute 代理），clause 级 fail-open；**无执行反馈闭环**（self-correction 靠 agent prompt 驱动 LLM 读错重写，非独立模型；近重复 SQL 门防重发）。〔§1.3〕
- **语义层是真成熟面**：`EventDefinition`/`TableDefinition` YAML + `rbi-semantic`(reader/writer atomic+validate+cache-invalidate ADR-0011 / `BasicIndex` dep-free) 已生产化；`UnifiedSearchIndex`(BM25+sqlite-vec+RRF+cross-encoder reranker, bge-m3) 是 schema-linking 检索，成熟但重依赖。〔§1.5〕
- **TS 移植成本分层**：语义层基底(低) / SQL 生成 prompt(低，是文本) / 执行+CostGuard(中，ODPS SDK 待定) / BM25 检索(中，算法可移植但 sqlite-vec+bge-m3+cross-encoder 无 JS 对等) / **sqlglot critic(高，Python 无 TS 等价；node-sql-parser 无 MaxCompute 方言)** / **planner(很高，88KB Python regex 域耦合 + 潜伏)**。〔§2〕
- **前沿**：BIRD 人类 92.96%、GPT-4 落地 54.89%、SOTA OpenSearch-SQL 72.28%(2024.8，多智能体+对齐+SQL-Like IR)；生产真实 ~59% exact-match / 40% 带变换；**语义层增强（WrenAI MDL / Vanna RAG / DBSL）是公认可行性杠杆**（"给 agent 业务定义而非裸表，NL→SQL 准确率提升是 prompt tuning 达不到的"）。Vanna 已于 2026-03 archived。〔§3〕
- **推荐 P6 scope = (B) 语义层基底 + 极简 NL→SQL**。理由：(C) 完整引擎移植 sqlglot(planner+critic 全链)+双检索索引(bge-m3+sqlite-vec+cross-encoder)+88KB 潜伏 planner + 9% 通过率自修，非单期可达，且 RBI 自身 9% 证明该链未完工——移植=继承一个已知坏掉的引擎；(A) 仅基底放弃 data-agent 核心价值（用户要的是 per-game NL→SQL）。(B) 约束在 per-game 单 scope，ship：语义层 + BM25 检索 + DashScope SQL 生成(语义层接地 prompt) + 执行反馈重试 + 薄 regex 守卫，**主动 drop** sqlglot AST critic / cross-encoder / 潜伏 planner / Tier1/2 answer RAG(新域空语料)。〔§4〕

## 1. RBI NL→SQL 一手源（每条带 file:line）

### 1.1 "DSL" 是什么——两件事，都不是 LLM IR

`plan_query` 的"DSL"是**规则式 IntentSignature**：

- `libs/rbi-retrieval/src/rbi_retrieval/intent_types.py:46-87` `IntentSignature` dataclass：`time_windows / measures / dimensions / filters / subject / event_names` + `time_unresolved / cohort_unresolved`（第三态）。模块 docstring 自承"deliberately dependency-free (stdlib only) so it is trivially unit-testable offline — no ODPS, no qodercli, no embedding model"。
- `planner.py:200` `parse_intent(question, semantic_index, scope_id)` = 组合 5 个 regex 抽取器：`_extract_time_windows`(planner.py:1048)、`_extract_measures`(1124)、`_extract_dimensions`(1186)、`_extract_subject`(1174)、`_extract_event_names`(1275)、`_extract_filters`(1433)。**纯 regex/字典匹配，无 LLM**。
- `planner.py:1503` `decompose_question` = regex 拆解（compare/vs 模式、conditional 模式、跨域 "X and Y" 拆分），`_determine_approach`(1929) 输出 `"direct"|"multi_step"|"clarify"`。**无 LLM**。
- planner 模块 docstring(planner.py:3-13) 明写："No external LLM calls — this is a deterministic, rule-based planning layer."

`critique_sql_tool` 的"dsl"是**LLM 自报 JSON**：

- `libs/rbi-mcp/src/rbi_mcp/servers/semantic.py:349-372` `critique_sql_tool(sql, question, dsl_json="{}", semantic_fields_json, event_params_json)`：`dsl = json.loads(dsl_json)`(semantic.py:370)。即 **LLM 调用此工具时自己写一个 JSON 描述"我这条 SQL 的 metrics/dimensions/filters/tables/join_keys/order_by"**，critic 校验 SQL 与该自报一致。
- `sql_critic.py:73-96` `critique_sql(sql, dsl, semantic_fields, event_params, candidate_sources)` 消费该 dsl dict（`dsl.get("metrics")`/`dsl.get("join_keys")` 等）。
- **结论**：无 canonical Text2DSL 步骤。OpenSearch-SQL 论文用 "SQL-Like 中间语言"（§3 web 引），RBI **没有**这一层。

### 1.2 plan_query 是潜伏代码（latency）——agent track 不走它

- `libs/rbi-agent/src/rbi_agent/data_agent/phases.py:183-228` phase allowlist：
  - `UNDERSTANDING_TOOLS` = `{search_data_sources, load_table_definition, load_event_definition, load_table_dimensions, present_clarification, save_accumulated_definition}` ∪ UNIVERSAL (phases.py:185-187,191,197,205,210)
  - `GENERATION_TOOLS` = `{critique_sql_tool, evaluate_sql_quality}` ∪ UNIVERSAL (phases.py:213-218)
  - `EXECUTION_TOOLS` = `{query_data}` ∪ UNIVERSAL (phases.py:222-227)
  - **`plan_query` 不在其中**。
- `planner.py:1754-1759` 注释自承："⚠️ LATENT CODE. This does not run today. ... `plan_query_tool` is in **no** phase allowlist (`grep -n plan_query libs/rbi-agent/.../phases.py` = 0) ... It is not dead — an external MCP client can still call `plan_query_tool` directly — but nothing in the agent track reaches it." `planner.py:1881` 重申 "reachable only via plan_query_tool, which no phase allowlist includes"。
- `_find_relevant_sources`(planner.py:1729) / `_domain_vocabulary`(1807) / `decompose_question`(1503) / `_determine_approach`(1929) 全部只经 plan_query 调用 → **整支潜伏**。
- 实跑链：UNDERSTANDING(`search_data_sources`→UnifiedSearchIndex 检索 + `load_table_definition`/`load_event_definition` 强制补调，见 `forced_load.py:69,77`) → GENERATION(LLM 在消息里直接写 SQL，调 `critique_sql_tool`+`evaluate_sql_quality`) → EXECUTION(`query_data`)。

### 1.3 critique_sql = 预执行静态校验，sqlglot+hive 代理，fail-open，无执行反馈

- `libs/rbi-mcp/src/rbi_mcp/sql_critic.py:19` `_DIALECT = "hive"`，注释 "MaxCompute closest dialect in sqlglot -- matches guard_chain.py convention"。**sqlglot 无原生 MaxCompute/ODPS 方言，hive 是代理**（§3 web 印证）。
- `sql_critic.py:73-96` `critique_sql` 流程：`_safe_parse`(sqlglot.parse, read="hive") → `_check_table_names`(D19 候选源校验) / `_check_select` / `_check_where` / `_check_join` / `_check_group_by` / `_check_order_by` / `_check_json_paths`(GET_JSON_OBJECT params 路径)。
- 判罚等级：列不在语义层 = `error`；DSL↔SQL 分歧（metric/filter/join_key 不一致）= `warning`（sql_critic.py:311, _check_select_metrics / _check_join P9-4 注释）；SELECT * / 缺分区 = `warning`。**fail-open 多**。
- `libs/rbi-semantic/src/rbi_semantic/sql_evaluator.py` `SimpleEvaluator`：规则式 0-100 评分，规则 `select_star(-10) / null_handling(-10) / union_without_all(-5) / unknown_column(-15 each) / agg_without_group_by(-20) / missing_partition_filter(-10)`。共享 AST 谓词 `ast_has_select_star`/`ast_has_partition_filter`。
- **无执行反馈闭环**：critique 是静态的；self-correction 在 agent prompt 层（`resources/prompts/v2-baseline.md:111` "Pre-exec critic...改过 SQL 必须重新 critique：指纹同源门会拒绝执行未经重评的 SQL"；`:124-134` "parse_failed→修 SQL 重 critique 再执行"、"TABLE_NOT_FOUND→带错误信息重新生成 SQL，不得重复生成相同 SQL"）。靠 LLM 读错重写 + 近重复 SQL 门，**非独立 critic 模型**。BIRD-FIXER(§3) 走的执行反馈微调路线 RBI 未采用。

### 1.4 真实成熟度——eval-cases L1 通过率

- `eval-cases/_coverage/latest.json`：5 scope（10000147/10000251/10000312/10000329/10000334），161 cases，全 `tier:verified`，provenance 143 migrated+18 synthetic。覆盖矩阵极稀疏（L1 trend/comparison/ranking/distribution/proportion/cohort 多数 empty；67.7% 集中在 L2 metric_lookup）。
- 单 case 结构（`eval-cases/10000251/eval_10000251_037.yaml`）：`input.question`/`scope_id` + `expected.sql` + `expected.result_value.value` + `dimensions{sql_complexity L1-L4, query_intent metric_lookup/trend/comparison/ranking/distribution/proportion/cohort, ...}` + `meta.tier=verified`。
- **L1 执行通过率（eval-cases/_runs/run_*.json 的 summary.l1_pass_rate）**：

| run | scope | cases | L1_pass | L1_fail | model |
|---|---|---:|---:|---:|---|
| 20260807_164029 | all | 17 | **0.941** | 0.059 | product-pipeline |
| 20260808_062654 | all | 17 | 0.529 | 0.471 | product-pipeline |
| 20260810_050149 | 10000251 | 43 | 0.070 | 0.930 | product-pipeline |
| 20260810_051229 | 10000334 | 20 | **0.000** | 1.000 | product-pipeline |
| 20260810_051517 | 10000312 | 33 | **0.000** | 1.000 | product-pipeline |
| 20260810_051956 | 10000329 | 42 | 0.071 | 0.929 | product-pipeline |
| 20260812_042014 | 10000312 | 33 | 0.394 | 0.576 | real-cross-region-probe |
| 20260812_043841 | 10000251 | 43 | 0.070 | 0.070 | real-cross-region-probe |
| 20260812_055312 | 10000251 | 43 | **0.093** | 0.907 | t4-anchor-repin |
| 20260812_062213 | 10000329 | 42 | **0.071** | 0.929 | t4-anchor-repin |
| 20260812_063828 | 10000329 | 42 | **0.738** | 0.262 | t4-anchor-repin |
| 20260812_065511 | 10000251 | 43 | 0.372 | 0.628 | t4-anchor-repin |

- 读法：(a) **同 scope 同 model 跨 run 巨幅波动**——10000329/t4-anchor-repin：7.1%↔73.8%；10000251/t4-anchor-repin：9.3%↔37.2%。说明 eval infra flaky（ODPS 连接/凭证/跨 region）+ 引擎本身不稳。(b) 全量 per-scope 中位 ~7–9%。(c) 0% 全失败的 run（10000334/10000312 product-pipeline）多半是 infra 塌，非纯 SQL 质量。(d) **即便最好单 run 73.8%，仍只在 BIRD 通用 SOTA 72% 附近——而本域是 per-game 约束域（窄 schema+curated terminology），本应显著高于通用 BIRD**。(e) L2/L3 layer 全部 `l2_coverage=0.0 / l3_coverage=0.0`——语义/诚实层未跑。
- **判定：原型级，非生产可靠**。`L2_cov=0` 说明连评估都只到执行层；引擎+eval 双向未完工。

### 1.5 双检索索引（重依赖，TS 移植主成本）

RBI 有**两个** BM25+sqlite-vec+RRF 索引：

1. **UnifiedSearchIndex**（schema-linking，检表/事件）：`libs/rbi-retrieval/src/rbi_retrieval/semantic/unified_search.py:217`。`build()`(unified_search.py:289) 用 `rank_bm25.BM25Okapi` + `sqlite_vec` vec0 虚表 + 本地 RRF(`_rrf_fuse`, RRF_K=60) + cross-encoder reranker(`load_reranker`) + 动态打分(`compute_final_score`)。per-field BM25 权重(name×3/metric_name×4/...)。DIM 维表不入语料。
2. **UnifiedQueryIndex**（answer RAG，Tier 1/2）：`libs/rbi-retrieval/src/rbi_retrieval/semantic/query_index.py:1-14` "BM25(FTS5) + sqlite-vec + RRF hybrid search over verified_answers + query_skills (reverse_bi.db) + golden-case rag_corpus (critic_registry.db)"。`QueryMatch` 分 Tier（1=强匹配上下文 / 2=参考案例）。v2-baseline.md:66-67 "Tier 1 命中：参考匹配 SQL 的数据源和结构...**不直接复用 SQL**；Tier 2：few-shot 示例"。

- 嵌入模型：`libs/rbi-retrieval/src/rbi_retrieval/semantic/embedder.py:318` `SentenceTransformer("BAAI/bge-m3")`；:316 类 `RealSemanticEmbedder`；:384 远程 HTTP embedder（url+model+dim，2s 超时）——降级梯 L0-L2（unavailable/timeout/not_ready/dim_mismatch，:346-349）。
- 重依赖：`libs/rbi-mcp/pyproject.toml:20-27` & `libs/rbi-retrieval/pyproject.toml:12-14` = `sqlglot>=25.9` / `rank-bm25>=0.2.2` / `sqlite-vec>=0.1.9` / `jieba>=0.42`；`rbi-semantic/pyproject.toml:9` 仅 `sqlglot>=25.9`（**基底包不依赖检索重件**）。
- **降级设计成熟**：embedder/reranker/sqlite-vec 任一缺，BM25 照常服务（unified_search.py:294-300 "Inference plane unavailable during index build — vector side skipped (BM25-only, L2)"）。这降低了 TS 最小移植的门槛（§4）。

### 1.6 SQL 生成 prompt——重、域接地、staged agent SOP

`resources/prompts/v2-baseline.md`（287 行，当前 baseline）：
- §3 按 stage 重组（A 准备 / B 生成 / C 校验 / D 执行）；§6 八条正面规则；MAX_SQL_PER_TURN=8 探索预算硬限（:5）。
- 工具目录：`search_data_sources`(检索+query_matches) / `load_event_definition`(:25, "SQL 中的 FROM、WHERE event 和可用字段全部来自此返回值，不得硬编码") / `load_table_definition` / `query_data`(:26, CostGuard+三态返回+result_id 句柄) / `check_query`(:27) / `critique_sql_tool`(:111)。
- few-shot 内嵌：`:255-264` 一个同日跨事件 JOIN 子查询示例（`game.battle.end` ∩ `game.item.change` 取 both_uv）。
- §5 诚实拒答（语义层无定义/params 无字段/自修 2 次仍失败→拒）。
- 这是**真正干活的"引擎"**——LLM 在此 prompt + 检索上下文驱动下直接生成 SQL。prompt 本身是文本，TS 移植成本低（§2）。

## 2. TS 移植成本（按组件）

| # | 组件 | RBI 出处 | 成熟度 | TS 移植成本 | 备注 |
|---|---|---|---|---|---|
| 1 | 语义层基底（YAML reader/writer/BasicIndex/ADR-0011） | `rbi-semantic`（仅依赖 sqlglot） | 高 | **低-中** | YAML+TS 类型+BasicIndex 直译；sqlglot 校验可薄化或 sidecar |
| 2 | schema-linking 检索（UnifiedSearchIndex: BM25+sqlite-vec+RRF+cross-encoder, bge-m3） | unified_search.py:217 | 中-高（带降级） | **中-高** | rank-bm25 算法可直译；sqlite-vec 无 JS 对等（better-sqlite3+native 或弃向量走 DashScope embedding+余弦）；bge-m3→DashScope text-embedding API；cross-encoder→弃或 API |
| 3 | answer RAG（UnifiedQueryIndex: verified/golden/template, Tier1/2） | query_index.py:1 | 中 | 高（且**新域空语料**） | 同 2 依赖；data-agent 起步无 verified_answers/golden → Tier1/2 空，初期无复用价值 |
| 4 | planner / Text2DSL（plan_query + 5 抽取器 + decompose + approach） | planner.py（88KB） | **低-潜伏** | **很高（且低价值）** | 88KB Python regex 域耦合 + 中文游戏词典 + per-scope terminology；**不在任何 allowlist，从不运行**；无 canonical IR |
| 5 | SQL 生成 prompt（v2-baseline.md staged SOP） | resources/prompts/v2-baseline.md | 中 | **低** | 纯文本；§3 staged 映射 harness phase；工具目录映射 harness tool |
| 6 | SQL critic（sqlglot AST clause 校验 + SimpleEvaluator） | sql_critic.py + sql_evaluator.py | 中 | **高** | **sqlglot 无 TS 等价**；node-sql-parser 无 MaxCompute 方言；选项：Python sidecar（违 TS-only）/ 薄 regex 守卫 / 弃静态靠执行反馈 |
| 7 | 执行 + CostGuard + result_id + 三态 + 近重复门 | v2-baseline.md:26 + rbi-query | 中-高 | 中 | ODPS TS SDK 待定（odps-js? HTTP API）；CostGuard/预算/近重复 = 纯逻辑可移植；harness 已有 R2 凭证缓存 |
| 8 | self-correction loop（prompt 驱动 LLM 读错重写） | v2-baseline.md:111,124-134 | 低-中 | **低** | prompt 逻辑 + 重试循环，harness agent loop 原生支持 |
| 9 | eval 套件（161 cases + run runner + coverage） | eval-cases/ | 中 | 低（cases YAML 可移植） | RBI 的 cases 是 RBI 游戏专用；data-agent 需自建 scope 的 cases |

**完整引擎 (C) = 1+2+3+4+5+6+7+8**。其中 4 潜伏、3 新域空、6 sqlglot-bound、2 重 inference plane。**非单期可达**。

## 3. 前沿 web（每条带 URL）

### 3.1 BIRD / Spider SOTA 与生产现实

- **BIRD 基线**：12,751 text-to-SQL pair / 95 DB / 33.4GB / 37 域；**人类 92.96% / GPT-4 落地 54.89%**。〔https://www.thepaper.cn/newsDetail_forward_23372105 ；https://zhuanlan.zhihu.com/p/27959221986 ——两处皆引 BIRD 原论文 arxiv 2305.03100 的摘要数据〕
- **BIRD SOTA**：OpenSearch-SQL（阿里，2024-08）测试集 EX **72.28%**、dev 69.3%、R-VES 69.36%，提交时三榜第一；架构 = 四模块（preprocessing/extraction/generation/refinement）+ 一致性对齐 + **SQL-Like 中间语言** + 结构化 CoT + 自教 few-shot；直接用基础 LLM 无预训练。〔https://blog.csdn.net/qq_35485206/article/details/149213071 （精读，引论文摘要原文）；https://baijiahao.baidu.com/s?id=1810055370922956259 —— 2024.8.29 BIRD 夺冠〕
- **"传统模型最高 ~75%"**：Agentar-Scale-SQL 博文称"人类 92.96%，传统模型最高只有 75% 左右"，自家三阶段算力协同声称 81%。〔https://blog.csdn.net/weixin_29103191/article/details/157837529 —— 2026-02，博客二手，权威性低，仅作上界参考〕
- **Spider SOTA**：DAIL-SQL 86.6% / DIN-SQL 85.3%（分解式 in-context + self-correction）。〔https://xie.infoq.cn/article/a2fcc275109ff4abae864adc3〕
- **生产真实**：Teradata 述"models peak around 59% exact-match accuracy and fall to roughly 40% when they add transformation/code"。〔https://www.facebook.com/Teradata/posts/...（搜索结果 snippet，二手，但量级与 BIRD gap 一致）〕
- **执行反馈微调**：BIRD-FIXER（NIPS 2025）基于 Qwen-2.5-Coder-14B 微调，在 BIRD-CRITIC 调试基准（1100 真实任务 / 4 方言）上超 Claude-3.7-Sonnet 与 GPT-4.1；f-Plan Boosting + SQL-ACT 直接执行任意 SQL。〔https://blog.csdn.net/c_cpp_csharp/article/details/156563734 —— 2026-01，引论文〕**RBI 未走此路线**（§1.3）。
- **schema-linking + 执行引导自纠正**为活跃方向（EACL 2026 findings："SQL Framework with Vector-based Schema Linking and Execution-Guided Self-Correction"）。〔https://aclanthology.org/volumes/2026.findings-eacl/〕
- **结论**：通用 NL2SQL SOTA ~72%，距人类 93% 仍有 ~20pp gap，且 SOTA 全靠多智能体+对齐+中间 IR+精炼，非单 prompt。**生产可靠（>90%）未达成**。

### 3.2 语义层增强 NL2SQL（可行性杠杆）

- **WrenAI**：开源 governed text-to-SQL，**MDL（Modeling Definition Language）语义层 + MCP server，跨 20+ warehouse**；"advanced semantic engine leverages MDL to deeply understand your data structure and business logic"。〔https://leaderboards.pro/leaderboards/...（snippet）；https://www.facebook.com/westat.hq/posts/...（snippet，二手）—— MDL 论点一致〕
- **Vanna**：RAG-for-SQL（train a RAG model on your data → ask），连 SQL DB+vector+LLM；**已于 2026-03 archived**。〔https://github.com/Zijian-Ni/awesome-ai-agents-2026 —— "Vanna - Archived (2026-03)"〕→ 纯 RAG 路线已被市场收缩。
- **DBSL / cube 式语义层**："Semantic layer for AI-powered data analytics...measures, dimensions..."〔https://github.com/alvinreal/awesome-opensource-ai —— 2026-08 snippet〕
- **语义层 >> prompt tuning**："Give an agent accurate business definitions instead of raw tables, and NL-to-SQL accuracy improves in a way no amount of prompt tuning will match."〔https://medium.com/oceanbase-database/ontology-vs-semantic-layer-why-your-ai-agent-needs-both-a2e24c8060a1 —— snippet，未能 fetch 全文（403），论点引自搜索结果摘要〕
- **Databricks Genie "Inspect"**（生产自纠正）：reviewing initially generated SQL, authoring smaller SQL statements to verify specific——验证式自纠正。〔https://docs.databricks.com/aws/en/ai-bi/release-notes/2026 —— 搜索结果 snippet〕
- **PIPE-Cypher**（约束域）：schema profiling + reverse-query grounding + constrained generation + deterministic governance + execution validation——约束域+确定性治理范式。〔HuggingFace Daily Papers snippet〕

### 3.3 sqlglot MaxCompute 方言

- **未能 fetch sqlglot 官方 dialects 页**（readthedocs / sqlglot.com 皆 403，企业策略拦截）。**RBI 源码自证**：`sql_critic.py:19` 注释 "MaxCompute closest dialect in sqlglot"，用 `_DIALECT="hive"` 代理。即 **sqlglot 无原生 MaxCompute/ODPS 方言**，hive 是最近代理（GET_JSON_OBJECT 等函数 hive 原生支持，见 sql_critic.py `_check_json_paths` 对 `exp.JSONExtractScalar` 的处理）。TS 侧 node-sql-parser 亦无 MaxCompute 方言。→ **MaxCompute AST 校验在 TS 生态无对等**（§2 组件 6 成本依据）。

## 4. 对本 data-agent 的可行性判定 + 推荐 scope

### 4.1 前提约束（来自主 agent 已决项）

- 内网，但 DashScope(qwen) + Qoder subagent LLM 可用（P0/P2 已决，见 `research/p2-dashscope-wire.md`）。
- MaxCompute/ODPS 引擎（R2 凭证缓存已决）。
- per-game 语义层 = **约束域**（窄 schema + curated terminology + per-scope domains.yaml）——**理论上准确率应高于通用 BIRD**（§3.2 语义层杠杆 + §3.3 约束域范式）。
- additive-only / re-implement in TS（RBI 是 Python 只读源，非依赖）。

### 4.2 三选项判定

** (A) 仅语义层基底**：
- ship：组件 1（YAML reader/writer/BasicIndex/ADR-0011 atomic）。
- 放弃：NL→SQL 全链。data-agent 无"问句→数据"能力，仅提供语义层 API 给上层。
- 风险：放弃 data-agent 核心价值。用户要 per-game NL 数据分析。
- 工作量：低。安全但价值薄。

**(B) 基底 + 极简 NL→SQL（推荐）**：
- ship：组件 1（语义层）+ 5（SQL 生成 prompt，适配 harness）+ 7（执行+CostGuard，ODPS TS SDK）+ 8（执行反馈重试 loop）+ 2 的**薄版**（BM25 schema-linking，**drop** sqlite-vec+cross-encoder+bge-m3，或用 DashScope text-embedding API 走余弦）+ 6 的**薄版**（regex 守卫：ds 分区必带 / SELECT \* 告警 / 表名∈候选源 / 基本语法，**drop** sqlglot AST）。
- **主动 drop**：4（planner，潜伏低价值）/ 3（answer RAG，新域空语料）/ 6 全量 AST（sqlglot-bound）/ 2 的 cross-encoder reranker。
- 约束：限定 per-game 单 scope（约束域→更高准确率，§3.2）。
- self-correction 走**执行反馈**（query_data 错误→LLM 读错重写→近重复门防重发），不依赖静态 AST critic——这恰是 §3.1 BIRD-FIXER / §3.2 Databricks Inspect 的路线，比 RBI 的静态 critique 更可靠。
- 工作量：中。单期可达。

**(C) 完整 NL→SQL 引擎**：
- ship：组件 1+2+3+4+5+6+7+8+9 全量。
- 阻塞：(i) sqlglot 无 TS 等价（需 Python sidecar 违 TS-only，或 node-sql-parser 无 MaxCompute 方言）；(ii) 双检索索引需 sqlite-vec+bge-m3+cross-encoder inference plane；(iii) 88KB planner 域耦合 + 潜伏（移植=浪费）；(iv) **RBI 自身 L1 通过率 9%——移植 = 继承一个已知未完工的引擎**。
- 工作量：很高。**非单期可达**。

### 4.3 推荐：**(B)**

理由：
1. **(C) 不成立**：RBI 自测 9% L1 通过率（§1.4）证明该链未完工——完整移植 = 继承坏引擎 + 扛 sqlglot/planner/双检索全量移植成本。即便最好的单 run 73.8% 也只在通用 BIRD SOTA 附近，未达生产可靠（>90%）。
2. **(A) 价值不足**：data-agent 存在意义是 per-game NL→SQL；仅基底等于不做 data-agent。
3. **(B) 命中杠杆**：语义层是公认可行性杠杆（§3.2：WrenAI MDL / DBSL / oceanbase medium 一致论点"业务定义 >> prompt tuning"）；per-game 约束域抬升准确率；执行反馈 self-correction（§3.1 BIRD-FIXER / §3.2 Genie Inspect）比 RBI 静态 critique 更可靠且 TS 可行（无需 sqlglot）。
4. **降级路径清晰**：RBI 的 UnifiedSearchIndex 本就设计 BM25-only 降级（§1.5 unified_search.py:294-300），TS 极简版走 BM25+DashScope embedding 余弦，drop sqlite-vec/cross-encoder 不失核心能力。
5. **演进余地**：(B) 落地后，若准确率不足，可增量加：DashScope embedding 向量检索（替 sqlite-vec）、Python sidecar sqlglot critic（若 harness 放宽）、verified-answer RAG 语料（用户反馈沉淀后填充 Tier1/2）。不阻塞 P6。

### 4.4 (B) 的最小组件清单（P6 deliverable）

1. 语义层基底（TS）：EventDefinition/TableDefinition YAML reader + BasicIndex + atomic write (ADR-0011) + per-scope config/domains/terminology。
2. BM25 schema-linking 检索（TS）：rank-bm25 算法直译 + jieba CJK 分词（nodejieba）+ per-field 权重；**向量侧用 DashScope text-embedding API + 内存余弦**（或首期纯 BM25）。
3. SQL 生成 prompt（适配 harness）：移植 v2-baseline.md 的 §3 staged SOP + §6 八规则 + §5 诚实拒答 + 工具目录映射；MAX_SQL_PER_TURN 预算。
4. 执行层（TS）：ODPS query（HTTP API 或 odps-js）+ CostGuard + result_id 句柄 + 三态返回 + 近重复 SQL 门。
5. 执行反馈 self-correction：parse_failed/TABLE_NOT_FOUND/SEMANTIC_MISMATCH → LLM 读错重写 → 近重复门防重发；最多 N 次。
6. 薄 regex 守卫（替 sql_critic AST）：ds 分区必带、SELECT \* 告警、表名∈检索候选、GET_JSON_OBJECT 字段∈event params（字符串匹配）。
7. **drop**：plan_query / UnifiedQueryIndex(answer RAG) / sqlglot AST critic / cross-encoder reranker。

### 4.5 风险与诚实声明

- (B) 的准确率未实测；RBI 约束域最好 73.8% 是上界参考（且 RBI 用了 sqlglot critic + bge-m3 + cross-encoder，(B) 全 drop 了）。**P6 须配自建 eval cases（per scope）+ L1 通过率门**，否则等于 (C) 的 9% 重演而不知。
- DashScope text-embedding 是否经内网 AGA 网关可用（qwen 的 text-embedding 模型）——P6 须探针确认（仿 P2 的探针法）；不可用则首期纯 BM25。
- sqlglot 静态 critic 的 drop 意味着 GET_JSON_OBJECT 字段名校验从 AST 降为字符串匹配——漏判风险（嵌套/动态路径）；执行反馈兜底。

## 来源（Sources）

**RBI 一手（file:line）**：
- `libs/rbi-retrieval/src/rbi_retrieval/planner.py`（:3-13 docstring "deterministic, rule-based, no LLM"；:200 parse_intent；:1048/1124/1174/1186/1275/1433 五抽取器；:1503 decompose_question；:1584 plan_query；:1617 `ambiguities: list[dict] = []`；:1729 _find_relevant_sources；:1754-1759 LATENT 注释；:1881 latent docstring；:1929 _determine_approach）
- `libs/rbi-retrieval/src/rbi_retrieval/intent_types.py`（:46-87 IntentSignature；TimeType；"dependency-free, trivially unit-testable offline"）
- `libs/rbi-mcp/src/rbi_mcp/sql_critic.py`（:19 `_DIALECT="hive"` "MaxCompute closest"；:73-96 critique_sql；:311/_check_select_metrics；_check_join P9-4）
- `libs/rbi-semantic/src/rbi_semantic/sql_evaluator.py`（SimpleEvaluator 规则 + ast_has_select_star/ast_has_partition_filter 共享谓词）
- `libs/rbi-retrieval/src/rbi_retrieval/semantic/unified_search.py`（:217 UnifiedSearchIndex；:289 build() BM25+sqlite-vec+RRF；:294-300 降级；_FIELD_WEIGHTS）
- `libs/rbi-retrieval/src/rbi_retrieval/semantic/query_index.py`（:1-14 UnifiedQueryIndex = verified_answers+query_skills+golden rag_corpus；QueryMatch Tier）
- `libs/rbi-retrieval/src/rbi_retrieval/semantic/embedder.py`（:318 BAAI/bge-m3；:316 RealSemanticEmbedder；:384 远程 HTTP embedder；:346-349 降级）
- `libs/rbi-mcp/src/rbi_mcp/servers/semantic.py`（:297 plan_query_tool；:349-372 critique_sql_tool + dsl_json 自报；:406 _critique）
- `libs/rbi-agent/src/rbi_agent/data_agent/phases.py`（:183-228 UNDERSTANDING/GENERATION/EXECUTION allowlist；plan_query 缺席）
- `libs/rbi-agent/src/rbi_agent/data_agent/forced_load.py`（:69,77 load_table/load_event 强制补调）
- `resources/prompts/v2-baseline.md`（287 行 staged SOP；:25-27 工具；:66-67 Tier1/2；:111 pre-exec critic；:124-134 自纠正；:255-264 few-shot）
- `eval-cases/_coverage/latest.json`（161 cases/5 scope/tier verified/矩阵稀疏）
- `eval-cases/_runs/run_*.json`（L1 通过率表，§1.4）
- `eval-cases/10000251/eval_10000251_037.yaml`（case 结构）
- `libs/rbi-mcp/pyproject.toml:20-27` / `libs/rbi-retrieval/pyproject.toml:12-14` / `libs/rbi-semantic/pyproject.toml:9`（依赖）

**Web（URL）**：
- BIRD 基线（人类 92.96% / GPT-4 54.89%）：https://www.thepaper.cn/newsDetail_forward_23372105 ；https://zhuanlan.zhihu.com/p/27959221986 （引 arxiv 2305.03100）
- OpenSearch-SQL BIRD SOTA 72.28%：https://blog.csdn.net/qq_35485206/article/details/149213071 ；https://baijiahao.baidu.com/s?id=1810055370922956259
- Agentar-Scale-SQL 81% 声称 / 传统模型 75%：https://blog.csdn.net/weixin_29103191/article/details/157837529 （二手博客，上界参考）
- Spider SOTA DAIL-SQL 86.6% / DIN-SQL 85.3%：https://xie.infoq.cn/article/a2fcc275109ff4abae864adc3
- 生产真实 ~59% exact / 40% 带变换：https://www.facebook.com/Teradata/posts/（搜索 snippet，二手）
- BIRD-FIXER / BIRD-CRITIC 执行反馈微调（NIPS 2025）：https://blog.csdn.net/c_cpp_csharp/article/details/156563734
- EACL 2026 schema-linking + execution-guided self-correction：https://aclanthology.org/volumes/2026.findings-eacl/
- WrenAI MDL 语义层 + MCP + 20+ warehouse：https://leaderboards.pro/leaderboards/top-resources-on-harness-engineering-in-analytics-bi-and-sem-msjr452i ；https://www.facebook.com/westat.hq/posts/（snippet）
- Vanna archived 2026-03（RAG-for-SQL）：https://github.com/Zijian-Ni/awesome-ai-agents-2026
- DBSL/cube 语义层：https://github.com/alvinreal/awesome-opensource-ai
- 语义层 >> prompt tuning：https://medium.com/oceanbase-database/ontology-vs-semantic-layer-why-your-ai-agent-needs-both-a2e24c8060a1 （snippet，全文 403 未 fetch）
- Databricks Genie Inspect 自纠正：https://docs.databricks.com/aws/en/ai-bi/release-notes/2026
- 2025 NL2SQL 综述（四阶段+三大挑战）：https://blog.csdn.net/weixin_37763484/article/details/150611566
- JOLT-SQL（EMNLP 2025，联合 schema-linking+生成 SFT）：https://zhuanlan.zhihu.com/p/1942896328611958935

**fetch 限制声明**：bird-bench.github.io / arxiv / readthedocs / sqlglot.com / docs.getwren.ai / github.com 经企业策略或站点 403 拦截，未能 fetch 全文；BIRD/OpenSearch-SQL/Spider 数据引自搜索结果 snippet 中所含论文摘要原文，sqlglot MaxCompute 缺席引自 RBI 源码 `sql_critic.py:19` 注释自证。
