# P13b — NL→SQL 引擎生产硬化

**Type**: prototype
**Phase**: 3
**Assignee**: —（unclaimed）
**Status**: Unblocked（P13 resolved 2026-08-20）
**Graduated from**: P13 surfaced F1-F6（生产化 findings）
**Blocked by**: P13（resolved）

**Question**: P13 prototype（`prototypes/p13-nl2sql-engine/` .mjs harness-stub）→ 生产 `packages/nl2sql-engine/`（TS、Schemastery、真实 Cordis ctx seam：`ctx.on`/`ctx.tools.guard`/`ctx.systemPrompt`/`ctx.agents`/`ctx.query`/`ctx.retrieval`/`ctx.schema`）+ bundle 接线（解注释 `packages/bundle/data-agent/` 的 nl2sql-engine 行）+ conventions 提到 `packages/query/query-maxcompute/conventions.yaml`（P4 seam）+ critic 生产接线 fold P7b。解 P13 surfaced F1-F6。

**Design (per P13 Finding/Design + surfaced findings)**:
- **F1 conventions 生产化**：.mjs export → `packages/query/query-maxcompute/conventions.yaml` + `load_conventions` loader（复刻 RBI `conventions.py:32`，归 query 包 P4 seam，多消费者：nl2sql-engine prompt 方言 grounding + query guard/cost/方言）。
- **F2 critic 生产接线**：真 hook P7 `agent/turn-stopping` 生产 phase-gate 插件（fold **P7b**）；critic 逻辑同 P13（方案 1 薄 regex + 方案 4 轻量 JSON path 解析），替换 P7 sqlglot stub；返 `GateResult` 对齐 `phases.py:33`。
- **F3 向量侧 swap**：T2/用户自部署就绪后换 P5 `ctx.retrieval` 真 embedder（`InfinityEmbedder` 外置 OpenAI 兼容 / in-proc bge-m3），seam 契约不变，不改 P13 引擎逻辑。
- **F4 tool-query near-dup gate**：会话级跨 turn（Not-yet-specified query-trio 剩余生产：tool-query Consumer model-facing + 会话门 G1/G5 + 3-execute，镜像 rbi `execution.py`；P13 引擎内薄版 near-dup 升级为 tool-query 会话级）。
- **F5 残余风险（执行反馈兜底）**：动态拼接 GET_JSON_OBJECT 路径漏判（静态不可解，吃首次 ODPS 配额）/ 静默 NULL SQL（params 集合内错字段，ODPS 不报错→self-correction 不触发，留 Tier1/2 answer RAG 演进余地，P13 scope 外）/ regex 子句边界弱（CTE/子查询 SELECT \* 误命中→fail-open）/ self-correction 上限耗尽→honest_decline。
- **F6 eval 生产化**：P11 就绪后消费 P13 da-fresh EvalCase cases + runner 升级到真 `MultiTurnSession`（经真 harness session，G2 设计指针）。

**Blocked by**: P13（resolved）、P7b（critic 生产接线 fold，互依赖）、P11（eval runner 升级，可选）、T2（向量侧 swap，可选）。

**Research**: → `../../research/p13-sql-critic-alternatives.md`（critic 六方案+推荐架构）+ `../../research/p6-nl2sql-feasibility.md`（(A)/(B)/(C)+§4.4 最小组件）+ P13 ticket Finding/Design（grilling 6 决策 + surfaced F1-F6）+ `../prototypes/p13-nl2sql-engine/`（throwaway primary-source）。
