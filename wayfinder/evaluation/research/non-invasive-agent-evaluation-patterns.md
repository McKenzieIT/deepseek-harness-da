# 非侵入式 Data Agent Evaluation：生产运行时、观测、回放与隔离

日期：2026-09-10

本文研究如何把 evaluation 集成进生产级 data agent 平台，同时避免让生产 Agent 为 benchmark 改写 prompt、tool、Provider 图或控制流。范围限于数据工程、数据分析和数据科学；K11、SQL、MaxCompute 仅可作为具体 DataScope、能力或迁移样本，不能定义共享架构。正文把外部来源事实、当前 DSH 事实和本仓建议分开；官方产品文档只证明某种实现模式存在，不单独证明测量有效性。

## 结论先行

DSH 不应建设一套与生产 Agent 平行的 evaluation-only runtime，也不应把 evaluator 藏进 agent loop。更合适的目标是同一个生产 Agent module、同一组 Cordis capability seams 和同一套 session semantics 支持三种运行方式：受控 benchmark 运行、生产 shadow/observational 评估、durable trace 的 replay/rescore。三者共享 evidence、identity 和 grader protocol，但任务来源、Environment assurance 和能作出的统计结论不同。

推荐的核心原则是：**evaluation 观察、重放和评分生产行为；除非被测产品本身包含自评能力，否则 evaluation 不向模型暴露自己。** Benchmark host 可以通过 profile/patch 选择 task source、Environment adapter、private grader 和 evidence sink，但不得添加只在评分时出现的 prompt、tool、retry、steering 或 stopping 逻辑。若 `trigger_eval`、eval evidence prompt 或 no-progress policy 是真实产品功能，它们属于被测 Agent composition，而不是 evaluator 的隐藏设施。

## 一手来源事实

### Shadow 与 observational evaluation

Istio 的 traffic mirroring 把生产请求复制到 mirrored service，主请求照常完成，镜像响应被丢弃；官方文档明确把它称为 out-of-band 的 shadowing 方法。[Istio traffic mirroring][istio-mirroring] 这一模式只证明“旁路副本不回写主路径”可实现，不证明副本执行无副作用，也不证明 shadow 样本可直接当独立 benchmark trial。

EDDOps 把持续 evaluation 描述为生产环境中的可观测、可门控工作流，并包含 shadow mode；MAP 则把运行时轨迹与离线评估相连，用 observability 产物驱动复现和诊断。[EDDOps][eddops] [MAP][map-paper] 这两篇论文支持“生产轨迹可以成为评估输入”，但没有为 DSH 规定 session schema、隔离强度或统计聚合规则。

MLflow 和 LangSmith 都提供对生产 traces 的在线或异步 evaluator：MLflow 文档把 monitoring 建立在 traces 和 scorers 上，LangSmith 文档允许对生产 traces 采样并在后台执行 online evaluators。[MLflow production monitoring][mlflow-monitoring] [LangSmith online evaluations][langsmith-online] 这些是已验证的社区实现模式，不是独立的有效性证据；其默认采样、队列、重试和数据保留策略不能直接成为 DSH contract。

### Durable trace、replay 与 rescore

OpenAI Trace Grading 对完整 agent trace 评分，而 Agents SDK tracing 能记录 LLM generations、tool calls、handoffs、guardrails 和自定义 spans，并允许禁用 tracing 或替换 trace processor。[OpenAI Trace Grading][openai-trace-grading] [OpenAI Agents tracing][openai-agents-tracing] 这证明 evaluator 可以位于运行路径之外并消费轨迹，但 OpenAI trace schema 不是 DSH session-log schema，也不能替代 DSH 的 durable facts。

Inspect AI 的 eval log 保存样本输入、模型事件、结果和 score；`inspect score` 能对已有 log 运行新的 scorer，而不重新执行 solver。[Inspect eval logs][inspect-logs] [Inspect scorers][inspect-scorers] 这支持把“重新评分”设计为一等操作，也说明 rescore 与 rerun 是不同操作。

Temporal 从 Event History 重放 Workflow code 来恢复状态，并要求重放路径保持确定性。[Temporal Event History][temporal-history] 这一事实给 DSH 的约束是：仅有 ordered events 并不自动得到真实世界重放；只要 tool、数据 snapshot、Context projection、时间或外部 Provider 结果没有冻结，最多只能重建 transcript 或重新评分，不能声称重现原执行。

OpenTelemetry 已发布 GenAI traces、agent spans 和事件的 semantic conventions，但 GenAI conventions 在 2026-09-10 仍包含 Development 状态的部分。[OpenTelemetry GenAI conventions][otel-genai] OTel 适合作为导出和跨系统关联格式，不适合作为 DSH 唯一、无损、可恢复的 canonical log。

### Composition、隔离与 evaluator ownership

Inspect 把 dataset、solver、scorer 和 sandbox 分成不同角色；sandbox 控制模型执行所处环境，已有 log 可独立交给 scorer。[Inspect tasks][inspect-tasks] [Inspect sandboxes][inspect-sandboxes] Harbor 同样把 task 拆为 instruction、environment、tests 和 solution，并在 container environments 中运行 agent 与 verifier；Harbor Adapters 还要求 oracle validation 和与原实现的 parity comparison。[Harbor Adapters][harbor-adapters] 这些来源共同支持把 Agent execution、Environment 和 private grading 分开，但不要求 DSH复制其对象模型或部署拓扑。

Harbor 对 verifier loopholes、环境故障和 adapter parity 的审计说明，评分器和环境本身会成为测量误差来源。[Harbor Adapters][harbor-adapters] 因此 evaluator isolation 不能只靠 TypeScript 字段命名；private material、grader dependency entry point 和运行权限需要与 Agent runtime 分离。

OpenFeature 规范把 flag evaluation 的 value、variant、reason、metadata 和 evaluation context 作为明确结果与输入。[OpenFeature flag evaluation][openfeature-flag-evaluation] [OpenFeature evaluation context][openfeature-context] 这支持记录“哪个 composition/flag 选择实际生效”，但不支持在一次 run 中通过不可追踪的动态 flag 改写 model-visible behavior。对于可比较 benchmark，生效的 profile、patch、prompt/tool schema 和 Provider identities 必须在运行前冻结。

### 为什么不能添加 eval-only prompt、tool 或控制流

Interface-Induced Trajectory Censoring 实证表明，chat template、tool serialization、parser 和 execution interface 会显著改变可观测 agent trajectory；HTTP 成功和空 tool-call 也可能掩盖 interface failure。[Interface-Induced Trajectory Censoring][interface-censoring] HarnessDev 把 harness 本身作为可优化对象，进一步说明 harness 变化会改变 agent performance。[HarnessDev][harnessdev] 因此“只为 benchmark 添加一个提示、tool 或 parser repair”不是透明测量，而是改变了被测系统。

Anthropic 的 agent eval 指南把 transcript、outcome 和 grader 组合视为评测设计的一部分，并强调 task、grader 和实际失败模式需要共同迭代。[Anthropic agent evals][anthropic-evals] 该指南没有为 DSH 给出具体 module interface，但与前述论文一致：evaluation 需要覆盖真实轨迹，不能只测一个为 eval 特制的简化 answer function。

Outcome Finality 区分 agent 停止、环境结果定案和不同 evaluation units 的分离；存在未完成 side effects 时，停止点不等于可评分终点。[Outcome Finality][outcome-finality] 因而 observational trace 即使拥有完整 transcript，也必须携带 finality、Environment assurance 和 cross-unit separation 证据，才能进入正式聚合。

## 当前 DSH 事实

以下事实来自 2026-09-10 的仓库 commit `02ef14ec142ebe38a8e45b12dd90d67c699dbdb6`。

### 生产运行时已经有可复用 seams

Cordis plugin tree 是 DSH 的 composition owner：Context 按稳定 key 提供服务，Consumer 通过 `inject` 声明依赖，typed events 提供 interception/observation，`ctx.effect()` 与 `ctx.on()` 使注册可逆。[DSH architecture][dsh-architecture] [Cordis primer][dsh-cordis-primer] 因此 evaluation 若重新发明 Provider registry、tool dispatcher 或 agent runner，会形成浅 module 和第二个事实源。

Profiles、bundles 和 patch layers 已经负责部署级 composition；agent presets 进一步允许每个 session 在 scoped Context 中拥有自己的 tools、prompt sections 和 persona，而 process-level registries 保持共享。[DSH architecture][dsh-architecture] [Agent presets][dsh-agent-presets] Evaluation configuration 有现成的 composition seam，不需要在 agent loop 中加入 `if (eval)`。

`Session` 是 append-only typed event log，LLM history 由 log 派生；未知 required event 会阻止恢复，只有明确 `ignorable: true` 的信息事件可跳过。[DSH session][dsh-session] 这使 session log 成为 replay/rescore 的正确 durable source，比 best-effort telemetry 更强。

`agent/pre-step`、`agent/request`、`agent/turn-stopping`、system-prompt assembly 和 tools execution pipeline 已经是生产 extension points。[DSH core subsystem][dsh-core] [DSH system prompt][dsh-system-prompt] [DSH tools][dsh-tools] Evaluation 可以观察这些事实，但只要 listener 改写 message、model request、tool result 或 stopping decision，它就改变了被测 Agent，不能再称为 observational evaluator。

Session telemetry 是可选 capability，能从 session events 投影并通过 backend 导出；其交付是 best-effort，可丢失或重复，而且不进入 model request。[DSH session telemetry][dsh-session-telemetry] 它适合 shadow sampling 和外部 monitoring，不适合替代 canonical evaluation evidence；正式 rescore 应读取 durable session persistence 和关联 artifacts。

Query、filesystem、shell、subprocess、workflow、permissions、credentials、sandbox 和 Context 都已经各自拥有 capability seams 和 Provider composition。Data-agent 不限制数据库类型；evaluation 必须记录实际 Provider identity 和 assurance，但不能把某个数据库 adapter提升为共享 Environment interface。

### 当前 eval 路径存在侵入和漂移风险

`eval-cli` 自己启动 mini Cordis context，并在源码注释中说明 adapter classes fork 自 `eval-runner-service`；CLI 与 service 因此可能在 Context assembly、LLM、query 和 judge behavior 上漂移。[Current eval CLI context][dsh-eval-cli-context]

`eval-runner-service` 直接组装 NL2SQL engine、query、LLM 和 judge collaborators，再调用独立 batch runner；这条路径没有天然证明它经过生产 session、agent loop、tool policy、approval、guard、compaction、steering 或 preset composition。[Current eval runner service][dsh-eval-runner-service] 它可以用于 engine-level evaluation，但不能自动代表完整 data-agent product evaluation。

Data-agent bundle 当前同时挂载 `eval-runner-service`、model-visible `trigger_eval`、`goal-eval-policy` 和 `goal-eval-context`。[Current data-agent bundle][dsh-data-agent-bundle] 这些能力若是生产产品要求，可以保留并作为被测 composition 的一部分；若只是为了让 benchmark 运行，它们会向模型暴露 evaluation、改变 prompt/tool roster 或自主控制流，应移出 production/default Agent composition。

`ctx.evalRunner` 目前由 Consumer 各自声明结构化接口，Provider 只做 duck-typed conform；这不是完整的 Service Definition / Provider / Consumer seam。[Current eval trigger][dsh-tool-trigger-eval] 若未来仍保留在线 eval orchestration，需要一个由 evaluation package 拥有的 typed Service Definition，而不是让 model-facing tool 拥有接口。

## DSH 需要保留的生产平台特性

1. **同一个 Agent interface 和 loop。** Full-product benchmark 必须通过 `ctx.agents` 创建/恢复 Agent，并让生产 loop 处理 inbox、turn、step、model stream 和 tool calls；engine-level tests 另行命名，不冒充 product score。
2. **Profile/bundle/preset composition 是唯一装配路径。** Evaluation host 选择生产 profile 和 agent preset，再叠加明确的 evaluation overlay；不得在 runner 中手工 new 生产 modules。
3. **Provider neutrality。** Benchmark 声明 capability requirements；profile 选择 Query、FS、workflow、sandbox、Context 等 Providers。Evaluation 只验证和记录已解析的 Provider 图，不选择数据库实现。
4. **Scoped Context 与多 session 隔离。** Evaluation additions 挂在 run/agent scope，注册是 effects，并在 run 结束时完整 dispose；不得污染同进程中的其他生产 sessions。
5. **Model-visible 等价。** System prompt、dynamic Context、tool schemas、permission policy、model route、parser/template、retry 和 steering 都属于被测 interface identity。除非 estimand 明确要求改变，否则 benchmark 与 production 必须相同。
6. **Model-visible 即 durable。** 任何进入 model request 的 evaluation material 都必须成为 session fact；默认建议是不加入 evaluation material。
7. **真实 tool pipeline。** Tool execution 继续通过 `ctx.tools` 的 policy、approval、cancellation、presentation 和 logging；evaluator 不直接调用 tool implementation 来伪造产品轨迹。
8. **Durable session 与 artifacts 分层。** Session log 保存交互事实，artifact store 保存大型结果、环境 receipt 和 private grader evidence；telemetry 只是可选导出。
9. **生产安全不为 benchmark 降级。** Credentials、permissions、sandbox、timeouts、cancellation、cleanup 和 guard plugins 按生产 contract 运行；任何放宽都进入 run identity，并形成不同 estimand。
10. **长期工作流不被压成一次 respond。** Subagent、workflow、persistent terminal、background process、compaction、resume 和 user steering 若出现在产品路径，evaluation evidence 必须能关联它们，而不是绕开它们。
11. **CLI、Cordis service 和 automation 共享 orchestration module。** Host 只负责输入输出和 composition；不得各自 fork adapters 或重新定义 result persistence。
12. **Production observability 继续独立存在。** Evaluation 可以消费 session telemetry 或 traces，但不能接管 telemetry backend 的 batching/retry，也不能让 telemetry failure 阻塞正常 Agent。

## DSH 架构选项

### 选项一：Observer-only evaluation

Evaluation module 只订阅 durable session facts、artifact commits 和 Environment receipts，生产 Agent 完全不知道 evaluator。在线 shadow evaluator 从已完成或抽样中的生产 sessions 计算 observational metrics；offline scorer 从持久化记录 rescore。

这一选项的 interface 很小，locality 好，也最不侵入生产路径。限制是它不能单独创建 controlled tasks、固定 Environment 或保证 trial independence，因此只适合 production monitoring、failure discovery、drift detection 和用户反馈关联，不能自动产生 headline benchmark score。

### 选项二：独立 evaluation runtime

Evaluation 自己创建 mini Context、独立 responder、tool adapters、prompt 和 persistence，然后模拟生产 Agent。

这一选项短期容易运行，适合纯 engine/component tests；但删除该 module 后复杂度不会消失，而是暴露出与生产 runtime 重复的 prompt、tool、Provider 和 lifecycle 逻辑。它是浅 module，缺少 leverage，并会像当前 CLI/service forks 一样积累漂移。它不应成为 full-product evaluation 的主路径。

### 选项三：Production composition under an evaluation host

Evaluation host 加载与生产相同的 profile/bundle/preset，通过专用 overlay 只增加 task source、run identity、Environment lease/control、durable evidence capture 和 isolated grader。Agent 仍由生产 registry/loop 驱动，所有业务操作仍通过既有 capability seams。

这个选项的真实取舍是 composition 和 identity 验证成本更高，但它在一个深 module 后隐藏 profile resolution、scope setup、run lifecycle、evidence correlation、finality 和 cleanup，所有 hosts 与 tests 通过同一 interface 获得 leverage。它也是唯一同时支持 Provider neutrality、完整产品路径和受控 benchmark 的方向。

## 推荐：三种模式，共享一个 Evaluation Run protocol

推荐以选项三作为 controlled benchmark 主路径，以选项一承载生产 observational evaluation，并把 trace replay/rescore 作为第三种不执行 Agent 的模式。三者不能通过一个含大量可选字段的万能 `run()` 混在一起，应使用显式 discriminant：

```ts
interface ControlledRunRequest {
  readonly kind: 'controlled'
  readonly productionProfile: ProfileIdentity
  readonly agentPreset: AgentPresetIdentity
  readonly evaluationOverlay: EvaluationOverlayIdentity
  readonly benchmarkTask: PublicPreparedTask
  readonly environmentBinding: EnvironmentBindingRef
}

interface ObservationalRunRequest {
  readonly kind: 'observational'
  readonly session: SessionId
  readonly samplingDecision: SamplingDecision
}

interface ReplayRunRequest {
  readonly kind: 'replay'
  readonly trace: DurableTraceRef
  readonly operation: 'reproject' | 'rescore'
}
```

`controlled` 启动真实生产 composition；`observational` 只附着到已存在的 session/evidence，不向 Agent 回传；`replay` 不重新调用模型或真实工具。若未来需要 environment re-execution，应新增明确模式并要求 frozen Provider inputs、snapshots 和 side-effect controls，不能把它偷藏在 replay 内。

### 推荐的 module 与 seams

**Evaluation Run Orchestrator module** 应提供一个小 interface，内部完成 profile resolution、Agent scope 创建、task injection、completion/finality、evidence commit 和 cleanup。它接受 dependencies，不创建具体 Query/LLM/Context Providers。删除它会把同一编排复杂度散回 CLI、service、automation 和 tests，因此它有足够 depth。

**Trace Materializer module** 以 session identity 和 artifact references 为输入，返回冻结、版本化、访问分级的 evaluation trace。其实现隐藏 session persistence、plugin-merged events、compaction surface、tool/subagent correlation 和 artifact joins。Live observer 和 offline replay 是两个真实 adapters，证明该 seam 不是假想抽象。

**Environment Control module** 位于已解析 Cordis Provider 图之上，只负责 requirement preflight、attempt lease、resource registration、finality、separation 和 cleanup receipts。它不提供统一业务 action gateway，也不拥有数据库选择。

**Grading module** 消费 durable trace、Environment receipts、opaque private material 和 frozen `ResolvedGradingPlan`。它不能 import Agent runtime 的 private Context，也不能把 grader result 写回仍在运行的模型回路。

**Observational Sampler module** 决定哪些生产 sessions 被复制到评价队列，并持久化 sampling probability、flag evaluation details 和 privacy/redaction policy。Sampling 发生在 evaluator side；生产 Agent 不根据是否被抽样改变行为。

### Evaluation overlay 的允许差异

Overlay 可以增加非模型可见的 observers、run/evidence sinks、Environment control participants、private grader transport 和 benchmark task ingress。Overlay 也可以把外部 Provider 替换为符合 requirement 的 managed adapter，但必须把差异纳入 run identity，并承认它改变了 deployment estimand。

Overlay 默认不得改变 persona、system-prompt sections、dynamic Context内容、tool roster/schema、tool policy、permission preset、model route、template/parser、retry、steering、stopping、compaction 或 subagent policy。确需改变时，它必须成为具名 experimental arm，与 production-equivalent arm 分开报告；不能继续叫“同一 Agent 的离线分数”。

### `trigger_eval` 与自评能力的处理

Model-facing `trigger_eval`、eval evidence Context 和 no-progress-triggered eval policy 有两种合法身份，不能混用：

- 若它们是生产产品能力，则留在 production profile，用户会真实看到其成本和行为；controlled benchmark 使用同一 composition，另外的 evaluator 仍在旁路评分。
- 若它们只是开发者启动 batch 或查看 score 的工具，则改为 CLI、automation、command 或 admin-only service Consumer，不进入模型 tool schema，也不影响 Agent turn control。

Evaluator 永远不能依赖模型主动调用 `trigger_eval` 才产生正式 evidence；否则被测能力包含“知道自己在考试并启动考试”，与普通生产任务不是同一 estimand。

## 拒绝或限制的模式

- **在 agent loop 中加入 eval 分支。** 现有 session、agent、system-prompt 和 tools seams 已足够；没有一手证据表明需要修改 loop。若后续发现缺口，应先指出哪个事实无法通过现有 event/service interface 观测，而不是直接扩张 loop。
- **为 benchmark 加隐藏 system prompt。** Interface 研究已表明 prompt/template 会改变 trajectory；任何差异都必须成为 experimental arm。
- **给模型添加 evaluator-only tool。** Tool roster 是 model-visible interface；只在 eval 出现的 tool 使测量对象发生变化。
- **Evaluator 直接调用 engine 并把结果称为 product evaluation。** 这绕过 Agent、session、tool policy、approval 和 lifecycle；合法名称应是 engine-level evaluation。
- **从 best-effort telemetry 直接重建正式 score。** Telemetry 可丢失、重复或被脱敏；正式 score 需要 durable session/artifact source，缺失必须显式标为 unresolved。
- **把 replay 当 rerun。** Transcript reproject、grader rescore、model rerun 和 Environment re-execution 是四种不同操作。
- **动态 flag 静默改变 model-visible behavior。** 生效 variant、reason、profile/patch digest 必须记录；可比较 run 的 configuration 在开始前冻结。
- **Shadow 执行复用生产 side effects。** Mirror response 不回主路径不代表无副作用；有写操作的 shadow 必须使用 managed/isolated Environment 或只做 trace-side scoring。
- **让 evaluator 持有生产 credentials 或 private benchmark answer。** Credentials 属于 Provider composition，private answer 属于 grader；普通 Agent dependency graph 不应到达二者的组合。
- **抽象一个万能 `EvaluationAction`。** DSH 已有 query/fs/shell/workflow 等 seams；统一 action gateway 会复制强类型 capability interfaces，并把 evaluation 变成第二个平台。

## 建议的验收证据

1. 同一 production profile/preset 在普通 host 与 controlled evaluation host 中生成相同的 system prompt digest、tool schema digest、model route、permission policy 和 Provider graph identity。
2. 通过静态 dependency gate 证明 Agent/Harness packages 无法 import private grader material，evaluation core 不依赖具体数据库 Provider。
3. 一个 production session 在开启和关闭 observational evaluator 时，session event log 与用户/model-visible输出相同；只允许额外的 evaluator-owned 外部记录。
4. Offline rescore 读取同一 durable trace 时不调用 LLM、query、filesystem 或 workflow Providers，并记录新旧 grader plan identities。
5. Telemetry 丢包、重复和 redaction 不改变 durable score；只影响 monitoring completeness 指标。
6. Evaluation overlay 卸载后，所有 scoped registrations、listeners、resources 和 pending work 被清理，不影响同进程其他 sessions。
7. Full-product benchmark 覆盖 production loop、tools pipeline、Context、permissions、guard、subagent/workflow 和 persistence 的实际组合；engine-level tests 保持独立标签。
8. Data analysis、data engineering 和 data science 各有一个结构不同的 conformance fixture，证明 Core 不要求 SQL rows、某个 database project 或 semantic-layer prompt。
9. Shadow/observational 结果带 sampling、privacy、finality、assurance 和 separation metadata，并被报告层禁止混入 controlled headline score。
10. 每个修改 prompt/tool/control flow 的实验都有 production-equivalent 对照 arm；没有对照时只报告该 composition 自身结果。

## 明确来源缺口

1. 未找到一篇截至 2026-09-10 的一手研究，直接比较“同一生产 agent 通过 profile overlay 评测”与“独立 eval-only runtime”在长期漂移、开发成本和测量偏差上的完整结果；选项三主要由 DSH 现有 composition architecture、interface-effects 论文和社区实现共同推导。
2. Istio traffic mirroring 只规定请求副本和响应处理，不处理 agent tool side effects、privacy、LLM cost、sampling bias 或 statistical independence；DSH 的 shadow 安全要求属于本仓建议。
3. MLflow、LangSmith 和 OpenAI 官方文档证明 production trace evaluation 存在，但没有提供跨平台统一的 false-positive calibration、queue-loss accounting 或 grader drift contract。
4. OpenTelemetry GenAI conventions 仍在演进，且 observability spans 不保证包含 DSH 恢复 session 所需的全部 model-visible material、plugin events、artifacts 和 access classifications。
5. Durable session trace 无法单独恢复外部数据 snapshot、Provider state、wall-clock、randomness 或未记录 side effects；可重执行条件仍需由 Environment protocol 与具体 data-domain extensions 验证。
6. 未找到证据证明 model-facing self-evaluation tool 对任务行为透明；现有 interface/harness 研究反而要求把它视为被测 composition 的一部分。
7. 现有论文对 data engineering 的长期 streaming jobs、data science 的 stochastic experiments 和 data analysis 的 interactive queries 采用不同 finality 假设；共享 Environment control interface 仍需分别用三个子领域的真实 adapters 验证。
8. 本轮没有验证任何商业 observability 平台的内部 sampling、retention 或 isolation 实现；只使用其公开官方 contract 描述实现模式。

## Sources

[anthropic-evals]: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
[eddops]: https://arxiv.org/abs/2603.22645
[harbor-adapters]: https://arxiv.org/abs/2609.04298v2
[harnessdev]: https://arxiv.org/abs/2609.01437v1
[inspect-logs]: https://inspect.aisi.org.uk/eval-logs.html
[inspect-sandboxes]: https://inspect.aisi.org.uk/sandboxing.html
[inspect-scorers]: https://inspect.aisi.org.uk/scorers.html
[inspect-tasks]: https://inspect.aisi.org.uk/tasks.html
[interface-censoring]: https://arxiv.org/abs/2609.03966v1
[istio-mirroring]: https://istio.io/latest/docs/tasks/traffic-management/mirroring/
[langsmith-online]: https://docs.langchain.com/langsmith/online-evaluations
[map-paper]: https://arxiv.org/abs/2512.04123
[mlflow-monitoring]: https://mlflow.org/docs/latest/genai/eval-monitor/
[openai-agents-tracing]: https://openai.github.io/openai-agents-python/tracing/
[openai-trace-grading]: https://developers.openai.com/api/docs/guides/trace-grading
[openfeature-context]: https://openfeature.dev/specification/sections/evaluation-context/
[openfeature-flag-evaluation]: https://openfeature.dev/specification/sections/flag-evaluation/
[otel-genai]: https://opentelemetry.io/docs/specs/semconv/gen-ai/
[outcome-finality]: https://arxiv.org/abs/2608.14940v3
[temporal-history]: https://docs.temporal.io/workflow-execution/event

[dsh-agent-presets]: ../../../packages/preset/README.md
[dsh-architecture]: ../../../docs/architecture.md
[dsh-cordis-primer]: ../../../docs/cordis-primer.md
[dsh-core]: ../../../docs/subsystems/core.md
[dsh-data-agent-bundle]: ../../../packages/bundle/data-agent/cordis.patch.yml
[dsh-eval-cli-context]: ../../../packages/eval/eval-cli/src/context.ts
[dsh-eval-runner-service]: ../../../packages/eval/eval-runner-service/src/index.ts
[dsh-session]: ../../../docs/subsystems/session.md
[dsh-session-telemetry]: ../../../docs/subsystems/session-telemetry.md
[dsh-system-prompt]: ../../../docs/subsystems/system-prompt.md
[dsh-tool-trigger-eval]: ../../../packages/data/tool-trigger-eval/src/index.ts
[dsh-tools]: ../../../docs/subsystems/tools.md
