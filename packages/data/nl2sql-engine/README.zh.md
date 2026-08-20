# @deepseek-ai/dsh-nl2sql-engine

[English](README.md) | 中文

> P13b — data agent 的 NL→SQL 引擎（`wayfinder/data-agent/prototypes/p13-nl2sql-engine/` 一次性原型的生产毕业版）。解决 wayfinder ticket `phase-3/P13b-nl2sql-engine-prod-hardening.md`。

基于 data-agent NL→SQL 流水线的 additive Cordis `Service`（`ctx.nl2sql`）：**BM25 schema-linking** + **SQL 生成 prompt**（RBI `v2-baseline.md` staged SOP）+ **regex/JSON-path critic**（`sql_syntax_gate`，替代 sqlglot AST——TS 无等价实现）+ **执行反馈自纠错** + **eval-gate-minimal**。P6 semantic-layer substrate 上的极端-(B) 路径（研究 `p6-nl2sql-feasibility.md`：完整 (C) 路径单周期不可行——RBI 自身 L1 约 9%）。

## 交付内容（P13b grilling — 5 个决策）

- **Q1 P5/P6 gap** → 本地 `RetrievalLinker` / `CriticGuardData` 接口 + 精简进程内默认实现（`Bm25Linker`、YAML substrate reader）。不声明 `ctx.retrieval`/`ctx.schema` seams（P5/P6 拥有它们）。毕业 **P5b/P6b** 生产 tickets；P13b 在它们发布时做 additive-swap。
- **Q2 critic 归属** → critic 逻辑 + `critiqueSql(sql, guardCtx) → GateResult` + `GateResult` 类型在此包。P7b 的 phase-gate `sql_syntax_gate` slot 委托（单向 `phase-gate → nl2sql-engine`，无循环）；引擎自纠错循环直接调用自己的 critic。
- **Q3 包形态 + eval 时机** → 逻辑模块 + 给 P7b 的组件导出（GENERATION prompt-section 内容、`critiqueSql`、`Bm25Linker`）+ eval-only `generate()` + eval-gate-minimal（当前发布；F6 的真实 `MultiTurnSession` runner → P11）。生产运行时为 **agent-loop-driven**（P7）：agent LLM 生成 SQL；phase-gate 运行 critic。
- **Q4 critic 暴露** → 仅 gate（`sql_syntax_gate`）；`search_data_sources` 是唯一 model-facing tool；`evaluate_sql_quality` 已移除。
- **Q5 scope** → 范围内：engine + critic(仅 gate) + conventions + bundle + `search_data_sources` + eval-gate-minimal + code-review-low 修复。延期：F3（vector swap——seam 不变，仅 BM25）/ F4（session 级近重复 → 尚未定义的 query-trio；engine 内部 thin 保留）/ F5（保持 regex + JSON-path + execution-feedback；fail-open + 记录残余风险；非 sqlglot）/ F6（real runner → P11）。

## Known Limitations and Deferred Work

- **F3 — 向量 swap** — 仅 BM25 检索；seam 不变但真实向量 provider（经 P5b 的 `ctx.retrieval`）尚未连线。schema-linking 准确度在此之前受限于 BM25 召回率。
- **F4 — 会话级近重复门控** — engine 内部精简 `NearDupGate` 保留，但跨 turn 会话级去重延期至尚未定义的 query-trio。
- **F5 — 残余风险（执行反馈）** — 保留 regex + JSON-path + execution-feedback critic（fail-open）；sqlglot 无 TS 等价实现且无 MaxCompute 方言。记录残余风险：critic 可能放行语法无效的 SQL，仅在执行时才失败。
- **F6 — Eval runner** — 当前发布 eval-gate-minimal；真实 `MultiTurnSession` eval runner 延期至 P11。
- **`search_data_sources` tool 注册** — 经 `ctx.tools` 的 model-facing tool 注册最初延期（需要 `@deepseek-ai/dsh-tools` API grounding）；现已作为 `packages/data/tool-search-data-sources/` 发布。语料库在 P6b `ctx.schema` substrate 连线前为空。

## 消费的 Seams

- `ctx.query`（P4b `@deepseek-ai/dsh-query`）— 执行（3-state `QueryOutcome`），生产中经 agent loop；eval runner 使用包内 `StandInOdps`。
- `@deepseek-ai/dsh-query-maxcompute` — `loadConventions` + `conventions.yaml`（P4 per-engine conventions seam，F1）。
- `@deepseek-ai/cordis` + `@deepseek-ai/schemastery` — `Service`、`Context`、`z`（Service shell + `ctx.nl2sql` seam）。

## 运行

```
pnpm test packages/nl2sql-engine           # the 9 scenarios (vitest)
pnpm typecheck                              # tsc -b (host)
```

9 个场景（S1–S9）验证 BM25 linking + prompt + critic gate + JSON-path + feedback self-correction + near-dup gate + eval-gate L1 pass-rate + honest decline + `sql_syntax_gate` slot。确定性测试（dsh-llm-replay stand-in + stand-in ODPS）；无需外部 LLM/ODPS 密钥。

## Code-review-low 修复（已内置）

#1 `hasPartitionFilter` 贪婪跨语句/子句 → 限定到每个 `;` 分割语句的 WHERE 子句。#2 `hasSelectStar` 遗漏 `t.*` + `SELECT a, *` → 解析 select list。#3 `running` → 经 `attach`（check_query）最多重试 3 次。#4 `FailureKind` 归一化为 lower_snake。#5 `NearDupGate.hash` 移除所有空白。#6 `Bm25Linker` 直接使用命中项 payload（不做冗余 re-find）。#7 c07 的死 `__never__` ODPS 条目已移除（`odps` 为 optional）。
