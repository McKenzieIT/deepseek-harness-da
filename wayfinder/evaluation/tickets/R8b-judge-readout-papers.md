# R8b — 判官读出与聚合：全文认读（GEAR / agreement metrics / veto / holistic-vs-atomic）

**Type**: research（认读分析论文）  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: 无（[R8](R8-pairwise-judge-papers.md) 已 resolved 并交付候选清单）
**Blocks**: [G8 — 判官读出与量表](G8-judge-readout-scale.md) 的决策 1 / 3 / 4；为 [R20](R20-judge-readout-probes.md) 探针 b/c 的指标口径定纪律
**Mode**: AFK（本环境直接做，见 [playbook](../playbook.md) §1.1）
**Branch**: `research/R8b-judge-readout-papers`
**依据**: [R8 Resolution 补记](R8-pairwise-judge-papers.md) + [`../research/lit-gap-2026-09-11.md`](../research/lit-gap-2026-09-11.md) §3.1 + [`../research/pairwise-judge-papers.md`](../research/pairwise-judge-papers.md) §9.2–9.4、§9.7

## 为什么需要这张票

R8 的补搜（2026-09-11）**证伪了 R8 自己的一条负空间结论**：「没人研究二值准则 + 阈值化聚合」是错的。但补搜只到**摘要层**（元数据 + abs 页），而 R8 对方向 8 那六篇执行的是**全文认读 + 逐条引文机械回核**。**两个证据等级之间的差，正好卡在 G8 的第 1 决策上**——G8 现在既不能假装先例不存在，也不能拿摘要层证据当依据。

本票把那道差填掉。

## Question

1. **GEAR 的 leakage 能否直接量我们的漏？** `2606.03361` 把「flat scalarization 让 reward/penalty 在许可条件缺席时照样记功」命名为 **False Credit Propagation**，并把量化它的指标叫 **leakage**。本仓测到的 128 条（8.56%）在定义上是不是同一个量？**它的形式定义能否逐字套用在 1495 条已落盘判决上**（`sql_judge.dimensions`，见 [R20](R20-judge-readout-probes.md) 探针 a）？
2. **它的 prerequisite 图必须人写还是可归纳？** 若必须人写，**本仓 5 维的那张图就是 G8 要裁的东西之一**，而不是实现细节。
3. **gating 的代价是多少？** GEAR 自称「preserving more licensed downstream utility than **deterministic gating**」——即它测过 gating 的损失。那个损失在本仓语境（pass/fail 报告，而非 RL 策略改进）下是否仍然是损失？**这是「改成 `overall_semantics` 单闸门」最先会被问到的问题。**
4. **我们该报什么数才不算自欺？** `2606.00093` 测出仅换池化口径就把准确率从 0.551 推到 0.899、κ 跨过零，**「without altering a single verdict」**。那套 micro / macro / item-level 的区分与「decision rule」的定义，落到本仓 5 维上具体是什么？
5. **veto 该在哪一层？** `2510.11822` 优化了 **minority-veto** 并测出判官 TPR 96% / **TNR < 25%**——但它的 veto 是**跨判官**，不是**跨准则**。那套优化能否转写到跨准则？
6. **holistic 到底看见了什么子准则看不见的东西？** `2603.28005` 是唯一 holistic vs 原子分解的头对头，holistic 三个基准里两个胜出且优势集中在**「不完整性检测」**。那个机制是什么，本仓的 `overall_semantics` 是否正是同一回事？

## 待认读（按读序；均已 ID + 标题验真，见 lit-gap §3.1）

| 序 | arXiv | 抽什么 |
|---|---|---|
| 1 | `2606.03361` **GEAR** | `leakage` 与 FCP 的形式定义（公式级）；prerequisite / activation 关系是人写还是归纳；flat vs deterministic gating 的完整对照表；96.5% leakage 削减与最多 15.5% 提升的条件（哪三个 benchmark、哪两个 backbone）；**它是 RL 奖励论文——目标是策略改进而非 pass/fail 报告，这个层级差必须写清** |
| 2 | `2606.00093` | micro / macro / **item-level** 三级池化的定义；"decision rule" 出现处的原文；0.551→0.899 与 κ 跨零的实验条件（主数据集是 Hashemi et al. 2024 的 **1-4 序数**，不是二值——这个限制要标）；**「非退化二值判决下 Pearson / Spearman / Kendall τ_b / φ / MCC 重合」这条**（⇒ 并列报多个相关系数是伪佐证）；末尾的 reporting checklist 逐条 |
| 3 | `2510.11822` | minority-veto 的具体形式与最优 veto 数；TPR 96% / TNR<25% 的样本与判官；它是否处理过 class imbalance 导致的可靠性虚高；**veto 跨判官 → 跨准则的转写是否成立** |
| 4 | `2603.28005` | holistic vs atomic 的 prompt 控制方式（它刻意控制了「分解 prompt 更长更富」这个混淆）；三个基准的逐个结果；**「优势集中在 partially_supported / 不完整性检测」的证据**；atomic 判决是否二值、如何 roll up（abs 页未说） |
| 5 | `2603.00077` **Autorubric** | **只读 §3.3 与 Eq. 1**：确认跨准则聚合是加权和、clamp 到 [0,1]、**无阈值**，且 majority/unanimous/any-vote 是**判官之间对同一条准则**投票；确认四规则**从未头对头比较**（RiceChem 单判官 / ResearcherBench 两判官分列 / CHARM-100 未用 ensemble）。另核 subagent 标为 grade C 的 **prefix-caching 成本次线性**说法是否真实存在——**它直接决定 [R20](R20-judge-readout-probes.md) 探针 c 的 `5N` 成本估算是否成立** |
| 6 | `2505.08775` **HealthBench** | **只读 scoring 一节**：确认是加权点数归一化、**完全没有 pass/fail 阈值**；48,562 条准则与 grader 的元评估口径（macro-F1 over met/not-met） |
| 7 | `2606.19544` | 仅取指标纪律所需：exact-match 与 Cohen's κ 的通缩在 MT-Bench 上 **33–41pp**、原文「systematically overstates discriminative ability」；以及**一致性–偏置悖论**（两个生产判官 test-retest >0.95 与位置偏置 >0.10 并存）的具体判官与口径 |

## 必答

1. **本仓 128 条漏与 GEAR 的 leakage 是否同一个量**——是 / 否 / 部分，附形式定义比对。若是，**给出能在 1495 条向量上直接算的表达式**（这将成为 R20 探针 a 的第二个输出）。
2. **G8 第 1 决策的候选方案表**：flat mean（现状）/ `overall_semantics` 单闸门 / GEAR 式图聚合 / minority-veto。每个方案给：**已发表的收益、已发表的代价、本仓适用性的具体障碍**。⚠ 论文管不到的部分不要假借论文权威（R8 §7.2 的教训）。
3. **R20 探针 b/c 的指标口径定稿**：报哪些统计量、池化到哪一级、为什么。含「不得只报 exact-match」的一手依据。
4. **探针 c 的 `5N` 成本估算是否成立**（取决于第 5 条 Autorubric 的 caching 说法）。
5. **一句话的差异化声明**：在 GEAR 已存在的前提下，本仓的贡献究竟是什么。R8 给的版本是「**无人测过单 prompt 内 holistic 准则被同场机械子准则投票推翻，更无人在生产落盘判决上测过**」——本票须确认或改写它。

## 证据标准（不可降级）

- **全文认读**，非摘要层。引文须**逐字 + 行号**，并由本票作者用 `grep -nF` 对 `pdftotext -layout` 的文本机械回核（R8 做了 83 条、0 实质失败，同一流程）。
- **抓取物留 `.tmp/`（不入 git）**，但**回核结果写进产物**。
- **`export.arxiv.org` 对本机 429**：候选 ID 合并成**一次**批量查，带 `--retry-all-errors --retry-delay`（lit-gap §6 第 3 条）。
- **两个标题坑**：`2606.00093` 的**渲染标题与元数据不同**（元数据权威于身份、不权威于标题）；方法名常被二手来源当标题（已 5 次）。见 map §⚠ 验证 TODO。
- **subagent 输出 = 凭记忆的断言**，未经自己回核不得进产物（CLAUDE.md 引证纪律 2）。

## 不在本票范围

- 做决策（[G8](G8-judge-readout-scale.md)）、跑探针（[R20](R20-judge-readout-probes.md)）、实现（T7）。
- 参考答案与 judge artifact 那一半 → [R8c](R8c-reference-anchor-papers.md)。
- 方向 11 关于 `2607.06799` 的数字冲突（lit-gap 记录，归 R11）。
