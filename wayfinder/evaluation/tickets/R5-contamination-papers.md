# R5 — 污染、语义近邻与 live benchmark 论文认读

**Type**: research  ·  **Status**: **resolved**（2026-10-06）
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: 无
**Blocks**: [G5 — Dynamic case pipeline](G5-dynamic-case-pipeline.md)；[R17 — Contamination audit](R17-contamination-audit.md)
**Mode**: AFK
**Branch**: `research/R5-contamination-papers`
**Scout**: [`../research/g10-2026-followup-papers.md`](../research/g10-2026-followup-papers.md)

## Question

Direct、derivative、temporal、distributional 与 acquired contamination 各能绕过哪些已有防护？语义近重复、未知 laundering transformation、审计功效不足和 live benchmark 暴露后退化应如何约束 case lineage、污染披露与 R17 的实验设计？

## 待认读一手来源

- Benchmark Contamination: A Taxonomy Organized by Defeated Mitigation (`2608.29463`)
- Soft Contamination Means Benchmarks Test Shallow Generalization (`2602.12413`)
- Combating Data Laundering in LLM Training (`2604.01904`)
- When Is Benchmark Contamination Detectable? (`2608.07914`)
- LiveClin (`2602.16747`)
- FutureSim (`2605.15188`)
- Excess Separability (`2608.12652`，detector validity)
- Auditing LLM Benchmarks with Item Response Theory (`2605.30504`，与 R4 对账)
- R10 已认读的 Data Laundering、MMLU-CF 与 WildBench，用于对账而非重复摘要

## 产出

`../research/contamination-live-benchmark-papers.md`，输出污染分类、可检测性状态机、lineage 字段、live lifecycle 约束及 R17 实验矩阵。

---

## Answer（resolved 2026-10-06）

**产物**：[`../research/contamination-live-benchmark-papers.md`](../research/contamination-live-benchmark-papers.md)（8 节）。**156 条引文，由本 session orchestrator 以独立脚本机械回核 156/156 通过**（subagent 自建 manifest 的方式使其自检循环——「needle 定位即构造成真」——故回核由 orchestrator 另写校验器重做，并额外抽查 11 条最吃重引文的上下文）。

### 1. 身份与证据等级：8/8 验真，但 venue 分布与票面假设不同

8 个 arXiv ID 经一次批量 `export.arxiv.org` 查询（`totalResults=28`，与本批另 3 票合并）全部验真，无臆造。**票面与本 session 初始判断都错了**：不是「只有 `2605.30504` 有 venue」——
- **LiveClin `2602.16747` 是 ICLR 2026 会议论文**（31 页每页 running header「Published as a conference paper at ICLR 2026」）；
- **`2604.01904` 是 ICLR 2026 Workshop** 接收；
- `2605.30504` EMNLP 2026。

修正后：**2 篇主会 + 1 篇 workshop + 5 篇无 venue**。但**最吃重的技术内容（`2608.07914` 的可检测性下界）仍出自无 venue 预印本**，故其采纳须靠论证结构而非 venue。

### 2. 决定性结论：R17 的输出枚举结构上不可达 → 必须改为 `detected | inconclusive`

`2608.07914` eq. 7（逐字转写、已与其 Table 11 复算对齐）：`α_min(f, m) ≈ 2.486 / (e_f · √m)`（τ=.05、power=.80 ⇒ `z.95+z.80=2.486`）。代入本仓**实测**语料规模（168 + 39 = **207** case）与该文实测 efficacy：

| 通道 | α_min @ m=207 | 要达 α=10% 所需 m |
|---|---|---|
| verbatim | **0.23** | ≈ 1,126 |
| surface | **0.50** | ≈ 5,253 |
| answer-only | **> 1**（不可达） | ≈ 27,468 |

即：**在 207 个 case 上，审计连「23% 的语料被逐字污染」都检不出来。** 更硬的一层是**可识别性**失败——该文明写匹配的 clean+seen 对照「are generally unavailable to an external auditor of a closed model, so neither efficacy nor the exposed fraction is then identified」，本仓正处于此状态。

⇒ **[R17](R17-contamination-audit.md) 不能输出「未检出且有功效」**，该枚举值无法诚实填写。本票把 R17 的输出空间裁为 **`detected | inconclusive`**，并要求每次审计落盘 `m`、`e_f`(若不可知则显式 `null`)、`α_min`。

### 3. `2608.12652`（Excess Separability）不可采纳——它在自己的阳性对照上失败

票面只预期它「部分自我削弱」。全文更强：
- placebo baseline 自身的抽样方差是 permutation null 的 **1.30–1.56 倍**，逐 arm 皆然（p 0.0075 → 0.0745）；
- **在刻意污染的 checkpoint 上、在 exchangeability 精确成立的 split 上、在「a model that demonstrably memorised the items」上，两个 duplication count 都检出 null**；
- m=50 比 m=7 更不显著；§10 的标定是**计划而非已执行**，故检测下界 `m*` 从未被测。

⇒ RSCP 退出 R17 的 detector 臂。

### 4. 两篇独立论文收敛到同一个强制闸门（G-blind）

`2608.07914` 的 blind-separation gate ≡ `2608.12652` 的 Requirement E。产物把它立为 **G-blind：任何污染数字在通过盲分离闸之前不得发布**。LiveClin 的 ~10pp 前后截断差**未过此闸**，且该文自述它混合了污染 inflation 与知识过时 ⇒ **不得当作「暴露后退化幅度」引用**。

**⇒ 本 effort 目前没有可引的暴露后退化基线。** 作废的 `73.7%`/`61.9%`/`12.8%`/`35.9pp` 在这批论文里**没有找到替代**，产物与本票均显式记录此空缺，不以任何新数字顶替。

### 5. 唯一不可逆的设计期决定 → 必须立刻进 lineage 契约

E1 级随机 twin **只能在 case 构造时预留**；构造之后只剩近似的 E2 或无。⇒ 产物 §4 在 [T11](T11-loader-source-strip.md) 已保全的宽松 `meta` 上提出 **delta（无需 schema 变更）**：`meta.lineage.twin_of` 等字段 + run 侧 disclosure 块。**另查出**：`PersistedCaseRecord`（`packages/eval/eval/src/persistence.ts`）**零 provenance 字段**，而分类法的核心主张是 Type 5（acquired）**必须按 run 认证、不是按 benchmark 认证**。

### 6. 语义近邻：embedding 距离是召回工具，不是暴露代理

`2602.12413`：**非语义重复的 cosine 近邻不产生任何 lift**；且「污染率」是检索深度的函数（k=100 时 77.5% vs **k=1 时 28.4%**）。其「heldout 只测 benchmark-local 浅泛化」的强版本在该文自己的生态有效剂量下只拿到 **`mixed`** 证据，且 clean 模型的增益最强处恰在被当作「unseen」的子集上。⇒ 票面从 scout 继承的转述须弱化。

### 7. `2604.01904` 退出 detector 臂

其 estimand 是版权/MIA（「我的语料被用了吗」），非 benchmark 分数虚高；需 token 级 logprob（本仓拿不到）；「恢复检测」= AUC 1.000→0.539→**最好 0.766、HackerNews 仅 0.627**，TPR@5% ≤ 0.30。改作 schema-only 参考。

### 8. 对 [G5](G5-dynamic-case-pipeline.md) 的输入

**文献已裁定（勿重议）**：轮换口径只有「每周期全量替换」有主会支撑（成本 ~$53.5k / 11.3 天）；append 与部分轮换**零一手支撑**。**本仓自主选择（勿假借论文权威）**：轮换周期、预算、以及是否接受全量替换的成本。
**附带指控**：`2605.30504` 的 IRT 根因清单点名「construction rules that reward proxies for response quality」——这正是本仓的 `row_count_range`（143 个 EXECUTION case 中 86 个只断言行数）。IRT 本身**本仓不可达**（需 ~114 模型且有能力跨度），且该文明示 mislabel 一致 ≠ 污染证明。

### 解锁

- **[G5 — Dynamic case pipeline](G5-dynamic-case-pipeline.md)** —— lineage 字段、live lifecycle 约束、轮换口径的已裁/自选分割已就位。
- **[R17 — Contamination audit](R17-contamination-audit.md)** —— 实验矩阵 + 功效算式 + 输出枚举修正（`detected | inconclusive`）已就位；RSCP 与 laundering 两个 detector 臂已被证伪并移除。

### 本票未回答

12 项列于产物 §8。最重要三条：本仓自己的 `e_f` 完全未知（上表由 pythia-160m/SQuAD/k=4 外推，是另一个量）；`2608.29463` 的配套 GitHub（JSON Schema 与 validator 谓词）未取；无可引的暴露后退化基线。
