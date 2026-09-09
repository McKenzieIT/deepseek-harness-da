# R10 — Harness/Benchmark/Environment 拆分与 Goodhart 审计：一手认读

日期：2026-09-09  ·  票：[R10 — Harness/Benchmark/Environment 拆分与 Goodhart 审计论文认读](../tickets/R10-harness-goodhart-papers.md)  ·  分支：`research/R10-harness-goodhart-papers`

## 验证方法

论文身份由 `export.arxiv.org` API 的 `title`、`author`、`published`、`updated` 字段机械读取，正文由对应 arXiv PDF 经 `pdftotext -layout` 后认读；下列 10 个 arXiv 页面与 6 个官方仓库固定提交链接均在 2026-09-09 实测 HTTP 200。仓库结论固定到本次抓取的提交，不把滚动分支状态当作永久事实。

| map 中的称法 | arXiv 版本 | 元数据实际标题 | 作者数 / 首作 | 发布时间 / 最后更新 |
| --- | --- | --- | --- | --- |
| AgentCompass | [2607.13705v3](https://arxiv.org/abs/2607.13705v3) | AgentCompass: A Unified Evaluation Infrastructure for Agent Capabilities | 23 / Kai Chen | 2026-07-15 / 2026-07-20 |
| HELM | [2211.09110v2](https://arxiv.org/abs/2211.09110v2) | Holistic Evaluation of Language Models | 50 / Percy Liang | 2022-11-16 / 2023-10-01 |
| BIG-bench | [2206.04615v3](https://arxiv.org/abs/2206.04615v3) | Beyond the Imitation Game: Quantifying and extrapolating the capabilities of language models | 451 / Aarohi Srivastava | 2022-06-09 / 2023-06-12 |
| MT-Bench / Chatbot Arena | [2306.05685v4](https://arxiv.org/abs/2306.05685v4) | Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena | 13 / Lianmin Zheng | 2023-06-09 / 2023-12-24 |
| Arena-Hard | [2406.11939v2](https://arxiv.org/abs/2406.11939v2) | From Crowdsourced Data to High-Quality Benchmarks: Arena-Hard and BenchBuilder Pipeline | 8 / Tianle Li | 2024-06-17 / 2024-10-14 |
| WildBench | [2406.04770v2](https://arxiv.org/abs/2406.04770v2) | WildBench: Benchmarking LLMs with Challenging Tasks from Real Users in the Wild | 9 / Bill Yuchen Lin | 2024-06-07 / 2024-10-05 |
| LED | [2602.01698v3](https://arxiv.org/abs/2602.01698v3) | Restoring Exploration after Post-Training: Latent Exploration Decoding for Large Reasoning Models | 9 / Wenhui Tan | 2026-02-02 / 2026-05-11 |
| Data Laundering | [2412.15255v2](https://arxiv.org/abs/2412.15255v2) | Data Laundering: Artificially Boosting Benchmark Results through Knowledge Distillation | 3 / Jonibek Mansurov | 2024-12-15 / 2025-06-04 |
| MMLU-CF | [2412.15194v1](https://arxiv.org/abs/2412.15194v1) | MMLU-CF: A Contamination-free Multi-task Language Understanding Benchmark | 11 / Qihao Zhao | 2024-12-19 |
| LLMs Get Lost | [2505.06120v1](https://arxiv.org/abs/2505.06120v1) | LLMs Get Lost In Multi-Turn Conversation | 4 / Philippe Laban | 2025-05-09 |

官方仓库固定提交： [AgentCompass `c30a5d9`](https://github.com/open-compass/AgentCompass/tree/c30a5d9472c0ed9afefad7bdabbf096db4c0f92a)、[HELM `63754d0`](https://github.com/stanford-crfm/helm/tree/63754d05db6f874e41a395880fb573890a13e791)、[BIG-bench `092b196`](https://github.com/google/BIG-bench/tree/092b196c1f8f14a54bbc62f24759d43bde46dd3b)、[FastChat `587d5cf`](https://github.com/lm-sys/FastChat/tree/587d5cfa1609a43d192cedb8441cac3c17db105d)、[Arena-Hard-Auto `196f6b8`](https://github.com/lmarena/arena-hard-auto/tree/196f6b826783b3da7310e361a805fa36f0be83f3)、[WildBench `d6b8dca`](https://github.com/allenai/WildBench/tree/d6b8dcaf377d173d031980f97c16e1a82618c03d)。

本文严格把论文与官方实现直接陈述的内容写在“来源事实”，把对 `packages/eval/` 的落包、迁移和审计建议写在“本仓设计推论”。

## 来源事实

### 1. AgentCompass 明确定义 Benchmark、Harness、Environment 的职责

AgentCompass 的 `RunRequest` 把评测语义与运行选择分开：`BenchmarkSpec` 定义任务和评测指标，`HarnessSpec` 定义 agent 与任务交互的过程，`EnvironmentSpec` 标识执行上下文，`ModelSpec` 描述模型端点和推理参数，`ExecutionSpec` 承载并发等不改变评测语义的运行选项。论文 §3.1 同时要求 benchmark、harness、environment 可独立注册和组合。[论文](https://arxiv.org/abs/2607.13705v3)；[官方仓库](https://github.com/open-compass/AgentCompass/tree/c30a5d9472c0ed9afefad7bdabbf096db4c0f92a)

AgentCompass 把 dataset-specific logic 放在 Benchmark：加载原始记录为统一 `TaskSpec`、准备任务材料，并由 `evaluate` 计算最终分数；其 grading 可以是确定性匹配、执行验证或 LLM judge。Benchmark 还选择评分所需环境是内存、复用 agent 工作区，还是新建隔离环境。也就是说，“如何判对”属于 benchmark 语义，而“在哪里执行判分程序”可以委托 Environment。来源同上，论文 §3.2。

Harness 负责把模型实例化为可交互 agent，拥有 prompt 格式化、交互状态、多轮工具调用、provider API 处理和 agent loop；它消费标准化任务材料并返回统一结果，但不解释 benchmark correctness。Environment 提供命令、文件、文本和服务等执行原语，并拥有隔离、安全、资源和清理生命周期。来源同上，论文 §3.2；官方开发文档进一步明确 Harness 不得加载 benchmark 数据或解释 correctness，Environment 不得拥有 benchmark scoring。[Harness integration boundary](https://github.com/open-compass/AgentCompass/blob/c30a5d9472c0ed9afefad7bdabbf096db4c0f92a/docs/en/developer_guide/extensions/harness/overview.mdx)；[Environment integration boundary](https://github.com/open-compass/AgentCompass/blob/c30a5d9472c0ed9afefad7bdabbf096db4c0f92a/docs/en/developer_guide/extensions/environment/overview.mdx)

AgentCompass 的数据协议区分 `TaskSpec`、`BenchmarkPlan`、`PreparedTask` 和 `RunResult`。官方文档要求稳定 task id、问题、类别、上游元数据、逐题 evaluation mode 和 network policy 留在 `TaskSpec`；隐藏答案、reference patch、私有测试和 grading secret 不得进入 Harness 可见的 `PreparedTask`；评分所需状态留在 `TaskSpec.ground_truth` 或 typed `BenchmarkPlan`，公开安全时才写入结果。[Shared Contracts](https://github.com/open-compass/AgentCompass/blob/c30a5d9472c0ed9afefad7bdabbf096db4c0f92a/docs/en/developer_guide/extensions/benchmark/code_implementation/shared_contracts.mdx)

AgentCompass 记录完整、版本化 trajectory，并把错误归为 model-side、environment-side 或 framework-side；每次 run 保存精确配置、逐题日志和聚合摘要，并区分改变 agent 行为的语义参数与仅影响执行的参数。这些字段是可审计和可恢复评测的来源事实，不只是实现便利。来源同上，论文 §3.4–§3.5。

### 2. HELM 与 BIG-bench 都把“题目内容”和“运行方式”分开，但不规定 npm 包边界

HELM 的抽象链是 `Scenario → Instance → Adapter → Request → Metric`。Scenario 产出带 input、references、split 和附加数据的 `Instance`；`AdapterSpec` 声明如何把实例转成 prompt/request，包括 few-shot 训练样本数、评测 split、采样次数、模型、温度和停止词；`MetricSpec` 单独声明如何从响应计算统计量；`RunSpec` 把 scenario、adapter 和一组 metrics 组合成一次运行。[论文](https://arxiv.org/abs/2211.09110v2)；[`Scenario` source](https://github.com/stanford-crfm/helm/blob/63754d05db6f874e41a395880fb573890a13e791/src/helm/benchmark/scenarios/scenario.py)；[`AdapterSpec` source](https://github.com/stanford-crfm/helm/blob/63754d05db6f874e41a395880fb573890a13e791/src/helm/benchmark/adaptation/adapter_spec.py)；[`RunSpec` source](https://github.com/stanford-crfm/helm/blob/63754d05db6f874e41a395880fb573890a13e791/src/helm/benchmark/run_spec.py)

HELM 的直接约束是：数据集实例与 reference 属于 scenario，prompting/采样适配是独立对象，metric 是独立对象，运行配置显式组合三者。HELM 没有 AgentCompass 意义上的独立 Environment 组件，也没有要求这些对象必须拆成不同发布包。

BIG-bench 的 API 同时支持 JSON task 和 programmatic task。JSON task 文件拥有 examples、inputs、targets、metrics、`preferred_metric` 及 high/low score；programmatic task 可以多轮调用统一模型接口并实现 task-defined custom metrics。任务作者可报告多个指标，但必须指定唯一 preferred metric，聚合分数使用该指标。[论文 §2.1](https://arxiv.org/abs/2206.04615v3)；[`JsonTask`](https://github.com/google/BIG-bench/blob/092b196c1f8f14a54bbc62f24759d43bde46dd3b/bigbench/api/json_task.py)；[`Task` API](https://github.com/google/BIG-bench/blob/092b196c1f8f14a54bbc62f24759d43bde46dd3b/bigbench/api/task.py)

BIG-bench 同时证明 metric 并非中性的运行细节：论文 §3.4.3 展示同一能力可因 metric 选择而呈现停滞、平滑增长或“突破”，并要求检查模型输出以确认 metric 测到了预期对象。论文还在 §2.4 要求所有 BIG-bench 文档包含 canary string，作为训练语料过滤信号；canary 只能帮助善意过滤，不能证明未污染。

### 3. MT-Bench、Arena-Hard 与 WildBench 把 judge policy 当作可测量、可版本化的评测语义

MT-Bench 是 80 道人工设计的两轮问题，覆盖八类任务；Chatbot Arena 则通过匿名成对对战收集真实用户偏好。论文比较 pairwise、single-answer 和 reference-guided 三种 judge 方式，并直接报告 position、verbosity、self-enhancement 和推理能力限制；其缓解措施包括交换答案顺序、在适用任务提供 reference，并在 prompt 中显式禁止按长度或模型名偏置。[论文](https://arxiv.org/abs/2306.05685v4)；[官方 FastChat judge 目录](https://github.com/lm-sys/FastChat/tree/587d5cfa1609a43d192cedb8441cac3c17db105d/fastchat/llm_judge)

Arena-Hard 的 BenchBuilder 从 Chatbot Arena 与 WildChat 等众包流量中筛选困难提示，并用 500 个提示组成 Arena-Hard-Auto。论文定义 `Separability with Confidence` 为：对模型分数 bootstrap 后，统计置信区间不重叠的模型对比例；实验用 100 次 bootstrap 和 95% confidence intervals，并报告相对 MT-Bench 约 3 倍的 separability。[论文 §3、§6.1](https://arxiv.org/abs/2406.11939v2)；[官方仓库 Evaluate Benchmarks](https://github.com/lmarena/arena-hard-auto/tree/196f6b826783b3da7310e361a805fa36f0be83f3)

Arena-Hard 的 style control 不是改写答案，而是在 pairwise Bradley–Terry 类模型中加入回答长度和 Markdown 特征作为协变量，再从模型能力系数生成受控 win rate。论文报告增加 verbosity/Markdown 会抬高未控制分数，而 style control 可消除这类收益。当前官方仓库 `show_result.py` 的普通和 style-control 输出均使用 100 次 bootstrap，但以 0.05/0.95 分位数显示区间，即中央 90% 区间；这与论文 §6.1 所述 95% CI 不一致，因此任何复现都必须显式声明区间定义，不能只写“CI”。[`show_result.py`](https://github.com/lmarena/arena-hard-auto/blob/196f6b826783b3da7310e361a805fa36f0be83f3/show_result.py)；[`math_utils.py`](https://github.com/lmarena/arena-hard-auto/blob/196f6b826783b3da7310e361a805fa36f0be83f3/utils/math_utils.py)

WildBench V2 从超过一百万条真实人机对话中筛出 1,024 个困难任务，保留自然任务分布并经人工复核。它为每题生成 5–10 条 task-specific checklist，使用多模型共同生成 checklist；`WB-Reward` 将候选分别与三个能力层级不同的 baseline 做五档 pairwise 比较，`WB-Score` 做 1–10 分单答评分。其 length penalty 在胜方比负方长超过可配置阈值 `K` 时把 “slightly better/worse” 改为 tie。[论文 §2–§3](https://arxiv.org/abs/2406.04770v2)；[官方仓库](https://github.com/allenai/WildBench/tree/d6b8dcaf377d173d031980f97c16e1a82618c03d)

WildBench 不提出 Arena-Hard 的 separability 指标；它报告对 Chatbot Arena Elo 的相关性，并以 task-specific checklist、多个 baseline、结构化 judge explanation 和长度惩罚控制 judge 偏差。污染方面，它保留一个永不公开的 WildChat 子集，同时公开 validation set 和构建方法，并声明持续用未见任务更新。来源同上，论文 §5–§6。

### 4. Goodhart 与污染文献要求同时审计分布、评分器、采样和训练谱系

LED 发现 RL reasoning post-training 可提高 pass@1，却使最终层分布低熵，导致提高 temperature 不再改善 pass@n，部分模型的 pass@n 反而下降。论文把 `pass@n` 定义为 n 次尝试中至少一次正确，并用 pass@1 与 pass@16 同时报表；它支持“只优化单次通过率会掩盖探索能力退化”，但不直接规定 train/heldout/fresh 的数据切分。[论文 §1–§2](https://arxiv.org/abs/2602.01698v3)

LED 的 `pass@n` 不是本仓当前的 strict `pass^k`：前者要求 n 次中至少一次成功，后者要求 k 次全部成功。本仓应分别命名和报告两者；LED 只能直接约束“至少一次成功”的探索指标，不能被引用成 strict `pass^k` 的实证依据。[本仓 `passKVerdict`](../../../packages/eval/eval-runner/src/runner.ts)

Data Laundering 展示 benchmark-specific knowledge 可以先进入 teacher，再通过看似正常的中间蒸馏数据传给从未直接见过 test set 的 student；简单文本重叠检测因此不是充分条件。论文建议至少记录 teacher 的已知训练数据来源，针对故意污染使用不公开 gold label 的 private benchmark，同时承认私有集会削弱错误发现与数据修订能力。[论文 §1、§5.5](https://arxiv.org/abs/2412.15255v2)

MMLU-CF 把 20,000 题按相似难度和学科分布分成 10,000 公开 validation 与 10,000 私有 test，并以二者分数绝对差 `Δ` 监测公开 validation 发布后可能出现的过拟合或泄漏。其 contamination-free processing 包括问题改写、选项洗牌、以及以 50% 概率把一个选项替换为 “None of the other choices”；构建过程另含规则清洗、去重、难度采样、多模型质量/安全检查和语义重复检测。[论文 §3.2、§4.5](https://arxiv.org/abs/2412.15194v1)

LLMs Get Lost 在完全相同的六类生成任务上比较 fully specified single-turn、内容相同但拼接为一轮的 `CONCAT`、以及逐步透露约束的多轮 `SHARDED`，每个模型×指令×设置重复 10 次，累计超过 200,000 次模拟对话。15 个模型从 `FULL` 到 `SHARDED` 平均下降 39%；作者把下降拆为 aptitude 小幅下降和 unreliability 大幅上升，并报告后者平均增加 112%。它证明单轮分数不能替代多轮可靠性测量，但不讨论数据污染。[论文 §3–§6](https://arxiv.org/abs/2505.06120v1)

## 本仓设计推论

以下内容是对上述来源事实与 [G10 — Harness Benchmark/Harness/Environment 拆分](../tickets/G10-harness-bhe-split.md) 已知仓库事实的工程映射，不是论文原结论。

### 1. G10 的三项裁定分别受什么约束

| G10 待决问题 | 来源事实施加的约束 | 仍属本仓自主选择 |
| --- | --- | --- |
| grader 与 comparator policy 落哪个包 | AgentCompass 要求 correctness 解释和最终评分归 Benchmark，Harness 不得解释 correctness；HELM 把 metrics 与 adapter/runner 分开；BIG-bench 由 task 声明 metric 与 preferred metric。由此，**case 选择哪种 comparator、参数、期望值和 verdict 语义必须由 benchmark pack 拥有**，不能藏在 runner 或 Environment。Environment 只执行需要数据库/沙箱的评分动作并返回可区分的执行结果。 | 通用 comparator 算法实现是否放在 `dsh-eval`、独立 `dsh-eval-grader`，或由 benchmark pack 内聚；包名、导出面和迁移顺序；默认 policy 的具体值。R23 仍负责 comparator 默认值证据。 |
| case schema 归谁拥有 | AgentCompass 的 `TaskSpec`/`BenchmarkPlan` 和 HELM 的 `Instance` 都把题目、reference、split、metadata 放在 benchmark 侧；BIG-bench 的 task 文件同时拥有 examples、targets 和 metric 声明。由此，**benchmark case 的作者态 schema 与版本属于 benchmark pack**；Harness 只接收去除隐藏 GT 后的运行输入，runner 只依赖稳定的规范化运行协议。 | 共享的规范化 TypeScript 类型放在哪个包；benchmark pack 是否直接导出 authoring schema；哪些字段进入公开结果；Zod schema、品牌类型和文件布局。 |
| `k11-v2` 与 `rbi-10000251-exec` 如何合流 | 来源只约束“各 benchmark 可有自己的原始格式，但进入运行时前必须显式编译成稳定任务协议，并保留评分所需 ground truth/provenance”；没有来源要求两个历史格式物理合并，也没有来源允许 loader 静默丢字段。 | 建议本仓采用**一个版本化 canonical case envelope + 明确的 benchmark-pack loader/migration**：共同字段统一为 id、split、prompt/input、expected、grader policy、provenance；RBI 的 `expected.sql`、`anchor_ds`、`tier` 和模板参数进入 typed expected/provenance，而不是可丢弃的 loose metadata。是原地升版、离线转换，还是保留两个 source schema 后编译到同一 envelope，均由 G10 根据迁移成本裁定。 |

### 2. 推荐的 B/H/E 所有权

**Benchmark pack** 应拥有 case 文件、authoring schema、数据集版本、split、provenance、expected/reference、grader policy 的选择与参数、逐题评分解释，以及 benchmark-level aggregation 声明。一个 pack 的发布物应足以回答“测什么、什么算对、数据从哪来、哪个版本”。

**Harness** 应拥有单轮/多轮交互、prompt 与 workspace handoff、模型与工具调用、重试和 trajectory 采集，但不得读取隐藏 expected、选择 comparator 或把环境失败折叠成模型答错。`eval-runner` 与 `MultiTurnSession` 变 benchmark-agnostic 符合 AgentCompass 和 HELM 的共同方向。

**Environment adapter** 应拥有 MaxCompute/本地进程/沙箱等连接、会话、执行、资源、安全、超时与清理，并返回结构化 execution outcome。它不拥有 case、reference SQL、match mode 或最终 benchmark verdict。

**共享 eval protocol/library** 可以拥有 `PreparedCase`、`AttemptResult`、`RunResult`、通用 comparator 实现、统计与持久化协议，但其默认值不能偷偷决定 benchmark 语义。Benchmark pack 必须显式选择 policy；运行时缺少选择或遇到未知 policy 应报配置错误，而不是记为模型失败。

### 3. 对两套 schema 的建议答案

`k11-v2` 与 `rbi-10000251-exec` 不应继续以两个互不相容的运行时 schema 长期并存；二者可以保留各自的作者态来源格式，但必须编译到同一个、版本化、无损的 canonical case envelope。这样既遵守 AgentCompass 的 `TaskSpec → PreparedTask` 分层，也避免为了“一统 JSON”抹平 RBI 已有的执行 GT 与 provenance。

canonical envelope 至少需要：稳定 case id、benchmark/version、`train | heldout | fresh` split、任务输入、可公开运行材料、不可暴露给 Harness 的 expected、显式 grader/comparator policy、环境需求、source provenance、模板参数与 anchor timestamp、schema version。RBI 特有字段应先成为 typed 字段再迁移；在迁移完成前，任何 loader 丢弃未知评分字段都必须失败。

## 可落地的 Goodhart 审计要求

### 1. 三套数据的用途与访问规则

| slice | 用途 | 允许行为 | 必须禁止或记录 |
| --- | --- | --- | --- |
| `train` | 日常开发、prompt/comparator 调参、失败分析 | 全量公开；允许反复运行和逐题查看；允许衍生 mutation | 不得作为唯一 headline；每次使用要记录 benchmark commit、case ids、衍生链和用于调整的组件 |
| `heldout` | 与 train 同分布、固定版本的泛化检查 | 只在预注册版本上评分；默认只返回聚合和受控错误样本；定期由未参与调参者审阅 | 不得进入训练、蒸馏、few-shot、检索库、prompt 开发、comparator threshold 调参或人工挑例；访问和导出必须留审计记录 |
| `fresh` | 检测时间漂移、公开集过拟合和间接污染 | 在模型、Harness、grader policy 冻结后，从新时间窗采集并一次性评测；每批有独立版本和采集截止时间 | 不得从旧题改名冒充 fresh；不得在看过结果后回填筛选条件；不得与 heldout 共用泄露的 gold 或 teacher 产物 |

`train`、`heldout`、`fresh` 必须使用同一 canonical case envelope 和同一显式 grader policy 才能比较；同时分别报告样本构成和难度，避免把分布变化误判为 Goodhart。MMLU-CF 支持公开/私有配对与差值监控，Arena-Hard/WildBench 支持从新用户流量持续生成困难样本；三者都不证明任意两个 slice 天然同分布，因此本仓必须自己做类别、难度、reference 来源和执行环境的配平。

### 2. 每次候选变更必须产出的数字

1. 分别报告 `train`、`heldout`、`fresh` 的 execution score、judge score、两者 gap、逐类失败率和样本数；主结论以 heldout 与 fresh 为准。
2. 报告 `Δ_train-heldout`、`Δ_heldout-fresh`，并与上一个冻结 baseline 的同名差值比较；train 上升而 heldout/fresh 不升或下降时标记 Goodhart regression。
3. 对每个 slice 报告 bootstrap **95%** CI，并计算关键模型/版本对的区间重叠或成对差值 CI；不要把 Arena-Hard 当前实现的 5%/95% 分位区间误称为 95% CI。
4. 对 judge 分数同时报告未控制值和 style-controlled 值。控制变量至少记录答案长度与格式密度；SQL 主任务还应单列执行正确性，不能让 style regression 替代客观 grader。
5. 对 stochastic generation 同时报标准 `pass@n`（n 次中至少一次成功）、本仓 strict `pass^k`（k 次全部成功）与固定采样参数；单一 pass@1 改善而高 n 无改善或下降时单独告警，两种聚合不得混名。
6. 单轮和多轮分别报告，并对多轮至少重复多个随机种子；不得用 single-turn case 的改写结果代替真实多轮可靠性。

### 3. 污染检测与证据留存

1. **全链路 provenance**：记录每个 case 的原始来源、采集时间、作者/生成器、变换步骤、审核者、reference SQL 与 expected 的产生方式；记录被测模型、微调集、蒸馏 teacher、合成数据生成器、检索语料和 judge 模型的可得训练谱系。未知 teacher 数据来源必须标为污染风险，不能记作“未发现污染”。
2. **访问隔离**：heldout/fresh 的题面、reference SQL、expected result 和 grading secret 分级保存；Harness 只收运行所需材料；评分在独立进程或受控服务执行；结果导出默认不包含可复原 gold 的逐题细节。
3. **重叠扫描**：对 train、公开文档、few-shot、prompt、fixtures、snapshot、模型输入日志、teacher/intermediate distillation data 与 heldout/fresh 做 exact、规范化 n-gram 和语义近重复扫描。扫描命中是证据，未命中不是清白证明，因为 Data Laundering 展示了经 teacher 与中间数据传递且无直接文本重叠的污染。
4. **变换探针**：为同一语义生成预注册的 paraphrase、标识符/表名扰动、选项或输出顺序扰动、日期 anchor 平移和无关格式变化；分别报告原题与变体落差。MMLU-CF 的 rephrase/shuffle/replace 是先例，但 SQL 变换必须保持执行语义并由 reference execution 验证。
5. **canary / dye sentinel**：公开 train 与文档放置可搜索 canary；heldout/fresh 注入不改变任务语义、不会自然出现的受控 sentinel，并监测模型输出、训练数据清单或检索命中。sentinel 只能发现部分直接或间接暴露，不能替代 private split 和 fresh slice。
6. **时间切片**：fresh case 必须带 `collected_at`、`eligible_after`、`first_evaluated_at` 和来源快照；模型、prompt、Harness、grader、comparator policy 与 environment image 也要带版本。只有 case 采集晚于被测系统冻结点时，时间新鲜度才成立。
7. **盲评与解封**：在 heldout/fresh 结果解封前冻结提交、配置和分析计划；解封后不得删除失败题再重报同一版本。修错后发布新 benchmark version，并同时保留旧版结果和失效原因。
8. **人工审计抽样**：对 train-only gain、judge/execution 分歧、style-control 前后翻转、sentinel 命中、异常高分与大幅 CI 变化抽样复核 trajectory、环境输出和 ground truth；审计结果按 case id 留存。

## G10 可直接采用的结论

1. **grader/comparator**：论文约束的是职责，不是包名。Benchmark 拥有判对语义和 policy 选择；Environment 只提供执行；Harness 不参与判对。通用 comparator 代码放哪个 npm 包是本仓选择，但不得以隐藏默认值越权决定 benchmark 语义。
2. **case schema**：来源一致支持 benchmark 拥有题目、split、reference/expected、provenance 和 metric 声明，并在 Harness 前编译成稳定运行协议。具体 `@deepseek-ai/dsh-*` 包名与公开导出是本仓选择。
3. **schema 合流**：没有论文要求 `k11-v2` 与 `rbi-10000251-exec` 物理合并；来源要求无损、显式、版本化转换。推荐保留可追溯 source schema，同时统一 canonical envelope，禁止静默 strip `expected.sql`、`anchor_ds`、`tier` 或 provenance。
4. **Goodhart**：固定公开 train、访问受控 heldout、冻结后采集 fresh 三线同时存在；以跨 slice delta、95% CI、style-controlled 与 raw 双报、pass@n 曲线、多轮重复、provenance/lineage、重叠与变换探针、canary/dye、盲评解封共同构成审计。任一单项都不能单独证明未污染。

## 来源边界

这些来源不决定本仓包名、Cordis 插件切法、是否新增包、迁移提交顺序、schema 字段拼写、`match_modes` 默认 policy、版本号策略或旧 case 文件是否原地改写；这些均留给 G10。它们只排除了三类设计：Harness 解释正确性、Environment 拥有 benchmark 内容、以及 loader 通过丢弃未知字段把两个 schema “合流”。
