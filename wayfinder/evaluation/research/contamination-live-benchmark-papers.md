# R5 — 污染、语义近邻与 live benchmark：一手认读

日期：2026-10-05  ·  票：[R5 — 污染、语义近邻与 live benchmark 论文认读](../tickets/R5-contamination-papers.md)  ·  分支：`research/R5-contamination-papers`  ·  侦察：[`g10-2026-followup-papers.md`](g10-2026-followup-papers.md)

本文回答 R5 的问题，并为 [G5 — Dynamic case pipeline](../tickets/G5-dynamic-case-pipeline.md) 与 [R17 — Contamination audit](../tickets/R17-contamination-audit.md) 提供可执行约束。**来源事实**逐条带 `arXiv:id` 与引用编号（形如【C1】）；**设计推论**是本仓的选择，不冒充论文结论。侦察笔记 `g10-2026-followup-papers.md` 对这批论文的刻画在本轮被当作**待核传闻**，§2.4 与 §8 列出它被证伪或需修正的地方。

## 认读与复核方法

全部 8 篇用 `curl -sSL https://arxiv.org/pdf/<id>` 抓取后 `pdftotext` 文本化，留在 `.tmp/r5/`（`.gitignore:55` 已忽略）。双语料：`-layout`（保表格）与无参数（保双栏阅读顺序；2602.12413 / 2602.16747 / 2605.30504 / 2608.07914 / 2608.12652 的句子跨栏，`-layout` 会把一句切成两半，故这几篇的散文引用取自 `<id>.raw.txt`）。重建脚本 `.tmp/r5/regen.sh`。

引用清单 `.tmp/r5/citations.jsonl`，**156 行**，由 `.tmp/r5/build_manifest.py` 生成（脚本只持有待查字符串，行号由脚本定位后写入，故"引文是该行逐字子串"由构造保证而非转录保证），并由独立脚本 `.tmp/r5/verify_citations.py` 复核：`156 verified, 0 failed, 156 unique ids`。

**身份未重新推导。** 按票面要求，arXiv metadata API 本轮一次未查；标题/作者/版本一律沿用 orchestrator 的已核表。但**全文里自带的 venue 声明属于全文事实**，§1 据此报出两处与票面表格冲突的发现。

## 1. 身份核验、实读范围与证据等级

| arXiv | ver / dates | Title（沿用已核表） | Authors | 本轮实读 | 全文自述 venue | 证据等级 |
|---|---|---|---|---|---|---|
| 2608.29463 | v1, 2026-08-29 | Benchmark Contamination: A Taxonomy Organized by Defeated Mitigation | Johanna Angulo, Víctor Yeste, Hector Espinos-Morato | Abstract、§1、§2 positioning、**§3 全部**（Table 2、Fig 1、§3.1、§3.2、§3.2.1）、§4、§5、§6 | `Preprint.`【C26】 | **低**（preprint，无 venue；经验部分是 2 名编码者 × 29 文档的编码信度研究） |
| 2602.12413 | v1, 2026-02-12 | Soft Contamination Means Benchmarks Test Shallow Generalization | Ari Spiesberger, Juan J. Vazquez, Nicky Pochinkov, Tomáš Gavenčiak +3 | Abstract、§1、§2、§3、**§4 全部**（4.1–4.4，Table 2/3/4/5）、§5 Limitations | `Preprint.`（无 venue 声明） | **中低**（preprint；但有真实开放语料 Olmo3 + 真实 finetune 干预 + 生态学有效剂量臂） |
| 2604.01904 | v3, 2026-04-02 → 2026-06-16 | Combating Data Laundering in LLM Training | Muxing Li, Zesheng Ye, Sharon Li, Feng Liu | Abstract、§1、§3（威胁模型 + Alg 1）、§5.1–5.2（Table 1/2/3）、Appendix C 威胁模型、Appendix I 负控、Appendix P Limitation | **"accepted at the ICLR 2026 Workshop on Navigating and Addressing Data Problems for Foundation Models"**【C50】 | **中低**（workshop 已接受；但估计量是版权/MIA，不是 benchmark 污染 — 见 §2.3） |
| 2608.07914 | v1, 2026-08-08 | When Is Benchmark Contamination Detectable? Information Limits and Power-Calibrated Audits | Ibne Farabi Shihab, Sanjeda Akter, Anuj Sharma | Abstract、§1、§2（含 Assumption 1、§2.2）、§3（Thm 3、Cor 4、Prop 5、eq 6/7）、§4（4.1–4.4）、§5、**§6 全部**、§7、§8 + Limitations、Appendix F 全部 gates、Table 11/12/13 | 无 venue 声明（提到 "the venue's Responsible NLP checklist"，即投稿中） | **中**（preprint；但理论是自洽的二阶矩界，且**预注册式地报出自己的失败**，自我否证程度高） |
| 2602.16747 | v1, 2026-02-18 | LiveClin: A Live Clinical Benchmark without Leakage（PDF 标题行逐字一致【E1】） | Xidong Wang, Shuqi Guo, Yue Shen, Junying Chen +5 | Abstract、§1、§2 pilot study、§3、§5.4 可持续性/污染控制/偏差、§6、Appendix C pilot 方法学 | **"Published as a conference paper at ICLR 2026"**【E1b】 | **高（venue）/ 低（污染证据）** — venue 已接受，但其污染数字是混杂量，见 §5.1 |
| 2605.15188 | v1, 2026-05-14 | FutureSim: Replaying World Events to Evaluate Adaptive Agents | Shashwat Goel, Nikhil Chandak, Arvindh Arun, Ameya Prabhu +4 | Abstract、§1、**§3 全部**、§4、§5.1–5.3、Appendix B.2 泄漏缓解、B.3 sandbox、B.4 成本、B.5 CCNews + Brave 审计 | `Preprint. Under review.` | **中**（preprint；但 §B.5 的泄漏事件是实测审计记录，不是断言） |
| 2608.12652 | v2, 2026-08-12 → 2026-08-16 | Excess Separability: Nuisance-Controlled Residual-Stream Probing for Benchmark Contamination Detection | Florian Braun（单作者） | Abstract（两栏合读）、§1、§2.1–2.2、**§3.2 Requirement E 全部**、§3.3、§6.2–6.4、§8.4、**§8.5**、§10.5、Conclusion、Table 8 | 无 venue 声明 | **低（venue）/ 高（对本票的决策价值）** — 单作者 preprint，但它是本批唯一把自己的 detector 判为不可用的论文 |
| 2605.30504 | v2, 2026-05-28 → 2026-08-28 | Auditing LLM Benchmarks with Item Response Theory | Sander Land, Daniel M. Bikel | Abstract、§1、§3.1 panel、§3.2 4PL、§3.x reward-model 异常、§4 Discussion、Limitations、Appendix B.3 panel 规模、B.4 | EMNLP 2026（已核表；全文内未自述，但已核表权威） | **高**（唯一主会已接受；但其估计量是**标签错误**，污染只是副产品筛查信号 — 见 §3.4） |

### 1.1 对票面表格的两处修正（**与票面前提冲突**）

票面说"只有 `2605.30504` 有已接受 venue……这个 effort 在意证据等级"。全文认读发现**这不成立**，两处：

1. **`2602.16747` LiveClin 是 ICLR 2026 会议论文。** PDF 每一页的 running header 就是 `Published as a conference paper at ICLR 2026`（第 1 行即是【E1b】，全文 31 处）。它与 `2605.30504` 同属"主会已接受"等级。
2. **`2604.01904` 是 ICLR 2026 Workshop 已接受。** 首页脚注原文：`This work was accepted at the ICLR 2026 Workshop on Navigating and Ad-`【C50】（续行 `dressing Data Problems for Foundation Models`）。workshop 低于主会，但不是"无 venue"。

修正后的 venue 分布是：主会 2 篇（2602.16747、2605.30504），workshop 1 篇（2604.01904），无 venue 5 篇。这不改变本文的任何技术结论，但**改变了证据权重的分配**：本票里关于 live benchmark 运营的最强 venue 支持来自 LiveClin，而关于可检测性极限的最强技术内容来自一篇无 venue 的 preprint（2608.07914）。后者的采信理由必须是它的论证结构与自否证，不能是 venue。

## 2. 污染分类：按被击穿的缓解措施组织

### 2.1 来源事实 — `2608.29463` 的五型表

该文的组织原则是**按每一型击穿哪种缓解措施分类**，而非按暴露严重度或重叠形态【C1】。两条奠基主张：`a held-out private test set mitigates solely Type 1,`【C3】；以及 `whereas Types 1–4 represent passive data leakage into the model, Type 5 constitutes active data`【C4】（续行 `acquisition by the model`）。摘要层面：`Holding out a private test set closes the first of these alone.`【C2】

| 型 | 泄漏单元 | 击穿的缓解措施（原文） | 本文定位 |
|---|---|---|---|
| **1 Direct** | the item | — "the one holding out fixes" | `Type 1 — Direct. Benchmark items and their labels exist in the model’s pretraining or post-training`【C5】 corpus；`This is the classic`【C6】 scenario n-gram overlap metrics target。黑盒模型上无法证伪，诚实填法常为 `unknown` |
| **2 Derivative** | the source document | **Held-out private test sets** | `Type 2 — Derivative. The benchmark never leaked, but its source material is in the training`【C7】 corpus。决定性后果：`Holding out a benchmark built on public evidence is ineffective; it is contaminated`【C8】 **upon creation** |
| **3 Temporal** | the resolved outcome | **Overlap checks of every kind** | `Type 3 — Temporal. The model’s training cutoff postdates the tested phenomenon, reducing`【C9】 reasoning to recall。`Leakage occurs at the factual rather than lexical level: the answer is already`【C10】 internalized as parametric world knowledge |
| **4 Distributional** | the pattern | **All overlap-based methods** | `Type 4 — Distributional. The items are new and held out, but their structural pattern is so well`【C11】 represented。关键性质：`Types 1–3 inflate the score; Type 4 changes what the score measures and leaves no inflation`【C12】 signal |
| **5 Acquired** | the evaluation run | **5a/5b 击穿 held-out sets、decontamination、cutoff reasoning；5c 击穿 network isolation 本身** | `Definition. The model acquires the ground-truth answers during the evaluation through retrieval, tool`【C15】 use, filesystem access, or …breaching the isolation boundaries |

Type 5 的三级与 Type 4 行的出处（`4 Distributional The pattern`【C13】 / `All overlap-based methods`）均在 Table 2。Type 5 的报告后果是本文对本仓最直接的一条：`1. Type 5 must be certified per run, not per benchmark. Benchmark authors cannot preemptively`【C16】 guarantee immunity。证据位置：`At Levels 5a and 5b the evidence sits in the execution trace:`【C25】；5c 则 trace 不足。并且 `Dispositional controls, such as system prompts telling the model not to seek answers, are excluded: a`【C17】 certification cannot rest on the compliance of the system under test。

披露表的四字段（strata / elicitation budget / contamination controls / regeneration）用 `Reporters assign controlled, not_controlled, unknown, or n/a per type.`【C18】；`unknown` 的存在理由是 `Permitting unknown separates a`【C19】 question that cannot be answered from one that was never asked。

该文自报的两条限制必须同时引用：`Scope. The protocol is a reporting standard, not a validity guarantee; construct validity remains a`【C20】 separate prerequisite — 即它**记录声称的缓解，不检测污染**。以及经验部分极弱：`Per-variable κ runs from 0.00 (F3 t2`【C22】 to 0.35，对照单编码者 test–retest 上限 0.84；现状披露率 `Only 5% address direct contamination and 5% acquired contamination;`【C21】 none addresses all five types。

边界自述两条，对本仓有直接后果：`Taxonomy boundaries. Post-training, instruction-tuning, and distillation leakage are subsumed into`【C24】 Types 1 and 2（即 **distillation 不是独立一型**）；以及 `The Type 5a/Type 1 boundary blurs when the`【C23】 evaluation container is itself the artifact。

### 2.2 与 `2602.12413`（soft contamination）对账

**一致处。** 分类法把 soft contamination 明确归入 Type 4，并直接引这篇：`Spiesberger et al., 2026], which directly motivates our Type 4.`【C14】。soft contamination 自己的定义链也吻合：`Typical ‘decontamination’ filters use`【C30】 n-gram matching which fail to detect 'semantic' duplicates；`relevant test set. A semantic duplicate of test data is an example in the training corpus which has the same meaning (in`【C31】 some sense)；`We call generalization shallow when it’s limited`【C32】 to within-distribution generalization and generalization across semantic duplicates。

**冲突 ①：同词不同义 — "distributional" vs "semantic"。** 分类法的 Type 4 单元是 **the pattern / template**（"the item is new, but the template is not"），泄漏对象是分布；而 soft contamination 的单元是 **semantic duplicate**，即训练语料里真有一条与测试项同义的具体样本。后者在分类法的轴上其实横跨 **Type 2（源文档在语料里）与 Type 4（模式在语料里）**，分类法把它整体收进 Type 4 是一个**压缩**。实践后果不是术语洁癖：Type 2 的补救是"不要用公开可得证据建 benchmark"，Type 4 的补救是"报告 hard-variant 的 delta"，两者操作完全不同。

**冲突 ②：Type 4 "leaves no inflation signal" 与 soft contamination 实测到 inflation。** 分类法说 Type 4 `changes what the score measures and leaves no inflation signal`【C12】。但 soft contamination 实测的正是分数抬升：在生态学有效剂量下 MuSR seen 比干净模型高 12%、unseen 高 5.6%（§4.4）。两者可以同时为真（分类法说的是"没有可被 overlap 检测到的 inflation 信号"，不是"没有 inflation"），但**照字面读会得出错误的实验设计结论**（"Type 4 不用测 lift"）。本票采信 soft contamination 的实测：**lift 可测，只是不能用 overlap 去测**。

**soft contamination 自己最重要的三条实测，其中两条削弱侦察笔记的刻画：**

- 普遍率极高但**是检索深度的函数**：`and 77.5% of problems have at least one semantic duplicate`【C33】 in their top 100 cosine similarity matches（MBPP 100%）；ZebraLogic `cates for at least 49.5% of dataset tasks.`【C41】。但 `example, for CodeForces this statistic drops to 28.4% if we`【C34】 only sample the single top cosine similarity match。**"污染率"不是语料的固有属性，是 (语料, 检索深度, 标注器) 三元组的函数。** 报任何污染率必须同时报检索深度。
- **余弦近邻本身不是污染信号。** `cates (an increase of 20% on both seen and unseen`【C35】 items), while finetuning on close embedding neighbors `has no effect. Finetuning on one benchmark does not`【C36】 typically improve performance on related benchmarks。即：被高余弦相似度选出但**不是**语义重复的近邻，训了**不涨分**；且 `Figure 2 that a substantial portion of the very high (over 0.8)`【C42】 cosine similarity matches is a semantic duplicate — 只有 >0.8 那一段里才有相当比例是真重复。**后果：embedding 距离只能当候选召回器，不能当曝露代理变量。**
- **"heldout 只测 shallow generalization" 在生态学剂量下只有混合证据。** 论文自己分开两档：`quantities of contamination is strong, while the evidence for`【C37】 within-benchmark generalization from realistic quantities `of contamination is mixed. We note that this is the first`【C38】 ecologically valid demonstration。且 Qwen3 复现里干净模型的增益 `are particularly strong on the random benchmark-subset we`【C40】 use as the 'unseen' subset — 一个直接打击 unseen-transfer 读法的混杂。此外论文承认假阴偏差：`in Section 4.2 are likey to have a high false negative rate. Another downward bias is the relative absence of rephrasings in`【C39】 Dolma。

### 2.3 与 `2604.01904`（data laundering）对账 — **估计量不同，是最大的一处同词不同义**

来源事实：威胁模型是 `regime becomes brittle under data laundering, where the target LLM is trained on semantics-`【C51】 preserving but stylistically or structurally transformed surrogates；`We refer to this evasion mechanism as data laundering. Under data laundering, the target model may`【C52】 memorize the transformed surrogates rather than the original texts；且 `rights owners usually do not know whether laundering occurred, what transformation was used, or what`【C53】 surrogate texts appeared in training。精确恢复不可行：`query the target model with them. Under black-box access, however, exact recovery is infeasible because`【C54】 the laundering transformation is hidden and the space of semantics-preserving rewrites is too large。SDR 把搜索空间压到 23 个语言 register：`search over 23 registers (collected in a set 𝑅) that cover major communicative forms (Henriksson et al.,`【C62】 2024)。

**冲突 ③：这篇的估计量是"未授权训练数据检测"（版权 / MIA），不是"benchmark 污染"。** 它的审计方是 rights holder，输入是 `𝐷pro`（专有原件）+ `𝐷held`（保证不在训练集的参考语料）+ 目标模型查询；`and black-box queries to 𝑀𝑡 . The owner does not observe 𝐷train , the laundered corpus, or the provider’s`【C55】 preprocessing pipeline。分类法里没有"laundering"这一型 —— 它被 `Taxonomy boundaries`【C24】 一句收进 Type 1/2。**侦察笔记把它当成"黑盒事后污染审计"的分流是过度外推**：它审计的是"我的语料有没有被用"，不是"这个 benchmark 的分数有没有被污染抬高"。两者在本仓的用途完全不同（见 §4）。

**三条必须一起引的 calibration：**

- **laundering 把标准 detector 打到接近随机。** 原件上 `Loss (Yeom et al., 2018)      1.000   0.539   1.000   0.565    1.000   0.040`【C56】 —— AUC 1.000（原件）对 0.539（洗过）。
- **SDR 只是部分恢复，远未回到原水平。** 最好一格 `Loss+SDR     76.6%      72.6%      26.2%   75.5%     75.5%     22.9%`【C57】（Wikipedia / Pythia-6.9B，inside registers）；换语料就掉：`Loss+SDR   75.5% 75.5%      22.9%     62.7% 59.6%        8.7%       67.3% 64.2%    13.0%`【C58】（Wikipedia / HackerNews / C4）。即 AUC 从 1.000 → 0.539 → 最好 0.766，HackerNews 只到 0.627；TPR@5% 最高 ~0.30。**"restores detection signals" 的字面含义是"从随机恢复到弱"，不是"恢复到可用"。**
- **访问要求比"黑盒 API"强。** Alg 1 第 12 行要 `Average next token confidence of`【C59】 目标模型 —— 需要 token 级 logprob，不是纯文本输出。自报限制：`A key limitation of our current approach is that the register taxonomy it relies on is too coarse-grained`【C60】 to locate goals accurately。
- **有负控，值得照抄。** 当数据实际不在训练集时 `model’s training data. In this setting, SDR should fail to find a prompt that improves detection (i.e., AUC`【C61】 and ASR should be near 0.5)，Appendix I 验证。

### 2.4 冲突汇总（点名）

| # | 冲突 | 谁对谁 | 本票裁定 |
|---|---|---|---|
| ① | "distributional" 单元 = pattern，但 semantic duplicate 单元 = 具体样本，横跨 Type 2/4 | 2608.29463 压缩了 2602.12413 | 本仓 lineage **分开记** `derivation`（Type 2 轴）与 `template_family`（Type 4 轴），不用单一 `contamination_type` 字段 |
| ② | Type 4 "leaves no inflation signal" vs 实测 12% / 5.6% lift | 字面冲突 | 采信实测；把 C12 读作"overlap 检不到"，R17 必须测 lift |
| ③ | laundering 的估计量是版权/MIA，不是 benchmark 污染 | 侦察笔记过度外推 | laundering 只进 §4 的 lineage schema 要求，**不进 R17 的 detector 臂** |
| ④ | "污染率"被当成固有属性 | 2602.12413 自己给出 77.5% vs 28.4% | 任何污染率必须带检索深度 + 标注器；本仓不报无限定的污染率 |
| ⑤ | embedding 近邻 = 污染代理 | 2602.12413 实测近邻训了不涨分 | embedding 只作召回器；分桶必须用**人/LLM 判定的语义重复标签**，不是余弦阈值 |
| ⑥ | "heldout 只测 shallow generalization" 被当作已确立 | 论文自述 `mixed`【C38】 + Qwen3 混杂【C40】 | 在本仓是**待测假设**，不是已知事实。这正是 R17 该测的东西（§6） |

## 3. 可检测性状态机

### 3.1 来源事实 — `2608.07914`：何时**可证**不可检测

问题设定：`Behavioral contamination detectors can return`【C70】 "no evidence" either because a benchmark is clean or because the audit has little power。混合模型 `Qα = (1 − α)P0 + αP1`，其假设被明示为实质性的：`This assumption is substantive—it requires`【C71】 matched clean controls and rules out unmodeled spillover。

**可证不可检测（§2.2）：** `There is no nontrivial guarantee that depends only`【C72】 on (α, m)：令 `P1 = P0` 则干净与污染的 transcript 分布同一，`1 for every test), representing exposure that leaves`【C73】 no trace in the chosen access channel（原文 `am + bm = 1 for every test`）。这是**第一个 undecidable 状态**：曝露在所选访问通道上不留痕迹时，任何检验的 type-I + type-II 误差之和恒为 1。

**渐近零功效边界（Corollary 4）：** 当 `α_m ρ_m √m → 0` 时 `has lim supm πm (αm ) ≤ τ . Thus it has no asymp-`【C74】 totic power beyond its false-positive rate；非平凡功效的必要阶是 `α_m = Ω(1/(ρ_m √m))`。

**可操作的规划式（eq. 7）：** `At τ = .05 and 80% power, z.95 + z.80 = 2.486.`【C100】，于是 `αmin (f, m) ≈ √ .`【C101】（即 `α_min(f,m) ≈ 2.486 / (e_f √m)`）。其数值表：`Table 11: Approximate smallest detectable α at size`【C75】 .05 and 80% power；`Entries above one mean that even full exposure is un-`【C76】 derpowered under the local approximation。表体两行：`0.10          >1     >1     .786      .352`【C77】、`0.25         .995   .445    .315      .141`【C78】（列为 m = 100 / 500 / 1,000 / 5,000）。

**实测的 mechanism 衰减：** `the mechanism decay (0.741/0.343/0.150`【C85】 exact/surface/answer-only)；`Exact injection      0.741        0.000            0.951`【C93】（Table 13：点 efficacy 0.741，而方差自适应 95% 下界为 **0.000**）。answer-only 臂的表观信号被判为伪：`covering zero—its apparent raw efficacy (0.19) is`【C98】 `matched by the clean continuation (baseline drift,`【C99】 the artifact the paired design exists to catch)。

**四道 validity gate（Appendix F，强制）：** `part of the audit contract: blind separation (a text-`【C79】 only classifier must not separate the pools)、clean-channel transport、channel stability、以及 `score laws must be stable across α), and the independence unit (effective m counts source-item`【C80】 `clusters, never near-duplicates or repeated decodes).`【C81】

**该文自己的失败（必须一起报）：** `the Gaussian budget clearly fails in 9/9 channels`【C95】；证书 `free certificate, which never fires at m=512 (zero`【C82】 false, zero nonzero) —— `A nonzero α is trustworthy; a zero`【C83】 `is uninformative—at audit sizes the certificate is a`【C84】 null instrument；且 n=200 时 `simultaneous Hoeffding slack exceeds the mean gap, so the certified lower bound on ρ is vacuous even where the`【C94】 point efficacy is clearly nonzero。其六通道审计全体未过 blind gate：`every checkpoint-free Evaluation A chan-`【C89】 `nel fails blind separation (text-only AUC 0.95—`【C90】 content-confounded separability)。全部结果是 gray-box：`and cross-fitted-combination probes are specified`【C91】 but not run；`are gray-box.`【C92】（即 black-box 探针"已规定、未运行"）。

**决定本仓命运的两条 scope：** 证书要求 `and a score learned on separate data; using the audit`【C86】 set to tune the score invalidates its coverage，而 `controls are generally unavailable to an external`【C87】 `auditor of a closed model, so neither efficacy nor`【C88】 the exposed fraction is then identified without extra assumptions。以及通道边界：下界 `not apply to direct corpus search, cryptographic`【C97】 provenance, or support-separated watermark evidence。最终读法：`its efficacy, budget, and gate values attached—and`【C96】 the prevalence certificate, though valid, is vacuous at audit scale。

### 3.2 来源事实 — `2608.12652`：detector 自身的效度崩塌

Requirement E 是整法的约束性前提：`Requirement E. R must be constructed so that, under`【D7】 the assumption of no contamination, an analyst told only the text of an item could not do better than chance at saying `whether it came from S or R.`【D8】 —— **这与 2608.07914 的 blind-separation gate【C79】 是同一道闸，两篇独立收敛。**

三种构造：`E1, randomised injection. Partition a single item pool`【D9】 at random into an injected half and a withheld half before training —— `and this is the only construction that is exact. It is available`【D10】 only when the analyst controls training；`E2, commissioned twin. Have a fresh item set written to`【D11】 match the original on the covariates that drive surface separability（GSM1k 式，近似，依赖匹配完备）。不满足的两种：`and which cover most existing membership-inference evaluation sets, are the temporal split, where R postdates the`【D23】 model cutoff…and the cross-source split。

**生态系统层结论：** `An important consequence is that RSCP cannot currently`【D12】 be applied to most benchmarks, because most benchmarks `have no exchangeable twin. This is a property of the evaluation ecosystem rather than of the method, and it motivates`【D13】 the benchmark-design recommendation。

**闸门的量级差：** 随机注入臂 `The measured BAnuis of 0.508 to 0.515 confirms the`【D14】 construction empirically，`and it is worth contrasting with the 0.855–0.856 of the`【D15】 temporal split —— 时间切分上一个**只看文本**的分类器就能达到 85.5% 平衡准确率。

**自我否证（本批最重要的一段）：** `find that the correction which makes it work carries more`【D1】 variance than the null it is tested against；`split seeds on 4 audits of deliberately contaminated checkpoints gives a standard deviation 1.30 to 1.56 times the`【D2】 null's own；`p = 0.0075, becomes p = 0.0745 once that variance is`【D3】 propagated, and the protocol issues no verdict。最终判定：`a widened null, and report that no arm shows contamination: all 4 well-matched Pile arms are null, the temporal`【D4】 `split is refused for failing exchangeability, and the contaminated checkpoints are null at both duplication counts tested.`【D5】 —— **在已知污染的 checkpoint 上判空，是正控上的假阴。** 并且内部不一致：`ready wrong: more duplication should give more signal,`【D24】 not less。

设计选择的敏感性：`excess separability rather than its shape makes the false`【D21】 positive rate track the size of the analyst's own control set, `from 0.03 to 0.99 under a true null. Contrasting against a`【D22】 flat depth profile fails in both directions；`A half-size baseline triples the error rate. The corrected`【D27】 protocol holds the nominal rate；修正后 `power at a separation of roughly one to two accuracy points`【D26】。

8.5 的自述：两个显著对比都在 Requirement E 失效的切分上 —— `The two significant contrasts are on the split where Requirement E fails, and they are therefore uninterpretable`【D20】 as contamination evidence；而最有信息量的是那个 null：`a level-matched baseline on a split where exchangeability is exact, finds nothing on a model that demonstrably`【D16】 memorised the items。结论：`Whether transformers carry a familiarity direction remains`【D6】 open。该文自己预先写好了"负结果是正当结果"的判据：`is that activation probing does not solve low-duplication`【D19】 benchmark contamination, and the paper reporting that should say so plainly。

### 3.3 来源事实 — `2605.30504`：IRT 能和不能做什么

它的估计量是**标签错误**，不是污染：`LLM benchmark labels are frozen at release`【G1】 and silently copied into downstream benchmarks, `errors and all. Our Item Response`【G3】 `Theory indicator surfaces these mislabels at`【G2】 95% precision in the top 200。错误根因三类，第三类是 `with no defensible single key. The same fit`【G4】（即机械标注规则、上游继承错误、无可辩护单一答案的歧义项）；更具体：`errors and ambiguous items come from construction rules that reward proxies for response quality, source labels copied without rechecking, or`【G12】。

污染角度是副产品：一个 reward model 以 78% 同意被判为误标的参考答案，对比同类 `38% for its peers, consistent with contamination or benchmark-specific over-optimization.`【G5】。但两处明写它不是证据：`tected mislabels is not proof of contamination, as a`【G6】 model may share a benchmark's labeling heuristic for other reasons；`not proof of contamination or benchmark-specific`【G7】 over-optimization。可操作的后续动作是人工查重叠：`should inspect overlap with public benchmark data,`【G11】 synthetic-data recipes, and model-selection criteria。

**准入门槛极高：** `The forced-ceiling indicator depends on a panel`【G8】 of models with sufficient ability spread to make θ identifiable；`We evaluate 114 models from 2023–2026, including six dedicated reward models. The generative models range from a 0.8B open-weights`【G10】 model；且相关性使有效样本更小：`independent respondents remains below 114, so Table 1 carries more uncertainty than the fit implies.`【G9】

### 3.4 设计推论 — 显式状态机 / 决策表

状态由三元组决定：**(S) benchmark 曝露状态**、**(A) 对模型内部的访问**、**(N) 可用独立样本量 m（source-item cluster 计数，非 case 计数【C81】）**。先过闸，再谈 detector；闸不过则 detector 不可准入。

**第 0 层：准入闸（任一不过 → 该 detector 不可准入，输出只能是 `inconclusive`）**

| 闸 | 判据 | 来源 |
|---|---|---|
| G-blind | 只看 case 文本的分类器分不开 suspect / reference（AUC 95% CI 含 0.5，或点 AUC ≤ 0.55） | 【C79】【D7】【D8】 |
| G-exch | reference 集由 **E1 随机划分**（精确）或 **E2 commissioned twin**（近似，须报匹配统计） | 【D9】【D10】【D11】 |
| G-unit | m 按 source-item cluster 计，近重复与重复解码**不计入** | 【C80】【C81】 |
| G-power | `α_min = 2.486/(e_f √m)` 落在目标污染比例之内，且 e_f 由**独立于审计集**的 calibration 估出 | 【C100】【C101】【C86】 |
| G-transport | clean-control 分数跨 run 不漂移；条件分布跨 α 稳定（KS < 0.15） | 【C79】 |

**第 1 层：状态 → 可准入 detector → 可得结论**

| # | S（曝露状态） | A（访问） | N（m） | 可准入 detector | 可得结论 | 依据 |
|---|---|---|---|---|---|---|
| S1 | `P1 = P0`（曝露在该通道不留痕） | 任意 | 任意 | **无** | **不可判定（可证）**。任何检验 `am+bm=1` | 【C72】【C73】 |
| S2 | 未知 | 闭权重、仅文本输出 | 任意 | **无（行为通道）** | **不可判定**。matched clean+seen control 不可得 ⇒ e_f 与 α 皆不可识别 | 【C87】【C88】 |
| S3 | 未知 | 闭权重 + token logprob（gray-box） | m 使 α_min ≤ 目标 | mean-score / Min-K / loss 类，经 calibration 选 probe | `detected` 或 `not_detected_with_power`，**必须附 e_f、budget、gate 值** | 【C96】【C92】 |
| S4 | 未知 | 同 S3 | m 使 α_min > 目标 | 形式上可跑 | **只能 `inconclusive`。** m=100 且 e_f=0.25 时 α_min=.995 | 【C78】【C76】 |
| S5 | 未知 | 开放残差流（白盒） | 任意 | **RSCP 当前不可准入** | **不可判定**：正控上判空【D5】，且修正项方差 > 零假设方差【D1】【D2】 | 【D5】【D1】【D6】 |
| S6 | 已知注入（自控训练） | 任意 | 任意 | E1 构造下全部 | 可做 **calibration**（估 e_f / m*），不是对生产模型的审计 | 【D9】【D10】 |
| S7 | 时间切分作为 reference | 任意 | 任意 | **无** | **不可判定**：G-exch 与 G-blind 必然失败（blind AUC 0.855）| 【D23】【D15】 |
| S8 | 语料不可得、只有本仓自有切分 | 任意 | 任意 | **lift-by-bucket 对比**（非 detector） | 可判定，但估计量是 **benchmark-local shallow generalization**，不是训练曝露 | 【C37】【C38】 |
| S9 | 需要 α 的下界证书 | 需独立 clean+seen control | m ≈ 3,500–79,000 | 分布无关证书 | **非零可信，零无信息** | 【C82】【C83】【C84】 |
| S10 | 需 IRT 审计 | 需 ≥ ~50 模型 panel + 数千项 | — | 4PL forced-ceiling | 查**标签错误**；污染只是筛查信号，非证据 | 【G8】【G10】【G6】【G7】 |

**本仓当前落在 S2 ∩ S4 ∩ S8。** 理由：被测对象是 provider 闭权重模型（无 matched seen control，常无稳定 logprob）；语料规模 m ≤ 207（`k11-v2` 168 + `rbi-10000251-exec` 39，§4.1 实测）。按 eq. 7 用该文**实测**的 mechanism efficacy 外推：

| m | e_f=0.741（exact）【C85】 | e_f=0.343（surface） | e_f=0.150（answer-only） |
|---:|---:|---:|---:|
| 39 | 0.54 | >1 | >1 |
| 143 | 0.28 | 0.61 | >1 |
| 168 | 0.26 | 0.56 | >1 |
| 207 | **0.23** | **0.50** | **>1** |

（本表由 `α_min = 2.486/(e_f√m)` 算出；该式在 m=500/e_f=0.25 → .445、m=1000/e_f=0.10 → .786、m=5000/e_f=0.25 → .141 处与论文 Table 11【C77】【C78】 逐位吻合，故算法已对照验证。）

**结论：在全部 207 个 case 上、且只有最强的逐字曝露机制，才可能在 23% 污染比例上有 80% 功效；paraphrase 级降到 50%，answer-only 级在任何可及 m 上都不可达。** 对 α=10% 需 m≈1,126（exact）/ 5,253（surface）/ 27,468（answer-only）。**本仓语料小两个数量级。** 因此：

- **本票裁定：R17 不得以 `not_detected` 作为输出。** 在当前语料规模与访问条件下，行为式污染检测的诚实输出是 `inconclusive`，且必须附 m、e_f（或"不可估"）与失败的闸名。
- `not_detected_with_power` 这一档在本仓**当前不可达**，除非语料扩到 m≳1,100 **且**拿到 matched seen control（后者对 provider 模型基本不可得【C87】【C88】）。R17 的输出枚举应为 `detected | inconclusive`，并显式记录 `not_detected_with_power` 为**结构性不可达**而非未尝试。

## 4. lineage 字段：相对 T11 的 delta

### 4.1 来源事实 — 本仓现状（实测）

`packages/eval/eval/src/eval_case.ts` 的 T11 后状态（[T11 ticket](../tickets/T11-loader-source-strip.md) resolved 2026-09-09，PR #114 同步）：结构位置（顶层 / `input` / `expected`）用 `strictObject`（未知键报错），`meta` 与 `dimensions` 用 `looseObject`/`record`（未声明键保留）。已声明并存活：`schema_version`、`expected.sql`、`expected.behavior`、`meta.anchor_ds`、`meta.tier`、`meta.source`。模板解析在 `packages/eval/eval/src/reference_sql.ts`，封闭占位符集 `{ds_yesterday, ds_7d_ago}`，四成员返回 `resolved/absent/unresolvable`。

本轮用 `yaml.safe_load` 清点两套 case（确定性命令）：

| case set | n | 顶层键 | `meta` 键（出现数） |
|---|---:|---|---|
| `k11-v2` | 168 | `case_id`/`input`/`expected`/`dimensions`（**无 `meta`、无 `schema_version`**） | — |
| `rbi-10000251-exec` | 39 | 上述 + `schema_version`、`meta` | `roles` 39、`tier` 39、`source` 39、`difficulty` 39、`created_at` 39、`retired` 39、`anchor_ds` 37、`business_context` 26、`needs_repin` 9 |

`packages/eval/eval/src/persistence.ts` 的 `PersistedCaseRecord` 字段为 `runId`/`timestamp`/`caseId`/`outcome`/`verdict`/`passed`/`passK`/`latencyMs`/`attemptsCount`/`errorsCount` —— **逐 run 侧没有任何 provenance 或污染披露字段**。

### 4.2 设计推论 — delta（不是 greenfield）

分类法的中心主张决定了字段必须**分两处落**：Types 1–4 是 dataset–corpus 关系，可在 release 侧评估一次；Type 5 `must be certified per run, not per benchmark`【C16】，所以**必须落在 score 侧**。本仓 `meta` 已能承载前者（T11 的 `looseObject` 决议使加字段无需改 schema），后者**当前完全缺失**。

**A. case 侧（`meta.*`，T11 的 loose 位置，加字段不需改 schema）**

| 字段 | 为什么 | 依据 |
|---|---|---|
| `meta.lineage.source_item` | Type 2 的单元是 source document；若 case 由公开证据派生，它"创建即污染"【C8】 | 【C7】【C8】 |
| `meta.lineage.derivation` | `original` / `paraphrase` / `structural` / `synthetic`；laundering 的 transformation family 未知时记 `unknown` | 【C53】【C24】 |
| `meta.lineage.generator` | 生成器模型 + prompt + version（若为合成 case） | 【C24】 |
| `meta.lineage.template_family` | Type 4 的单元是 template 而非 item；与 `derivation` **分开**（§2.4 冲突 ①） | 【C11】【C13】 |
| `meta.lineage.collected_at` / `eligible_after` | Type 3 的单元是 resolved outcome；必须能判定 item 是否在任一模型 cutoff 之后 | 【C9】【C10】 |
| `meta.lineage.public_since` | Type 1 的诚实填法常为 `unknown`，但"何时变为可公开检索"是本仓可知的 | 【C5】 |
| `meta.lineage.twin_of` | **E1 随机划分的孪生指针**。这是本票最关键的新字段：没有它，将来任何审计都只能走 E2 或不可行 | 【D9】【D10】【D12】【D13】【D17】 |
| `meta.lineage.cluster_id` | 独立性单位。近重复与同源派生必须同簇，`m` 按簇计 | 【C80】【C81】 |
| `meta.lineage.canary` | 发布时嵌入 canary；`Publish a canary.`【D25】 | 【D25】 |
| `meta.lineage.match_stats` | E2 匹配协变量与统计，使外部可自行跑 blind 闸：`Publish the matching statistics. With construction documented in enough detail, a BAnuis audit can be run by`【D18】 anyone | 【D18】【D11】 |
| `meta.label_provenance` | `mechanical_rule` / `human_verified` / `inherited`。本仓 86/143 个 EXECUTION case 用 `row_count_range`（只数行数）——这正是 IRT 论文点名的 `construction rules that reward proxies for response quality`【G12】 | 【G1】【G3】【G12】 |

`meta.tier`/`meta.source`/`meta.created_at`/`meta.retired`/`meta.needs_repin` 已存在，**不重复发明**；`retired`+`needs_repin` 已经是退役与重锚的雏形，G5 应复用而非新建。

**B. run 侧（`PersistedCaseRecord` / run manifest，当前为零 → 这是真正的缺口）**

四字段披露表【C18】 的本仓映射，每型取 `controlled | not_controlled | unknown | n/a`：

| 字段 | 本仓取值来源 |
|---|---|
| `contamination_controls.t1..t5` | t1 直接曝露；t2 派生；t3 时间；t4 分布；t5 acquired。**允许且鼓励 `unknown`**【C19】 |
| `contamination_controls.t5.network_access` | 本仓 case 要跑 warehouse 查询，网络必然开 → t5 不能填 `controlled` |
| `contamination_controls.t5.transcript_reviewed` | 5a/5b 的证据在执行 trace 里【C25】 |
| `contamination_controls.t5.boundary_monitoring` | **单列**，因为被攻破系统的 trace 不能为自己的围栏作证；validator 会把"t5 controlled 但无 boundary monitoring"判为假设而非控制 |
| `strata` | 按 `dimensions.data_source` / `sql_complexity` / `tier` 报分层分数【C18】 |
| `elicitation_budget` | attempts / temperature / harness commit。本仓已有 `attemptsCount`，缺 harness identity |
| `regeneration` | case 生成程序是否公开（本仓 `generate-k11.mjs` 在仓内 → 可填 `controlled`） |

**C. 不做的**

- 不新增 `contamination_type` 单值字段（§2.4 冲突 ①）。
- 不把 `anchor_ds` 当 snapshot identity —— T11 已明示 event 分区不冻结，本票不改这条。
- 不实现 laundering 的 SDR 检测：它要 token-level confidence【C59】 且估计量是版权而非污染（§2.3）。schema 只需能存 `derivation=unknown`。

## 5. live lifecycle 约束

### 5.1 来源事实 — `2602.16747` LiveClin：**运营要求是实测的，污染数字是混杂的**

身份与规模：ICLR 2026 会议论文【E1b】；`for the approximating real-world clinical practice. Built from contemporary, peerreviewed case reports and updated biannually, LiveClin ensures clinical currency`【E2】；`evaluation of 26 models`【E10】；`LiveClin reveals the profound difficulty of these real-world scenarios, with`【E15】 `the top-performing model achieving a Case Accuracy of just 35.7%. In benchmarking against human experts, Chief Physicians achieved the highest accuracy,`【E16】。

**实测（measured）：**

- 运营周期：`and July as a core requirement for reliable live medical AI evaluation. Each cycle replaces the`【E5】 `entire evaluation set, reassesses existing models, and includes newly released ones. Leveraging our`【E6】 AI–human workflow，前 6 个月的 case 在两周内采集、验证、发布。**这是对 G5 "append / partial rotation / full replacement" 的直接回答：LiveClin 选的是 full replacement。**
- 成本：`Table 2: Estimated cost in USD and time in Days required for each stage of a biannual update cycle`【E9】 —— 合计 53,500 USD / 11.3 天 每周期。
- private monitoring：`by individual developers, we operate a private leaderboard updated monthly, with its construction and`【E8】 `evaluation details presented in the Appendix O. As shown in Table 3, monthly score variations are`【E14】 small and rankings remain stable。
- pilot：5 个时间切片（2023-S1…2025-S1），`final random sampling step to create five standardized test sets, each containing 200 question sets.`【E11】

**断言（asserted，非实测）：**

- 6–8 个月的滞后窗口：`lag of approximately six to eight months between model data collection and public release provides an`【E7】 effective window for contamination control —— 理由是"follow LiveBench / LiveCodeBench 的做法"，**本文未测这个窗口的有效性**。

**最关键的一条：那个 ~10pp 不是污染量，是混杂量。** 原文：GPT-5 在知识库内数据上 45.0%，`but drops by nearly 10 percentage points knowledge cutoff for different models`【E3】；而论文自己指明这个差同时含两种效应：`scores on seen data, and knowledge obsolescence, which causes failures on unseen, newer knowledge.`【E4】。且 pilot 的构造不满足可交换性：不同时期的 case 来自不同时间的文献，`differences can be confidently attributed to the changing temporality of the data, not variations in the`【E13】 evaluation method —— 这句只排除了**评测方法**的变化，没有排除**题目本身**的分布变化；而这正是 `2608.12652` 实测时间切分 blind AUC 高达 0.855【D15】 的那一类构造，`2608.12652` 明言这类 reference 不满足 Requirement E【D23】。此外 pilot 为省成本 `ensure cost-efficiency for this preliminary study, the multi-tiered physician verification phase was`【E12】 omitted（AI-only 流水线）。

**本票裁定：不得把这 ~10pp 当作"暴露后退化幅度"引用。** 它是 (污染 inflation + 知识过时 + 题目分布漂移) 的和，且未过 blind 闸。本 effort 目前**没有**一个可引的"暴露后退化"基线数字 —— `73.7%`/`61.9%`/`12.8%`/`35.9pp` 已于 2026-09-08 作废，本轮也未能从这批论文中找到替代。

### 5.2 来源事实 — `2605.15188` FutureSim：时间边界是靠冻结语料做的，不是靠 API 日期过滤

设定：`agents forecast world events beyond their knowledge cutoff while interacting with`【F1】 a chronological replay；`best agent’s accuracy being 25%, and many having worse Brier skill score than`【F16】 making no prediction at all。

**隔离机制（实测、可照抄）：** `search news up to the current simulation date (access to future information is restricted), gather`【F2】 feedback；`To ensure agents cannot access future information, we sandbox them carefully using bwrap on a`【F7】 Linux server；`external links is LLM provider endpoints used to run the model. WebSearch, WebFetch, and any`【F8】 commands like curl are blocked；`and the search_news MCP tool automatically caps its to_date so the underlying index cannot return`【F9】 future-dated articles。连检索基础设施本身都被当成泄漏通道：embedding 模型选 `search, which finished training in mid-2025 and thus does not have access to recent information that`【F12】 could influence similarity scores and retrieval rankings。反馈注入点明确：`Once the simulation date passes a question’s`【F13】 `resolution date, the ground-truth outcome is added to the state file.`【F14】

**一条实测的 Type-5b 失败（本批最有操作价值的单条证据）：** `and other evidence, but we found that their date filters are not sufficient for leakage-free simulation.`【F10】 —— 审计案例里，Brave 以 `from_date=2026-01-01&to_date=2026-01-30` 查询，返回一个 `dated January 9, 2026 whose snippet already said the event was held on February 8 and that Breezy`【F11】 Johnson 夺金、Emma Aicher 夺银。**托管搜索 API 的日期过滤器不是可准入的隔离控制**：页面的 crawl 日期早于答案，但页面内容已含答案。

**两条测到的能力/退化：** 顺序到达 vs 一次性全信息的差 —— `we find that directly searching with full information available (green) leads to much higher accuracy`【F3】 `(31.2% vs 24.8%) than sequentially updating predictions as information becomes available in the`【F4】 simulation。以及锚定失败：`end of the simulation, all agents fail to reach even the baseline Brier skill score (0) of not predicting`【F5】 at all，`agents fail to adapt away from bad initial anchors.`【F6】 记忆是必需组件：`all three models tested perform worse without memory.`【F15】

### 5.3 设计推论 — live slice 的运营最小集

1. **full replacement 是有 venue 支持的那一档**【E5】【E6】；append 与 partial rotation 在本批文献里**无**一手支持。G5 若选后两者，须自己承担论证（§7）。
2. **冻结、按日期分区、本地索引的语料**是唯一被实测证明可行的时间边界【F7】【F9】【F12】；**任何托管搜索 API 的日期过滤都不可准入**【F10】【F11】。本仓 case 要查数仓，所以时间边界必须落在 **snapshot 分区**上，而 T11 已实测 event 分区不冻结 —— **本仓目前不具备可信的时间边界**。
3. **发布即须预留 E1 孪生**【D17】【D9】【D12】。这是**构造期一次性机会**：事后只能走 E2（commissioned twin，近似且须自证匹配）或完全不可审计【D13】。
4. **private monitoring 与公开发布并存**是实测可行的【E8】【E14】，代价是每周期约 53.5k USD / 11.3 天【E9】 —— 本仓没有这个预算量级，须按比例缩减或接受更低的轮换频率。
5. **evaluation-time feedback 必须有显式注入点**【F13】【F14】，否则 acquired contamination 无法归因。

## 6. R17 实验矩阵

[R17](../tickets/R17-contamination-audit.md) 的输出枚举是 `detected | not_detected_with_power | inconclusive`。**§3.4 的结论是：中间那档在本仓结构性不可达。** 因此本节把 R17 重写为两个可执行的实验，并保留一个明确标为不可执行的实验。

### 6.0 先裁掉：R17 原矩阵里不可执行的臂

| 原臂 | 裁定 | 理由 |
|---|---|---|
| Detector calibration、power、contamination-fraction certificate | **不可执行** | 需 matched clean+seen control on the same model（要求控制训练）【C86】；对 provider 闭权重模型不可得【C87】【C88】。证书在 m≈3,500–79,000 以下恒为空【C82】【C83】【C84】 |
| Distillation / laundering surrogate 臂 | **改为 schema-only** | SDR 要 token-level confidence【C59】，且估计量是版权非污染（§2.3）；最好情况 AUC 仅 0.766【C57】、换语料 0.627【C58】 |
| 残差流 / activation probing | **不准入** | 正控上判空【D5】，修正项方差 > 零假设方差【D1】【D2】，作者自述方向未决【D6】 |
| 时间切分作为 reference | **不准入** | 必然失 G-exch/G-blind【D23】；blind AUC 0.855【D15】 |
| IRT 审计 | **延后** | 需 ~114 模型 panel【G10】【G8】；且它查标签错误，污染只是筛查信号【G6】【G7】 |

### 6.1 实验 A（主交付）：本仓自有切分上的 shallow-generalization 对照

**这是 R17 唯一在本仓完全可判定的实验**，因为 reference 集由我们自己随机划分 ⇒ Requirement E 由 E1 随机化精确成立【D9】【D10】，不依赖任何关于 provider 训练语料的假设。

**假设 H_A**：本仓 `heldout` 切片与 `train` 切片测的是**同一个** benchmark-local 能力；即在 train 切片上的任何"适配"（prompt/context/few-shot/记忆）会同等地迁移到 heldout 切片，而不迁移到**语义独立**的 fresh 切片。（这是 §2.4 冲突 ⑥ 里被降级为待测的那条。）

- **Arms**（同一模型、同一 harness commit、同一 scorer）：
  - A0 `clean-matched control`：E1 随机划出的保留半，**构造期即划分**，与 A1 同池。
  - A1 `train-exposed`：另一半，允许 prompt/context 适配。
  - A2 `paraphrase twin`：A0 项的人工/LLM 改写，**答案逐字保留**、unigram Jaccard ≤ 0.6、两个独立 NLI 判定双向 entailment > 0.8、判定分歧的直接丢弃（照抄 2608.07914 §G.2 的验收流水线，该流水线 200 项只通过 138 项，接受率 0.69）。
  - A3 `structural twin`：改表名/列名/实体名、改时间窗、插入逻辑惰性子句（Type 4 的单元是 template【C11】）。
  - A4 `fresh`：新采集、`eligible_after` 晚于全部被测模型 cutoff、**且不由任何已发布语料派生**。
- **Held out**：A0 自始至终不参与任何 prompt/context 构造、不进任何 few-shot、不进任何人类阅读；`meta.lineage.twin_of` 记录 A0↔A1 配对。
- **统计量**：配对差 `D = acc(A1) − acc(A0)`，以 **source-item cluster 为 bootstrap 单位**【C81】（近重复/同源派生同簇），item-level bootstrap 95% CI。
- **样本量**：A0/A1 各取现有 207 个 case 的随机半（约 103/104 簇）。按 §3.4 这不足以做污染检测，但**足以做配对对比**：这里的估计量是"两个切片的分数差"，不是"训练曝露比例"，功效要求低一个量级。
- **决策门槛**：`|D|` 的 95% CI 排除 0 ⇒ train/heldout **不等价**（heldout 被适配污染）；CI 含 0 且宽度 < 5pp ⇒ 等价证据。
- **什么会证伪 H_A**：若 `acc(A4) ≈ acc(A0) ≈ acc(A1)`（三者 CI 重叠）则 heldout 并非 benchmark-local —— H_A 被证伪，侦察笔记对 2602.12413 的刻画在本仓**不成立**。若 `acc(A1) > acc(A0) ≫ acc(A4)` 则 H_A 成立且 fresh 切片是必需的。若 `acc(A2)/acc(A3)` 相对 A0 显著下降而 A1 不降，则污染形态是 Type 4（template 依赖），而非 Type 1/2。
- **强制闸（任一不过则输出 `inconclusive` 并报闸名）**：
  - G-blind：只看 case 文本的分类器分不开 A0/A1（AUC 95% CI 含 0.5 或点 AUC ≤ 0.55）【C79】【D7】【D8】。
  - G-unit：m 按簇计【C80】【C81】。
  - **G-placebo（本票新增，来自 2608.12652）**：在 A0 内部再随机对半，跑同一条流水线。若这个 placebo 对比自己就产生非零 D，则主对比的任何显著性都不可信 —— 这正是 `2608.12652` 发现自己 p=0.0075 变 0.0745 的那条机制【D1】【D2】【D3】。**placebo 的自身抽样方差必须被传播进零假设，而不是固定住。**
  - **G-clean-drift（来自 2608.07914）**：A0 的分数跨 run 不漂移；answer-only 臂的表观效应在该文被证明就是 baseline drift【C98】【C99】。

### 6.2 实验 B（次交付）：语义近重复的相似度分桶 lift

**目的**：回答"语义近重复是否在本仓产生 lift"，并给出本仓自己的检索深度/标注器限定。

- **召回**：embedding 近邻（**只作召回器**，不作曝露代理 —— 【C35】【C36】 实测近邻训了不涨分）。
- **分桶**：对每个召回候选，由**两个独立判定器**（人 + LLM，分歧丢弃）打 `exact | equivalent | subset | superset | not-duplicate` 标签；按**标签**分桶，不按余弦阈值分桶。
- **必报限定**：检索深度 k 与标注器身份。理由：同一语料同一 benchmark，k=100 时 77.5%、k=1 时 28.4%【C33】【C34】。**本仓不得报无限定的污染率。**
- **统计量**：各桶的 pass 率与 `not-duplicate` 桶的差，cluster bootstrap CI。
- **什么会证伪**：若 `exact` 桶与 `not-duplicate` 桶的 CI 重叠，则本仓语料上语义近重复不构成 lift 来源。

### 6.3 实验 C（标为不可执行，但必须登记）

"本仓 case 在 provider 模型训练语料中的曝露比例 α" —— **不可判定**，落在 S2（闭权重、无 matched seen control）【C87】【C88】 ∩ S4（m 远小于所需）。R17 应把这一条写成 `inconclusive, structurally undecidable`，并附 §3.4 的 α_min 表作为理由，而不是跑一个无功效的 detector 再报 `not detected`。该文把这种做法命名为问题本身：`Behavioral contamination detectors can return`【C70】 "no evidence" either because a benchmark is clean or because the audit has little power。

### 6.4 R17 的输出契约（修订）

```
status: detected | inconclusive            # not_detected_with_power 结构性不可达
arms:   A0..A4 的 pass 率 + cluster bootstrap CI
gates:  { blind, unit, placebo, clean_drift } 各 pass/fail + 实测值
power:  { m_clusters, e_f: measured|unestimable, alpha_min }
limits: 检索深度 k、标注器、未通过的闸、不可执行的臂
```
每次完整运行按实验审计规则写入 [`experiment-audit-log.md`](experiment-audit-log.md)。

## 7. 对 G5 的输入

### 7.1 文献**已经替我们裁掉**的（不要再辩）

| 决策 | 已裁定 | 依据 |
|---|---|---|
| "私有 heldout 能解决污染吗" | **不能，只关掉 Type 1 一条路** | 【C2】【C3】 |
| "从公开文献/公开语料建 heldout 行吗" | **不行，创建即污染（Type 2）** | 【C8】 |
| "案例新写的就不受污染吗" | **不是，template 仍可能在语料里（Type 4），且不留 inflation 信号** | 【C11】【C12】 |
| "字符串去重够不够" | **不够，n-gram 漏语义重复** | 【C30】【C33】 |
| "Type 5 能在 benchmark release 时认证吗" | **不能，必须 per-run 认证** | 【C16】 |
| "用 system prompt 叫模型别查答案算控制吗" | **不算，被排除** | 【C17】 |
| "披露表允许 unknown 吗" | **允许且必需** | 【C18】【C19】 |
| "时间切分能当 reference 集吗" | **不能，必然失可交换性** | 【D23】【D15】 |
| "托管搜索 API 的日期过滤算隔离吗" | **不算，有实测反例** | 【F10】【F11】 |
| "孪生集可以事后再补吗" | **构造期不留就只能走近似的 E2 或不可审计** | 【D9】【D10】【D12】【D13】【D17】 |
| "embedding 距离能当曝露代理吗" | **不能，近邻训了不涨分** | 【C35】【C36】 |
| "benchmark 发布要不要带 canary" | **要** | 【D25】 |
| "残差流 probing 现在能用吗" | **不能，正控上假阴 + 修正项方差超过零假设** | 【D5】【D1】【D2】 |
| "每次 fresh 发布 append 还是 full replacement" | **full replacement 是唯一有 venue 支持的那档** | 【E5】【E6】 |

### 7.2 **本仓自主选择**（不要借论文的权威）

以下在这批一手来源里**没有**结论，G5 必须自己裁并自己承担理由：

1. **轮换频率。** LiveClin 选半年是因为临床文献周期 + 53.5k USD/周期的预算【E5】【E9】，与本仓（数仓指标 case）无可比性。半年/季度/按 schema 变更触发，**本仓自定**。
2. **append / partial rotation。** 文献只支持 full replacement【E5】；若 G5 为了纵向可比性选 partial rotation，这是**本仓的选择**，须自己给可比性论证，不得引 LiveClin。
3. **heldout 的访问权限与解封条件。** 分类法只说披露要 per-run【C16】，没说谁能看、何时解封。
4. **snapshot 锚点语义。** T11 已实测 event 分区不冻结；"本仓的时间边界落在哪"是数仓事实决定的，与这批论文无关。
5. **新旧 pack 的重锚规则与退役记录格式。** `meta.retired`/`meta.needs_repin` 已存在，如何用是本仓事情。
6. **E1 孪生的划分比例。** `2608.12652` 只说"随机划一部分"【D17】；`2608.07914` 的证书用 reference 二倍于 suspect，但那是为它自己的证书服务。比例**本仓自定**。
7. **private leaderboard 要不要做。** LiveClin 做了且实测稳定【E8】【E14】，但那是为了检测外部开发者的频繁迭代攻击；本仓是内部 effort，攻击面不同。
8. **污染披露放在哪个文件格式里。** 分类法发布了 JSON Schema + validator，但本仓的 run manifest 形状属 G10/T9 所有，不由本票决定。
9. **什么算"足够新"的 fresh case。** `eligible_after` 必须晚于被测模型 cutoff【C9】，但 provider cutoff 是自报且不可验证（分类法把 t3 的诚实填法举为 `unknown`【C18】 的典型），所以本仓须自定一个保守余量。

## 8. 本票未回答的 / 待核

1. **「暴露后退化幅度」没有可引基线。** 本票未能在这批论文中找到一个**过了 blind 闸的**暴露后退化数字。LiveClin 的 ~10pp 是污染 + 知识过时 + 题目漂移的混杂量【E3】【E4】【E13】；FutureSim 的 31.2% vs 24.8%【F3】【F4】 测的是顺序到达 vs 全信息，不是暴露前后。作废的 `73.7%`/`61.9%`/`12.8%`/`35.9pp` 没有替代。**结论：目前不存在可用基线。**
2. **本仓的 e_f 完全未知。** §3.4 的 α_min 表用的是 `2608.07914` 在 pythia-160m / SQuAD / k=4 上的实测 efficacy【C85】【C93】。SQL/数仓 case 在 provider 模型上的 e_f 是**另一个量**，本票没有任何证据外推它。若本仓 e_f 比 0.150 更低，连 §3.4 表里"exact 机制 m=207 → 0.23"的乐观角都不成立。
3. **`2608.29463` 的 GitHub 配套（spec / JSON Schema / validator / 预注册 / 分析代码）未抓取。** 论文给了仓库名，本轮**未访问**（预算全投全文，按票面要求）。**待核**：四字段披露表的精确 JSON 形状、validator 的具体判据（本文只能从散文读到"t5 controlled 但无 boundary monitoring 会被 flag"）。
4. **`2602.16747` 的 Appendix O（private leaderboard 构造）与 Table 3 具体数字未逐格认读。** 只核到"月度波动小、排名稳定"的散文结论【E14】 与表题。**待核**：波动的实际幅度。
5. **`2605.30504` 的 Table 4（panel 缩减下的 P@100）只读到 86.2% / 84.7% / 75.0% 三个数字，未确认它们各自对应哪一行 K。** 因此"panel 至少要多少模型"无法给出数字下界，只能说"114 远高于阈值、减半仍稳、再减则逐步退化"【G8】。
6. **`2604.01904` 的 Appendix I（负控细节）未逐行认读。** 只核到散文承诺"数据不在训练集时 AUC 应近 0.5"【C61】 与"Appendix I 验证"。**待核**：负控的实际 AUC 值。
7. **`2605.15188` 的 §4.2 结果表与 §5.4/5.5（uncertainty、multi-agent）未认读。** 对本票不必要，但若 G5 要引 FutureSim 的能力结论需补。
8. **`2608.07914` 的 Appendix D（LAN / matching test 的构造）与 Appendix E（adaptive/heterogeneous）只读到主文摘述。** 若 R17 将来要做自适应探针，须补读 Appendix E 的 KL 预算定理。
9. **分类法的 Type 5c 只有一个披露事件**【C23】 的同段自述"establishes possibility, not frequency"，且 Appendix B（事件序列）未读。本仓不应据此做任何频率假设。
10. **`2608.12652` 的 §10 注入实验是「planned, not run」。** 它的 `m*`（检测地板）**没有被测出来**；§10.5 的决策规则【D19】 是前瞻性的。因此"RSCP 在多少重复数下可用"至今**无答案**。
11. **本票未核**：CoreEval `2511.18889`、SWE-bench-Live `2505.23419`（票面已标 待核，本轮未触碰）。
12. **本票未验证**本仓 case 与任何公开语料的实际重叠 —— 那需要公开语料的访问权，且按 §3.4 属 S8 以外的问题。R17 实验 A/B 都刻意设计成**不需要**这个访问权。
