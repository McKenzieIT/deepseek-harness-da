# R12 — 语义层设计时效性、遗留项与 Ontology 结合审计

> **Ticket**: [R12](../tickets/R12-semantic-layer-freshness-audit.md)
> **审查日期**: 2026-09-18
> **研究窗口**: 2026-08-18 至 2026-09-18（含）

## 结论

当前语义层的**核心方向没有过时**：定义注册表、业务别名、概念节点、关系扩展、按需工具调用和 eval 驱动改进，均与最近一个月的一手研究一致。

需要修订的是完成度和优先级：

1. 当前实现是**可用的语义目录 + 检索关系图**，尚不是完整的、可审计、可演化的 Ontology 执行层。
2. 生产 data-agent、`Nl2sqlEngine.run()` 评测路径、SchemaGateway 图投影和管理 UI 各自消费了不同的语义信息；地图把评测路径能力误写成了生产能力。
3. `Context Layer = Semantic Layer + KG + Glossary + Policies + Trust + Memory` 应标为项目采用的架构综合，不应继续写成 Forrester/Gartner 的统一正式定义。现有 R9 主要引用厂商文章和二手转述，证据级别不足以支撑“行业共识”。
4. R10 的“prompt caching 约节省 70%、零风险、P0”已经过时。data-agent 当前是 provider-agnostic；缓存标记、命中规则和计费收益依赖具体 provider，且字符串 `buildPrompt()` 不是可直接插入 Anthropic `cache_control` 的消息块接口。它应降级为 provider-specific 测量项。
5. Organizational Memory 的旧表述失效。session-scoped goal 是持久控制状态，但不是跨 session、带来源、能处理事实替代和冲突的组织记忆。
6. 现有 25 份 session prompt 均不应继续作为可直接执行的入口：23 份可直接归档；2 份应迁出 semantic-layer，其中只有 `test-isolation-flaky-fixes.md` 需要先用当前包名、测试路径和问题范围重写。

## 最近一个月研究带来的变化

以下资料均为论文、项目官方仓库或官方发布说明；arXiv 论文截至审查日仍是预印本，因此用于提出重新验证和设计问题，不直接替代本仓实验。

| 日期 | 一手来源 | 对当前设计的影响 |
|---|---|---|
| 2026-09-14 | [EvoOntology: A Self-Evolving Ontology Layer for Data Agents](https://arxiv.org/abs/2609.15779)，[代码](https://github.com/ruc-datalab/EvoOntology) | 确认“Ontology 通过工具供 agent 按需访问”和“eval 驱动演化”的方向；提高完成标准：schema/content/tool 三层知识、失败归因、typed edit、按 backbone 的 paired evaluation 后才接受变更。当前 G3/W6 只有其中一部分。 |
| 2026-09-15 | [Symbolic Separation: Grounding Deep Agents in Knowledge Graphs for Trustworthy Operational Data Analytics](https://arxiv.org/abs/2609.17107) | 支持把关系从 prompt 建议提升为确定性执行前约束。当前系统把 join path 注入 prompt，并把未声明 JOIN 记为 warning；这仍允许语义错误继续执行。 |
| 2026-08-21 | [Auditable by Construction](https://arxiv.org/abs/2608.20661) | 其负结果表明图检索未必比 BM25 更准确，但 ontology 可通过关系类型、confidence 和 source lineage 提供可审计性。当前 map 过度强调准确率，低估了 provenance 与可审计证据。 |
| 2026-08-22 / 08-24 | [GrOIL](https://arxiv.org/abs/2608.22135)、[Dynamic Ontology / OaK](https://arxiv.org/abs/2608.22974) | 确认任务导向 ontology、动态构建和受约束编辑；同时指出每个术语、关系和规则需要回到原始证据的决策链。当前 `pref_label`/`alt_labels` 和 `related_to` 是良好起点，但不是完整 SKOS/OWL 或可追溯 ontology。 |
| 2026-09-16 | [Quanta](https://arxiv.org/abs/2609.18248) | 直接挑战 CL-5 的精确融合公式：异构 BM25/图分数归一化后线性相加可能跨查询不可比；建议把图作为候选扩展器，再用内容检索重排，并与 weighted RRF 对比。CL-5 的“图能引入新候选”仍成立，但 continuous blend 不应继续被当成已定最优公式。 |
| 2026-09-17 | [Self-Evolving Search Index](https://arxiv.org/abs/2609.19656)、[Semantic Layer Induction from Raw Telemetry](https://arxiv.org/abs/2609.19615) | 支持选择性修订失败相关的索引项，以及 hybrid retrieval、多阶段噪声过滤、聚类和 canonical naming。它们强化 G3/CL-18 的方向，也要求将变更归因到具体 index key/definition，而不是只比较总体 pass rate。 |
| 2026-08-18 | [D²ACCI](https://arxiv.org/abs/2608.17756)、[Artifact-centered Claim-aware Observability](https://arxiv.org/abs/2608.18312) | 支持 paired comparison、protected slice、阶段级 trace，以及 claim→evidence→artifact→verification 的一等记录。V2/V3 和 CL-29 的正确承接点应是新的 EvaluationStore/ArtifactStore/ContextProjectionEvidence，而不是继续扩展旧 JSONL。 |
| 2026-08-20 至 09-13 | [StateMem](https://arxiv.org/abs/2608.19652)、[MemoryLACE](https://arxiv.org/abs/2609.03201)、[Scroll](https://arxiv.org/abs/2608.21690) | 组织记忆的核心不是“保存更多文本”或“一张全局图”，而是不可变事件、来源、事实替代、冲突关系、可恢复投影和当前状态解析。当前 goal/eval 不能算 Organizational Memory 的部分实现。 |
| 2026-09-01 | [OpenLineage 1.53.0](https://openlineage.io/docs/releases/1_53_0/) | 强化 dataset/field/job 关系和列级 transformation 表达。当前 `derived_from` 不是方向保真的表/列 lineage，应从“已覆盖”降为“仅有虚拟 metric 邻接”。 |

### 对既有决策的判定

| 既有决策 | 判定 | 修订 |
|---|---|---|
| R9 Context Layer 定位 | **方向保留，措辞过强** | 改为项目采用的架构综合；区分 context runtime、knowledge layer、context graph，不再归因于单一 Forrester/Gartner 定义。 |
| CL-1 terminology / aliases | **保留但降格** | 当前是 SKOS-inspired label convention，不是完整 SKOS：无 concept scheme、broader/narrower、语言标签和 provenance。 |
| CL-2 concept 一等节点 | **部分落地** | 数据模型和索引已落地；生产搜索、图 UI 和 typed projection 尚未完整消费 concept。 |
| CL-3/CL-4 检索实验 | **保留** | 覆盖梯度与 alias protected slice 有价值；应加入 paired evaluation、失败归因和生产分布切片。 |
| CL-5 continuous blend | **重新验证** | 保留图候选扩展；新增 weighted RRF 与“图扩候选、内容重排”的对照。 |
| G7 definition-level `project()` | **继续关闭** | `toPromptContext`/`toCriticContext` 仍无生产消费者；但不能据此否定 [Evaluation T13](../../evaluation/tickets/T13-context-projection-service.md) 的 request-level Context Projection Service。 |
| R10 prompt caching | **结论降级** | 从 P0/零风险改为 provider-specific 假设；先观测 cache read/write tokens、延迟和费用，再决定实现。 |
| CL-4 Trust Signals | **提高优先级** | 从远期字段扩展改为 ontology edit、retrieval 和回答的 provenance/auditability 设计。 |
| CL-5 Organizational Memory | **旧表述失效** | goal 是 session-scoped 控制状态；组织记忆需单独设计事实生命周期、来源、替代、冲突和跨 session 检索。 |

## Ontology / 知识图谱真实结合进度

### 已进入生产路径

- `event`、`table`、`concept` 三种 kind 已注册；concept、definition labels 和 aliases 进入全量 corpus 与反向 alias index。
- 表 `dimension_refs`、事件 `external_refs`、虚拟 metric `derived_from` 和 concept→asset `related_to` 会构建 `RelationGraph`。
- `search_data_sources` 使用全量 corpus、BM25、alias continuous blend、`joins`/`derived_from` 一跳扩展，并向模型返回 join constraints。
- `resolve_term` 直接查询 alias index 并返回图邻居。
- 生产 SQL critic 读取 live graph，并检测 candidate 间是否存在声明 join。
- SchemaGateway、EvidenceQuery 和客户端图视图已能消费部分 relation graph。

关键实现：

- [`SemanticLayerService` 注册 kind 并构图](../../../packages/data/semantic-layer/src/index.ts)
- [`RelationGraph`](../../../packages/data/semantic-layer/src/relation-graph.ts)
- [`search_data_sources` 的融合与图扩展](../../../packages/data/tool-search-data-sources/src/index.ts)
- [`resolve_term`](../../../packages/data/tool-resolve-term/src/index.ts)
- [`critique_sql_tool`](../../../packages/data/tool-critique-sql/src/index.ts)

### 只在评测或局部路径成立

- `Nl2sqlEngine.run()` 会对 `concept:` 命中展开 `related_to`，但生产 `search_data_sources` 只展开 `joins` 和 `derived_from`。
- `Nl2sqlEngine.run()` 会构建 metric context；生产 phase-gate 只把 metric host table 加入 critic 允许列表，没有等价的公式/口径注入。
- graph-expanded candidate 在生产 tool 路径中缺少 payload，concept 命中也会被归类为通用 `source`。
- `toPromptContext`、`toCriticContext` 仍只有定义和测试，没有生产消费者。

### 地图声称存在、当前实现已删除或从未完成

- 当前 registry 注册的是 event/table/concept，**不是** event/table/metric。
- `MetricKindPlugin` 不存在；metric 是从 table/event 的内联 `metrics` 虚拟投影出来的。
- `execute_metric` 和 Level 2.5 确定性 metric 路径已删除；`toExecutableRule` 仅剩未使用的兼容接口。
- `derived_from` 只表示 virtual metric→host 邻接；RelationGraph 把所有边双向存储，无法表达方向保真的 lineage，也没有列级或传递 lineage。
- `dsh-admin` 是独立访问控制，不是 ontology 内的 policy metadata。
- 没有跨 session 的 learned assertions、关系置信累积、事实替代或冲突处理。

### 当前成熟度

| 能力 | 状态 |
|---|---|
| Semantic catalog / definition registry | **已落地**，但 README 严重滞后，live SchemaProvider 未实现。 |
| Glossary / aliases | **已落地**，但只达到 SKOS-inspired labels。 |
| Join graph | **生产可用**，但主要是检索/提示/告警，不是确定性语义执行约束。 |
| Concept graph | **部分落地**，生产搜索和图 UI 投影不完整。 |
| Metric ontology | **部分落地**，虚拟 metric 可检索；生产公式 grounding 不完整。 |
| Lineage | **未形成能力**，只有方向被抹平的一跳 metric 邻接。 |
| Trust | **部分落地**，有 confirmation/eval；缺 provenance、真实 freshness、usage 和一致的状态统计。 |
| Policy | **相邻能力**，只有 ontology 外的 admin 权限。 |
| Organizational Memory | **未落地**。 |
| Self-evolving ontology | **未闭环**，有编辑、发现和 eval 组件，但缺真实自动编辑、可信归因和版本化验收。 |

**总体判断：Ontology 已进入数据模型、检索和 NL2SQL 辅助路径，但尚未成为统一、方向保真、可审计、可版本化、自进化的生产语义执行层。**

## 当前改造遗留项

### P0：会造成错误结论或生产/评测不一致

1. **生产与评测的图扩展实现合一**：生产补 concept `related_to` 和 payload projection，删除两套算法漂移。
2. **完成生产 metric grounding**：让真实 agent 获得 bounded formula/source projection；不能继续用 eval-only `buildMetricContext` 代表生产能力。
3. **实现 scope-aware `loadRetrievalCorpusAll(scopeId)`**：当前方法无参数并读取 active root；调用方传入的 `scopeId` 被 JavaScript 静默忽略。
4. **修复 trust 统计**：`tallyConfirmation()` 只认 `confirmed`/`rejected`，大量 `analyst_confirmed` 被算作 draft；`lastModified` 始终为空。
5. **补生产 SchemaProvider**：当前只有 `setSchemaProvider()` 和测试 `StandInSchemaProvider`，没有生产 provider；应先完成 MaxCompute provider 和 effect-owned 注册，再讨论多 provider 冲突。
6. **完成 W17 管理 session 客户端桥接**：图能显示，但 overlay 仍没有真实 messages/send/event source/reference insertion。
7. **修复 patrol 闭环的虚假成功**：`executeEdit()` 只发事件、不写 definition，却返回 `true` 并计入 `editsExecuted`；patrol-mode 也未挂入 bundle/preset。

### P1：可信演化与评测基础

1. **用 [Evaluation T13](../../evaluation/tickets/T13-context-projection-service.md) 收敛 request→projection+evidence**，使生产 agent 和 evaluation 观察同一路径。
2. **把 V2/V3 迁到新 EvaluationStore/ArtifactStore/context identity**；不要继续扩展旧 JSONL 基线。
3. **重写 W18**：原“双 store”假设已过时，当前问题是 Dashboard 未主动 fetch、case→asset provenance 缺失和 delta 选择逻辑。
4. **完成 W19**：`dashboard.title`、`dashboard.goToWorkspace` 仍未进入 typed locale dictionaries。
5. **把 CL-26 与 CL-28 合并为统一 decline evidence/synthesis 决策**，并等待旧 eval runner 的迁移结论。
6. **重新验证 CL-5 排序公式**：continuous blend 对 weighted RRF 和 graph-as-candidate-expander。
7. **设计 ontology auditability**：关系方向、predicate/constraint、source evidence、confidence、actor、version、validation record 和 hard/soft enforcement。

### P2：清理和远期能力

1. 关闭或迁移失真的 open tickets：CB1、CB2、CB3、CB5、CL21、CL23–25、CL27、CL29、R11。
2. V3 增加新 evaluation baseline、holdout、防反馈污染和 context identity blockers。
3. 补 query-time subagent enrichment 的真实设计；当前只有方向描述。
4. Organizational Memory 另建 capability seam；不要放进 goal，也不要默认等于完整知识图谱。
5. 缩减 map：删除重复实验记录、过时更正和 open-ticket 镜像；状态以 child ticket 为准。
6. 更新 `packages/data/semantic-layer/README.md`：其中仍写 tool package、bundle wiring 和 live provider 全部 deferred，并含 TODO Summary，与当前代码不符。
7. 修正 `packages/bundle/data-agent/README.md`：Summary 写“选择 DashScope”，但当前 patch 明确 LLM provider 是 deployment choice。

## Open ticket 审计

### 保留并优先处理

- [W17: 管理 session 客户端桥接](../tickets/W17-management-session-client-bridge.md)
- [W18: evidence UI 查询生命周期与 case→asset provenance](../tickets/W18-evidence-runs-list-data-store.md)，需重写题面
- [W19: DashboardView i18n keys](../tickets/W19-dashboard-i18n-keys.md)
- [V2: eval run changeset 标注](../tickets/V2-eval-run-changeset-annotation.md)，需迁到新 evaluation stores/context identity
- [V3: 细粒度 auto-revert](../tickets/V3-fine-grained-auto-revert.md)，需增加 baseline/holdout/contamination blockers

### 合并后保留

- [CL-26](../tickets/CL26-eval-runner-service-decline-synthesis-gap.md) + [CL-28](../tickets/CL28-contextprefetched-decline-synthesis-entrypoint.md)：合并为统一 decline evidence 与用户可见 synthesis 决策。

### 关闭、迁移或退役

- CB1：已有完整决策，CB1a 已落地。
- CB2：正文已决定 deferred，应关闭，满足重开条件时新建票。
- CB3：已决定不做 per-row，S2 已落地，应关闭为 deferred。
- CB5：迁出 semantic-layer，归 repo-infra/upstream-merge。
- CL21：拆为 retrieval corpus、concept formula、benchmark migration 三个不同问题。
- CL23：修复已落地，残余已转交后续票。
- CL24：迁入新 evaluation 的 response parsing/evidence acceptance。
- CL25：迁入 evaluation ground-truth/case lifecycle。
- CL27：迁入 evaluation cutover/performance。
- CL29：由新 EvaluationStore/ArtifactStore/retention policy 接管。
- R11：被 `contextPrefetched` 与新 context attribution 路线取代。

## Prompt 归档建议

审查范围共有 25 份 prompt。**没有一份可原样继续作为当前实现入口。**

### 直接归档

- 根目录：`W6-implementation-session-prompt.md`、`W6-ui-wiring-session-prompt.md`
- `prompts/CB1a-session-prompt.md`
- `prompts/CL11-14-session-prompt.md`
- `prompts/CL15-session-prompt.md`
- `prompts/CL16-17-session-prompt.md`
- `prompts/CL20-followup-session-prompt.md`
- `prompts/F1-session-prompt.md`
- `prompts/G4-session-prompt.md`
- `prompts/P3-session-prompt.md`
- `prompts/P4-session-prompt.md`（禁止复用已删除的 Level 2.5 / `execute_metric` 方案）
- `prompts/R10-session-prompt.md`
- `prompts/R6-session-prompt.md`
- `prompts/W1-session-prompt.md`
- `prompts/W16-session-prompt.md`
- `prompts/W20-session-prompt.md`
- `prompts/cl5-real-experiment.md`
- `prompts/next-session-parallel-4-tickets.md`
- `prompts/phase1-t1-enrichment.md`
- `prompts/phase2-nl2sql-metrics.md`（禁止复用已删除的 MetricKindPlugin/Level 2.5 方案）
- `prompts/remaining-1-schema-provider-conflict.md`（假设 `registerSchemaProvider`/`engineType` 已存在；应以“先实现首个生产 provider”的新票替代）
- `prompts/remaining-2-terminology-mount-point.md`
- `prompts/remaining-3-shell-autoflip-verification.md`

### 迁出本 map，并在重写后归档旧版本

- `prompts/da-compliance-audit-catalog.md`：repo documentation/catalog maintenance，不属于语义层路线。
- `prompts/test-isolation-flaky-fixes.md`：repo test reliability；旧 `acp-snapshot` 名称和 change-scope 前提失效，但 bash-local 生命周期竞争与 session-snapshot 并发超时仍需新 prompt 承接。

## 新增 decision / task tickets

本审计将以下问题从雾中具体化：

- [G8: Ontology 执行约束与可审计关系模型](../tickets/G8-ontology-execution-auditability.md)
- [CL-30: hybrid retrieval 融合策略复验](../tickets/CL30-hybrid-retrieval-fusion-revalidation.md)
- [W21: 生产 SchemaProvider 与生命周期注册](../tickets/W21-production-schema-provider.md)
- [W22: Patrol 真实编辑执行与 composition](../tickets/W22-patrol-real-edit-composition.md)
- [A21: 语义层地图与 session prompt 清理](../tickets/A21-map-prompt-hygiene.md)

## 地图需修正的事实

- Notes 中“scope ≠ namespace”与 Decisions 中“scope = 纯 namespace”互相冲突。
- T1 在 Decisions 中重复，且早期条目仍写 kind 未注册、无 live graph。
- `MetricKindPlugin + execute_metric`、表级 lineage、完整 concept graph-expand 均不是当前生产事实。
- R4 的 provider registry 设计没有落地；当前是单 setter 且无生产 provider。
- W13 不应再写成完整端到端闭环；真实 LLM happy path、W17 和 patrol edit 均未完成。
- `executionMatch` 与 pass^k 方差已在前文得到结论，却仍重复留在 Not yet specified。
- map 本身已从索引膨胀为实验记录和 postmortem；应恢复为“closed decision 一行 gist + child ticket 持有细节”。

## 推荐顺序

1. 修 W19；重写并处理 W18。
2. 推进 W17，同时修 patrol 的虚假成功与 composition。
3. 实现生产 SchemaProvider，并修 `loadRetrievalCorpusAll(scopeId)`。
4. 由 Evaluation T13 统一生产/评测 Context Projection 与 evidence identity。
5. 决定 G8 的方向保真关系、provenance 和 hard/soft enforcement。
6. 运行 CL-30，决定是否替换 continuous blend。
7. 完成 V2/V3 在新 evaluation store 上的归因与回滚。
8. 执行 A21，归档 prompt 并把 map 恢复为索引。
