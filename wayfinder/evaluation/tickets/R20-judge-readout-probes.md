# R20 — 判官读出与准则探针（原名 `R20-radar-redundancy`）

**Type**: research（experiment）  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: 无（探针 a/b/c）；探针 d 由 [G8](G8-judge-readout-scale.md) 的量表与调用结构决议解锁
**Blocks**: [G8 — 判官读出与量表](G8-judge-readout-scale.md)（b/c 的数字喂 G8 的决策 1 与 4）
**Mode**: AFK
**Branch**: `research/R20-judge-readout-probes`
**依据**: [R8 Resolution](R8-pairwise-judge-papers.md#resolution2026-09-10) + [`../research/pairwise-judge-papers.md`](../research/pairwise-judge-papers.md) §3、§5、§7.3

> **改名理由**：map 原将本票记作 `R20-radar-redundancy`（「RADAR 跑现 5 维、既有数据分析、quick win」）。[R8](R8-pairwise-judge-papers.md) 证明该描述三处不成立 —— RADAR 是**干预式**方法、要 **0-4 量表**、要**逐准则单独调用**，跑在既有观测数据上会退化成它自己要打败的 passive baseline（该 baseline 在 SummEval 上 `r = −0.111`，符号都是反的）。真 RADAR 因此降为**有前置的探针 d**，票的重心移到读出与顺序。

## Question

本仓 SQL semantic judge 的五维读出有三个从未被测量的自由度，各自需要一个独立探针。**a 已由 R8 完成**，b/c 便宜且无前置，d 贵且有前置。

| 探针 | 问题 | LLM 调用成本 | 前置 |
|---|---|---|---|
| **a** 读出算术 | 四个机械维度在决策上是否起约束作用？ | 0 | — （**R8 已答**） |
| **b** 顺序扰动 | `overall_semantics` 恒在末位，是否压低/抬高了它？ | `(K−1)×N`，K=3~5 | 无 |
| **c** isolation-vs-joint | 五维同场同评，各维判决被同场准则移动多少？ | `5N`（joint 侧已有） | 无 |
| **d** 真 RADAR | 准则间的**方向性**耦合矩阵长什么样？ | `10KN(1+K)`；K=5,N=5 ⇒ ≈1500/cell | 量表改 0-4 + 判官改逐准则调用（G8 决策 3、4） |

## 探针 a —— 已答，只剩固化

R8 在 1495 条已落盘逐维向量上测得：`overall_semantics == 1` 却被 `mean>=0.6` 判 FAIL **0 条**；`== 0` 却判 PASS **128 条（8.56%）**；`P(四机械维全 1 | overall=1) = 0.9984` vs `| overall=0) = 0.0325`。结论见 [R8 Resolution](R8-pairwise-judge-papers.md) §2。

**本票剩下的唯一工作**：把一次性脚本固化成 `packages/eval/eval-cli/dev/judge-readout-audit.mjs`，使任何读出变更后能一条命令复算这四个数。**不必重跑任何 LLM。**

## 探针 b —— 准则顺序扰动

**做什么**：取已落盘的 `generated_sql`（**不重跑 agent**），用 K 个准则顺序排列重跑判官，其余 prompt 逐字不变。

- **K 的依据**：`2602.02219` 测出 balanced 与 random 排列统计上无差别，且「roughly two-thirds of the K=1 → 10 improvement is reached by K=3 and about 85% by K=5」（L386-388）⇒ **K=5，随机排列即可，不必构造 balanced cyclic**。
- **报什么**：① 逐维边际通过率跨排列的漂移；② `overall_semantics` 在首位 vs 末位的边际差；③ 跨排列的 Agr / Cohen's κ / sample-level EM（`2608.14684` 的 Reordering 操作，L152）；④ **跨阈翻转率** —— 有多少 case 因换顺序而跨过 0.6（论文不研究阈值化聚合，这个量只能自己测）。
- **判据**：点估计 + CI，**不是单一阈值**。

## 探针 c —— isolation vs joint

**做什么**：五维各自单独调用（每次 prompt 只含一维定义）vs 现行五维单调用，同一批 SQL。

- **报什么**：rubric-level Agr、Cohen's κ、sample-level EM（`2608.14684` Table 1 的 Expansion 操作 + §Appendix A 的度量定义）。
- **对照基准**：该文 HealthBench（二值格式，与本仓同类）Consistency-at-K 的 **K=4 列**，未训练基线 Agr `.749–.890` / EM `.309–.635`（Table 9，L850-856）。本仓 5 维最接近 K=4。
- **它同时是 d 的前置**：RADAR Stage 2 本就是逐准则单调用，所以 c 的 isolation 侧**就是** d 所需的判官形态。
- **必须一起记的限制**：`2608.14684` 自陈「isolation is not infallible. In some cases, co-evaluating related rubrics may surface useful context... Our framework does not distinguish beneficial context from harmful interference.」（L572-583）⇒ **c 只测不稳定性，不测谁对。判方向须等 T1 的执行真值。**

## 探针 d —— 真 RADAR（条件）

算法与公式见 [`../research/pairwise-judge-papers.md`](../research/pairwise-judge-papers.md) §3.1（`SelfEffect` / `GenCoupling` / `Leakage` / `SymCoupling` / `Asymmetry`，Eq.1-6 逐条带行号）。三处必须自己承担的偏离：

1. **量表**：`τ = 0.40` 原文定义为「0-4 上 1.6 分的差距」；二值量表上 `SelfEffect` 只能取少数几个值，门的语义须重定义。
2. **自配对**：论文排除 `generator = verifier` 以避开 self-preference（L254-255）；本仓只有一个可用模型 ⇒ 自配对不可避免，须在结论里标注。
3. **阈值**：论文**不给**冗余阈值（L335、L405）。任何 `Sym > x ⇒ 冗余` 是我们自定的政策，产物里必须标明是自定。

## 验收

- a：脚本入仓 + 四个数可复算。
- b、c：数字入 [`../research/experiment-audit-log.md`](../research/experiment-audit-log.md)，按 CLAUDE.md「Eval 实验记录规范」模板；**与上一次基线 run 对比这一条不适用**（judge 侧探针不是 pass_rate run），改为与本票 a 的四个数对比。
- d：仅在 G8 决议后开工；未决议前不跑。

## 不在本票范围

- 决定读出改成什么形状、量表换不换（[G8](G8-judge-readout-scale.md)）。
- 逐维 TPR/FPR 对**执行真值**的校准（R14，且其前置已改：须在 T11 之后、在重建的 EXECUTION 语料上做 —— 见 [R8 Resolution](R8-pairwise-judge-papers.md) §6）。
- 实现读出变更（T7）。
