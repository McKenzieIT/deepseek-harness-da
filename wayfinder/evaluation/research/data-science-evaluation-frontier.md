# 数据科学 Agent Evaluation 前沿一手认读

日期：2026-09-10

本文为 [G10 — Harness Benchmark/Harness/Environment 拆分](../tickets/G10-harness-bhe-split.md) 补充数据科学方向的约束，研究范围限定为数据工程、数据分析和数据科学共享的 Data-domain Evaluation Core，以及其上的 data-science extension。K11、RBI 或任一具体数据库只可作为迁移与验证样例，不能决定共享协议的形状。

## 结论先行

1. 数据科学 agent 的可信评测单元不是“题目 + 最终答案”，而是 `dataset/split identity + task framing + executable workflow + produced artifacts + metric/grading plan + replicate policy + provenance` 的冻结组合。只保存最终分数无法区分模型能力、数据划分、Harness、运行环境、评分器和随机性的影响。
2. 数据集身份必须独立于路径。至少要记录来源与版本、内容 digest、文件/record-set 描述、split membership 或 split-generator identity、访问级别和派生 lineage。`train`、`test` 这样的名称本身不足以建立可比性。
3. 实验计划应是一等、版本化 evidence，但不能按“是否等于唯一标准计划”评分。开放式数据科学通常存在多个合理分析路径；评分应检查计划是否明确 target/objective、数据角色、验证方法、指标、随机性、预算和停止条件，并检查计划、执行轨迹、产物与报告是否一致。
4. Notebook、脚本、模型、特征、预测和报告都是不同 artifact。Notebook 文件可以保存代码、输出和执行序号，但不证明当前代码能从干净环境重放；可信证据必须包含 clean replay receipt、环境 identity、输入/输出 artifact digest 和执行日志。
5. 指标值必须与 metric definition、方向、目标 split、evaluator version、attempt-selection rule 和 aggregation rule 一起保存。`best-of-k`、`pass@k`、最终提交、最佳中间尝试、均值、中位数和人类分位数测量的不是同一件事，不能压成一个无来源的 `score`。
6. 一个 seed 不是可复现性。需冻结 replicate/seed schedule、全部随机源、数据加载与硬件/库环境；同时承认跨版本、平台和 CPU/GPU 不能保证逐位复现，因此应同时保存 artifact 与 metric distribution，而非只保存 seed。
7. Leakage 至少分为 benchmark contamination、split overlap、target/post-outcome leakage、private-label access、prompt-only shortcut 和 evaluator feedback leakage。任何单一检测都只能提供局部证据，不能产生“无污染”布尔结论。
8. 自动评分优先验证可执行事实；开放式结论、图表和方法质量再使用 rubric 或 judge。Judge 必须带 model/prompt/version、重复采样或 panel、与人类标注的一致性证据，并与确定性检查分开报告。
9. 长流程评测需要同一 attempt 内的持久 workspace、显式 checkpoint、验证反馈事件和最终 submission；不同 attempt 之间必须隔离。最佳中间尝试与最终提交应分别记录，因为它们分别测探索上限和交付能力。
10. 这些证据支持 G10 选择的“稳定 `EvidenceEnvelope` + 子领域注册 payload”，但要求 core 保留少量不可下放的标准投影：identity、artifact lineage、lifecycle/finality、resource use、metric observation、grading provenance、failure attribution 和 access classification。

## 核验范围与来源等级

本次检索截至 2026-09-10，只采用论文、论文作者发布的官方 benchmark/framework 仓库和正式规范。2026 年论文大多仍是 arXiv 预印本；它们用于识别前沿方向，不单独作为成熟度证明。被多个独立系统重复采用、或由正式规范定义的机制，权重高于单篇新预印本提出的术语。

### 2026 年前沿来源

| 来源 | 核验版本 | 本文采用的证据 |
| --- | --- | --- |
| [DSAEval](https://arxiv.org/abs/2601.13591v3) | v3，2026-09-07 | 641 个问题、285 个异构数据集；持久 GPU sandbox、多 query session、Jupyter Notebook 与最终报告；reasoning/code/result 多维 judge；human–judge 与 inter-judge 一致性审计；公开数据污染限制 |
| [DSAgentBench](https://arxiv.org/abs/2608.10366v1)；[官方仓库快照](https://github.com/vis-nlp/DSAgentBench/tree/b4734100978da5b6983eafff2a452e2af60c8b32) | v1，2026-08-11 | 275 个端到端任务；真实桌面、Notebook、IDE、terminal、browser 和 database；task-level 初始状态、setup/cleanup 与 deterministic evaluator；可视结果先过确定性检查再进语义 judge |
| [AgenticDataBench](https://arxiv.org/abs/2607.01647v1)；[官方仓库快照](https://github.com/AgenticDataBench/AgenticDataBench/tree/61bb0d6be3439797d2c75a6ede198b0b296cc226) | v1，2026-07-02 | 97 个数据集、344 个任务、433 个技能；任务包含目标、数据、可执行 solution、skill set 和 evaluator；按 table/model/JSON/chart/text 分型评分并做 step/skill failure analysis |
| [AgentDS](https://arxiv.org/abs/2603.19005v3) | v3，2026-06-03 | 17 个行业预测挑战；隐藏 test outcome、官方 metric、`submission.csv`；相对人类参赛者分布的 quantile score；AI-only 与 human–AI collaboration 对照 |
| [Ambig-DS](https://arxiv.org/abs/2605.09698v1) | v1，2026-05-10 | 把 prediction target 与 evaluation objective 的缺失建成配对干预；可执行且格式正确的产物仍可能 silently solve the wrong task；一次澄清机会可恢复大量性能 |
| [DSGym](https://arxiv.org/abs/2601.16344v1)；[官方仓库快照](https://github.com/fannie1208/DSGym/tree/461a464da3e5d2bbea409462c61c8999527b4616) | v1，2026-01-22 | 统一 Task `(D, P, M, Z)`；每条 trajectory 使用隔离容器与持久 Jupyter kernel；数据只读、workspace 可写；过滤不读取数据也能回答的 shortcut-solvable tasks |

### 奠基与规范来源

| 来源 | 核验版本 | 本文采用的证据 |
| --- | --- | --- |
| [MLE-bench](https://arxiv.org/abs/2410.07095v6)；[官方仓库快照](https://github.com/openai/mle-bench/tree/507f92e1138bb6e40dac5c6ee7a6758e6424bf97) | v6，2025-02-26 | competition description、dataset/split、local grader、private leaderboard snapshot；三次重复、mean ± SEM、pass@k；提交校验、抄袭检测与 contamination probe |
| [MLGym](https://arxiv.org/abs/2502.14499v1)；[官方仓库快照](https://github.com/facebookresearch/MLGym/tree/9d40c1b5035202018cd7091fb4e83a9c68b377c0) | v1，2025-02-20 | dataset 与 task 解耦；shell workspace 与 task-specific evaluator；model weights、algorithm 和 predictions 等 flexible artifacts；四次独立运行；best attempt 与 best submission 分报；跨异构 metric 的 performance profile/AUP |
| [MLAgentBench](https://arxiv.org/abs/2310.03302v2)；[官方仓库快照](https://github.com/snap-stanford/MLAgentBench/tree/5d71205cc20a8e95d43aa7cb7120e89ca3323e31) | v2，2024-04-14 | task description、starter files、workspace 和 evaluator；保存 agent actions、research plan/status 与 workspace snapshots；以性能提升和效率评估实验迭代 |
| [ScienceAgentBench](https://arxiv.org/abs/2410.05080v3) | v3，2025-03-31 | 102 个来自 44 篇论文的任务；独立可执行 Python 程序；task-specific executable criteria；专家修订的阶段 rubric；污染/shortcut 变换；三次尝试与运行统计 |
| [BLADE](https://arxiv.org/abs/2408.09667v3)；[官方仓库快照](https://github.com/behavioral-data/BLADE/tree/6118fa8d5007b91aa8c91c518182db82446a4547) | v3，2025-11-10 | 12 个开放式研究问题；11 位分析专家独立产出多个合理分析；把 conceptual variables、data transformations 和 statistical model 分开表示并做语义匹配 |
| [BioDSA-1K](https://arxiv.org/abs/2505.16100v1) | v1，2025-05-22 | 1,029 个 biomedical hypothesis tasks 与 1,177 个 analysis plans；结论、证据、计划和可执行代码分轴评估；显式包含数据不足时的 `not verifiable` |
| [PaperBench](https://arxiv.org/abs/2504.01848v3)；[官方实现快照](https://github.com/openai/frontier-evals/tree/51052cede8cc608f95bb00346635e03759013e5a) | v3，2025-04-07 | 代码仓库 + `reproduce.sh` 作为提交；作者共同制定的层级 rubric；8,316 个可评分 rubric 节点；JudgeEval 用专家标签校准自动 judge |
| [DABstep](https://arxiv.org/abs/2506.23719v1) | v1，2025-06-30 | 450 余个多步数据分析任务；95 个核心 workflow 参数化；公开 development subset 与隐藏 test answers；隔离 Python kernel；事实型自动评分经双人抽样核对 |
| [TML-bench](https://arxiv.org/abs/2603.05764v1)；[官方仓库快照](https://github.com/MykolaPinchuk/TML-bench/tree/87c69fbc4c64d847856bea09220540cfc9b8914d) | v1，2026-03-05 | 四个 tabular ML tasks、三个 time budgets、每个 model/task/budget 五次运行；private holdout、median、success rate 与 run-to-run variability |
| [DS-1000](https://arxiv.org/abs/2211.11501v1) | v1，2022-11-18 | 1,000 个自然数据科学代码问题；执行测试与 surface-form constraints 组合；通过修改原始 Stack Overflow 问题降低直接记忆收益 |
| [Croissant 1.1 规范](https://github.com/mlcommons/croissant/blob/401f6fff81db26a49c0d1704f02bffc4e4fa8fe2/docs/croissant-spec-1.1.md)；[官方仓库快照](https://github.com/mlcommons/croissant/tree/401f6fff81db26a49c0d1704f02bffc4e4fa8fe2) | 1.1（2026-01-29），2026-09-10 获取 | Dataset metadata、`FileObject`/`FileSet`、`RecordSet`/`Field`、`sha256`、来源提取/变换和 ML split 描述 |
| [OpenML Tasks](https://docs.openml.org/concepts/tasks/) 与 [OpenML Runs](https://docs.openml.org/concepts/runs/) | 2026-09-10 获取 | Task 把 dataset、精确 train/test splits 与返回要求绑定；Run 把 flow、task、parameter setting、predictions、metrics 和 runtime 关联，支持服务端重算 metric |
| [Jupyter Notebook Format](https://nbformat.readthedocs.io/en/latest/format_description.html)；[规范仓库快照](https://github.com/jupyter/nbformat/tree/4346f97c9d435f41ddfe76d28758b23796fdcf5a) | 2026-09-10 获取 | Notebook 保存 source cells、outputs、execution count 与可扩展 metadata；格式本身不证明 outputs 来自当前 source 的干净执行 |
| [PyTorch Reproducibility](https://docs.pytorch.org/docs/2.14/notes/randomness.html) | 2.14 文档，2026-09-10 获取 | 相同 seed 也不能保证跨 release、platform 或 CPU/GPU 完全复现；需控制多个 RNG、算法选择和 data-loader workers，并可要求 deterministic algorithms fail loud |

## 一手来源事实

### 1. Dataset 与 split 是实验身份，不是目录参数

Croissant 把数据集 metadata 与实际资源分开，`FileObject` 和 `FileSet` 可以带内容 hash，`RecordSet` 描述跨格式 record/field 与来源变换，split 作为面向模型用途的结构化 partition 表达；OpenML 更进一步把“dataset + 固定 train/test splits + 返回要求”定义为可机器执行的 Task，并把运行结果关联到 task、flow、参数、逐实例 predictions、metrics 和 runtime。[Croissant 1.1 §Resources、§ML-specific features/Splits](https://github.com/mlcommons/croissant/blob/401f6fff81db26a49c0d1704f02bffc4e4fa8fe2/docs/croissant-spec-1.1.md)；[OpenML Tasks](https://docs.openml.org/concepts/tasks/)；[OpenML Runs](https://docs.openml.org/concepts/runs/)

MLE-bench 的 75 个 competition 不只记录数据，还记录 problem description、grading code 和 private leaderboard snapshot；原 Kaggle test 不可用时，它从公开 train 重建 test split，并验证 sample/gold submission 在新旧 split 上的分数关系。其 7 个 development competitions 与正式评测集分开，说明“给 agent 调试的集合”和“用于报告的集合”属于 benchmark identity，而不是 CLI 选择。[MLE-bench §2.1–2.2](https://arxiv.org/abs/2410.07095v6)

ScienceAgentBench 为降低 shortcut 与预训练污染，随机移除部分 test records，并对模型开发任务重新划分数据；这会改变任务可执行结果，因此 transformation、split algorithm 和 resulting membership 都必须进入 benchmark revision，而不能只保留原 dataset 名称。[ScienceAgentBench §2.2](https://arxiv.org/abs/2410.05080v3)

DSGym 把 task 表示为 `(D, P, M, Z)`，其中 `D` 是数据文件、`P` 是提示、`M` 是 metric 及配置、`Z` 是任务类别与领域标签；MLGym 则明确将 Dataset 与 Task 解耦，允许一份数据服务多个任务、一个任务引用多份数据。两套系统都为 dataset、task 和 metric 提供独立对象，再用 task definition 建立关联。[DSGym §2.1](https://arxiv.org/abs/2601.16344v1)；[MLGym §3.3–3.4](https://arxiv.org/abs/2502.14499v1)

### 2. Task framing 与 experiment plan 必须可观察

Ambig-DS 把数据科学 framing 明确定义为 target、objective、output form、prediction-time feature availability 和 external-information policy 等选择；其 paired intervention 显示 agent 会生成完全可执行、格式正确、但解决错误问题的 artifact。实验中的运行成功未能发现 framing error；允许一次澄清后，多个模型恢复了相当一部分性能。[Ambig-DS §3–§5](https://arxiv.org/abs/2605.09698v1)

BLADE 的开放式问题由 11 位分析专家独立完成，ground truth 是多份合理分析决策的集合；它分别表示 conceptual variables、data transformations 和 statistical model，并针对不同表达做 matching。BioDSA-1K 为 1,029 个 hypothesis tasks 收集了 1,177 个 analysis plans，还保留“数据不足，无法验证”这一正确结论。两者都保留多条分析路径或多份计划，而不是为每个问题规定唯一代码序列。[BLADE §3–§5](https://arxiv.org/abs/2408.09667v3)；[BioDSA-1K §2–§3](https://arxiv.org/abs/2505.16100v1)

MLAgentBench 的 agent 每一步输出 reflection、research plan/status 和 action，环境保存 action/observation trace 与中间 workspace snapshots；其最终成功标准仍由 task evaluator 判断性能提升。论文分别保存计划、动作、workspace snapshot、最终 artifact 与 evaluator score，没有把计划文本本身作为最终成功判据。[MLAgentBench §1–§3](https://arxiv.org/abs/2310.03302v2)

### 3. Notebook、代码与产出是不同 artifact

ScienceAgentBench 将每个提交统一为可独立执行的 Python program，并用 task-specific executable criteria 检查运行、输出文件和任务结果；PaperBench 要求提交完整代码仓库和根目录 `reproduce.sh`，评分前在新容器执行脚本并检查其生成的 metrics、figures、tables 和 findings。两者都把“源代码存在”和“从受控环境成功产生目标结果”分开。[ScienceAgentBench §2.1–2.3](https://arxiv.org/abs/2410.05080v3)；[PaperBench §2、Appendix F](https://arxiv.org/abs/2504.01848v3)

DSAEval 的 session 在持久 GPU sandbox 中处理连续 queries，最终同时产出完整 Code Notebook 与 Textual Report；其错误分析发现报告中的 metric、hyperparameter 或结论可能没有被执行代码产生，并明确提出 notebook execution trace 与 final report 的一致性检查。[DSAEval §3.2、§6](https://arxiv.org/abs/2601.13591v3)

Jupyter `nbformat` 将 code-cell source、outputs 和 `execution_count` 作为可独立序列化字段，并允许 namespaced custom metadata。该格式规范定义序列化结构，但不定义 outputs 与当前 source、运行环境或一次干净重放之间的 provenance 关系。[Jupyter Notebook Format](https://nbformat.readthedocs.io/en/latest/format_description.html)

MLGym 明确允许 task evaluator 消费 model weights、algorithm implementation 或 predictions 等不同 artifact；DSAgentBench 则把任务初始 OS 状态、应用、数据、setup/cleanup 和 deterministic evaluator 一起配置，并验证实际生成的文件、数值与可视结果。这些 benchmark 的可评分产物至少覆盖程序、代码仓库、模型权重、算法实现、predictions、数值文件和可视结果。[MLGym §3–§4](https://arxiv.org/abs/2502.14499v1)；[DSAgentBench §3、Appendix B–C](https://arxiv.org/abs/2608.10366v1)

### 4. 长流程需要持久状态，但 attempt 之间必须隔离

DSGym 为每条 trajectory 启动独立 worker container 和 Jupyter kernel，将 datasets 只读挂载、workspace 可写，并在同一 trajectory 的后续步骤保留变量、模型和中间文件。DSAEval 同样让连续 query 共享 kernel state。两套框架都把同一 session 内的持久状态作为其任务模型的一部分。[DSGym §2.3](https://arxiv.org/abs/2601.16344v1)；[DSAEval §3.2](https://arxiv.org/abs/2601.13591v3)

MLGym 把 `validate` 与 `submit` 分开，分别记录最佳中间尝试和最终提交；它指出二者差异可测量 agent 是否能记住最佳状态并在后续失败后恢复。MLAgentBench 保存 workspace snapshots，DSAgentBench 保存完整 action/observation 轨迹与任务级系统状态。这些系统分别保留验证调用、最终提交、workspace snapshots 或 action/observation trajectory，使中间尝试可与最终产物区分。[MLGym §3.5、§6.2](https://arxiv.org/abs/2502.14499v1)；[MLAgentBench §1–§3](https://arxiv.org/abs/2310.03302v2)；[DSAgentBench §3、Appendix B](https://arxiv.org/abs/2608.10366v1)

### 5. Metric、attempt selection 与 aggregation 共同定义 estimand

MLE-bench 每个 competition 使用自己的 metric 和 private leaderboard，并把三次独立运行的均值与 SEM 作为默认报告；它另报 `pass@k`，显示多次尝试显著改变“至少一次达到 medal”的概率。MLGym 在四次独立运行上分别报告 best attempt 和 best final submission，并用 performance profile/AUP 处理跨任务异构 metric。AgentDS 将每个任务的原生 metric 映射到同任务人类参赛者分布中的 quantile，再跨领域聚合。这些论文显式区分多种 estimand：单次成功、至少一次成功、平均表现、最佳中间尝试、最终提交和相对人类分位数。[MLE-bench §2.2–§3.2](https://arxiv.org/abs/2410.07095v6)；[MLGym §6](https://arxiv.org/abs/2502.14499v1)；[AgentDS §2、Appendix A.3](https://arxiv.org/abs/2603.19005v3)

DSAEval 对模型差值使用 paired bootstrap 区间，对 reasoning/code/result 权重做完整 simplex sensitivity analysis；其 judge reliability 同时报 score-level Pearson/MAE 与 ranking-level Spearman/Kendall。TML-bench 则以五次运行的 median、success rate 和 run-to-run variability 为主要报告。这些论文采用不同的重复次数、区间水平和跨任务归一化方式，没有形成统一报告协议。[DSAEval §4–§5.1](https://arxiv.org/abs/2601.13591v3)；[TML-bench §2–§3](https://arxiv.org/abs/2603.05764v1)

PyTorch 明确说明，即使使用相同 seed，也不能保证跨 release、commit、platform 或 CPU/GPU 完全复现；同一环境内还需分别控制 PyTorch、Python、NumPy、DataLoader worker 和非确定性算法。该文档把 seed、environment/software/hardware 差异和 deterministic settings 视为相互独立的复现因素。[PyTorch 2.14 Reproducibility](https://docs.pytorch.org/docs/2.14/notes/randomness.html)

### 6. Leakage 不是一个布尔字段

数据科学评测至少暴露六种不同风险。MLE-bench 禁止 agent 直接写 predictions 或在线查 solution，用 log review 和代码相似度检测处理运行时作弊，并通过去除 Kaggle 标识的 prompt obfuscation probe 检查熟悉度效应，但论文明确承认无法排除高层策略污染。DS-1000 修改 Stack Overflow 原题以降低直接记忆收益，ScienceAgentBench 修改 test records 和 split 以同时打击 loader shortcut 与训练污染。[MLE-bench §2.3.1、§4、§6](https://arxiv.org/abs/2410.07095v6)；[DS-1000 §1、§3](https://arxiv.org/abs/2211.11501v1)；[ScienceAgentBench §2.2](https://arxiv.org/abs/2410.05080v3)

DSGym 审计发现部分“file-grounded”任务无需读取文件即可回答，因此过滤 prompt-only shortcut；DABstep 从 95 个核心 workflow 参数化出 450 余题并隐藏正式 test answers，以降低 lucky guess 和直接记忆；Ambig-DS 则证明另一类风险不是答案泄露，而是 target/objective 未锁定导致 silent misframing。[DSGym §1、§4](https://arxiv.org/abs/2601.16344v1)；[DABstep §3](https://arxiv.org/abs/2506.23719v1)；[Ambig-DS §3–§5](https://arxiv.org/abs/2605.09698v1)

这些来源没有提供能够证明“无污染”的单一测试；它们分别测量 source familiarity、近似抄袭、prompt shortcut、split access 和 framing ambiguity，并明确保留未覆盖风险。

### 7. 确定性检查与开放式评分在前沿系统中分层

DSAgentBench 对数值、文件和图表先执行 deterministic validation；只有需要定性判断的可视结果才进入固定 prompt 的 LLM judge，并避免让被测模型评价自己的输出。ScienceAgentBench 用 executable success criteria 判运行和任务结果，以专家修订的五阶段 rubric 对 Data Loading、Processing、Modeling/Visualization、Output Formatting 和 Output Saving 做人工细粒度评价。[DSAgentBench Appendix C](https://arxiv.org/abs/2608.10366v1)；[ScienceAgentBench §2.3](https://arxiv.org/abs/2410.05080v3)

PaperBench 的层级 rubric 由论文作者参与制定，叶节点二元判定后按权重向上聚合；JudgeEval 用专家评分的 submissions 检验自动 judge。DSAEval 以人类 consensus 选择 judge，排除与人类偏差较大的候选，再用两个独立 judge 的均值评分，并报告 human–judge、inter-judge 与权重敏感性。两项工作都把 judge 与 human labels 的一致性作为单独测量结果，而不是假设 judge 天然正确。[PaperBench §2–§4](https://arxiv.org/abs/2504.01848v3)；[DSAEval §3.3、§5.1](https://arxiv.org/abs/2601.13591v3)

BioDSA-1K 的 `not verifiable` 表示“现有数据不足以支持或反驳 hypothesis”；论文将其作为任务语义中的合法答案，并与代码不可执行、错误支持或错误反驳分开统计。[BioDSA-1K §2–§3](https://arxiv.org/abs/2505.16100v1)

## 对 DSH 的设计推论

以下是结合一手来源与当前 [Data Evaluation 术语](../../../packages/eval/CONTEXT.md) 得出的本仓设计建议；来源没有规定这些 TypeScript 名称、包名或 Cordis 插件边界。

### Shared Data-domain Evaluation Core 应拥有

| 概念 | Core 最小职责 | 不进入 Core 的具体语义 |
| --- | --- | --- |
| Benchmark / case identity | `BenchmarkPack`、`CaseManifest`、revision、content digest、provenance、split/cohort membership | 某个业务 scope、竞赛名、SQL case 命名规则 |
| Dataset artifact identity | 数据来源、版本、content digest、media/schema reference、access class、derived-from lineage | CSV/Pandas、图像 tensor、feature table 的解析规则 |
| Partition identity | 具名 partition reference、membership 或生成器 digest、生成 seed、group/time unit、visibility | `train/validation/test` 的统计语义与具体 splitter |
| Run and attempt lifecycle | run group、attempt、step、checkpoint、validate、submit、finalize、timeout、resource observations | Jupyter cell、pipeline stage 或 model-training epoch 的 payload |
| Evidence envelope | evidence id、producer、time、phase、schema version、artifact refs、access classification、required/ignorable | query result、feature lineage、model metric、chart rubric 的字段 |
| Artifact reference | immutable digest、media type、size、producer、lineage、visibility、storage locator/opaque handle | Notebook、model、feature set、prediction 等 artifact codec |
| Metric and grading protocol | metric/policy identity、direction、target partition、evaluator digest、raw observations、attempt-selection、aggregation、uncertainty method | AUROC、RMSE、statistical-test result、visual rubric 的计算实现 |
| Randomness and replication | replicate id、declared seed schedule、actual seed receipts、determinism mode、environment identity | 各 ML framework 如何设置 RNG |
| Grading provenance | deterministic/human/judge stage、rubric digest、judge identity、prompt/config、human panel、calibration evidence | 数据科学 rubric 维度和 task-specific success criteria |
| Leakage evidence | 风险类别、检查器 identity、检查输入、命中、未检查项、access audit | target leakage、post-treatment leakage、group overlap 的领域算法 |
| Standard projections | outcome、duration、cost、finality、artifact set、failure attribution、metric observations | 所有 extension payload 的闭集枚举 |

Core 应保持 merge-extensible `EvaluationEvidenceMap`。一个 extension 注册 namespaced payload 与 projection，例如 `data-science/model-evaluation@1`；读取端遇到未知 required payload 时拒绝该 run，只有 schema 明确标记 `ignorable` 的辅助 evidence 才能跳过。Core 不应提供 `payload: unknown` 后任由调用方猜测，也不应把当前 data-analysis 的 SQL rows 提升为公共 evidence 基类。

### Data-science extension 应拥有

1. **数据科学 framing**：prediction target、analysis unit、objective、output form、prediction-time feature availability、external-data policy，以及 `clarify | commit | abstain` 的合法动作与记录。
2. **数据科学 Experiment Plan**：hypothesis/question、dataset roles、baseline、feature strategy、model/statistical method、validation strategy、metric、seed schedule、resource budget、stopping rule 和 required deliverables。它是 agent 产出的 evidence；Benchmark 只规定必填决策与可接受约束，不要求与唯一 reference plan 完全相同。
3. **Partition 语义**：train/validation/test/hidden holdout、fold、group、time-window、stratification、sampling unit、label visibility 和 evaluation-time availability。
4. **Artifact codecs 与 lineage**：source/executed notebook、script/package、feature set、dataset transform、model/checkpoint、predictions、metric table、figure 和 scientific report；每个产物声明输入、producer step 和 derivation edge。
5. **Notebook execution receipt**：kernel/environment identity、clean-start 标志、cell execution order、stdout/stderr、generated artifacts、exit/failure、wall time 和 resource use。Notebook 中已有的 outputs 不能替代该 receipt。
6. **模型与特征语义**：estimator family、hyperparameters、fit partition、feature sources/transforms、serialization format、framework/runtime、checkpoint relation 和 inference entry point。Core 只保存 opaque artifact/reference 和 lineage。
7. **统计计划与结果**：metric implementation、方向、估计对象、sample/cluster unit、replicates、confidence interval 或 uncertainty summary、multiple-comparison correction（若适用）及 baseline delta。Core 负责冻结与关联这些声明，不选择统计方法。
8. **数据科学 leakage checks**：row/entity/group/time overlap、target/post-outcome feature、fit-on-test、private-label access、external lookup、source-code plagiarism、prompt-only shortcut 和 contamination probes。
9. **开放式 grading rubric**：methodological validity、code/execution、evidence–claim consistency、visual/report quality和 `supported | refuted | not_verifiable` 等 task-specific verdict。确定性检查失败时不应继续用 judge 掩盖失败。

### 不应进入共享 Core 的默认值

- Notebook、Python、Pandas、SQL、CSV、`submission.csv` 或模型文件是 extension artifact kind，不是所有数据任务的必选项。
- `accuracy`、AUROC、RMSE、Kaggle medal、human quantile 或某个 confidence level 不是默认 metric/aggregation。
- `train/validation/test` 是 data-science partition profile，不是所有数据工程与数据分析任务都必须具备的固定三分法。
- `best-of-k` 不是默认 attempt selector；它测搜索预算上限，不等于可靠交付。
- 单一 reference code、analysis plan 或 notebook 不是真值的唯一表达。
- “seed 已设置”“LLM judge 已调用”“污染扫描无命中”都不能自动产生 `reproducible`、`judge_validated` 或 `contamination_free` 状态。

## 建议的最小 data-science conformance fixture

### 目标

建立一个小而完整的 binary-classification case，验证 Data-domain Core 的 envelope、artifact、identity、private grading、replicate 和 lifecycle 能被 data-science extension 使用，同时不引入某个现有 DataScope、warehouse、SQL 或外部竞赛约定。该 fixture 证明协议接得上，不用作模型能力排行榜。

### Case bundle

```text
data-science-classification-conformance-v1/
├── pack.yaml
├── cases/device-failure-001.yaml
├── public/
│   ├── dataset-metadata.json
│   ├── train.csv
│   ├── predict.csv
│   ├── starter.ipynb
│   └── task.md
├── private/
│   ├── predict-labels.parquet
│   ├── grading-material.json
│   └── leakage-assertions.json
├── policies/
│   ├── experiment-plan-v1.yaml
│   ├── binary-classification-v1.yaml
│   └── reproducibility-v1.yaml
└── environment/
    └── python-tabular-v1.yaml
```

数据由仓内 versioned generator 生成，规模保持在秒级运行。实体为设备，记录带 `entity_id` 与 `event_time`；partition 使用固定的 group-and-time rule，保证同一设备不会跨 train/private holdout，且预测时间晚于训练窗口。Public train 包含 label，public predict 不含 label，private labels 只能由 grader provider 解析。加入一个明确标记为 prediction-time unavailable 的 post-outcome column，用来证明 feature-lineage checker 能拒绝 leakage，而不是期待模型自行避免。

### Agent 必须产出的 extension artifacts

1. `experiment-plan.json`：明确 target、analysis unit、candidate features、baseline、validation strategy、metric、seed schedule、预算和停止条件。
2. `analysis.ipynb`：authoring artifact；允许交互探索，但不得把内嵌 outputs 当作通过证据。
3. `reproduce.py` 或等价 entry point：从 clean environment 读取 public inputs，训练并生成其余 artifacts。
4. `feature-manifest.json`：列出 feature 来源、transform、fit partition 与 prediction-time availability。
5. `model-artifact`：带 framework、format、training input digest、hyperparameters 和 seed receipt；不要求跨平台 byte-identical。
6. `predictions.parquet`：以稳定 row/entity key 对齐 private holdout，不包含 labels。
7. `metrics.json`：保存每个 replicate 的 public-validation observations；不得包含 private score。
8. `report.md`：结论中的每个 metric、feature claim 和 selected model 都引用对应 artifact/evidence id。

### 执行与评分路径

1. Composition root 解析 `CaseManifest`、DataScope requirement、Environment binding、artifact profiles、`ResolvedGradingPlan`、metric plan 和固定 seed schedule `[11, 29, 47]`，然后冻结 digest。
2. Harness 在一个 attempt 内保留 workspace 和 kernel state，记录每个 execute、validate、checkpoint 和 submit 事件；新 attempt 使用干净 namespace，public datasets 只读，private labels 不挂载。
3. `validate` 只检查 public schema、执行成功、artifact 完整性和 public-validation metric；它不泄露 private metric。`submit` 固化最终 artifact set，后续修改不能改变该 submission。
4. Grader 在独立 provider 中从 clean environment 运行 `reproduce.py`，验证 notebook/source 与执行 receipt 的关联、feature lineage 不包含禁止列、prediction keys 完整唯一，并在 private labels 上重算 task metric。
5. Grader 保存三个 seed 的原始 metric observations、mean/median、spread 和预声明 baseline delta；本 fixture 只验证统计 plumbing，不以三个 seed 宣称普遍科学充分性。
6. 最终结果分开记录 execution outcome、artifact validity、leakage checks、reproducibility checks 和 benchmark score；任一 infrastructure/grader failure 不得写成 model incorrect。

### Conformance assertions

- 改动任一 dataset、split membership、metric implementation、seed schedule、environment image、notebook/source 或 private material 时，对应 identity 必须变化。
- Harness 无法解析 `GradingMaterialRef`，且其日志、workspace snapshot 和模型可见上下文不包含 private labels。
- 缺失、重复或顺序错配 prediction keys 会 fail loud；grader 不按行位置猜测对应关系。
- 使用 post-outcome forbidden feature 会产生独立 `leakage_detected` evidence，而不是普通低分或执行失败。
- Notebook 仅在 clean kernel 顺序执行成功并产生已声明 artifact 后获得 execution-valid 状态。
- 三个 replicate 各自保留 seed、environment、artifact 和 metric；aggregate 可从 raw observations 重算。
- `best validation attempt` 与 `final submitted attempt` 分开，避免把探索上限误报为交付成功率。
- 删除或篡改任一 evidence payload、artifact 或 grader policy 后，digest/引用检查必须拒绝历史 run。
- 一个未知 data-science evidence payload 若为 required，Core reader 必须拒绝；若显式 `ignorable`，Core 仍能读取标准 projections。

## 对 G10 下一轮的直接建议

研究支持把 Question 7 收敛为：采用稳定 `EvidenceEnvelope` 与 namespaced、versioned extension payload；同时把标准 projection 和 required/ignorable 读取规则写进 core，否则“可扩展”会退化为不可查询的任意 JSON。

下一轮真正有价值的选择不是“开放 map 还是封闭 union”，而是：**Core 的最小强制 projections 到底只覆盖运行事实，还是也覆盖通用测量事实？** 两个都有长期价值的候选边界是：

- **Lifecycle-only core**：只强制 identity、time、producer、artifact refs、finality、cost 和 failure attribution；所有 metric observation 都属于 extension。Core 最稳定，但跨数据工程、数据分析、数据科学的比较与统一报告较弱。
- **Lifecycle + measurement core**：在上述字段外，再强制 metric identity、target population/partition、direction、raw value、uncertainty、replicate/aggregation links 和 grading provenance；metric 的计算与领域语义仍由 extension 拥有。Core 稍深，但能防止不同 extension 各自发明不可比较的 `score`。

本文倾向 **Lifecycle + measurement core**。数据工程质量率、数据分析正确率和数据科学 AUROC 的数值不可直接比较，但它们都需要说明“测了谁、用什么规则、在哪些 replicate 上如何聚合、由谁计算”，这正是跨子领域稳定的共同事实。

## 明确来源缺口

1. 没有一手来源提供跨数据工程、数据分析和数据科学的完整 canonical protocol；本文的 Core/extension 分界是 DSH 设计推论，不是论文共识。
2. Croissant 能描述 dataset resources、records、fields 和 splits，但不定义 agent run、private grader access、workspace checkpoint、model artifact 或 statistical estimand；OpenML Task/Run 很接近可复现实验身份，但主要面向传统 ML flow，不覆盖长程 agent trajectory。
3. 没有通用、机器可检查的 experiment-plan 标准。MLAgentBench 保存自由文本 plan，BLADE 与 BioDSA 表达分析决策，但字段和评分目标不同。
4. Notebook 生态没有统一的“可信执行收据”。`nbformat` 规定序列化结构，不证明输出新鲜、有序、无隐藏 kernel state 或来自声明环境。
5. Model/feature artifact 没有跨框架统一格式。现有 benchmark 多数评分 predictions 或 task metric；即使保存 weights，也很少统一记录 feature fit scope、training lineage、serialization compatibility 和 inference entry point。
6. 没有统一的 seed 数、置信区间、跨任务 normalization 或 best-of-k 报告协议。三次、四次、五次运行和不同聚合在一手来源中并存；DSH 必须由 Benchmark 显式声明 estimand，而不能把其中一个数字定成全局默认。
7. 公开数据污染无法被可靠证明为不存在。Prompt obfuscation、题目扰动、代码相似度、shortcut filtering 和时间新鲜度只覆盖不同风险；未来若需要强污染结论，仍需受控 heldout/fresh 数据与访问审计。
8. 自动 judge 的可靠性证据不能跨 rubric、领域或输出模态直接迁移。PaperBench 与 DSAEval 的人类一致性结果只支持各自协议；新的 data-science rubric 必须重新校准。
9. 现有论文对长流程 finality、外部 side effects、跨 attempt 清理和 crash recovery 的统一定义仍不足。DSGym、DSAEval、MLGym 和 DSAgentBench证明了持久 workspace 的必要性，但没有给出可直接复用的统一生命周期协议。
10. 本次未发现能够同时验证 notebook 重放、feature lineage、model artifact、private holdout、多个 seeds、统计不确定性和人工/自动混合评分的公开小型 conformance suite；上述 fixture 是待实现并审计的 DSH 提案。
11. DSAEval v3 提供项目页但论文未给出可固定 commit 的官方实现仓库；Ambig-DS、AgentDS 与 BioDSA-1K 的部分评测资产也未在本次核验中形成可逐文件审计的固定仓库快照。本文只把论文明确描述的机制当作来源事实，不推断未公开实现。
12. 检索截止日是 2026-09-10；DSAgentBench（2026-08-11）和 DSAEval v3（2026-09-07）是本次找到的最近直接相关来源。arXiv 收录延迟、未公开工作和后续版本仍可能改变前沿判断。
