# P6 — 语义层插件

**Type**: prototype
**Phase**: 2
**Assignee**: claude
**Status**: Resolved（2026-08-19, claude / wayfinder 会话）— was unblocked

**Question**: 埋点 + 表 两类定义的进程内核心能力；ODPS schema 读取解耦到 query-engine（P4）。

**Design（grilling + cited research + prototype 验证锁定的 6 决策）**:

- **D6 范围**：P6 = **语义层 substrate + ODPS schema 解耦 seam**（ticket 文本即此）；NL→SQL (B) 引擎毕业成新 ticket（见 Assets `P13-nl2sql-engine`）。研究（`research/p6-nl2sql-feasibility.md`）证完整引擎 (C) 单期不可行（RBI 自身 L1 pass-rate ~9%、prototype-grade；`plan_query` LATENT 不在任何 phase allowlist；无 canonical Text2DSL IR——rule-based IntentSignature + LLM-inline-SQL + 自报 dsl_json；sqlglot 无 MaxCompute 方言，RBI 用 hive 代理；双检索 BM25+sqlite-vec+bge-m3+cross-encoder + 88KB 潜伏 planner = 移植成本高且继承已知坏引擎）。但 (B) substrate+极简 NL→SQL 可行——毕业成 ticket，Text2DSL 雾清（无 IR 可选，本质 prompt+feedback+guards）。P4 C1「NL→SQL 归语义层 P6」= ownership domain（seam 是 P6 的），非本 ticket 造整个引擎。
- **D3 核心边界**：P6 core = types(EventDefinition/TableDefinition) + reader + writer(atomic/validate/cache-invalidate ADR-0011) + sync-write + **BasicIndex**(dep-free 查找) + terminology + accumulated_definitions + substrate 工具(read/suggest→pending→approve/update_meta/coverage/load_accumulated/save_accumulated/lookup_terminology)；**deferred → P5(⑤b)**: HybridRetriever/UnifiedSearchIndex(BM25+sqlite-vec+cross-encoder bge-m3) 升级 BasicIndex；**deferred → P13 引擎 ticket**: sql_evaluator/sql_critic/SQL-gen prompt/execution-feedback 自纠错/regex guards/eval gate/**`search_data_sources`**（UNDERSTANDING 引擎工具，用 BasicIndex，P5 后续提供 hybrid seam）；**dropped**: plan_query/planner（LATENT，研究证）。
- **D4 schema seam**：sibling **`ctx.schema` seam**（`discover(scope_id, kind)`→TableMeta[]、`describe(table)`→TableMeta、`sample(table, n)`→str）；只读元数据，由 MaxCompute provider sidecar 实现（与 `ctx.query.execute` 同一个 sidecar、同套 ODPS 连接+per-scope 凭证缓存+`credentials/updated→invalidate`，⑤a）。`probe_pk_uniqueness` 走 `ctx.query.execute`（它是 SQL 查询、是执行非元数据）。P4 的 `ctx.query` 保窄（execute/attach/cancel/get_progress）——镜像 RBI 独立 `DataSourceConnector` 抽象、对齐 harness `ctx.<cap>` seam 约定、保 A1-split 窄 seam 纪律（不让元数据发现被执行 cost/timeout/retry 门裹挟）。semantic 层 sync-write 消费 `ctx.schema.discover/describe`→生成/合并 YAML。
- **D5 write-tiers**：P6 实现 Tier-1 suggest→pending→approve（守事件/表 YAML 事实来源——agent 自修改回路：写 agent 下轮要读的东西；agent 只能 suggest 不能直写；approve 侧注册受 P9 admin 门控、`disable_admin` 可整层关）+ Tier-2 per-scope 持久写留痕（sha256 摘要、不可关）。sync-write（ODPS schema→YAML）= ops/admin Tier-2（非 agent 自生）。HARDENING §1：污染事实来源 >> 污染指令 → 连 intranet-security-first（业务用户不得污染事实来源）。pending 队列落 `var/`（gitignored runtime）一提议一 JSON，`suggestion_id`=时间戳+正文短哈希。
- **D2 数据模型**：**zod schema 镜像 RBI pydantic**（`extra=allow`→`.passthrough`、`model_validator`→`.refine`/`.superRefine`、`canonicalize_type`→`.transform`、`Literal`→enum）+ 逐字镜像 RBI YAML 格式（js-yaml literal-block `|` 风格、`sort_keys=False`、`allow_unicode`、atomic write+fsync+rename）→ 与 RBI 531 表/事件/terminology 现存 curated 目录**交叉兼容**（语义层一等公民的兑现）。substrate deps = zod + yaml only（sqlglot 归引擎 ticket，不进 substrate）。
- **D1 包**：`packages/semantic/{semantic, semantic-tool}` 镜像 P4 `packages/query/{query,query-tool}` 切分（**无 maxcompute pkg**——schema 读取经 `ctx.schema` 在 P4 sidecar）。

**Resolution（2026-08-19）**：建 throwaway prototype `prototypes/p6-semantic-layer/`（`node run.mjs --demo`，4 scenario 全绿），验证 6 决策。未建 production `packages/semantic/`（=生产步骤，同 P4；additive-only，待后续）。prototype 4 scenario 实测：
- **D2**：真实 RBI YAML fixture 全 parse（event `role.online` 29 params_fields、DWS `pay_order_di` 11 列+5 metrics、DIM `charm_info` kind=dim/pk=[charm_id]/label=[charm_name]）；`canonicalize_type` 物理→逻辑（bigint→int、double→decimal）；round-trip parse→dump→reparse **deep-equal**（zod 镜像 pydantic `model_validate`）；malformed DIM（空 pk+label）被 `.superRefine` 拒（镜像 `_kind_constraints`）。
- **D4**：sync 流**不触 pyodps**——经 `ctx.schema` 收 `TableMeta[]`→`_infer_role`→`generate_table/dim_yaml`→write；`merge_changed_yaml` 保 analyst role 修正（pay_amt 'attribute' 经类型 double→decimal 变更存活、新列 coupon_amt 得推断 role）。
- **D5**：Tier-1 `suggest_event_yaml`→pending 队列**不触事实来源**（lookup 返 null）；`approve`→write+discard（消费队列）；Tier-2 `update_table_meta` 直写+留痕（sha256）。
- **ADR-0011**：write 触 invalidate hook→`BasicIndex` `_dirty`→下次 lookup 重建（2→3 表）。
prototype 假设见 `prototypes/p6-semantic-layer/README.md`（.mjs 非 TS、ctx.schema 是 stand-in、atomic 无 flock、YAML 风格 js-yaml 非 pyyaml 但 DATA round-trip、audit 是 flat JSON stub、真实 RBI fixture 直读、无 search_data_sources 工具）。

**Finding**：
- 语义层 substrate 在 TS 可干净镜像 RBI（zod 复刻 pydantic 的 extra=allow/model_validator/canonicalize/round-trip 全通；与 RBI 现存 curated YAML 交叉兼容）——"语义层一等公民"在 substrate 层兑现。
- ODPS schema 解耦天然：RBI 已把 `odps_metadata_service` 抽成 source-agnostic（只剩 `diff_tables` 转换/比较 + re-export `generate_*` from `rbi_semantic.sync`），ODPS 实现在 `connectors/`——data-agent 把 schema 读取移到 query-engine MaxCompute sidecar、经 `ctx.schema` seam，semantic 层只收 schema dict（如 `rbi_semantic.sync.sync_write_definitions` 已是 YAML-write-only）。`probe_pk_uniqueness` 是执行（SQL），归 `ctx.query.execute` 非 schema 元数据。
- write-tiers 是 intranet-security-first 的承重设计：suggest→pending→approve 防止 agent 自污染事实来源（HARDENING §1）；approve 侧归 P9 admin。
- **NL→SQL 引擎可行性（research 主结论）**：完整引擎 (C) 单期不可行（9% pass-rate + sqlglot/planner/双检索移植成本）；(B) substrate+极简 NL→SQL 可行（BM25 schema-linking + 改编 v2-baseline prompt + ODPS 执行 + execution-feedback 自纠错 + regex guards + eval gate；drop plan_query/sqlglot-AST/answer-RAG/cross-encoder）。**P6 须配自建 per-scope eval cases + L1 pass-rate 门**，否则等于 9% 重演不知。DashScope text-embedding 是否经内网 AGA 可用须探针确认（仿 P2）；不可用首期纯 BM25。

**Assets**：
- `prototypes/p6-semantic-layer/`（throwaway，`node run.mjs --demo`；types/io/index/pending/schema-stub/run.mjs + README）。
- cited research 笔记 `research/p6-nl2sql-feasibility.md`（RBI 一手 file:line + 前沿 web URL；31KB）。
- 毕业的 NL→SQL 引擎 ticket `tickets/phase-3/P13-nl2sql-engine.md`（Text2DSL 雾清后的独立 ticket，(B) 路径；含 eval gate + DashScope-embedding 探针前置项）。
