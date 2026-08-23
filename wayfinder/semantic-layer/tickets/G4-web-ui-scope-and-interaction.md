# G4 — Web UI 功能范围与交互设计决策

**Type**: grilling
**Status**: Closed
**Blocked by**: R6

## Question

语义层 Web UI v1 的功能范围、交互设计和优先级如何确定？

## 待决策

1. **v1 功能范围**：R5 调研了 6 类能力（浏览/搜索、编辑、scope 管理、质量监控、血缘图、指标预览）。v1 做哪些？
   - 最小可用 = 浏览 + 搜索？
   - 还是必须含编辑才有实际价值（当前定义只能改 YAML）？

2. **三栏 vs 两栏**：
   - R5 推荐三栏（导航 + 列表 + 详情抽屉）
   - 在 dsh 现有 Web 壳中，是否有空间限制？是否用弹窗/路由页面代替抽屉？

3. **资产分类维度**：
   - Domain-first（顶层按 domains 分组，map 决策 scope = 纯 namespace）
   - Kind-first（tables → events → metrics，当前 registry 3 plugin 结构天然支持）
   - 哪种作为左侧导航主轴？另一种退为 filter？

4. **搜索体验**：
   - 复用现有 `tool-search-data-sources` 的 BM25Linker？
   - 还是需要独立的 UI 搜索后端（Cmd+K 全局搜索需要 <100ms 响应）？

5. **编辑权限模型**：
   - 谁能编辑定义（开发期无用户系统 → 所有人都能编辑）？
   - 编辑走 Tier-2 audit（已有基建）还是 Git PR 流？
   - 是否需要 draft/publish 工作流？

6. **质量监控的 v1 形态**：
   - 覆盖率指标（已有 `confirmation.status` 字段：draft/confirmed）
   - 数据新鲜度（需要 ODPS 查询，当前 `freshness` 字段为空）
   - v1 只做前者（本地可算），后者延后？

## 上下文

- Map 决策：Web UI 核心场景 = 浏览/搜索 + 编辑 + scope 管理 + 质量监控
- R5 完整调研：三栏布局 + Domain 导航 + 多视图切换 + 详情抽屉
- 无兼容负担、无用户 → 可大胆设计，不需要渐进式改造
- 当前数据量：K11 scope = 321 tables + 445 events + 3916 metrics

## Resolution

G4 经 /grilling + /domain-modeling 与用户逐项敲定。Web UI 从"6 个 UI 决策点"被 reframe 为**"语义层管理 agent 的架构设计"**——UI 是该 agent 的表面。以下为敲定的领域语言、架构、6 决策、v1 范围、基建处置。

### 领域语言（ubiquitous terms）
- **管理 agent（management agent）**：改善语义层的 agent，goal-orchestrated，目标提升语义层质量。区别于"数据 agent"。
- **数据 agent（data-agent）**：回答 NL2SQL 的 agent，pipeline-orchestrated（四阶段）。已存在。
- **证据 / evidence**：语义层改动"变好还是变差"的测量 = eval 的产出。
- **证据基建（evidence substrate）**：跑数据 agent case 集、产出 before/after 证据、记 delta 的基建（= v1 ①）。
- **tiered evidence**：per-mutation 结构性证据（便宜即时）+ per-batch 质量证据（eval 全量、round 边界触发）。
- **③ 自驱循环**：管理 agent 用 eval 证据自校准朝 goal 推进的循环（autonomous goal loop）。

### 架构（核心决议）
1. **Web UI = 独立完整管理界面**，非 CLI 补充；用户在 Web 拥有全部能力。目标 = 理解数据资产 + 通过 LLM 辅助管理优化提升语义层质量。
2. **语义层管理 = 一个 agent**。管理 agent = **dsh goal ⊕ eval/evidence 层**（互补非二选一）：
   - goal（已有：`ctx.goals` + goal-round-driver + tool-goal + ui-goal GoalBar）= 持久化目标 + continuation + 生命周期；**不含完成判断**（goal note 明确 "completion certificate deferred to a policy consumer"）。
   - eval/evidence 层（须建）= 填 goal 留的完成证据缺口 = "变化有无变好"的信号。
   - 组合：eval 在 round/batch 边界产出 before/after delta → 喂管理 agent 下一 round context + 作 block 依据（连续无改进 → block `no-progress`）。
3. **管理 agent（goal）vs 数据 agent（pipeline）不冲突**——不同 agent，eval 桥接：管理 agent 改语义层 → eval 跑数据 agent case 集 → 准确率 delta 喂回管理 agent goal。G1 的 pipeline-vs-goal 是数据 agent 内部编排选择，不影响管理 agent 天然 goal 形态。
4. **③ 自治边界**：goal = 同会话、人类门控、模型自判完成，**非后台守护**。"打开会话不开工"是有意安全设计。always-on 巡检/定期**不进 v1**（需 scheduler，超出 goal 设计）。

### 6 决策点
- **Q1 v1 范围**：browse/search + edit + coverage **整体交付**（不拆 v1-a/v1-b）。血缘图 / 新鲜度 / 指标预览 out of v1。
- **Q2 布局**：v1 = **B（资产为首 + 证据侧栏）**；③ 后向 **A（dashboard-hero）** 演进。4 条 v1 演进约束钉死（证据=可提升模块 / 落地路由可切换 / 共享 evidence-query 后端 / 资产工作区可深链）；B→A 演进作 ③-gated ticket（W6）。
- **Q3 分类主轴**：nav **domain-first + kind 二级**（table 下再 dws/dim）+ **kind filter**。domain 为一等概念、所有 kind 带 `domains`（多对多）；metrics 占 83% 故须 domain 作二级吸收体量。
- **Q4 搜索**：v1 = 工作区搜索框 + faceted filter（kind/domain/status）；**Cmd+K v1.x**。后端复用 Bm25Linker 经 SchemaGateway（R6 已定，<100ms）。
- **Q5 编辑权限**：开发期无用户 → 所有人可编辑；**直接写 + Tier-2 audit（已有基建，D5 不可关）**；**无 draft/publish**（G3）；LLM 推断写入标 `unreviewed` 异步人工审；人类 inline-edit 即写 + audit。
- **Q6 质量监控**：coverage = **KPI 卡 + 资产 badge**（两者）；eval 证据轨迹 = per-batch before/after delta + 历次轨迹，呈证据侧栏（B）/ dashboard（A 后）；**新鲜度 deferred**（live-ODPS provider，P6b Q3）。

### v1 范围（被 reframe 扩展：原 v1=UI → 现 v1=①+②）
- **① 证据基建**：P11c runner/持久化 + delta + case 集 port(C) + live wiring + health-gate + 2 wiring caveat。
- **② 人驱管理面**：browse/search/edit/coverage + 手动 enrichment + 按需 eval + 证据 dashboard。
- **③ 自驱循环 deferred**（同 map，W6，③-gated）。

### 基建处置（eval）
- **复用 `packages/eval/eval` 核心，不重构**（pass_k anti-flakiness / 基建故障分类 / 执行重跑确定性 / H1·H2 mitigation / 零缝注入 均已固化）。
- v1 工作 = 在核心之上建层：P11c runner/持久化/报告 + delta + case-set port + live wiring + health-gate。
- **2 wiring caveat**（接 live 时验证，可能小调 adapter 非 core 改）：(a) H1 单 assistant/message 断言 vs 四阶段 agent（一个 interval 可能 >1 条）；(b) `SQL_KEYS=['sql','generated_sql']` vs 语义层 agent 查询工具 arg 名。
- **eval 跑全量**（全 161 case，不做 affected-case 子集——catch side-effects，接受成本）。
- **case 集 = C**：复用 RBI 161 port 成 da `EvalCase` 为主 + 针对未覆盖资产补少量 case；覆盖外资产诚实标"仅结构性证据"。

### Map 归属
- **①②③ 全在语义层 map**（G4 所在）；③ 为该 map 后续阶段。
- 跨 map 复用（非迁移）：eval 核心库（data-agent map P11）、RBI 161 case 集（data-agent map G1）、goal 机制（data-agent map）。
- **P11c runner/持久化 = 真正共享新资产**，谁先建谁拥有（可能 data-agent G1b 与语义层 W3 共用）。

### Out of scope（本决议新增/确认）
- 血缘图可视化（React Flow，map Phase 4 已 OoS）。
- 数据新鲜度监控（live-ODPS provider deferred）。
- always-on 自主守护/巡检（goal 非守护进程；需 scheduler，超出 goal 设计）。

### 毕业的实现 ticket（原 fog「Web UI 实现阶段具体 ticket」→ W1-W6）
- W1 SchemaGateway（ctx.schema Remote 投影）
- W2 Case-set port (C)（RBI 161 → da EvalCase）
- W3 Eval evidence engine + live wiring（复用 packages/eval/eval 核心）
- W4 Evidence-query backend（表现无关查询层，演进约束 #3）
- W5 ui-semantic-layer v1 UI（B 布局 + 4 演进约束）
- W6 ③ 自驱循环 + B→A 演进（③-gated，deferred）

Blocking 边：W1、W2 无前置（并行根）；W3←W2；W4←W1（+与 W3 coordinate result schema）；W5←W1+W4；W6←W3+W4+W5（v1 ①② 栈完成）+ goal（已有）。
