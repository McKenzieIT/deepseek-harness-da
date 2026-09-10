# G10 — Harness Benchmark/Harness/Environment 拆分

**Type**: grilling  ·  **Status**: claimed · **Research readiness**: ready（2026-09-10）
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: 无（[R10](R10-harness-goodhart-papers.md)、[R10b](R10b-harness-measurement-validity.md) 与 [R10c](R10c-context-layer-evaluation.md) 已 resolved）
**Blocks**: T9-bhe-split-impl、[T12](T12-eval-package-consolidation.md) 题面重定；为 [R21](R21-goodhart-audit.md) 提供 run/slice identity；并解 [G1](G1-exec-grader-seam.md) 移交的三条
**Mode**: HITL
**Branch**: `grilling/G10-harness-bhe-split`
**Supersedes**: GA-GT4 的架构面（`wayfinder/data-agent/tickets/phase-misc/`，须先调和）

## Question

`packages/eval/` 应如何切分为 Benchmark（评测内容）/ Harness（运行时）/ Environment（仓库适配），并由 composition root 装配独立版本化的 Context capability，使 benchmark 内容可版本化、harness 与具体 benchmark 无关、context 改进可归因、且 Goodhart 漂移可被 train/heldout/fresh 的对比检出？

## 决议（逐轮追加）

### 裁决口径 — 以一手研究支持的目标架构为准

本票以已核验的一手研究、measurement validity 与本仓 capability 约束设计目标结构；现有 package、schema、runner、配置和结果格式只作为迁移输入与失效证据，不构成兼容边界。可以重构或删除不再合适的实现，但必须保留可审计的 provenance、parity evidence、失败语义与重新起锚要求；“更新”本身不构成采用理由。

### D1 — 正确性语义归 Benchmark，grader/comparator 机制共享

Benchmark Pack 拥有并版本化 reference/oracle、comparator policy、grader policy 与 aggregation semantics；共享 evaluation library 只实现 normalization、comparator 与 grader 的通用机制，且不得在 `run()` 或 comparator 内隐藏 benchmark 默认值。

Composition root 必须在运行前把 Benchmark 的 authoring policy 显式解析为不可变、带 digest 的 `ResolvedGradingPlan`；grader 运行时只能消费该 plan，不得再次查配置、补默认值或动态选择 comparator。受控 grading entry point 读取 private grading material 与 run evidence 后产出 verdict；Harness 只接收 public task material，不读取 private material，也不决定正确性；Environment 只返回执行事实。此决定采用 R10/R10b 的 Benchmark ownership、frozen run identity 与 private-material isolation 约束，并以本仓“一能力一实现”和显式 resolution 作为落地选择。

### D2 — Public task 与 private grading material 以 opaque reference 隔离

Canonical protocol 分别定义 `PublicPreparedTask` 与 `GradingMaterialRef`；Harness 只能接收 public task 与不可解引用的 private-material reference，只有受控 grader provider 可以读取 reference SQL、expected、hidden tests、solution 与 grading secret。普通 run evidence、日志和错误不得展开 private material。

隔离部署按风险分级：开发与公开 train 可以使用同进程 provider，但不得声称秘密隔离；heldout/fresh 默认由同机独立 grader 进程解析 private material；Harness 或模型工具可执行不可信代码时，grader 与 private material 必须进入无共享私有挂载的 OS sandbox。远端机器不是协议要求，部署方式不得改变 public task、reference 或 grading result schema。

### D3 — Canonical case 以浅层 manifest 为聚合根

永久 case model 以 `CaseManifest` 为唯一 identity，引用独立的 public material、private material、grader policy、Environment requirement 与 Context requirement；引用携带 branded id、revision 与 content digest，且不得形成任意递归图。Pack 级定义承载可复用 policy 和 requirements，compiler 将 manifest 解析为 `PublicPreparedTask`、`GradingMaterialRef` 与冻结的 resolved plans；run evidence 使用独立 schema，不写回 case。

`k11-v2` 与 `rbi-10000251-exec` 都是仓内生成的 legacy migration input，不保留为永久 authoring/runtime schema。迁移须证明字段保存、oracle/reference validation、matched parity 与逐 case 状态，完成后正常运行路径拒绝旧格式；面向真正外部 benchmark 的 adapter 仍是一等、具名且版本化的模块。

### D4 — Case 显式引用 Pack 内具名 policy 与 requirement profile

Benchmark Pack 定义可复用、具名且版本化的 grader policy、Environment requirement 与 Context requirement profile；每个 `CaseManifest` 必须显式引用其使用的 profile，不得通过字段缺失继承影响 correctness、model-visible input、Environment 状态或 Context 内容的 Pack 默认值。作者工具可以提供生成期 shorthand，但提交的 manifest 必须包含明确引用。

Compiler 在运行前解析引用、拒绝缺失或不兼容组合，并生成带 profile revision 与 content digest 的 `ResolvedGradingPlan`、`ResolvedEnvironmentRequirement` 和 `ResolvedContextRequirement`；run identity 保存这些 resolved identities。

### D5 — Benchmark 声明 requirement，composition root 解析 deployment binding

`CaseManifest` 只显式引用 Benchmark 拥有的 Environment/Context requirement profile，不保存 provider、project、credentials、目录或服务实例。Deployment profile 提供可用 Environment 与 Context binding，composition root 在 Harness 启动前完成唯一匹配、兼容性验证和 preflight，并冻结 `ResolvedEnvironmentPlan` 与 `ResolvedContextPlan`；binding 中只保存 credential reference，不保存 secret。

不得使用 case、Pack、CLI、环境变量和硬编码值之间的通用覆盖顺序；无匹配、歧义或冲突均使 configuration invalid，且不创建模型错误记录。Run provenance 同时保存 requirement identity、binding identity、实现与内容 digest 以及运行中实际观察到的资源 identity。`scopeId`、`defaultProject` 与 `semanticRoot` 分别归入 Environment 或 Context binding，不再是 Harness 的平铺配置。

### D6 — Evaluation Core 面向数据领域，DataScope 是逻辑数据项目

Evaluation Core 的首版范围覆盖数据工程、数据分析与数据科学共享的 Benchmark、Case、identity、lifecycle、evidence、grading、Environment 和 Context 协议，不预先适配 code、medicine、Web 等非数据领域。Data analysis 是首个完整 production extension；data engineering 与 data science 各提供一个轻量 conformance fixture，用于拒绝 SQL、rows、MaxCompute 或 semantic-layer 成为 core 的隐含前提。

`DataScope` 是逻辑数据项目 manifest，拥有 branded identity、tenant/display metadata，以及允许的 Environment binding、Context binding、dataset catalog 与 governance reference；它不拥有 credentials、物理路径、运行时默认选择，也不等于 `@deepseek-ai/dsh-scope` 的 Cordis registration scope 或 MaxCompute `project`。K11 仅是一个 legacy `DataScope` 实例和迁移/parity fixture，不再作为通用示例或架构术语。

### D7 — Core 固定 evidence envelope，数据子领域注册 payload

Evaluation Core 只拥有 evidence identity、run/attempt/task correlation、producer identity、schema version、artifact references、durability 与 access classification，并通过 merge-extensible `EvaluationEvidenceMap` 接受命名空间化、独立版本的 payload。Data analysis、data engineering 与 data science extension 分别拥有 query、pipeline、data-quality、dataset、experiment、model 和 metric 等领域 evidence；Core 不建立 SQL 或假想的全数据领域 closed union。

Core 只标准化 outcome、duration、cost、finality、artifact changes 与 failure attribution 等跨领域 projection。未知 required evidence 使读取失败；只有生产者显式标记为 ignorable 的扩展 evidence 可以跳过。首版完整实现 data-analysis payload，data-engineering 与 data-science 各用一个轻量 conformance fixture 证明扩展与 persistence 路径。

### D8 — Core 同时拥有 lifecycle 与通用 measurement metadata

Evaluation Core 在 lifecycle envelope 之外定义独立的 `MetricObservation` 与 `AggregateMeasurement`：统一记录 metric identity、measured subject/population/partition、direction、raw value、replicate、grader provenance、estimand、aggregation、input observations 与 uncertainty。具体 metric 公式、threshold、rubric、有效性证据与领域 payload 仍由 Benchmark 和子领域 extension 拥有。

Evidence 不必产生 metric，metric 也不得压缩为无类型 `score`。不同 metric 默认不可比较；只有 metric identity 与 run compatibility key 均满足声明规则时才允许计算 delta。Aggregate 必须可追溯到 raw observations，并区分 standard `pass@n`、strict `pass^k`、best-of-k 与 final submission。

## G1 移交的三条（本票必须裁定）

[G1](G1-exec-grader-seam.md) 于 2026-09-07 锁定了 6 条**架构无关**的 execution grader 决策，并把以下三条**架构相关**的移交本票——G1 明确不裁，以免 T1 落地后被本票重切：

1. **grader 与 comparator policy 落在哪个包。**
2. **case schema 归谁拥有** —— `match_modes` 的 5 枚举 → R1 §4.2 policy object 的迁移路径。
3. **`k11-v2`（168）与 `rbi-10000251-exec`（39）两套 schema 如何合流** —— 或明确决定长期并存。

## 本票同时要处理的

- **de-K11 架构答案** —— 建立 data-domain Evaluation Core，使 `eval-runner` + `MultiTurnSession` 不依赖具体 DataScope 或 benchmark；K11-v2 与 RBI 只作为迁移/parity fixtures。未定义的 `LiveK11` 不构成架构要求；dynamic/fresh/canary lifecycle 在核心 identity 固定后另行裁定。此项 supersede GA-GT4 的架构面，**须先与 GA-GT4 调和**再动。
- **Goodhart Δ** —— `compare.ts` 输出 K11-train vs heldout vs fresh 的差值；Arena-Hard 式 style control + separability + 95% CI；dye-pack sentinel。当前**既无 heldout 也无 fresh slice**（见 R10 事实 ⑥）。
- **重构编排顺序** —— map §Not yet specified 的第一块 fog：已确定该删的（core 死编排 + 两份 adapter fork）与包重切，是「先删再切」还是「切的时候一并删」。

## 2026 follow-up 要补进决策的硬约束

完整一手认读见 [`harness-measurement-validity-papers.md`](../research/harness-measurement-validity-papers.md) 与 [`context-layer-evaluation-role.md`](../research/context-layer-evaluation-role.md)，前置侦察见 [`g10-2026-followup-papers.md`](../research/g10-2026-followup-papers.md)，学习导读见 [`g10-learning-guide.md`](../research/g10-learning-guide.md)。本票锁接口时必须逐项吸收 R10b 的 measurement-validity 约束与 R10c 的 Context ownership/attribution 约束，并把 benchmark-specific choices 留给 pack policy。

- **Benchmark Adapter 是正式模块**：legacy source schema 通过具名、版本化 adapter 编译到 canonical task material；每个 adapter 需要 upstream parity、oracle/reference validation 与 provenance-preservation 证据。
- **Task material 与 run evidence 分 schema**：Benchmark 拥有 instruction、hidden expected/reference、environment requirements 与 grader policy；Harness 运行结果拥有 model/harness/adapter/environment identity、raw→parsed→executed→observed stages、finality 与 isolation。
- **Interface preflight**：chat template、parser、tool schema 和 provider envelope 的组合不兼容时必须在跑批前失败，不能静默产出零 tool call。
- **Environment finality**：agent 停止输出不等于结果最终；pending side effect、namespace/reset/cleanup 和 cross-run separation 必须进入接口与证据。
- **双 provenance**：benchmark provenance 描述 case 来源与派生；run provenance 描述本次 model、Harness、Environment、elicitation budget、memory、tool/network access 与运行中反馈。
- **统计协议显式化**：Benchmark Pack 为结果声明 estimand、aggregation、tie/invalid/abstention、sampling/cluster unit 与 CI 定义；standard `pass@n` 和 strict `pass^k` 分开。
- **Judge 双向验证**：对语义等价变换保持 invariance，对最小实质错误具备 construct sensitivity；style control 不能替代 correctness sensitivity。
- **持久多轮状态**：`MultiTurnSession` 的评测证据包含 workspace/environment lineage、累计 verifier、artifact changes、regression 与 fail-stop outcome，而不只是 transcript。
- **Context 是独立 capability，不是第四 peer**：composition root 装配版本化 `ContextProvider`/projection；Benchmark、Harness 与 Environment 不各自复制 retrieval/projection。
- **Context ownership**：Benchmark 拥有 `ContextRequirement`、oracle/counterfactual 声明与 private ground truth；Context capability 拥有 semantic snapshot、ontology/relations、terminology、retriever/ranker 与 projection policy；Harness 只拥有请求时机和模型注入。
- **Context attribution**：run identity 增加 `contextIdentity`；component/counterfactual/perturbation/end-to-end 四层分别测 grounding、relation/composition、provenance、model utilization 与最终 outcome。
- **Context leakage**：gold-derived oracle projection 与 production score 隔离；动态 enrichment 写回形成新 snapshot，只对后续预声明 cohort 生效。

## Research readiness audit（2026-09-10）

**判定：G10 已有充分研究支撑，可以直接开始 HITL grilling；没有新的 blocking research。** 当前输入覆盖了 G10 的全部决策类型：

| 输入 | 已回答的问题 | G10 使用方式 |
| --- | --- | --- |
| [R10](../research/harness-goodhart-papers.md) | Benchmark/Harness/Environment 所有权、schema 合流与 Goodhart | 约束角色与 train/heldout/fresh 语义 |
| [R10b](../research/harness-measurement-validity-papers.md) | adapter parity、五阶段 evidence、preflight、finality/separation、frozen run identity | 约束 runtime protocol 与迁移验收 |
| [R10c](../research/context-layer-evaluation-role.md) | Context capability 的位置、`contextIdentity`、四层 attribution 与 leakage | 约束 Context seam，不把 context 收益误报给 model/Harness |
| [R24](../research/eval-package-consolidation.md) | 四个 eval 包的重复、依赖与合并爆炸半径 | 约束包重切与 T12 顺序 |
| [G1](G1-exec-grader-seam.md) | 六条架构无关 execution 决策与三条移交 | G10 只裁位置，不重开 execution semantics |
| [GA-GT4](../../data-agent/tickets/phase-misc/GA-GT4-eval-de-k11.md) | 当前 K11 hardcode 与旧 de-K11 scope | grilling 中调和：保留通用化问题，替换旧包边界答案 |
| [`data-engineering-evaluation-frontier.md`](../research/data-engineering-evaluation-frontier.md) | pipeline、schema migration、data quality、lineage、batch/stream state 与 artifact finality | 约束 data-engineering extension，并用无 SQL fixture 反证首个 data-analysis 实现泄漏进 Core |
| [`data-science-evaluation-frontier.md`](../research/data-science-evaluation-frontier.md) | dataset/split identity、experiment plan、notebook/model artifact、replicate 与 leakage | 约束跨子领域 measurement metadata 和 data-science conformance fixture |
| [`data-evaluation-frameworks-community.md`](../research/data-evaluation-frameworks-community.md) | 主流框架的 manifest、scorer、evidence、artifact、Environment 与 extension 机制 | 交叉验证稳定 envelope、子领域 payload、独立 artifact store 和完整 run identity |

2026-09-10 代码复核确认 GA-GT4 的核心 hardcode 仍在：`eval-runner-service` 仍默认 K11 caseDir/today 并使用 `^k11_\d+\.yaml$`，bundle 仍声明 K11 `semanticRoot`/`caseDir`，`compare.ts` 仍按 `k11v2_*` 名称分桶。R24 后 `packages/eval/` 只有一次测试 lint 删除，没有包边界或依赖变化，因此 R24 的仓库取证仍可作为 grilling 输入。GA-GT4 唯一过期项是“失败分类无人调用”：`multi_turn.ts` 已调用 `classifyExecutionFailure`，但多引擎 taxonomy 仍属方向 9/G9/T8，不能由 G10 顺手实现。

Grilling 前不需要先实现 heldout/fresh、跑新 baseline、完成 T1/T11 或执行 Context counterfactual；这些需要 G10 先锁接口。Grilling 会话应先读本节输入，再逐项裁定：owner/interfaces → canonical schemas/views → run/context identity → package topology → migration order → GA-GT4 supersession。

### 非阻塞研究候选

以下方向可能增强后续 protocol，但不改变当前 seam 决策，因此不阻塞 G10：

- **ClaimReceipt**（`2609.01992`，仅完成 arXiv metadata/abstract 核验）：committed experiment universe / evidence sufficiency/coverage receipt，适合在 T9 的 persistence/evidence 设计发生争议时再全文认读；
- **The Double Measurement Confound in Agent Benchmarks**（`2609.09218`，仅完成 arXiv metadata/abstract 核验）：scaffolding level / execution-critical decision ownership，G10 可先把 decision ownership 写入 run manifest，是否形成独立研究票取决于 grilling 是否仍有争议；
- Context counterfactual、perturbation/leakage 与 adaptive-ontology holdout：问题已由 R10c 识别，但准确 ticket 切分依赖 G10 的 Context projection seam 和 T1 execution grader，暂留 map fog。

## 已知约束（R10/R10b/R10c 提供论文依据，但这些是本仓实测事实）

- **不能简单合并 `dsh-eval` 与 `dsh-eval-runner`** —— 包外消费者在区分两者（`packages/data/tool-trigger-eval/src/index.ts:17` 取 runner 的 `RunResult`；`scripts/live-verify-w1-w5.ts:19` 取 core 的 `loadCases`）。
- **benchmark 内容当前住在纯库包内** —— `packages/eval/eval/cases/`，与 case schema 同包。这是最直接的 B/H/E 违例。
- **`dsh-eval-runner-service` 是 bundle 实际挂载的那个**（`packages/bundle/data-agent/cordis.patch.yml:197`），重切不能把它落下。
- **基线不可比** —— 61.9% pass^k 测在 `k11-v2`，12.8% 真执行测在 `rbi-10000251-exec`，后者 event 期望值 16/18 已失效。本票若移动 case set，须**明确宣布旧基线不可比并重新起锚**，而不是假装可比（map §⚠ 可复现性风险）。

## 验收

- 三条移交问题各有明确裁定 + 理由，且注明哪些依据来自 R10/R10b/R10c、哪些是本仓自主选择。
- 明确 Benchmark Pack、Benchmark Adapter、共享 eval protocol、Harness、Environment Adapter、Context capability 与 composition root 的接口和所有权。
- 为 `k11-v2` 与 RBI 迁移定义 `validated | parity_unresolved | invalid` 状态；验收同时覆盖 oracle/reference validation、matched original-vs-adapted parity、逐 case evidence、hidden-material isolation 与 schema preservation。
- 为运行定义 raw emission → parsed action → execution → observation → grader evidence 的可关联持久化，以及 `preflight_failed | interface_incompatible | auto_inconclusive` 的评分前失败语义。
- Environment interface 分别证明 outcome finality 与 cross-run separation：pending effect、namespace/stream、settle/cancel/finalize、verified reset/cleanup 和 `unresolved` 均有显式表示。
- Run identity 固定 Benchmark/Adapter/Harness digest、runtime model revision、template/parser/tool schema、Environment image/config 与 grader policy；heldout transfer 不跨 Harness commit 或 identity component 拼接。
- Context Layer 作为独立版本化 capability 装配；接口明确 `ContextRequirement`、typed projection、`contextIdentity` 与 request/projection evidence，且不允许 Harness/Environment 内联第二份 retrieval。
- Context evaluation 同时定义 component、no/schema/relations/production/oracle counterfactual、semantic-preserving perturbation 与 production end-to-end；oracle context 不进入 headline，动态写回不污染当前 heldout/fresh cohort。
- 为 Goodhart audit 定义 benchmark/run 双 provenance、train/heldout/fresh 生命周期、estimand/cluster unit、standard `pass@n` 与 strict `pass^k`。
- 与 GA-GT4 的调和结论写明（supersede 哪些面、保留哪些）。
- 产出或更新一篇 `.agents/notes/proposed/architecture/` Agent Note。
- 明确 T9-bhe-split-impl 的验收面，以及它与 [T1](T1-exec-grader-impl.md)、[T11](T11-loader-provenance-strip.md) 的落包顺序。

## 不在本票范围

- 实施重构（T9-bhe-split-impl）。
- 重开 G1 已锁的 6 条架构无关决策。
- comparator 默认值（[R23](R23-comparator-policy-mutation-baseline.md) 提供 mutation 证据）。
- event case 评分口径（GA-EVAL-CASESET-EVENT-ANCHOR）。
