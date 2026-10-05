# R8b — 判官读出与聚合：全文认读

日期：2026-10-06  ·  票：[R8b-judge-readout-papers](../tickets/R8b-judge-readout-papers.md)  ·  分支：`research/R8b-judge-readout-papers`（纯文档）

## 0. 证据路径（先读这段）

**抓取**：`curl -sSL --retry-all-errors` 取 `arxiv.org/pdf/<id>`，`pdftotext -layout` 转文本，7/7 成功。抓取物在 `.tmp/r8b/`（不入 git）。**本票未查 arXiv 元数据 API**——身份由 orchestrator 验真并锁定，预算全部花在全文上。

**引证**：**121 条**引文，全部为本地 `.txt` 的**逐字片段 + 行号**，由 `.tmp/r8b/citations.jsonl` 记载、`.tmp/r8b/verify.mjs` 机械回核（空白不敏感、字词敏感）。**121/121 通过，0 实质失败**；回核中抓到自己 1 处行号错位（C46 originally 295，实为 296，已改）。同一流程与 R8 的 83 条一致。

**证据等级**：本文**全部为全文层**。凡本文未给 `【Cn】` 的断言，都是本仓自有测量或本文作者的推理，已就地标明；**无任何摘要层证据以事实形式进入本文**。

**读法**：§1 是三处身份/框架修正（含 GEAR 之谜的解答），§2 是本票最重的结果（GEAR 的 leakage 在二值准则上退化），§3–§8 是逐篇认读，§9 是交付（六问逐答 + 五条必答）。**建议 §1 → §2 → §9 → 回看论文。**

> **⚠ 本票证伪了自己题面的 8 处前提。** 清单在 [§10](#10-对本票题面与前序产物的修正清单)。R8 把「证伪自己」当最好的产出，本票照办。

---

## 1. 三处身份与框架修正

### 1.1 「GEAR」之谜：方法名为真，不在标题，也不是标题的缩写

`2606.03361` 的标题是 *Mitigating False Credit Propagation: Probabilistic Graphical Reward Aggregation for Rubric-Based Reinforcement Learning*，**不含 GEAR**。orchestrator 指出标题自带的短语 *Probabilistic Graphical Reward Aggregation* 缩写应为 PGRA。

**全文给出的答案**：GEAR 是该文**自己在摘要里命名的方法**，展开式与标题短语无关：

> 「…we propose GEAR (Graphical Event」【C1】「Aggregation for Rubric rewards), a probabilis-」【C2】tic graphical framework for dependency-aware rubric aggregation.

⇒ **GEAR = Graphical Event Aggregation for Rubric rewards**。代码仓也叫 `LvCan926/GEAR`。

**对「方法名 ≠ 标题」这条规则的意义**：这是本 effort 第 6 次撞上该现象，但**第一次属于「方法名在原文摘要里确有其事」**——前五次（GradeSQL / SARA / RRD / RULERS / STEF）都是**二手来源拿方法名当标题**。两者不同：
- 引用时**标题必须用真标题**（这点与前五次相同）；
- 但**「GEAR」作为方法名可以用**，不必像前五次那样当作错误剔除。
⇒ 规则应细化为：**「方法名 ≠ 标题」是引用纪律，不是真伪判据**；判真伪要看方法名是否在原文（通常在摘要或 §1 末的 contribution 列表）被作者自己定义。

### 1.2 `2606.00093`：PDF 渲染标题与元数据不同，本文从 PDF 自行确认

本地 PDF 第 1 行渲染为「Agreement Measurement for Rubric-based LLM Judges:」【C30】 *What to Report and Why*——与 `arxiv.org/html/` 一致，与元数据的 *Agreement Metrics for LLM-as-Judge Evaluation* 不同。⇒ orchestrator 表中的 ⚠ 由 PDF 本体独立确认。**引用时两标题并列。**

本文只取**池化层级与 decision rule** 这一面；统计协议 / CI / cluster bootstrap 归 R4，不重复（§4.5 只标界）。

### 1.3 `2510.11822`：ticket 的「minority-veto 论文」框架**不是**误述

与 R8 在 `2602.02219` 上抓到的错误**不同类**。该文标题讲 agreeableness bias，而 minority-veto 是它**摘要里自己提出的三个贡献之一**：

> 「We introduce an optimal minority-veto strategy that is」【C117】 resilient to missing data…

⇒ **主题（agreeableness bias）与方法（minority-veto）是同一篇的两层，ticket 与标题都没错，无需修正。** 真正需要修正的是**它的 veto 在哪一层**——跨判官，不是跨准则（见 §5、§9.5）。

---

## 2. 本票最重的结果：GEAR 的 `leakage` 在**二值准则**上退化成常数

这一节是 §9.1（必答 1）的依据，单列是因为它同时推翻本票对 G8 的两条预期。

### 2.1 GEAR 的形式定义（逐字）

**失效模式 FCP**：

> 「agation (FCP): a criterion contributes reward or」【C3】「penalty without the rubric-level condition that li-」【C4】「censes that contribution. FCP can occur even when」【C5】 each local criterion score is reasonable on its own.

**机制归因 flat scalarization**：

> 「independent utilities. This flat scalarization」【C6】 ignores rubric-specified prerequisite and activation relations among criteria, allowing re-「ward or penalty to be counted even when the」【C7】 condition that licenses it is absent.

**leakage 案例集 D**（Appendix F 与 §4.3 一致）：a directed dependency from parent `j` to child `i` is treated as violated when 「the child is locally supported but the parent is not,」【C8】「i.e., pi (x, y) ≥ 0.5 and pj (x, y) < 0.5」【C9】.

**leakage 度量 Eq. 15**（The nor-「malized leaked utility is」【C10】）：

```
L^m_FCP = (1/|D|) · Σ_{(x,y,j,i)∈D}  [ |w_i| / Σ_{k: w_k>0} w_k ] · s^m_i(x,y)
```

**preservation 度量 Eq. 16**，在 S = {边 : p_i ≥ 0.5 ∧ p_j ≥ 0.5} 上：`P^m = (1/|S|) Σ s^m_i / p_i`。

其中 `s^flat_i = p_i`、`s^hard_i` 为硬门后的分、`s^gear_i = q̂_i`，而 `q̂_i = p_i · Π_{j∈Pa(i)} [ q̂_j + (1 − q̂_j)λ_ji ]`（Eq. 12），默认 `λ_wk=0.6 / λ_st=0.2 / λ_act=0.0`（Table 7）。

### 2.2 本仓的 128 条的形式定义（本仓自测，R20 探针 a）

1495 条已落盘向量，5 个**硬 0/1** 维度。读出 `mean(5 dims) ≥ 0.6 ⇒ PASS`。漏的定义：
```
LEAK = { n : d[n][overall_semantics] = 0  ∧  mean_i d[n][i] ≥ 0.6 }
```
`|LEAK| = 128`，占 1495 的 8.56%、占 246 条 `overall=0` 的 52.03%。

### 2.3 并列比较：四处结构差异

| | GEAR 的 `L_FCP` | 本仓的 128 |
|---|---|---|
| **单位** | **边**（parent, child）× 响应 | **case**（一次 attempt） |
| **被测的东西** | 违约边上**保留下来的归一化效用的均值**（一个幅度） | 阈值化**判决**翻转的**发生率** |
| **阈值的角色** | 只用来**构造诊断子集**；奖励本身无阈值 | 阈值**就是**判决 |
| **图** | 显式 typed edge set，必须存在 | 无图；`overall → 四机械维` 是**我们自己的假设** |
| **局部分数** | **软概率** `p_i ∈ [0,1]` | **硬 0/1** |

最后一行是关键，且**它证伪了 R8 补记的一句话**。R8 记 GEAR 为「全程二值」。**不对**：隐事件 `C_i` 是 Bernoulli，但**观测到的局部分数不是**——

> For HealthBench, the reward judge produces 「both a binary decision and a satisfaction probabil-」【C22】「ity for each rubric item. We use the satisfaction」【C23】 probability as the local criterion score. The binary decision is used for validation and for deterministic gating baselines.

⇒ GEAR 喂给聚合器的是**概率**；二值 decision 只用于 validation 与 hard-gating baseline。

### 2.4 可直接在 1495 条向量上算的表达式

取 `w_i = 1 ∀i`（本仓五维等权）、`K = 5`、全为正权，图为单亲 `o = overall_semantics → M = {table_selection, field_selection, filter_conditions, aggregation_logic}`。则 `|w_i| / Σ_{w>0} w = 1/5`，且 `p_i ≥ 0.5 ⇔ d_i = 1`：

```
D   = { (n, i) : n ∈ 1..1495,  i ∈ M,  d[n][i] = 1  ∧  d[n][o] = 0 }
|D| = Σ_{n=1}^{1495} (1 − d[n][o]) · Σ_{i∈M} d[n][i]

S   = { (n, i) : i ∈ M,  d[n][i] = 1  ∧  d[n][o] = 1 }

边级漏率  = |D| / (4 × 1495)
```

代入 Eq. 15 / Eq. 16，三种聚合规则：
```
L_FCP^flat = (1/|D|) Σ_{(n,i)∈D} (1/5) · d[n][i]  ≡  0.2      ← 恒等于 1/5，与数据无关
L_FCP^hard = 0                                                 ← λ_act = 0
L_FCP^gear = 0.2 · λ                                           ← λ_st = 0.2 ⇒ 0.04

P^flat = P^hard = P^gear ≡ 1.0000                              ← 恒等于 1，与数据无关
```

### 2.5 实测确认（零 LLM 调用，确定性）

`.tmp/r8b/fcp-edges.mjs`（scratch，不入 git），跑在与 R20 探针 a **同一批** 1495 条向量上：

```
vectors N          = 1495
edges total        = 5980
|D| leakage cases  = 550   (9.20% of edges)
|S| satisfied      = 4994  (83.51% of edges)
L_FCP  flat = 0.2000  hard = 0.0000  gear(lam=.2) = 0.0400
P      flat = 1.0000  hard = 1.0000  gear(lam=.2) = 1.0000
```

数值与 §2.4 的解析常数**逐位相符**。（本文**未重算** 8.56% / 52.03%——那两个数归 R8/R20；此处只验算了 `|D|` 这个新量，并确认 `sql_judge.dimensions` 的形状足以实现该表达式：84 份结果文件、19 份含非空 dimensions、1495 条向量、**单一 key-set**。）

### 2.6 结论：**可移植的是案例集 D，不是度量 L_FCP**

1. `L_FCP^flat ≡ |w_i|/Σw`，**在任何等权二值准则数据上都是常数**——因为 D 的定义已经钉死 `s^flat_i = p_i = 1`。它不含任何本仓信息。
2. `P` 对三种规则**全部为 1.0000**——因为唯一的亲是二值的：亲为 1 则 retention factor 为 1，亲为 0 则该边根本不在 S 里。**GEAR 的 leakage–preservation 取舍在二值局部分数下是空的。**
3. ⇒ **硬门在本仓数据上同时取到 `L = 0` 与 `P = 1`，严格支配 flat 与 soft suppression。** GEAR 反对 deterministic gating 的全部经验依据，依赖 `p_i` 是软的（见 §3.3）；本仓不满足该前提。
4. 唯一有信息的移植物是 **`|D|` 本身**（550/5980 = 9.20%）。它与本仓的 case 级 128/1495 = 8.56% 是**同一批向量上的两个不同估计量**，不可混用、不可互相替代。

---

## 3. `2606.03361`（GEAR）全文认读

### 3.1 实验条件（ticket 问的「哪三个 benchmark、哪两个 backbone」）

- Benchmark 三个：「HealthBench-500 for medical dialogue」【C116】 quality（physician-written rubrics）、WritingBench（long-form writing, query-specific criteria）、PLawBench（case-based legal reasoning）。
- Policy backbone 两个：「We use Qwen2.5-7B-Instruct and Llama-3.1-8B-」【C115】Instruct，GRPO 优化，每个组合 3 个独立 seed。附录 E.3 另有 Qwen3-30B-A3B-Instruct 的**单次** run 作补充核验。
- 判官分工：训练期 criterion-level reward judge = Qwen3-8B；最终 validation judge = Qwen3-32B（刻意分离）。
- **96.5%** 是 Table 2 的**单一数字**，不是逐 benchmark 的：L_FCP 从「0.0922 to 0.0032, a 96.5% relative reduction over」【C13】 Flat，在 pooled 的 edge-level dependency cases 上算。
- **「最多 15.5%」是相对增幅**，摘要写「of up to 15.5% over flat aggregation」【C27】。**本文作者在 Table 1 上自行定位**：aggregation-only、HealthBench-500、Llama-3.1-8B-Instruct，Flat 54.1 → GEAR 62.5，`8.4/54.1 = 15.53%`。（此定位是**本文的算术**，非原文明写。其余所有 cell 的相对增幅都更小：次高为 MeRF/Qwen/HealthBench 13.4%。）
- 另有一条独立的 human-grounded 复核：300 条人工标注的 dependency case 上，Flat 漏 0.082 → GEAR 0.010，preservation GEAR 0.648 vs Hard 0.231。

### 3.2 prerequisite 图：**LLM 归纳的**，人只做精度审计

四阶段：criterion role 标注 → role 约束下生成候选有向对 → 逐对由模型判定是否成立并定型 → validation + acyclic projection。

- 标注者是模型，不是人：「we use Qwen3-8B as the graph annotation」【C16】 model，三个 benchmark 共用同一 pipeline（只换自然语言 annotation profile）。
- 图与响应无关：The graph is constructed only from the query 「and the rubric, not from any candidate response.」【C17】 ⇒ 每个 query 一张、跨候选响应固定。
- 人工只审精度：180 条保留边（每 benchmark 60 条）、两名标注者独立标后裁决，「audit yields 91.7% valid-edge precision, 87.3%」【C18】 relation-type accuracy，pooled Cohen's κ = 0.80。**但原文自陈**：This audit evaluates the 「precision of retained edges rather than the recall of」【C19】 omitted dependencies。
- 拓扑**不是**随便一张图：「Table 4 shows that random rewiring fails to im-」【C29】prove over Flat（55.8 vs Flat 56.7），untyped graph 60.4，full typed + soft 62.9。
- retention factor 是**人手设的常数**（λ_wk=0.6 / λ_st=0.2 / λ_act=0.0，Table 7），不学习、不按 benchmark 调。
- 覆盖率：HealthBench 平均 11.48 准则 / 10.92 边，non-empty graph rate 91.84%；WritingBench 5.00/2.86、78.60%；PLawBench 4.00/1.94、71.20%（Table 16）。

⇒ **对 G8 的净影响**：拓扑**可归纳**（有已发表、可用、经人审的 pipeline），所以**不能说「文献要求图必须人写」**。但 role 分类法与「边型 → retention factor」映射在 GEAR 里**全是人的设计选择**，从未学习。**而本仓 K=5、候选边只有 4 条，归纳无可发现。** ⇒ 建议 G8 **仍把本仓那张图当决策**，理由是**K 太小、归纳无增益**（本仓自定），**不是**「论文说必须人写」（假借权威，R8 §7.2 的教训）。

### 3.3 gating 的代价，以及**它为什么不转移到本仓**

**已发表的代价（在 GEAR 自己的设置里，真实且一致）**：
- Hard un「derperforms Flat in both blocks, suggesting that」【C11】「deterministic gating can discard valid partial credit」【C12】 under noisy criterion judgments。Table 1 全表：Hard < Flat 在 3 benchmark × 2 backbone 的 **6/6** 格（54.6/72.5/65.0 vs 56.7/74.1/68.4；53.0/72.7/66.7 vs 54.1/76.2/69.5）。
- Hard 保留的许可效用远少：「but preserves much less licensed utility than GEAR」【C14】「(0.1877 vs. 0.2706)」【C15】；人工子集上 0.231 vs 0.648。
- 附录 F 直说机制：deterministic gating can eliminate 「threshold-defined leakage by construction while」【C20】 preserving substantially less licensed downstream utility。

**层级差，明写**：
1. GEAR 是**RL 奖励聚合**论文。它的输出是 the scalar reward as nor「malized expected signed utility:」【C24】（Eq. 14），交给「rithms such as PPO and GRPO without changing」【C25】 the outer RL algorithm。**全文没有任何 pass/fail 判决。**
2. Table 1 的每个数字都是**训练完的 policy 的 benchmark 得分**。所以 gating 的代价被测成的是**丢失的学习信号**，不是**丢失的报告准确度**。
3. 它的诊断自己也不主张效度：The diagnostic should be interpreted as an 「aggregation-level probe rather than a human seman-」【C21】tic audit… it measures how an aggregation rule behaves under the provided criterion-level evidence, rather than whether every dependency annotation or criterion judgment is semantically correct。
4. 能力边界：It does 「not cover compensatory, alternative, mutually ex-」【C28】clusive, non-monotonic, or cyclic relations, nor can it recover criteria omitted from the rubric。

**判断：不转移，而且在本仓数据上这个取舍是空的。**
- **没有 policy**：本仓读出产出的是报告。「丢掉有效的部分分」只有在**下游有东西在学**时才有代价。
- **没有部分分可丢**：GEAR 的部分分住在 `p_i ∈ (0,1)`；本仓 `p_i ∈ {0,1}`。§2.5 实测：硬门在 1495 条向量上同时拿到 `L_FCP = 0` 与 `P = 1.0000`。
- ⇒ **「GEAR 测出 gating 有代价」不是对本仓「改成 `overall_semantics` 单闸门」的有效反驳。** 真正有效的反驳是另一条，而**论文供不了**：四个机械维可能在**判官拿到参考答案之后**携带闸门没有的信息（G8 自己的注），且**没人把任何一种读出对执行真值校准过**（T1 / R14）。

### 3.4 一条对 R20 探针 c 有用的旁证

GEAR 的 judge 请求**是批量的**：each request contains at most 「four rubric items. This batching is used only for」【C26】 efficiency; all aggregation methods consume the same resulting criterion-level scores。⇒ 一条已发表的 pipeline 为了成本把 4 条准则塞进一次调用。这是「拆调用的成本压力是真的」的证据，**不是**「拆调用免费」的证据。

---

## 4. `2606.00093`：池化层级与 decision rule

### 4.1 三级池化的定义（逐字，不可转述）

> 「Micro-averaging pools every item–criterion」【C31】「verdict before computing the metric. Macro-averaging com-」【C32】「putes a separate score for each criterion and averages those」【C33】「scores with declared weights. Item-level aggregation first」【C34】「combines an item's criterion verdicts into one score, using」【C35】「the rubric's weights and decision rule, and then measures」【C36】 agreement on items.

**「decision rule」只出现在 item-level 这一句里**，指的是「把一条 item 的准则判决向量压成一个分」的那个函数。**本仓的 `mean(5 binary) ≥ 0.6` 字面上就是这个 decision rule，而 item-level 是三级里唯一看得见它的一级。**

item-level 的额外要求：Item-level κ additionally 「requires each item's full set of criterion verdicts and a re-」【C53】duction rule; the handling of degenerate single-label criteria, the included/total denominator, and the resampling unit all belong in the report。

纪律：「Takeaway: Report the aggrega-」【C37】「tion level with the number, and never compare judges across」【C38】 levels。Checklist 第 10 条：「10. The aggregation level and resampling unit」【C54】（理由栏：Micro, macro, and item-level scores target different quantities）。

### 4.2 ⚠ 0.551 → 0.899 **不是**「只换池化口径」

ticket（与 R8 补记、lit-gap §3.1）都把这个数说成「仅换池化口径」。**全文不支持。**原文是**四个**协议旋钮的交叉：

> 「The protocol is a choice at four points: verdict extraction」【C41】（the judge's most probable option, or the sampled option shipped with the release）and the MET threshold (≥ 2, ≥ 3, ≥ 4), both within s; the abstention rule h (exclusion or recod-「ing); and the aggregation level a (micro or macro). Crossing」【C42】 them gives 24 protocols on the same 2,007 verdicts. Reported 「accuracy across them runs from 0.551 to 0.899, a spread of」【C43】 34.8 points.

2 × 3 × 2 × 2 = 24。**池化层级是四分之一。**

**单独把池化口径隔离出来的效应小得多，而且报在 κ 上不是 accuracy 上**：Pool「ing its 1,701 covered decisions gives micro-κ = 0.040; av-」【C39】「eraging the nine per-criterion values of Fig. 3 gives macro-」【C40】κ = 0.009，smaller by a factor of more than four——**但两者都贴着零**。

照原文为真的那一句是：the four protocol choices move reported accuracy by 34.8 points and move 「κ across zero, without touching a single verdict」【C44】。（摘要用的是 *without altering a single verdict*；§5.5 用的是 *without touching*。两种措辞都在原文里。）

### 4.3 ⚠ 序数 vs 二值的限制，以及一条更重的限制

**序数**：主数据集是 Hashemi et al. (2024)，223 条人机对话 × nine rubric cri「teria rated 1–4 by a human annotator」【C49】 and independently by a GPT-3.5-turbo-16k judge。该文把它**二值化**（读 3 或 4 为 MET）后再用二值恒等式。
⇒ **四个旋钮里的 MET threshold（≥2/≥3/≥4）在本仓根本不存在**——本仓维度原生二值。所以本仓可达的 spread 结构上更小，34.8 这个数不能搬。

**更重的限制（原文自陈）**：The rubric judge 「is one model on one domain, and its agreement with the」【C51】 annotator is near zero under every protocol, so its proto「col spread shows what the choices do to a reported number」【C52】 rather than how a strong judge would fare。
⇒ **34.8 点是在一个「跟人约等于随机一致」的判官上做的最坏情形演示，不是本仓该预期的效应量。** 任何把它当预期值引用的说法都是误用。

### 4.4 二值恒等式（直接决定 R20 报什么）

> **Fact 1** (Matthews 1975; Kendall 1945; Warrens 2008) For any pair of binary vectors (y, ŷ) ∈ {0,1}^N in which 「each vector contains both labels,」【C45】
> 「ρPearson = ρSpearman = τb = ϕ = MCC.」【C46】

> 「Takeaway: Report only one of Pearson, Spearman, Kendall's」【C47】 τb, 「ϕ, and MCC on binary verdicts; they are interchangeable」【C48】 there, and ϕ/MCC is the most direct. If two of them differ in a pipeline's output, suspect a degenerate criterion or an implementation error rather than judge behavior.

**κ 不在这个等价类里**，且 |κ| ≤ |ϕ|，相等当且仅当两侧 MET 率相同。

**kappa paradox，对本仓格外要紧**：For a criterion that nearly every response meets, both marginals 「approach 1, pe → 1, and high raw agreement can then coexist」【C50】 with much lower chance-corrected agreement。原文纪律：Before reading a low κ as a bad judge, check the MET rates… Compare κ across criteria only when their MET rates are comparable, and report the human and judge rates with every κ。
⇒ 本仓五维的边际通过率是 0.9418 / 0.9271 / 0.8936 / 0.9458 / 0.8355（R20 探针 a 脚本输出）——**四个机械维都接近退化**，它们的 κ 会被构造性地压低。**在那上面读到低 κ 不等于判官差。**

### 4.5 与 R4 的边界

cluster bootstrap 的层级对应（criterion-level ↔ macro、item-level ↔ item-level、flat decision-level ↔ 仅 micro 且需「usually false」的独立性假设）、exclusion 下 full-set accuracy 的识别区间 Eq. 10、matched-marginal 下的渐近方差相等——**全部归 R4**。本票只用它的**池化层级与 decision rule**，并在 §9.3 里声明「resample 整条 attempt」这一级，**不碰区间构造**。

---

## 5. `2510.11822`：veto 在哪一层

### 5.1 agreeableness bias 与 class imbalance

- 定义：We term this as "agreeableness" to describe 「the asymmetry in performance, characterized by a high True Positive Rate (TPR) but a low True」【C64】 Negative Rate (TNR)。
- 数值：「while LLMs can identify valid outputs with high accuracy」【C55】 (i.e., True Positive Rate > 96%), they are remarkably poor at identifying invalid ones (i.e., True Negative 「Rate < 25%). This systematic bias, coupled with class imbalance, often leads to」【C56】 inflated reliability scores。
- **class imbalance 它确实处理了**（ticket 的子问：是）：This 「discrepancy is often masked by high overall accuracy, which is skewed due to the small fraction of」【C62】「invalid outputs in the entire dataset (about 7.5%, see Table 1)」【C63】。
- 样本：366 个高中 Python 错误程序 × 14 个模型作 generator、同 14 个作 validator；6 个 generator 有人工标注真值（>200 人时）。另有 9.7% 的 validator 输出因 JSON 字段缺失/错配而无标。

### 5.2 minority-veto 的形式与最优数

- 形式：We propose a Minority Veto strategy, which 「marks an output as "invalid" if at least n validators agree」【C57】, thus empowering a small minority to override the otherwise agreeable majority。
- 最优数：n = 4（of 14）。A minority veto with just n = 4 「votes decisively outperforms other methods, achieving the lowest maximum error of 2.8%」【C58】 after data repair（个体最差 17.6% → Simple Majority 修后 4.8% → Minority Veto 2.8%）。
- 操作点：「between a high True Positive Rate (95.5%) and an improved True Negative Rate (30.9%)」【C60】 compared to both individual validators and the 「Majority Consensus strategy, which has a TNR of only 19.2%」【C61】。
- **最优数不免费**：the choice of this optimal threshold (n = 4) itself requires a cali「bration set with ground-truth labels」【C59】, and therefore, just like our regression approach, the optimized ensemble also leverages the available human annotations。
- 上限：While ensemble methods, particularly the Minority Veto strategy, demonstrate the value of collective judgment, 「their ability to improve the True Negative Rate is still fundamentally limited by the」【C66】 biases of the individual models。（这是它转向 regression-based bias correction 的理由，最终 max error 1.2%。）
- 域限制：「Our work focuses on code feedback, a domain with a relatively」【C65】 objective ground truth… the applicability of our solution for other subjective tasks… is left to future work。

### 5.3 跨判官 → 跨准则的转写：**不成立**（四条理由）

1. **可交换性**。14 个 validator 是对**同一个**隐二值事实（这条 feedback 有效吗）的 14 个估计。k-of-n 在那里是方差缩减。本仓 5 个维度是**5 个不同的事实**——`table_selection` 不是 `overall_semantics` 的带噪读数。**跨它们计票不是方差缩减，是范畴错误。** 本仓自有的证据就在手上：`P(四机械维全 1 | overall=1) = 0.9984` vs `| overall=0) = 0.0325`（R20 探针 a），这不是可交换评分者的画像。
2. **方向**。该文的 veto 让**少数**能说「无效」。本仓现在的失效**方向相反**：多数机械维说「有效」，把唯一说无效的那一维推翻。把 minority-veto 原样搬到跨准则，得到的**正是 `overall_semantics` 单闸门**（在唯一能 veto 的那一维上 n = 1 of 1）。⇒ **G8 的候选表不能把「minority-veto」与「单闸门」并列成两个方案**，那是同一个方案。
3. **标定**。n 靠真值集调【C59】。本仓目前**没有** per-attempt 的 pass/fail 真值（T1/R14 前置未解），所以连跨判官的原方子都跑不起来。
4. **域**。它自陈域限制【C65】，而本仓是 subjective-ish 的 SQL 语义判定。

⇒ **文献对「跨非可交换准则的 k-of-n 截断」是沉默的：既没被辩护，也没被攻击。** R8 §9.3 的这条结论，经全文认读**成立**。

---

## 6. `2603.28005`：holistic 看见了什么，以及**它的头条不是「holistic 胜」**

### 6.1 四个设计（不是两个）

单次调用、同 judge、同输入布局、同指令详度，只改「分解什么」：
- **C candidate-side atomic**：The judge breaks 「the candidate into atomic claims and grounds」【C79】 each claim in the reference（keys `atomic_claims` / `supported_claims` / `unsupported_claims`）。主 prompt 不提 completeness。
- **H matched holistic**：rubric 列 correctness、completeness、unsupported detail、robust「ness to style bias, and is told not to decompose」【C80】 the answer explicitly（keys `evidence_summary` / `unsupported_or_missing_points`）。
- **R reference-side atomic**：拆**参考答案**成原子 claim，查候选是否覆盖每一条（`reference_claims` / `covered_claims` / `missing_claims`）。
- **B bidirectional**：两边都拆，返回全部六个 claim list。

判决标签是**三值序数**：one JSON object whose verdict is supported, 「partially_supported, or unsupported. Omis-」【C81】sions count。
数据：TruthfulQA / ASQA / QAMPARI 各 200 问 / 400 行；judge 为 Opus-4.6、GPT-4.1、Gemini Flash Lite（C/H 另加 Sonnet-4.6）。标签是构造的：「We therefore call them construction labels and」【C82】 read agreement with them as agreement with a strict reference-completeness standard。

### 6.2 「优势集中在不完整性检测」——**确认**

- 摘要：Candidate-side decomposition is weak where the label depends 「on completeness: the holistic rubric is more」【C118】「accurate on ASQA and QAMPARI for every」【C119】 judge while using fewer tokens。
- 幅度：「On ASQA its accuracy is 7.25–15.5 points」【C120】「below the holistic rubric for all four judges」【C121】；QAMPARI holistic 高 1.75–7.0 点（p ≤ .016）且便宜 176–293 tokens。TruthfulQA 反号（C ≥ H，Gemini FL 与 Sonnet-4.6 显著）。
- **定位在 partial 行**：ASQA 的 partial 行上 H 减 「candidate-side accuracy is +14.5, +30.5, +33.0, and」【C73】 +19.0 points（四个 judge）。
- 机制（§1 明写）：candidate-side 结构里**没有「候选漏了什么」的清单**，所以 a judge can verify 「every claim an incomplete answer makes and still」【C71】「call it supported.」【C72】

⇒ 「holistic 三个基准里两个胜出、优势集中在不完整性检测」**在「H vs C」这一对上成立**。

### 6.3 ⚠ 但头条被推翻：**赢的不是 holistic，是「枚举缺什么」**

> 「The direction of decomposition matters more」【C69】「than its presence. Candidate-side decomposition is」【C70】 the weakest design on the two completeness-heavy datasets.

**Reference-side 原子分解打败 holistic**：R is the most accu「rate design on ASQA for every judge on which」【C74】 it was run（.975 / .9325 / .8675），That is 12.5, 「21.25, and 17.0 points above holistic and 19.75–」【C75】36.75 points above candidate-side，sign-test p ≤ 1.8×10⁻¹⁵——because the same 「judges on the same inputs separate complete from」【C76】「incomplete answers far better when the decompo-」【C77】sition runs over the reference。代价是比 holistic 多 28–29% token。

⇒ **R8 把这篇读成「holistic 的经验背书」太宽了。** 该文自己的结论是：**分解不是问题，分解的方向才是**；在正确方向上分解的判官**打败** holistic。本仓若用这篇为「保留 holistic 闸门」背书，背书力度要相应下调。

另一条削弱：优势**依赖标签编码的标准**。60 行作者标注子集（标准更松、9 处分歧全是作者把 ASQA 的 construction-partial 判成 supported）上，C 反超 H，原文：the subset therefore shows that the 「preferred design depends on the standard a label」【C78】 encodes。§6.2 的生成答案上 R 只认对 16–38% 的 full 行（过度标记不完整）。

### 6.4 「atomic 判决如何 roll up / 是否二值」——**根本没有 roll up**

> Finally, only the 「verdict field is scored. Scores, confidences, ratio-」【C67】「nales, and claim lists do not enter accuracy.」【C68】

四个设计**都是单次调用**，judge 自己吐一个 JSON，`verdict` 在最前。claim list 是**上下文里的脚手架**，**对分数的贡献恰好为零**。**全文没有任何机械聚合器。** 被打分的标签是三值序数，不是二值。

### 6.5 本仓的 `overall_semantics` 是同一回事吗？**不是**

| | `2603.28005` | 本仓 |
|---|---|---|
| 子判决如何汇总 | **无汇总**；LLM 直出一个 verdict | 确定性 `mean(5 binary) ≥ 0.6` |
| 子判决对分数的影响 | **构造性为零**【C67】【C68】 | 占分数的 4/5 |
| 被打分的标签 | 三值序数 | 二值 |
| holistic 与 atomic 的关系 | **互斥的两套 prompt** | **同一个 prompt 里共存** |
| 谁能推翻谁 | 从不互相推翻 | 四个机械维可以推翻 holistic 维 |

⇒ **本仓的差异化就住在这张表的最后两行。** 这是文献里离本仓最近的头对头，而它把 holistic 与 atomic 当**替代方案**比，从不让一个推翻另一个，并且**完全没有机械聚合器**。

---

## 7. 两个二值参照点：都**没有阈值**

### 7.1 `2505.08775` HealthBench（只读 scoring 一节）

- 逐准则独立二值：To score a model response, 「a model-based grader goes through each rubric criterion independently and」【C95】「determines whether the response meets that criterion. If the criterion is met, full points are given」【C96】; otherwise, no points are given。负准则同理（措辞使「met」时记负分）。
- 归一化：We then get the total points… by summing the point values for criteria met… This 「total is then divided by the maximum possible score to produce the final score for an example」【C97】。（Eq. 1 的分母是 `Σ max(0, p_ij)`，**只数正权准则**——与 Autorubric 的 `W+` 同形。）单例分数**可以为负**。
- 总分：「We calculate a model's overall score on HealthBench by taking the mean of its per-example scores and clipping」【C98】 that mean to the range [0, 1]。
- ⇒ **加权点数归一化 + 跨例均值 clip 到 [0,1]，全程没有任何 pass/fail 阈值。** 规模：48,562 条唯一准则、5,000 例、中位 11 条/例、最多 48 条。
- grader 元评估口径：「M F 1 = 0.5 ∗ (F 1pos + F 1neg )」【C99】，且「M F 1 is computed per criterion and treats both positive and negative outcomes with equal importance」【C100】——即 **per-criterion macro-F1 over met / not-met**，并与「典型医生」基线比（GPT-4.1 落在医生分布的 37.5–88.2 百分位，七个 theme）。

### 7.2 `2603.00077` Autorubric（Eq. 1 与跨准则聚合）

> ⚠ **ticket 说「只读 §3.3 与 Eq. 1」。该文 v3（COLM 2026 camera-ready，60pp）没有 §3.3。** 节号为 1–8，§3 是 *Failure modes in LLM-based evaluation and Autorubric mitigations*，**无编号子节**。**Eq. 1 在 §2**（*Background and framework design*，Weighting and aggregation 段）。本节按内容而非节号认读。

Eq. 1（跨准则）：令 I 为抽象处理后保留的准则、ṽ_i 其有效值，`S = Σ ṽ_i w_i`、`W+ = Σ_{w_i>0} w_i`、`W− = Σ_{w_i<0} |w_i|`，则
```
score = 「clip[0,1] (S/W+ ),」【C86】                 W+ > 0
        「score = clip[0,1] (1 + S/W− ), W+ = 0, W− > 0,」【C87】
        0,                                        W+ = W− = 0
```
⇒ **加权和、clamp 到 [0,1]、无阈值**——与 R8 §9.3 的转述一致，现已升到全文层。ṽ_i 对 MET 为 1、UNMET 为 0。量表面：「Autorubric adopts analytic rubrics」【C122】 as the default；只支持 binary / ordinal / nominal 加显式 0–1 数值映射，且「As a design choice, continuous-valued criteria」【C123】「are intentionally excluded in favor of bounded categorical options with explicit numeric」【C124】 mappings。⇒ **这是一条与 G8 第 3 决策（量表）相关的独立证据：一个 COLM 框架刻意排除连续量表而保留有界分类量表**（但它**没有**比较过二值 vs 序数的偏置，所以不能用来支持或反对「换 0–4」——那条仍靠 R8 §7.1 第 3 条的 `2602.02219` 与 TrustJudge）。

四条投票规则的归属：Ensemble grading via diverse-model panels is supported… with 「majority vote, weighted vote, unanimous, and any-vote aggregation strategies (Listing 4)」【C84】。「The grader makes N × M concurrent calls (N judges, M criteria)」【C85】 with mean inter-judge agreement tracked as a reliability indicator。
⇒ **N 个判官 × M 条准则，投票发生在「同一条准则上的 N 个判官之间」，不是跨准则。** 确认 R8 §9.3 的自我纠正成立。

**四条规则从未头对头比较**：`unanimous` / `any-vote` 在 60 页全文里**只出现两次**——一次在 §2 的框架描述【C84】，一次在代码 listing（`aggregation="weighted" # or "majority", "unanimous", "any"`）。**没有任何实验比较它们。** 默认配置是单判官：footnote 2「Unless otherwise noted, benchmark runs use one judge, option shuffling, majority aggregation」【C94】 for binary criteria, and SKIP for unassessable criteria。

另一条对 R20 探针 c 直接有用：Autorubric **默认逐准则单独调用**——Each criterion is 「evaluated in a separate LLM call to reduce criterion conflation and halo effects」【C83】。即「拆调用」在一个 COLM 论文的框架里**就是默认值**，不是异类。

---

## 8. `2606.19544`：指标纪律与一致性–偏置悖论

规模：21 judges / 9 providers / 3 benchmarks（MT-Bench、JudgeBench、RewardBench）/ 3 protocols / 118 runs / ≈541,000 judgments，明确覆盖 April 2026 frontier。

### 8.1 exact-match 的通缩

- 自陈：judge validation in practice relies on exact-「match agreement, a metric that does not cor-」【C101】「rect for chance and systematically overstates」【C102】 discriminative ability。
- 幅度：Every judge in our study exhibits substantial kappa deflation on MT-Bench: exact 「match overstates chance-corrected agreement by」【C103】「between 33.8 and 41.3 percentage points across」【C104】「the 21 models, with a cohort mean of 38.6 pp」【C105】。（Figure 1 caption 写 33.8–41.2，§4.1 写 33.8–41.3；**原文内部有 0.1pp 的不一致**，引用时写「33.8–41.3（§4.1）」并注明。）
- 可读后果：「The practical consequence is that a judge reporting」【C106】「"85% agreement" on MT-Bench has κ ≈ 0.48」【C107】。
- 协议第 1 条：「Chance-correct. Report Cohen's κ (or Krippen-」【C113】dorff's α) alongside any exact-match figure, and treat 「the chance-corrected metric as the headline reliabil-」【C114】ity number。

### 8.2 ⚠ 为什么本仓**不能**直接搬 33–41pp

原文把幅度归因于**标签边际**，不是判官质量：The cohort-mean ∆κ con「tracts from 38.6 pp on MT-Bench to 23.7 pp on」【C108】 JudgeBench and 10.2 pp on RewardBench, track「ing the shift from balanced ternary to imbalanced」【C109】 binary labels exactly as Cohen's correction predicts。

⇒ 33–41pp 是**平衡三值**标签上的数。本仓判决是**不平衡二值**（维度 MET 率 0.8355–0.9458）⇒ 该预期**小端**（RewardBench 那一侧，~10pp 量级）。
⇒ 与 §4.4 的 kappa paradox **方向相反但必须同时引**：通缩变小，但 κ 本身会因边际接近退化而被构造性压低。**两条合起来才是本仓的纪律**（见 §9.3）。

### 8.3 一致性–偏置悖论

Two 「judges, Qwen 3 8B (test-retest 0.992, position bias」【C110】 0.192) and Gemini 2.5 Flash (0.988, po「sition bias 0.125) generate such paradoxical results」【C111】。机制：Model determinism produces the same response position across replicate runs, which yields near-perfect within-judge agreement, but it violates the requirement that verdicts be position-invariant。结论：test–retest measures the 「stability of a judge's outputs, not the correctness」【C112】 of the underlying decision process. Reporting test-retest alone stands to present a misleading picture of judge reliability。

（摘要称这两个是 *two production-deployed judges*；本文照原文转述，**不自行扩大**为「生产判官普遍如此」。）

⇒ **这条替本仓挡掉最便宜的反驳**：「我们把判官重跑一遍结果一样，所以它是稳的」**不成立**。重测一致性与置换稳健性是两种不同性质，且该文给了两个它们**反向**的实例。

---

## 9. 交付

### 9.1 必答 1 / 六问之一：本仓 128 条漏与 GEAR 的 leakage 是否同一个量

**部分。** 同一个**失效机制**，不同的**量**；而且 GEAR 的那个量在本仓数据上**退化成常数**。

- **同**：机制逐字同构。GEAR 的 FCP = 「a criterion contributes reward or penalty without the rubric-level condition that licenses that contribution」【C3】【C4】【C5】；本仓的漏 = `overall_semantics` 说「答不了用户的问题」（许可条件缺席）时，四个机械维仍把分记足并越过 0.6。GEAR 把归因明确指向 flat scalarization【C6】【C7】——与本仓 `mean ≥ 0.6` 同形。
- **不同**：四处结构差异见 §2.3（单位：边 vs case；被测物：保留效用的幅度 vs 判决翻转的发生率；阈值角色：构造诊断子集 vs 就是判决；局部分数：软概率【C22】【C23】 vs 硬 0/1）。
- **可计算的表达式**（§2.4，已在 1495 条向量上实测，§2.5）：
  ```
  |D| = Σ_{n=1}^{1495} (1 − d[n][overall_semantics]) · Σ_{i∈M} d[n][i]      ⇒  550
  边级漏率 = |D| / (4 × 1495)                                               ⇒  9.20%
  ```
  `M` = 四个机械维。**这是 R20 探针 a 的第二个输出。**
- **但 GEAR 的度量本身不要搬**：`L_FCP^flat ≡ |w_i|/Σw = 0.2`（与数据无关），`P^flat = P^hard = P^gear ≡ 1.0`。**在等权二值准则 + 单二值亲的设置下，GEAR 的 leakage–preservation 取舍是空的，硬门严格支配。**

### 9.2 必答 2：G8 第 1 决策的候选方案表

⚠ **论文管不到的格子写「文献沉默」，不假借权威**（R8 §7.2 的教训）。

| 方案 | 已发表的收益 | 已发表的代价 | 本仓适用性的具体障碍 |
|---|---|---|---|
| **A. flat 等权均值 + 0.6（现状）** | **没找到。** 本票七篇里**没有一篇**为「跨准则均值上的固定阈值」做过辩护。两个二值参照点都反向：HealthBench 加权点数归一化 + clip【C97】【C98】、Autorubric 加权和 clamp【C86】【C87】，**都没有 pass/fail 阈值**。 | GEAR 给失效模式命名并量化：FCP【C3】【C4】【C5】；L_FCP 0.0922 → 0.0032，「a 96.5% relative reduction over」【C13】 Flat；Flat 在 3 benchmark × 2 backbone 全败给 GEAR。 | 已在本仓自己的数据上失效：550/5980 漏边、128/1495 漏 case。且算术上离闸门只差两个可达分值——0.6 与 0.8 是六个可达分值里唯一能让两种读出分歧的两个。 |
| **B. `overall_semantics` 单闸门** | GEAR 的 Hard arm：deterministic gating can eliminate「threshold-defined leakage by construction while」【C20】…⇒ `L_FCP = 0` 是**保证**而非估计。本仓实测更强：`L = 0` **且** `P = 1.0000`（§2.5），严格支配 flat 与软抑制。 | GEAR 的 Hard 在 6/6 格差于 Flat【C11】【C12】，preservation 0.1877 vs 0.2706【C14】【C15】。**⚠ 该代价不转移**：它测的是 post-RL policy 得分、且要求软 `p_i`，本仓两者都没有（§3.3）。 | ① `2603.28005` 显示 holistic 不是一致最优的检测器——reference-side 枚举打败它 12.5–21.25 点【C74】【C75】；单 holistic 闸门继承这个弱点。② 判官拿到 `expected.sql` 后四维行为会变（G8 自注；R8 §2.6 的「零损失」是**对当前 prompt** 条件的）。③ **文献沉默**：没有任何读过的论文测过「单闸门更准」；没人把任何读出对执行真值校准过（T1/R14）。 |
| **C. GEAR 式 typed graph 聚合** | aggregation-only 平均 +6.2（Qwen）/ +7.3（Llama）点；相对增幅「of up to 15.5% over flat aggregation」【C27】（本文定位：HealthBench-500 × Llama，54.1→62.5）；L_FCP 0.0922→0.0032【C13】；图**可自动归纳**【C16】【C17】，91.7% 边精度【C18】；`O(K+|E|)`、4.1 ms/response。 | 必须有图；**类型要对**（「random rewiring fails to im-」【C29】prove over Flat）；retention factor 是人手常数；人审只管精度「rather than the recall of」【C19】 漏掉的依赖；不覆盖 compensatory / alternative / 互斥 / 非单调 / 有环关系【C28】。 | **在本仓退化为方案 B。** 二值 `p_i` + 单二值亲 ⇒ `q̂_i = d_i·(λ 或 1)`，软抑制没有部分分可保留：实测 `P^gear = P^hard = 1.0000`，λ 只是给一个常数漏值做缩放。**K=5 时这张图表达不出闸门表达不了的任何东西。** ⇒ 建议 G8 在 K=5 下**不把 C 当独立方案**。 |
| **D. minority-veto** | TNR 19.2% → 30.9%（TPR 95.5%）【C60】【C61】；max 估计误差 17.6% → 2.8%【C58】；对缺失数据稳健。 | 需要带真值的标定集选 n【C59】；上限仍「fundamentally limited by the」【C66】个体判官偏置；域限制【C65】。 | **不是独立方案。** 它的 veto 是**跨可交换判官、针对同一条断言**；原样搬到跨准则**就是方案 B**（在唯一能 veto 的那一维上 n=1 of 1）。⇒ **G8 的候选表里 B 与 D 重复计数。** 且 n 要真值标定，本仓现在没有。**文献沉默**：跨非可交换准则的 k-of-n 既没被辩护也没被攻击。 |
| **E.（本票补入）完全不设阈值** | **本票读列里唯一有两个独立已发表先例的读出形状**：HealthBench【C96】【C97】【C98】与 Autorubric Eq. 1【C86】【C87】都是「加权归一化分 + clamp，不判 pass/fail」。GEAR 同理（奖励是连续量【C24】）。 | 文献未测其代价（它们本来就不做 pass/fail）。 | 本仓的 `pass_rate` 契约、CI gate、T7 验收面都假定二值判决；换成连续分是**跨票的接口变更**，不止 G8。**本票不替 G8 裁，只指出它被漏掉了。** |

**一条必须和表一起读的事**：A/B/C/D 四个方案里，**没有一个的「哪个更准」被任何读过的论文回答过**。GEAR 测的是 policy 得分、`2603.28005` 测的是对构造标签的 accuracy、`2510.11822` 测的是 generator precision 的估计误差、`2606.00093` 测的是与人标注的一致性。**本仓要的「哪种读出更接近 SQL 的事实」在这七篇里没有可比项**，必须等 T1 的执行真值。

### 9.3 必答 3：R20 探针 b/c 的指标口径定稿

**报什么**（每个「维度 × 条件」单元）：
1. **2×2 列联表 + N**（不只摘要统计量）。理由：摘要统计量在 `FP↔FN` 下不变，表不是（`2606.00093` checklist 第 4 条）。
2. **ϕ / MCC，二者只报一个**。理由：在非退化二值向量上「ρPearson = ρSpearman = τb = ϕ = MCC.」【C46】，「Report only one of Pearson, Spearman, Kendall's」【C47】τb、「ϕ, and MCC on binary verdicts; they are interchangeable」【C48】。⇒ **R20 原规格里「并列报 Agr / κ / EM / 多个相关系数」是伪佐证**，必须删。
3. **Cohen's κ**，且**与两侧 MET 率同报**。
4. **原始 exact-match / Agr 可以报，但不得单独报、不得当头条**。一手依据两条：
   - `2606.19544`（21 judges / ≈541k judgments）：exact-match「match agreement, a metric that does not cor-」【C101】「rect for chance and systematically overstates」【C102】 discriminative ability；MT-Bench 上通缩「between 33.8 and 41.3 percentage points across」【C104】「the 21 models, with a cohort mean of 38.6 pp」【C105】；「"85% agreement" on MT-Bench has κ ≈ 0.48」【C107】。MVVP 第 1 条：「Chance-correct. Report Cohen's κ (or Krippen-」【C113】dorff's α) alongside any exact-match figure 并以 chance-corrected 为「headline reliabil-」【C114】ity number。
   - `2606.00093` checklist 第 10 条【C54】 与池化纪律【C37】【C38】。
5. **⚠ 不要把 33–41pp 当本仓的预期差**。原文归因于标签边际：∆κ「tracts from 38.6 pp on MT-Bench to 23.7 pp on」【C108】 JudgeBench、10.2pp on RewardBench，「ing the shift from balanced ternary to imbalanced」【C109】 binary labels。本仓是不平衡二值 ⇒ 预期**小端**。
6. **⚠ 反向的那条也要一起报**：四个机械维的 MET 率 0.89–0.95，接近退化 ⇒ κ 被构造性压低（「approach 1, pe → 1, and high raw agreement can then coexist」【C50】 with much lower chance-corrected agreement）。**在这四维上读到低 κ 不是判官差的证据。** 因此 MET 率是**必报项**，不是补充。
7. **置换翻转率单独报，不得用 test-retest 代替**。依据：「stability of a judge's outputs, not the correctness」【C112】 of the underlying decision process；两个反向实例【C110】【C111】。
8. **跨阈翻转率**（有多少 attempt 因换条件而跨过 0.6）。**⚠ 这一项没有任何已发表的对照项**——本票七篇都不研究跨准则聚合上的阈值。**它是本仓自定的量，产物里必须标明是自定。**

**池化到哪一级**（这是本票相对 R4 的分工所在）：
- **主口径 = item-level**，N = 1495（或探针子样本）。理由：被测的东西就是那个 **decision rule**【C35】【C36】，而 item-level 是三级里唯一包含 decision rule 的一级，也是 G8 的决策唯一会移动的一级。
- **次口径 = macro**（逐维五张表 + 按声明权重取平均）。理由：「第 k 维被换顺序移动了吗」是逐维问题。退化维**标 NA 不标 0**（checklist 第 5 条；item-level 另需 degenerate 处理与 included/total 分母的声明【C53】）。
- **micro 只作描述性汇总数**，不当头条，**绝不与 item-level 或 macro 的数并排比较**【C37】【C38】。
- **重采样单位 = 整条 attempt**（cluster），不是单条判决。⚠ 区间构造、cluster bootstrap 的具体做法、identification vs sampling 的区分 **归 R4**（同一篇论文，共用票）；本票只定层级。
- **判据 = 点估计 + 区间，不是单一阈值**（沿用 R20 原规格）。

**探针 b 的主对比**（沿用 R20 2026-09-11 的修订）：**五维同调用 vs 逐维单调用**，而非多个排列互比；在 item-level 报，附跨阈翻转率。

### 9.4 必答 4：探针 c 的 `5N` 成本估算是否成立

**成立。而且那条 prefix-caching 次线性的说法在原文里不存在——先前 subagent 标的 grade C 标得对，现在应改为「已证伪」。**

Autorubric 全文（60pp）里与「caching + 成本」有关的只有一处，在 §3 *Criterion conflation* 段：
> Autorubric evaluates each 「criterion in a separate LLM call, with concurrent execution and prompt caching offsetting」【C88】「evaluation throughput and cost respectively」【C89】.

这是**一句裸断言**：无测量、无模型、无次线性论证、无数字、无引文。**全文没有第二处把 caching 与成本放在一起。**

而且**实现的机制根本不是 prefix caching**：
> 「For production deployment, Autorubric provides response caching for reproducibility」【C90】「and cost control (keyed on the model, prompts, response schema, and standard sampling」【C91】 and thinking parameters)…

**以整个 prompt 为 key 的 exact-match response cache**，构造上**不可能**在「五条不同准则的五个不同 prompt」之间去重——同一条 attempt 的五次调用命中率恒为 0。它只在**重跑同一次调用**时省钱。

论文自己的成本账是**逐准则线性**的：
- 「The total cost for evaluating all three systems across all 65 questions with both judges is」【C92】 $130.06（5,586 criterion-level judgments）——按**criterion-level judgment** 计价。
- 跨系统差异的解释是响应长度（每条准则调用都要重发整个响应）。
- 判官集成：「and the cross-family panel costs the sum of all three judges' inference」【C93】——明写是**和**。
- 默认单判官【C94】。

⇒ **`5N` 作为调用数估计成立。** token 上也约为 5×，且可能略差：每次隔离调用都要重发共享上下文（question + schema + `generated_sql`），输入 token ≈ 5×共享 + Σ逐准则，对比联合调用的 1×共享 + Σ逐准则。
⇒ **⚠ 本仓的 provider 是否提供能吃掉那部分重复的 prefix cache，是本仓/provider 的问题，七篇论文里没有一篇回答它——不要引 Autorubric 为此背书。**
⇒ 一条反向的真实数据点：GEAR 的 judge 为效率把 at most 「four rubric items. This batching is used only for」【C26】 efficiency 塞进一次请求。这说明**成本压力是真的**，不说明拆调用免费。
⇒ 一条支持拆调用的框架性依据（质量侧，非成本侧）：Autorubric **默认**就是逐准则单独调用，Each criterion is「evaluated in a separate LLM call to reduce criterion conflation and halo effects」【C83】。
⇒ **未读**：`2606.29920`（RuVerBench）的 batching accuracy/efficiency 取舍不在本票读列（ticket 未列入待认读表）。**洞 B 的「质量侧是否还开着」仍未结案**，需另票。

### 9.5 必答 5 / 六问之五：veto 该在哪一层

**不转移。** 四条理由在 §5.3：可交换性（14 个判官估计同一个隐事实 vs 5 个维度是 5 个不同事实；本仓 0.9984 / 0.0325 的条件概率不是可交换评分者的画像）、方向（它的 veto 让少数说「无效」；本仓的病是多数说「有效」压掉唯一说无效的那一维）、标定（n 要真值集【C59】，本仓没有）、域【C65】。
**且转写的结果就是单闸门**，所以 G8 的候选表 B 与 D 重复计数。
class imbalance 它**确实**处理了【C62】【C63】。

### 9.6 必答 5：一句话差异化声明

R8 的版本：「无人测过单 prompt 内 holistic 准则被同场机械子准则投票推翻，更无人在生产落盘判决上测过。」

**实质确认，但需两处修补**：① 「holistic vs 机械」说轻了——`2603.28005` 显示真正的轴是**设计枚举了什么**（本仓四维枚举 SQL 表面结构，第五维枚举「用户的问题被答到了吗」）；② 该声明应点名**那个机械聚合器**，因为没有先例的是**它**，不是 holistic 准则本身。

**改写后**：

> 参照文献里的每一种读出，要么**根本没有阈值**（HealthBench【C97】【C98】、Autorubric【C86】【C87】、GEAR 的连续奖励【C24】），要么**阈值只用来构造诊断子集而非判决**（GEAR【C8】【C9】），要么**投票发生在同一条准则上的可交换判官之间**（minority-veto【C57】、Autorubric 的 panel【C84】【C85】），要么把 holistic 与 atomic 当**互斥的两套 prompt** 比、**完全没有机械聚合器**（`2603.28005`【C67】【C68】）。**没有人把 holistic 准则与机械子准则放进同一个判官 prompt，再用一条固定算术规则让子准则有能力推翻 holistic 那一条；更没有人在生产落盘的逐准则判决上量过由此产生的漏。** 本仓的 128/1495 条漏 case 与 550/5980 条漏边就是那个测量；**GEAR 的 `FCP` 是这个失效的现成名字，但它的 `L_FCP` 在二值准则上退化成常数，所以那个量也只能是本仓自己的。**

### 9.7 六问中剩下的三问，各一句

- **问 2（图人写还是归纳）**：**LLM 归纳**（Qwen3-8B 作 graph annotation model【C16】，只看 query + rubric【C17】，人审 180 边只管精度不管召回【C18】【C19】）⇒ **不能说文献要求人写**；但 role 分类法与 retention 映射在 GEAR 里全是人的设计，且本仓 K=5 候选边只有 4 条、归纳无增益 ⇒ **G8 仍该裁它，理由是 K 太小（本仓自定），不是论文权威**（§3.2）。
- **问 3（gating 的代价）**：已发表代价真实（6/6 格差于 Flat【C11】【C12】、preservation 0.1877 vs 0.2706【C14】【C15】），**但不转移**——层级是 RL 策略改进而非 pass/fail 报告【C24】【C25】，且需要软 `p_i`【C22】【C23】；本仓二值 ⇒ 实测硬门 `L=0 且 P=1.0000`，严格支配（§2.5、§3.3）。
- **问 4（该报什么）**：三级定义逐字在 §4.1，「decision rule」只属 item-level；**ticket 的「仅换池化口径」是错的**（四个旋钮，§4.2，池化单独只把 micro-κ 0.040 挪到 macro-κ 0.009）；序数限制已核（Hashemi 1–4【C49】，二值化于 ≥3）且**更重的限制是该判官本身约等于随机一致**【C51】【C52】；本仓落地口径在 §9.3。
- **问 6（holistic 看见了什么）**：优势与「不完整性检测」的定位**确认**【C118】【C119】【C120】【C121】【C73】，机制是「候选侧分解没有漏项清单」【C71】【C72】；**但头条被推翻**——reference-side 分解打败 holistic 12.5–21.25 点【C74】【C75】，「分解的方向比有无分解更重要」【C69】【C70】；**atomic 判决根本不 roll up**（只有 `verdict` 进分数【C67】【C68】），标签是三值序数【C81】；⇒ 本仓的 `overall_semantics` **不是**同一机制（§6.5）。

---

## 10. 对本票题面与前序产物的修正清单

本票证伪了自己题面与前序产物的 8 处前提。按严重性排序：

1. **`2606.00093` 的 0.551→0.899 不是「仅换池化口径」，是四个协议旋钮的交叉**（verdict extraction × MET 阈值 ≥2/≥3/≥4 × abstention rule × aggregation level = 24 个协议）【C41】【C42】【C43】。**池化单独的效应是 micro-κ 0.040 vs macro-κ 0.009**【C39】【C40】，两者都贴零。⇒ ticket 必答 4 的题面、R8 §9.2、lit-gap §4 第 4 条都要改。
2. **GEAR 的局部分数是软概率，不是二值。** R8 补记记作「全程二值」【C22】【C23】——隐事件是 Bernoulli，观测分数不是。⇒ 这一条是 §9.1 判「部分」而非「是」的核心依据，也是 §3.3 判「gating 代价不转移」的核心依据。
3. **GEAR 的 gating 代价在本仓数据上不存在。** 实测硬门 `L_FCP = 0` 且 `P = 1.0000`，严格支配 flat 与软抑制（§2.5）。⇒ **R8 补记说的「连 gating 的代价也测了，正是对改成单维闸门的第一个反驳」在本仓不成立。** G8 预期要挡的那一记反驳是空的。
4. **`2603.28005` 的头条不是「holistic 胜」。** reference-side 原子分解在 ASQA 上打败 holistic 12.5 / 21.25 / 17.0 点【C74】【C75】，原文头条是「分解的方向比有无分解更重要」【C69】【C70】。「三胜二」只在「H vs C」这一对上为真。⇒ R8 §9.3 把它读成「本仓论点的经验背书」**背书力度要下调**。
5. **Autorubric 没有 §3.3。** 节号 1–8，§3 无编号子节，**Eq. 1 在 §2**。⇒ ticket 待认读表第 5 行的指路要改。
6. **Autorubric 的 prefix-caching 次线性说法不存在。** 只有一句裸断言【C88】【C89】，且实现的是**以整 prompt 为 key 的 response cache**【C90】【C91】，跨准则命中率恒为 0；论文自己的成本账逐准则线性【C92】【C93】。⇒ 探针 c 的 `5N` **成立**；R20 里「`5N` 未定论」这条可以结掉（成本侧）。
7. **`2510.11822` 的 minority-veto 转写到跨准则就是单闸门。** ⇒ G8 候选表把 B 与 D 并列是**重复计数**（§5.3、§9.2）。
8. **「96.5%」与「最多 15.5%」的条件被 ticket 问成了并列**：96.5% 是 Table 2 的**单一 pooled 数字**【C13】，不逐 benchmark；15.5% 是**相对**增幅，本文在 Table 1 上自行定位到 aggregation-only × HealthBench-500 × Llama-3.1-8B（54.1→62.5，`8.4/54.1 = 15.53%`）——**这个定位是本文的算术，原文未明写**。三个 benchmark 与两个 backbone 分别为 HealthBench-500 / WritingBench / PLawBench【C116】 与 Qwen2.5-7B-Instruct / Llama-3.1-8B-Instruct【C115】。

**另记一条原文内部的不一致**（不是本仓的错）：`2606.19544` 的 Figure 1 caption 写 kappa deflation 为 33.8–41.2pp，§4.1 写 33.8–41.3pp。引用时取 §4.1 并注明。

---

## 11. 未能验证的、与超出本票范围的

**未能验证**（本票读列未覆盖，不得当已知）：
- `2606.29920`（RuVerBench）的 batched verification accuracy/efficiency 取舍——ticket 的待认读表未列入，**洞 B 的质量侧仍未结案**（成本侧已由 §9.4 结掉）。
- GEAR 的 Appendix J.1 完整 graph-annotation prompt 逐字内容（本票只读到「prompts are provided in Appendix J.1」与 §A.1–A.6 的流程描述，未逐字抄 prompt 本体）。
- GEAR 的 Appendix B.2 exact-inference agreement 的具体数值（只核到「We evaluate exact-inference agreement on small graphs in Appendix B.2」）。
- `2603.28005` 的 Appendix F/G 完整 prompt 与逐例记录。
- HealthBench 的 Appendix D 子集打分细节（只读了 Eq. 1–3 的结构与 §scoring 正文，按 ticket「只读 scoring 一节」执行）。
- 本仓 provider 是否支持 prefix caching（§9.4）——**不是文献问题**。

**明确不在本票范围**：做决策（G8）、跑探针（R20）、实现（T7）、统计区间与 cluster bootstrap 构造（R4，同一篇 `2606.00093`）、参考答案与 judge artifact（R8c / T1）、逐维对执行真值的校准（R14）。

**本票的引证账目**：引文 **121 条**，全部全文层，**121/121 机械回核通过**；回核中抓到本文作者自己 1 处行号错位（C46，已改）；**臆造 ID 0 处**；**摘要层证据进入产物 0 处**。
