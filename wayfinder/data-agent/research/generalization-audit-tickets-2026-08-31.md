# 通用性审计 · 开票决策清单

> 生成日期: 2026-08-31
> 依据报告: `wayfinder/data-agent/research/generalization-audit-2026-08-31.md`
> 决策方式: 用户逐条确认（G 票 = 架构设计决策票；grilling = 先辩论再开票；CL = 直接代码修复）

## A. G 票（架构设计决策票）— 4 张

### G-T1 · 多租户隔离 / per-request scope 重构（C1+H6 / arch G5 · critical）
**根因**: ScopeRegistry 全局唯一 `active` 指针（共享 YAML，`load()` 每次 readFileSync），无 per-request/tenant 上下文（全仓 grep tenant/sessionId/AsyncLocalStorage 零命中）→ 并发租户竞态、跨租户数据泄漏。
**范围**:
- per-request scope context（AsyncLocalStorage 键控 tenant+session，或显式 scopeId 贯穿调用链），移除全局 `active` 指针
- `ScopeDefinition` 加 `tenant` 字段；list/get/setActive 按 tenant 过滤
- `SemanticLayerService` load/getRelationGraph/acquireSnapshot 加 scopeId 参数，从 `ctx.scopes.get(scopeId)` 解析
- `tool-retrieve` 的 `enrichedLinkers` WeakMap 加 `corpusVersion()` 校验
- `evidence-query` eval store 按 `scope_id` 盖章+过滤，scope 切换时 re-resolve resultsDir
- `InProcRetrieval` 改可 re-probe 的 `SchemaCorpusSource`
**关键文件**: scope-registry/src/index.ts:142,206; semantic-layer/src/index.ts:530,539; tool-scope-routing/src/scope-hint.ts:66; tool-retrieve/src/index.ts:134; evidence-query/src/index.ts:245; retrieval/retrieval-inproc/src/index.ts:57

### G-T2 · 引擎抽象落地（H1+H2 / arch G1 · high）
**根因**: MaxComputeQueryEngine 是唯一 `extends QueryEngine` 子类；`loadConventions` 非 maxcompute 返回空 shape（静默 no-op）；prompt/critic/metric 用字面量烤 ODPS 方言而非从 conventions 驱动。
**范围**:
- 落地第二个引擎 provider（`dsh-query-postgres`）+ 其 `conventions.yaml` 验证缝
- 分区列名 / JSON UDF / 日期惯用语从字面量 prompt 规则移入 conventions（`functions`/`cast_map`/`sql_templates` 已有缝）
- `loadConventions` 未知引擎 fail-loud（不返回空）
- `EngineConventions` + `loadConventions` 移入抽象 `dsh-query` 包（或 `dsh-conventions` 共享模块）
- bundle `engineType` 改 deployment-configurable；eval-cli 引擎 import 按 config 驱动；`DASHSCOPE_API_KEY` 按所选 provider 条件化
- tool 描述改引擎中性（"SQL" 而非 "MaxCompute SQL"）
- 去掉 `PARTITION_COLUMNS` const 与 `['ds']` fallback，依赖 schema 提供的 partitionCols
**关键文件**: query/query/src/index.ts:38; query-maxcompute/src/conventions.ts:77; nl2sql-engine/src/{index.ts:29,prompt.ts:111,113,175,engine.ts:160,217,critic.ts:74,233,metric-engine.ts:139,158,types.ts:37}; bundle/data-agent/cordis.patch.yml:106; eval-cli/src/context.ts:405,413

### G-T3 · enrichment 泛化（H4 / arch G4 · high）
**根因**: 强绑 DWS/DIM 星型；非星型 scope 在 replace 模式写 `dimension_refs:[]` 抹掉人工 curated join 且无信号。
**范围**:
- inventory 泛化为任意有非空 `primary_key` 的表（不只 `kind='dim'`）
- `buildLlmPrompt`/`buildEventLlmPrompt` 改 schema-model-agnostic
- 加 FK 命名启发式（列名 ends `_id`/`_key` 且等于 dim PK）
- `kind` enum 加 `ods`/`entity`/`flat`（或开放字符串），未标记导入默认 `ods`
- **默认 `mergeExisting=true`**（防抹 curated join）——可先做这一行
- 空 inventory 时 short-circuit + 明确消息
**关键文件**: semantic-layer/src/{enrichment.ts:71,144,151,226,316,348,types.ts:278}; tool-discover-relations/src/index.ts:184,221

### G-T4 · eval 框架去 K11（H5+H8 / arch G6 · high）
**根因**: `scopeId='k11'` + case 正则 `/^k11_\d+\.yaml$/` + caseDir/defaultProject/semanticRoot 指向 K11；失败分类只认 ODPS 错误码。
**范围**:
- scopeId 从 `case.scope_id` 或 config 读（不字面 'k11'）
- case 正则改 eval-cli 已有 glob（`*.yaml`/`*.yml`/`*.json`）
- `caseDir`/`scopeId`/`defaultProject`/`semanticRoot` 改必填部署项（无 K11 默认，未设 fail-loud）
- `today` 用真实当前日期
- `FailureClassifier` 接口 + 多引擎错误模式集（PG/Snowflake/BigQuery 串：`syntax error at or near`、`relation .* does not exist`、`column .* does not exist`）
- `classify_failure` 与 `verdict_mapper` 共享一个失败分类真值源（不再两套发散）
- `compare.ts` 分类从 case dimensions（`query_intent`/`sql_complexity`）取而非 k11v2 子串
**关键文件**: eval-runner-service/src/index.ts:379,391,418; bundle/data-agent/cordis.patch.yml:162,178; eval-cli/src/{context.ts:405,413,compare.ts:76}; eval/src/classify_failure.ts:56; eval-runner/src/verdict_mapper.ts:94

## B. 先 Grilling（辩论后再开票）— 3 个议题

### Grill-1 · persona 归属（C2 / arch G3）
- **议题**: management persona 应由 phase-gate 持有（加 `personaText` 字段）还是移到 `agent.cordis.yml` 的 `dsh-persona` 行（config-supplied）？`domainPersona` 从 scope 元数据如何注入？表前缀/事件名是否从 schema 派生？
- **背景**: `BASE_PERSONA='per-game analytics platform'` const 不可覆盖；`PHASE_INSTRUCTIONS` 烤入游戏术语。
- **关键文件**: phase-gate/src/phase-gate.ts:85,93,958

### Grill-2 · i18n 架构（C3+H7 / arch G2）
- **议题**: (a) 建 locale(zh/en/ja)×domain 的 prompt-template registry + locale bundle，还是 (b) 直接把 prompt 抽到 config 文件？词库用 locale lexicon 还是 LLM intent 分类？marker（`【拆解】`/`【未完成】`）prompt 与 parser 如何共享真值源？BM25 tokenizer 加 kana 还是换形态学 tokenizer？
- **背景**: NL2SQL/expansion/judge/resolve_term/conventions 渲染全中文+游戏域，无 i18n seam；marker prompt 与 parser 无共享真值源（本地化只改一边就静默坏 decline 路由）。
- **关键文件**: nl2sql-engine/src/prompt.ts:84; tool-search-data-sources/src/expand-query.ts:11; eval-runner/src/sql_semantic_judge.ts:70; metric-engine.ts:97; granularity.ts:13; phase-gate/src/domain.ts:47; bm25-linking.ts:72

### Grill-3 · TableDefinition schema（H3）
- **议题**: `kind` enum 扩充（加 `ods`/`entity`/`flat` 哪些）还是改开放字符串？`freshness` 改自由文本还是加 locale-neutral token？`_id`/`_name` 后缀启发式去留 + 从 connector 接受显式 PK/label hint？`inferRole` 如何 `canonicalizeType`？
- **背景**: 导入表默认 `engine='maxcompute'`+`kind='dws'`，裸 PG/Hive metastore 导入静默错。
- **关键文件**: semantic-layer/src/{types.ts:270,278,283,288; io.ts:498,525,545,559,655}

## C. CL 票（直接代码修复）— 18 张

| # | 文件:line | 问题 | 修复 |
|---|---|---|---|
| CL1 | semantic-layer/src/index.ts:339 | getRelationGraph 单条悬挂 domain→concept 引用即抛，拖垮所有 asset | skip 该引用+warn 继续；悬挂收集到 health-check |
| CL2 | eval-cli/src/compare.ts:76 | classifyCase 按 k11v2 `_alias_`/`_voice_` 子串分桶 | 改从 case dimensions 取分类键 |
| CL3 | eval/src/text_sim.ts:23 | char-trigram 阈值 0.35 CJK 标定且不可注入 | 阈值改可注入 opts；加英文 word-level 预设 |
| CL4 | nl2sql-engine/src/bm25-linking.ts:72; tool-search-data-sources/src/index.ts:303 | tokenizer 丢日文 hiragana/katakana | CJK regex 加 `぀-ゟ゠-ヿ` |
| CL5 | semantic-layer/src/enrichment.ts:118 | mergeRefs 用中文前缀 '确定性' 判定派生源 | 加结构化 `source` 字段('deterministic'/'llm'/'curated') |
| CL6 | phase-gate/src/index.ts:70 | scopeId 默认 'game-1' + 游戏 docstring | 默认改中性 'default' 或必填 |
| CL7 | apps/cli/config/agent-presets/data-agent/b-free-react-planning.cordis.yml:24 | B preset 默认 'per-game' persona | 改 domain-neutral 模板 + `{{domain}}` 变量 |
| CL8 | llm-wiring-plugin.ts:36; expand-query.ts:27; eval-cli/main.ts:65 | LLM provider/model 默认 Qwen/DashScope 无 fail-loud | 集中到一个部署 config；默认空+fail-loud |
| CL9 | nl2sql-engine/src/conventions.ts:33 | renderConventionsPrompt 中文段头 | 段头抽 locale bundle |
| CL10 | tool-suggest-followups/src/index.ts:63 | '≤8 中文字符' 约束 | 改 locale-neutral '≤~20 chars/≤4 words' |
| CL11 | phase-gate/src/phase-gate.ts:118 | INTERPRETATION 嵌中文 marker 【发现】/【注意】 | marker locale-configurable 或改中性符号 |
| CL12 | tool-load-event-definition/src/index.ts:354 | 中文 '埋点' gloss | 改 'instrumented event' 或 localize |
| CL13 | eval/eval/cases/generate-k11.mjs | K11-only case 生成器 | 文档化为 throwaway + 出 scope-agnostic 生成器模板 |
| CL14 | semantic-layer/src/snapshot.ts:173 | snapshot 缓存无界 | LRU 或 scope 移除时清理 |
| CL15 | eval-cli/src/context.ts:221,375 | 重复中文游戏扩展 prompt + [粒度] 标签 | 从 expand-query.ts 引用单一源；localize [粒度] |
| CL16 | nl2sql-engine/src/engine.ts:109; stand-in-odps.ts:19 | OdpsExecutor/StandInOdps 命名（接口已通用） | 重命名 SqlExecutor |
| CL17 | nl2sql-engine/src/index.ts:29; prompt.ts:18 | EngineConventions 从 maxcompute 包导入 leaky | 移入抽象 dsh-query 包 |
| CL18 | client/ui-semantic-layer/src/client/hooks/useLayoutMode.ts:23 | B→A autoFlipThreshold=3 不可配 | 暴露为 host config 字段 |

## D. 推荐执行顺序
1. **G-T2 落地 postgres 引擎** — 验证缝、暴露隐藏耦合（G-T1/G-T3/G-T4 的试金石）
2. **G-T1 多租户 scope** — critical，决定 SaaS/多租户可行性
3. **3 个 grilling 议题**（persona/i18n/schema）→ 产出设计方向 → 转 G 票
4. **G-T3 enrichment**（先把 `mergeExisting=true` 一行防抹数据，再泛化）
5. **G-T4 eval 去 K11**
6. **18 张 CL** 按文件分组批量清理（CL16/CL17 与 G-T2 同包，可合并）

## E. 原始数据指针
- 审计报告: `wayfinder/data-agent/research/generalization-audit-2026-08-31.md`
- 原始 finding JSON: `.tmp/audit/{d1..d8,actionlist,archdefects}.json`
