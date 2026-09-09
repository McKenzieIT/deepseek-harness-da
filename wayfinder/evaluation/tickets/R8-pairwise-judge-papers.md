# R8 — Pairwise / rubric-anchored judge 与 RADAR 冗余审计论文认读

**Type**: research  ·  **Status**: **resolved**（2026-09-10）
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: 无
**Blocks**: [R20 — 判官读出与准则探针](R20-judge-readout-probes.md)、[G8 — 判官读出与量表](G8-judge-readout-scale.md)
**Mode**: AFK（本环境直接做，见 [playbook](../playbook.md) §1.1 —— R 认读一律本环境）
**Branch**: `master`（纯 `wayfinder/` 文档，CLAUDE.md 直推例外；按路径 stage、逐单元 commit）
**产物**: [`../research/pairwise-judge-papers.md`](../research/pairwise-judge-papers.md)

## Question

方向 8 摆着三条互不等价的判官改造路线，map 目前把它们并列写在一行里：

- **(a) pairwise** —— 候选 vs reference 逐维 head-to-head + 位置 swap，Bradley-Terry/Elo 聚合成 pass^k；
- **(b) rubric-anchored** —— 逐维 isolated pass + gated 依赖图；
- **(c) 降维** —— 先做 RADAR 式冗余审计，把当前 5 维塌成更少的正交维。

一手来源对这三条各自**确立了什么**：测的是什么量、报告的效应量多大、各自需要什么输入（要 reference answer 吗？要人写 rubric 吗？要几次判官调用？）、彼此在哪里互相矛盾？

由此收窄成两个可执行的下游问题：

1. **G8 到底要裁什么** —— 哪些是论文已经替我们裁掉的（不必再 grill），哪些纯属本仓自主选择（不要假借论文权威）。
2. **R20 到底跑什么统计量** —— RADAR 式审计在本仓 5 维上的**确切算法**：输入是哪些已落盘字段、算什么、多少样本才有意义、什么阈值算「冗余」。R20 是 quick win，前提是 R8 把它降到「跑一个脚本」而不是「再设计一次实验」。

## 待认读论文

> 进产物前每条必须由本 session 亲自 primary-fetch `export.arxiv.org` 元数据核对 id↔标题↔作者↔日期（CLAUDE.md 引证纪律 2：subagent 输出 = 凭记忆断言）。核验结果表进研究笔记 §1。

- **RADAR(2608.01810)** —— preflight coupling / 冗余审计，**R20 的方法来源，本票主线**
- **TrustJudge(2509.21117)** ✅ 已 spot-check 真实 —— pointwise vs pairwise 23.32% 不一致
- **Am I More Pointwise or Pairwise(2602.02219)** —— pointwise/pairwise 取舍
- **Grading Needs a Rubric Not Intelligence(2608.17938)** —— answer 解释 95.6% 方差
- **SARA(2608.14684)** —— 多 rubric 单 pass 仅 1/3 一致
- **Graph-Structured Rubrics(2608.12097)** —— gating

## 本仓已知的纠缠事实（认读时直接映射，不必重新发现）

> 本节事实由本 session 自己用确定性命令重导后填入（见研究笔记 §2）。占位于 claim 时写下，避免把 map 的转述当既成事实。

- 当前判官是 P11d 落地的 **5 维 + 0.6 阈值**（table/field/filter/aggregation/overall），dual-score 与 execution 并列。
- 已测出的病灶：judge false-pass 35.9pp（**该数字连同 73.7%/61.9%/12.8% 已于 2026-09-08 全体失效**，见 map §Destination 警示；R8 只引「方向存在」不引具体百分数）。
- 便宜模式 vs 真执行同 39 case 差 **56.4pp**（G1 v3 D4）——判官在无执行事实时系统性偏松。
- fog 中的一条待判机制：judge 用 BM25 候选当 schema context，可能是独立的假通过来源（map §Not yet specified 第 2 条）。

## 产出

`../research/pairwise-judge-papers.md`，仿 [R1 v3](R1-exec-grader-papers.md) 的做法**严格区分**：

- **来源事实** —— 论文全文、官方实现源码或本仓确定性命令直接支持的，逐条给出处（`arXiv:id` + 节/行，或 `file:line`）
- **设计推论** —— 对 G8/R20 与 `packages/eval/` 的建议，不宣称是论文原文结论

**必答**：
1. 六篇的身份核验表（id↔标题↔作者↔日期↔journal_ref）。
2. (a)/(b)/(c) 三路线各自的输入需求与判官调用成本（本仓 pass^k 语义下 ×k 的代价）。
3. **R20 的可执行规格**：字段、统计量、样本量、判据阈值。
4. 三路线与方向 2（blind-solve-then-score）、方向 3（校准 + gated dual-score）的重叠与冲突——避免 G2/G3/G8 各裁一次同一件事。

## 不在本票范围

- 做出判官架构决策（G8）或实施（T7-pairwise-judge-impl）。
- 跑 R20 实验本身（R8 只交付它的规格）。
- 引用未 primary-fetch 确认的论文；本环境 429/403 时该条降级为「待核」，不进产物。

---

## Resolution（2026-09-10）

产物：[`../research/pairwise-judge-papers.md`](../research/pairwise-judge-papers.md)（8 节）。论文原文引文 **83 条全部由本 session `grep -nF` 机械回核**，行号一并核对，0 条实质性失败。

### 1. 身份：6/6 真实，map 有两处称法错误

一次 6-id 批量查 `export.arxiv.org`（`totalResults=6`）。两处修正：

- **`2608.14684` 的标题不是「SARA」** —— 真标题 *Mitigating Rubric Interference in LLM Judges via On-Policy Self-Distillation*，SARA 是方法名（与 R1 v3 抓到的 GradeSQL 同一类错误）。
- **`2602.02219` 不是「pointwise vs pairwise 取舍」** —— 它研究 rubric-based 评测的**位置偏置**；对本仓有用的是它的第二条轴：一次 prompt 内多准则同评时，**准则排列顺序会移动分数**。

### 2. 最重要的结果不在论文里，在本仓的读出算术

1495 条已落盘逐维向量（19/80 份结果文件）上：`overall_semantics == 1` 却被现行 `mean>=0.6` 判 FAIL 的有 **0 条**；`== 0` 却被判 PASS 的有 **128 条（8.56%）**；且 `P(四个机械维度全为 1 | overall=1) = 0.9984` vs `| overall=0) = 0.0325`。

⇒ **现行五维 rubric 实测上是「一个单维闸门 + 一组只在闸门说不时才生效的推翻票」**。判官说「这条 SQL 答不了用户的问题」的 246 次里，128 次（**52.03%**）该 case 仍然通过。这比 map 方向 8 的原假设（「2-3 维测同一潜变量」）更极端：**四维在决策上几乎不参与，只充当漏。**

### 3. 三条路线的一手结论

- **(a) pairwise —— 本方向最弱的支线。** 换 pairwise 引入 transitivity 与 tie 两类**新**不一致（TrustJudge Def. 2.2）；GSR 的 pairwise「数值最高」优势（+0.77/+0.28）落在 1σ（0.30/0.51）内。
- **(b) rubric-anchored + gating —— 强，但强的那一半是「参考答案」不是「gating」。** `2608.17938` 的两个 ablation：去掉准则与等级但留官方答案 ⇒ ICC 0.880→0.888（几乎无变化，原文称 criteria are redundant）；**连官方答案也去掉 ⇒ ICC 落到 0.628、分数通胀 +0.074、只能靠答案核对的题判别力掉到 30–36%**。而本仓 SQL judge 恰好没有参考答案，且语料里 39 个 case 的 `expected.sql` 正被 loader 丢弃 ⇒ **这与 T11 是同一块工作。** GSR 的 gating 侧：gate **不是早退**（所有 criterion 判断先出、operator 后跑），省不了 token；且它**从未与 unweighted mean 比过、从未测阈值化聚合**。
- **(c) 降维 —— 结论已由 §2 给出，且 RADAR 给不出它。** 见下。

### 4. RADAR 不能跑既有数据（map 对 R20 的描述有三处不成立）

RADAR 是**干预式**方法：每个量都是 `d=+` 与 `d=−` 两个 probe 集之差；原文明写「Correlation in observed scores cannot separate criteria the judge treats as one dimension from criteria that merely co-occur in the data」。用既有数据能算的恰是它的 passive baseline —— 而该 baseline 在 SummEval 上 **r = −0.111**（RADAR 为 +0.842），**连符号都是反的**。另两处：RADAR 的量表是 **0-4**（本仓二值）、verifier **逐准则单独调用**（本仓单调用，照搬会测到一个不是生产判官的判官）。

全文唯一数值门 `τ = 0.40` 是**可靠性门**，不是冗余判据；冗余阈值原文交给使用方（「teams set a policy threshold」、「RADAR deliberately stops at diagnosis」）。

### 5. R20 拆成四个探针（→ [R20](R20-judge-readout-probes.md)）

| 探针 | LLM 调用成本 | 前置 |
|---|---|---|
| **a** 读出算术复核（**已完成于本票**） | 0 | 无 |
| **b** 准则顺序扰动（K=3~5 个排列） | `(K−1)×N` | 无 |
| **c** isolation-vs-joint（五维各自单调用） | `5N` | 无 |
| **d** 真 RADAR | `10KN(1+K)`；K=5,N=5 ⇒ ≈1500/cell | 须先改量表 + 改调用结构 |

样本可复用已落盘的 `generated_sql`（**只重跑判官、不重跑 agent**）—— 这是 b/c 便宜的真正原因。b 是唯一能测「`overall_semantics` 恒在末位」这一自由度的探针。

### 6. 跨方向边界（避免 G2/G3/G8 各裁一次同一件事）

- **方向 2（blind-solve）的题面须改**：`2608.17938` 说得更强 —— 不需要 blind-solve，**只要有官方答案**。所以有 `expected.sql` 的 case 走 reference-anchored（便宜、已被直接测过），没有的才走 blind-solve（贵、未验证）。
- **R14 的前置须改**：唯一能做逐维-vs-执行配对分析的文件只有 `eventdef-realexec.json`（n=95 / 35 case），其真值受 event anchor 污染（16/18 期望值失效）⇒ R14 应改为「T11 之后、在重建的 EXECUTION 语料上做」。
- **judge 侧 artifact 落盘不归 G8**：80 份结果文件 **0 份**记录 `schema_context`，与 G1 D3 同类，建议并入 **T1 的 artifact schema**。

### 7. 本票没有回答的

- 上述任何一个探针的实际数字（归 R20）。
- 「读出改成什么形状」的决策（归 [G8](G8-judge-readout-scale.md)）。
- 参考答案的具体形态（`expected.sql` 文本 / 执行结果集 / 两者）—— 与 G1b 的 provenance 决议耦合，归 G1b。
