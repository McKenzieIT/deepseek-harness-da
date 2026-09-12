# Data-domain Evaluation Core：一手框架与社区基础设施调研

日期：2026-09-10

## 结论先行

没有一个被核验的框架同时提供 DSH 所需的完整答案。最可信的目标结构需要组合几类已经在不同系统中落地的机制：AgentCompass 的 Benchmark/Harness/Environment/runtime 所有权拆分；Harbor 与 Harbor-Index 的任务包、独立 verifier、artifact collection 和 adapter parity；Inspect AI 的可注册 Task/Solver/Scorer/Sandbox 与细粒度事件日志；MLflow 的 trace/span、assessment、dataset digest 和 scorer version；以及 lm-evaluation-harness 与 HELM 对声明式 task/run specification 的长期实践。

对 DSH 的直接结论是：Evaluation Core 应限定在数据领域，但不能把首个 data-analysis 场景的 SQL、rows、warehouse 或某个 DataScope 写进 core。Core 应拥有稳定 identity、生命周期、evidence envelope、artifact reference、grading protocol 和 requirement/binding resolution；数据工程、数据分析、数据科学 extension 各自注册 payload、grader mechanism 和 Environment/Context capability。

“稳定 envelope + 子领域注册 payload”方向有充分社区依据，但不能照搬任何单一实现。Inspect 的事件 union 很丰富却由 core 封闭；MLflow 的 span/assessment 便于跨应用查询却不表达完整 benchmark/environment 生命周期；Harbor 的 artifact tree 和 verifier 隔离最接近执行型任务，但 reward 文件不足以承载可解释的多阶段数据评测。DSH 应采用稳定 core envelope、namespaced extension payload、少量强制标准 projection，以及独立 immutable artifact store 的组合。

Public task 与 private grading material 必须采用比 AgentCompass 和 Inspect 更强的机制隔离。Harbor 的 separate verifier 是本次核验中最直接的实现证据：agent environment 与 verifier environment 分开，tests、gold answers 和 judge dependencies 只进入 verifier，agent outputs 通过声明 artifact 跨越。DSH 已选择的 `PublicPreparedTask + GradingMaterialRef` 与同机独立 grader/sandbox 路径符合该方向。

Run identity 不能只记录模型名和 case id。至少应冻结 Benchmark Pack、Case Manifest、public/private artifact digest、adapter/compiler、Harness、model revision、interface/template/parser/tool schema、Environment binding/image、Context binding/snapshot、`ResolvedGradingPlan`、attempt policy 和 code revision。AgentCompass 的 resolved `RunRequest`/`ExecutionPlan`、Harbor 的 task checksum/lock/trial config、Inspect 的 `EvalSpec`/run-config export、lm-evaluation-harness 的 config/git/environment metadata、MLflow 的 dataset digest/scorer version 分别证明了其中一部分；没有任何单一框架覆盖全部字段。

## 范围与方法

本调研只采用项目官方文档、官方源代码仓库和官方论文。第三方教程、聚合博客、营销比较和未能追溯到 owner 的说明未作为证据。

“当前”指 2026-09-10。对开源项目，本文固定到本次核验的提交；对 OpenAI 托管产品，本文引用 2026-09-10 可访问的官方文档，并明确记录其弃用状态。

本文研究的是 **Data-domain Evaluation Core**：数据工程、数据分析和数据科学共享的评测基础设施。它不以 code、medicine、Web 等非数据领域为首版目标，也不以任何一个具体 DataScope 作为 canonical model。

核验的仓库状态如下：

| 系统 | 核验提交 | 提交日期 |
| --- | --- | --- |
| AgentCompass | [`c30a5d9472c0ed9afefad7bdabbf096db4c0f92a`](https://github.com/open-compass/AgentCompass/tree/c30a5d9472c0ed9afefad7bdabbf096db4c0f92a) | 2026-09-08 |
| Harbor | [`191d1b989bbba1d77c2db23e17aec308d7c08046`](https://github.com/harbor-framework/harbor/tree/191d1b989bbba1d77c2db23e17aec308d7c08046) | 2026-09-09 |
| Harbor-Index | [`5399ea1026fb2c7fc384cf8acd91a7d10fc943f3`](https://github.com/harbor-framework/harbor-index/tree/5399ea1026fb2c7fc384cf8acd91a7d10fc943f3) | 2026-08-03 |
| Inspect AI | [`10cab1265e86c2f6f9aa5728052494a97059e968`](https://github.com/UKGovernmentBEIS/inspect_ai/tree/10cab1265e86c2f6f9aa5728052494a97059e968) | 2026-09-09 |
| OpenAI Evals OSS | [`8eac7a7de5215c907fbddc30efdaf316913eccdd`](https://github.com/openai/evals/tree/8eac7a7de5215c907fbddc30efdaf316913eccdd) | 2026-04-14 |
| OpenAI Node SDK | [`fe2d6a382623b00753f002de539f8a26c936b5be`](https://github.com/openai/openai-node/tree/fe2d6a382623b00753f002de539f8a26c936b5be) | 2026-09-09 |
| MLflow | [`c5c9b6d3be593d108350b30816f2d7ee0c0c90ab`](https://github.com/mlflow/mlflow/tree/c5c9b6d3be593d108350b30816f2d7ee0c0c90ab) | 2026-09-10 |
| lm-evaluation-harness | [`b954108c9baaaa934b4ad842033b31a97ee30816`](https://github.com/EleutherAI/lm-evaluation-harness/tree/b954108c9baaaa934b4ad842033b31a97ee30816) | 2026-09-01 |
| HELM | [`63754d05db6f874e41a395880fb573890a13e791`](https://github.com/stanford-crfm/helm/tree/63754d05db6f874e41a395880fb573890a13e791) | 2026-06-05 |

## 横向比较

| 系统 | 任务/Benchmark 表达 | 扩展单元 | Scorer/Verifier | Private material | Run/evidence/artifact | Environment | 对 DSH 的主要价值与限制 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AgentCompass | `RunRequest` 选择 Benchmark/Harness/Environment；Benchmark 产出 `TaskSpec`、`BenchmarkPlan`、`PreparedTask` | Benchmark、Harness、Environment、Recipe、Analyzer registry | Benchmark 拥有 `evaluate()` 与 aggregation | 文档要求 hidden data 留在 `TaskSpec.ground_truth` 或 `BenchmarkPlan`，但 Harness 可读取整个 `PreparedTask`，属于约定式隔离 | resolved request/plan、attempt、task detail、trajectory、artifact、summary | 明确的 provider interface 和 open/close/network lifecycle | 最强的职责拆分和 composition 参考；private boundary 仍不够机械，Recipe/default precedence 不应原样复制 |
| Harbor/Harbor-Index | 浅层 task directory：`instruction.md`、`task.toml`、`environment/`、`solution/`、`tests/` | task、agent、environment provider、verifier；外部 benchmark 通过 adapter 转换 | task 自带 verifier，输出 one-or-many numeric rewards；Reward Kit 承载复杂评分 | `environment_mode="separate"` 可将 tests/gold/judge dependency 放进独立 verifier；Harbor-Index 全部 task 使用 separate mode | trial config、lock、task checksum、result、ATIF trajectory、agent/verifier logs、artifact manifest；支持 regrade | 多 sandbox provider；agent/verifier 可不同环境，sidecar evidence 可在 teardown 前收集 | 最强的执行任务封装、isolated verifier 和 artifact transport 参考；reward-only 接口和 best-effort collection 不足以成为 DSH 事实模型 |
| Inspect AI | `Task(dataset, solver/agent, scorer, sandbox, limits, version, metadata)`；`Sample` 表达 input/target/files/metadata/sandbox | `@task`、`@solver`、`@scorer`、`@tool`、model API、sandbox 等，通过 package entry point 注册 | scorer 返回 `Score` 并声明 metric；可以对既有 log 重新 score | `target` 进入 `TaskState`，solver 可访问；没有 opaque private-material capability | `EvalLog` 包含 spec、plan、dataset、samples、messages、store、scores、usage 和 closed discriminated event union；attachment 去重；多 storage URI | 可注册 sandbox provider，提供 task/sample init、cleanup、exec/read/write/connection | 最强的 typed composition、rich log 和 extension packaging 参考；不适合作为 heldout 隔离模型，closed event union 也不等于开放 payload registry |
| OpenAI hosted Evals/Datasets | Eval = data-source schema + testing criteria；run 绑定输入数据与 model/prompt | 托管 data source、grader 类型、run source | string/text-similarity/model/Python grader；grader 可模板化读取 `item` 与 `sample` | dataset columns 同时可供 prompt 与 grader 引用；未提供 Harness 不可读取 ground truth 的安全模型 | 托管 eval/run IDs、status、per-criterion results、usage、report URL；Datasets 支持人工 annotation | 面向 API response/prompt，不提供通用 stateful Environment adapter | 清晰展示 schema-first data source 与 grader-as-data；但 Evals 平台已公告将于 2026-11-30 关闭，不可作为长期依赖或架构权威 |
| OpenAI Evals OSS | YAML registry + JSONL sample data + Python Eval/CompletionFn/Solver | registry、Eval class、CompletionFn、Solver | Eval 自己记录 match/metric，支持 model-graded template | README 支持 private eval data，但同一 Python Eval 仍直接加载 sample/expected；无 capability isolation | run ID + append event recorder，可落 JSONL 或 Snowflake；事件包含 sampling/function call/match/error/metrics | 主要抽象 model completion，不是 stateful environment lifecycle | 事件 recorder 和 registry 是历史参考；平台与 repo 路线已分离，且仓库 README 指向托管 Evals |
| MLflow GenAI Evaluation | Evaluation Dataset records：inputs、outputs、expectations、metadata；`evaluate(data, scorers, predict_fn/model_id)` | custom scorer、judge adapter、trace instrumentation、tracking backend | built-in/custom/third-party scorer；可注册和版本化 | expectations 与 trace/outputs 同属 evaluation dataset/assessment 系统；不提供 agent/verifier 隔离 | OpenTelemetry-compatible trace/span、Assessment、dataset digest、experiment/run、scorer provenance/version | 不拥有 agent execution environment；依赖被评应用自身 runtime | 最强的数据科学 lineage、trace、assessment 和 registry 参考；不能替代 Benchmark/Harness/Environment 生命周期 |
| lm-evaluation-harness | YAML `TaskConfig` 将 dataset、split、prompt mapping、output type、metrics、generation args 放在一起 | task/model/metric/aggregation/filter 等 registry 和 entry-point plugin | `process_results` 与 metric registry | target 由 `doc_to_target` 产生并参与普通 task pipeline；无 hidden verifier isolation | result config、git hash、date、environment/tokenizer info、可选 per-sample logs、外部 logger | 没有一等 stateful Environment lifecycle | 声明式 task 与插件命名有价值；process-global registry、override/default 和 model-centric request shape 不适合直接作为 DSH core |
| HELM | `RunSpec = ScenarioSpec + AdapterSpec + MetricSpec[] + augmentation/groups` | Scenario、Adapter、Metric、Annotator、Model client | Metric 读取 executed `RequestState`/`ScenarioState` | `Instance.references` 与运行数据在同一 object graph；无 opaque private boundary | suite/run output、request/result state、cache、stats、UI | 主要是 model request execution，不是 agent sandbox lifecycle | Scenario/Adapter/Metric 的显式分解是重要先例；项目自 2026-06-01 进入 maintenance mode，且不覆盖 DSH 所需环境隔离 |

## 1. AgentCompass

### 已核验事实

AgentCompass 明确把 Model、Benchmark、Harness、Environment、Recipe、Analyzer 与 runtime 分开。Benchmark 拥有 dataset loading、稳定 task identity、task preparation、evaluation 和 metric aggregation；Harness 拥有 agent/model execution loop、session lifecycle、trajectory 和 usage normalization；Environment 拥有 command、file、endpoint、network policy、resource 与 sandbox lifecycle；runtime 拥有 orchestration、attempt、retry、limit、cancellation、cleanup 和 persistence。[Architecture Overview](https://github.com/open-compass/AgentCompass/blob/c30a5d9472c0ed9afefad7bdabbf096db4c0f92a/docs/en/developer_guide/architecture/overview.mdx#L5-L31)

组件通过独立 registry 注册，Benchmark、Harness、Environment、Recipe 和 Analyzer 各有 registry；重复名称在注册时失败。Model 是 request value，不进入组件 registry。[registry.py](https://github.com/open-compass/AgentCompass/blob/c30a5d9472c0ed9afefad7bdabbf096db4c0f92a/src/agentcompass/runtime/registry.py#L12-L106) [Runtime Contracts](https://github.com/open-compass/AgentCompass/blob/c30a5d9472c0ed9afefad7bdabbf096db4c0f92a/docs/en/developer_guide/architecture/contracts.mdx#L17-L46)

一次运行先解析完整 `RunRequest`，再为每个 task attempt 生成 `ExecutionPlan`；attempt 与 runtime retry 是不同层级，retry 重用同一个 plan。文档要求记录足够的 resolved state，并在 persistence boundary 始终 redaction secrets。[Architecture Overview](https://github.com/open-compass/AgentCompass/blob/c30a5d9472c0ed9afefad7bdabbf096db4c0f92a/docs/en/developer_guide/architecture/overview.mdx#L33-L47) [Runtime Contracts](https://github.com/open-compass/AgentCompass/blob/c30a5d9472c0ed9afefad7bdabbf096db4c0f92a/docs/en/developer_guide/architecture/contracts.mdx#L17-L67)

Benchmark extension 使用四种 carrier：`TaskSpec` 保存稳定 task identity 和 evaluator-only source data；`BenchmarkPlan` 保存 attempt-resolved evaluator state；`PreparedTask` 保存 Harness 可见 prompt/messages/files/tools/workspace；`RunResult` 保存 execution status、answer、trajectory、artifacts、scores 和可发布证据。文档明确指出 Harness 可以读取整个 `PreparedTask`，因此 hidden answers 不应复制进去；evaluator-only data 留在 `TaskSpec.ground_truth` 或 typed `BenchmarkPlan`。[Shared Contracts](https://github.com/open-compass/AgentCompass/blob/c30a5d9472c0ed9afefad7bdabbf096db4c0f92a/docs/en/developer_guide/extensions/benchmark/code_implementation/shared_contracts.mdx#L5-L20)

Environment provider 暴露 command/file/endpoint/network-policy 能力，并负责 partial startup cleanup、idempotent close 和真实 policy enforcement。运行时按 baseline、run、evaluation 三个阶段切换 network policy；provider 无法执行所请求切换时必须拒绝，而不能静默使用更宽权限。[Environment Integration](https://github.com/open-compass/AgentCompass/blob/c30a5d9472c0ed9afefad7bdabbf096db4c0f92a/docs/en/developer_guide/extensions/environment/code_implementation.mdx#L190-L226) [Execution Lifecycle](https://github.com/open-compass/AgentCompass/blob/c30a5d9472c0ed9afefad7bdabbf096db4c0f92a/docs/en/developer_guide/architecture/execution_lifecycle.mdx#L152-L186)

Benchmark validation 要求完整 official split、明确 Model/Benchmark/dataset/Harness/prompt/inference/timeout/resource/provider/network/attempt/retry/aggregation 配置，并分类所有非成功 task；只比较正常完成的 task 不构成 alignment。[Validation and Alignment](https://github.com/open-compass/AgentCompass/blob/c30a5d9472c0ed9afefad7bdabbf096db4c0f92a/docs/en/developer_guide/extensions/benchmark/validation_and_alignment.mdx#L61-L100)

### 失败面与限制

AgentCompass 的 private-data 处理是强约定而不是不可达能力。`PreparedTask` 类型仍可携带 `ground_truth`，文档通过“设为 `None`”和不要复制 metadata 来防止泄露；它没有 opaque private-material reference 或独立授权 resolver。[Shared Contracts](https://github.com/open-compass/AgentCompass/blob/c30a5d9472c0ed9afefad7bdabbf096db4c0f92a/docs/en/developer_guide/extensions/benchmark/code_implementation/shared_contracts.mdx#L13-L20)

AgentCompass 允许多层配置 precedence 和 Recipe fallback。它通过 resolved request/plan 与 persistence 缓解解释性问题，但这种灵活覆盖若直接用于 DSH 的 correctness、Context 或 Environment identity，会重新引入隐式语义变化。[Runtime Contracts](https://github.com/open-compass/AgentCompass/blob/c30a5d9472c0ed9afefad7bdabbf096db4c0f92a/docs/en/developer_guide/architecture/contracts.mdx#L48-L67)

### 对 DSH 的启示

DSH 应采用其所有权拆分、attempt/retry 区分、resolved plan 和 Environment lifecycle，但将 private grading material 提升为独立 capability。Recipe 只能做显式、可审计的 composition 适配，不能成为 Benchmark policy 或 binding 的隐藏 fallback。

## 2. Harbor 与 Harbor-Index

### 已核验事实

Harbor task 是一个浅层目录 aggregate：`instruction.md`、`task.toml`、`environment/`、`solution/` 和 `tests/`。`task.toml` 分开 task metadata、agent timeout、verifier timeout 和 environment resources；task 自己携带 verifier，而不是让 central harness 按 benchmark 名称解释结果。[Task Tutorial](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/docs/content/docs/tasks/task-tutorial.mdx#L18-L75) [Task Difference](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/docs/content/docs/tasks/task-difference.mdx#L8-L64)

Verifier 可以运行在 agent 的 shared environment，也可以使用 dedicated separate environment。官方文档将 proprietary grading code、agent 不应看到的 tests、不同 OS 和 verifier-only dependencies 列为 separate mode 的用途。Harbor-Index 的 80 个 current tasks 全部使用 separate verifier，tests、gold answers 和 judge dependencies 只进入 verifier，agent outputs 仅通过 declared artifacts 跨越。[Harbor Tasks](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/docs/content/docs/tasks/index.mdx#L502-L529) [Harbor-Index Adaptation Patterns](https://github.com/harbor-framework/harbor-index/blob/5399ea1026fb2c7fc384cf8acd91a7d10fc943f3/ADAPTATIONS.md#L33-L45)

Artifact collection 支持 convention directory、任意路径和 sidecar service。Separate verifier 模式先停止 main container，再从 agent 不可写的 sidecar filesystem 拉取证据；每项 artifact 的 source、destination、type、status 和 service 写入 manifest。[Artifact Collection](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/docs/content/docs/run-jobs/results-and-artifacts.mdx#L1-L82) [artifact_manifest.py](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/src/harbor/models/trial/artifact_manifest.py#L1-L19)

`TrialResult` 保存 trial UUID、task name、trial URI、typed task source identity、task checksum、resolved trial config、agent name/version/model、agent/verifier result、resolved verifier mode、exception 和各阶段 timing。Trial directory 另有 `config.json`、`lock.json`、agent trajectory/log、verifier output、artifacts manifest 和 final result。[trial/result.py](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/src/harbor/models/trial/result.py#L53-L97) [trial/paths.py](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/src/harbor/models/trial/paths.py#L82-L138)

Harbor 将 agent trajectory 规范化为 ATIF `trajectory.json`，同时保留 native agent session artifact。ATIF 可跨 agent 加载，但只保留 conversation、tool calls 和 tool results；agent-specific session details 会丢失。[Load Trajectory](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/docs/content/docs/run-jobs/load-trajectory.mdx#L21-L72)

Harbor adapter 工作不是“转换后能跑”即结束。以 BIRD adapter 为例，metadata 记录原 benchmark split/size、adapted size、parity sample、agent/model、run count、original/adapted metrics、PR 和 dataset provenance；README 明确记录 packaging、instruction、verifier alignment、parity subset、known limitations。该 adapter 在 150-case stratified subset 上各跑三次，比较 official execution accuracy 与 Harbor result。[BIRD adapter metadata](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/adapters/bird_bench/adapter_metadata.json) [BIRD parity](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/adapters/bird_bench/parity_experiment.json) [BIRD README](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/adapters/bird_bench/README.md)

### 失败面与限制

Artifact collection 被文档定义为 best effort；collection failure 写入 manifest，但不会自动使 trial 失败。这适合调试 artifact，不适合把 required grading evidence 也当作可忽略附件。[Artifact Collection](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/docs/content/docs/run-jobs/results-and-artifacts.mdx#L80-L88)

Verifier 的标准输出是 `/logs/verifier/reward.txt` 或 numeric-only `reward.json`。它适合 leaderboard reward，却不足以表达 DSH 需要的 execution facts、failure attribution、finality、evidence references、grader explanation 和 not-measured dimensions。[Harbor Tasks](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/docs/content/docs/tasks/index.mdx#L474-L486)

同机 separate container 是有效的 filesystem/process isolation，但官方材料没有给出抵御 host administrator、kernel compromise 或 malicious provider 的完整 threat model。DSH 不能把“separate”表述成超出 provider 实际保证的安全等级。

### 对 DSH 的启示

DSH 的 `CaseManifest` 可以采用 Harbor 的浅层 task package 思路，但 public/private artifact 必须拥有独立 digest 和 access class。Required grading evidence collection 失败必须进入 `evidence_incomplete` 或 `grading_unavailable`，不能只写 warning。Adapter migration 应采用 Harbor-Index 的 original-vs-adapted parity 纪律，同时保留逐 case artifact，而不是只比较 aggregate score。

## 3. Inspect AI

### 已核验事实

Inspect 的 `Task` 是 dataset、solver/agent、scorer、sandbox、model、limits、version、metadata 和 metrics 的组合单元。Task 通过 `@task` 注册，solver、scorer 和 tool 也有对应 decorator；安装包使用 `inspect_ai` setuptools entry point 加载，并以 `package/name` 命名。[Tasks](https://github.com/UKGovernmentBEIS/inspect_ai/blob/10cab1265e86c2f6f9aa5728052494a97059e968/docs/tasks.qmd#L20-L63) [Extension Components](https://github.com/UKGovernmentBEIS/inspect_ai/blob/10cab1265e86c2f6f9aa5728052494a97059e968/docs/extensions-components.qmd#L17-L70)

Custom scorer 是 async function，读取 `TaskState` 和 `Target`，返回 `Score`，并在 `@scorer` decorator 上声明 aggregation metrics。Packaged scorer 还可通过 `inspect score` 对既有 log 重新评分。[Custom Scorers](https://github.com/UKGovernmentBEIS/inspect_ai/blob/10cab1265e86c2f6f9aa5728052494a97059e968/docs/custom-scorers.qmd#L19-L64) [Extension Components](https://github.com/UKGovernmentBEIS/inspect_ai/blob/10cab1265e86c2f6f9aa5728052494a97059e968/docs/extensions-components.qmd#L112-L129)

Sandbox provider 是可注册 extension，提供 task-level initialization、sample-level environment creation、sample cleanup、task cleanup、CLI cleanup，以及 environment-level exec/read/write/connection。相同 sandbox config 可以共享 task initialization，但 sample environment 仍按 sample 创建和清理。[Sandbox Extensions](https://github.com/UKGovernmentBEIS/inspect_ai/blob/10cab1265e86c2f6f9aa5728052494a97059e968/docs/extensions-sandboxes.qmd#L31-L149) [environment.py](https://github.com/UKGovernmentBEIS/inspect_ai/blob/10cab1265e86c2f6f9aa5728052494a97059e968/src/inspect_ai/util/_sandbox/environment.py#L138-L525)

每个 task run 产生 `EvalLog`。Log 持有 evaluation spec/config/plan、dataset、sample、message、output、scores、store、usage、timing、error、attachments 和 events。事件拥有共同的 uuid、span ID、timestamp、working time、metadata 和 pending 字段，并以 `event` discriminant 区分 model、tool、sandbox、score、state、store、error、checkpoint、span 等 23 种核心事件。[Eval Logs](https://github.com/UKGovernmentBEIS/inspect_ai/blob/10cab1265e86c2f6f9aa5728052494a97059e968/docs/eval-logs.qmd#L73-L105) [log/_log.py](https://github.com/UKGovernmentBEIS/inspect_ai/blob/10cab1265e86c2f6f9aa5728052494a97059e968/src/inspect_ai/log/_log.py#L419-L560) [event/_event.py](https://github.com/UKGovernmentBEIS/inspect_ai/blob/10cab1265e86c2f6f9aa5728052494a97059e968/src/inspect_ai/event/_event.py#L1-L76) [event/_base.py](https://github.com/UKGovernmentBEIS/inspect_ai/blob/10cab1265e86c2f6f9aa5728052494a97059e968/src/inspect_ai/event/_base.py#L16-L48)

Log 可使用 `.eval` compact binary 或 JSON；大内容通过 attachments 去重；storage 可落 local、S3、Hugging Face bucket 和 Azure。`inspect log export-config` 可以从 log 导出完整 task/model/model-role/generation/solver/eval settings，并用于 `--run-config` 重放。[Eval Logs](https://github.com/UKGovernmentBEIS/inspect_ai/blob/10cab1265e86c2f6f9aa5728052494a97059e968/docs/eval-logs.qmd#L73-L132) [Eval Logs](https://github.com/UKGovernmentBEIS/inspect_ai/blob/10cab1265e86c2f6f9aa5728052494a97059e968/docs/eval-logs.qmd#L340-L358) [Eval Logs](https://github.com/UKGovernmentBEIS/inspect_ai/blob/10cab1265e86c2f6f9aa5728052494a97059e968/docs/eval-logs.qmd#L680-L699)

### 失败面与限制

Inspect 的 `Sample.target` 会进入 solver 的 `TaskState.target`；它是评分方便性设计，不是 hidden-material isolation。Task 的 arbitrary metadata 也进入 state。对于公开 benchmark 这很实用，但不能支持“类型和依赖层面保证 Harness 无法读取 reference”的 heldout 要求。[dataset/_dataset.py](https://github.com/UKGovernmentBEIS/inspect_ai/blob/10cab1265e86c2f6f9aa5728052494a97059e968/src/inspect_ai/dataset/_dataset.py#L29-L105) [solver/_task_state.py](https://github.com/UKGovernmentBEIS/inspect_ai/blob/10cab1265e86c2f6f9aa5728052494a97059e968/src/inspect_ai/solver/_task_state.py#L134-L169) [solver/_task_state.py](https://github.com/UKGovernmentBEIS/inspect_ai/blob/10cab1265e86c2f6f9aa5728052494a97059e968/src/inspect_ai/solver/_task_state.py#L418-L448)

Inspect 的 event schema 是 core-owned closed union。它保证 deserialization 和 exhaustive tooling，但新增领域事件需要修改 core union；这与 DSH 希望让数据工程、数据分析和数据科学独立注册 payload 的方向不同。[event/_event.py](https://github.com/UKGovernmentBEIS/inspect_ai/blob/10cab1265e86c2f6f9aa5728052494a97059e968/src/inspect_ai/event/_event.py#L29-L76)

Task 支持 task definition、`task_with()`、environment variables、`eval()` 和 CLI 多层 override。Inspect 将最终配置写入 log，因此重放能力较强；但若 DSH 对 correctness 或 binding 使用同类 override，仍会让 Case Manifest 的语义随调用方式改变。[Tasks](https://github.com/UKGovernmentBEIS/inspect_ai/blob/10cab1265e86c2f6f9aa5728052494a97059e968/docs/tasks.qmd#L8-L18) [Tasks](https://github.com/UKGovernmentBEIS/inspect_ai/blob/10cab1265e86c2f6f9aa5728052494a97059e968/docs/tasks.qmd#L409-L492)

### 对 DSH 的启示

DSH 应采用 Inspect 的统一 EvalLog、事件 correlation、attachment/artifact 分离和 package-qualified registration，但 Evidence Core 不应复制 closed domain-event union。Core 只固定 envelope 与必须跨领域查询的 projections；extension payload 使用 namespaced kind 和 schema version。Target/expected 不进入 Harness state。

## 4. OpenAI hosted Evals、Datasets 与 OpenAI Evals OSS

### 已核验事实：托管 Evals/Datasets

截至 2026-09-10，OpenAI 官方文档已宣布 Evals platform 弃用：2026-10-31 对现有用户变为只读，2026-11-30 计划关闭 dashboard 和 API；官方将 Datasets 作为更适合交互迭代的入口。[Evals Guide](https://developers.openai.com/api/docs/guides/evals) [Deprecations](https://developers.openai.com/api/docs/deprecations#2026-06-03-evals-platform) [Datasets Guide](https://developers.openai.com/api/docs/guides/evaluation-getting-started)

Hosted Eval object 由 `data_source_config` 与 `testing_criteria` 组成。Custom data source 使用 JSON Schema 定义 item；run 可以使用 file、logs 等 source。Testing criteria 是 grader 列表，通过 `{{ item.* }}` 读取 test data，通过 `{{ sample.* }}` 读取 model output。Run 异步执行，拥有 eval ID、run ID、status、per-testing-criteria results、per-model usage 和 report URL。[Evals Guide](https://developers.openai.com/api/docs/guides/evals) [Evals API Reference](https://developers.openai.com/api/reference/resources/evals) [openai-node evals.ts](https://github.com/openai/openai-node/blob/fe2d6a382623b00753f002de539f8a26c936b5be/src/resources/evals/evals.ts) [openai-node runs.ts](https://github.com/openai/openai-node/blob/fe2d6a382623b00753f002de539f8a26c936b5be/src/resources/evals/runs/runs.ts)

官方 grader 类型包括 string check、text similarity、score-model 和 Python code execution；grader 返回 0 到 1 的 grade。Template namespaces 明确区分 dataset `item` 与 generated `sample`，但二者在同一 grader configuration 中可访问。官方还直接记录 exact string grading 会因 `1` 与 `1.0`、缩写与全称等表面差异而 under-reward，并建议改用 similarity 或 model grader。[Graders Guide](https://developers.openai.com/api/docs/guides/graders)

Datasets 将 records、prompt variants、human annotations 和 graders 放在一个交互式工作区。CSV ground-truth columns 同时可被 prompt 和 grader 引用；prompt save 会创建版本；grader 会随着 dataset/prompt 更新而保留。官方建议 dataset 作为持续扩充的 living validation collection。[Datasets Guide](https://developers.openai.com/api/docs/guides/evaluation-getting-started)

### 已核验事实：OpenAI Evals OSS

OSS 仓库仍提供 YAML registry、JSONL data、Python `Eval`、`CompletionFn`、`Solver` 和 recorder。README 明确允许私有 eval data，但 registry data、Eval code 和 expected values仍由同一进程加载。Recorder 以 run ID、event ID、sample ID、event type、payload、creator 和 timestamp 写 event，可落 local JSONL 或 Snowflake。[README](https://github.com/openai/evals/blob/8eac7a7de5215c907fbddc30efdaf316913eccdd/README.md#L1-L75) [registry.py](https://github.com/openai/evals/blob/8eac7a7de5215c907fbddc30efdaf316913eccdd/evals/registry.py) [record.py](https://github.com/openai/evals/blob/8eac7a7de5215c907fbddc30efdaf316913eccdd/evals/record.py#L157-L260)

### 失败面与限制

Hosted Evals 和 grader workflows 已进入正式弃用窗口，因此其对象模型只能作为设计证据，不能成为 DSH 的 runtime dependency 或长期 API anchor。OpenAI 官方推荐的 Datasets 更偏 prompt/output iteration，没有一等 Benchmark/Harness/Environment 分离、stateful data workspace、finality 或 private verifier capability。

Hosted data model 中的 item ground truth 可以被 prompt 与 grader 共同引用，不提供 DSH 要求的 public/private reachability proof。Python grader 是托管执行能力，但官方文档没有给出可由 DSH 依赖的 filesystem mount、network、process isolation 或 artifact lifecycle contract。

OSS OpenAI Evals 的 registry 与 event recorder 有历史价值，但 README 已将用户导向 hosted Evals，而 hosted Evals 又将在 2026-11-30 关闭。DSH 不应从这两个 surface 推导长期 package topology。

### 对 DSH 的启示

值得保留的模式是 schema-first input、grader-as-data、`item`/`sample` namespace、asynchronous run identity 和 per-criterion results。DSH 应进一步把 `item` 分成 public material 与 opaque private material，将 grader configuration 编译成 immutable `ResolvedGradingPlan`，并把 hosted product lifecycle 排除在 core dependency 之外。

## 5. MLflow GenAI Evaluation

### 已核验事实

MLflow Evaluation Dataset 是集中管理的 test-data collection，record 可包含 inputs、optional outputs、expectations 和 metadata；dataset 拥有 ID、digest、schema、profile、tags、experiment associations 与 timestamps。官方将它定义为可持续从 production trace、人工整理或生成流程扩充的 living collection。[Evaluation Dataset Concepts](https://github.com/mlflow/mlflow/blob/c5c9b6d3be593d108350b30816f2d7ee0c0c90ab/docs/docs/genai/concepts/evaluation-datasets.mdx#L12-L71)

`mlflow.genai.evaluate()` 接受 evaluation data、scorer list，以及可选 `predict_fn` 或 `model_id`。它既可以对已存 trace 评分，也可以运行 predict function 后评分；custom scorer 可以读取 inputs、outputs、expectations 与整条 trace。[evaluation/base.py](https://github.com/mlflow/mlflow/blob/c5c9b6d3be593d108350b30816f2d7ee0c0c90ab/mlflow/genai/evaluation/base.py#L56-L106)

MLflow Trace 由 `TraceInfo` 和 `TraceData` 组成；后者包含 step-level spans。Trace 与 OpenTelemetry 兼容，并增加 LLM/agent-specific attributes。Assessment 将 expectation 或 feedback 附着到 trace 或具体 span；feedback 记录 name、value/error、rationale、source、metadata、trace ID 和 optional span ID。[Trace Concepts](https://github.com/mlflow/mlflow/blob/c5c9b6d3be593d108350b30816f2d7ee0c0c90ab/docs/docs/genai/concepts/trace.mdx#L11-L72) [Feedback Concepts](https://github.com/mlflow/mlflow/blob/c5c9b6d3be593d108350b30816f2d7ee0c0c90ab/docs/docs/genai/concepts/feedback.mdx)

Scorer 支持 built-in、decorator、instruction/judge、third-party 和 ensemble 等 kind。注册到 experiment 的 scorer 具有递增 version；同名再次注册创建新版本，调用方可以显式 pin version，也可以请求 latest。Evaluation 生成的 feedback metadata 会附带 scorer name/version provenance。[Scorer Versioning](https://github.com/mlflow/mlflow/blob/c5c9b6d3be593d108350b30816f2d7ee0c0c90ab/docs/docs/genai/eval-monitor/scorers/versioning.mdx#L37-L130) [scorers/base.py](https://github.com/mlflow/mlflow/blob/c5c9b6d3be593d108350b30816f2d7ee0c0c90ab/mlflow/genai/scorers/base.py#L42-L106) [evaluation/utils.py](https://github.com/mlflow/mlflow/blob/c5c9b6d3be593d108350b30816f2d7ee0c0c90ab/mlflow/genai/evaluation/utils.py#L411-L420)

Open-source tracking dataset 使用 digest，但 immutable dataset version listing 在当前实现中只由 Databricks managed dataset 支持；普通 MLflow dataset 调用 `list_versions()` 会抛 `NotImplementedError`。[evaluation_dataset.py](https://github.com/mlflow/mlflow/blob/c5c9b6d3be593d108350b30816f2d7ee0c0c90ab/mlflow/genai/datasets/evaluation_dataset.py#L250-L265)

### 失败面与限制

Living dataset 与“默认加载最新 scorer version”非常适合持续产品评估，但不适合直接定义 frozen benchmark。若没有显式 snapshot/digest/version pin，同名 dataset 或 scorer 的变化会让结果不可比较。官方文档本身也建议 regression workflow pin scorer version。[Scorer Versioning](https://github.com/mlflow/mlflow/blob/c5c9b6d3be593d108350b30816f2d7ee0c0c90ab/docs/docs/genai/eval-monitor/scorers/versioning.mdx#L109-L130)

MLflow 的 trace/span 是 observation 与 lineage 层，不拥有 agent sandbox、data warehouse transaction、pending side effect、verified cleanup 或 separate grader environment。它不能替代 DSH Environment protocol。

Expectations、outputs、trace 和 assessments 位于同一 tracking/evaluation system；这便于分析，但不是 private material isolation。Access control 可能由部署后端提供，本次核验未找到与 Harness reachability 对应的公开 core contract。

### 对 DSH 的启示

DSH 应采用 dataset/content digest、span-level evidence correlation、expectation/feedback distinction、scorer provenance 和 experiment/run linkage。Benchmark Pack 必须冻结 snapshot；`latest` 只允许在 authoring workflow，不能进入正式 eval run。Core evidence 可以向 OpenTelemetry projection 兼容，但 durable evaluation schema 不能只剩通用 spans。

## 6. lm-evaluation-harness

### 已核验事实

lm-evaluation-harness 的 task 以 YAML `TaskConfig` 为中心，包含 dataset path/name/kwargs、train/validation/test/few-shot split、document transforms、prompt/target/choice mapping、output type、metric list、generation arguments、repeats、metadata 和 version。官方文档称 YAML 与 codebase commit hash 一起用于精确复现实验设置。[Task Guide](https://github.com/EleutherAI/lm-evaluation-harness/blob/b954108c9baaaa934b4ad842033b31a97ee30816/docs/task_guide.md#L1-L40) [TaskConfig](https://github.com/EleutherAI/lm-evaluation-harness/blob/b954108c9baaaa934b4ad842033b31a97ee30816/lm_eval/config/task.py#L81-L121)

插件可以通过 Python entry point 或显式 module import 注册 model、task、metric、aggregation 和 filter。Metric 的 `higher_is_better` 与 default aggregation 是 decorator side effect；aggregation 必须在 metric decorator 执行前已经注册。Built-in alias 优先，插件不能覆盖；显式插件 import 失败时会被记录并跳过；registry 是 process-global。[Plugins](https://github.com/EleutherAI/lm-evaluation-harness/blob/b954108c9baaaa934b4ad842033b31a97ee30816/docs/plugins.md#L1-L109)

最终 result 记录 model/config、batch/device/cache/limit/bootstrap/generation args、四类 random seed、git hash、start date、environment information 和 tokenizer information；可选保存 per-sample document、model input/output 和 metric result。[evaluator.py](https://github.com/EleutherAI/lm-evaluation-harness/blob/b954108c9baaaa934b4ad842033b31a97ee30816/lm_eval/evaluator.py#L393-L423) [Evaluation Tracker](https://github.com/EleutherAI/lm-evaluation-harness/blob/b954108c9baaaa934b4ad842033b31a97ee30816/lm_eval/loggers/evaluation_tracker.py)

### 失败面与限制

配置允许 CLI 覆盖 config file，task 也具有多处 default；这对探索方便，但必须依赖最终 resolved config 才能解释结果。[Configuration Guide](https://github.com/EleutherAI/lm-evaluation-harness/blob/b954108c9baaaa934b4ad842033b31a97ee30816/docs/config_files.md#L1-L54)

Task config 同时持有 prompt mapping、target mapping、metrics 和 generation behavior；它没有 Benchmark/Harness/Environment 的所有权拆分。Custom dataset/process functions 和 `unsafe_code` 允许代码进入 task loading path，适合研究 harness，但不适合作为 heldout private boundary。[TaskConfig](https://github.com/EleutherAI/lm-evaluation-harness/blob/b954108c9baaaa934b4ad842033b31a97ee30816/lm_eval/config/task.py#L81-L121)

Process-global registry 与“plugin import failure 记录后跳过”可能让 requested extension 未加载却继续运行。DSH 的 required capability 应在 preflight fail loud，不能继承这一行为。[Plugins](https://github.com/EleutherAI/lm-evaluation-harness/blob/b954108c9baaaa934b4ad842033b31a97ee30816/docs/plugins.md#L71-L109)

### 对 DSH 的启示

声明式 task profile、namespaced plugin 和完整 result config 值得采用。DSH 不应把 authoring YAML 直接当 runtime object；必须先编译、校验、冻结为 `ResolvedRunPlan`，required extension 加载失败直接终止。

## 7. HELM

### 已核验事实

HELM 的 `RunSpec` 明确组合 `ScenarioSpec`、`AdapterSpec`、`MetricSpec[]`、optional data augmenter、groups 和 annotators。Scenario 产生 `Instance`；Adapter 将 instance 转换为 request；执行后形成 `RequestState`，保留 instance、reference index、request mode、train trial、实际 request、result、truncation 和 annotations，供 Metric 解释。[run_spec.py](https://github.com/stanford-crfm/helm/blob/63754d05db6f874e41a395880fb573890a13e791/src/helm/benchmark/run_spec.py#L13-L82) [scenario.py](https://github.com/stanford-crfm/helm/blob/63754d05db6f874e41a395880fb573890a13e791/src/helm/benchmark/scenarios/scenario.py#L94-L159) [request_state.py](https://github.com/stanford-crfm/helm/blob/63754d05db6f874e41a395880fb573890a13e791/src/helm/benchmark/adaptation/request_state.py#L9-L55)

`AdapterSpec` 显式固定 prompt prefixes/suffixes、few-shot selection、number of outputs、number of train/eval trials、model/deployment、sampling、stop sequences、random seed 和 eval splits。该设计将 interface/harness choice 视为 run semantics，而不是只记录模型名。[adapter_spec.py](https://github.com/stanford-crfm/helm/blob/63754d05db6f874e41a395880fb573890a13e791/src/helm/benchmark/adaptation/adapter_spec.py)

HELM 提供 standardized benchmark data、unified model clients、metrics、request cache、result summarization 和 UI；README 明确宣布项目从 2026-06-01 起进入 maintenance mode。[README](https://github.com/stanford-crfm/helm/blob/63754d05db6f874e41a395880fb573890a13e791/README.md#L25-L37)

### 失败面与限制

Scenario `Instance` 包含 references，Adapter/RequestState/Metric 都处于同一 Python object graph；没有 opaque private reference 或 separate verifier environment。Environment 主要是 model request/client execution，不覆盖 data workspace、side effects、finality 和 reset。

HELM 的强项是 model benchmark 的 scenario/adaptation/metric 分层，而不是 stateful agent evaluation。Maintenance mode 也意味着 DSH 不应把新 core 建在其 extension API 上。

### 对 DSH 的启示

DSH 应保留 `Scenario/Case → Adapter/Compiler → Requests/Evidence → Metrics` 的显式阶段，但不要把 reference 带进 Harness-visible state，也不要让 prompt adapter 同时拥有 Benchmark correctness policy。

## 跨框架结论

### 1. Plugin 边界

一手实现共同表明，扩展能力需要具名 registration 和明确 owner。AgentCompass 按 Benchmark/Harness/Environment/Recipe/Analyzer 分 registry；Inspect 按 task/solver/scorer/tool/model/sandbox 分 package-qualified registry；lm-evaluation-harness 按 model/task/metric/aggregation/filter 分 registry；MLflow 单独注册 scorer version。

DSH 不应采用一个 `type: string, payload: unknown` 的万能 plugin。建议 core 固定下列角色协议，各 extension 只能向对应 registry 注册：

```text
Benchmark Pack / Compiler
Harness Provider
Environment Provider
Context Provider
Grader Mechanism
Evidence Payload
Artifact Codec / Projection
Aggregation Policy
```

每个 registry key 使用 namespace，注册冲突失败；required component 未加载或版本不兼容在 composition preflight 失败。Registry registration 是 plugin lifecycle effect，卸载必须有 disposer。

### 2. Task 与 Benchmark manifest

Harbor 的浅层 task directory 最适合可审计的执行型 task；lm-evaluation-harness 的 YAML 最适合声明式 authoring；AgentCompass 的 `TaskSpec → BenchmarkPlan → PreparedTask` 最适合 runtime carrier 分离；OpenAI 的 JSON Schema data source 最适合在 ingest 时验证 record shape。

DSH 建议采用已经在 G10 选择的浅层 `CaseManifest` 聚合根：

```text
BenchmarkPackManifest
├── identity / version / provenance / split policy
├── named grading profiles
├── named Environment requirements
├── named Context requirements
└── CaseManifest[]
    ├── public material ref + digest
    ├── private material ref + digest
    ├── explicit grading profile ref
    ├── explicit Environment requirement ref
    ├── explicit Context requirement ref
    └── dimensions / provenance / validation state
```

Case 不继承影响 correctness、model-visible input、Environment 或 Context 的 pack default。Authoring shorthand 可以存在，但 committed manifest 必须显式引用 named profile。Compiler 在运行前验证引用、access class、schema version 和 digest，再生成 `PublicPreparedTask`、opaque `GradingMaterialRef` 与 frozen plans。

### 3. Scorer 与 grading ownership

多个框架支持可注册 scorer，但 ownership 不同：Inspect 把 scorer 放入 Task；OpenAI Eval 把 testing criteria 放入 Eval；MLflow 把 scorer 注册到 Experiment；Harbor 把 verifier 放进 task package；AgentCompass 由 Benchmark `evaluate()` 拥有官方 score。共同证据支持“correctness semantics 跟随 Benchmark，而 mechanism 可以共享”。

DSH 应区分：

```text
Benchmark-owned GradingPolicySpec
        ↓ resolve + validate
immutable ResolvedGradingPlan
        ↓
registered GraderMechanism + private material + run evidence
        ↓
GradeResult + evidence refs + failure attribution
```

`ResolvedGradingPlan` 固定 policy ID/version/digest、mechanism ID/version/digest、parameters、aggregation 和 acceptable evidence schema。Grader 运行时不得加载默认值、选择另一 comparator 或解析 deployment config。MLflow 的 exact scorer version pin 和 OpenAI 的 grader-as-JSON 都支持这一方向；OpenAI 自身的 platform deprecation说明 protocol 不能依赖某个 hosted grader product。

### 4. Public/private material isolation

被核验系统中，Harbor separate verifier 提供最强的实际隔离；AgentCompass 只通过 carrier discipline 避免把 hidden data 放进 `PreparedTask`；Inspect、HELM、lm-evaluation-harness 和 OpenAI hosted data model 均让 target/reference 与 execution-side object graph 或 prompt templating 处于同一系统。

DSH 应保持已经裁定的强模型：

```text
PublicPreparedTask ─────────────→ Harness
                                      │
                                      ▼
                                RunEvidence
                                      │
GradingMaterialRef → authorized Grader
```

Train/dev 可以同进程实现 provider，但不得声称秘密隔离；heldout/fresh 至少使用同机独立 grader process；Harness 或 tool 可执行不可信代码时使用无 private mount 的 OS sandbox。Private provider 的错误必须区分 `material_missing`、`digest_mismatch`、`unauthorized`、`grader_failed`，不能映射成 model fail。

### 5. Run identity

社区实现常见的问题不是完全不记录 identity，而是只记录局部 identity。lm-evaluation-harness 记录 config、git hash、date、environment 和 tokenizer；Inspect 记录 task/model/solver/eval config；Harbor 记录 task checksum、trial config、agent version、model 和 verifier mode；MLflow 记录 dataset digest、experiment/run 和 scorer version；AgentCompass 保存 resolved request/plan 与 component IDs。

DSH 的 frozen `RunIdentity` 至少应包含：

```text
benchmark pack id/version/content digest
case manifest id/revision/content digest
compiler/adapter id/version/digest
public material digest
private material digest or non-secret commitment
harness id/version/source digest
model provider/protocol/model revision/inference params
interface template/parser/tool-schema digests
environment requirement + resolved binding/provider/image/config digests
context requirement + resolved provider/snapshot/projection digests
resolved grading-plan digest + grader implementation identity
attempt/retry/seed/budget policy
runtime/core schema versions and source revision
```

Credentials、signed URL 和 secret values 不进入 identity；记录 credential reference identity 与 non-secret provider metadata。比较工具先检查 compatibility key，再计算 delta。任何 `latest`、ambient wall clock、unresolved provider selector 或 mutable dataset pointer 都不能进入正式 baseline。

### 6. Evidence 与 event schema

Inspect 证明了 typed event、span correlation、pending state、attachments 和 complete run log 的价值；MLflow 证明了 OpenTelemetry-compatible trace/span 与 expectation/feedback provenance 的价值；Harbor 证明了 trajectory 与 workspace/sidecar artifact 必须同时保存；OpenAI OSS 证明 append event recorder 可以支持 local 与 database sink。

DSH 建议采用：

```ts
interface EvidenceEnvelope<K extends EvaluationEvidenceKind> {
  evidenceId: EvidenceId;
  runId: RunId;
  attemptId: AttemptId;
  caseId: CaseId;
  stage: "emission" | "parse" | "action" | "observation" | "artifact" | "grade";
  kind: K;
  schemaVersion: number;
  producer: ComponentIdentity;
  startedAt?: string;
  observedAt: string;
  completedAt?: string;
  status: "pending" | "complete" | "failed" | "unresolved";
  parentEvidenceIds: readonly EvidenceId[];
  artifactRefs: readonly ArtifactRef[];
  payload: EvaluationEvidenceMap[K];
}
```

Core 固定 envelope 和少量跨子领域 projection：outcome、duration、cost、finality、isolation、artifact change、failure attribution。Data-analysis extension 注册 query execution/report/chart payload；data-engineering extension 注册 pipeline/schema/data-quality/lineage payload；data-science extension 注册 dataset split/experiment/model/metric/reproducibility payload。

与 Inspect 不同，`EvaluationEvidenceMap` 应允许 package declaration merging 或等价 typed registration；未知 required kind 拒绝读取，只有 producer 明确标记 ignorable 且 consumer 不需要其 projection 时才能跳过。与纯 OpenTelemetry span 不同，evaluation event 需要稳定 stage、case/attempt correlation、required/ignorable semantics 和 artifact access class。

### 7. Artifact store

Harbor 的 trial artifact tree/manifest、Inspect 的 attachment deduplication 和 remote log backends、MLflow 的 trace/dataset store 表明，大 payload 不应内联到每个 event。DSH 应定义 immutable `ArtifactRef`：

```ts
interface ArtifactRef {
  artifactId: ArtifactId;
  digest: Digest;
  mediaType: string;
  schemaId?: string;
  schemaVersion?: number;
  sizeBytes: number;
  producer: ComponentIdentity;
  access: "public" | "run-internal" | "grader-private";
  logicalRole: string;
}
```

Artifact store 应验证 digest、原子提交和 access classification。Required evidence collection 失败会阻止 grading；debug-only artifact 才允许 best effort。Artifact manifest 必须记录 missing、failed、empty 和 skipped，而不是把它们折叠成“不存在”。

### 8. Environment adapter

AgentCompass 和 Inspect 都证明 Environment/Sandbox 应是独立 provider，并拥有 open/init、exec、file transfer、connection、cleanup 和 capability declaration；Harbor 进一步证明 agent 与 verifier environment 可以不同，并需要 sidecar evidence collection。

数据领域的 DSH Environment protocol 不能等同于 `QueryExecutor.execute(sql)`。Core 只固定 lifecycle 与 capability negotiation：

```text
preflight(requirement, binding)
open(resolved plan)
act(typed domain action)
observe / collect artifact
list pending effects
settle | cancel | finalize
verify reset / cleanup
close
```

具体 action 由子领域 extension 注册。Data analysis 可以提供 query execution；data engineering 可以提供 pipeline/job/schema mutation；data science 可以提供 notebook/experiment/training action。Environment 返回 facts 和 finality evidence，不返回 Benchmark verdict。

### 9. Extensibility 与版本策略

Namespaced registration 是共同最佳实践；“默认 latest”与 process-global side effect 是共同风险。DSH 应要求：

- extension manifest 声明 protocol range、component kind、implementation version、source digest 和 required capabilities；
- composition root 将所有引用解析成 exact component identity；
- 同名注册冲突失败；
- required extension load failure 终止 preflight；
- active run 不受后续 registry mutation 影响；
- scorer、Context projection、Environment provider 和 evidence payload 各自版本化；
- schema structural change 使用 monotonic version；policy 内容变化使用 content digest；
- authoring workflow 可以选择 latest，persisted run 永远保存 resolved exact version。

## 已观察的具体失败模式

| 失败模式 | 一手实例 | DSH 防线 |
| --- | --- | --- |
| Hidden answer 进入执行侧对象 | Inspect `TaskState.target`；AgentCompass `PreparedTask` 可携带 ground truth | `PublicPreparedTask` 不含 private 字段；只传 opaque `GradingMaterialRef` |
| 配置覆盖改变评测语义 | Inspect 多层 override；lm-evaluation-harness CLI override；AgentCompass Recipe/config precedence | composition root 在运行前生成 immutable resolved plans；正式 run 不允许 correctness fallback |
| Adapter 能运行但不与原 benchmark 等价 | Harbor BIRD adapter 专门记录 evaluator alignment 和 repeated parity | migration status `validated | parity_unresolved | invalid`；逐 case parity 与 aggregate comparison |
| 只保存最终 reward，无法解释 | Harbor standard reward file；许多 model-centric harness 只存 metric | 保存 emission→parse→action→observation→artifact→grade correlation 和 failure facts |
| Required artifact collection 被当成 best effort | Harbor artifact collection 默认不使 trial fail | artifact declaration标记 required/debug；required 缺失阻断 grader |
| Event schema 对新领域封闭 | Inspect core-owned 23-member union | stable envelope + namespaced typed payload registry + standard projections |
| Plugin 未加载却继续运行 | lm-evaluation-harness 显式 plugin import failure logged and skipped | required capability preflight fail loud |
| `latest` scorer/dataset 改变历史含义 | MLflow scorer 默认可取 latest；living datasets 可持续更新 | run pin exact scorer version、dataset snapshot 和 digest |
| Exact matcher under-reward | OpenAI 官方说明 tool arguments 的 `1`/`1.0`、缩写等会导致 string-check false negative | Benchmark policy conformance suite包含 invariance 与 sensitivity probes |
| Framework lifecycle 使依赖失稳 | OpenAI Evals 已进入弃用窗口；HELM 已进入 maintenance mode | core 基于公开概念和自有协议，不绑定托管产品或 maintenance API |
| Log/trace 很丰富但不证明环境结束 | Inspect/MLflow 记录执行事件或 spans，但不自动证明外部 side effects settled | Environment 明确 pending/final/unresolved 和 cross-run separation evidence |
| 同机隔离被误写为绝对安全 | Harbor separate verifier 是 container/process boundary | 每种 provider 声明 threat model 与实际 enforcement；不做超额安全承诺 |

## 对 G10 的建议

### 建议锁定

1. **范围**：Data-domain Evaluation Core，支持数据工程、数据分析和数据科学；首个完整 vertical slice 是 data analysis，另两个子领域只需结构性 conformance fixture。
2. **核心数据结构**：`DataScopeManifest`、`BenchmarkPackManifest`、浅层 `CaseManifest`、`PublicPreparedTask`、`GradingMaterialRef`、`ResolvedRunPlan`、`RunIdentity`、`EvidenceEnvelope`、`ArtifactRef`、`GradeResult`。
3. **扩展模型**：稳定 envelope + namespaced typed payload registration。Core 不枚举 SQL row、pipeline job 或 model training 的全部 payload。
4. **评分**：Benchmark 拥有 policy；共享库拥有 mechanism；composition root 生成 immutable `ResolvedGradingPlan`；grader 可对 durable evidence 离线重放。
5. **隔离**：public/private material 在类型、dependency entry point、storage namespace 和 runtime access 上分离；heldout/fresh 采用同机独立 grader 或更强 sandbox。
6. **Environment**：requirement 与 binding 分开；provider 负责 lifecycle、capability enforcement、finality、separation 和 cleanup；Benchmark/Harness 不推断 provider-specific state。
7. **证据**：事件与 artifact 分开；事件保持关联和状态，artifact 负责大对象和领域产物；required artifact 缺失是显式评分前失败。
8. **身份**：所有影响 model-visible input、execution semantics、Context、grading 或 aggregation 的 resolved value 与 digest 进入 run identity。
9. **迁移**：仓内历史 case schema 是一次性 migration input，不保留为永久 runtime adapter；迁移仍要求 oracle validation、schema preservation、matched parity 和新 baseline。
10. **失败分类**：至少区分 preflight/config、interface incompatibility、model/harness、environment/finality、artifact/evidence、grader 和 benchmark defect；不得把非模型错误计入 model failure。

### 建议暂不锁定

- 数据工程、数据分析和数据科学的完整 evidence payload taxonomy；真实 extension 出现后再固化。
- 通用 action/observation union；首版只定义 lifecycle 与 typed extension registration。
- rolling/live benchmark protocol；当前没有已定义的产品需求支持它。
- 远端 grader；同机 process/sandbox 已满足首版 isolation path。
- 具体 npm package 名称；先锁 interfaces、ownership 和 dependency direction。
- 单一 artifact backend；先锁 `ArtifactRef` 与 storage capability，允许 local/content-addressed/remote provider。

## 建议的最小 conformance matrix

| Fixture | 目的 | 不应依赖 |
| --- | --- | --- |
| Data analysis：query + result/report | 首个生产 vertical slice，验证 Context、warehouse Environment 和 execution grading | 具体 DataScope 名称、case filename、ambient date |
| Data engineering：小型 pipeline + data-quality artifact | 证明 core 不把 Environment 等同于 SQL query，也能表达 side effect/finality | semantic layer、row comparator |
| Data science：固定 dataset split + deterministic metric artifact | 证明 core 能关联 dataset/model/metric/reproducibility evidence | warehouse scope、report delivery |
| Heldout isolation | 证明 Harness package、filesystem 和 tools 无法解析 private ref | “不要读取”约定 |
| Adapter migration parity | 证明 legacy case 迁移未改变测量语义 | loader 成功或 aggregate-only score |
| Evidence replay | 在不重新调用 model/Environment 的情况下使用另一合法 grading plan 重评 | transient in-memory state |
| Compatibility rejection | 任一 run-identity 关键字段不兼容时拒绝 delta | filename/category 猜测 |

## 来源缺口

1. AgentCompass 的文档和代码明确区分组件与 carrier，但未提供 cryptographic private-material capability 或正式 threat model；本文只把它作为 ownership 与 lifecycle 证据。
2. Harbor separate verifier 和 sidecar artifacts 提供实际隔离路径，但未证明 host-level adversary、malicious sandbox provider 或 kernel compromise 下的安全性。
3. Harbor adapter parity 的实现和报告格式已核验；不同 adapter 的统计设计并不统一，不能把 BIRD 的 150-case、三次运行当成通用阈值。
4. Inspect 的日志与 registry 已核验；未找到让第三方新增 durable event discriminant 而无需修改 core union 的公开接口。
5. OpenAI hosted Evals API 在 2026-09-10 仍可访问，但官方已公告 2026-10-31 只读、2026-11-30 关闭。Datasets 是产品 UI/workflow，不是可自托管 runtime protocol。
6. OpenAI 官方资料没有提供 Harness-private filesystem、verifier process、artifact mount 或 Environment finality 的公开 contract。
7. MLflow open-source tracking dataset 有 digest；immutable dataset version listing 在核验实现中只适用于 Databricks managed dataset。本文不把该托管能力外推到所有 MLflow deployments。
8. MLflow trace/span 与 scorer registry 很强，但没有 Benchmark/Harness/Environment ownership model，也没有 grader-private runtime isolation。
9. lm-evaluation-harness 和 HELM 主要针对 model request/response benchmark；本文没有把它们外推为 stateful data-agent Environment 实现。
10. HELM 从 2026-06-01 起处于 maintenance mode，只作为成熟设计历史样本。
11. 本次未发现一个经一手资料验证、同时覆盖 data engineering pipeline、data analysis agent 和 data science experiment 的统一开源 evaluation core；因此 DSH 的跨子领域 envelope 仍需通过自己的三个 conformance fixtures 验证。

## 一手来源索引

- [AgentCompass README](https://github.com/open-compass/AgentCompass/blob/c30a5d9472c0ed9afefad7bdabbf096db4c0f92a/README.md)
- [AgentCompass Architecture Overview](https://github.com/open-compass/AgentCompass/blob/c30a5d9472c0ed9afefad7bdabbf096db4c0f92a/docs/en/developer_guide/architecture/overview.mdx)
- [AgentCompass Runtime Contracts](https://github.com/open-compass/AgentCompass/blob/c30a5d9472c0ed9afefad7bdabbf096db4c0f92a/docs/en/developer_guide/architecture/contracts.mdx)
- [AgentCompass Execution Lifecycle](https://github.com/open-compass/AgentCompass/blob/c30a5d9472c0ed9afefad7bdabbf096db4c0f92a/docs/en/developer_guide/architecture/execution_lifecycle.mdx)
- [AgentCompass Benchmark Shared Contracts](https://github.com/open-compass/AgentCompass/blob/c30a5d9472c0ed9afefad7bdabbf096db4c0f92a/docs/en/developer_guide/extensions/benchmark/code_implementation/shared_contracts.mdx)
- [Harbor task documentation](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/docs/content/docs/tasks/index.mdx)
- [Harbor artifact collection](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/docs/content/docs/run-jobs/results-and-artifacts.mdx)
- [Harbor trial result](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/src/harbor/models/trial/result.py)
- [Harbor-Index adaptation patterns](https://github.com/harbor-framework/harbor-index/blob/5399ea1026fb2c7fc384cf8acd91a7d10fc943f3/ADAPTATIONS.md)
- [Harbor BIRD adapter](https://github.com/harbor-framework/harbor/tree/191d1b989bbba1d77c2db23e17aec308d7c08046/adapters/bird_bench)
- [Inspect Tasks](https://github.com/UKGovernmentBEIS/inspect_ai/blob/10cab1265e86c2f6f9aa5728052494a97059e968/docs/tasks.qmd)
- [Inspect Extension Components](https://github.com/UKGovernmentBEIS/inspect_ai/blob/10cab1265e86c2f6f9aa5728052494a97059e968/docs/extensions-components.qmd)
- [Inspect Sandbox Extensions](https://github.com/UKGovernmentBEIS/inspect_ai/blob/10cab1265e86c2f6f9aa5728052494a97059e968/docs/extensions-sandboxes.qmd)
- [Inspect Eval Logs](https://github.com/UKGovernmentBEIS/inspect_ai/blob/10cab1265e86c2f6f9aa5728052494a97059e968/docs/eval-logs.qmd)
- [Inspect event union](https://github.com/UKGovernmentBEIS/inspect_ai/blob/10cab1265e86c2f6f9aa5728052494a97059e968/src/inspect_ai/event/_event.py)
- [OpenAI Evals guide](https://developers.openai.com/api/docs/guides/evals)
- [OpenAI Evals API reference](https://developers.openai.com/api/reference/resources/evals)
- [OpenAI Graders guide](https://developers.openai.com/api/docs/guides/graders)
- [OpenAI Datasets guide](https://developers.openai.com/api/docs/guides/evaluation-getting-started)
- [OpenAI deprecations](https://developers.openai.com/api/docs/deprecations#2026-06-03-evals-platform)
- [OpenAI Evals OSS README](https://github.com/openai/evals/blob/8eac7a7de5215c907fbddc30efdaf316913eccdd/README.md)
- [OpenAI Evals OSS recorder](https://github.com/openai/evals/blob/8eac7a7de5215c907fbddc30efdaf316913eccdd/evals/record.py)
- [OpenAI Node SDK Evals resource](https://github.com/openai/openai-node/blob/fe2d6a382623b00753f002de539f8a26c936b5be/src/resources/evals/evals.ts)
- [MLflow Evaluation Dataset Concepts](https://github.com/mlflow/mlflow/blob/c5c9b6d3be593d108350b30816f2d7ee0c0c90ab/docs/docs/genai/concepts/evaluation-datasets.mdx)
- [MLflow Trace Concepts](https://github.com/mlflow/mlflow/blob/c5c9b6d3be593d108350b30816f2d7ee0c0c90ab/docs/docs/genai/concepts/trace.mdx)
- [MLflow Scorer Versioning](https://github.com/mlflow/mlflow/blob/c5c9b6d3be593d108350b30816f2d7ee0c0c90ab/docs/docs/genai/eval-monitor/scorers/versioning.mdx)
- [MLflow GenAI evaluate](https://github.com/mlflow/mlflow/blob/c5c9b6d3be593d108350b30816f2d7ee0c0c90ab/mlflow/genai/evaluation/base.py)
- [lm-evaluation-harness Task Guide](https://github.com/EleutherAI/lm-evaluation-harness/blob/b954108c9baaaa934b4ad842033b31a97ee30816/docs/task_guide.md)
- [lm-evaluation-harness Plugins](https://github.com/EleutherAI/lm-evaluation-harness/blob/b954108c9baaaa934b4ad842033b31a97ee30816/docs/plugins.md)
- [lm-evaluation-harness evaluator result metadata](https://github.com/EleutherAI/lm-evaluation-harness/blob/b954108c9baaaa934b4ad842033b31a97ee30816/lm_eval/evaluator.py#L393-L423)
- [HELM README and maintenance status](https://github.com/stanford-crfm/helm/blob/63754d05db6f874e41a395880fb573890a13e791/README.md#L25-L37)
- [HELM RunSpec](https://github.com/stanford-crfm/helm/blob/63754d05db6f874e41a395880fb573890a13e791/src/helm/benchmark/run_spec.py)
- [HELM Scenario](https://github.com/stanford-crfm/helm/blob/63754d05db6f874e41a395880fb573890a13e791/src/helm/benchmark/scenarios/scenario.py)
- [HELM AdapterSpec](https://github.com/stanford-crfm/helm/blob/63754d05db6f874e41a395880fb573890a13e791/src/helm/benchmark/adaptation/adapter_spec.py)
