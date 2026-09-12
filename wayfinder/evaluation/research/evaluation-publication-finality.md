# Agent Evaluation 正式测量的完成、取证、评分、清理与发布顺序

日期：2026-09-11

## 结论先行

截至 2026-09-11，没有一篇被核验的论文或一个成熟框架给出并证明一条适用于所有 agent evaluation 的固定全序：`Environment finality → evidence persistence → grading → cleanup → publication`。一手来源共同支持的是一组更强、更精确的**偏序约束**：最终成功或失败标签要求相关 outcome 已经定案；将 run 计作独立 trial 还要求跨 run separation；正式 claim 要能从保留的完整 evidence 重算，并且实验 coverage 不能静默缺行；grader 依赖的 artifact 必须在破坏性 teardown 前收集；正式聚合与发布必须晚于这些 claim-specific 条件。评分计算与 cleanup 的相对顺序则取决于 grader 是否需要 live Environment。

最有力的一手支持来自 Outcome Finality 与 ClaimReceipt。Outcome Finality 将“当前 outcome 是否定案”和“该 run 是否能被计作独立 observation”明确分成两个可独立成立的判断；因此一个 correctness grade 可以已经计算甚至已经固定，但若 cleanup/reset/separation 尚未证明，它仍不能进入独立-trial headline、`pass@n`、置信区间或跨 run delta。[Outcome Finality §2、§6.2、§7](https://arxiv.org/pdf/2608.14940v3#page=3) ClaimReceipt 又把 claim-sufficient evidence 与 committed experiment coverage 分开：缺最后一个 terminal receipt 时，已保留的 29 条记录仍形成有效前缀，部分 protocol claim 仍可验证，但 coverage、完整 accounting 和 descriptive licensing 被阻塞。[ClaimReceipt §3.1、§5.6、Table 7](https://arxiv.org/pdf/2609.01992v1#page=3)

一手来源强烈支持“缺失或崩溃不是默认零分，也不是默认可发布结果”。Inspect AI 将正常 runtime error 写成 `status="error"` 并保留已完成 samples，将进程崩溃留下的 log 保持为 `status="started"`；只有恢复过程能对齐全部 expected samples 并重新计算 metrics 时，log 才能 finalized 为 `success`。ECP 要求 timeout、agent crash 或 protocol violation 降级为显式 failed/skipped records，且未产生 result 的 step 至少贡献一个 failed check，防止缺失行静默提高 pass rate。[Inspect Handling Errors](https://github.com/UKGovernmentBEIS/inspect_ai/blob/52b30883d1bf11a183fa82640429728595ea8d6f/docs/handling-errors.qmd#L8-L20) [Inspect Handling Errors](https://github.com/UKGovernmentBEIS/inspect_ai/blob/52b30883d1bf11a183fa82640429728595ea8d6f/docs/handling-errors.qmd#L125-L207) [ECP protocol](https://github.com/evaluation-context-protocol/ecp/blob/5ed863811e79fa708481d3213fd733391033d593/spec/protocol.md#L151-L179)

一手来源支持 durable evidence 与 offline scoring，但没有直接证明“grader 必须在 persistence 完成后才允许执行”。Inspect 可以先用 `--no-score` 生成 durable unscored log，再离线 score 或 rescore；OpenAI Evals 将 sample events 增量 flush，并在 `eval.run()` 返回后追加 final report；Harbor 则在 agent 完成后先收集 artifacts，再运行 verifier，并最终停止 Environment 和写入 `result.json`。这些实现证明多种顺序都存在，也暴露了为什么 DSH 不能把某一框架的调用顺序直接当成测量有效性证明。[Inspect Scoring Workflow](https://github.com/UKGovernmentBEIS/inspect_ai/blob/52b30883d1bf11a183fa82640429728595ea8d6f/docs/scoring-workflow.qmd#L6-L70) [OpenAI Evals `oaieval.py`](https://github.com/openai/evals/blob/8eac7a7de5215c907fbddc30efdaf316913eccdd/evals/cli/oaieval.py#L218-L239) [Harbor `single_step.py`](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/src/harbor/trial/single_step.py#L37-L61)

对 DSH 最稳健的设计推论不是强迫所有内部动作采用一个固定全序，而是区分三个状态：`grade computed` 表示 grader 已经对一个明确 evidence input 得出结果；`measurement publishable` 表示 evidence sufficiency、coverage、outcome finality 和所声明的 Environment assurance 均已满足；`independent-trial eligible` 进一步表示 cross-unit separation 与 cleanup/reset verification 支持将该 attempt 作为独立 observation 聚合。cleanup 失败时应保留已经计算出的 grade 与所有失败证据，但默认阻塞 publishability 或 independent-trial eligibility，而不是删除 grade、改写成模型失败，或继续无标记聚合。

## 研究问题与方法

本调研只回答一个问题：正式 agent-evaluation measurement 在 Environment finality、evidence persistence、grading、cleanup 与 publication 之间需要哪些顺序约束。重点核验 incomplete/crashed attempts、cleanup failure、artifact completeness、independent-trial eligibility，以及“grade 已计算但不可发布”是否有一手支持。

来源限于论文固定版本、官方规范、官方文档和官方仓库固定 commit。论文结论与框架实现事实分别记录；框架实现只证明某种机制已经存在，不自动证明该机制具有测量有效性。DSH 设计推论单列，不把推论写成论文原结论。

核验对象如下：

| 来源 | 固定版本或提交 | 本调研关注点 |
| --- | --- | --- |
| Outcome Finality | [arXiv:2608.14940v3](https://arxiv.org/abs/2608.14940v3)，2026-08-27 | outcome finality、cross-unit separation、open effects、final label 与 analysis unit |
| Interface-Induced Trajectory Censoring | [arXiv:2609.03966v1](https://arxiv.org/abs/2609.03966v1)，2026-09-03 | retained raw evidence、silent interface failure、observability completeness |
| HarnessDev | [arXiv:2609.01437v1](https://arxiv.org/abs/2609.01437v1)，2026-09-01 | frozen Harness artifact、formal evaluation completion、diagnostic probe 与 official version |
| DAREBench | [arXiv:2609.06059v1](https://arxiv.org/abs/2609.06059v1)，2026-09-05 | artifact contract、trajectory-aware audit、timeout/incomplete-output false credit |
| Harbor Adapters / Harbor | [arXiv:2609.04298v2](https://arxiv.org/abs/2609.04298v2)，2026-09-09；[`191d1b9`](https://github.com/harbor-framework/harbor/tree/191d1b989bbba1d77c2db23e17aec308d7c08046) | artifact collection、verifier ordering、teardown、result persistence、aggregate behavior |
| ECP | [arXiv:2608.19263v1](https://arxiv.org/abs/2608.19263v1)，2026-08-18；[`5ed8638`](https://github.com/evaluation-context-protocol/ecp/tree/5ed863811e79fa708481d3213fd733391033d593) | degraded run、planned/executed coverage、audit record、reset |
| ClaimReceipt | [arXiv:2609.01992v1](https://arxiv.org/abs/2609.01992v1)，2026-09-02 | claim-sufficient evidence、committed coverage、terminal receipts、selective abstention |
| Inspect AI | [`52b3088`](https://github.com/UKGovernmentBEIS/inspect_ai/tree/52b30883d1bf11a183fa82640429728595ea8d6f)，2026-09-11 核验 HEAD | crash recovery、log status、sample completeness、offline scoring |
| OpenAI Evals OSS | [`8eac7a7`](https://github.com/openai/evals/tree/8eac7a7de5215c907fbddc30efdaf316913eccdd)，2026-09-11 核验 HEAD | incremental flush、final report、partial gentle-interrupt report |

## 一手来源事实

### Outcome Finality：final label 与 independent-trial interpretation 是两次不同的许可

论文把 endpoint 定义为 evaluator 停止请求新 action 的时刻，并指出 endpoint 只给出最初可评分的 observation；它既不保证仍在运行的 operation 不会改变当前 outcome，也不保证前一次 run 的 state 不会改变下一次 run。一个最终 success/failure label 要求所有能够改变所声明 outcome 的相关 effect 已 terminal，或其剩余变化范围已经窄到不会改变 label；否则结果应保持 unresolved。[Outcome Finality Abstract、§1–§2](https://arxiv.org/pdf/2608.14940v3#page=1)

论文把 cross-unit separation 独立定义为：在预先声明的 system boundary 内，一个 run 不能改变另一 run 的相关起始条件或 outcome。等待 delayed operation 完成可以使当前 label 定案，却仍把结果留在共享状态中；反过来，隔离可以保护下一 run，却不能让当前未完成 operation 自动变成 final。因此 finality 与 separation 不能被一个 `cleanup succeeded` Boolean 合并。[Outcome Finality §2、Table 1](https://arxiv.org/pdf/2608.14940v3#page=3)

论文明确指出，一般性的“环境已清理”说明不足以支持独立 trial；protocol 必须说明恢复了什么、如何验证，以及该证据支持 outcome finality、cross-unit separation 或两者中的哪一个。若 pending effect 仍可能重建已 reset 的共享状态，reset 本身也不足以证明 separation。[Outcome Finality §2](https://arxiv.org/pdf/2608.14940v3#page=3)

论文建议 open-effects record 在 operation 或 resource 开始时登记 stable handle、endpoint status、possible later states 和 cross-run route；endpoint 之后继续检查 terminal state，并保留 cancellation/removal 成功的系统证据。普通 trajectory 只能表明 agent 请求过 operation，不足以证明 operation 最终成功、失败或修改了共享状态。[Outcome Finality §6.1](https://arxiv.org/pdf/2608.14940v3#page=9)

对正式聚合，论文结论是：只有 outcome finality 才支持 final label，只有 cross-unit separation 才支持把 run 计作独立 observation；若 runs 仍连接，应建模依赖或把连接集合升级为 analysis unit。run id 本身不产生独立性，未解决 effect 必须报告 uncertainty。[Outcome Finality §6.2–§7](https://arxiv.org/pdf/2608.14940v3#page=9)

这篇论文不要求先持久化 evidence 再运行 grader，也不定义数据库事务、digest、artifact store 或 publication API。它约束的是一个 score 能支持什么 claim，而不是结果文件的具体写入顺序。

### ClaimReceipt：可重算的单条 claim 与完整实验 coverage 仍是两层判断

ClaimReceipt 将 sufficiency 定义为：两个 admissible executions 若留下相同 evidence projection，就不能对目标 claim 具有不同 truth value。当 required evidence 缺失时，verifier 不得用一个报告出的 scalar 代替；它必须 reject 或 abstain。该定义直接支持“已有 score 数字不等于 evidence 足够”。[ClaimReceipt §2.1](https://arxiv.org/pdf/2609.01992v1#page=2)

规范把 evidence 分成 transport integrity、semantic evidence、experiment coverage 和 external truth 四层。semantic evidence 负责让 claim 可重算；coverage 将 terminal receipts 绑定到预先承诺的 assignment matrix 和 ingress commitment，使 committed ingress 之后的遗漏可见。hash-linked log 只能保护已记录内容不被篡改，不能证明没有漏掉整条 terminal record。[ClaimReceipt §3.1–§3.3](https://arxiv.org/pdf/2609.01992v1#page=3)

CR-3 prospective experiment 预先承诺 30 个 assignments，并签发 chained terminal receipts。移除最后一条 terminal receipt 后，29 条 retained receipts 仍形成有效 prefix，C2 protocol claim 仍为 Pass，但 coverage 与 C4 accounting 变成 Inconclusive，descriptive licensing 被阻塞。移除 private openings 时，coverage 和 protocol verification 仍可通过，但 economic claims 变成 Inconclusive。它证明同一 evidence bundle 可以许可某些 claims、阻塞另一些 claims。[ClaimReceipt §5.6、Table 7](https://arxiv.org/pdf/2609.01992v1#page=6)

论文因此直接支持“computed claim result 与 publication license 分离”。它没有讨论 Environment pending side effects、cleanup、namespace reset 或 agent workspace teardown；coverage 也只保证 committed ingress 内的完整性，无法证明 ingress witness 之前没有任务被选择性阻止。

### Interface-Induced Trajectory Censoring：artifact 不完整会让失败归因错误

Interface Censoring 的核心发现是：HTTP 200、空 `tool_calls` 和看似完整的单轮 trajectory 可以掩盖 serving interface 已经删除或无法解析模型实际发出的 tool intent。其五层 measurement 把 raw emission、serialization、parse、execution 和 downstream outcome 分开，说明只保留最终 parsed event 会把 interface failure 错归因为模型不调用工具。[Interface Censoring §1、Figure 1](https://arxiv.org/pdf/2609.03966v1#page=2)

论文还明确承认一项审计限制：部分 rollout 未保留完整 raw text，因此相关 audit 只能覆盖日志中仍存在的 fragments。这个限制支持“缺少 grader 或 failure-attribution 所需 artifact 时，应收窄 claim 或标记证据不足”，但论文不讨论 cleanup 或 formal publication 状态机。[Interface Censoring §6](https://arxiv.org/pdf/2609.03966v1#page=13)

### HarnessDev：只有完成 formal evaluation 的 frozen artifact 才成为 official version

HarnessDev 的 evaluation unit 是 frozen runnable Harness artifact。Creator 完成开发后冻结 Harness，Executor 才在 downstream task 上运行，Evaluator 对输出评分；creator、Harness artifact、runtime executor 和 downstream score 是不同 identity。[HarnessDev §3.1](https://arxiv.org/pdf/2609.01437v1#page=4)

Evolution 中的 official version 必须以同一 frozen version 完成完整的 100-task SWE-Pro 与 89-task Terminal-Bench formal evaluation；临时 probes 只作 diagnostic，不进入 official-version trajectory。论文报告 73 个 official versions 和 64 个相邻 version switches，并把 heldout evaluation 延迟到全部 development trajectories 结束之后。[HarnessDev §3.4](https://arxiv.org/pdf/2609.01437v1#page=11)

该设计支持“完成声明的 formal workload 与冻结 identity 后才能发布 official comparison”，但论文不定义单个 task 的 durable evidence cut、cleanup receipt 或 crash recovery。项目页在 2026-09-11 仍未提供可核验的 HarnessDev runner 仓库、逐 run artifacts 或 hidden-split manifests，因此不能从实现判断其 task failure 与 cleanup 如何进入 aggregate。

### DAREBench：完整 artifact contract 先于可靠评分，timeout 不应获得正分

DAREBench 将 task 定义为 instruction、initial workspace、tools、artifact contract、task-specific scorer 和 time budget。artifact contract 列出 required output paths 与 validity predicates；完整 contract satisfaction 要求 final workspace 中每个 required artifact 都通过对应 predicate。任务构建的 feasibility filter 会移除无法定义显式 artifact contract 或可靠 scorer 的任务。[DAREBench §3.1–§3.2](https://arxiv.org/pdf/2609.06059v1#page=4)

DAREBench 不只读取 final answer，还保存 unified execution trajectory，并使用 automated、LLM-based 或 hybrid scoring 与 evidence-based audit。论文的 judge audit 明确列出 partial-progress praise、timeout-with-credit、pseudo-tool-call credulity 和 malformed/incomplete output 等失真模式；其 deterministic pre-filter 与 independent meta-judge 用来发现这些正分误判。[DAREBench §3.3、§4.3、Appendix C](https://arxiv.org/pdf/2609.06059v1#page=5)

这直接支持：timed-out/incomplete attempts 不能因为局部进展或语言流畅而默认获得正式 correctness credit；grader 需要核对 executable action 与 required artifact。论文没有公开可核验 runner 仓库，因此 artifact persistence、Environment teardown 与 result publication 的调用顺序只能从论文描述推断，不能用代码确认。

### Harbor：实现上先收集 grader 输入，再 verifier；cleanup 与 aggregate gate 仍有缺口

Harbor 的 single-step trial 顺序是：运行 agent、同步 agent logs、收集 artifacts、按 verifier mode 停止 agent Environment、运行 verifier，最后确保 agent Environment 停止。Separate verifier mode 在 verifier 前停止 agent Environment，并将已收集 artifacts 上传到独立 verifier Environment；shared mode 在同一 Environment 中 verifier 完成后再停止 Environment。[Harbor `single_step.py`](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/src/harbor/trial/single_step.py#L37-L61) [Harbor `trial.py`](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/src/harbor/trial/trial.py#L674-L785)

artifact collection 分 main service 与 sidecar 两遍进行；在 separate verifier mode，Harbor 可以先停止 agent 可写的 main service，再从 agent 不可写的 sidecar filesystem 拉取 evidence，以减少 leftover agent process 干扰证据收集。这个实现为“grader 所需 artifact 应在 destructive teardown 前可靠收集，并防止 Agent 在取证期间继续改写 verifier evidence”提供了直接先例。[Harbor `trial.py`](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/src/harbor/trial/trial.py#L1246-L1307)

Harbor 的 `_finalize()` 先关闭 bridge、停止 agent Environment，再写 `result.json` 和发送 `END` hook；Environment stop failure 会被记录进 `exception_info`，而不会丢弃已有 `verifier_result`。[Harbor `trial.py`](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/src/harbor/trial/trial.py#L401-L462) [Harbor `trial.py`](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/src/harbor/trial/trial.py#L1606-L1627)

但当前 Harbor aggregate 同时允许 `verifier_result.rewards` 贡献到 reward stats，并独立累加 `exception_info`；final job metrics 也从所有存在 verifier rewards 的 trial 计算，不先排除 cleanup exception。这个实现证明“保留 grade 与 cleanup failure”在实践中存在，却不能证明该 grade 适合 independent-trial aggregate；相反，它是 DSH 需要显式增加 publishability gate 的实现缺口。[Harbor `JobStats.increment`](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/src/harbor/models/job/result.py#L129-L169) [Harbor `job.py`](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/src/harbor/job.py#L1060-L1107)

### ECP：显式记录 degraded coverage，但不证明外部 Environment finality

ECP 规范要求 timeout、budget breach、agent crash 和 protocol violation 使用 degrade-not-abort：受影响 step 记为 failed，剩余 step 记为 skipped，run 继续到下一 scenario；未产生 result 的 step 仍必须贡献至少一个 failed check，避免 timeout 被排除出分母后形成虚假高分。audit record 保存 manifest digest、planned/executed/failed/skipped steps、runtime/agent metadata 与 limits。[ECP protocol](https://github.com/evaluation-context-protocol/ecp/blob/5ed863811e79fa708481d3213fd733391033d593/spec/protocol.md#L151-L179) [ECP `audit.py`](https://github.com/evaluation-context-protocol/ecp/blob/5ed863811e79fa708481d3213fd733391033d593/runtime/python/src/ecp_runtime/audit.py#L97-L209)

Reference runtime 为每个 scenario 启动 fresh agent process，发生 step failure 后跳过剩余 steps，并在 `finally` 中停止 agent process。graders 在每个成功 RPC step 返回后立即运行；run 结束后才组装 audit payload，CLI 再输出 JSON/HTML/audit files。这个顺序提供显式 failed/skipped coverage，却没有 open-effects tracking、外部 service finality、verified cleanup receipt 或 cross-unit separation proof。[ECP `runner.py`](https://github.com/evaluation-context-protocol/ecp/blob/5ed863811e79fa708481d3213fd733391033d593/runtime/python/src/ecp_runtime/runner.py#L282-L344) [ECP `runner.py`](https://github.com/evaluation-context-protocol/ecp/blob/5ed863811e79fa708481d3213fd733391033d593/runtime/python/src/ecp_runtime/runner.py#L346-L419)

ECP 因此支持 coverage/status 字段与“失败不能静默消失”，但不能作为 DSH finality、cleanup 或 independent-trial protocol 的充分来源。ECP 论文自身也将协议称为 early-stage proposal；官方 specification 仍标记为 Experimental。

### Inspect AI：持久化状态决定 log 是否可被当成完整结果，且评分可后置

Inspect 明确区分正常 runtime error 与 process crash。前者正常结束并写出 `status="error"` log，保留所有已完成 samples；后者留下 `status="started"` incomplete log，尚未 flush 的已完成 samples 与仍运行 samples都可能缺失。Inspect 维护独立的 on-disk sample buffer，用于恢复 crash 前未写入主 log 的 sample data。[Inspect Handling Errors](https://github.com/UKGovernmentBEIS/inspect_ai/blob/52b30883d1bf11a183fa82640429728595ea8d6f/docs/handling-errors.qmd#L8-L20) [Inspect Handling Errors](https://github.com/UKGovernmentBEIS/inspect_ai/blob/52b30883d1bf11a183fa82640429728595ea8d6f/docs/handling-errors.qmd#L125-L150)

Inspect 要求分析 log 前检查 status；读取全部 samples 默认要求 `status="success"`，对 `error` 或 `cancelled` log 必须显式选择允许不完整读取。crash recovery 只有在全部 expected sample ids/epochs 均有 terminal disposition、且 metrics 能重新计算时才将 recovered log finalized 为 `success`；缺失 expected samples 或无法解析 scorer/metric 时保持 `error` 与 retryable。[Inspect Eval Logs](https://github.com/UKGovernmentBEIS/inspect_ai/blob/52b30883d1bf11a183fa82640429728595ea8d6f/docs/eval-logs.qmd#L183-L210) [Inspect Eval Logs](https://github.com/UKGovernmentBEIS/inspect_ai/blob/52b30883d1bf11a183fa82640429728595ea8d6f/docs/eval-logs.qmd#L323-L338) [Inspect Handling Errors](https://github.com/UKGovernmentBEIS/inspect_ai/blob/52b30883d1bf11a183fa82640429728595ea8d6f/docs/handling-errors.qmd#L180-L207)

Inspect 支持 `--no-score` 先生成无 score、无 metrics 的 durable log，再通过 `inspect score` 或 `score()` 离线评分；rescore 默认创建新的 `-scored` log，并可 append 或 overwrite scores。这证明 generation evidence 与 grading 可以分离，也证明一个持久化 log 可以承载多个 scorer result。[Inspect Scoring Workflow](https://github.com/UKGovernmentBEIS/inspect_ai/blob/52b30883d1bf11a183fa82640429728595ea8d6f/docs/scoring-workflow.qmd#L6-L70)

Inspect 的 log status 与 recovery 是 artifact completeness 的强实现先例，但 Inspect 文档不声称 `status="success"` 已证明外部 Environment 的 outcome finality、cleanup 或 cross-unit separation。因此 DSH 不能把 persistence success 等同于 Environment assurance。

### OpenAI Evals OSS：event persistence 与 final report 分离，但缺少 coverage/finality gate

OpenAI Evals recorder 将 sample events 保存在内存列表，并按 event 数或时间增量 flush；还注册 `atexit` flush。Local recorder 初始化时写 run spec，event flush 追加 JSONL，`record_final_report()` 另行追加 final report。CLI 在 `eval.run(recorder)` 返回后计算附加 token usage 并调用 `record_final_report(result)`。[OpenAI Evals `record.py`](https://github.com/openai/evals/blob/8eac7a7de5215c907fbddc30efdaf316913eccdd/evals/record.py#L75-L185) [OpenAI Evals `record.py`](https://github.com/openai/evals/blob/8eac7a7de5215c907fbddc30efdaf316913eccdd/evals/record.py#L316-L371) [OpenAI Evals `oaieval.py`](https://github.com/openai/evals/blob/8eac7a7de5215c907fbddc30efdaf316913eccdd/evals/cli/oaieval.py#L218-L239)

其 `gentle interrupt` 可以在 KeyboardInterrupt 后基于已收集的 sample subset 继续形成 report，并明确打印“基于已完成数量 / planned 数量”。这适合开发诊断，但若没有额外 coverage disposition，不能支持完整 benchmark headline。[OpenAI Evals `eval.py`](https://github.com/openai/evals/blob/8eac7a7de5215c907fbddc30efdaf316913eccdd/evals/eval.py#L200-L255)

OpenAI Evals 没有定义 agent Environment cleanup、open effects、independent-trial eligibility 或 formal publication gate。`atexit` flush 也不是 crash-proof durability guarantee；例如 `kill -9`、主机故障或 recorder write failure 不保证执行 handler。

## 各待裁定 claim 的支持强度

| Claim | 支持结论 | 一手依据 | 限制 |
| --- | --- | --- | --- |
| Agent 停止后可立即发布 final correctness | **明确不支持** | Outcome Finality 要求相关 effects terminal 或 bounded | 同步、封闭 Environment 可通过构造快速满足 |
| Crash/incomplete attempt 可以默认为零分并进入 aggregate | **不支持** | Inspect 区分 `started/error/success`；ECP 显式 failed/skipped coverage；ClaimReceipt 缺 terminal 时 abstain | Benchmark 可预先声明 failure-as-zero estimand，但仍需完整记录 attempted universe |
| 正式 grade 必须由完整、claim-sufficient evidence 支持 | **强支持** | ClaimReceipt sufficiency；DAREBench artifact contract；Interface Censoring raw/parsed layers | “完整”相对具体 claim，不要求保存所有可能数据 |
| Evidence 必须在 grade 计算前持久化 | **间接支持，非直接要求** | Inspect offline scoring、ClaimReceipt retained receipts、可重算要求 | Harbor/ECP/OpenAI Evals 都可能先评分再完成最终持久化 |
| 破坏性 cleanup 前必须收集 grader 所需 artifact | **强实现先例，条件性要求** | Harbor 先 collect artifacts 再 stop/verifier；DAREBench artifact contract | 若 artifact 已由外部 immutable store 持久化，可不依赖 live Environment |
| Cleanup success 是 final correctness 的必要条件 | **条件性** | Outcome Finality 只要求与 claimed outcome 相关的 effect terminal | cleanup failure 若与当前 outcome 无关，grade 仍可固定 |
| Cleanup/separation success 是 independent-trial aggregate 的必要条件 | **强支持** | Outcome Finality cross-unit separation | 若 task 本来测 persistent stream，应改变 analysis unit，而非强制 reset |
| Cleanup failure 后可保留已计算 grade | **支持** | Outcome Finality 两条件独立；ClaimReceipt selective licensing；Harbor 保留 reward 与 exception | 保留不等于可进入 headline；必须记录 blocked reason |
| 缺失一条 terminal record 可以继续发布完整实验 claim | **明确不支持** | ClaimReceipt missing-terminal 使 coverage/C4 Inconclusive | 仍可发布证据充分且不依赖 coverage 的窄 claim |
| Result publication 应晚于 coverage、finality 与所声称 assurance 的验证 | **强推论** | Outcome Finality + ClaimReceipt + Inspect log finalization | 尚无单一论文定义统一 publication state machine |

## DSH 设计推论

### 不采用一个含糊的 `completed` Boolean

DSH 应把 attempt 的事实、grade 和可发布性分开。以下对象表达不同问题：

```ts
interface GradeComputation {
  readonly status: "computed" | "failed" | "not_attempted";
  readonly evidenceCut: EvidenceCutRef;
  readonly gradingPlan: ResolvedGradingPlanRef;
  readonly result?: GradeResult;
  readonly failure?: GraderFailure;
}

interface PublicationEligibility {
  readonly formalMeasurement: "eligible" | "blocked";
  readonly independentTrial: "eligible" | "blocked" | "not_claimed";
  readonly reasons: readonly PublicationBlockReason[];
}
```

`GradeComputation` 回答“对哪些输入算出了什么”；`PublicationEligibility` 回答“这个结果能支持哪些 claim”。cleanup failure、coverage gap、missing artifact、unresolved effect、evidence persistence failure 和 incompatible identity 都是 publication block reason，不应伪装成模型 incorrect。

### 推荐的偏序，而不是僵硬全序

所有正式 product-composition attempts 应满足下列依赖：

```text
Agent endpoint
  └─→ stop accepting new agent actions
       └─→ resolve or bound outcome-relevant open effects
            └─→ capture all claim-required session, Environment and artifact evidence
                 └─→ seal an immutable, content-addressed evidence cut
                      ├─→ compute and persist grade
                      └─→ cleanup/reset and verify cross-unit separation
                           └─→ decide publication eligibility
                                └─→ aggregate/publish formal measurement
```

这张图只规定依赖，不要求 grade computation 与 cleanup 串行。若 grader 只读取 sealed evidence cut，grade 与 cleanup 可以并行，或任一先执行；publication 必须等待两者。若 verifier 必须读取 live Environment，则它属于 evidence capture/finality 阶段，必须在 destructive cleanup 前执行，并将 verifier output 一并 seal。若 cleanup 能改变 grader 所读取的 artifact，则 artifact 尚未 sealed，不能开始 formal grading。

### Evidence persistence 的最低要求

正式 grade 应引用 immutable evidence cut，而不是 live Agent、可变 workspace 或未 flush 的 in-memory transcript。这个要求是 DSH 的设计推论，来源组合是 ClaimReceipt 的 claim-relative recomputability、Inspect 的 crash/incomplete log handling 与 offline scoring、以及 Interface Censoring 对 raw layer 缺失的限制；没有单一来源直接规定 DSH 必须采用 digest cut。

Product Evaluation 的 cut 至少引用：

```text
DSH Session log sequence range + digest
Evaluation evidence ids + schema versions
Environment finality/open-effects receipt
all grader-required ArtifactRefs + digests
Benchmark/Case/Subject/Harness/Context/Environment identities
ResolvedGradingPlan identity
coverage disposition
```

持久化失败或 digest 无法复核时，可以保留 live diagnostic，但不能产生 formal `GradeComputation.status="computed"`。若 grader 已在 live Environment 中运行，则其输出先作为 provisional evidence；只有输入与 grader output 都进入 sealed cut 后，才升级为 durable computed grade。

### Incomplete 与 crashed attempt

建议区分：

| 状态 | 处理 |
| --- | --- |
| `runtime_failed`，terminal evidence 完整 | 保留 failure evidence；按 Benchmark 预先声明的 estimand决定是否作为 failure observation，不能事后删除 |
| `crashed_evidence_complete` | 可以在 evidence reconciliation 后 grading；必须保留 crash attribution |
| `crashed_evidence_incomplete` | 保持 incomplete/invalid，不发布 correctness measurement；允许 retry，但 retry 是新 AttemptId |
| `coverage_incomplete` | 阻塞完整实验 claim；窄的 per-attempt diagnostic 可保留 |
| `outcome_unresolved` | 不产生 final success/failure；等待、确认取消，或发布 unresolved/bounded result |

“按 Benchmark 预先声明的 estimand 决定”很重要。某些 benchmark 测量“在固定预算内完成任务的概率”，timeout 本身可合法计为 failure；但仍必须证明 timeout 后没有 outcome-relevant effect 继续改变结果，并把该 planned attempt 保留在 committed universe 中。另一些 benchmark 测量 terminal business outcome，则 timeout 只说明 observation 尚未完成，不能自动等于业务失败。

### Cleanup failure 与 grade 保留

cleanup failure 需要按影响拆分：

1. 若失败意味着当前 outcome 或 grader artifact 仍可能变化，则 `outcome_finality=unresolved`，现有 grade 只能 provisional。
2. 若当前 outcome 已固定，但资源可能影响下一 attempt，则 grade 可以 durable computed，`independentTrial=blocked`；后续 attempt 应停止，直到隔离恢复，或将连接 runs 合并为同一 analysis unit。
3. 若 authority-backed evidence 证明 cleanup failure 与 declared outcome、后续 starting state 和 privacy/security claim 均无关，则可保留正式 grade，并把 cleanup failure 作为 operational measurement；这种豁免必须是 scoped proof，不能依赖错误字符串或“通常没影响”。
4. 无论哪一种，cleanup failure 都不能改写为 model failure，也不能删除已持久化 evidence 和 grade。

这个分级是 Outcome Finality 两条件的直接架构化，但具体 DSH enum、receipt schema 和 blocker 名称是本仓推论。

### Publication 不是写文件，而是授予 claim

DSH 中“publish”应表示 measurement 获准进入某种用途，而不是简单把 JSON 写到磁盘。建议至少区分：

```text
diagnostic-visible
per-attempt-grade-visible
formal-benchmark-eligible
independent-trial-aggregate-eligible
headline/baseline-eligible
```

一个结果可以对开发者可见并保留 computed grade，却因 coverage、finality、cleanup、separation、identity compatibility 或 evidence sufficiency 阻塞更强层级。ClaimReceipt 的 selective licensing 是最接近的直接先例；Outcome Finality 说明 final label 与 independent aggregate 还要分别授权。

### 对 Question 14 的研究答案

若问题是“正式评分是否必须等待并使用持久化 frozen evidence cut”，一手来源支持以下更精确的回答：

- **支持**正式 measurement 必须基于 claim-sufficient、可重算、coverage 可审计的 retained evidence。
- **支持**crash/incomplete persistence 状态必须显式区分，不能把不完整 log 当完整 run。
- **支持**grader 可以与 generation 分离，并从 durable log/artifact 进行 offline score/rescore。
- **不直接支持**所有 grader computation 必须物理上晚于每一次 persistence write；Harbor、ECP 和 OpenAI Evals 存在先评分后完成最终 result write 的实现。
- **支持本仓采用更强规则**：只有指向 sealed evidence cut 的 grade 才称为 formal computed grade；live grade 只是 provisional。
- **支持**formal publication 与 independent-trial aggregation必须等待 outcome finality、coverage 和对应 Environment assurance；cleanup 只在其证明 separation 或 outcome finality 的范围内成为 gate。
- **支持**保留 computed-but-not-publishable grade，并显式记录阻塞原因。

因此，推荐给后续 Grilling 的决议表述是：

> 正式 grade 必须引用已持久化并 seal 的 immutable evidence cut；live scoring 只产生 provisional result。Environment finality 决定 correctness label 是否 final，cleanup/reset verification 决定 cross-unit separation 与 independent-trial eligibility。grade computation 与 cleanup 在 evidence cut 已 seal 后可以并行，但 formal publication 必须等待 grading、coverage、finality 和所声明 assurance 的全部 gate。cleanup failure 不删除已计算 grade，而是按其影响阻塞 finality、independent-trial eligibility 或 publication。

## 来源缺口

1. 没有被核验的一手来源给出并实证比较“先 cleanup 再 grade”与“先 grade 再 cleanup”的统一最优顺序；最合理顺序取决于 grader 是否读取 live Environment。
2. Outcome Finality 没有 durable log、digest、transactional persistence 或 crash-recovery implementation；其 open-effects record 仍是 protocol proposal。
3. ClaimReceipt 验证的是 claim sufficiency 与 committed-ingress coverage，不覆盖 Environment pending side effects、cleanup、shared workspace 或跨 attempt contamination；论文也未提供本次可核验的官方 repository link。
4. HarnessDev 没有公开 runner、frozen Harness artifacts、逐 run logs 和 hidden split manifests，无法核验 formal version 在 partial infrastructure failure 下如何判定。
5. DAREBench 论文指向的项目在本次核验中仍没有可用 source refs，无法核验 artifact collection、judge execution、teardown 和 score publication 的实际事务顺序。
6. ECP 是 Experimental early proposal；reference runtime 停止 agent process，但没有 authority-backed open-effects、Environment finality 或 cleanup receipt。
7. Harbor 保存 verifier reward 与 cleanup exception，却仍可能把 reward 纳入 aggregate；其代码没有提供 measurement-validity 证明，反而说明通用框架默认行为不能替代 DSH publishability gate。
8. Inspect 的 `success/error/started` 与 recovery 很强，但 scope 是 eval log/sample completeness；它不证明外部 database、workflow、process tree 或 object store 已 final 和 separated。
9. OpenAI Evals OSS 的 recorder 依赖增量/`atexit` flush，且 gentle interrupt 可对 subset 形成 report；它没有 committed-universe coverage 或 Environment assurance。
10. 没有来源为 data-engineering stream job、data-science experiment registry 或 attached warehouse 给出统一 cleanup receipt。DSH 仍需由具体 Environment Provider 定义 authority、open-effect types、finality observation 和 separation proof。

## 一手来源索引

- [Outcome Finality v3](https://arxiv.org/abs/2608.14940v3)
- [Interface-Induced Trajectory Censoring v1](https://arxiv.org/abs/2609.03966v1)
- [Interface-Induced Trajectory Censoring official repository](https://github.com/nebula-1999/Interface-Induced-Trajectory-Censoring/tree/9cfaaad17d702c70e1430f9e1413803507d8f2f6)
- [HarnessDev v1](https://arxiv.org/abs/2609.01437v1)
- [HarnessDev project page](https://harnessdev.github.io/)
- [DAREBench v1](https://arxiv.org/abs/2609.06059v1)
- [Harbor Adapters v2](https://arxiv.org/abs/2609.04298v2)
- [Harbor `single_step.py`](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/src/harbor/trial/single_step.py)
- [Harbor `trial.py`](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/src/harbor/trial/trial.py)
- [Harbor `JobStats`](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/src/harbor/models/job/result.py)
- [Harbor `job.py`](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/src/harbor/job.py)
- [ECP v1](https://arxiv.org/abs/2608.19263v1)
- [ECP protocol](https://github.com/evaluation-context-protocol/ecp/blob/5ed863811e79fa708481d3213fd733391033d593/spec/protocol.md)
- [ECP runner](https://github.com/evaluation-context-protocol/ecp/blob/5ed863811e79fa708481d3213fd733391033d593/runtime/python/src/ecp_runtime/runner.py)
- [ECP audit builder](https://github.com/evaluation-context-protocol/ecp/blob/5ed863811e79fa708481d3213fd733391033d593/runtime/python/src/ecp_runtime/audit.py)
- [ClaimReceipt v1](https://arxiv.org/abs/2609.01992v1)
- [Inspect AI eval logs](https://github.com/UKGovernmentBEIS/inspect_ai/blob/52b30883d1bf11a183fa82640429728595ea8d6f/docs/eval-logs.qmd)
- [Inspect AI handling errors](https://github.com/UKGovernmentBEIS/inspect_ai/blob/52b30883d1bf11a183fa82640429728595ea8d6f/docs/handling-errors.qmd)
- [Inspect AI scoring workflow](https://github.com/UKGovernmentBEIS/inspect_ai/blob/52b30883d1bf11a183fa82640429728595ea8d6f/docs/scoring-workflow.qmd)
- [OpenAI Evals `record.py`](https://github.com/openai/evals/blob/8eac7a7de5215c907fbddc30efdaf316913eccdd/evals/record.py)
- [OpenAI Evals `eval.py`](https://github.com/openai/evals/blob/8eac7a7de5215c907fbddc30efdaf316913eccdd/evals/eval.py)
- [OpenAI Evals `oaieval.py`](https://github.com/openai/evals/blob/8eac7a7de5215c907fbddc30efdaf316913eccdd/evals/cli/oaieval.py)
