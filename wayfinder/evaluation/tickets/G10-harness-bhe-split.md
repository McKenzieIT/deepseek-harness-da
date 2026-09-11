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

### D9 — Environment assurance 区分 managed、attached-snapshot 与 observational

Evaluation Core 允许受控和外部数据环境，但每个 run 必须声明并证明 `managed | attached-snapshot | observational` assurance。`managed` 保存 provisioned state、reset 与 isolation receipt；`attached-snapshot` 保存权威 snapshot、namespace、finality 与 separation receipt；`observational` 明确记录无法证明的限制。运行位置是同机、容器或远端不决定 assurance。

三类环境都可以产生 evidence 与带限定的 case observation；只有 `managed` 和具备 separation 证明的 `attached-snapshot` 可以进入正式独立-trial measurement，且不同 assurance 或不兼容 environment identity 不得合并。`observational` 只进入 production monitoring 与诊断，不进入 benchmark headline 或独立样本 CI。

### D10 — Product composition 与 component 是不同 Evaluation Subject

Evaluation protocol 将被测对象显式区分为 `product-composition | component`。Product Evaluation 必须加载并驱动真实 production profile、bundle、preset、DataScope 与 Provider composition，通过正常 Agent/SDK 入口经过 session、prompt、tools、approval、hooks、guards、workflow 和 persistence；Evaluation overlay 默认不得改变 model-visible input 或 control flow。任何 prompt、tool、approval、retry、hook、steering 或 stopping 差异都形成新的 Harness identity。

Component Evaluation 可以直接调用 engine、retriever、comparator、grader 或 adapter，并使用 synthetic dependencies，但只能支持对应 module/interface 的结论。两类 subject 共用 Benchmark、Evidence、Artifact、Grading 与 Measurement protocol，结果不得默认聚合或直接比较。`controlled-run | shadow-observation | rescore | reproject | model-rerun | environment-reexecution` 是独立的 operation identity，不得统称 replay。

### D11 — Environment 是独立 Cordis evaluation lifecycle Service

Evaluation Environment 形成完整的 Cordis Definition / Provider / Consumer seam。其外部 interface 只负责把 Benchmark requirement 与 deployment binding 解析为 `ResolvedEnvironmentPlan`，并为 attempt 打开 `EnvironmentLease`；lease 隐藏跨 Provider 的 resource correlation、finality、separation、assurance 与 cleanup，向 Consumer 暴露完成和清理结果。Evaluation Controller 是 Consumer，warehouse、pipeline 与 data-science lifecycle adapter 是 Provider。

Environment 不实现 query、filesystem、shell、workflow 或 notebook action，不选择具体业务 Provider，不拥有 DataScope、Context 或 grading semantics，也不要求生产 Provider 依赖 evaluation package。Agent 继续通过生产 `ctx.query`、`ctx.fs`、`ctx.workflow` 等 Service Definition 工作；Environment 只观察和管理本次 attempt 的已解析 Cordis Provider 图。该 Service 只由显式 evaluation composition 挂载，普通 data-agent 不依赖或感知它。

### D12 — Observer 与 Intervention 严格分离

Evaluation Observer 必须 scope-local、effect-owned 且只读，只能记录 session/capability/environment facts、artifact references 与 measurement inputs；它不得修改 model-visible input、waterfall 结果、Agent control flow、tool/provider behavior、approval、retry、steering、stopping 或 product policy。Observer identity 与 Harness identity 分开记录，并用 deterministic paired calibration 证明安装 Observer 前后的 model-visible events、requests、tool actions 与 terminal state 一致；观测开销单独留痕。

任何 prompt、Context、tool、model route、approval、retry、phase、feedback 或 stopping 变化都是显式 Intervention，并形成新的 Harness identity，不能继续声明 production-equivalent。运行前 required observer 不可用时 preflight 失败；运行中 observer/evidence sink 失败时 Agent 可正常结束，但 evaluation 标记 `invalid | evidence-incomplete`，不得归因为模型失败或产生正式 measurement。

### D13 — 一个 Evaluation Run 拥有一个冻结 DSH root

`EvaluationRun` 固定一套 resolved production composition 和一个 DSH root runtime，并包含零到多个 attempt-scoped Agent/session/Environment lease。首版同一 Run 内默认串行执行 Attempts；只有 Provider 与 Environment participant 证明 per-attempt namespace、scope-safe routing、credential/resource separation 和 cleanup ownership 后才允许并行。需要完整进程隔离时，一个 Run 只包含一个 Attempt，再为下一次尝试创建新 Run。

Run 开始后 plugin tree、Provider、preset/config、hooks、guards 与 package/source identity 不得静默变化；Loader/HMR 或 replacement 使 Run `invalidated`、停止创建新 Attempt，并禁止跨变化聚合。Run 完成必须等待 Agent owned work、session/evidence flush、Environment finality/cleanup、Evaluation overlay disposal 与 root quiescence，不能以 Agent idle 或模型停止输出代替。

### D14 — 正式 grade 绑定 persisted sealed EvidenceCut，发布遵循偏序条件

正式 `GradeRecord` 必须引用已成功持久化、sealed、内容可识别且 completeness 已验证的 immutable `EvidenceCut`；grader 不得读取 live Agent、可继续变化的 Environment 或未封口的 event stream。默认 grader 从 store 解引用 cut；同进程实现可以消费与 persisted cut 具有相同 canonical digest 的 sealed in-memory view，但 persistence 或 digest verification 失败时结果只能是 provisional diagnostic。原 evidence cut 不可覆写，每次 rescore 产生新的派生 GradeRecord。

Product subject 分别封闭权威 DSH `SessionEvidenceCut` 与模型不可见的 `EvaluationEvidenceCut`，后者引用 Environment completion、artifacts、Observer evidence 和 measurement inputs；component subject 使用自己的 cut，不伪造 Session。Model rerun 与 Environment re-execution 必须创建新 Attempt。Environment finality 决定 correctness label 是否 final，cleanup/reset 与 separation 决定 independent-trial eligibility；grade computation 与 cleanup 在 cut sealed 后可以并行，但 formal publication 必须等待 grading、coverage、finality 和所声明 assurance。Cleanup failure 保留已计算 grade，并按影响阻塞相应 publication claim。

### D15 — Immutable Artifact、External Resource 与 Snapshot Receipt 分离

Evaluation Core 分别定义 `ArtifactRef`、`ResourceRef` 与 `ResourceSnapshotReceipt`。Artifact 表示已冻结、可重新读取且 content-addressed 的 bytes，`contentDigest` 必填并由可替换 Artifact Store Provider 持久化；Resource 表示由外部 Provider 拥有、可能继续变化的 table、database、job、service、registry entry 或 path，本身不证明内容冻结。Snapshot Receipt 由 Environment/Provider evidence 声明某次 observation 的 snapshot identity、assurance 与适用 claim。

Sealed EvidenceCut 可以引用 Artifact 和 Resource Snapshot Receipt，但不得把裸 ResourceRef 当作完整评分证据。Rescore 只能读取 cut 中的 Artifact/observation evidence，不重新访问外部 Resource；任何 model rerun 或 Environment re-execution 都创建新 Attempt。Provider-specific snapshot 字段留在 receipt payload，不进入 Core 的通用 `version: string`；cut 中的 Artifact 与 receipt 不可覆写。

### D16 — Context projection 是生产级 Cordis capability

Data-agent 新增生产级 `ContextProjectionService` Definition / Provider / Consumer seam；正常 Agent 与 Product Evaluation 必须共用同一 `project(ContextProjectionRequest) -> ContextProjection + ContextProjectionEvidence` 路径。Service 在内部消费现有 schema、retrieval、ontology/relations、terminology、ranking、budget 与 serialization capabilities，拥有 snapshot/projection identity、selection provenance 和 model-visible hash，但不拥有 schema authoring、DataScope registry、Benchmark requirement、private grading material、Environment execution、prompt assembly 或 grader policy。

Evaluation 只声明 `ContextRequirement`、解析 Provider/profile identity 并观察正常 projection evidence，不重建 retrieval 或 Context prompt。No-context、schema-only、relations-only、production 与 oracle 是显式 Provider/config/Harness variants；hidden-derived oracle projection 不进入 production headline。该 seam 是产品重构，应有独立 implementation/parity 验收并在 T9 接线，而不是作为 eval-cli 私有 helper 落地。

### D17 — 首版只有外部 CLI/SDK Host，共享唯一 Evaluation Controller

首版由外部 CLI/SDK Host 启动并驱动完整 production DSH composition，所有 controlled runs 共用唯一 `EvaluationController` runtime；CLI 只负责参数、boot、输出和 process lifecycle。当前 `eval-cli` 与 `eval-runner-service` 内重复的 Query/LLM/Context adapters、responder、batch orchestration、K11 defaults 和 persistence translation 必须删除，不保留两套实现。

首版不发布或默认挂载 Cordis Evaluation Service Host；当前 `eval-runner-service` 由新 Controller/CLI 路径取代，`trigger_eval` 与 `goal-eval-*` 从普通 data-agent composition 移出。若未来 Web、scheduler、management 或 shadow evaluation 形成真实需求，再新增仅提供 run/get/cancel handles 的薄 Service Consumer，并只在专用 profile 挂载；它不得重新拥有 runtime、Context、Provider adapters 或 grading semantics。T12 的旧“eval-runner 并回 dsh-eval”题面据此重写为唯一 Controller 与薄 host 的 package 重组。

### D18 — Comparison Plan 显式声明 treatment，Core 保留不可关闭的安全底线

任何跨 Run delta、transfer 或 attribution 必须提供版本化 `ComparisonPlan`，显式声明 estimand、treatment factors、controlled factors、matching unit、inclusion/missing policy、aggregation 与 uncertainty；Core 依据完整 identity 拒绝 treatment 之外的意外漂移。没有 Comparison Plan 时只允许相同 Run identity 下的重复聚合，不从 case 名称或配置差异猜测实验意图。CLI 可以用经过验证的 model/context/harness/adapter/time-cohort template 生成 plan，但保存的是展开后的显式 artifact。

Core Safety Floor 不可由 plan 放宽：EvidenceCut/GradeRecord 有效性、metric semantics、analysis-unit compatibility、PublicationEligibility、hidden-material isolation 和 case/split coverage 必须满足。Oracle arm 不进入 production headline，observational run 不能被 plan 提升为独立 trial，不同 case set 不能伪装成 paired delta。

### D19 — Run identity 使用 content-addressed component graph

权威 `RunIdentity` 是无环的 content-addressed component identity graph；Benchmark、Harness、model/interface、DataScope、Environment、Context、grading、Observer、operation 与 extension 分别拥有 namespaced、versioned descriptor，root manifest 以稳定顺序引用并计算 root digest。Identity Provider 只输出影响语义且可审计的字段与非秘密 config digest；credential value、运行 observation 和可变状态不得进入 descriptor。Run sealing 后 identity 不可修改，Loader/HMR 或 component replacement 产生新 identity 并使当前 Run invalidated。

ComparisonPlan 针对稳定 component identities 与声明字段，不读取任意 Provider config。Core 提供确定性的 `materializeRunIdentity()` 生成自包含 JSON Artifact，供 CLI、审阅、归档与传输；materialized manifest 只是 graph projection，不是第二份可独立修改的权威身份。缺失、循环、digest mismatch 或未知 required identity descriptor 使 Run invalid。

### D20 — Evaluation Protocol 与 Controller 分包

共享 protocol 与 runtime orchestration 属于独立 package role。Evaluation Protocol 只拥有跨角色、跨进程或持久化所需的 branded identities、manifests、requirements/bindings、evidence、artifact/resource references、measurement、ComparisonPlan、GradeRecord、PublicationEligibility 与 schema/versioning；它不依赖 Agent、Environment、Context、Controller 或具体 data-domain extension。

Evaluation Controller 依赖 Protocol 和各 capability Definition，负责 resolve、open Run、drive Attempt、seal、invoke grading、cleanup、cancel 与 publish，但不拥有 Benchmark content、Context retrieval、业务 Provider、specific grader、Artifact storage 或 host rendering。Benchmark Packs、Environment、Context Projection、Grader、Artifact Store 与 SDK 只需依赖 Protocol；CLI/SDK Host 依赖 Controller。现有 `dsh-eval` 不作为聚合所有职责的 monolith 保留，T12 据此不再执行简单的 runner-to-eval 合并。

### D21 — Grading Runtime 独立于 Protocol、Controller 与领域 Mechanism

独立 Grading Runtime 负责验证 EvidenceCut、授权并解析 GradingMaterialRef、校验 ResolvedGradingPlan/mechanism identity、执行 grader lifecycle、分类 grader failure、生成 immutable GradeRecord，以及以 append-only provenance 支持 offline rescore。它不依赖 Agent、Controller、Context 或业务 Provider，并可在同进程、独立进程或 sandbox 中运行而不改变 protocol。

数据分析、数据工程与数据科学 extension 通过 namespaced、versioned registry 提供 SQL/result、report rubric、pipeline verifier、data-quality、dataset/model/metric 等具体 Grading Mechanism；Benchmark 显式选择 policy。Grading Runtime 可以提供 exact/set/bag/numeric/rubric composition 等领域无关 primitives，但不得包含 SQL normalization、pipeline semantics、Notebook/model metric、Benchmark defaults 或 hidden Context。Controller 只提交 grade request 并接收 GradeRecord/failure，不解释 correctness。

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
| [`dsh-evaluation-integration-constraints.md`](../research/dsh-evaluation-integration-constraints.md) | DSH/Cordis plugin tree、service injection、scope、effects、events、session、tools 与 lifecycle | 约束 Evaluation 复用真实 DSH composition，不创建第二套 agent loop、Provider 系统或 transcript |
| [`data-agent-runtime-preservation.md`](../research/data-agent-runtime-preservation.md) | 当前 data-agent 产品路径、默认 bundle、DataScope、Context、query、interaction 与 persistence | 约束 Evaluation opt-in、scope-local、行为不变，并识别默认 bundle 中 eval 控制逻辑的产品污染风险 |
| [`non-invasive-agent-evaluation-patterns.md`](../research/non-invasive-agent-evaluation-patterns.md) | shadow、trace replay/rescore、独立 evaluator 与 production composition under evaluation host | 约束 controlled、observational 与 replay 三种模式共用协议，但不向普通 Agent 注入 eval-only 行为 |
| [`evidence-cut-rescore-papers.md`](../research/evidence-cut-rescore-papers.md) | durable eval log、offline rescore、scorer input completeness 与 live-grade 边界 | 支持正式结果绑定 persisted sealed cut，但不把强制磁盘回读冒充论文要求 |
| [`durable-trace-replay-semantics.md`](../research/durable-trace-replay-semantics.md) | event history、checkpoint、OTel、content digest 与 replay/re-execution 区分 | 约束 Session/Evaluation cut 分离、stable read + digest，以及 model/environment rerun 使用新 Attempt |
| [`evaluation-publication-finality.md`](../research/evaluation-publication-finality.md) | finality、coverage、grading、cleanup、separation 与 publication 的偏序 | 约束 computed grade 与 publishability/independent-trial eligibility 分离，不强造固定全序 |

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
