# G10 — Evidence cut、正式评分与离线重评一手调研

日期：2026-09-11

## 结论先行

一手来源对较弱命题提供了强支持：正式评测必须保留足以重建评分输入的 durable record；不完整、失败或 outcome 尚未 final 的运行不能与完整 trial 等同；同一 execution record 应能在不重新调用 Agent 的情况下用另一 scorer/verifier 重评，并保留 scorer identity 与派生结果的 provenance。Inspect AI、Harbor、MLflow 和 AgentCompass 都分别实现了这一模式的重要部分，Evidence-Supported Agent Evaluation 与 Outcome Finality 两篇论文则给出了“证据不足时不能作强结论”的直接测量论证。

一手来源**没有**形成更强的共同规定：“首次正式 grading 必须先把所有输入写入存储，再从存储重新读取，绝不能消费内存对象。”Inspect 默认在线评分，MLflow 同时支持在线调用 `predict_fn` 后评分和对既有 `Trace` 评分，Harbor 的首次 verifier 也在 trial 生命周期中直接运行。因此，若把“必须 reload persisted log 才能 grade”写成论文要求，会夸大证据。

研究支持的更精确规则是：

> 正式 measurement 必须引用一个已经成功持久化、状态完整、内容可识别且之后不再变化的 evidence cut；grader 可以读取该 persisted cut，也可以读取与该 cut 完全相同的 sealed in-memory view，但在 cut 成功持久化并通过完整性检查前，grade 只能是 provisional，不能发布为正式 measurement。

这条规则把科学要求放在“正式结果能够由固定证据重建”上，而不是强制一次多余的磁盘回读。对 DSH，最稳妥的默认实现仍是让 grader 通过 `EvidenceCutRef` 读取 cut；只有经过等价性测试的同进程优化才允许直接消费 sealed view。

## 研究问题与判定标准

本调研检查六个问题：

1. 框架是否把 trajectory、sample、artifact、run identity 和 score 持久化；
2. 是否能对已有 record 离线评分或重评；
3. scorer 的确切输入是否可从 record 重建；
4. 是否有完整性、版本、digest、原子写入或不可变来源约束；
5. crash、cancel、partial run 或缺失 artifact 如何处理；
6. live score 是否被明确视为 provisional。

“直接来源要求”只包括论文或官方实现明确规定的行为；“DSH 设计推论”是根据多个来源共同暴露的问题，为本仓选择的更强约束。

## 核验来源与版本

| 来源 | 核验版本 | 与本问题的直接关系 |
| --- | --- | --- |
| Inspect AI | [`52b3088`](https://github.com/UKGovernmentBEIS/inspect_ai/tree/52b30883d1bf11a183fa82640429728595ea8d6f)，2026-09-10 | 完整 eval log、status、deferred scoring、post-hoc rescoring、score history、failed-run retry |
| Harbor | [`eeab9f0`](https://github.com/harbor-framework/harbor/tree/eeab9f0843e6af3fea2488b308b0098d8474ca98)，2026-09-10 | artifact-first separate verifier、recorded-trial regrade、source immutability、artifact manifest |
| AgentCompass | [`a1c9647`](https://github.com/open-compass/AgentCompass/tree/a1c96470d4d26e1b2bdc5c689f971a52f759ddce)，2026-09-11 | durable attempt checkpoints、原子化 detail/metric artifact、恢复与重新汇总 |
| OpenAI Trace grading / Evals | 官方文档于 2026-09-11 核验 | full trace 作为 grader 输入、异步 eval run/result；没有公开 immutable-cut contract |
| OpenAI Evals OSS | [`8eac7a7`](https://github.com/openai/evals/tree/8eac7a7de5215c907fbddc30efdaf316913eccdd)，2026-04-14 | append-only-style event recorder、周期 flush、final report；缺少 cut 完整性协议 |
| MLflow | [`c5c9b6d`](https://github.com/mlflow/mlflow/tree/c5c9b6d3be593d108350b30816f2d7ee0c0c90ab)，2026-09-10 | 既有 Trace 作为评分输入、Assessment、scorer version pin |
| HELM | [`63754d0`](https://github.com/stanford-crfm/helm/tree/63754d05db6f874e41a395880fb573890a13e791)，2026-06-23 | 持久化 RunSpec、ScenarioState、request/response 与 per-instance stats；文件集完成判定 |
| lm-evaluation-harness | [`ad8737a`](https://github.com/EleutherAI/lm-evaluation-harness/tree/ad8737ae7fad24cf64e50fc7fc31397bff586b9e)，2026-09-10 | aggregate result、可选 per-sample log、prompt/template hash 与执行配置 |
| Evidence-Supported Agent Evaluation | [arXiv:2505.10694](https://arxiv.org/abs/2505.10694) | evaluator 结论必须由预先声明、可验证的 artifacts 与 observation rules 支持 |
| Outcome Finality and Cross-Unit Separation | [arXiv:2608.14940v3](https://arxiv.org/abs/2608.14940v3) | endpoint 不等于 outcome final；缺失 finality evidence 时应 unresolved |
| Offline Preference-Based Trajectory Evaluation | [arXiv:2606.17541](https://arxiv.org/abs/2606.17541) | 从已记录完整 trajectory 离线比较 Agent 行为，不重新运行 Agent |
| Harbor Adapters and Harbor-Index | [arXiv:2609.04298v2](https://arxiv.org/abs/2609.04298v2) | trial artifact、verifier 与 adapter parity 的评测基础设施 |

## 一手来源事实

### Inspect AI：最直接的 durable-log rescoring 证据

Inspect 的 `EvalLog` 持久化 run specification、solver plan、aggregate results、usage、error、samples 和 multi-epoch reductions；每个 sample 包含 input、output、target、messages、store、events 和 scores。官方文档要求分析前检查 `status == "success"`，而读取全部 samples 的 API 默认拒绝 error/cancelled 的不完整 log。[Eval log schema 与 status](https://github.com/UKGovernmentBEIS/inspect_ai/blob/52b30883d1bf11a183fa82640429728595ea8d6f/docs/eval-logs.qmd#L178-L207) [Incomplete-log sample reading](https://github.com/UKGovernmentBEIS/inspect_ai/blob/52b30883d1bf11a183fa82640429728595ea8d6f/docs/eval-logs.qmd#L326-L336)

Inspect 可以用 `--no-score` 先生成未评分 log，再用 `inspect score` 对该 log 评分；也可以对已评分 log 使用新 scorer，默认生成新的 `-scored` 文件，或显式 append/overwrite。`score()` API 同样接受读回的 log，使多个 grader model 可以作用于同一 execution record，而不重复 generation。[Deferred scoring 与 score command](https://github.com/UKGovernmentBEIS/inspect_ai/blob/52b30883d1bf11a183fa82640429728595ea8d6f/docs/scoring-workflow.qmd#L6-L45) [Append/overwrite 与 score API](https://github.com/UKGovernmentBEIS/inspect_ai/blob/52b30883d1bf11a183fa82640429728595ea8d6f/docs/scoring-workflow.qmd#L53-L129)

源码明确从 serialized sample 重建 scoring-ready `TaskState`：恢复 attachments、target、messages、output、store、events 和 timelines，再运行 scorer。这说明可重评依赖的是一个足够完整的记录，而不是仅有 final answer 或 aggregate score。[`task_state_from_sample`](https://github.com/UKGovernmentBEIS/inspect_ai/blob/52b30883d1bf11a183fa82640429728595ea8d6f/src/inspect_ai/_eval/score.py#L417-L491)

失败或中断时 Inspect 仍写 log；`eval-retry` 从旧 log 恢复已完成 samples，并创建新 log而不覆盖原文件。这个行为直接区分“已保存的部分执行证据”和“可作为完整结果分析的 successful log”。[Errors and retries](https://github.com/UKGovernmentBEIS/inspect_ai/blob/52b30883d1bf11a183fa82640429728595ea8d6f/docs/_errors_and_retries.md#L1-L26) [Sample preservation](https://github.com/UKGovernmentBEIS/inspect_ai/blob/52b30883d1bf11a183fa82640429728595ea8d6f/docs/_sample-preservation.md#L1-L18)

Inspect 还为人工 score edit 保存完整 history 和 provenance，并在 sample event log 中追加 `ScoreEditEvent`。这支持“派生评分要留下审计历史”，但 Inspect 允许显式 overwrite log，远程 bucket 内容也可能可变，因此它没有要求所有正式记录在存储层天然 immutable。[Score history 与 audit event](https://github.com/UKGovernmentBEIS/inspect_ai/blob/52b30883d1bf11a183fa82640429728595ea8d6f/docs/eval-logs.qmd#L369-L457)

**直接支持：** completed persisted log 可成为 scorer 的完整输入；错误/取消 log 与 success log 不等价；重评可不重新运行模型；原评分和修改 provenance 可以保留。

**不直接支持：** 首次 scorer 必须在 persistence 成功后才执行；每个 log 必须有 content digest；所有 storage backend 都不可变；所有实时分数统一标记 provisional。

### Harbor：从 recorded artifacts 重评，而不是恢复 live agent environment

Harbor 的 single-step separate-verifier 流程先运行 Agent、上传 Agent logs、收集声明的 artifacts、停止 Agent environment，再运行 verifier。Verifier 因而面对的是已经从 Agent environment 导出的 artifact 集合，而不是继续操作活的 Agent process。[Single-step sequencing](https://github.com/harbor-framework/harbor/blob/eeab9f0843e6af3fea2488b308b0098d8474ca98/src/harbor/trial/single_step.py#L37-L55)

Harbor 现有 `RegradeTrial` 更直接：它以 recorded source trial 为输入，将 source trial 的 `agent/` 和 `artifacts/` 复制到新的 trial，再用新的 separate verifier 评分；源码明确规定 source trial 不被修改。是否可重评由 record 本身决定：新 verifier 声明的输入必须存在于 source artifact manifest；需要 live agent environment 的 shared verifier 被拒绝。[Regrade contract](https://github.com/harbor-framework/harbor/blob/eeab9f0843e6af3fea2488b308b0098d8474ca98/src/harbor/trial/regrade.py#L1-L12) [Regrade verifier restrictions](https://github.com/harbor-framework/harbor/blob/eeab9f0843e6af3fea2488b308b0098d8474ca98/src/harbor/trial/regrade.py#L79-L95)

缺失或不可读的 `artifacts/manifest.json` 会使 regrade fail loud，因为系统无法验证 artifact coverage。Manifest 记录 source、destination、file/directory type、collection status 和 service；它能证明声明输入是否被收集，却没有记录每个 artifact 的 content digest。[Manifest requirement](https://github.com/harbor-framework/harbor/blob/eeab9f0843e6af3fea2488b308b0098d8474ca98/src/harbor/trial/regrade.py#L191-L212) [Artifact manifest fields](https://github.com/harbor-framework/harbor/blob/eeab9f0843e6af3fea2488b308b0098d8474ca98/src/harbor/models/trial/artifact_manifest.py#L1-L19)

**直接支持：** verifier 可以并且应从 recorded output/artifact set 重评；source record 不应在重评中被修改；缺失输入 manifest 时不能继续；grader 不需要 live agent environment。

**不直接支持：** 首次 verifier 等待一个包含全部 trajectory、Environment receipt 和 cleanup evidence 的统一 cut；artifact bytes 有 cryptographic digest；trial result 持久化成功先于首次 verifier。

### AgentCompass：durable terminal checkpoint、原子写入与恢复语义

AgentCompass 将 logical attempt 的 terminal state 保存为 `AttemptCheckpoint`。失败但没有 result payload 的 checkpoint 只用于诊断，不能贡献最终 attempt，恢复时必须重跑；completed 或携带有效 payload 的 terminal checkpoint才可复用。[Attempt identity 与 reusable terminal state](https://github.com/open-compass/AgentCompass/blob/a1c96470d4d26e1b2bdc5c689f971a52f759ddce/src/agentcompass/runtime/attempts/repository.py#L18-L72)

文件 checkpoint 与 detail artifact 使用 temporary file、flush、`fsync` 和 `os.replace` 原子替换；持久化 detail 经过严格 schema/identity 校验，run metadata 保存 SHA-256 task fingerprints。Metric artifacts 可以从持久化 details 重新汇总，并记录 recomputation provenance。[Atomic checkpoint write](https://github.com/open-compass/AgentCompass/blob/a1c96470d4d26e1b2bdc5c689f971a52f759ddce/src/agentcompass/runtime/attempts/repository.py#L174-L205) [Atomic detail persistence](https://github.com/open-compass/AgentCompass/blob/a1c96470d4d26e1b2bdc5c689f971a52f759ddce/src/agentcompass/runtime/results/store.py#L1113-L1165) [Task fingerprints](https://github.com/open-compass/AgentCompass/blob/a1c96470d4d26e1b2bdc5c689f971a52f759ddce/src/agentcompass/runtime/results/store.py#L1564-L1575) [Atomic metric artifacts](https://github.com/open-compass/AgentCompass/blob/a1c96470d4d26e1b2bdc5c689f971a52f759ddce/src/agentcompass/runtime/results/store.py#L1756-L1799)

**直接支持：** terminal evidence 必须可恢复；无有效 payload 的中断不能当成 completed attempt；原子持久化和 identity fingerprints 是可复用结果的现实实现手段；summary 可以从 durable details 再生成。

**不直接支持：** scorer 只能消费一个跨所有 stores 的 immutable cut；task fingerprint 等同于完整 evidence digest；首次 Benchmark `evaluate()` 必须从磁盘重读。

### MLflow：同一评分入口同时支持在线生成和既有 Trace

`mlflow.genai.evaluate()` 接受 `Trace` objects 或包含 `trace` column 的 dataset；当 trace 已提供时，MLflow 从中提取 inputs、outputs、assessments、retrieved context 等中间信息用于 scoring，并禁止同时提供 `predict_fn`。同一 API 也允许提供 `predict_fn`，运行应用后立即评分。[`evaluate()` data contract](https://github.com/mlflow/mlflow/blob/c5c9b6d3be593d108350b30816f2d7ee0c0c90ab/mlflow/genai/evaluation/base.py#L221-L280)

MLflow Trace 保存 root inputs/outputs 与 step-level spans；Assessment 可附着到 trace 或具体 span。Scorer 可注册到 experiment 并形成递增版本，回归测试被明确建议 pin exact version，而不是隐式取 latest。[Trace concepts](https://github.com/mlflow/mlflow/blob/c5c9b6d3be593d108350b30816f2d7ee0c0c90ab/docs/docs/genai/concepts/trace.mdx#L11-L72) [Scorer versioning](https://github.com/mlflow/mlflow/blob/c5c9b6d3be593d108350b30816f2d7ee0c0c90ab/docs/docs/genai/eval-monitor/scorers/versioning.mdx#L9-L23) [Pinning for regression](https://github.com/mlflow/mlflow/blob/c5c9b6d3be593d108350b30816f2d7ee0c0c90ab/docs/docs/genai/eval-monitor/scorers/versioning.mdx#L109-L130)

**直接支持：** 已记录的完整 trace 是合法 scorer input；评分可以和应用执行解耦；grader/scorer identity 必须版本化才能复现。

**不直接支持：** Trace 必须 immutable；trace store 暴露统一 completeness cut；所有 span 和外部 artifacts 已 final；在线 `predict_fn` 路径的分数只能 provisional。MLflow 反而明确支持在线与离线两种模式。

### OpenAI：full trace 是评分对象，但公开协议不保证 immutable cut

OpenAI Trace grading 将 workflow trace 作为整体评分对象，而非只看 final response；官方 Evals 将 grader/testing criteria 与异步 run、result items 和 run status关联。这直接支持“正式 agent grading 的输入必须包含足以评估过程的 trace”，但公开文档没有规定 trace 必须先冻结成带 digest 的不可变 cut，也没有公开 crash 后如何证明 result item 对应完整 trace 的事务协议。[Trace grading](https://developers.openai.com/api/docs/guides/trace-grading) [Evals guide](https://developers.openai.com/api/docs/guides/evals) [Evals API reference](https://developers.openai.com/api/reference/resources/evals)

OpenAI Evals OSS 的 recorder 为 event 分配 run ID、event ID、sample ID、type 和 timestamp，按条追加到 local JSONL 或远端 recorder，并在最后追加 final report。它周期性 flush，也注册 `atexit` flush；这提高了 crash 后保留部分事件的概率，却没有原子“整次 run cut 已完整”的 marker 或 content digest。[Recorder event model 与 flush](https://github.com/openai/evals/blob/8eac7a7de5215c907fbddc30efdaf316913eccdd/evals/record.py#L43-L88) [Incremental event recording](https://github.com/openai/evals/blob/8eac7a7de5215c907fbddc30efdaf316913eccdd/evals/record.py#L119-L185) [Local JSONL 与 final report](https://github.com/openai/evals/blob/8eac7a7de5215c907fbddc30efdaf316913eccdd/evals/record.py#L316-L371)

**直接支持：** trace/event record 和 run identity 是评测资产；异步 run 需要显式 status；append record 可以保留部分执行证据。

**不直接支持：** OSS recorder 的部分 JSONL 足以产生正式成绩；final report 等于经过完整性验证的 cut；hosted trace grading 可离线复算且具有公开 immutable/digest contract。

### HELM 与 lm-evaluation-harness：durable artifacts 是常规做法，但完整性保证较弱

HELM 每个 run 写出 `run_spec.json`、`scenario.json`、包含所有 model request/response 的 `scenario_state.json`、per-instance stats 和 aggregate stats；summarizer 从这些既有文件生成 suite summary。Runner 只有在全部预期文件存在时才把 run 判为 completed，否则不会因目录存在而跳过。[HELM output artifacts](https://github.com/stanford-crfm/helm/blob/63754d05db6f874e41a395880fb573890a13e791/docs/tutorial.md#L25-L53) [Completed-run check](https://github.com/stanford-crfm/helm/blob/63754d05db6f874e41a395880fb573890a13e791/src/helm/benchmark/runner.py#L193-L237)

lm-evaluation-harness 保存 aggregate result，并记录 model/config、random seeds、git hash、date、environment 和 tokenizer identity；启用 sample logging 时另写 per-task JSONL。它证明持久化 sample/result 与完整 run config 是成熟 benchmark 的常规能力，但本次核验未发现一个从 sample JSONL 重新执行任意 metric 的官方通用 rescore API，也没有跨 aggregate/sample 文件的 atomic cut 或 digest。[Evaluation identity](https://github.com/EleutherAI/lm-evaluation-harness/blob/ad8737ae7fad24cf64e50fc7fc31397bff586b9e/lm_eval/evaluator.py#L393-L423) [Aggregate and sample persistence](https://github.com/EleutherAI/lm-evaluation-harness/blob/ad8737ae7fad24cf64e50fc7fc31397bff586b9e/lm_eval/loggers/evaluation_tracker.py#L260-L281) [Per-sample JSONL](https://github.com/EleutherAI/lm-evaluation-harness/blob/ad8737ae7fad24cf64e50fc7fc31397bff586b9e/lm_eval/loggers/evaluation_tracker.py#L320-L422)

**直接支持：** run configuration、request/response 或 per-sample evidence、per-instance metric 与 aggregate result应该落盘；incomplete artifact set 不应冒充 completed run。

**不直接支持：** 通用 agent trajectory 的 offline regrade；artifact bytes integrity；所有 live score 必须 provisional。

## 论文层面的支持与边界

### Evidence-Supported Agent Evaluation：正式结论必须由完整、可验证的 record 支持

Evidence-Supported Agent Evaluation 将 evidence unit 定义为 task instruction、sandbox initialization、agent activity、final artifacts 和 environment state等材料，并要求 evaluator 在读取全部 required artifacts 后才应用 observation rules。若所需 artifact 缺失、损坏或矛盾，输出应为 unknown，而不是强行给 success/failure。其发布的 reference implementation也以 JSON artifacts 和显式 run specification 为输入。[论文](https://arxiv.org/abs/2505.10694) [官方实现](https://github.com/CooperWolf/evidence_supported_agent_evaluation/tree/470805f6912de79d0ad32dcb637a58899c1c828c)

这是“证据不完整不能发布正式 verdict”的最直接论文支持，但论文关注 evidence sufficiency 与保守判定，没有要求统一 content digest、原子跨存储 snapshot 或先写盘再调用 analyzer。

### Outcome Finality：Agent 停止不等于可评分 outcome 已经确定

Outcome Finality and Cross-Unit Separation 指出 evaluator 常在 run stop 时观察状态并立即评分，但若 delayed side effect 后续仍会改变结果，该 score 不能解释为 final outcome。论文要求声明 outcome、observation period、system boundary 和 analysis unit，枚举 pending effects，并用 terminal observation、verified cancellation 或其他证据建立 finality；证据不足时应缩小 claim 或标记 unresolved。[论文正文与 completion argument](https://arxiv.org/abs/2608.14940v3)

这直接支持 DSH 在 seal evidence cut 前等待 Environment finality，并把 unresolved 与 ordinary incorrect 分开。它不要求 evidence 使用哪种数据库或文件格式，也没有规定 grader 必须从持久化存储重新读取。

### Offline trajectory evaluation：记录足够完整的 trajectory 才能真正离线评估

Offline Preference-Based Trajectory Evaluation for LLM Agents 将已生成 trajectories 作为离线输入，通过 preference-based judge 比较策略，而不在评分时重新运行 Agent。它支持 execution 与 evaluation 解耦，也说明 trajectory evaluator 需要比 final answer 更完整的过程信息。[论文](https://arxiv.org/abs/2606.17541)

该工作评估的是离线 preference estimator，不是一个 durability 或 crash-consistency 规范；它没有证明“任何在线初评都无效”。

### DAREBench、Harbor 论文与 interface-censoring 工作

DAREBench 强调联合检查 trajectory 和最终 artifact；Harbor Adapters/Harbor-Index 将 agent run、environment、verifier、artifact 与 parity 作为独立但关联的评测对象；Interface-Induced Trajectory Censoring 说明 interface 可能让关键 action/observation 在 scorer 可见 trace 中消失。这些工作共同支持“cut 必须覆盖 scorer 声称使用的全部 evidence channel”，但都没有给出一个通用、跨存储的 immutable-cut wire protocol。[DAREBench](https://arxiv.org/abs/2609.06059) [Harbor Adapters/Harbor-Index](https://arxiv.org/abs/2609.04298v2) [Interface-Induced Trajectory Censoring](https://arxiv.org/abs/2609.03966)

## 结论矩阵

| 命题 | 一手支持强度 | 结论 |
| --- | --- | --- |
| 正式结果需要 durable run/sample/trajectory/artifact record | 强 | Inspect、Harbor、AgentCompass、HELM、lm-eval、MLflow 均落地了不同程度的持久化 |
| 同一 execution evidence 应可离线重评 | 强 | Inspect `score(log)`、Harbor `RegradeTrial`、MLflow Trace scoring 直接支持 |
| scorer 输入必须足以重建其观察 | 强 | Inspect 重建 `TaskState`；Harbor 校验 artifact manifest；Evidence-Supported Evaluation 对缺失 artifact 返回 unknown |
| incomplete/crashed run 不得当作完整 trial | 强 | Inspect status/read guard、AgentCompass reusable checkpoint、HELM expected-file completion、Outcome Finality |
| 重评不得修改原始 execution evidence | 中强 | Harbor 明确 source trial never modified；Inspect 默认新建 scored log但允许 overwrite；其他系统不统一 |
| grader/scorer identity 必须固定 | 强 | Inspect log scorer info、MLflow scorer versions、HELM RunSpec、AgentCompass run metadata |
| 每个 evidence cut 必须有 cryptographic content digest | 弱 | AgentCompass 有 task fingerprints 和原子 artifact 写入；其余系统多为 partial identity 或 manifest，无共同要求 |
| 初次 grade 必须先持久化再从 store reload | 不支持为共同要求 | 主流框架常在线评分；支持的是 durable/replayable evidence，而非强制 I/O 顺序 |
| 所有 live score 都明确 provisional | 部分 | Inspect 对 incomplete status 有明确 guard；其他框架通常允许在线评分，没有统一 provisional 术语 |
| cleanup 成功必须早于 grade computation | 无直接共识 | Outcome Finality约束 score claim；cleanup 更直接约束 separation 与 measurement publishability |

## DSH 设计推论

以下是结合来源作出的 G10 设计建议，不冒充论文原文。

### 1. 把“grade 计算”和“measurement 发布”分开

建议 attempt 形成以下状态：

`running → sealing → sealed → grade-computed → publishable`

- `sealing`：停止接受新 Agent input，等待 Agent-owned work 与 Environment finality，flush Session Store、Evaluation Store 和 Artifact Store；
- `sealed`：形成完整 evidence manifest、明确 completeness/finality 状态，并计算 cut identity；
- `grade-computed`：grader 对 sealed cut 产生派生 `GradeRecord`；
- `publishable`：所需 separation/cleanup 成功，measurement 可进入正式 aggregation。

这样 cleanup failure 不会抹掉已有证据和 grade，但该 attempt 不能伪装成独立、可聚合的正式 trial。

### 2. 正式 grade 引用 `EvidenceCutRef`，不引用 live Agent

建议输入为：

`EvidenceCutRef + GradingMaterialRef + ResolvedGradingPlan → GradeRecord`

Product subject 的 cut 至少引用：

- DSH Session Log 的 `sessionId + event sequence range + session format version + digest`；
- Evaluation evidence IDs；
- Environment completion/finality/separation receipts；
- immutable artifact refs 与 manifest；
- Benchmark、Harness、model、Provider、Context、Observer 和 attempt identities；
- completeness 状态及所有缺失项。

Component subject 可以使用 `ComponentEvidenceCutRef`，不应伪造 DSH Session Log。

### 3. 允许 sealed in-memory optimization，但正式结果绑定 persisted bytes

严格要求每次 grader 先从磁盘重新读取没有一手共识，也会增加无意义 I/O。建议接口语义仍以 `EvidenceCutRef` 为准：

- 默认 grader provider 从 store 解引用；
- 同进程 provider 可以消费 sealing 阶段得到的 immutable object；
- 在 grade 发布前，必须证明该 object 的 canonical digest 与已持久化 cut 相同；
- persistence 或 digest verification 失败时，live grade 保留为 diagnostic，不产生正式 measurement。

### 4. 原 execution cut 不可覆写，重评产生派生记录

Inspect 的 overwrite 是方便的工具能力，不适合作为 DSH 正式审计默认。建议：

- `EvidenceCut` 一经 sealed 永不修改；
- 每次重评创建新的 `GradeRecordId`；
- `GradeRecord` 保存 evidence cut digest、grading plan digest、grader identity、时间、结果和失败；
- aggregate measurement 引用明确的 grade records；
- 人工修订以新的 adjudication record 表达，不改写旧 grade。

### 5. incomplete、unresolved 和 invalid 不进入 correctness 分母

建议分别表示：

- `incomplete`：所需 session/evidence/artifact 未全部持久化；
- `unresolved`：记录完整，但 Environment outcome finality 未建立；
- `invalid`：digest、schema、identity、grader input 或 configuration 不一致；
- `incorrect`：证据完整、finality 成立后，Benchmark policy 判定不正确。

这一区分来自 Inspect 的 status/read guard、AgentCompass 的 reusable checkpoint、Evidence-Supported Evaluation 的 unknown 和 Outcome Finality 的 unresolved，而不是某一个框架的统一枚举。

### 6. Live scoring 保留，但只能用于明确用途

Live scorer 可以用于 UI、调试、early warning、cost control 或显式 intervention experiment。它必须：

- 标记 `provisional`；
- 不进入 baseline、CI regression、Goodhart audit 或 headline metric；
- 不向被测 Agent 回传，除非作为显式 Intervention 并进入 Harness identity；
- 在 sealed cut 上重算或验证后才能产生正式 grade。

## 对 Question 14 的建议答案

不建议把原命题原样写成“grader 必须先从持久化存储重新读取”。建议记录为：

> 正式 `GradeRecord` 必须绑定一个已成功持久化、sealed、内容可识别且 completeness 已验证的 `EvidenceCut`。Grader 不得读取 live Agent、可继续变化的 Environment 或未封口的 event stream。实现可以从 store 解引用 cut，也可以使用与 persisted cut 具有相同 canonical digest 的 sealed in-memory view。持久化、finality 或完整性验证失败时，任何已算出的 live grade 都只是 provisional；只有满足 separation/cleanup policy 后，measurement 才可发布和聚合。

这个版本有直接来源支持，同时避免把“磁盘回读顺序”误当成测量原则。

## 明确来源缺口

1. 没有核验到一篇论文或主流框架规范要求跨 Session Store、Evaluation Store、Artifact Store 和 Environment receipt 做原子事务 snapshot。
2. 没有共同的 evidence-cut content-digest schema；AgentCompass 的 task fingerprint、Harbor 的 task checksum/manifest、MLflow dataset digest 和 Inspect attachment hash都只覆盖局部对象。
3. 没有统一规定 live score 必须标为 provisional；这是 DSH 为避免 UI/中间结果进入正式统计而增加的语义。
4. 没有统一规定 cleanup 成功先于 grade computation；来源支持的是 finality/separation 与结论强度匹配，因此 DSH 应把 grade computation 与 measurement publishability 分开。
5. OpenAI hosted Trace grading 的公开文档没有暴露内部 trace sealing、事务一致性、crash recovery 或 offline rescore protocol。
6. MLflow Trace 和 Assessment强调可查询、可追加和协作，不提供 Benchmark-grade immutability guarantee。
7. HELM 与 lm-evaluation-harness 保存丰富文件，但没有 cryptographic evidence-set manifest 或通用 agent-trajectory regrade contract。
8. Harbor regrade 对 artifact manifest 做 coverage 检查，但当前 manifest entry 没有 content digest；source directory 的外部修改不由该 schema检测。
9. Inspect 支持 overwrite scores/log，说明“原始记录不可变”不是其强制平台语义；DSH 若采用 append-only derived grades，是更严格的审计选择。
10. AgentCompass 的 durable checkpoint 和 atomic file write 很强，但尚未构成跨 session、environment 和 artifact providers 的统一 evidence cut。

## 最终判断

**论文和成熟框架支持 Question 14 的目标，但不完全支持原始实现措辞。** 应保留“正式结果只能建立在完成、持久、可重放的证据上”，把“必须从磁盘重读”放宽为“必须绑定并可由 persisted sealed cut 重建”。这能同时获得：

- crash 后不发布幽灵成绩；
- grader 与 Agent execution 解耦；
- 同一 evidence 的离线 rescore；
- scorer/policy 变化可归因；
- incomplete、unresolved、invalid 与 incorrect 分离；
- 不因强制回读而给所有同进程 grader增加无意义延迟。
