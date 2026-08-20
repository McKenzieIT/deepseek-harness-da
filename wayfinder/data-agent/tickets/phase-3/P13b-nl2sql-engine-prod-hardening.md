# P13b — NL→SQL 引擎生产硬化

**Type**: prototype
**Phase**: 3
**Assignee**: wayfinder-session 2026-08-20
**Status**: Resolved (2026-08-20) — 生产 `packages/data/nl2sql-engine/` + 9/9 spec 绿 + tsc clean + cordis-config 124 pass
**Graduated from**: P13 surfaced F1-F6（生产化 findings）
**Blocked by**: P13（resolved）、P7b（critic 生产接线 fold，互依赖——P13b ship critic API 供 P7b 接）、P11（eval runner 升级，可选→F6 deferred）、T2（向量侧 swap，可选→F3 deferred）。

**Question**: P13 prototype（`prototypes/p13-nl2sql-engine/` .mjs harness-stub）→ 生产 `packages/data/nl2sql-engine/`（TS、Cordis Service、真实 ctx.query seam）+ bundle 接线 + conventions 提到 `packages/query/query-maxcompute/conventions.yaml`（P4 seam）+ critic 生产接线 fold P7b。解 P13 surfaced F1-F6 + code review low。

**Design (per P13 Finding/Design + surfaced findings)**:
- **F1 conventions 生产化**：.mjs export → `packages/query/query-maxcompute/conventions.yaml` + `load_conventions` loader（`src/conventions.ts`，js-yaml 读 .yaml，复刻 RBI conventions.py:32，归 query-maxcompute 包 P4 seam）。
- **F2 critic 生产接线**：critic 逻辑 + `critiqueSql`/`sqlSyntaxGate` + `GateResult` 全在 nl2sql-engine（Q2）；P7b phase-gate `sql_syntax_gate` slot delegate（单向无环）。critic 逻辑同 P13（薄 regex 方案 1 + 轻量 JSON path 方案 4），返 `GateResult` 对齐 `phases.py:33`。
- **F3 向量侧 swap**：T2/用户自部署就绪后换 P5 `ctx.retrieval` 真 embedder，seam 契约不变，不改 P13 引擎逻辑（deferred——P13 BM25-only，P5b swap）。
- **F4 tool-query near-dup gate**：会话级跨 turn 留 Not-yet-specified query-trio（engine 内薄 NearDupGate 留）。
- **F5 残余风险（执行反馈兜底）**：保留 regex+JSON-path+exec-feedback（不换 sqlglot）；fail-open + 文档残余风险。
- **F6 eval 生产化**：P11 就绪后消费 da-fresh EvalCase + runner 升级真 MultiTurnSession（P13b ship eval-gate-minimal now；F6 真 runner→P11）。

**Research**: → `../../research/p13-sql-critic-alternatives.md`（critic 六方案+推荐架构）+ `../../research/p6-nl2sql-feasibility.md`（(A)/(B)/(C)+§4.4 最小组件）+ P13 ticket Finding/Design（grilling 6 决策 + surfaced F1-F6）+ `../prototypes/p13-nl2sql-engine/`（throwaway primary-source）。

## Finding / Design (resolved 2026-08-20)

P13b 生产毕业 P13 throwaway prototype → 生产 `packages/data/nl2sql-engine/`（TS、Cordis Service、真实 ctx.query seam）。grilling 5 决策全采纳推荐 + 9 scenario spec 全绿 + tsc typecheck-clean + verify-cordis-config 124 pass。

**grilling 5 决策**：
- **Q1 P5/P6 生产 gap**（inspection surfaced：P5/P6 仅 prototype resolved，生产包未 ship，无 P5b/P6b 票——P13 prototype 假设了 `packages/semantic-layer/` + P5 provider 存在）：本地 `RetrievalLinker`/`CriticGuardData` 接口 + 薄 in-process 默认（`Bm25Linker` BM25 from P13 proto + YAML substrate reader），不声明 `ctx.retrieval`/`ctx.schema` seam（归 P5/P6）。毕业 P5b/P6b 生产票（真 seam + full provider）；P13b 后续 additive swap。

〔2026-08-20 update：P6b ship `packages/data/semantic-layer/`（commit 88524504f8）→ CriticGuardData→`ctx.schema.load_*` substrate additive swap 可达（P6b S5 makeCriticCtx 从 `EventDefinition.params_fields` + `TableDefinition.partitions` 跑通；P13b 引擎逻辑 + CriticCtx 契约不变）；P5b 待 ship→RetrievalLinker→`ctx.retrieval` swap。〕
- **Q2 critic 归属**：critic 逻辑 + `critiqueSql(sql, guardCtx)→CriticResult` + `sqlSyntaxGate(phaseOutput, ctx)→GateResult` + `GateResult` 类型全在 nl2sql-engine；P7b phase-gate `sql_syntax_gate` slot delegate 到它（phase-gate→nl2sql-engine 单向无环）；引擎自修 loop 同包直调 critic。P13b 拥 critic+API+GateResult+CriticCtx guard-data 契约；P7b 拥 hook+slot+其余 5 hook+phase 转换（guard-data P7b 从 session tool results 组装）。
- **Q3 package shape + eval 时机**：ship 全形（9 logic modules + P7b 组件 exports [GENERATION prompt-section content, critiqueSql/sqlSyntaxGate, Bm25Linker] + eval-only `generate()` + eval-gate-minimal + 本地接口/薄默认 + conventions + bundle row）；production agent-loop-driven（P7，agent LLM 生 SQL 文本，phase-gate turn-stopping 跑 critic）；generate() eval-only；F6 真 MultiTurnSession runner → P11。
- **Q4 critic 暴露**：gate-only（仅 sql_syntax_gate；search_data_sources 唯一 model-facing tool；evaluate_sql_quality drop；preset critique/evaluate 行留 commented）。
- **Q5 scope**：in-scope = engine + critic(gate-only) + conventions + bundle + search_data_sources + eval-gate-minimal + code-review-low 7 fix。Deferred = F3（vector swap seam 不变，BM25-only）/F4（engine 内薄 near-dup 留，session 级→query-trio Not-yet-specified）/F5（保留 regex+JSON-path+exec-feedback，fail-open+文档残余风险，不换 sqlglot——sqlglot 无 TS 等价+无 MaxCompute 方言）/F6（真 runner→P11）。

**Deferred sub-item（resolved 2026-08-20, commit 0e1a0fdf25）**：search_data_sources model-facing tool 已注册经 `ctx.tools`——`@deepseek-ai/dsh-tools` tool-registration API grounded（`defineTool` + `ctx.tools.register`，首个 model-facing tool，解锁未来 load_*/query_data/critique_sql/evaluate_sql_quality/present_*）。新包 `packages/data/tool-search-data-sources/`（@deepseek-ai/dsh-tool-search-data-sources，镜像 dsh-tool-bash 三件套形态 + tsconfig 2 级 extends ../../../tsconfig.base.json）；UNDERSTANDING tool 直调 nl2sql-engine `Bm25Linker`（Q1 薄默认；ctx.nl2sql 仅 `getConventions` 无 retrieval 方法，故不调 seam）；corpus 空薄默认至 P6b `ctx.schema`（callable-but-unwired 非 broken mount，契合 preset 自注「未注册白名单 tool=不可 call」）；additive swap P5b `ctx.retrieval` / P6b `ctx.schema` 契约不变。preset `tool-search-data-sources` 行已解注释（name 已 ship 非 TBD）。验证：tsc -b clean + vitest 7/7（BM25 召回/top_k/空 corpus/注册/execute/render）+ verify-cordis-config 124 + oxlint 0。dsh-tools API grounding 可复用——所有未来 model-facing tool 注册走同 defineTool+ctx.tools.register 模式。

**code-review-low 7 fix 全落地**：#1 hasPartitionFilter 贪婪跨语句/子句→scope 到 WHERE 子句（`;`分句）；#2 hasSelectStar 漏 `t.*`/`SELECT a, *`→parse select list；#3 running→attach(check_query)续取最多 3 次；#4 FailureKind 归一 lower_snake；#5 NearDupGate.hash 去全部空格（不只 collapse）；#6 Bm25Linker 直用 hit payload（不重 find dataSource）；#7 c07 `__never__` 死 ODPS entry 删（odps optional）。

**Validated**：
- `packages/data/nl2sql-engine/`（9 logic modules: types/conventions/bm25-linking/prompt/critic/engine/stand-in-odps/replay-llm/eval/{cases,scorer,runner} + `index.ts` Cordis Service shell + README + `tests/scenarios.spec.ts`）。
- `packages/query/query-maxcompute/{conventions.yaml, src/conventions.ts}`（F1 conventions + js-yaml loader）。
- bundle `packages/bundle/data-agent/cordis.patch.yml` nl2sql-engine row + `package.json` dep。
- vitest 9/9 spec 全绿（S1-S9：BM25 召回/prompt 组装/critic gate 拦截/JSON path/feedback self-correction/near-dup 门/eval gate L1 pass-rate/honest decline/sql_syntax_gate slot+F2 同源）。
- tsc typecheck-clean（exactOptional 2 fix：`EngineRunResult.result` + `EvalDetail.{sql,decline,reason}` 加 `| undefined`）。
- verify-cordis-config 124 pass。

**Unblocks**：
- **P7b**（critic 生产接线：`critiqueSql`/`sqlSyntaxGate` + `GateResult` + `CriticCtx` 契约已 ship in nl2sql-engine——P7b phase-gate sql_syntax_gate slot delegate 到它；P13b 不触 P7b 文件 per one-ticket rule，P7b session 接 slot）。
- **P5b/P6b**（毕业自 Q1 finding：P5 生产 ctx.retrieval seam+BM25/vector provider；P6 生产 ctx.schema seam+substrate——P13b 本地接口 additive swap）。

## Assets
- `packages/data/nl2sql-engine/`（生产包）。
- `packages/query/query-maxcompute/{conventions.yaml, src/conventions.ts}`（F1 conventions）。
- `packages/bundle/data-agent/{cordis.patch.yml, package.json}`（bundle 接线）。
- `wayfinder/data-agent/prototypes/p13-nl2sql-engine/`（throwaway primary-source，P13）。
- `wayfinder/data-agent/research/{p13-sql-critic-alternatives.md, p6-nl2sql-feasibility.md}`（cited）。
