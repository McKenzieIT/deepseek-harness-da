# wayfinder:map — dsh-data-agent 语义层

> 本地 Markdown tracker。子 ticket 在 `tickets/`，研究材料在 `research/`。本 map 是索引，不保存 open-ticket 状态或实施记录。

## Destination

将 dsh-data-agent 的语义层推进为端到端可用、可管理且可审计的生产能力：自然语言请求使用按 scope 隔离的语义定义和关系检索生成并执行查询；Web UI 管理定义、关系和质量证据；生产 Agent 与 evaluation 观察同一份 Context Projection 和 evidence identity；Ontology 关系、trust 和版本演化具备明确 owner 与验收路径。

当前实现是可用的语义目录和检索关系图，不是完整的 Ontology 执行层。Semantic Graph 是 Semantic Layer 的可视化，不再把 Context Layer 作为独立产品领域名称。

## Notes

- **域**：语义定义、scope、检索关系、生产 Context Projection、管理 UI、evidence 和 eval 驱动演化。
- **每会话应查 skills**：`dsh-plugin-development`、`grilling`、`domain-modeling`、`research`、`prototype`。
- **scope** 是用户定义的业务划分；namespace 或目录是隔离机制，二者不等同。
- **定义** 指 table、event、metric、concept 等语义记录；event/table/metric 与 concept 的实现和生产覆盖不同，不得用一种 kind 的完成度代表全部 kind。
- **状态所有权**：每个 child ticket 的 frontmatter 或 Status 字段是其唯一状态来源；本 map 不镜像 open、blocked、frontier 或 assignee。
- **Evaluation 所有权**：Benchmark、EvaluationStore、ArtifactStore、Context identity、ground truth、holdout 和 cutover 由 `wayfinder/evaluation/` 管理；本 effort 只保留语义层消费者和跨 effort 指针。

## Decisions so far

### Foundations and ontology

- [R1 — 语义层数据模型设计调研](tickets/R1-data-model-design.md): 采用类型化 kind plugin 与统一检索投影，避免把所有数据源压成单一 schema。
- [R2 — Ontology / 知识图谱全面调研](tickets/R2-ontology-comprehensive.md): Ontology 作为语义层关系能力演进，不引入独立外部系统。
- [R3 — Deepseek Harness 插件化设计调研](tickets/R3-harness-plugin-system.md): 语义层服务、工具和 UI 通过 Cordis plugin 与 Client UI Slot 扩展。
- [R4 — Schema Provider 插件化设计调研](tickets/R4-schema-provider-plugin.md): provider 注册与路由是设计方向；当前代码仍是单 setter 且没有生产 provider，不能把研究方案写成已实现事实。
- [R5 — Web UI 语义层管理界面调研](tickets/R5-web-ui-research.md): 管理面采用导航、搜索、详情和编辑的渐进式布局。
- [G1 — 语义层数据模型最终决策](tickets/G1-data-model-decision.md): 保留 per-kind 类型安全，并由 `DataSourceKindPlugin` 提供检索和提示投影。
- [G2 — Ontology 在 data-agent 中的角色决策](tickets/G2-ontology-role-decision.md): 关系图扩展语义层；joins、derived_from 和 related_to 不等于完整可审计 lineage。
- [P1 — Per-scope 配置机制实现](tickets/P1-per-scope-config.md): Cordis 配置定位 registry，运行时 scope registry 选择业务 scope；目录 namespace 仅承担隔离。
- [P2 — Ontology Phase 1: 关系声明 + In-Memory 图](tickets/P2-ontology-relations-graph.md): event、table、metric kind 和内存图支持检索与 join-path traversal；图邻接不保留完整语义方向或 provenance。
- [G3 — AI-Native Enrichment 工作流设计](tickets/G3-ai-native-enrichment-design.md): enrichment 结合确定性发现、可选 LLM 推断和 eval evidence，但自动保留或回滚仍依赖可信归因。
- [T1 — 手动导入 RBI K11 语义层定义 + AI-Native Enrichment](tickets/T1-seed-k11-definitions.md): K11 table、event、metric 数据和 DWS→DIM 关系已迁入；本 map 只保留这一条 T1 记录。
- [P3 — Ontology Phase 2: NL2SQL 集成](tickets/P3-ontology-nl2sql-integration.md): 关系图进入候选扩展、join prompt 和 warning 级 critic；它尚未成为 fail-closed 执行约束。
- [P4 — Ontology Phase 3: 指标计算引擎](tickets/P4-ontology-metric-engine.md): 虚拟 metric 可进入检索和 eval context；已删除 `execute_metric`/Level 2.5 路径，生产 formula grounding 仍不完整。
- [F1 — DWS→DIM 关系发现功能模块正式化](tickets/F1-dws-dim-discovery-formalization.md): 关系发现、可选 LLM wiring、hook 和 tool 已落地，置信度与审批门控仍由后续 evidence owner 决定。
- [R7 — Terminology 挂载点：是否作为知识图谱 ontology 存储和消费](tickets/R7-terminology-ontology-role.md): terminology 作为 aliases 进入定义与检索，不建立第二套 ontology store。
- [CL-1 — Terminology 统一到 Definition Schema（R7 方案 D 实现）](tickets/CL1-terminology-aliases-migration.md): 术语映射迁入 definition schema，并保留明确迁移路径。
- [CL-2 — Domain/Concept 作为图节点（ConceptKindPlugin）](tickets/CL2-concept-kind-plugin.md): concept 成为独立 kind；已有 asset domains 保留，不能把 concept 覆盖写成 table/event 的天然属性。
- [CL-2a — ConceptKindPlugin 实现](tickets/CL2a-concept-kind-plugin-implementation.md): concept 的存储、检索和关系投影已实现，但生产 graph expansion 仍需与统一 Context Projection 对齐。
- [W27 — 可扩展 Semantic Graph 投影与 concept 支持](tickets/W27-extensible-semantic-graph-projection.md): 开放 `RelationDef.type`、registry 驱动 `buildGraph`（plugin capability hook 替代硬编码 kind 分支）、`ctx.effect` 无条件缓存失效、`projectGraphNodes` 按 `includeMetrics` 门控、concept 进入真实 Graph Remote；client presentation registry 覆盖 node+relation kind 含通用 fallback；真实 Remote 装配证据经 `apps/web/tests/semantic-graph-remote.e2e.ts`（keyless 全栈 codec 往返）。独立 review 的 C1/I2/I3/I4/I5/I6/I7/I8 全部在 merge 前修完（详见 ticket Answer 补遗）。
- [G7 — Context Projection 统一接口设计（CL-3）](tickets/G7-context-projection-unification.md): definition-level `toPromptContext`/`toCriticContext` 统一保持 out of scope；该决定不取代 [Evaluation T13 的 request-level production Context Projection](../evaluation/tickets/T13-context-projection-service.md)。
- [R10 — Token/Attention/Cache 优化前沿调研](tickets/R10-token-attention-cache-optimization.md): prompt caching 降级为 provider-specific 待测假设；必须先观测 cache tokens、延迟和费用，不能继续称为零风险或固定节省约 70%。
- [R12: 语义层设计时效性、遗留项与 Ontology 结合审计](tickets/R12-semantic-layer-freshness-audit.md): 核心方向仍有效，但生产/evaluation 投影、lineage、trust、memory 和自演化闭环的完成度曾被高估；完整证据见 [审计报告](research/r12-semantic-layer-freshness-audit.md)。

### Management UI and lifecycle

- [R6 — Web UI 实现方案技术调研](tickets/R6-web-ui-implementation-feasibility.md): 采用 SchemaGateway 和插件化 UI，血缘可视化不作为 v1 完成条件。
- [W1 — SchemaGateway（ctx.schema Remote 投影）](tickets/W1-schema-gateway.md): 语义定义的只读 Remote 查询和检索投影已实现。
- [G4 — Web UI 功能范围与交互设计决策](tickets/G4-web-ui-scope-and-interaction.md): 管理面覆盖浏览、编辑、scope 和质量证据，自动演化保持 gated。
- [G5 — 管理 agent 交互范式设计](tickets/G5-management-agent-interaction.md): 管理 agent 使用独立会话和显式引用，不把编辑权限隐含在普通聊天中。
- [W5 — ui-semantic-layer v1 UI（B 布局）](tickets/W5-ui-semantic-layer-v1.md): v1 管理 UI 交付浏览、搜索、详情和编辑基础路径。
- [W5b — ui-semantic-layer UI 规范对齐](tickets/W5b-ui-convention-alignment.md): 原独立规范对齐票被后续布局演进取代。
- [T2 — 确认管理面板在 Web UI 中实际可见](tickets/T2-verify-management-panel-web-visibility.md): 真实 Web profile 验证了管理面入口和挂载路径。
- [W7 — 管理 agent preset](tickets/W7-management-agent-preset.md): 管理 agent 使用独立 preset 和工具集合。
- [W25: semantic-layer management preset persona config compatibility](tickets/W25-semantic-management-preset-persona-config.md): management preset 迁到当前 persona `prefix` schema，并通过真实 Web composition、工具调用和模型回合验证。
- [W8 — Sidebar trigger 重写](tickets/W8-sidebar-trigger-rewrite.md): sidebar 触发逻辑改为明确的产品状态，而非隐式组件副作用。
- [W9 — 核心 tool presenters](tickets/W9-core-tool-presenters.md): 核心语义工具具备 Host/Web 展示投影。
- [W10 — discover_relations presenter](tickets/W10-discover-relations-presenter.md): 关系发现结果可在管理 UI 中展示。
- [W11 — Evidence-query client RPC bridge](tickets/W11-evidence-query-client-rpc-bridge.md): UI hooks 使用 evidence client 接口，但后续真实 remote 装配由 W16 补齐。
- [R8 — Evidence-query push 订阅机制调研](tickets/R8-evidence-query-push-subscription.md): 采用轻量 invalidation 事件后主动 refresh，而非持续推送完整查询结果。
- [W15 — Evidence-query push 订阅实现](tickets/W15-evidence-push-subscription.md): eval completion invalidation 与客户端 refresh 已接线。
- [W16: evidence-query 客户端 remote 缺口 —— 证据 UI 在生产中是死的](tickets/W16-evidence-query-client-remote-gap.md): evidence-query remote 导出、API 装配和 UI 解析路径已补齐，真实数据可到达客户端。
- [W17: 管理 session 客户端桥接 —— 知识图谱闭环断在一个点上](tickets/W17-management-session-client-bridge.md): Management Context 按 Workspace 与 Data Scope 持久隔离，管理页复用标准 Session/Conversation，并以合并后的可扩展 Semantic Graph 完成引用与叙述后动画闭环。
- [W26: Management Context 解析与持久 Data Scope 绑定](tickets/W26-management-context-resolution.md): fork-owned `ctx.managementContext` 按 `(Workspace, Data Scope)` single-flight 解析为持久 Management Session，绑定通过 `sessionProjectionCache.write` flush 后返回，冷缓存恢复区分 unknown 与 confirmed no-match，跨进程 `dataScopeId` 使用 branded 类型。
- [W6 — ③ 自驱循环 + B→A 演进](tickets/W6-autonomous-goal-loop-and-btoa-evolution.md): goal、evidence 和布局演进被拆成独立插件；自动演化仍受 evidence 可信度限制。
- [W6a — goal-eval-policy plugin（no-progress backstop）](tickets/W6a-goal-eval-policy-plugin.md): no-progress policy 只消费明确 eval evidence，不拥有 evaluator。
- [W6b — goal-eval-context plugin（eval delta → round context）](tickets/W6b-goal-eval-context-plugin.md): eval delta 可进入后续 round context，输入必须可由 session 记录重建。
- [W6c — GoalDock in EvidenceSidebar](tickets/W6c-goal-dock-evidence-sidebar.md): GoalDock 与 evidence sidebar 组合而非替换会话 dock。
- [W6d — B→A 布局演进（路由 + 自动翻转）](tickets/W6d-btoa-layout-evolution.md): 布局路由和证据阈值驱动的切换已实现。
- [W6e — Management agent persona ③ 演进](tickets/W6e-management-agent-persona-evolution.md): persona 描述管理职责，不声明尚未接线的编辑或评测能力。
- [W12 — 删除过时 `semantic-layer-goal` 包](tickets/W12-remove-semantic-layer-goal-package.md): 目标机制归回通用 goal 能力，语义层不保留重复包。
- [W13 — ③ 自驱循环端到端集成验证](tickets/W13-autonomous-loop-e2e-integration.md): 已验证静态 wiring 和受控测试路径；真实 LLM happy path、管理 session 客户端桥接和 patrol 实际写入不在该结论内。

### Evaluation, retrieval, and evidence

- [W2 — Case-set port (C)（RBI 161 → da EvalCase）](tickets/W2-case-set-port.md): legacy cases 被移入 data-agent eval 输入；其长期格式与 provenance 由 Evaluation effort 接管。
- [W3 — Eval evidence engine + live wiring](tickets/W3-eval-evidence-engine.md): eval run 与 evidence 生产路径已接入语义层消费者。
- [W4 — Evidence-query backend（表现无关查询层）](tickets/W4-evidence-query-backend.md): evidence-query 提供 coverage、runs、delta 和 gap 查询，不决定 UI 选择策略。
- [G6 — 定义版本管理：开源项目是否应自带 git 版本控制](tickets/G6-definition-version-management.md): 定义版本使用审计记录和结构化 delta，不把工作区 git 作为运行时版本库。
- [V1 — 审计 structured delta](tickets/V1-audit-structured-delta.md): 定义变更以字段语义计算并写入 audit evidence。
- [CL-3 — 检索策略实验设计（A/B/C 对比 + alias 质量验证）](tickets/CL3-retrieval-strategy-experiment.md): 检索比较使用相同 corpus、query 和 top-k，并保留 alias protected slice。
- [CL-4 — 补充 alias-dependent eval case](tickets/CL4-supplement-alias-eval-cases.md): protected slice 覆盖必须依赖 aliases 才能召回的查询。
- [CL-5 — 检索策略覆盖率梯度实验实施](tickets/CL5-retrieval-gradient-experiment.md): 图扩展能带来候选增益；continuous blend 的默认最优性不再视为永久结论。
- [CL-6 — Tokenizer 修复 + Continuous-blend 生产实现](tickets/CL6-tokenizer-fix-and-continuous-blend.md): tokenizer 与当前 continuous blend 已实现，后续替代必须通过同条件复验。
- [CL-7 — 生产管线检索级实验](tickets/CL7-production-retrieval-experiment.md): 检索级收益与端到端结果分开报告。
- [CL-8 — 端到端 Eval 验证 + Go/No-Go 决策](tickets/CL8-e2e-eval-go-nogo.md): graph-assisted retrieval 保留，但实验结论不代表生产与 evaluation 已共享投影。
- [CL-9: Batch DWS alt_labels enrichment to 80%+ coverage](tickets/CL9-batch-enrichment-dws-coverage.md): DWS labels 扩充提高覆盖，同时暴露过度 enrichment 会稀释检索。
- [CL-10: Voice Eval Case 扩展 + Glob 修复 + 双模式 Eval 基线](tickets/CL10-voice-eval-case-expansion.md): voice cases 和 SQL judge 暴露真实语义、join、数据源与交付缺口。
- [CL-11: DELIVERY eval judge 校准](tickets/CL11-delivery-judge-calibration.md): DELIVERY judge 按语义对齐评分，reply 管道必须提供完整用户回复。
- [CL-12: SQL semantic judge 基线回归修复](tickets/CL12-sql-judge-baseline-regression.md): 不可回答案例与 SQL 质量案例分开处理。
- [CL-13: Voice compound query 多表 join 完整性](tickets/CL13-compound-query-join-completeness.md): compound queries 需要完整多表关系和 join evidence。
- [CL-14: 数据源缺口盘点与 enrichment](tickets/CL14-data-source-gap-catalog.md): 数据源缺失与语义标签缺失分开归因。
- [CL-15: sql-judge 模式确立为标准 eval 基线](tickets/CL15-sql-judge-as-standard-baseline.md): SQL semantic judge 成为 legacy 基线的一部分，但旧百分比不延续到新 Evaluation stack。
- [CL-16: Reply 管道二次修复 + DELIVERY 通过率提升](tickets/CL16-reply-pipeline-delivery-fix.md): evaluator 消费完整 reply，不再用内部 decline 诊断串代替用户回复。
- [CL-17: 数据源缺口 enrichment 第二轮](tickets/CL17-data-source-enrichment-round2.md): 第二轮 enrichment 完成后，剩余问题拆给 retrieval、formula 和 benchmark owners。
- [CL-18 — ds 噪声关联修复 + 确定性匹配算法加固](tickets/CL18-ds-noise-join-fix.md): partition columns 从关系发现中排除，降低 ds/pt/dt 噪声边。
- [CL-19: eval LLM 发射 tool-call 文本根因 + 修复定位（CL-16 Type-1 剩余）](tickets/CL19-eval-toolcall-emission-rootcause.md): tool-call 文本与 SQL、用户回复必须作为不同输出类型处理。
- [CL-20: DELIVERY Type-2 agent 行为（开放问题错误生成 SQL）](tickets/CL20-delivery-agent-behavior-type2.md): deliverable-kind 门禁只处理其已验证类别，不充当全部 open-ended case policy。
- [CL-22: eval 非确定性深查（-3pp / Alias -15pp / dup BM25 效应）](tickets/CL22-eval-nondeterminism-deepcheck.md): 决策比较使用 `pass_k=3` 的 attempt 语义与至少三轮 run 中位数；协议不同的结果不可静默比较。

### Runtime and ownership cleanup

- [CB-1: 冷启动 blocker —— 单行失败炸掉整个 data-agent include 组](tickets/CB1-cold-boot-blockers.md): duplicate id 和 enrichment 配置问题均已有 owner 与落地结果，母票关闭。
- [CB-1a: 冷启动稳定化落地（enrichment graceful degrade + include 失败自检）](tickets/CB1a-cold-boot-stabilization.md): 缺 enrichment model 时退化为 deterministic-only，并显式报告 include failure。
- [CB-1b: pwsh 在 PTY 下不 evaluate 表达式（GitHub macOS runner）](tickets/CB1b-pwsh-pty-evaluation-bug.md): 问题归入上游/平台测试 owner，不再阻塞语义层。
- [CB-2: enrichment LLM 配置改为 dsh-data-agent 设置项](tickets/CB2-enrichment-llm-as-settings-item.md): 产品设置面 deferred；boot 已由 CB-1a 解耦，需求成立时新开票。
- [CB-3: include 组的 per-row 失败隔离（评估，非立即实施）](tickets/CB3-per-row-fault-isolation.md): 保留事务式整组加载，以启动自检和 inventory 可见性止损；当前不实施 per-row 隔离，出现新的同形状事故后再开票。
- [CB-4: zod dep 移除导致 dsh-api-remotes client bundle 启动失败（master 回归）](tickets/CB4-zod-externals-drift.md): 客户端 runtime dependency 与 bundler module table 已恢复一致。
- [CB-5: DA 的 CI 寄生在上游 workflow 上（darwin 腿安装步骤膨胀的结构根因）](tickets/CB5-da-ci-upstream-boundary.md): CI 与 upstream workflow ownership 已迁到 Repo Infra T29。
- [CL-21: sql-judge 78% 推进——trim/概念formula/迁移（非 enrichment）](tickets/CL21-non-enrichment-levers-trim-formula-migration.md): 混合票退役；retrieval corpus、concept formula 和 benchmark migration 分属独立 owner。
- [CL-23: tool-call 检测 + 结构化拒绝合成（CL-19 修复落地）](tickets/CL23-toolcall-detection-and-structured-decline.md): tool-call detection 与结构化 decline signal 已完成，剩余 synthesis 和 evidence acceptance 已移交。
- [CL-24: 模型伪回复被当 SQL（CL-23 衍生 / CL-19 同族）](tickets/CL24-pseudo-reply-as-sql.md): response parsing 与 evidence acceptance 迁到 Evaluation T15，不在 legacy engine 增加 prose heuristic。
- [CL-25: open_ended case set 期望行为不自洽（CL-20 毕业）](tickets/CL25-open-ended-case-set-consistency.md): ground-truth、refusal reason 和 case migration 迁到 Evaluation G1b/T14。
- [CL-28: `contextPrefetched` 掐掉了 grounded 拒绝合成的入口 → DELIVERY 回吐 16pp](tickets/CL28-contextprefetched-decline-synthesis-entrypoint.md): 旧入口修补被统一 decline evidence/synthesis 决策取代。
- [CL-27: CL-20 门禁对每个查询无条件多调一次 LLM —— 代价是否可接受](tickets/CL27-triage-unconditional-call-cost.md): canonical controller 的 cutover 与 performance owner 接管该问题。
- [CL-29: eval 产物被 gitignore → 基线会蒸发，趋势对比与 ≥3 轮协议失去物质基础](tickets/CL29-eval-artifact-persistence.md): EvaluationStore、ArtifactStore 和 retention policy 接管运行证据持久化。
- [R11: eval 切换 buildEvalPrompt 实验](tickets/R11-eval-prompt-switch-experiment.md): 私有 eval prompt 分叉被 production Context Projection 与 attribution 路线取代。
- [A21: 语义层地图与 session prompt 清理](tickets/A21-map-prompt-hygiene.md): 旧 prompt 已归档，状态漂移已关闭或迁移，map 恢复为索引。

## Not yet specified

- 第二个生产 schema provider 出现后，多 provider 的优先级和同 engine 冲突策略需要重新形成精确问题；首个 provider 不预设计该机制。
- Organizational Memory 需要独立 capability owner，至少覆盖跨 session provenance、事实替代和冲突；session goal 不承担该语义。
- Query-time subagent enrichment 的权限、预算、写回和 evidence 规则尚不足以形成单一 ticket。
- Prompt caching 仅保留 provider-specific 测量方向；在 provider、消息块接口和 cache telemetry 明确前不创建实现票。
- Management Context 的 durable 绑定尚未约束工具执行入口；跨 scope 写入与 scope 删除后的工具拒绝需要独立 fork-owned 执行入口 owner，且须与 W22 patrol 写入职责协调。

## Out of scope

- 独立 ontology server、完整 SKOS/OWL 兼容和通用组织知识库。
- 恢复已删除的 `execute_metric` 或 Level 2.5 确定性 metric 执行路径。
- 在 semantic-layer 内扩展 legacy eval JSONL、复制 evaluator、定义 Benchmark lifecycle 或保留旧 runner；这些职责属于 Evaluation effort。
- 在本 map 内修复仓库级 CI、文档 catalog 或测试隔离问题；它们迁到 Repo Infra 或对应 owner。
