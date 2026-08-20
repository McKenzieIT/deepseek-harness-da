# P13 — NL→SQL 引擎（极简 (B) 路径）

**Type**: prototype
**Phase**: 3
**Assignee**: wayfinder-session 2026-08-20
**Status**: Resolved (2026-08-20) — prototype validated（9 scenarios 全绿）
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

**Blocked by**: P4（`ctx.query.execute` 执行 + CostGuard）、P5（`ctx.retrieval` seam + embedder）、P6（substrate：types/reader/writer/BasicIndex/terminology/accumulated）。均 resolved。

**Research**: → `../../research/p6-nl2sql-feasibility.md`（RBI NL→SQL 一手源 file:line + 前沿 BIRD/Spider SOTA + 语义层杠杆 + sqlglot MaxCompute 缺席 + (A)/(B)/(C) 三选项判定）+ `../../research/p13-sql-critic-alternatives.md`（sqlglot critic 六替代方案+对比表+推荐架构，RBI file:line + web cite）。

## Finding / Design (resolved 2026-08-20)

grilling 6 决策全采纳推荐（三前置项解完）+ prototype `../prototypes/p13-nl2sql-engine/` 9 scenarios 全绿 validated。

**决策（grilling，6 项）**：
- **Q1 eval gate**：自带最小版+对齐 P11/G2（G2 resolved 2026-08-20：eval=TS+da-fresh EvalCase+EXECUTION 判分+dsh-llm-replay）。da-fresh EvalCase schema（仅借 result_value+match_mode+turns，rbi BI 专属不复用）+ EXECUTION 5 match_mode 判分跑 `ctx.query.execute` 比 stand-in ODPS 结果集（不用 sqlglot）+ dsh-llm-replay 确定性 + 轻量 runner 直接调引擎 generate 不经真 harness session。诚实门值 < RBI 73.8% 上界（(B) drop 了 sqlglot+bge-m3+cross-encoder）。不阻塞 P11；cases 将来被 P11 无缝消费。
- **Q2 embeddings**：首期纯 BM25-only·不阻塞 T2（**AGA 不提供向量模型，已确认**）；向量侧升级=用户自部署向量模型经 P5 外置 OpenAI 兼容 embedder 插件（`InfinityEmbedder`），P13 引擎逻辑不变（seam swap）。T2 预期 NO 佐证走向、不阻塞 P13；T2 结果回填 map Not-yet-specified「intranet 重 embedder 部署形态」= 用户自部署（非 AGA relay）。
- **Q3 sqlglot critic**：方案 1（薄 regex 守卫：ds 分区必带/SELECT \* 告警/表名∈候选）+ 方案 4（轻量 JSON path 解析：GET_JSON_OBJECT $.a.b.c 取叶子段∈event_params，~30 行纯 TS，对齐 `sql_critic.py:481` last-key）合体 + 执行反馈兜底（`QueryOutcome.failed`→LLM 读 error 重写→近重复门防重发）；node-sql-parser 不引（留 P14+ 接口）。挂 `agent/turn-stopping` 填 P7 `sql_syntax_gate` 槽，返 `GateResult(passed,reason)` 对齐 `phases.py:33`，判罚 error/warning/fail-open，F2 同源（critic 检查的 SQL = exec `ctx.query.execute` 收到的 SQL，`extract_sql_candidate` 单源，无 tools/post-execute 改写）。critic 守卫数据从 P6 substrate（`params_fields`/`partitions`）+ 检索结果拿，不从 conventions。sqlglot_dialect drop。
- **Q3 conventions**：薄 conventions（key_differences/functions/cast_map/sql_templates）归 **query 包**（P4/Q5 既定 per-engine conventions.yaml，忠实 RBI rbi-query 包内多消费者）；nl2sql-engine 从 query conventions seam 拿 prompt 方言 grounding；query 自己消费 guard/cost/方言部分（limits/guards.yaml）留 P4b 生产。
- **Q4 fidelity**：LLM=dsh-llm-replay（确定性、无 key 可复现）+ ODPS=stand-in（模拟 3-state+错误形态 parse_failed/TABLE_NOT_FOUND/SEMANTIC_MISMATCH，仿 P4b stand-in sidecar，真 pyodps 延后→真 ODPS 不可得）；引擎逻辑全真；scenarios 确定性全绿、无外部依赖。
- **Q5 near-dup gate**：P13 自带薄版（同 SQL 哈希拒重试，引擎内 self-correction loop）；真 tool-query consumer near-dup gate（会话级跨 turn）留 Not-yet-specified 生产项（P4 决策会话门留 tool-query）。
- **Q6 生产毕业**：prototype（`prototypes/p13-nl2sql-engine/` .mjs harness-stub，镜像 p4/p6/p7/p8）+ 生产 P13b（`packages/nl2sql-engine/` TS + bundle 接线 + conventions 提到 `packages/query/query-maxcompute/` + critic 生产接线 fold P7b）。

**drop**：plan_query（LATENT）/ sqlglot AST critic（无 TS 等价）/ UnifiedQueryIndex answer-RAG（新域空语料）/ cross-encoder reranker / sqlglot_dialect。

**Validated（prototype 9 scenarios 全绿，`node run.mjs --demo` exit 0）**：
- S1 BM25 召回 dws_pay_order_di top-1（score 3.203，per-field 权重 name×3 + CJK bigram + 单字）。
- S2 prompt 组装（§3 staged SOP+§6 八规则+§5 诚实拒答+工具目录+MAX_SQL_PER_TURN+方言 grounding 从 conventions+P7 四阶段适配 phase=generation）。
- S3 critic gate 拦截（ds 缺/SELECT \*→warning pass；表名∉候选/GET_JSON_OBJECT 字段∉params→error fail；无 SQL→fail-open；字段∈params→pass；判罚与 RBI sql_critic/sql_evaluator 同向）。
- S4 critic JSON path 解析（$.user.profile.level 取叶子段 'level' 校验∈event_params，嵌套路径覆盖）。
- S5 feedback self-correction（parse_failed→LLM 读 error 重写→done，对齐 BIRD-FIXER/Genie Inspect；TABLE_NOT_FOUND→不可修复→honest decline，不消耗重试）。
- S6 近重复门（相同失败 SQL 第二次同哈希拒重试×2→自修耗尽→honest decline）。
- S7 eval gate L1 pass-rate=1.000（da-fresh 9 cases+EXECUTION 5 match_mode 判分+dsh-llm-replay+轻量 runner 不经真 harness session；诚实门值<RBI 73.8%）。
- S8 honest decline（BM25 召回空候选=语义层无定义→LLM 编造表名∉候选→critic error fail→自修耗尽→honest decline，§5）。
- S9 sql_syntax_gate 槽（critic 返 GateResult 对齐 phases.py:33 挂 agent/turn-stopping）+ F2 同源（critic 检查的 SQL=exec ctx.query.execute 收到的 SQL，extractSqlCandidate 单源）。

**Surfaced findings（P13b/P7b 生产硬化须解）**：
- F1 conventions 生产化（.mjs export→`.yaml`+`load_conventions` loader 归 `packages/query/query-maxcompute/`，P4 seam）。
- F2 critic 生产接线（真 hook P7 `agent/turn-stopping` 生产 phase-gate 插件，fold P7b）。
- F3 向量侧 swap（T2/用户自部署就绪后换 P5 `ctx.retrieval` 真 embedder，seam 契约不变，不改 P13 引擎逻辑）。
- F4 tool-query near-dup gate（会话级跨 turn，Not-yet-specified query-trio 剩余生产：tool-query Consumer + engine-wrapper guard chain）。
- F5 残余风险（执行反馈兜底）：动态拼接 GET_JSON_OBJECT 路径漏判（静态不可解，吃首次 ODPS 配额 max_executions_per_turn=8）/ 静默 NULL SQL（params 集合内错字段，ODPS 不报错→self-correction 不触发，留 Tier1/2 answer RAG 演进余地，P13 scope 外）/ regex 子句边界弱（CTE/子查询 SELECT \* 误命中→fail-open）/ self-correction 上限耗尽→honest_decline（max_executions_per_turn=8 + max_llm_calls_per_turn=60，phases.py:124,131）。
- F6 eval 生产化（P11 就绪后消费这批 cases + runner 升级到真 MultiTurnSession 经真 harness session）。

## Assets
- `../prototypes/p13-nl2sql-engine/`（types/conventions/bm25-linking/prompt/critic/stand-in-odps/replay-llm/engine + eval/{cases,scorer,runner} + run.mjs 9 scenarios + README）— primary-source artifact，throwaway。
- `../../research/p13-sql-critic-alternatives.md`（六方案+对比表+推荐架构，RBI file:line + web cite）。
- `../../research/p6-nl2sql-feasibility.md`（(A)/(B)/(C) 判定+§4.4 最小组件+RBI 一手源 cite）。

## Unblocks
- **P7b**（P7 surfaced「GENERATION critic 生产 preset 接线」blocked by P13；现 unblocked——P13 critic 形态已定，P7b 可真 hook 生产 phase-gate + 真 sqlglot→regex critic 替换 stub；ticket `P7b-phase-gate-prod-hardening.md`）。
- **P13b**（本 ticket surfaced——NL→SQL 引擎生产硬化 `packages/nl2sql-engine/` TS + bundle 接线 + conventions 提到 query 包 + critic 生产接线；ticket `P13b-nl2sql-engine-prod-hardening.md`）。
