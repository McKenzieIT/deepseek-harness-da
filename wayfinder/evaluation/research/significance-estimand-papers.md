# R4 — Estimand、cluster bootstrap 与重复可靠性：一手认读

日期：2026-10-05 · 票：[R4-significance-papers](../tickets/R4-significance-papers.md) · 分支：`research/R4-significance-papers`
产出去向：**G4-significance-contract**、`packages/eval/eval-cli/src/compare.ts`、[R22 — Consistency at k](../tickets/R22-consistency-at-k.md)

**引证纪律**：本文严格区分 **来源事实**（标 `arXiv:id §x` + 【Cn】，Cn 指向 `.tmp/r4/citations.jsonl`，97 行逐条机械复核通过）与 **设计推论**（对本仓的建议，不冒充论文结论）。凡不能在本地文本定位的，写 **「待核 / 未能定位」**。所有估计量与区间都附论文自己的公式；本文中出现的任何算式若无【Cn】，即为作者自算，已标注。

> **本轮最重要的结论（先说）**：map 方向 4 的两个数字 **「n=168 MDE 5.4–10.1pp」与「需 n_d≥85」并排写在同一个「n=168」后面时互不相容**。按条件化精确 McNemar 自算（§4.4），n_d≈10–37 时 N=168 的 MDE 恰为 5.0–9.9pp，而 **n_d=85 时 N=168 的 MDE 是 16.3pp**。
>
> **⚠ 归因修正（orchestrator 2026-10-06 回核后改写）**：本条的问题**在 map 第 68 行的压缩写法，不在原始推导**。原始推导确实存在（见 §9 第 5 条的更正），且**比本文初稿所假设的更正确**——它自己就把「功效变量是 n_d，不是 N」立为标题，自己就指出固定 n_d 下放大 N 只会让「pp 数字好看 6 倍，真实判别力一点没变」，并且**明确拒绝**用筛 case 的办法抬高 n_d（称其为「作弊 eval」）。它的 n_d≥85 是**经由 N≈360、在实测不一致率 r=23.8% 下自然达到**的，不是在 N=168 上要求 n_d=85。本文**不再声称原推导有方向性概念错误**；成立的结论收窄为一条**文档缺陷**：map 第 68 行把「扩充后 regime 的 n_d 目标」与「n=168 regime 的 MDE 区间」并列在同一格里，读者无法分辨，必须拆开重写（§4.4 裁决 3）。
>
> 四篇论文推翻的是另一件事（§4.2）：本仓跑满 168 case 的普查式 run，其「95% CI」在未声明抽样模型前**没有定义**。

---

## 1. 身份核验与认读范围

身份由 orchestrator 权威确认，本文不重导。下表照抄并补「本轮读了什么 / 证据等级」。

| arXiv | ver / dates | Title（已核） | Authors | 本轮认读范围 | 证据等级 |
|---|---|---|---|---|---|
| `2601.20251` | v3，2026-01-28 → 2026-05-08 | *Efficient Evaluation of LLM Performance with Statistical Guarantees* | Skyler Wu, Yash Nair, **Emmanuel J. Candès** | **全文**：§1 问题设定、§2 相关工作、§3.1–3.4 方法与 Theorem 3.1/3.2、§6 Discussion & Limitations、Appendix B（有/无放回） | **A — 全文认读，公式逐字转写** |
| `2606.00093` | v2，2026-05-25 → 2026-07-31 | ⚠ **双标题**：arXiv API 元数据为 *Agreement **Metrics** for **LLM-as-Judge** Evaluation: What to Report and Why*；`arxiv.org/html/2606.00093` 渲染 `\title` 为 *Agreement **Measurement** for **Rubric-based LLM Judges**: What to Report and Why*。**两者皆真**，同作者同摘要，无 v3，副标题 `: What to Report and Why` 两者共有。**引用时必须同时给出两个标题并标注分歧。** | Delip Rao, Chris Callison-Burch | **全文**：§3 协议/estimand、§4.1–4.4 恒等式与抽样方差、§5.1–5.5 弃权处理与界、§6/6.1 聚合与判官合议、§7 清单 11 条、§8 结论与 Limitations | **A — 全文认读** |
| `2606.00920` | v1，2026-05-30 | *Accuracy, Stability, and Repeated-Run Reliability of Large Language Models on Deterministic Programming Tasks* | Yongxi Zhou, Lai Yun Choi, Jiaxi Wen, Wenbo Ye（无 venue） | **全文**：Abstract、§1–2、§3.1–3.5（含 Metrics Definition 与 Inference）、§4.1–4.6、Limitations | **A — 全文认读，三个估计量公式逐字转写** |
| `2601.03986` | v1，2026-01-07 | *Benchmark²: Systematic Evaluation of LLM Benchmarks* | Qi Qian, Chengsong Huang, Jingwen Xu, Changze Lv +12（16 作者，无 venue） | **主体 + 关键附录**：§2.2、§3.1–3.5（CBRC/DS/CAD/Stability/BQS 公式）、§4 评测协议、Appendix E（bootstrap CI）、Limitations | **B+ — 方法与关键附录认读；15×11 结果表未逐格复核** |
| `2605.30504` | v2 | *Auditing LLM Benchmarks with Item Response Theory*（Land & Bikel，EMNLP 2026） | — | **定向认读**：§3.2 item 过滤（constant-item filter），仅作 R5 交叉核对 | **C+ — 定向片段，非全文** |

**与 R8b/R8c 的分工**：`2606.00093` 与 R8b/R8c 共享。本文的角度**严格限于统计协议**（estimand、sampling unit、cluster unit、CI 构造、报告清单）。其 **item-level aggregation / decision rule / 池化口径 0.551→0.899** 的*聚合规则*分析属 R8b，本文只在 §6/§7 以「估计量被协议定义」的方式引用，不复述聚合规则的裁决。

**本轮未读**：`2601.20251` 的 Appendix A（Laplace 更新与 Theorem 3.1 证明细节）、`2601.03986` 的 §5 全部结果表、`2605.30504` 全文。

---

## 2. estimand 的定义空间：「pass rate」不是一个数

### 2.1 文献给的最清晰一刀：pass@k 与 pass^k 问的是两个问题

`2606.00920` §2 把本仓一直在手搓的区分写成了形式化陈述：

> 「Perfect Stability Rate (PSR) is mathematically」【C63】/「equivalent to pass@k at k = R (the number」【C64】/「of repeated runs) with an all-successes thresh-」【C65】/「old; the distinction is interpretive. Pass@k」【C66】
>
> 「a capability measure—while PSR estimates」【C67】/「P (all k draws succeed)—a deployment reliability」【C68】

**来源事实**：PSR ≡「k 次全成功」，pass@k ≡「k 次至少一次成功」；前者是 **deployment reliability measure**，后者是 **capability measure**；两者数学上同属 pass@k 家族但阈值相反，**差别是解释性的，不是口径笔误**。

**设计推论**：R10 关于「混用 `pass@n` 与 strict `pass^k` 是错误」的裁决，现在有了可直接引用的一手出处，并且**升级**了——不只是「别混用」，而是「**两者必须同时报告，因为它们回答不同的问题**」。本仓的 `passKVerdict`（`packages/eval/eval-runner/src/runner.ts:648`，`attempts.every(...)`）实现的正是 PSR；本仓**从未计算过** pass@k 与 per-attempt rate。

### 2.2 六个可区分的 estimand

`2606.00920` §3.5 Metrics Definition 的三个公式（逐字转写，非记忆）：

- **RLPR**：「RLPR(m, c) =」【C69】，定义行为「RLPR measures the probability that a random in-」【C70】vocation succeeds。公式体（`.raw.txt` 同页）为 `RLPR(m,c) = (1/(NR)) Σ_{i=1..N} Σ_{r=1..R} Y_{i,r}^{(m,c)}`。
- **PSR**：「PSR(m, c) =」【C71】，`PSR(m,c) = (1/N) Σ_{i=1..N} 1[ Σ_{r=1..R} Y_{i,r}^{(m,c)} = R ]`；「PSR quantifies the fraction of tasks for which the」【C72】 system is reliably correct without retries。
- **AV**：`AV(m,c) = (1/N) Σ_{i=1..N} (R/(R−1)) p̂_i(1−p̂_i)`，其中「R−1 p̂i (1 − p̂i ) with p̂i =」【C73】 `(1/R) Σ_r Y_{i,r}`；「captures average instability across tasks.」【C74】
- 其中 `Y_{i,r} ∈ {0,1}` 为第 i 题第 r 次 run 是否通过全部测试。

| # | estimand | 单位（分母） | 回答什么 | 隐藏什么 | 论文支撑 |
|---|---|---|---|---|---|
| E1 | **per-attempt success**（RLPR） | attempt（N·R） | 随机一次调用成功概率 | 成功是集中在少数 case 还是均摊 | 【C69】【C70】 |
| E2 | **per-case strict success**（PSR = 本仓 `pass^k`） | case（N） | 免重试可靠性 | 「几乎对了」的 case 与「全错」的 case 不可分 | 【C71】【C72】【C63】–【C68】 |
| E3 | **per-case any success**（pass@k） | case（N） | 带重试的能力上限 | 不稳定性的代价 | 【C66】【C67】；无偏估计器见 `2107.03374`（R10 已核，本文未重读） |
| E4 | **per-case instability**（AV） | case（N），逐 case 方差再平均 | 剩余工作量落在随机区的比例 | 不稳定的方向（偏对还是偏错） | 【C73】【C74】 |
| E5 | **judge–reference criterion agreement** | criterion decision（嵌套于 attempt、再嵌套于 case） | 判官是否能替代参考判定 | 逐准则结构；池化会把它掩掉 | 【C107】【C108】；协议四元组 `P = (s,U,h,a)`【C59】 |
| E6 | **rerun stability**（整轮重跑之间） | run（更高一层 cluster） | 同协议重跑是否复现同一结论 | run 内的 attempt 变异 | 【C60】–【C62】；`2606.00093` 的「judge stochasticity at nonzero temperature」抽样模型【C33】 |

**E2 与 E1 之间的差值不是噪声，是结构量。** `2606.00920` Abstract：「Run-level pass rate overstates retry-free cov-」【C60】erage，「retry-free coverage—a gap that reaches 17.8」【C61】「percentage points and reverses model rankings」【C62】。并给出机制：「itself structurally expected: Bernoulli variance is」【C82】 maximized at p ≈ 0.5——**中档模型的 E1−E2 缺口按构造最大**。

**E5 的分母在本仓是三层而不是一层**（本地实测，`eval-results/` 84 个 run 文件）：1495 次 judge 调用 × 5 个二值准则 = **7475 条 criterion decision**，嵌套在 1495 个 attempt 内，再嵌套在 1215 个 (run, case) 内。五个准则的 MET 率分别为 `table_selection` 0.942、`field_selection` 0.927、`filter_conditions` 0.894、`aggregation_logic` 0.946、`overall_semantics` 0.835；**无一准则退化**（五个都同时出现 0 与 1），所以 `2606.00093` 的 Fact 1 恒等类在本仓**成立**，清单第 5 项（退化准则标 NA）**未被违反**。但 MET 率全在 0.835–0.946 的高位，正落在论文的 κ 衰减警告里：「MET rates: on rubric criteria that nearly all submissions meet」【C106】 or fail, κ is attenuated by construction；「teria only when their MET rates are comparable, and report」【C109】 the human and judge rates with every κ。

**设计推论（给 G4）**：`compare.ts` 当前只输出 E2 的一个点估计（`summary.pass_rate`，`runner.ts:705` 的 `correct / attributable`）。E1、E3、E4 **在落盘数据里算得出来但从未算过**；E5 的分维判决在 1495 条里已持久化，但 `compare.ts` 的 `CaseVerdict` 接口（`compare.ts:19-26`）只声明 `verdict` 与 `pass_k_results[].sql_judge.score`，**连 attempt 级的 `execution_outcome` 都不读**。

---

## 3. sampling unit 与 cluster unit

### 3.1 文献给的指引（逐字）

`2606.00093` §4.3 是本票最直接的一手指引：

> 「of analysis is rarely an isolated criterion decision: criteria」【C20】
> 「are clustered within items (multiple criteria per submission),」【C21】
> 「within prompts or rubrics (multiple items sharing a rubric),」【C22】
> 「same model). A flat decision-level resample understates un-」【C23】
> 「certainty when within-cluster correlations are positive, as is」【C24】 the norm when a single judge mistake propagates across the criteria of one item.
> 「cal cluster bootstrap (resample items, then optionally criteria」【C25】
> 「within items) supports judge comparisons, with undefined」【C26】 replicates reported

§4.3 Takeaway：「noise. Resample whole items rather than individual verdicts,」【C27】 and avoid variance formulas built for continuous values.

清单第 10 项的完整理据（§7）把层级对应关系写死：

> 「the effective N differs across levels, and a cluster bootstrap」【C28】
> 「must resample the unit that carries the dependence, typi-」【C29】cally whole items.
> 「a criterion-level cluster bootstrap matches macro-averaging,」【C30】 an item-level cluster bootstrap matches item-level aggregation,
> 「tion, and a flat decision-level bootstrap matches only micro-」【C31】averaging, and then only under the usually false assumption that decisions are independent.

清单条目本身：「10. The aggregation level and resampling unit」【C54】 — Micro, macro, and item-level scores target different quantities。

### 3.2 本仓的嵌套结构与正确选择

本仓真实嵌套（读代码与落盘物得到，非假设）：

```
criterion decision (5/judge call，SqlJudgeVerdict.dimensions: Record<string,0|1>，eval-runner/src/types.ts:47)
  ⊂ attempt            (k 个/case，AttemptResult，eval-runner/src/types.ts:78)
      ⊂ case           (168 个 k11-v2 / 39 个 rbi)
          ⊂ case-set   (run 的分母)
              ⊂ run    (比较的两臂)
```

**crossed 因子的修正**：票面假设「judge 与 position 是 crossed factors」。实测**在 eval 判分路径上两者都不存在**——`sqlJudge` 是单判官（`SqlJudgeVerdict` 无 judge id 字段，1495 条判决无判官维度），`grep -rln "position_swap|positionSwap|swap" packages/eval/ --include=*.ts` 只命中两个测试文件（`eval-cli/tests/exp2-prompts-en.spec.ts`、`eval-cli/tests/harness-responder.spec.ts`），**无生产调用点**。position swap 与多判官是 R8/R20 pairwise 路线的因子，不是 eval-cli 的。**G4 的 cluster 模型因此是三层嵌套，不是嵌套+交叉**，这让协议显著变简单，也让「position 偏置」不能被当作本仓 eval 数字的误差来源。

**正确选择（设计推论）**：

- **run 级 estimand（E1–E4）的 cluster unit = case。** 理由是 attempt 在 case 内相关（同一 case 的失败机制重复出现），而 case 之间可当近独立。重采样 case 时**整体携带该 case 的全部 attempt 与全部 criterion decision**。
- **判官 estimand（E5）的 cluster unit 也是 case，不是 attempt。** 因为同一 case 的多个 attempt 共享同一道题的歧义。
- **sampling unit（被重采样的东西）与 aggregation level 必须同层**，按【C30】【C31】的逐层对应：micro 池化 ↔ 扁平 decision bootstrap（本仓不适用）；macro（逐准则平均）↔ criterion 级 cluster bootstrap；case 级读数 ↔ case 级 cluster bootstrap。

### 3.3 本仓自有证据：扁平重采样在这里把 CI 压窄 1.8 倍

**这不是论文的结论，是作者在本仓 1495 条判决上自算的**（随机种子固定，B=3000，纯算术，零 LLM 调用）：

| 重采样单位 | SE（micro MET rate） | 95% 半宽 | design effect | ESS |
|---|---|---|---|---|
| 扁平 criterion decision（7475 条） | 0.00337 | **0.66pp** | 1.00× | 7475 |
| attempt 级 cluster（1495 个） | 0.00593 | 1.16pp | 3.04× | 2457 |
| **case 级 cluster（1215 个）** | 0.00610 | **1.19pp** | **3.27×** | **2286** |

micro MET rate = 0.9088。隐含 ICC ≈ 0.51（按 `deff = 1+(m−1)·ICC`，m = 5 准则/attempt）。1495 次判官调用里 **1247 次（83.4%）输出完全相同的全 1 模式，18 种不同模式**——这就是【C24】说的「within-cluster correlations are positive … a single judge mistake propagates across the criteria of one item」在本仓的具体形状。

**后果**：任何在 7475 条判决上做的二项/Wald/扁平 bootstrap 区间，在本仓都把宽度低报约 **1.8 倍**，把有效样本量高报约 **3.3 倍**。

### 3.4 可实现的 cluster bootstrap 过程（给 T4b）

```
输入: 可归因 case 列表 C = [c_1 .. c_N]（§6 定义），每个 c_i 携带其 attempt 向量与 criterion 判决
输出: 点估计 + 95% 百分位区间 + undefined replicate 计数

for b in 1..B:
    draw idx[1..N] ~ Uniform{1..N} with replacement        # 整 case 重采样，【C27】【C29】
    C_b = [ C[idx[1]], ..., C[idx[N]] ]                    # 允许重复，分母重算
    θ_b = estimand(C_b)                                    # 分子分母都在 C_b 上重算
    if θ_b undefined (分母为 0 / 指标无定义): undef += 1；不计入分布
CI_95 = [ percentile(θ_·, 2.5), percentile(θ_·, 97.5) ]    # 百分位区间，【C102】【C103】
报告: θ̂(原始 C 上), CI_95, B, undef
```

**条件与失效模式（逐条有出处）**：

1. **必须有放回。** `2601.20251` Appendix B 对「零掉已抽过的问题再归一化」的无放回改法的裁决：「ad-hoc without-replacement variants can fail to yield valid coverage.」【C8】，并明确「we recommend sampling with replacement when using FAQ/PAI to preserve」【C9】 theoretically-guaranteed uncertainty quantification。*注*：该段针对的是 PAI 的问题选择策略，不是 case bootstrap；**可迁移的教训是「改了抽样方案就不能沿用原方差公式」**，这一点是设计推论，不是论文对 bootstrap 的直接陈述。
2. **必须报告 undefined replicate 数。** 【C26】「with undefined replicates reported」。本仓最可能的 undefined 来源：某个 replicate 里某类别（如 Voice DELIVERY）的可归因分母为 0。
3. **重采样单位必须与聚合层级同层**，否则估的是另一个量。【C28】【C30】【C31】
4. **不要用连续量的方差公式。** 【C27】「avoid variance formulas built for continuous values」。论文给了数值对照：cell 概率 `(0.4,0.1,0.1,0.4)` 下 delta 方法得 `Var(κ̂)=Var(ϕ̂)=0.640/N`，而「treating these binary values as continuous produces the incorrect 0.41/N」（§4.3，**本条未单独入 manifest，待核**）。
5. **B 的量级**：`2606.00093` §4.4 在 2238 条决策上用「attached: resampling the 2,238 decisions with replacement」【C102】「(104 replicates, none undefined) gives percentile intervals of」【C103】——⚠ 文本中的 `104` 是 `10^4` 的上标丢失，**按 10,000 读**；`2601.03986` Appendix E 用「rics using bootstrap sampling with 1000 iterations.」【C104】，ranking stability 用「iterations (we use K = 100). In each iteration」【C105】。**设计推论**：本仓 B = 10,000，因为重算是纯算术、零模型调用，成本可忽略。
6. **两臂比较要配对 cluster bootstrap**（设计推论，论文未给此变体）：每个 replicate **只抽一次 case 索引**，在**同一个** replicate case 列表上重算 A 与 B，取差值 `Δ_b = θ_b(B) − θ_b(A)`，由 `Δ_·` 读出差值的百分位区间。这保留配对结构；若两臂各自独立重采样，会把配对带来的方差削减丢掉，区间偏宽。

---

## 4. CI 与显著性

### 4.1 `2601.20251` 保证了什么，在什么假设下

**estimand**：「trajectories—viewed as a fixed finite population. For a new model, let zj ∈ {0, 1} indicate whether it」【C2】 succeeds on unit j；「We wish to estimate the model's accuracy over the entire finite evaluation bank:」【C3】 即 `θ := (1/N_q) Σ_{j=1..N_q} z_j ∈ [0,1]`（§1 公式，逐字转写）。

**随机性来源**：「We cast benchmarking as finite-population inference」【C1】；coverage 的定义是「sampling randomness), the reported 95% CI contains the true finite-bank accuracy θ at least 95% of」【C4】 the time——**覆盖率是对「抽哪些题」的随机性取的，不是对模型随机性取的**。

**不假设什么**：「We also make no i.i.d. assumptions on benchmark questions: labels zj are fixed-but-unknown,」【C5】「since curated suites often include adversarial/edge cases and need not represent a superpopulation」【C6】 of user queries。并明确与 i.i.d. 路线划界：对 Angelopoulos et al. 2025，「posits an i.i.d. model for the benchmark data and targets the expected accuracy as judged by a strong」【C13】 autorater，而本文估的是 finite-bank accuracy。

**CI 形式**：Theorem 3.1 给出 `θ̂_{n_b}` 无偏并经 martingale CLT 得渐近正态，于是「By Theorem 3.1, it follows that an asymptotic (1 − α)-level CI for θ is」【C7】 `[θ̂_{n_b} ± z_{1−α/2}(σ̂_{n_b}/√n_b)]`（§3.2 逐字转写；`σ̂²_{n_b}` 的闭式在 Appendix A.2.2，本轮未读）。**适用条件**：Assumptions A.1–A.3（方差稳定/控制 + Lindeberg）、`n_b ↑ ∞`、`n_b ≤ N_q`、有放回抽样（脚注 2）、`p̂^{(t−1)}` 与 `q_t(·)` 对 `F_{t−1}` 可测。

**最优抽样策略**（对 R22 的主动采样有用）：Theorem 3.2 在 oracle 超总体设定下给出方差最小化策略「independent and uniquely defined by qt (j) ∝ pj (1 − pj ).」【C12】——**预算应砸在 p≈0.5 的 case 上**。这与 map 方向 6 的「预算砸 near-boundary(p̂≈0.5)」是同一结论，现在有一手出处。

**适用范围与留白**：「benchmark bank with binary task-completion outcomes, including multi-turn or agentic benchmarks」【C10】 summarized by task success rates——**仅二值**；「Extending FAQ to non-binary feedback and batched querying」【C11】 would broaden applicability（即非二值反馈是 future work）。

### 4.2 决定性后果：本仓跑普查，`2601.20251` 的 CI 对本仓是零宽的

**来源事实的直接推论（算术，非论文陈述）**：本仓一次 run 跑**全部** 168 个 case，即 `n_b = N_q`。在 `2601.20251` 的 estimand 下，θ 被完全观测，不存在剩余的抽题随机性，其 CI 退化为一点。**FAQ/PAI 是省预算的工具，不是本仓需要的 CI 的来源。**

这不是我的孤立判断——`2606.00093` 的 Limitations 独立给出同一条界：

> 「treats the observed verdict counts as fixed: the identities hold」【C32】 exactly on any dataset on which they are computed, while the inferential statements (the variance equality of Sec. 4.3 and any bootstrap interval) **additionally require a sampling model**, which is natural when generalizing to a wider item population or accounting for judge stochasticity at nonzero 「temperature, and vacuous for a deterministic judge scored」【C33】 once on a fixed evaluation set.

**因此，G4 契约的第一条必须是：每个报告的 CI 必须声明它是对哪个抽样模型的。** 论文点名了两个合法来源，它们给出**不同的数**：

| CI 口径 | 抽样模型 | cluster unit | 被重采样的对象 | 回答什么 | 什么时候该用 |
|---|---|---|---|---|---|
| **CI-case** | 推广到更宽的 item 总体（【C33】"generalizing to a wider item population"） | case | case 索引 | 「B 在这*类*任务上是否强于 A」 | `compare.ts` 的两 run 比较 |
| **CI-rerun** | 模型/判官在非零温度下的随机性（【C33】"judge stochasticity at nonzero temperature"） | case（attempt 在 case 内相关） | 固定 168 case，重抽 attempt 向量 | 「同一结论重跑是否复现」 | R22、E6 |

**设计推论**：两者都该出，且**不能互相替代**。本仓 168 个 case 既不是随机样本也不自称代表某总体（`2601.20251` 【C6】正是说 curated suite 不必代表超总体），所以 **CI-case 只能作为「若把它当某总体的样本」的条件性陈述，必须在渲染时写明这个 caveat**。CI-rerun 才是本仓**无条件**有定义的那一个。

### 4.3 配对 McNemar 在本仓是否可用？**可用——但只能作用在 case 级折叠后的二值量上**

**两篇论文都用了 McNemar，且都用在「每个配对单位只有一个判决」的层级上**：

- `2606.00920` §3.5 Inference：「Inference. We report 95% Wilson score intervals」【C75】「for RLPR and PSR, and nonparametric bootstrap」【C76】 CIs for AV. Since both prompt templates are evaluated on the same problems, we compare PSR across 「prompt conditions using exact McNemar tests on」【C77】「the binary indicator of whether all R = 5 runs pass.」【C78】
- `2606.00093` §4.4：判官与 always-positive baseline 在同 2238 条配对决策上，「paired accuracy is tested with McNemar's exact test (McNe-」【C45】mar 1947) on the discordant counts (118, 108): p = 0.549。

**关键在于**：`2606.00920` 先把 R=5 次 attempt **折叠成每 case 一个「是否全过」的指示量**，然后才做 McNemar。clustering 不是被忽略，而是被**折叠消解**了。`2606.00093` 的用法同理——那里每个 item 只有一个配对决策。

**裁决（设计推论，但每一条都钉在上面的引文上）**：

| 对什么做 McNemar | 可否 | 依据 |
|---|---|---|
| **E2（per-case strict `pass^k`）的配对指示量** | ✅ **可以，且这是文献的现成做法** | 【C77】【C78】逐字就是这件事 |
| E3（per-case any-pass）的配对指示量 | ✅ 可以（同样是每 case 一个二值） | 同上结构 |
| **E1（per-attempt）的配对指示量** | ❌ **不可以** | attempt 在 case 内聚集；【C23】【C24】扁平 decision 级处理在簇内相关为正时低报不确定性；本仓实测 deff=3.27×（§3.3） |
| **E5（criterion 级 7475 条）的配对指示量** | ❌ **不可以** | 同上，5 条判决嵌在一个 attempt 里，ICC≈0.51 |
| E4（AV，连续量） | ❌ McNemar 不适用 | 【C76】该用 nonparametric bootstrap |

**McNemar 在本仓额外需要满足的三个条件**（设计推论）：

1. **两臂的配对 case 集必须在排除之后完全一致。** 若 A 臂某 case 被 `environment-blocked` 排除而 B 臂没有，这一对就断了。当前 `compare.ts` 对缺失 case 的处理是 `if (vB === undefined) continue`（`compare.ts:473`），即**静默丢弃**，既不计入也不报告——这会让 n_d 的分母不可知。
2. **必须同时报告 joint coverage γ**（见 §6），否则 McNemar 的 p 值是对一个未声明的子总体说的。
3. **n_d 必须落盘**，因为 McNemar 的全部信息都在 n_d 与其拆分里；只给 p 值不足以让人复核或算功效。

**`2606.00920` 自身的一个内部张力（本文的独立观察，不是论文的自述）**：它对 **RLPR** 也报 Wilson score 区间【C75】。RLPR 的分母是 N·R = 500 条 attempt，而 attempt 在 problem 内聚集；Wilson 把它们当独立 Bernoulli。按 `2606.00093` §4.3【C23】【C24】的批评，**这正是「flat decision-level resample」那一类，会低报 RLPR 的不确定性**。两篇论文在这一点上不一致。**设计推论：本仓不要抄 RLPR 的 Wilson 区间，RLPR 的区间也走 case 级 cluster bootstrap。** PSR 的 Wilson 区间没有这个问题（每 case 一个指示量）。

### 4.4 功效与 MDE：map 的两个数字互不相容

**检验形式**（与 §4.3 选定的检验匹配）：对 E2 做配对精确 McNemar，即对 `n_d = b + c` 个不一致 case 做 `p = 0.5` 的双侧精确二项检验（`b` = A 错 B 对，`c` = A 对 B 错）。准确率差值为 `Δ = (b − c)/N_attributable`。

**作者自算**（Python，精确二项，α=0.05 双侧，功效 0.80；脚本在 `.tmp/r4/`，纯算术）：

| n_d | 达到 80% 功效所需不一致拆分 p | 对应 \|b−c\| | **MDE（准确率）@ N=168** | MDE @ N=478 |
|---|---|---|---|---|
| 10 | ≥ 0.917 | 8.3 | **5.0pp** | 1.7pp |
| 20 | ≥ 0.799 | 12.0 | **7.1pp** | 2.5pp |
| 37 | ≥ 0.724 | 16.6 | **9.9pp** | 3.5pp |
| 60 | ≥ 0.692 | 23.0 | 13.7pp | 4.8pp |
| **85** | **≥ 0.661** | **27.4** | **16.3pp** | **5.7pp** |
| 120 | ≥ 0.633 | 31.9 | 19.0pp | 6.7pp |
| 168 | ≥ 0.612 | 37.6 | 22.4pp | 7.9pp |

**裁决**：

1. **「n=168 MDE 5.4–10.1pp」对应 n_d ≈ 10–37**（表中 5.0–9.9pp）。这个区间本身是自洽的。
2. **「需 n_d≥85」在 N=168 下给出的 MDE 是 16.3pp，不是 5.4–10.1pp。** 两个数字不能同时描述 n=168。
3. **n_d≥85 与 5.4pp 同时成立需要 N ≈ 478**（27.4/0.054 = 507；27.4/0.101 = 271）。所以来历是：**MDE 区间属于 n=168 的当下 regime，而 n_d≥85 是一个「扩充后」case 集（N≈360–510）的目标**；map 第 68 行把两个 regime 的数字并排写在「n=168」后面，造成误读。**此推测已由 orchestrator 核对一手来源证实**：`GA-EVAL-EXPAND-case-set-power.md:50-52` 写的正是「r=23.8% 是真实分布的固有属性……真实地扩到 N≈360 即自然得到 n_d≈85」。**⇒ 本条的交付是一个文档修复（拆开两个 regime 重写 map:68），不是一个统计修复。**
4. **「n_d 不是固定 N 下的旋钮」这一点是对的，但不是原推导的错误——原推导已经这么说了。** 在固定 N 下 n_d 是两臂不一致度的**后果**，固定 N 时 n_d 越大、可检测的准确率差 MDE 越差（表中单调变坏）；n_d 大买到的是**检验自身的分辨力**，不是更小的准确率 MDE。**但 `GA-EVAL-EXPAND-case-set-power.md` 自己的 §「关键认识：功效变量是 n_d（不一致对数），不是 N」(:26)、`:41-46` 的「n_d 仍=40 时」对照表、以及 `:48` 的「不筛 case……按『丢掉稳过/稳挂的』来最大化 n_d 是作弊 eval」三处，已经分别陈述了同一件事。** 本文初稿曾把这条当作原推导的方向性错误，**该指控撤回**（orchestrator 2026-10-06 回核）。它仍然是一条**对 map 压缩写法的有效警告**，以及 sample planner 必须按 §4.4 公式同时携带 `n_d` 与 `N_att` 的理由。
5. **分母修正**：MDE 的分母必须是 `N_attributable`（§6），不是 168。当前 168 里有 25 个 DELIVERY case 不参与 EXECUTION estimand，排除后分母更小、MDE 更差。

**该写进 sample planner 的公式**（设计推论）：

```
给定 两臂的预期不一致率 π_d 与可归因 case 数 N_att：
    n_d ≈ N_att · π_d
    找最小 p* 使 ExactBinomPower(n_d, p*, α=0.05 双侧) ≥ 0.80
    MDE = n_d · (2p* − 1) / N_att
反向（给定目标 MDE）：
    枚举 N_att，取 π_d 的先验（本仓已有的 attempt 向量可估），解出满足 MDE 的最小 N_att
```

**旁证**：`2606.00920` 自己给了同型的功效陈述：「prompt effects. With N = 100, a 4-point shift has」【C80】「less than 20% power, meaning meaningful effects」【C81】 cannot be ruled out at the current sample size。即 **N=100 的 case 集检测 4pp 的 PSR 变化功效 <20%**。本仓 N=168（可归因后更少）在同量级，**对个位数 pp 的 `pass^k` 变化基本没有功效**。这与上表一致。

**另一条可引用的阈值**：`2601.03986` §3.2 的 DS 把「实际显著差异」定义为「practically significant differences (we set ϵ = 0.02」【C91】「as the minimum meaningful difference).」【C92】——即 **2pp 作为最小有意义差**。⚠ **但该文把这一项称作「statistical significance of pairwise differences:」【C90】，实现却是一个无方差的固定阈值 `1[|s_ij − s_ik| > ϵ]`，不是任何统计检验。引用时必须说清这是 effect-size 阈值，不是显著性。**

---

## 5. 重复可靠性 / retry-free stability

### 5.1 `2606.00920` 测了什么

| 项 | 内容 | 出处 |
|---|---|---|
| 任务 | 100 道最近发布的 LeetCode 式题（20 Easy / 50 Medium / 30 Hard），Python，平台 acceptance criteria，确定性 test harness | §3.1（本文认读，未单独入 manifest） |
| 模型 | 16 个模型 / 5 个 provider family，2 个 prompt 模板，R=5 次重复 → 16,000 个评测实例 | Abstract |
| 采样 | T = 0.3，top-p = 0.9，max 4096 token（reasoning 模型更大）；**刻意非零温** | §3.4 |
| 估计量 | RLPR【C69】【C70】、PSR【C71】【C72】、AV【C73】【C74】 | §3.5 |
| 推断 | RLPR/PSR 用 95% Wilson【C75】；AV 用非参 bootstrap【C76】；PSR 跨 prompt 用精确 McNemar on「all R=5 runs pass」指示量【C77】【C78】 | §3.5 |

**效应量**：

- RLPR − PSR 缺口最大 **17.8pp**，并「percentage points and reverses model rankings」【C62】。
- 具体排名反转：GPT-4.1 在 RLPR 上领先 GPT-4.1-mini，「but trails on PSR (47.5% vs. 50.0%)—a reversal」【C79】（缺口 12.1pp vs 8.4pp）。
- 缺口非均匀、峰值在中档：机制为「itself structurally expected: Bernoulli variance is」【C82】 maximized at p ≈ 0.5。
- prompt 效应 model-dependent，16 个模型 11 favor DETAILED / 5 favor MINIMAL，精确 McNemar **无一达到 p<0.05**；功效不足（【C80】【C81】）。

### 5.2 迁移到本仓：能迁多少，不能迁什么

**能迁（设计推论，有引文支撑）**：

1. **本仓的 `pass^k` 就是 PSR。** `passKVerdict` 的 `attempts.every(...)`（`runner.ts:663-667`）与【C71】的 `1[Σ_r Y_{i,r} = R]` 同形。所以本仓已经在测 **deployment reliability measure**【C68】，只是从未这么命名、也从未同时给出 capability measure。
2. **该文把 text-to-SQL 明确列入同一类任务**：「pattern, alongside tasks such as text-to-SQL (Gao」【C83】 et al., 2024), structured semantic parsing, tool-call argument generation——即「文本条件输入 + 确定性 verifier 消费输出」这一族。本仓 EXECUTION case 正是此族。
3. **RLPR−PSR 缺口在中档最大**【C82】这条是**构造性**的（Bernoulli 方差在 p≈0.5 最大），与任务域无关，**可无损迁移**。本仓若 `pass^k` 落在中段，缺口必然最大。
4. **功效量级可迁移**：N=100 对 4pp 功效 <20%【C80】【C81】；本仓 N=168（可归因后更少）同量级。

**不能迁 / 需要折扣（设计推论）**：

1. **它是单轮，本仓是多轮 agent。** 原文自述「This perspective is deliberately narrower than end-to-end agent evaluation: it isolates repeated-run behavior for single-turn coding, while broader orchestration, tool use, and runtime dependencies require separate analysis」（§2，本文认读，**未单独入 manifest，待核行号**）；Limitations 第二条又写明「the study does not characterize the effects of broader prompt engineering, tool use, self-repair, retrieval, test-time selection, or multi-turn interaction」。
2. **它的 verifier 是确定性的且环境自带**（self-contained，no network access）。本仓的「verifier」要穿过数仓：`pending` 非终态、查询延迟、schema retrieval、snapshot anchor——**本仓的方差来源严格多于它**。
3. **因此 `2606.00920` 的 AV 对本仓是下界，不是估计。** 它测的是「模型采样随机性」这一项；本仓还叠加环境随机性与（judge-only 模式下的）判官随机性。17.8pp 不能当作本仓缺口的预期值，只能当作「同族任务上已观测到的量级」。
4. **它的 Wilson-on-RLPR 不要抄**（§4.3 末）。

### 5.3 本仓当前的 rerun 语料：**结构上还不存在**

本地清点 `eval-results/` 全部 84 个 run 文件（`python3` 直读 JSON，非抽样）：

- **只有 7 个 run 的 case 带 ≥2 个 attempt**：`a4fbd262…`(30 case, k=3)、`eventdef-judgeonly`/`-v2`/`eventdef-realexec`/`rebaseline-judge-only-rbi-…`（各 39 case, k=3）、`f4bc4a06…`(168 case, k=3)、`smoke-1057`(1 case)。其余 **77 个 run 全是 k=1**。
- **唯一的 168-case k=3 run（`f4bc4a06…`）是退化的**：168/168 个 case 的三次 attempt 全部 `execution_match: false` 且 `generated_sql: null`，summary 为 `correct: 0 / wrong: 168`。即**模型什么都没产出**，RLPR=PSR=AV=0，不含任何稳定性信息。该文件还**没有 `config` 块**，按 `checkRenderable`（`compare.ts:84-110`）会被**拒渲染**。
- 攻击面上唯一有信息的多 attempt 语料是 **39-case 的 rbi 集与 30-case 的那一个**，其 per-case 成功计数分布非退化（存在 0<S_i<k 的 case）。但这些 run 是 judge-only 或小样本，**其速率不得作为质量基线引用**（本仓已有裁决），本文因此只用它们的**结构事实**，不引用任何速率。
- `execution_outcome`（T1 的五值）**在 84 个落盘 run 里出现 0 次**：attempt 字段统计为 `attempt_k` 2983、`execution_match` 2982、`delivery_match` 2982、`sql_judge` 1819、`error` 5、`infra_error` 1。五值 outcome 在代码里存在（`packages/eval/eval/src/execution_grade.ts:53`：`['pass','fail','environment-blocked','case-defect','not-measured']`），但**历史物全部是旧的 boolean schema**。
- case 级 verdict 统计：`correct` 1328 / `wrong` 944 / `infra_failure` 1，**`declined` / `unjudged` / `case_defect` 各 0**。

**设计推论**：R22 **不能靠回溯现有 artifact 完成**，必须自己产语料。另外 `declined` 是一条**死分支**——`RunnerVerdict` 声明了它（`eval-runner/src/types.ts:37`），`computeSummary` 把它算进 attributable 分母（`runner.ts:689`、`runner.ts:699`），`compare.ts` 也算（`compare.ts:363`、`compare.ts:390`），但 `passKVerdict` **永不返回 `declined`**（§runner.ts:648-669 的五个返回值里没有它）；唯一生产点在另一个库路径 `packages/eval/eval/src/runner.ts:37`（`verdict === 'partial' → 'declined'`），不在 CLI 判分栈上。**分母里有一个永远为 0 的项，这本身不是错，但 G4 必须决定它该在还是不该在。**

---

## 6. abstention / invalid / not-measured 的统计处理

### 6.1 文献：三种处理规则，三个不同的 estimand

`2606.00093` §3.2 把四个选择打包成协议：「four choices into a measurement protocol P = (s, U, h, a)」【C59】——`s` 判断尺度、`U` 被选population、`h` 异常处理规则、`a` 聚合规则。§5.1 给出 `h` 的三种取法：

| 规则 | 做什么 | 目标 estimand | 出处 |
|---|---|---|---|
| **Exclusion** | 任一方弃权即丢弃该对 | 「For statistic T , exclusion targets」【C37】 `T_{P(y*,ŷ*) \| m=0 ∧ m̂=0}`，即**条件于双方都未弃权**的一致度 | 【C36】【C37】 |
| **Negative recoding** | 把 CA 映射成 UNMET | 「MET versus non-MET」的 one-vs-rest；**会让弃权的判官与硬答的判官无法区分** | §5.1（本文认读） |
| **Three-class retention** | 保留 CA 为第三类 | 3×3 一致度，须显式给出不一致代价矩阵 | §5.1、清单第 9 项 |

**最关键的一条**（直接决定本仓三个排除类的分流）：

> 「rion is genuinely inapplicable, with no latent binary verdict」【C38】 behind it, a three-class representation or an explicitly restricted population is the better match.

即：**潜在二值判决是否存在，决定该用 exclusion 还是「显式受限 population」。**

**另一条直接对口 invalid**：「side, and an invalid generation is not an UNMET verdict,」【C48】 so any mapping is a modeling choice that belongs in the report。清单第 6 项：「6. The handling rule for CA, ties, and invalid outputs」【C55】。

### 6.2 排除的代价：Manski 界

`2606.00093` §5.2，逐字转写：

> joint coverage：「quantity for exclusion is joint coverage, γ = Pr[m = 0∧m̂ =」【C53】 0]
> 「Afull = γAcov + (1 − γ)Auncov ,」【C39】，且 `Afull ∈ [γAcov, γAcov + 1 − γ]`
> 「The range is sharp: the lower endpoint treats every uncov-」【C40】ered pair as a disagreement, the upper endpoint treats every 「uncovered pair as an agreement, and the width is exactly the」【C41】 uncovered fraction 1 − γ。

这是 bounded outcome 的 worst-case identification bound（Manski 1989, 2003）特化到 0/1 指示量。Takeaway：「bootstrap is still needed for it. Takeaway: Never report cov-」【C43】ered accuracy without joint coverage: at coverage γ, full-set 「accuracy is known only to an interval of width 1 − γ, what-」【C44】ever the covered accuracy is。

**两种不确定性不能混**：「have resolved. Sampling uncertainty is separate; a cluster」【C42】 bootstrap is still needed for it；并且「the conditional identification range, or reporting the iden-」【C52】tification range as a confidence interval, conflates the two sources of uncertainty（§5.3）。清单第 8 项：「8. Under exclusion, covered performance with joint」【C56】 coverage — The interval of Eq. (10) is identification, not sampling, uncertainty。

### 6.3 本仓五值 outcome 的分流（设计推论，逐条钉在上面的引文上）

T1 的五值：`pass` / `fail` / `environment-blocked` / `case-defect` / `not-measured`（`execution_grade.ts:53`）。后三者离开分母（`computeSummary` 的 `attributable = correct + wrong + declined`，`runner.ts:699`）。按【C38】的「潜在判决是否存在」判据：

| outcome | 潜在二值判决存在吗 | 正确处理 | 后果 |
|---|---|---|---|
| `pass` / `fail` | 是，且已观测 | 进分子/分母 | — |
| `environment-blocked` | **是**（模型产出了东西，是环境拒绝测量） | **Exclusion**，且**适用 Manski 界** | γ 下降，full-set 区间变宽 1−γ |
| `not-measured` | **是**（从未测量，但判决存在） | **Exclusion**，且**适用 Manski 界** | 同上；**judge-only 模式下 γ=0** → 见下 |
| `case-defect` | **否**（case 本身坏了，没有可定义的正确答案） | **显式受限 population**（【C38】"an explicitly restricted population"）：case 离开 **population**，不只是离开样本 | **N 变小，但不加宽 identification 界** |

**这个区分当前在仓里被压扁了。** `compare.ts:364` 把三者并成一个桶：`if (c.verdict === 'unjudged' || c.verdict === 'infra_failure' || c.verdict === 'case_defect') stats.excluded++`，渲染为 `(… ; N excl)`。于是**「界要加宽」与「N 要缩小」这两种完全不同的统计后果，在输出里不可区分**。

**一条很强的形式化推论**：对 EXECUTION estimand，**judge-only run 的 γ = 0**（没有 executor ⇒ 每个 attempt 的 `execution_outcome` 都是 `not-measured`）。代入【C39】得 `Afull ∈ [0·Acov, 0·Acov + 1 − 0] = [0, 1]`——**界是空的**。这就是「judge-only 数字不能与 real-exec 数字同尺比较」的**形式化证明**，而不只是经验告示。`compare.ts` 既有的 `describeExecutionMode` 拒渲染（`compare.ts:124-137`、`checkProtocolMatch`）因此有了一个一手统计依据，不只是工程直觉。

### 6.4 由此得到的报告规则（可直接实现）

**每个 estimand 必须同时出三个数，外加一个独立的区间**：

1. `estimate_covered` —— 在可归因集上的点估计（分母 = `N_att`）。
2. `gamma` = `N_att / N_in_population`，其中 `N_in_population = N_total − n_case_defect`（case-defect 退出 population，不进 γ 的分母）。
3. `identification_interval` = `[γ·A_cov, γ·A_cov + 1 − γ]` 【C39】【C40】【C41】——**标注为 identification，不是 CI**【C52】【C56】。
4. `ci_95` —— 对 (1) 的 case 级 cluster bootstrap 百分位区间（§3.4），**与 (3) 分列两栏，永不合并**【C42】。

并按清单第 7 项分开报率：「7. Abstention, tie, invalid, and coverage rates」——本仓对应 `rate_environment_blocked`、`rate_not_measured`、`rate_case_defect` 三者**分别**给出，不得合并。

---

## 7. 报告协议（核心交付：给 G4 与 `compare.ts`）

### 7.1 `2606.00093` 的报告清单（逐字，11 条）

Figure 4 的 What to Report 栏（层级：Scale & metric / Tables & marginals / Abstention & coverage / Aggregation & ensembles）。本文逐字引用与本票相关的 6 条：

| # | 原文 | 【Cn】 |
|---|---|---|
| 2 | at most one of Pearson, Spearman, Kendall's τ_b, ϕ, and MCC on binary data | §4.1 Takeaway【C35】 |
| 4 | 「4. The 2 × 2 confusion matrix and N」 | 【C57】 |
| 5 | 「5. The handling of degenerate criteria」（Marked NA, never zero） | 【C58】【C49】 |
| 6 | 「6. The handling rule for CA, ties, and invalid outputs」 | 【C55】 |
| 8 | 「8. Under exclusion, covered performance with joint」 coverage | 【C56】 |
| 10 | 「10. The aggregation level and resampling unit」 | 【C54】【C28】【C29】 |

§7 的总序（§8 Conclusion）：「The operational sequence follows the analysis: scale, then data subset, then handling rule, then aggregation rule, and only then the statistic.」（本文认读，**未单独入 manifest，待核行号**）。

聚合层的硬规则：「belong in the report (Fig. 4). Takeaway: Report the aggrega-」【C50】「tion level with the number, and never compare judges across」【C51】 levels. 「levels. A gap between micro and macro estimates signals that」【C108】 agreement varies across criteria; inspect the per-criterion tables before trusting either average. 以及「The per-criterion tables show what a pooled number hides.」【C107】

### 7.2 它警告的「并排报多个相关系数」反模式

**来源事实**（Abstract + §4.1）：

> For non-degenerate binary verdicts, Pearson's r, Spearman's ρ, Kendall's τ_b, the phi coefficient, and the Matthews correlation coefficient are exactly the same statis-「tic, so reporting several repeats one number under different」【C34】 names.
>
> §4.1 Takeaway：「Takeaway: Report only one of Pearson, Spearman, Kendall's」【C35】 τ_b, ϕ, and MCC on binary verdicts; they are interchangeable there, and ϕ/MCC is the most direct. **If two of them differ in a pipeline's output, suspect a degenerate criterion or an implementation error rather than judge behavior.**

**反模式的两层含义**：(a) 并排报 5 个系数是**把一个数报了五遍**，制造虚假的证据厚度；(b) 更有用的是它的**诊断用途**——在二值判决上若两者**不相等**，那是**退化准则或实现 bug 的信号**，不是判官行为的信号。**设计推论**：这给本仓一个免费的单元测试——在 1495×5 的二值判决上断言 `ϕ == MCC == Pearson`，不等即实现错误。

κ 不在这个等价类里：`κ = q(π,π̂)·ϕ`，`q(π,π̂) = 2√(AB)/(A+B) ∈ (0,1]`（§4.2 Eq. 8，逐字转写；`A=(TP+FN)(FN+TN)`、`B=(TP+FP)(FP+TN)`），故 `|κ| ≤ |ϕ|`，等号当且仅当两边 MET 率相等。

### 7.3 `compare.ts` 必须发出的字段契约

`compare.ts` 当前发出什么（读 `packages/eval/eval-cli/src/compare.ts` 全文）：

- `checkRenderable`（L84-110）：无 `config` 或缺 16 个必填键 ⇒ **拒渲染 exit 2**。✅ 已是「缺字段拒渲染」的既有先例。
- `describeExecutionMode`（L124-137）、`describeRunProtocol`（L144-162）：模式/协议 tag，不一致则拒渲染（L168-199，可用 `--allow-protocol-mismatch` 绕过）。
- `Overall`：`summary.pass_rate` 的 A→B 与 pp 差（L428-433）。
- 类别分解：Original / Alias / Voice EXEC / Voice DELIVERY / Voice，`rate() = correct/(correct+wrong+declined)`（L377-381），附 `(N excl)`。
- case 级 flips：`gained` / `lost` / `newCases` / `removedCases`（L440-497）。
- `Net: +g / -l`。
- **`grep -c "McNemar|confidence|bootstrap|n_d|ci_low|mde|power" → 0`。显著性层完全不存在。**

**契约（设计推论；M = mandatory，缺则拒渲染；O = optional）**：

| 字段 | 规则 | M/O | 依据 |
|---|---|---|---|
| `estimand_id` | 枚举 `per_attempt` / `case_strict_passk` / `case_any_passk` / `case_instability` / `criterion_agreement` / `rerun_stability`，**一次渲染只报一个 estimand，多 estimand 分块输出** | **M** | §2；【C50】【C51】never compare across levels |
| `aggregation_level` | `micro` / `macro` / `case` 之一 | **M** | 清单 10【C54】 |
| `resampling_unit` | `case` / `criterion` / `decision` 之一，**必须与 `aggregation_level` 按【C30】【C31】的逐层对应匹配，否则拒渲染** | **M** | 清单 10【C28】【C29】【C30】【C31】 |
| `sampling_model` | `finite_census`（无 CI）/ `item_superpopulation` / `rerun_stochasticity` 之一 | **M** | 【C32】【C33】；【C6】 |
| `n_total`, `n_in_population`, `n_attributable` | 三个分别落盘；`n_in_population = n_total − n_case_defect` | **M** | 清单 4【C57】；【C38】 |
| `gamma` | `n_attributable / n_in_population` | **M** | 【C53】【C43】【C44】 |
| `rate_environment_blocked` / `rate_not_measured` / `rate_case_defect` | **分别**给出，不得合并成一个 `excl` | **M** | 清单 7；【C38】 |
| `identification_interval` | `[γA_cov, γA_cov + 1 − γ]`，**标签必须写 "identification, not CI"** | **M**（当 γ<1） | 【C39】【C40】【C41】【C52】【C56】 |
| `ci_95` | case 级 cluster bootstrap 百分位区间 | **M**（当 `sampling_model ≠ finite_census`） | §3.4；【C27】【C102】【C103】 |
| `bootstrap_B`, `bootstrap_undefined_replicates` | B=10000；undefined 计数必报 | **M** | 【C26】【C103】 |
| `n_d`, `n_d_split` | McNemar 的不一致数与 `(b, c)` 拆分 | **M**（两 run 比较时） | 【C45】【C77】【C78】 |
| `mcnemar_p` | 精确二项，双侧 | **M**（两 run 比较时） | 【C45】【C77】 |
| `mde_80` | 按 §4.4 公式由 `n_d` 与 `n_attributable` 算出 | **M**（两 run 比较时） | §4.4 自算；旁证【C80】【C81】 |
| `paired_case_set_identical` | 两臂排除后的配对 case 集是否一致；为 false 时列出断裂的 case id | **M**（两 run 比较时） | §4.3 条件 1 |
| `attempt_vector` | 每 case 的完整 `[Y_1..Y_k]`，不只聚合 verdict | **M**（k≥2 时） | §8；R22 必须记录项 |
| `rlpr`, `psr`, `pass_at_k`, `av` | 四者**同时**输出；`psr` 必须显式标注 `= pass^k ≠ pass@k` | **M**（k≥2 时） | 【C63】–【C68】【C69】–【C74】 |
| `confusion_2x2` + 每准则 MET 率 | 判官 estimand 的 2×2 表与双边 MET 率 | **M**（报 `criterion_agreement` 时） | 清单 4【C57】；清单 3；【C109】 |
| `phi_or_mcc` | **只报一个**；若 ϕ≠MCC≠Pearson 则报错（退化或实现 bug） | **M**（报 `criterion_agreement` 时） | 清单 2【C34】【C35】 |
| `degenerate_criteria` | 退化准则列表，指标标 NA 不填 0 | **M**（报 `criterion_agreement` 时） | 清单 5【C58】【C49】 |

### 7.4 本仓当前违反清单的哪几项

| 清单项 | 本仓状态 | 证据 |
|---|---|---|
| 2（只报一个相关系数） | **未违反**（当前一个都不报） | `compare.ts` 无相关系数 |
| 4（2×2 表 + N） | **违反** | 判官的 2×2 表从未输出；`compare.ts` 只给 correct/wrong 计数 |
| 5（退化准则标 NA） | **未违反** | 五个准则在 1495 条上均非退化（§2.2 实测） |
| 6（CA/tie/invalid 处理规则） | **违反** | 五值 outcome 存在于代码但 0 次落盘；`compare.ts` 把三个排除类合成一个 `excluded` 桶（L364） |
| 7（弃权/无效/覆盖率分别报） | **违反** | 只有一个 `excl` 数字 |
| 8（covered + joint coverage + 界） | **违反** | 无 γ，无 identification 界 |
| 10（聚合层级 + 重采样单位） | **违反** | 两者均未声明；且**无任何重采样** |
| 11（合议统计） | **不适用** | 单判官 |
| （map 方向 4 自订）点估计+McNemar p+95%CI+n_d+power+MDE | **全部缺失** | `grep -c` = 0 |

**另一条非清单但同类的缺陷**：`compare.ts:473` 对只存在于一臂的 case 执行 `if (vB === undefined) continue`——静默丢弃且不计数，使配对集的完整性不可核。`newCases` / `removedCases` 只打印前 10 个（L482-490、L492-497）。

---

## 8. 对 R22 的输入

### 8.1 统计量（可直接实现）

每个 case `i` 记完整 attempt 向量 `Y_i = [Y_{i,1} … Y_{i,k}]`，`Y_{i,r} ∈ {0,1}`。令 `S_i = Σ_r Y_{i,r}`，`p̂_i = S_i / k`。由 `S_i` 的分布导出全部读数，**零额外 LLM 调用**：

| 量 | 公式 | 出处 |
|---|---|---|
| `RLPR` | `(1/(Nk)) Σ_i S_i` | 【C69】【C70】 |
| `PSR`（= 本仓 `pass^k`） | `(1/N) Σ_i 1[S_i = k]` | 【C71】【C72】 |
| `pass@k` | `(1/N) Σ_i 1[S_i ≥ 1]` | 【C66】；无偏估计器 `2107.03374`（未重读） |
| `AV` | `(1/N) Σ_i (k/(k−1)) p̂_i(1−p̂_i)` | 【C73】【C74】 |
| **`consistency@k`（重跑版）** | `(1/N) Σ_i 1[S_i ∈ {0, k}]`，即**attempt 向量为常量的 case 占比**；`1 − consistency@k` = flaky 占比 | 设计推论；与 `2605.30504` 的 constant-item 概念同形【C100】【C101】 |

⚠ **命名冲突必须在 R22 的 SPEC 里裁掉**：map 方向 6 的 `consistency@k`（第 6 维）指的是 **paraphrase / schema-perturbed 变体之间**的一致性，而 R22 的问题是**同条件重跑之间**的一致性。**这是两个不同的 estimand，共用一个名字会制造 R10 式的混淆。** 建议分别命名 `rerun_consistency@k` 与 `perturbation_consistency@k`。

**为什么 `consistency@k` 的常量判据有外部支撑**：`2605.30504` §3.2 在 IRT 拟合前剔除两类 item，其中「The constant-item filter drops 1,685 items (8%) on」【C100】「which every generative model gives the same an-」【C101】swer——**全模型答案相同的 item 对区分力零贡献**。同构地，attempt 向量为常量的 case 对 `rerun_consistency` 的方差零贡献，也对 McNemar 的 `n_d` 零贡献。这是 n_d 为什么会小、以及为什么应该主动采样 p̂≈0.5 的 case 的独立依据（与 `2601.20251` Theorem 3.2 的 `q*(j) ∝ √(p_j(1−p_j))`【C12】同向）。

### 8.2 样本量（具体数）

**(a) 要估 flaky 占比 `π_f`（= 1 − consistency@k）到 ±w 半宽，95%**（作者自算，case 级 cluster bootstrap 的正态近似；case 是独立单位，故此处二项近似可用）：

`N ≈ 1.96² · π_f(1−π_f) / w²`

| π_f 先验 | w = 0.10 | w = 0.075 | w = 0.05 |
|---|---|---|---|
| 0.20 | 62 | 110 | 246 |
| 0.30 | 81 | 144 | 323 |
| 0.50 | 97 | 171 | 385 |

**(b) 要用 McNemar 比较两臂的 PSR**：见 §4.4 表。给定预期不一致率 `π_d`，`n_d ≈ N_att·π_d`，再查表得 MDE。**例**：`N_att = 143`（168 减 25 个 DELIVERY）、`π_d = 0.25` ⇒ `n_d ≈ 36` ⇒ **MDE ≈ 9.9/168×168/143 ≈ 11.6pp**。要把 MDE 压到 5pp，在同一 `π_d` 下需 `N_att ≈ 330`。

**(c) k 的选择**：`2606.00920` 用 R=5【C78】。本仓当前用 k=3。k 从 3 升到 5 对 `AV` 的 `(k/(k−1))` 修正因子从 1.50 降到 1.25（更小的偏差修正），且 `PSR` 对不稳定性的分辨率提高。**设计推论**：R22 至少跑 k=5，并且**必须把 k 写进 run config**——当前唯一的 168-case k=3 run 连 `config` 都没有（§5.3）。

### 8.3 R22 必须记录的最小集（在票面「必须记录」之上补三项）

票面已要求：完整 attempt vector、model/prompt/harness/adapter/environment/policy/seed/budget、`pass@n`+`pass^k`+per-attempt rate+CI、分层。本文补：

1. **`sampling_model` 标签**——CI 是对 item 超总体还是对重跑随机性的（【C32】【C33】）。两者都要出，且是两个数。
2. **每 case 的五值 `execution_outcome` 向量**，不只 boolean——否则 §6 的 γ 与 identification 界算不出来。
3. **`bootstrap_undefined_replicates`**（【C26】）。

---

## 9. 待核 / 未回答

**本轮未能定位的引文（不得当成已证）**：

1. `2606.00093` §4.3 的 delta 方法数值对照（`Var(κ̂)=Var(ϕ̂)=0.640/N` vs 连续化的错误值 `0.41/N`）—— 文字已读到，**未单独入 manifest，行号待核**。
2. `2606.00093` §8 的操作顺序句（"scale, then data subset, then handling rule, then aggregation rule, and only then the statistic"）—— 已读到，**未单独入 manifest，行号待核**。
3. `2606.00920` §2 的「deliberately narrower than end-to-end agent evaluation」自述与 Limitations 第二条 —— 已在 `.raw.txt` 读到，**在 `-layout` 文本中未单独入 manifest，行号待核**。
4. `2601.20251` Theorem 3.1 的 `σ̂²_{n_b}` 闭式（Appendix A.2.2）与 Assumptions A.1–A.3 的完整陈述 —— **本轮未读**，故本文只引用 CI 的形式【C7】，不对其有限样本行为作任何断言。

**本轮未解决的问题**：

5. ~~**「n=168 MDE 5.4–10.1pp」与「n_d≥85」的原始推导在仓内研究层找不到**；`GA-EVAL-EXPAND-case-set-power.md` 文件不存在。~~ **❌ 本条初稿错误，已由 orchestrator 于 2026-10-06 推翻并更正。**

   该文件**存在**：`wayfinder/data-agent/tickets/phase-misc/GA-EVAL-EXPAND-case-set-power.md`（14,259 bytes，2026-09-08），map 第 68 行的链接**有效**。本文初稿的 `grep` 范围限于 `wayfinder/evaluation/`，未覆盖 `wayfinder/data-agent/`，故漏掉了它——**这是检索范围错误，不是缺件**。

   **原始推导在该文件内，且与本文 §4.4 的算术一致**，关键四处：
   - `:26` 标题「关键认识：功效变量是 n_d（不一致对数），不是 N」；
   - `:30-33` 「想检出的分裂比 → 需要 n_d」表，**65/35 分裂 ⇒ n_d=85**（与本文 §4.4 表「n_d=85 需拆分 p≥0.661」同量级，0.661 vs 0.65）；
   - `:37` 当时实测 n_d：best-of-k **17**、pass^k **40**（落在本文表的 5.0–9.9pp 区间内，解释了 MDE 5.4–10.1pp 的来历）；
   - `:50-52` **「r=23.8% 是真实分布的固有属性……真实地扩到 N≈360 即自然得到 n_d≈85」**——即 n_d≥85 的达成路径是**扩 N**，不是在 N=168 上做文章。

   **⇒ 更正后的结论**：两个数字**各自正确、分属两个 regime**；缺陷是 **map 第 68 行把它们压进同一格**。这降级为文档修复，不再是统计争议。**教训（本 effort 第 4 次同类）**：subagent 的「文件不存在 / 文献空白」类**全称否定**命题，必须由 orchestrator 独立复核检索范围后才可写入——R8 的负空间结论、R8 对 `2602.02219` 的称法、本条，都是同一失效模式。
6. **判官 estimand 的人类参考集不存在。** `2606.00093` 整篇是「判官 vs 人类 gold label」的一致度；本仓 1495 条判决**没有配对的人工标注**，所以清单第 3、4 项（匹配目标的指标 + 2×2 表）**在本仓目前无法计算**，只能算判官内部的池化率。这不是报告缺陷，是**语料缺陷**，归 R14/R20。
7. **`2606.00093` 的主数据集是 1–4 序数，不是二值。** 「teria rated 1–4 by a human annotator and independently by」【C46】 a GPT-3.5-turbo-16k judge；二值化在 `MET = rating ≥ 3`（Table 5 caption）。其 24 个协议跨 (extraction, MET 阈值 ∈ {≥2,≥3,≥4}, 弃权规则, 聚合层级) ⇒「accuracy across them runs from 0.551 to 0.899, a spread of」【C47】 34.8 points。**本仓的 `dimensions: Record<string,0|1>` 是原生二值，没有 MET 阈值这个自由度**，所以 0.551→0.899 的**一部分**（阈值项）在本仓不适用；其 §4 的二值恒等式与 §4.3 的 cluster bootstrap 则**完全适用**。该文的 Limitations 亦自述「The rubric judge is one model on one domain, and its agreement with the annotator is near zero under every protocol」——**它展示的是协议对数字的作用，不是强判官的表现**。
8. **`declined` 分支的去留未决**（§5.3）：它在分母里但永不被生产。G4 需裁。
9. **`compare.ts` 的 `summary.pass_rate` 被原样信任，从不从 `cases` 重算。** 两者的公式当前一致（都是 `correct/attributable`），但写入方若改了口径，`compare.ts` 侧不可见。建议加一致性断言。**未实现。**
10. **本文对 `2601.03986` 的 15×11 结果表、`2605.30504` 的全文均未认读**；前者的 CBRC/BQS 与后者的 ∆ℓ_i 指标与本票无直接关系，归 R5 / 方向 6。
11. **交叉票输入**：`2601.03986` 的 CAD inversion 判据——「an inversion on question q occurs when a stronger」【C93】「model fails but a weaker model succeeds:」【C94】，`inv_rate = Σ_f inv_{F_f} / Σ_f comp_{F_f}`，`CAD = e^{−λ·inv_rate}`，λ=12——是一个**自动 case-defect 探测器**，与本仓 `case_defect` outcome 同向。它的 bootstrap 是**对 instance 重采样**（「selection ratio r, we perform K bootstrap sampling」【C95】「k, we sample r · |B| instances and compute the」【C96】 resulting model ranking），而 CAD 的 CI 窄（「stable (typical CI width < 0.1). This stability arises」【C98】）是「because CAD aggregates over many instance-level」【C99】 comparisons——**即它也落在「重采样单位必须与估计量同层」这条规则上**。但该文全程 **单次 greedy 解码**（「greedy decoding for reproducibility and evaluate」【C97】），**没有任何重复运行或 clustering 处理**，故对本票的 cluster bootstrap 无增量，只提供 case-defect 探测与 ε=0.02 的 effect-size 阈值。**它的 CAD 能否套在本仓上，需要 ≥2 个同族不同规模的模型，本仓当前没有——待 R22 顺带产出。**

---

## 附：抓取物与复核

- PDF 与文本化结果在 `.tmp/r4/`（gitignored）：`2601.20251`、`2606.00093`、`2606.00920`、`2601.03986`、`2605.30504` 各一份 `.pdf` + `-layout` 的 `.txt` + 无 `-layout` 的 `.raw.txt`。全部经 `curl -sSL --retry 3 --retry-all-errors --retry-delay 5 https://arxiv.org/pdf/<ID>` 取得。
- 引证清单 `.tmp/r4/citations.jsonl`，**97 行**，每行 `{id, arxiv, file, line, quote}`，`quote` 为该行的逐字子串（空白不敏感）。本文作者已以独立脚本机械复核 **97/97 通过**。
- `-layout` 文本在双栏论文上会把左右栏并到同一物理行，故所有 quote 都已挑成**不跨栏断口**的片段；`2606.00093` L422 含一个 `\x01` 控制字符，该行的 quote 已缩短以避开。
- 本仓侧数字（§2.2 的 MET 率与模式分布、§3.3 的 design effect、§5.3 的 run 清点与 verdict 统计）由 `python3` 直读 `eval-results/*.json` 与 `packages/eval/**/*.ts` 得到，脚本为一次性、确定性（bootstrap 固定种子）。**本文不引用任何 judge-only 或已退役的速率数字作为基线。**
