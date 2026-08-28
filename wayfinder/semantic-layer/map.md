# wayfinder:map — dsh-data-agent 语义层

> 本地 markdown tracker。子 ticket 在 `tickets/`，研究笔记在 `research/`。本 map 是**索引**，非存储。

## Destination

将 dsh-data-agent 的语义层从「代码存在但不可用」变为「端到端真正可用」：

1. **核心链路跑通**：用户自然语言提问 → 语义层提供足够上下文（检索 + 定义加载）→ NL2SQL 生成正确 SQL → 执行 → 返回结果。以全链路可用为验收标准。
2. **架构正确**：语义层是可扩展的数据源注册表（不锁死表+事件），与查询引擎解耦（provider 可插拔），per-scope namespace 隔离，定义存储在运行时可配置路径。
3. **Web UI 可管理**：通过 dsh 插件化机制提供管理界面（浏览/搜索、编辑、scope 管理、质量监控）。
4. **Ontology 决策落地**：完成知识图谱/ontology 调研，决定其在 data-agent 中的角色和实现方式，若决策为引入则实现之（限于 Phase 1-3；Phase 4 可视化+自动发现明确 out of scope）。
5. **管理 agent 证据闭环**（③-gated，v1 后展开）：管理 agent 可通过 eval 证据自校准朝 goal 推进（autonomous goal loop），实现语义层质量的自主持续改善。v1 阶段仅建证据基建+人驱管理面；③ 自驱循环在 v1 ①② 栈完成后作为本 map 的后续阶段展开。

**架构定位（2026.08 R9 前沿审计后追加）**：dsh-data-agent 的语义层 = 一个 **context layer** 的早期实现（对齐 Forrester/Gartner 2026 定义）。v1 聚焦核心链路+管理面+③自驱；v2+ 方向为完整 context layer 对齐（见下方"Context Layer 演进方向"章节）。

前提：项目处于开发期、无用户、无兼容负担。任何不满足要求的现有代码可推翻重来。

### 验收假设（外部依赖）

Destination 第 1 条「全链路可用」的验收依赖以下外部系统在现有能力下能配合新语义层工作：

| 外部系统 | 假设 | 若不满足 |
|----------|------|----------|
| NL2SQL 引擎（`nl2sql-engine`） | 能消费 `registry.toPromptContext()` 产出的格式化文本作为上下文 | 本 map 修改格式化适配层（不改引擎核心逻辑） |
| Query engine（`ctx.query.execute`） | 能执行 NL2SQL 生成的 SQL 并返回结果 | 超出本 map 范围；需协调 data-agent map |
| dsh 插件化机制（Cordis + Client UI Slot） | 已就绪且支持新增管理 UI 插件 | R3/R6 已验证可行；若 upstream 变更需同步适配 |
| Eval 核心（`packages/eval/eval`） | 现有接口可被 W3 runner 调用而不改核心 | 2 wiring caveats（W3 已追踪）；若需改核心则与 data-agent map 协调 |

## Notes

- **域**：dsh-data-agent 语义层端到端可用 + Web UI 管理 + Ontology 知识图谱能力 + ③ 管理 agent 证据闭环。
- **③ 定义**：③ = 自驱循环阶段门禁。标记为 ③-gated 的 ticket/能力 在 v1 ①② 栈（W1-W5-full）完成后才展开。③ 的核心 = 管理 agent 用 eval 证据自校准朝 goal 推进的 autonomous loop。
- **每会话应查 skills**：`dsh-plugin-development`、`grilling` + `domain-modeling`、`research`、`prototype`。
- **术语约定**（消除漂移）：
  - **SchemaProvider**：代码中的接口名（PascalCase）。文中用「schema provider」指代概念时统一小写带空格。
  - **scope**：纯逻辑划分单元（用户自定义）。代码中 scope 内部通过文件系统目录实现隔离，但 scope ≠ namespace——scope 是业务概念，namespace 是隔离机制。
  - **定义（definition）**：本 map 中特指语义层中的数据源定义（`TableDefinition` / `EventDefinition` / `MetricDefinition`）。「定义版本管理」管理的是这些定义的变更历史，非 ontology 层概念。
- **常设原则**：
  - **不做过渡方案**：LLM 编码场景下，直接做目标架构，不分短/中/长期妥协。
  - **语义层不绑定特定查询引擎**：SchemaProvider 可插拔（`registerSchemaProvider` + `engineType` 路由）。
  - **scope = 纯逻辑划分**：用户自定义划分方式，文件系统目录作隔离实现。
  - **语义层默认空白**：由用户/管理员填充。
  - **数据源类型可扩展**：不锁死「表 + 事件」；新增 kind = 实现一个 `DataSourceKindPlugin`。
  - **无兼容负担（对外）**：对外部消费者（preset、bundle config、用户 YAML）无需保持向后兼容。对内部已验证代码（G1 已决定保留的基础设施），重构扩展而非无意义重写。
- **现有基础设施**（重构扩展，非推翻——G1 决策）：
  - `packages/data/semantic-layer/` — types.ts 保留，io.ts/index.ts 重构扩展
  - `packages/data/tool-load-{table,event}-definition/` — 通过 `registry.toPromptContext()` 格式化（格式契约 = 纯文本，NL2SQL 引擎直接消费）
  - `packages/data/tool-search-data-sources/` — 通过 `registry.toCorpusItem()` 聚合 corpus（格式契约 = `CorpusItem {id, description, metrics, payload}`）
  - bundle 已挂载 semantic-layer 但 semanticRoot 为空（P1 的 `dsh-scope-registry` 解决配置指向）

## Decisions so far

- 验收标准 = 全链路跑通（检索 → SQL → 执行 → 结果）
- 数据来源 = RBI 一次性手动导入 + 可插拔 schema provider 自动发现
- 配置 = per-scope 可配置路径，运行时目录
- scope = 纯 namespace
- Web UI 核心场景 = 浏览/搜索 + 编辑 + scope 管理 + 质量监控
- [R1 数据模型调研](research/r1-data-model-design.md) — 方案 B 推荐，per-kind plugin 保留类型安全 + 检索层已类型无关
- [R2 Ontology 调研](research/r2-ontology-comprehensive.md) — ontology = 语义层 + relations 声明 + in-memory 图；不引入独立系统
- [R3 Harness 插件化调研](research/r3-harness-plugin-system.md) — Cordis plugin 模型 + Client UI Slot 系统，新增插件有清晰 pattern
- [R4 Schema Provider 插件化调研](research/r4-schema-provider-plugin.md) — 对齐 LLM pattern：registerSchemaProvider + engineType 路由 + disposer
- [R5 Web UI 调研](research/r5-web-ui-semantic-layer.md) — 三栏布局 + Domain 导航 + 多视图切换 + 详情抽屉
- [G1 数据模型决策](tickets/G1-data-model-decision.md) — 方案 B（类型化可插拔 + 统一检索层）；`DataSourceKindPlugin<T>` 接口（toCorpusItem / toPromptContext / toCriticContext / relations）；现有 P6b 重构非推翻
- [G2 Ontology 角色决策](tickets/G2-ontology-role-decision.md) — 语义层关系扩展（非独立系统）；Level 2/2.5 双路径（路由由实验决定）；relations 三类型（joins/derived_from/related_to）；Metric = kind plugin（图节点）；计算规则 = SQL + metadata 混合；Phase 1-3 在本 map
- [P1 Per-scope 配置](tickets/P1-per-scope-config.md) — 双层 config：Cordis 静态指向 registry 文件路径（`registryPath`），`scopes.yaml` 运行时可变。新包 `dsh-scope-registry`（`ctx.scopes`）+ SemanticLayerService 动态解析 active scope
- [P2 关系声明 + In-Memory 图](tickets/P2-ontology-relations-graph.md) — DataSourceRegistry + 3 内置 kind plugins (event/table/metric) + RelationGraph (BFS join-path / getRelated / getDerived) + loadDefinitions 泛型加载器 + loadRetrievalCorpusFromRegistry + buildCriticFields 聚合。88 tests 全绿。
- [G3 AI-Native Enrichment 设计](tickets/G3-ai-native-enrichment-design.md) — 两轮发现（确定性 PK 匹配 + LLM 综合推断）；直接写入 + **eval-based confidence gate**（低/中/高风险分级：高风险变更若 eval pass_rate drop >5pp 则 auto-revert）；Service 方法 + Agent Tool；语义层变更后自动触发（核心能力）；DWS 优先 → events 第二轮；metrics 机械提取 + 后续 LLM 补充
- [T1 K11 迁移 + Enrichment](tickets/T1-seed-k11-definitions.md) — 321 tables + 453 events 已迁移；126 DWS 表 dimension_refs 已填充；3916 metrics 已提取；discoverRelations Service + on-write hook + tool-discover-relations 均已实现。⚠️ runtime-wiring 缺口：kind plugins 未注册进 registry、无 live RelationGraph、检索语料仅 events — P3/P4 前置补全见 Phase 2 prompt 的 Phase 1.5
- [T1 种子 K11 定义](tickets/T1-seed-k11-definitions.md) — 完整 RBI 迁移：321 表（162 DWS+159 DIM）+ 445 事件 + field_samples；schema 兼容全绿
- [DWS→DIM 发现前置报告](research/dws-dim-discovery-report.md) — Phase 1 用 subagent 充当 llmCall 跑 162 DWS：126 表得 225 refs（34 DIM）；enrichment.ts/hook/tool/metrics 全落地；生产化见 F1
- [P3 Ontology NL2SQL 集成](tickets/P3-ontology-nl2sql-integration.md) — 三机制落地：C1 join constraint 注入 prompt、C2 undeclared_join critic 警告、C3 graph-expanded recall（+1-hop DIM）；K11 对比实验 with-graph 100% vs without 20%（+80pp，structural scoring，scripted LLM caveat）
- [P4 指标计算引擎](tickets/P4-ontology-metric-engine.md) — eval 验收（5 cases Level 2 metric-context vs normal）；execute_metric + Level 2.5 确定性路径已删除（M1b: SUM-on-_df 快照指标确定性错误）；metric 统一走 Level 2 buildMetricContext 注入；14 tool tests + 55 phase-gate tests + 139 semantic-layer tests 全绿
- [F1 DWS→DIM 发现正式化](tickets/F1-dws-dim-discovery-formalization.md) — enrichment-llm-wiring Cordis 插件接入 ctx.llm→ctx.schema；alternative FK 精化（多替代外键→独立 joins 边）；events deterministic external_refs 已填充（92/445）；188 tests 全绿
- [R6 Web UI 实现方案调研](research/r6-web-ui-implementation.md) — UI 插件 pattern 直接套用；需新增 `SchemaGateway`（TypertRemoteService）投影 ctx.schema（当前无 Remote 接口）；Bm25Linker 复用经 Remote 暴露；React Flow 推荐（无现成依赖，血缘图划出 v1）；R5 全部可行无架构阻塞；增量交付 v1-a 浏览→v1-b 编辑→v2 质量监控
- [W1 SchemaGateway](tickets/W1-schema-gateway.md) — `@deepseek-ai/dsh-schema-gateway` 新包已实现；9 Remote 方法（list{Tables,Events,Metrics} + get{Table,Event,Metric}Definition + search + listDomains + getCoverageStats）；cached Bm25Linker + D2f invalidation；11 tests 全绿
- [G4 Web UI 范围与交互决策](tickets/G4-web-ui-scope-and-interaction.md) — Web UI=独立完整管理界面（非 CLI 补充）；语义层管理=一个 agent=**goal ⊕ eval/evidence 层**（eval 填 goal 留的完成证据缺口，桥接管理 agent(goal)/数据 agent(pipeline)）；v1=**B 布局**（资产为首+证据侧栏）+ domain-first nav + **tiered evidence**（per-mutation 结构性+per-batch 全量 eval）+ 直接写+Tier-2 audit；③ 自驱循环 deferred（同 map，W6，③-gated）；复用 `packages/eval/eval` 核心**不重构**，建 P11c runner/delta/case-port(C)/live-wiring；eval 跑全量；v1=①证据基建+②人驱管理面；毕业 W1-W6 实现票；**增量交付修订**：W5 拆为 W5-lite（仅←W1，资产能力完整交付）/ W5-full（←W1+W4，证据能力渐进亮起）；blocking 边：W1、W2 无前置（并行根）；W3←W2；W4←W1；**W5-lite←W1（可独立 ship）**；W5-full←W4；W6←W3+W4+W5-full+goal
- [W5b UI 规范对齐 — SUPERSEDED](tickets/W5b-ui-convention-alignment.md) — "modal vs inline panel"是错误的范式；语义层管理界面 = 管理 agent 对话面（非 CRUD 浏览器/modal）。前提推翻，由 G5 取代。
- [G5 管理 agent 交互范式设计](tickets/G5-management-agent-interaction.md) — 范式=管理 agent 对话面；v1/终态 UI 无区别；trigger=sidebar footer→resume/create session；tools=9 个（search_schema/get_definition/list_domains/discover_relations/execute_metric/edit_definition/get_coverage/trigger_eval/goal）；detail panel=被动模式；SemanticLayerShell 重写、View/EvidenceSidebar/GoalDock 废弃、AssetDetail/CoveragePanel 复用。毕业实现票 W7-W10。**W5-lite "用户可用"阻塞更新**：原阻塞者 W5b 已 superseded → 新阻塞者为 W8（trigger）+ W9（presenters）
- [W7 管理 agent preset](tickets/W7-management-agent-preset.md) — `semantic-layer-management` preset 已创建（agent.cordis.yml）：挂载 4 个管理 tool（search_schema/get_definition/list_domains/get_coverage）+ persona prompt
- [W8 Sidebar trigger 重写](tickets/W8-sidebar-trigger-rewrite.md) — SemanticLayerShell 重写为 session trigger：点击 sidebar footer action 创建/恢复管理 agent 对话；CSS module + alias token 暗色模式；locale dict 清理
- [W9 核心 tool presenters](tickets/W9-core-tool-presenters.md) — search_schema/get_definition/get_coverage 三个 tool 实现 render intent（presentCall + presentResult + presentationMeta）+ 对话中结构化卡片渲染（keyed toolview 注册）；generic card 类型
- [W10 discover_relations presenter](tickets/W10-discover-relations-presenter.md) — discover_relations tool 实现 before/after diff 渲染：execute 中捕获 before 快照 → enrichment → after 快照 → presentationMeta 投射 added relations；对话中 diff 卡（+标记 + relation type badge）
- **W5-lite "用户可用" 达成**：W1 ✅ + W8 ✅ + W9 ✅ → 语义层管理 agent 已用户可用（trigger + preset + tool presenters 全链路 ship）；W5-full 仍等 W4（evidence-query-backend）
- [W5-full 证据能力渐进亮起](tickets/W5-ui-semantic-layer-v1.md) — trigger_eval tool（`@deepseek-ai/dsh-tool-trigger-eval` + EvalRunnerService seam）+ Evidence Panel 组件库（EvidenceSidebar/CoveragePanel/EvalTrajectory/EvalDeltaView/GapPanel）+ TriggerEvalRow presenter + useEvidenceQuery hook（含 beforeAfterDelta）+ preset 活化；19 tests 全绿
- [W2 Case-set port](tickets/W2-case-set-port.md) — 161 K11 cases port 为 da EvalCase YAML，schema 全绿；分层标注（L1-L4 × 7 intent × linear/iterative）+ 覆盖矩阵（161/162 DWS，28/159 DIM 仅结构性证据）完成
- **W3 Pre-work caveat 验证** — caveat-a 触发（四阶段 agent 产生 4+ assistant/message per interval → ProtocolError）；修复=方案 A（adapter 取最后一条，不改 eval core）；caveat-b 不触发（query_data arg=`sql` 已在 SQL_KEYS）
- [W3 Eval evidence engine](tickets/W3-eval-evidence-engine.md) — batch runner（`runBatch` + infra-retry）+ JSONL 持久化 + `computeDelta` before/after flip + health-gate 前置检查 + adapter 放宽（count≥1，last query_data tool/call）；240 eval tests 全绿；live e2e with-key deferred
- [W4 Evidence-query backend](tickets/W4-evidence-query-backend.md) — `FileBackedEvalResultStore`（读 W3 JSONL）+ `beforeAfterDelta(runIdA, runIdB)` 真实持久化接入 + `EvalCaseFlip`/`EvalDeltaReport` 类型；33 evidence-query tests 全绿；W5-full 解除阻塞
- [W6 ③ 自驱循环 + B→A 演进](tickets/W6-autonomous-goal-loop-and-btoa-evolution.md) — Layered 双层（model 自判主路径 + policy plugin backstop K=3/N=3）；Context plugin 注入 `<eval_evidence>` block；GoalDock = sidebar 内联卡片（与 dock GoalBar 共存）；B→A = feature flag + auto-flip（3+ eval runs）；毕业 W6a-W6e 实现票
- [W6a goal-eval-policy plugin](tickets/W6a-goal-eval-policy-plugin.md) — `@deepseek-ai/dsh-goal-eval-policy`：session/event 计轮 → 每 K=3 轮触发 eval → delta improved===0 计无改进 → N=3 后 force-block；typed AgentHandle/GoalServiceSeam seams；10 tests
- [W6b goal-eval-context plugin](tickets/W6b-goal-eval-context-plugin.md) — `@deepseek-ai/dsh-goal-eval-context`：system prompt section 'eval-evidence'（order 50）；goal/changed 跟踪活跃状态；`<eval_evidence>` XML block 含 pass_rate + delta + direction hint；hintEscalationThreshold 可配；20 tests
- [W6c GoalDock in EvidenceSidebar](tickets/W6c-goal-dock-evidence-sidebar.md) — GoalDock 组件：objective + phase badge + round counter + SVG sparkline；只读，与 dock GoalBar 共存；host composition 提供数据；8 tests
- [W6d B→A layout evolution](tickets/W6d-btoa-layout-evolution.md) — DashboardView（证据 hero）+ computeEffectiveMode auto-flip（evalRunCount>=3 → A）+ SemanticLayerShell 路由；B 布局字节级保留；host 传入 evalRunCount；13 tests
- [W6e Management agent persona ③](tickets/W6e-management-agent-persona-evolution.md) — persona 增加 eval evidence 解读 + 自驱行为规范 + tool 指南；`@deepseek-ai/dsh-tool-edit-definition`（patch + audit + unreviewed + smart-merge columns/dimension_refs/domains）；preset 中激活；27 tests
- [W11 Evidence-query client RPC bridge](tickets/W11-evidence-query-client-rpc-bridge.md) — EvidenceQueryService 转 TypertRemoteService（8 @Remote 方法）；typert generate 正式产物；client assembly 注册；buildEvidenceQueryClient 桥接适配器 + useEvidenceMetrics hook；wiring.tsx 三处 TODO 替换为真实数据；98 tests 全绿
- [W12 删除过时 semantic-layer-goal 包](tickets/W12-remove-semantic-layer-goal-package.md) — 全部职责已被 dsh-goal-round-driver / dsh-goal-eval-policy / dsh-goal-eval-context / dsh-eval-runner / semantic-layer-management preset 覆盖；零消费者；14 文件删除，tsc clean
- [W13 ③ 自驱循环端到端集成验证](tickets/W13-autonomous-loop-e2e-integration.md) — building blocks 全部就绪（goal-round-driver + eval-runner-service + goal-eval-policy + goal-eval-context + management preset）；端到端闭环验证通过- **W14 Web UI 运行时修复**（2026-08-28）— commit `c198421627` 引入的 `'layout'` 硬依赖 + Cordis Proxy inject guard 阻止了管理 UI sidebar 按钮注册；5 个级联问题修复：query-maxcompute graceful degrade / scope.get() 绕过 Proxy / 6 个 preset 包缺 lib/index.js / tool-revert-edit minimum keyword / preset-autojoin 竞争。修复后：sidebar 按钮可见 + session 正确选中 semantic-layer-management preset。package.json 合规修复（peer deps / dsh.client.inject / README）同批。
- [T2 确认管理面板 web 端可见](tickets/T2-verify-management-panel-web-visibility.md) — Headless Playwright 自动化验证全部通过：sidebar 按钮渲染 + 点击进入 session + GoalDock/EvidenceSidebar 可见 + 零 console error。前置条件=web profile 含 data-agent bundle。
- [R7 Terminology ontology 角色](research/r7-terminology-ontology-role.md) — **修订（前沿对齐）**：2026 context layer 共识= terminology IS ontology 一等组件；推荐方案 D（definition schema 加 `aliases` 节点属性 + RelationGraph 反向索引）；不新增 relation type（属性非边）；渐进三阶段实现
- [R9 Context Layer 前沿审计](research/r9-context-layer-frontier-audit.md) — 现有决策与 2026 Forrester/Gartner/OpenMetadata/Atlan/Jedify 共识对照；大部分对齐（P3/G3/G4/G5/W6）；R7 已修订；G2 relation scope 偏窄（记为 fog）；缺 context layer 整体演进认知
- [CL-1 Terminology aliases 迁移](tickets/CL1-terminology-aliases-migration.md) — SKOS 对齐双字段（`pref_label` + `alt_labels: string[]`）；全 definition type 加；`toCorpusItem(def)` 移除 terminology 参数（原子迁移）；检索策略 = Strategy B（always-fused graph-anchored hybrid）；`lookup_terminology` → `resolve_term`（agent 消歧工具）；enrichment = G3 同构（on-write hook + `discover_alt_labels` tool + eval 验证）。**Phase 3 落地**：两轮发现（确定性提取括号/引号/domains + LLM 语义补充）；`@deepseek-ai/dsh-tool-discover-alt-labels` 新包；management preset 注册；on-write hook 扩展；code review fixes（score cap/CJK bigram/maxRelations）

## Not yet specified

- **SchemaProvider 路由冲突解决**：R4 确定了 `registerSchemaProvider` + `engineType` 路由的整体方案，但多 provider 注册时的优先级排序规则和冲突解决（同 engineType 多 provider 谁优先？）待实现时具体化。Session prompt: `prompts/remaining-1-schema-provider-conflict.md`。**保留为雾**（2026-08-28 确认——当前只有一个 provider，等引入第二个时再决策）。
- **Context Layer 对齐演进**（R9 审计，详见下方独立章节）

## Context Layer 演进方向（v2+）

> 参考文档：`research/context-layer-2026-frontier.md`（完整前沿综述）、`research/r9-context-layer-frontier-audit.md`（决策审计）

### 前沿定位

2026 Forrester/Gartner 定义：**Context Layer = Semantic Layer + Knowledge Graph + Business Glossary + Policies + Trust Signals + Organizational Memory**，统一为 graph-based ontology，服务 agentic AI。

dsh-data-agent 的语义层**本质上已经是一个 context layer 的早期实现**——只是缺少自觉的定位和几个组件的统一。

### 当前覆盖 vs 缺口

| Context Layer 组件 | 当前状态 | 缺口 |
|---|---|---|
| Metadata Catalog | ✅ definitions + SchemaGateway | — |
| Ontology (typed relations) | ✅ RelationGraph (3 types) | 缺语义概念节点 |
| Business Glossary | ⚠️ 扁平 terminology.yaml | → R7 方案 D 解决 |
| Metrics Layer | ✅ MetricKindPlugin + execute_metric | — |
| Trust Signals | ⚠️ eval pass_rate 仅覆盖质量 | 缺认证/新鲜度/使用频率 |
| Lineage | ✅ derived_from (表级) | 缺列级 |
| Policies | ✅ dsh-admin (访问控制) | 缺使用建议/敏感标记 |
| Organizational Memory | ⚠️ goal (session 内) | 缺跨 session 累积知识 |
| Context Projection | ⚠️ 三接口分离 | 未来统一 |

### 解决路径（分阶段）

#### Phase CL-1：Terminology 统一（R7 方案 D — SKOS 对齐）✅ 决策已锁定

**解决**：glossary 独立于 ontology 的偏差

**决策（2026-08-28 grilling 锁定）**：
- D1：SKOS 对齐双字段 `pref_label?: string` + `alt_labels?: string[]`（snake_case 适配）
- D2：全 definition type 加（event + table + metric）；列级排除
- D3：`toCorpusItem(def)` 直接移除 terminology 参数，原子迁移
- D4：检索 = Strategy B（always-fused hybrid）；tool = `resolve_term`（替代 `lookup_terminology`）
- D5：enrichment = G3 同构（on-write hook + `discover_alt_labels` tool + eval 验证）

实现三阶段：Phase 1 schema + 接口 + 数据迁移（原子）→ Phase 2 图反向索引 + resolve_term tool + hybrid 检索 → Phase 3 AI enrichment hook + tool

**成本**：低-中（Phase 1 仅加字段+迁移，Phase 2 图索引+tool，Phase 3 enrichment）
**收益**：SKOS 标准对齐 + Jedify 模式（图编码术语→子图投射）+ 消除 toCorpusItem 参数不一致

#### Phase CL-2：Domain/Concept 作为图节点

**解决**：G2 relation type 范围偏窄（仅结构性关系，无语义概念映射）

当前 `domains: string[]` 是 definition 的扁平属性。前沿方向：domain/concept 提升为**图节点**，用现有 `related_to` type 连接到 asset 节点。

```
概念模型：
  [concept:用户活跃] --related_to--> [event:role.online]
  [concept:用户活跃] --related_to--> [table:dws_active_user_di]
  [concept:付费] --related_to--> [table:dws_pay_order_di]
```

**实现方式**：新增 `ConceptKindPlugin`（继承 DataSourceKindPlugin 体系），concept 定义存储为 YAML（与 table/event 同级）。**不新增 relation type**——concept→asset 使用现有 `related_to`，因为它本身就是"业务语义关联"的表达。

**收益**：
- Agent 可通过概念导航到相关资产（"付费相关的表有哪些？"→ 图查询一跳）
- 对齐 OpenMetadata 2.0 的 ontology 层（business concepts + typed relationships）
- Domain 不再是孤立标签，而是图中可遍历的节点

**成本**：中（新 kind plugin + 数据建模 + 管理 tool 扩展）
**依赖**：无硬依赖，但 CL-1 先行可验证图扩展模式

#### Phase CL-3：Context Projection 统一

**解决**：G1 三接口分离（toCorpusItem / toPromptContext / toCriticContext）

当前三个接口各自独立消费 definition，消费者无法灵活组合。Jedify 模式 = 统一 context graph + 按需投射子图。

**演进路径**（不破坏现有接口）：

```typescript
// 新增统一投射接口（现有三个方法保留为快捷方式）
interface DataSourceKindPlugin<T> {
  // 现有（保留，向后兼容）
  toCorpusItem(def: T): CorpusItem | null
  toPromptContext(def: T): string
  toCriticContext?(def: T): CriticFields

  // 新增：统一投射（消费者可自定义 view config）
  project?(def: T, opts: ProjectionOptions): ProjectionResult
}

interface ProjectionOptions {
  view: 'corpus' | 'prompt' | 'critic' | 'full'
  includeAliases?: boolean     // CL-1 后可用
  includeRelations?: boolean   // graph context
  includeTrust?: boolean       // CL-4 trust signals
  maxTokens?: number           // Jedify-style token budget
}
```

**时机**：CL-1 和 CL-2 落地后，当多个消费者（NL2SQL、检索、critic、管理 agent）对同一 definition 需要不同 context 切片时，统一接口的价值才显现。过早引入 = over-engineering。

#### Phase CL-4：Trust Signals 丰富（远期）

**解决**：trust signals 仅有 eval pass_rate

可扩展的信任维度：
- **认证状态**：definition 是否经过人工审核（`certified: boolean`）
- **数据新鲜度**：上次 schema 同步时间（依赖 live ODPS provider，已标记 out of scope）
- **使用频率**：被查询的次数（可从 audit log 统计）
- **质量分**：eval pass_rate（✅ 已有）

**前置**：CL-1 和 CL-2 作为基础设施；trust signals 作为 definition schema 的可选字段逐步加入。

#### Phase CL-5：Organizational Memory（远期）

**解决**：跨 session 的管理 agent 累积知识

OpenMetadata 2.0 的核心新增 = organizational memory。当前 dsh-data-agent 的 goal 机制是 session-scoped。

可能方向：
- 管理 agent 的跨 session 知识（"上次发现 dws_pay_order_di 的 user_id 可以 join dim_user"→ 下次自动利用）
- eval 历史趋势作为决策依据（W4 evidence-query 已有基础）
- 关系发现的累积确信度（多次 enrichment 验证同一关系 → 提升 confidence）

**前置**：③ 自驱循环（W6/W13）完成验证后作为自然延伸。
- ~~**Terminology 挂载点**~~ — **毕业为 [R7](tickets/R7-terminology-ontology-role.md)**（2026-08-28）：research 调研 terminology 是否应作为知识图谱 ontology 的一部分存储和消费。
- ~~**定义版本管理**~~ — **毕业为 [G6](tickets/G6-definition-version-management.md)**（2026-08-28）：grilling 讨论开源项目是否自带 git 版本管理。
- ~~**Shell auto-flip 接入真实 evalRunCount**~~ — **已通过 W11 evidence-query RPC bridge 解决**：`evidenceClient` 传入 SemanticLayerShell，`useEvidenceMetrics` 读取真实 evalRunCount。验证 session prompt: `prompts/remaining-3-shell-autoflip-verification.md`
- ~~**Evidence-query push 订阅**~~ — **毕业为 [R8](tickets/R8-evidence-query-push-subscription.md)**（2026-08-28）：research+grilling，blocked by [T2](tickets/T2-verify-management-panel-web-visibility.md)（确认管理面板 web 端实际可见）。

## Open tickets

### v1 收尾
- [G6: 定义版本管理](tickets/G6-definition-version-management.md) — grilling：开源项目是否自带 git 版本控制
- [R8: Evidence-query push 订阅](tickets/R8-evidence-query-push-subscription.md) — research 完成（Typert 原生 push 可行，0.5 天），待 grilling 决策时机

### Context Layer 对齐（CL 系列）
- [CL-1: Terminology aliases 迁移](tickets/CL1-terminology-aliases-migration.md) — **全部三 Phase 完成**（P1: `d36c5d7f9a`；P2: `91794aec4f`；P3: 2026-08-29）：schema+接口+数据迁移+图反向索引+resolve_term+hybrid 检索+AI enrichment（on-write hook + discover_alt_labels tool + eval 验证）。Code review fixes: score cap / CJK bigram / maxRelations。
- [CL-2: Domain/Concept 图节点](tickets/CL2-concept-kind-plugin.md) — grilling：ConceptKindPlugin 设计（blocked by CL-1）
- [CL-3: 检索策略实验设计](tickets/CL3-retrieval-strategy-experiment.md) — grilling：A/B/C 策略对比实验 + alias 质量验证机制（blocked by CL-1 Phase 2）
- [G7: Context Projection 统一](tickets/G7-context-projection-unification.md) — grilling：统一投射接口设计（blocked by CL-1 + CL-2，low priority）

## Out of scope

- dsh↔RBI 持续同步功能
- NL2SQL 引擎本身改进
- Query engine 内部实现
- Intranet / access isolation
- Ontology Phase 4（关系图谱可视化 + 基于命名约定的关系自动发现）— 不在本 map 目标架构之内
- 数据新鲜度监控（依赖 live-ODPS provider，P6b Q3 deferred；G4 Q6 确认出 v1）
- always-on 自主守护/巡检（goal 非后台守护进程；"打开会话不开工"是有意安全设计；需 scheduler 超出 goal 设计；G4 ③ 边界确认）
