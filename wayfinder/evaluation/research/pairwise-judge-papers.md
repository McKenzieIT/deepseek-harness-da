# R8 — Pairwise / rubric-anchored judge 与 RADAR 冗余审计：一手认读

日期：2026-09-10  ·  票：[R8-pairwise-judge-papers](../tickets/R8-pairwise-judge-papers.md)  ·  分支：`master`（纯文档）

## 0. 本轮的验证路径与阅读顺序

**验证手段**：`export.arxiv.org` 权威元数据（一次 6-id 批量查询，`totalResults=6`）+ `arxiv.org/pdf/<id>` 全文 + `pdftotext -layout`。抓取物在 `.tmp/r8/`（不入 git）：`arxiv-meta.xml`、6 份 PDF 及其 `.txt`。**本环境 arXiv 端点会 429**（本轮首两次尝试即 429），须 `--retry-all-errors --retry-delay` 退避并把 6 个 id 合并成**一次**请求；分 6 次必被限流。

**读法**：论文层结论由四个互不知情的 subagent 从**本地 `.txt`**逐条抽取（禁联网、禁凭记忆），每条须带**逐字引文 + 行号**；本文作者对进入产物的每条引文用 `grep` 机械回核。仓库层结论**全部由作者亲自用确定性命令导出**，不经 subagent（CLAUDE.md 引证纪律 2）。

**§1 是身份核验，§2 是本仓实测，§3-§6 是论文，§7 是对 G8/R20 的交付。§2 先于论文写完，且它已经改变了本方向的问题**——建议按 §2 → §7 → 再回看论文的顺序读。

---

## 1. 论文身份：6/6 经 arXiv 权威元数据确认真实

逐条取自 `export.arxiv.org` API 的 `title`/`author`/`published`/`updated`/`comment`，非 WebSearch、非模型记忆。

| map 中的称法 | arXiv | 元数据实际标题 | 作者数 / 首作 | 时间 | comment |
|---|---|---|---|---|---|
| RADAR | 2608.01810v1 | RADAR: Rubric-Aware Dependency and Redundancy Analysis for LLM-as-Judge Evaluation | 3 / Divyansh Singh | 2026-08-03 | 无 |
| TrustJudge | 2509.21117v2 | TrustJudge: Inconsistencies of LLM-as-a-Judge and How to Alleviate Them | 14 / Yidong Wang | 2025-09-25，末更 2025-09-26 | 22 pages, 9 figures, 6 tables |
| “Am I More Pointwise or Pairwise” | 2602.02219v2 | Am I More Pointwise or Pairwise? Revealing Position Bias in Rubric-Based LLM-as-a-Judge | 4 / Yuzheng Xu | 2026-02-02，末更 2026-06-24 | 无 |
| “Grading Needs a Rubric Not Intelligence” | 2608.17938v1 | Grading Needs a Rubric, Not Intelligence | 1 / Jhen-Ke Lin | 2026-08-18 | 无 |
| “SARA” | 2608.14684v2 | Mitigating Rubric Interference in LLM Judges via On-Policy Self-Distillation | 6 / Dingyao Yu | 2026-08-05，末更 2026-08-26 | 无 |
| “Graph-Structured Rubrics” | 2608.12097v1 | Graph-Structured Rubrics: Compiling Rubrics into Typed Evaluation Graphs for LLM Judges | 4 / Xi Chen | 2026-08-12 | 11 pages, 4 figures, 4 tables |

### 对 map 的两处修正

1. **`2608.14684` 的标题不是 “SARA”。** 真标题为 *Mitigating Rubric Interference in LLM Judges via On-Policy Self-Distillation*；SARA（Self-Anchored Rubric Alignment）是该文提出的**方法名**。与 R1 v3 抓到的 GradeSQL 同一类错误（框架名被当标题），引用时须用真标题。
2. **`2602.02219` 的主题不是“pointwise vs pairwise 取舍”。** 它研究的是 **rubric-based 评测中的位置偏置**——标题后半句 “Revealing Position Bias in Rubric-Based LLM-as-a-Judge” 才是内容。map 方向 8 的论文行把它当作 pointwise/pairwise 之争的论据，属误置；它对本仓真正相关的贡献是**第二条偏置轴：一次 prompt 内多准则同评时，准则本身的排列顺序会移动分数**（见 §4）。这条恰好命中本仓判官的现状（§2.8）。

---

## 2. 本仓实测：判官的读出（readout）在算术上等于 `overall_semantics` 加一个 8.56pp 的漏

> 本节每条都由作者亲自执行确定性命令导出。`file:line` 均为 2026-09-10 `master`（`5767e7c9a4`）实测。

### 2.1 是两个判官，不是一个

| | SQL semantic judge | DELIVERY judge |
|---|---|---|
| 位置 | `packages/eval/eval-runner/src/sql_semantic_judge.ts` | `packages/eval/eval/src/judge.ts` |
| 阈值 | `SQL_JUDGE_PASS_THRESHOLD = 0.6`（`eval-runner/src/runner.ts:34-35`，注释自称 “3/5 dimensions”） | `JUDGE_PASS_THRESHOLD = 0.6`（`eval/src/judge.ts:40`） |
| 分数构成 | 5 个**二值**维度的算术平均（`sql_semantic_judge.ts:136-142`） | provider 返回的连续 `score` 0..1（`eval/src/types.ts:150-155`） |
| **是否拿到参考答案** | **否**——输入仅 `question` / `generated_sql` / `schema_context`（`sql_semantic_judge.ts:14-18`） | **是**——`JudgePrompt` 含 `expectedAnswer`（`eval/src/types.ts:144-148`） |

两个 0.6 语义不同，不可混谈。map 里“0.6 阈值通胀”指的是**前者**，而前者的 0.6 有一个精确的算术含义：**5 个二值维度里过 3 个**。

### 2.2 分数只能取 6 个值

`toScore` 把任何非 `>=0.5` 的输入压成 0/1（`sql_semantic_judge.ts:150-153`），prompt 也明写“每项 0 或 1”（`:92`）。所以 `score ∈ {0, 0.2, 0.4, 0.6, 0.8, 1.0}`，`>=0.6` ⟺ 5 个二值里至少 3 个为 1。这是个**投票制**，不是连续打分。

### 2.3 判官的裁决会被写成执行事实

`runner.ts:279-291`（SQL-only 模式）：`executionMatch = judgeResult.score >= SQL_JUDGE_PASS_THRESHOLD`。G1 D4 已裁定「judge 永不填 execution」——本节确认那条禁令要拆掉的正是这一行，且拆掉它的同时必须处理 §2.6 的读出问题，否则只是把一个坏读出从 `execution_match` 挪到别处。

### 2.4 已落盘的逐维数据：1495 条向量，19 份文件

`eval-results/` 共 80 份 `.json`；29 份含 `sql_judge`，其中 **19 份带非空 `dimensions`**，attempt 级向量共 **1495** 条，键集合 100% 一致（5 维齐全，无缺维）。

### 2.5 五维的边际通过率与联合分布

| 维度 | 通过率 | n(1) | n(0) |
|---|---|---|---|
| `table_selection` | 0.9418 | 1408 | 87 |
| `field_selection` | 0.9271 | 1386 | 109 |
| `filter_conditions` | 0.8936 | 1336 | 159 |
| `aggregation_logic` | 0.9458 | 1414 | 81 |
| `overall_semantics` | **0.8355** | 1249 | 246 |

联合分布高度退化：**`(1,1,1,1,1)` 占 83.4%（1247/1495）**，32 种可能模式只出现了 **18** 种。分数分布：`1.0` 83.4%、`0.6` 8.0%、`0.4` 4.1%、`0.2` 2.3%、`0.0` 1.5%、**`0.8` 仅 0.7%（10 条）**——`0.6` 比 `0.8` 常见 12 倍，这个非单调的鼓包本身就是线索。

### 2.6 决定性事实：四个机械维度只会推翻否决，从不施加约束

在 1495 条向量上：

- `score >= 0.6`（现行读出）判 PASS：**1377 条（92.11%）**
- `overall_semantics == 1`（gated 读出）判 PASS：**1249 条（83.55%）**
- **`overall_semantics == 1` 却被现行读出判 FAIL：0 条（0.00%）**
- **`overall_semantics == 0` 却被现行读出判 PASS：128 条（8.56%）**

即：现行读出**从不比单看 `overall_semantics` 更严**，只会更松，差额恰好 **8.56pp**。反过来读更刺目——**判官说「这条 SQL 执行后答不了用户的问题」的 246 次里，有 128 次（52.03%）该 case 仍然通过。**

被推翻的模式全表（`overall_semantics` 恒为 0）：

| 模式 (table, field, filter, agg, overall) | score | 条数 |
|---|---|---|
| (1, 1, 0, 1, 0) | 0.6 | 77 |
| (1, 1, 1, 0, 0) | 0.6 | 22 |
| (1, 0, 1, 1, 0) | 0.6 | 15 |
| (1, 1, 1, 1, 0) | 0.8 | 8 |
| (0, 1, 1, 1, 0) | 0.6 | 6 |

`(0,0,0,0,1)` 这类「只有 overall 通过」的模式**算术上可能**（score=0.2 < 0.6，会 FAIL），但 1495 条里**一次都没出现**。所以这不是算术恒等式，是一条**经验规律**：`overall_semantics` 是唯一起约束作用的维度，另外四个是它的**推翻票**。

条件分布把这条讲到最尽：

| 条件 | P(四个机械维度全为 1) |
|---|---|
| `overall_semantics == 1`（n=1249） | **0.9984**（1247/1249，仅 2 条例外：`(1,1,0,1,1)` 与 `(0,1,1,1,1)` 各 1 条） |
| `overall_semantics == 0`（n=246） | 0.0325（8/246） |

`overall_semantics == 1` 时四个机械维度几乎**恒等于 1**，携带的增量信息接近零；只有在 `overall_semantics == 0` 时它们才分化（此时边际为 `table` 0.6504 / `field` 0.5569 / `filter` 0.3577 / `agg` 0.6707），而分化的作用恰恰是**投票推翻那个 0**。

**所以现行的五维 rubric 在实测上是：一个单维闸门（`overall_semantics`），外加一组在闸门说「不」时有 52% 概率把它推翻的附加票。** 这不是「5 个维度里有 2-3 个测同一个潜变量」（map 方向 8 的原假设）——比那更极端：**四个维度在决策上几乎不参与，除了充当漏。**

**跨 run 稳定，不是单次坏 run**：19 份文件的 all-ones 占比在 64.9%–100% 之间，n≥70 的 14 份落在 78.8%–90.4%。

### 2.7 判官的证据基础从未落盘

80 份结果文件里 **0 份**记录 `schema_context`（`grep -l` 计数为 0），attempt 记录的键只有 `attempt_k / delivery_match / execution_match / expected_result / generated_sql / query_result / sql_judge`。也就是说：**判官的分数可以读到，判官据以打分的证据读不到**——无法离线重打分、无法审计一次具体的 0/1。G1 D3 为 execution 定的「可落盘 artifact，R23 需离线重打分」这条要求，judge 侧同样成立而目前完全缺失。

同理，1495 条里只有 **375 条（25.1%）**能恢复执行模式（`config.with_query` 存在）；其余 1120 条连「这次跑没跑数仓」都不可知——这是 G1 v3 D4 那条「模式不可恢复」在 judge 维度上的同一个洞。

### 2.8 准则顺序是固定的，且 `overall_semantics` 恒在末位

中文 prompt（`sql_semantic_judge.ts:94-98`）与 EXP2 的英文变体（`eval-cli/src/exp2-prompts-en.ts:157-161`）**两份副本的准则顺序完全相同**：`table_selection` → `field_selection` → `filter_conditions` → `aggregation_logic` → `overall_semantics`。五维在**同一次调用**里同评，输出一个 JSON。这正是 §4（准则顺序偏置）与 §5（单-pass 多准则干扰）两篇论文所描述的设置，且顺序从未被扰动过——本仓没有任何一次 run 测过「换个顺序会不会变」。

### 2.9 “schema context” 有两条路径，且用了哪条不可知

- **CLI 路径**（正常）：`eval-cli/src/context.ts:670-710` 的 `buildSchemaContext` 逐候选渲染表注释、粒度、**完整列清单**（`name(type, comment)`）；event case 另追加 `renderEventSchemaContext`（`context.ts:385+`，GA-EVAL-EVENTDEF-PREFETCH 加）。
- **runner 兜底**（`agentResponse.schema_context` 缺失时）：`eval-runner/src/runner.ts:337-351` 的 `extractSchemaContext` 只渲染 `- <id> (relevance: <score>)`——**没有一个列名**。

前者下 `field_selection`（“字段名是否存在于所选表中”）可答；后者下不可答。而 §2.7 已证明：**结果文件不记录走了哪条**。

### 2.10 判官对执行是盲的——56.4pp 是「判官 vs 执行」，不是「判官变了」

`SqlJudgeInput` 无任何执行结果字段（`sql_semantic_judge.ts:14-18`），预测判官的分布不应随 `with_query` 变化。实测吻合：`eventdef-judgeonly-v2`（n=98，with_query=False）all-ones 81.6% vs `eventdef-realexec`（n=95，with_query=True）all-ones 85.3%。所以 G1 v3 D4 测出的 56.4pp 是**判官与执行事实的落差**，不是判官在两种模式下行为不同。

### 2.11 R14 的可行性与其污染

`eventdef-realexec.json`（即 pass_rate 5.1% = 2/39 那次真执行 run）有 **95 条 attempt 同时带逐维分数与 `execution_match`，覆盖 35 个 case**——这是**唯一**一份能做「逐维 vs 执行真值」配对分析的文件。但它测在 `rbi-10000251-exec` 上，而该语料的 event case 期望值 **16/18 已与自身 reference SQL 不符**（GA-EVAL-CASESET-EVENT-ANCHOR）。所以 R14 名义上 unblocked，**实际拿到的真值一半是坏的**；n=95 也小。

---

<!-- §3-§6 论文层，逐条引文经作者 grep 回核 -->

> **回核记录**：本文引用的论文原文片段共 **83 条**，全部由作者用 `grep -nF` 对 `.tmp/r8/<id>.txt` 逐条机械回核，行号一并核对。两条初次未命中的已查明原因并确认属实：Table 2 的 `Gemma-3-27B 395.3` 行（subagent 转写时把单空格排版成多空格，**数字逐个相符**）、摘要句「the ordering of the criteria itself shifts」（原文跨行断开，非不存在）。**0 条实质性引证失败。**

## 3. RADAR（2608.01810）：方法是干预式的，所以不能跑在既有数据上

### 3.1 三阶段算法（来源事实）

RADAR「takes a rubric as input and, without human-labelled data, returns a directional coupling matrix over its criteria in three stages」（L175-176 + L116-119）：

1. **Stage 1 — criterion-conditioned 合成干预**。对每个 (task `t`, criterion `Ci`, direction `d ∈ {+,−}`) 抽 `N` 个 probe。prompt **只提目标准则**并要求不要动别的：「The prompt names only the targeted criterion Ci」（L143）、「The generator sees only the target criterion C and a」/「direction d ∈ {+, −}; all other criteria are hidden.」（L518-519）。
2. **Stage 2 — verifier 逐准则打分**。「The verifier is queried n times per probe, indepen-」/「dently per criterion」（L166-167），返回「an integer score Si (x) ∈ {0, 1, 2, 3, 4}」（L169），归一为 `pi = Si/4`。单独调用是刻意的：「Separate calls remove within-」/「prompt ordering and self-consistency effects」（L170-171）。
3. **Stage 3 — 耦合统计**。

| 量 | 定义 | 出处 |
|---|---|---|
| `SelfEffect(Ci)` | `p̄i(i,+) − p̄i(i,−) ∈ [−1,1]` | Eq.1，L201 |
| `GenCoupling(Ci→Cj)` | `p̄j(i,+) − p̄j(i,−)` | L213 |
| **`Leakage(Ci→Cj)`** | `GenCoupling(Ci→Cj) / SelfEffect(Ci)` | Eq.2，L217-219 |
| `SymCoupling` | `½(ℓij + ℓji)` | Eq.3，L185 |
| `Asymmetry` | `ℓij − ℓji` | Eq.4，L191 |
| 跨 task 聚合 | `ℓ̄ij`（均值）、`σij`（标准差） | Eq.5/6，L210/L214 |

**方向性来自哪里**：分子读在 `Cj` 上，分母却用**源**准则 `Ci` 自己的 self-effect 归一，且 probe 集是瞄准 `Ci` 的那一批——所以 `ℓij ≠ ℓji`，二者来自不同 probe 集与不同分母。

### 3.2 审计信号，与唯一的那个数值阈值

- **冗余**＝高 Sym + 低 Asym：「Bidirectional clusters (high symmetric coupling, low asymmetry) mark criteria that move as one latent axis」，例 HelpSteer2 helpfulness/correctness `Sym=0.92, Asym=0.21`（L272-275）。
- **层级**＝高 Asym：HelpSteer2 `coherence → correctness (0.78 vs. 0.22)`（L284）。
- **分布敏感**＝高 `ℓ̄` + 高 `σ`（L216-220）。
- **推不动本身是发现**：「a criterion the generator cannot move and the verifier cannot read (a low self-effect) is too ill-defined to score reliably」（L327-329）。

**全文唯一的数值门是 `τ = 0.40`，而它是可靠性门、不是冗余判据**：「We mark Ci → Cj unreliable when SelfEffect(Ci ) < τ (τ = 0.40, a 1.6-point gap on the 0 to 4 scale」（L229-231）。冗余的阈值原文明确交给使用方：「teams set a policy threshold, inspect coupled pairs above it」（L335）、「Finally, RADAR deliberately stops at diagnosis」（L405）。**所以任何 `Sym > x ⇒ 冗余` 的规则是我们自己的政策，不能挂到论文名下。**

### 3.3 成本

「For a K-criterion rubric, one generator-verifier cell issues 5·K·2·N generation calls and K times as many verifier calls, i.e. 10KN (1+K) model calls in total」（L684-686，其中 `|T|=5` 被硬编码）。降预算：「audit can be run at N = 5 (≈ 1,500 / 1,000 calls) or even N = 1 (≈ 300 / 200 calls)」（L692-693）。K=5、N=5 ⇒ `10·5·5·6 = 1500` 次调用/cell。

### 3.4 「Pearson ≥ 0.84」是二阶相关，且依赖 generator 选择

验证比的是**准则对层面**的两个向量：「we compare RADAR's symmetric coupling SymCoupling(Ci , Cj ) against the human inter-criterion Pearson correlations on the off-diagonal pairs」（L247-249）。HelpSteer2 只有 10 个准则对、SummEval/SumPubMed 各 6 个——所以 `r ≥ 0.84`（L253）是说**RADAR 的耦合值在 6~10 个点上与人类相关结构同序同尺度**，不是说它能预测任何单条人类评分。且该 headline 取自单个 cell（GPT-5.5-R → Sonnet-4.6），Table 9 里最差 cell 低到 `r = −0.04`（L727）。

论文自己承认这个参照系不干净：「Human inter-criterion correlation is an imperfect external reference: it mixes genuine dependence, annotator noise, and dataset-specific co-occurrence」（L384-387）。

### 3.5 三条硬不兼容（映射本仓）

> 前两条是**来源事实的直接比对**，第三条是论文明写的禁止。

| | RADAR 要求 | 本仓现状（§2） | 后果 |
|---|---|---|---|
| **量表** | 整数 0-4，归一 `S/4`（L169、L493-494）；`τ=0.40` 定义为「0-4 上 1.6 分的差距」（L230） | **二值 0/1**（§2.2） | `SelfEffect` 在二值上只能取少数几个值，`τ` 门的语义必须重定义；不能直接照搬 0.40 |
| **调用结构** | **逐准则单独调用**，且刻意如此以消除 prompt 内顺序效应（L166-171） | 五维**一次**调用（§2.8） | 照搬 RADAR 会测到一个**不是生产判官**的判官 |
| **数据** | 新生成的 ±方向配对 probe；每个量都是 `d=+` 与 `d=−` 两个 probe 集之差 | 1495 条**被动观测**向量（§2.4） | 算不出 `Leakage` |

第三条不是我们的推断，是论文的核心主张：「Correlation in observed scores cannot separate criteria the judge treats as one dimension from criteria that merely co-occur in the data; isolating the former requires probing how a judge acts on a rubric under intervention, not just how it scores in aggregate.」（L78-83）；针对用已打分数据的先前工作再说一次：「measure it observationally on already-scored data, which cannot separate criteria a judge treats as one dimension from criteria that merely co-vary」（L141-146）。定性差别也写明：「Varying one criterion and measuring shifts in the others makes this a synthetic intervention rather than passive co-variation.」（L157-159）

### 3.6 因此本仓的观察相关矩阵**不能**当冗余证据（对 §2.5 的自我降级）

在 1495 条向量上算 pairwise φ 相关是可以的，结果如下——但**必须标为降级估计**：

| | table | field | filter | agg | overall |
|---|---|---|---|---|---|
| **table_selection** | 1.000 | 0.634 | 0.396 | 0.281 | 0.552 |
| **field_selection** | 0.634 | 1.000 | 0.379 | 0.490 | 0.632 |
| **filter_conditions** | 0.396 | 0.379 | 1.000 | 0.368 | **0.771** |
| **aggregation_logic** | 0.281 | 0.490 | 0.368 | 1.000 | 0.539 |
| **overall_semantics** | 0.552 | 0.632 | **0.771** | 0.539 | 1.000 |

**为什么它是降级的**：这个矩阵正是 RADAR 用来当对照的 passive baseline——「Synthetic correlation scores unconditioned generations on every criterion and correlates the score columns, the co-variation a rubric shows without any intervention」（L271-273），其 probe「prompt, with no target criterion and no direction」（L651）。而该 baseline 在 Table 2 里的表现是 **HelpSteer2 +0.671 / SummEval −0.111 / SumPubMed +0.765**（L305/L309/L312），对应 RADAR 的 +0.957/+0.842/+0.872——**在 SummEval 上连符号都是反的**。

再加两条本仓特有的削弱：① 83.4% 的向量是全 1（§2.5），φ 完全由那 16.6% 的少数派驱动；② 1495 条池化了 19 次 run，其中 1120 条连执行模式都不可知（§2.7）。

**所以 `filter_conditions ↔ overall_semantics = 0.771` 这个最高耦合值，只能当作「值得用干预探针去验的假设」，不能当作冗余的证据。** 而 §2.6 的读出算术不受此影响——它不是耦合估计，是决策规则的事实。

## 4. 参考答案与顺序：两条直接对撞本仓判官的一手结果

### 4.1 `2608.17938`：参考答案承担几乎全部工作，去掉它分数就通胀

**设计**：语料是 164 个考卷 bundle / 7,121 题，由 frontier 模型在 ingestion 时抽出「每题 + 答案格式 + 逐准则评分标准」（L114-115）；从中抽 24 题，6 个 config 写答案、同 6 个 config 当判官、每张卷判 3 次 ⇒ 「3,456 verdicts, all complete」（L140）。**全程没有人类评分员**：「No human marker scored these answers: valid here means anchored and consistent, and says nothing about agreement with a human examiner」（L497-498）。

**方差分解**（ICC(2,1)，基于三次平均分，L290）：「which answer is being graded explains 95.6 % of score variance. Which judge is grading explains 0.2 %」（L258-259）。

**两个 ablation**（L184-190），这是本方向最有用的一段：

| 臂 | 改了什么 | 结果 |
|---|---|---|
| Arm 1 | 去掉准则与等级，**保留官方答案** | 「Reliability is unchanged: ICC 0.880 with the full rubric, 0.888 with the official answer alone」；判官略松 `+0.016`（L364-365）。原文裁定：「Given the official answer, the elaborate criteria are redundant.」（L366-367） |
| Arm 2 | **连官方答案也去掉** | 「Reliability falls to 0.628」、「Scores inflate by 0.074 of full marks」、判别力中位数掉到 68%、**「The questions whose answers can only be checked against the key collapse to 30–36 %」**（L368-373） |

机制句：「The rubric is what decouples grading from judge intelligence: without it, grading turns back into answering, and capability matters again.」（L400-402）

> **引用纪律（一处必须小心的误读）**：摘要写的 `ICC 0.888 to 0.628` 是 **key-only → 什么都没有**，不是 **full-rubric → 什么都没有**。同一批 12 题的 full-rubric ICC 是 **0.880**（L364）。把 0.888→0.628 说成「有 rubric 到没 rubric」的落差是错的。

**长度偏好这条也值得记**：题内长度-分数秩相关 `+0.60~+0.74` 看着像长度溢价，但跨 writer family 的均值是 `0.875` vs `0.868`（长度差 2.3×，L416-419）——Simpson 反转，「What a rubric-anchored judge pays for is the criteria an answer covers」（L428-429）。

**范围限制**（原文自陈，L495-497）：24 题全部来自台湾地区的三项升学考试（GSAT / AST / TVE，L105-108）、以繁体中文批改；最好的 writer 均分 0.934 已接近天花板；无人类评分员。

**映射本仓**：`SqlJudgeInput` 无参考答案（§2.1）⇒ **本仓判官就跑在 Arm 2 上**——唯一被直接测过的「无参考」代价是 ICC 0.888→0.628 与 `+0.074` 的分数通胀。而语料里 39 个 case **本来就带** `expected.sql`，被 loader 静默丢弃（§2.9、T11）。所以「把参考答案给判官」不是加功能，是**停止丢弃已有资产**。

### 4.2 `2602.02219`：准则顺序本身在移动分数，而二值量表是偏置最高的档

本仓判官对应该文的 **setting 2**：多准则一次 prompt、模型自行在区间内给分、**且无参考答案**（「the HANNA and SummEval datasets do not include a reference answer in the prompt」，L657-659）。

**轴 1（评分档位置）**：χ² 拟合 + Cramér's V。最极端 cell 是 Gemma-3-27B on SummEval：Pos1 `11.5%` vs Pos5 `31.4%`（均匀基线 20%，L381）——**2.7× 的比值纯来自排版顺序**。方向是模型属性且不可先验预测：「GPT-OSS-20B is more first-biased; Gemma-3-27B and Qwen3.5-27B are more last-biased」（L295-299）。

**对本仓最直接的一条**：Cramér's V 按 rubric 分辨率分解（Table 4，L442-447）后，原文写下「coarser binary rubric therefore tends to increase bias; 3- or 5-point is the lower-bias regime」（L451-452）。**本仓正是 `n=2`。**

**轴 2（准则顺序）**：「The bias is pervasive: 56 of 60 (judge, criterion) Friedman tests are significant (all 24 SummEval cells, 32/36 HANNA cells), and the most extreme cell (Qwen3.5-9B on SummEval) shifts a criterion's mean by up to 0.80 points.」（L468-472）——1-5 量表上 0.80 分 = 20% 的量程。Mean Δ 跨 12 个 (judge, dataset) cell 为 0.21–0.53。**连位置偏置近零的 GPT-OSS-120B 也受影响。**

**下游后果**（这是该文最该被本仓听见的一段）：「Across all 18 cells the per-prompt Kendall τ between the two rankings is only 0.67–0.85, and the top-1 candidate flips on 16–39% of prompts. Crucially this is not confined to high-bias judges: GPT-OSS-120B, the lowest-bias judge by χ2 , still shows 17.5–31.2% top-1 reversal」（L522-532）。

**缓解**：balanced 排列与随机排列统计上无差别，「roughly two-thirds of the K=1 → 10 improvement is reached by K=3 and about 85% by K=5」（L386-388）；但「'removing the bias' is mechanical, but 'improving human correlation' is conditional. Permutation helps human agreement only when the judge is strongly biased to begin with.」（L397-400）

**范围限制**：六个判官全是开权重 ≤120B；「Owing to budget constraints, our experiments were not conducted on the most recent closed-source LLMs.」（L532-534）——所以本仓的 qwen3.7-max 上的偏置**必须自己测，不能从它的表里推**。

**映射本仓**：两份 prompt 副本的准则顺序完全一致、`overall_semantics` **恒在末位**，且从未被扰动过（§2.8）。而 §2.6 已证明 `overall_semantics` 是唯一起约束作用的维度。**于是「唯一起约束作用的那一维恒处末位」成了一个从未被测量、却可能移动全部历史数字的自由度。**

## 5. 单-pass 多准则干扰（`2608.14684`）：本仓正好是被指控的那一侧

> map 把这篇记作「SARA」。真标题是 *Mitigating Rubric Interference in LLM Judges via On-Policy Self-Distillation*（§1 修正 1）。对本仓有用的**不是 SARA 本体**（要全参数微调），是它的**测量框架**。

### 5.1 干预定义与不变量

「rubric interference: the verdict on one rubric shifts depending on which other rubrics are co-present」（L33-36）。被违反的不变量是 Eq.1：`M(c, R)[r] = M(c, R′ )[r]  ∀ R, R′ ∋ r`（L201）——同一条准则的判决不应随同场准则集变化。

**不是采样噪声**：「This reflects systematic interference rather than generation noise: all models achieve ≥0.98 self-agreement across repeated evaluations with different random seeds.」（L90-93）

论文把两种模式命名为 **isolation**（一准则一次调用）与 **joint**（全准则一次 pass）。**本仓是 joint。**

### 5.2 四个受控操作（Table 1，L150-153）——可直接照抄的测量协议

| 操作 | 变什么 | 比什么 |
|---|---|---|
| Expansion | 集合规模 1 → n | isolation 判决 vs joint 判决 |
| Subsetting | 集合规模 m → n | 同一准则在小集合 vs 大集合 |
| **Reordering** | 准则顺序 | 同一准则跨排列 |
| Noise | 加入无关准则 | 加噪前 vs 加噪后 |

统计量对全部四项相同：rubric-level agreement、Cohen's κ、sample-level exact match (EM)。协议参数：准则上限 10/样本、shuffle 测试平均 5 个随机排列、贪心解码（L330-336）。**Subsetting 只有定义没有结果**（全文四处提及、无对应表），照抄时可跳过。

### 5.3 与本仓最可比的那一列数字

摘要的「只有 1/3 样本完全一致」出自 HealthBench，而 HealthBench **平均 11.5 条 rubric/样本**（L301）——本仓只有 5 条，**不可照搬**。诚实的类比是 Consistency-at-K 表里的 **K=4** 列（HealthBench，二值格式，与本仓同类），未训练基线（Table 9，L850-856）：

| 判官 | K=2 (Agr/κ/EM) | **K=4 (Agr/κ/EM)** | K=8 (Agr/κ/EM) |
|---|---|---|---|
| Qwen3-8B | .871 / .722 / .754 | **.844 / .672 / .515** | .843 / .675 / .266 |
| Qwen3-14B | .901 / .802 / .806 | **.890 / .779 / .635** | .874 / .746 / .355 |
| Qwen3-32B | .895 / .789 / .796 | **.882 / .763 / .600** | .884 / .768 / .350 |
| Llama-3.1-8B | .797 / .594 / .627 | **.749 / .498 / .309** | .733 / .469 / .094 |

读法：**K=4 时，样本级 EM 只有 .309–.635**——即仅仅因为「同场还有其他准则」，1/3 到 2/3 的样本里至少有一条准则的判决翻转。且干扰是**分散的**而非集中在少数难准则：「baseline interference is not concentrated on a few hard rubrics but scattered across many—a single flipped rubric per sample suffices to break exact match」（L381-384）。

**对本仓 0.6 阈值的直接后果**：单条准则翻转就能让样本跨过 3-of-5 阈值（真值恰为 3 时 pass→fail，恰为 2 时 fail→pass）。**论文不研究阈值化聚合，所以「翻转跨阈率」是我们自己要测的量**，但它的输入（逐准则翻转率）正是这张表测的。

### 5.4 SARA 本体不适用，测量框架适用

SARA 要全参数微调（EMA decay 0.999、symmetric JSD、KL preservation，L325-329）+ 8×H20（L337-339）。本仓调用托管模型，不训判官 ⇒ **SARA 本体出局**。但原文明确把框架单列：「The measurement framework itself can also serve as a diagnostic protocol for any multi-rubric judge before deployment.」（L550-553）

### 5.5 一条必须一起搬的限制

「SARA treats isolation verdicts as interference-free anchors. This assumption is supported by the high self-agreement of isolation judgments (≥0.98 across all models), but isolation is not infallible. In some cases, co-evaluating related rubrics may surface useful context that improves judgment quality. Our framework does not distinguish beneficial context from harmful interference.」（L572-583）

**所以 joint-vs-isolation 的差只测「不稳定」，不测「谁对」。** 要判方向必须有真值——在本仓即执行事实，也就是 T1。这条决定了 R20 的探针不能单独给出「该改成哪样」的结论。

## 6. 组合、读出，与 pointwise/pairwise 不一致

### 6.1 GSR（`2608.12097`）：gate 不是早退，且从未与 unweighted mean 比过

**gate 的语义**是对**已算出**的判断施加 cap/mask/veto——「factuality and completeness can be reduced before a safety flag gates the result, preventing later positive evidence from overriding the cap」（L164-166）。**它不跳过下游准则**：「After the criterion-level judgments are available, operators run in a topological order of G.」（L327），且每个准则节点必须可达 sink（L286-287）。⇒ **gating 省不了判官 token**；任何「gate 失败就跳过其余准则以省钱」的论证在这篇里没有依据。

**成本**：pointwise 每候选 k 个 judgment、pairwise 2k（L31-33、L384-385）；但论文**不给 LLM 调用数**，且明确允许候选联合评：「The candidate-aligned vector can be produced by evaluating candidates separately or jointly」（L322-324）。所以 GSR 既不承诺保住本仓的单调用预算，也不禁止它。

**效应量必须分清两个 baseline**：

| 对照 | Exact Agreement 增益 | 出处 |
|---|---|---|
| vs Prometheus-style（**整体式**打分） | **+0.62 ~ +6.75 pp** | 摘要 L33-35 |
| vs flat **weighted** 聚合（**同一批 criterion trace**） | **+0.36 ~ +5.79 pp** | L531-535 |

第二行才是「组合方式」的干净对照——「Because the latter comparison reuses the same criterion-level traces, these differences isolate composition and Readout rather than criterion elicitation」（L533-535）。而且 flat 规则**没有被压倒**：「The flat weighted variant still has better Within-1 Accuracy on BiGGen and HelpSteer2, a marginally lower MAE on HelpSteer2, and sometimes stronger correlation」（L539-541）。六次运行的 Exact Agreement 标准差是 0.45–0.84pp，所以 +0.36 / +0.99 这类边际本身在 1–2σ 内。

**两项 NOT IN PAPER**（对本仓恰好都是要紧的）：① 从未测 **unweighted** mean（被测的是 flat *weighted* 规则）；② 从未测**阈值化**聚合，全部 pointwise 目标是 1-5 序数。**所以「flat mean 是坏聚合器」在本仓配置下是方向性支持、定量未证。**

不过有一条定性论证干净地迁移：非补偿性。一个 veto 型准则在任何均值下都可以被其他准则投票推翻——这正是 §2.6 实测到的 128 条（8.56%）。**这条论证来自准则语义，不来自 GSR 的效应量。**

另：GSR 不修准则层判断本身（「it does not replace or correct the semantic judgments produced at criterion nodes」，L616-620），且效应非 backbone 不变（同处）。

### 6.2 TrustJudge（`2509.21117`）：修正 map 的转述，并读出对本仓最重的一条

map 记作「pointwise vs pairwise 23.32% 不一致」。**四处需要收紧**：

1. **CR 的定义含三个析取项**（Def. 2.1 / Eq.1，L173-176）：`(Sx > Sy ∧ C ≤ 0) ∨ (Sx < Sy ∧ C ≥ 0) ∨ (Sx = Sy ∧ C ≠ 0)`。后两类里有**平局不匹配**，不是偏好反转。所以「不一致」不等于「打分与两两比较打架」。
2. **条件**：judge = Llama-3.1-70B-Instruct、**1-5 raw scale**（L367）、作者自建的 10.8k pair 数据集（MT-Bench 80 题 + ArenaHard 500 题，L329-330），且**刻意做成每个评分档均匀分布**：「ensuring uniform score distributions across every rating level」（L350）——不是自然分布。
3. **同一个 23.32% 在 Appendix G 里是另一个实验**：「CR drops from 23.32% to 20.63% with distribution-sensitive scoring」（L1154，24 个 category×judge cell 的均值、判官为 7B/8B/9B 级）。引用时必须指明是 Table 1 的 14.89% 还是 Appendix G 的 20.63%。
4. 摘要的 `15.22% → 4.40%` 是 **NTR@k=5**，不是 k=4（Table 1 同行，L450）。

**对本仓最重的一条不是那个百分数，而是论文的中心论点**：粗量表丢信息。「increasing the scoring scale from 5 to 100 points consistently reduces the Conflict Ratios」（L524）。**本仓是二值——比它批评的 5 级还粗一档，而论文从未测过二值**（score set 一律是 1-5 / 10 / 100）。

**两个机制都不能直接用**：distribution-sensitive scoring 与 likelihood-aware aggregation 都要 token 级 logprob（实验用 vLLM「providing the top 20 log probabilities for each generated token」，L991）。托管 API 只回文本时，两者都无法实现。

**另一条与本仓 5 维直接相关**：Appendix F 把判官扩到 factuality / coherence / helpfulness 三个子维度时，**每个子维度用各自的 prompt 独立评、指标各自算再平均指标**（L1001-1005、L1015-1018）；per-dimension 的 CR 基线是 **45.7–52.2%**（Table 5，L1104-1108：Gemma-2-27b-it 49.43 / Qwen2.5-32B 45.73 / Llama-3.1-70B 52.20），远高于单一综合分的 23–37%。而**全文没有任何把多维分数合成一个综合分的规则**（NOT IN PAPER）。

> ⚠ **本节初稿在这里多写了一句「这一整片文献里没人背书把逐维分数塌成综合分再卡阈值」，该句已于 2026-09-11 被证伪并删除——见 [§9](#9-2026-09-11-文献补搜r8-的一处负空间结论被证伪)。** 对 TrustJudge 这一篇的陈述（它自己不给合成规则）不受影响。

---

## 7. 交付：G8 要裁什么，R20 要跑什么

### 7.1 论文已经替 G8 裁掉的（不必再 grill）

1. **「五维 flat mean + 0.6」不是可辩护的读出。** 但**理由不是论文**——GSR 从未测 unweighted mean、也从未测阈值化聚合（§6.1）。理由是本仓 §2.6 的实测：1495 条向量里 `overall_semantics == 1` 却被判 FAIL 的有 **0 条**，`== 0` 却被判 PASS 的有 **128 条（8.56%）**，且 `P(四机械维全 1 | overall=1) = 0.9984`。四个机械维度在决策上只充当推翻票。**G8 可以把这条当既成事实接受。**
2. **判官必须拿到参考答案。** `2608.17938` 的 Arm 2 是唯一直接测过「无参考」代价的实验：ICC `0.888 → 0.628`、分数通胀 `+0.074`、只能靠答案核对的题判别力掉到 `30–36%`（§4.1）。而本仓 39 个 case 的 `expected.sql` 正被 loader 丢弃 ⇒ **这与 T11 是同一块工作，不是新方向。**
3. **二值量表是错的方向。** 两条互相独立的证据同向：`2602.02219` Table 4 的「coarser binary rubric therefore tends to increase bias」（L451-452），与 TrustJudge 的 5→100 分持续降低 CR（L524）。
4. **pairwise 不是免费替代。** 换成 pairwise 会引入 transitivity 与 tie 两类**新**不一致（TrustJudge Def. 2.2），而 GSR 的 pairwise「最高」优势（+0.77 / +0.28）落在 1σ（0.30 / 0.51）内。方向 8 名字里的 pairwise，**在一手证据上是本方向最弱的一条支线**。

### 7.2 G8 真正要裁的（论文管不了，须本仓自定）

1. **读出形状**：`overall_semantics` 单闸门（四维降级为诊断信息、不进读出）还是 GSR 式 typed graph（gate / reduce / readout）？§2.6 显示「四维不进读出」在当前数据上是**零损失**变更（0/1495 反例）——但判官一旦拿到参考答案，四维行为会变，所以顺序很重要。
2. **参考答案的形态**：`expected.sql` 文本、执行结果集，还是两者？与 G1b 的 provenance 决议耦合。
3. **量表**：换 0-4（RADAR/SARA 兼容）还是保留二值 + gating？换量表会让 1495 条历史向量不可比——**但那批已因 D4/D6 全体失效，所以现在是免费的换锚时机**。
4. **准则顺序与调用结构**：维持五维一次调用，还是逐准则单独调用（RADAR 与 SARA-isolation 的做法）？后者 ×5 成本，且改变被测对象本身。
5. **证据落盘** — 建议**不由 G8 裁**：判官的 `schema_context`、prompt 变体、量表版本是否入 artifact（§2.7 现为 0/80）。这与 G1 D3 的 artifact 决议同类，应并入 **T1 的 artifact schema**，否则 judge 侧会重演一次「模式不可恢复」。

### 7.3 R20 的可执行规格（本票主要交付）

> **map 对 R20 的描述有三处不成立**：「RADAR 跑现 5 维 / 既有数据分析 / quick win」。
> (a) RADAR **不能**跑既有数据——它的每个量都是 `d=+` 与 `d=−` 两个 probe 集之差，论文明写观察相关无法识别耦合（§3.5）；用既有数据能算的恰是它要打败的 passive baseline，而该 baseline 在 SummEval 上**符号都是反的**（§3.6）。
> (b) RADAR 的量表是 0-4，本仓是二值。
> (c) RADAR 的 verifier **逐准则单独调用**，本仓单调用——照搬会测到一个不是生产判官的判官。

因此 R20 拆成四个探针，按性价比排序，**前三个互不依赖**：

| 探针 | 做什么 | LLM 调用成本 | 前置 |
|---|---|---|---|
| **R20a 读出算术复核** | 已完成于本票 §2.6 | **0** | 无 |
| **R20b 顺序扰动** | 同一批 SQL、同一判官，K=3~5 个准则顺序排列，报逐维边际漂移 + Agr/κ/EM | `(K−1)×N` | 无 |
| **R20c isolation-vs-joint** | 五维各自单调用 vs 现行单调用，报 Agr、Cohen's κ、sample-level EM | `5N`（joint 侧已有） | 无 |
| **R20d 真 RADAR** | 生成 ±方向 probe、逐准则打分、算 Leakage 矩阵 | `10KN(1+K)`；K=5,N=5 ⇒ **≈1500/cell** | 须先改量表 + 改调用结构 |

**R20a**：结论已在手，建议直接把 §2.6 写进 R20 的 resolution，**不再另跑**；剩下的唯一工作是把脚本固化进仓（`packages/eval/eval-cli/dev/judge-readout-audit.mjs`）以便回归时复算。

**R20b**：这是**唯一能测「`overall_semantics` 恒在末位」这个自由度**的探针（§2.8 + §4.2）。K 取 3~5 有一手依据：balanced 与 random 统计上无差别，K=3 拿到约 2/3 收益、K=5 约 85%（L386-388）。判据是逐维边际的移动量 + 跨排列 EM，**不是单一阈值**。

**R20c**：与 SARA Table 9 的 **K=4 列**（Agr .749–.890 / EM .309–.635，§5.3）对照。它同时是 R20d 的前置——RADAR Stage 2 本来就是逐准则单调用，所以 R20c 的 isolation 侧**就是** RADAR 所需的判官形态。注意 §5.5 的限制：joint-vs-isolation 的差只测不稳定性、不测谁对，**要判方向必须等 T1 的执行真值**。

**R20d**：只有在量表改 0-4、判官改逐准则调用之后才有意义。另有一处**必须自己承担的偏离**：论文排除 generator=verifier 自配对以避开 self-preference（L254-255），而本仓只有一个可用模型 ⇒ 自配对不可避免，须在结论里标注。

**样本从哪来（这是三个探针便宜的真正原因）**：1495 条向量对应的 `generated_sql` 已落盘在 attempt 记录里（§2.7 的键表含 `generated_sql`），所以**不必重跑 agent，只重跑判官**。

**阈值纪律**：论文没给任何冗余阈值（L335、L405），全文唯一数值门 `τ=0.40` 是可靠性门。任何 `Sym > x ⇒ 冗余` 的规则**是我们自定的政策，必须在产物里标明**。

### 7.4 与方向 2 / 3 的边界（避免 G2 / G3 / G8 各裁一次同一件事）

- **「给判官参考答案」属方向 2（blind-solve-then-score）的核心，但 `2608.17938` 把它讲得更强**：不需要 blind-solve，**只要有官方答案**；blind-solve 是「没有答案时制造一个」。所以二者的正确关系是——**有 `expected.sql` 的 case 走 reference-anchored（便宜、已被直接测过）；没有的才走 blind-solve（贵、未验证）**。这条应写进 G2 的题面，否则 G2 会把 R8 已确立的事重新论证一遍。
- **「逐维 TPR/FPR 校准」属方向 3 / R14**。§2.11：唯一能做配对分析的文件只有 `eventdef-realexec.json`，n=95 / 35 case，且其真值受 event anchor 污染（16/18 期望值失效）。⇒ **R14 的规格应改为「T11 之后、在重建的 EXECUTION 语料上做」**，否则算出的逐维 FPR 是对坏真值的 FPR。
- **归属建议**：读出形状与量表 → G8；参考答案的形态 → G1b（与 provenance 同票）；artifact 落盘 → T1；逐维校准 → R14（改前置）。

---

## 8. 对 map 的具体修改建议

1. **§Frontier directions 方向 8 的论文行**改两处标题：`2608.14684` 真标题为 *Mitigating Rubric Interference in LLM Judges via On-Policy Self-Distillation*（SARA 是方法名）；`2602.02219` 的内容是**rubric-based 评测的位置偏置**，不是 pointwise/pairwise 之争。
2. **方向 8 的「Quick win」表述要改**：RADAR 不能跑既有数据（§3.5）。quick win 是 §2.6 的读出算术（已完成）+ R20b/R20c 两个便宜探针；真 RADAR 是有前置的贵探针。
3. **TrustJudge 的 gist 收紧**为「Llama-3.1-70B-Instruct、1-5 raw scale、自建 10.8k pair 均匀分布数据集上的 Score-Comparison Conflict Ratio 23.32%（含平局不匹配）」。
4. **§⚠ 验证 TODO**：方向 8 的 6 篇已由本票 primary-fetch（arXiv API 元数据 + PDF 全文）确认，可从「primary-URL-confirmed」升级为「元数据+全文已认读」。
5. **§Not yet specified 第 2 条（BM25 当 schema context）可以收紧**：§2.9 查出它有两条路径（CLI 路径含真实列清单、runner 兜底只有 id + relevance），而**结果文件不记录走了哪条**（§2.7）。所以「它在假通过里占多少」在 artifact 补齐之前**结构上无法回答**，不只是缺 R14 的分维分解。

---

## 9. 2026-09-11 文献补搜：R8 的一处负空间结论被证伪

> **为什么补搜**：R8 的六篇是沿 map 方向 8 原有的论文行读的。一篇都不研究「二值准则 + 阈值化聚合」是事实，但由此推出「**整片文献**无人研究」是一次**从样本到全称的跳跃**，而那六篇的取样并非为回答这个问题而设计。补搜正是为了检验这一跳跃。结论：**跳错了。**
>
> **候选清单在 [`lit-gap-2026-09-11.md`](lit-gap-2026-09-11.md)**：50 个已验真 ID（按四个洞分组，含元数据原文标题、日期、subagent 自报证据等级）、四条裁决、两条空结果、R8b 的读序建议。本节只写结论与对产物的影响，**不重复那份清单**。

### 9.1 身份核验（本轮新增）

第二轮批量查 `export.arxiv.org`，`totalResults=8`，**8/8 真实，且 8/8 标题与检索所报逐字一致**：`2510.11822`、`2603.28005`、`2505.08775`、`2406.12624`、`2607.29252`、`2606.27226`、`2606.30931`、`2603.25133`。种子批另有 8/8 真实（`2606.00093`、`2606.03361`、`2603.00077`、`2602.05125`、`2605.30568`、`2606.08625`、`2606.29920`、`2412.05579`）。

**本轮撞到「元数据标题 ≠ 渲染标题」**：`2606.00093` 元数据为 *Agreement Metrics for LLM-as-Judge Evaluation*，`arxiv.org/html/` 渲染为 *Agreement Measurement for Rubric-based LLM Judges*，同作者同摘要。作者一度据「元数据权威」误判二手来源写错标题——**是自己判错了**。已写入 map §⚠ 验证 TODO。同时复核了另两条同型修正：`2606.30851` 渲染标题确实不含 “GradeSQL”、`2608.14684` 确实不含 “SARA”，R1 v3 与 R8 §1 的修正**成立**。

### 9.2 被证伪的部分

**[GEAR（2606.03361）](https://arxiv.org/abs/2606.03361) 直接做了我们声称无人做的事**（摘要层，全文认读归 R8b）：

- 每个准则是隐 **Bernoulli** 事件——**全程二值**；
- baseline 就是 **flat 聚合 vs 确定性 gating** 的头对头（HealthBench / WritingBench / PLawBench，两 backbone）；
- 把我们叫「漏」的量就叫 **leakage**，把失效模式命名为 **False Credit Propagation**：「flat scalarization ... allow[s] reward or penalty to be counted even when the condition that licenses it is absent」；
- 报告 GEAR 相对 flat 提升最多 15.5%、leakage 削减 **96.5%**，且「preserving more licensed downstream utility than **deterministic gating**」——**连 gating 的代价也测了**，正是对「改成单维闸门」的第一个反驳。

另两条削弱：`2510.11822` 优化 **minority-veto** 并测出判官 TPR 96% / **TNR < 25%**、多数投票不足；`2606.00093` 命名 **item-level aggregation** 走「rubric 的权重与 **decision rule**」，并测出仅换池化口径就把准确率从 **0.551 推到 0.899**。

### 9.3 仍然站得住的部分（更窄）

- **层级不同**：GEAR 聚合的是 **RL 奖励**且需要人写的 prerequisite 图；`2510.11822` 与 `2606.30931` 投票是跨**判官**、不是跨**准则**；`2606.00093` 命名了 decision rule 但测在**序数 1-4** 数据上，且它谈的是**报告**一致性、不是**裁决**通过与否。
- **二值 rubric 实际怎么打分的两个参照点都没有阈值**：HealthBench（`2505.08775`）是加权点数归一化、**根本没有 pass/fail 阈值**；Autorubric（`2603.00077`）跨准则是加权和、clamp 到 [0,1]、**无阈值，且四条投票规则从不跨准则用、也从未头对头比较**（其 majority/unanimous/any-vote 是**判官之间**对**同一条准则**投票——补搜推翻了检索摘要对这篇的转述）。
  ⇒ **「单次 prompt 内二值准则的固定 k-of-n 截断」在文献里没有依据：没被辩护，也没被攻击。**
- `2603.28005` 是唯一 holistic vs 原子分解的头对头：**holistic 在三个基准里两个胜出**，优势集中于「不完整性检测」——本仓论点的经验背书。但它把两者当**独立条件**比，从未让一个去推翻另一个。

### 9.4 结论：重构，不是撤退

**删除**「无人研究二值 + 阈值化聚合」。**改为**：

> 没有人测量过「**单个判官 prompt 内，holistic 准则被同场机械子准则投票推翻**」，更没有人在**生产落盘的判决**上测过。本仓的 **8.56pp 漏**与「holistic 判否时仍有 **52.03%** 通过」是自有贡献；**GEAR 的 leakage 指标是表达它的现成量纲**，`2606.00093` 提供「item-level aggregation / decision rule」的词汇。

对 G8 的净影响是**变好不是变坏**：先前 G8 要在无先例的情况下自定政策；现在 GEAR 提供了一个**已发表的、量化过 gating 收益与代价**的对照，`2510.11822` 提供 veto 的优化形态。**G8 的第 1 决策（读出形状）从「自己发明」降级为「在已知方案中选并说明差异」。**

### 9.5 未尽（→ R8b）

摘要层证据不进决策。GEAR / `2606.00093` / `2510.11822` / `2603.28005` 四篇需按本文 §0 的标准全文认读，重点两问：① GEAR 的 leakage 形式定义能否**逐字套用**在本仓 1495 条判决上；② 其 prerequisite 图是必须人写还是可归纳——若必须人写，本仓 5 维的图就是 G8 要裁的东西之一。

### 9.6 判官证据落盘（§2.7 的 0/80）：**需求是民间传说，唯一真先例是代码不是论文**

同轮另一路补搜（12 候选全 grade A，10/10 ID 经元数据验真、标题逐字一致）的裁决：**没有人写下过「一次 LLM-judge 评测必须持久化什么才算可审计」**。2026 的文献分三堆，每堆都差一步：

| 堆 | 代表 | 差在哪 |
|---|---|---|
| card / schema | `2606.09809`(Evaluation Cards, 48 作者)、`2606.14516`(Every Eval Ever, 48 作者)、`2604.03244` | 标准化的是**配置与 item 级响应**；`2606.14516` 把 per-instance 输出列为**可选**，且 judge prompt / rubric / grader 元数据**根本不是字段** |
| judge 质量 | `2606.15610`(Judge Datasheet)、`2607.08535` | 把**判官当仪器**来刻画，不把**这次运行当记录** |
| 漂移 | `2606.15474`、`2606.29719` | 证明问题真实（端点钉死的 GPT-4o 结论**约 6 周后自我反转**；静默版本升级被判为 judge drift 60/60），但把保留需求框成**统计需要**而非审计需要 |

**最接近的一篇仍是 `2606.00093`**：它的核心结果直接指控「只存分数」——**仅仅改变协议口径就把报告准确率从 0.551 推到 0.899、并让 Cohen's κ 跨过零，「without altering a single verdict」**。这个结果**只有在逐准则判决被持久化的前提下才算得出来**，且其附件确实发布了逐准则判决表与重扫脚本。但它把这件事论证成**测量效度**，把离线重聚合当作**演示**而非**要求**。`2607.08535` 是唯一把 "protocol audit trails" 写进判官报告建议的，只有一句、未展开。

**真正的先例是工程**：Inspect AI（UK AISI）已经把 elicitation 与 scoring 拆成一等公民——`inspect eval --no-score` 产出未打分的 log，`inspect score <log>.eval --scorer` 事后用**另一个** scorer 打分，`action="append"` 保留新旧两套结果；grader panel 的**个体投票记录在 `Score.metadata` 的 `panel` 下**。

**但即使在那里，我们的洞仍以更锐利的形式存在**（这两条是本仓要自己承担的）：

1. 用 `model_graded_qa` 重打分**仍会重新调用 grader**——log 让**候选 rollout** 可重放，不是让**过去的判官判决**可重放。只有当逐准则判决已经在 `Score.metadata` 里时，才算「不调模型就能按新政策重算」。
2. append 模式的指标由新 scorer 独立计算（"the original eval's metric configuration is not applied to the appended scorer"）——**聚合政策本身不是一个被版本化、可重新施加的 artifact**。

⇒ **对 T1 的直接后果**：judge 侧 artifact schema 不必从零设计，可照 Inspect AI 的 `--no-score` / `score --scorer` / `action=append` 三段式取形；但要补上它也没有的那一半——**把逐准则判决与读出政策分开落盘，使「换政策重算」不需要任何模型调用**。这正是本仓 [R20 探针 a](../tickets/R20-judge-readout-probes.md) 已经在 1495 条向量上做到的事（零 LLM 调用重算读出），所以本仓其实**已经有了那一半的工作实例**，缺的是把它写进 artifact 契约。

> **证据等级**：本节为 **abs 页 + 一手文档源**（Inspect AI 文档站 403，改读仓库内 `docs/scoring-workflow.qmd` 等 `.qmd` 源）。**未达全文认读标准**，进 T1 设计前须复核 `2606.00093` 与 Inspect 的实际字段。

### 9.7 顺序与分解：一个洞坐实、一个洞有风险、外加一条改变 G8 的机制

同轮第三路补搜（12 候选 / 9 grade-A）。**6 个新 ID 经元数据验真全部真实**，并抓到 **1 处实质引证错误**（见 9.8）。

**① 洞 A（有参考答案时的准则顺序偏置）坐实，但不是「应该会被抑制」**

最接近的 `2602.16802`（*References Improve LLM Alignment in Non-Verifiable Domains*）加参考答案确有收益（79.1% vs 72.3% reference-free；判官间一致 76.6%→81.4%），**但它在交换顺序上取平均**——把位置偏置**控制掉了而不是测量它**。而 `2601.07506`（*Judging Against the Reference: Uncovering Knowledge-Driven Failures in LLM-Judges on QA Evaluation*）与 `2609.02942`（rubric artifacts：仅用 rubric 文本训的分类器能非平凡地预测判官输出；反转响应**或反转准则**时判官常不更新）两篇独立显示：**判官经常并不真的以交给它的参考/准则为条件**。

⇒ 诚实的表述不是「grounding 应该抑制顺序偏置」，而是「**没人查过，而且有具体证据显示答案可能是否**」。**并由此得到一条对本仓的设计要求：给判官参考答案的实验必须自带「操纵检查」，证明判官真的在用它**——否则测不出是 grounding 无效还是根本没生效。

**② 洞 B（一次调用 vs N 次调用的质量+成本联合定价）有真风险，不要假设它还开着**

- `2606.29920`（EMNLP 2026，RuVerBench）**已明写** "batched verification presents a trade-off between accuracy and efficiency"，且带 **2,458 条人工标注**、在前沿判官上；
- `2511.21662`（Multi-Crit，CVPR 2026）比较 **K 次单准则推理 vs 联合判断**，并把机制命名为 **correlation leakage**——一次 pass 里自回归生成多个准则判决会诱发准则间依赖、把判官推向同一偏好方向（**与 `2608.14684` 的 "interference" 是同一现象的两次独立命名**）；
- `2603.00077`(Autorubric) **可能已含 prefix-caching 下成本次线性的论证**（该条为 grade C 片段，未证）——**若成立，N 次调用不等于 N 倍成本，本仓「×5 成本」的假设就要重算**，问题会收窄到只剩质量。

⇒ **R20 探针 c 的成本估算（`5N`）在读完 `2606.29920` 与 `2603.00077` 全文前不能当定论。**

**③ 一条机制，直接改变 G8 第 4 决策的预期**

`2608.25869`（*Anchoring Bias in LLM-as-a-Judge Systems: Prior Scores Compromise Evaluation Independence*）：**192,000 次尝试 / 185,271 次成功评测**；上下文里先出现的分数会把后一次判断拖向它，峰值 **|Cohen's d| = 0.71**，8 个模型里 **7 个**的 bootstrap 区间整体低于零；带人工标注的第二项研究里，锚定元数据**阻止了 48% 的纠错**、并把 **10.18%** 本来正确的判决翻成错的。**CoT 无效，明确写「请忽略该元数据」也无效。** token 概率探测显示效应是**阈值式而非渐变式**——加不加锚定信息影响大，锚定值取多少影响小。

**这正是本仓 prompt 的结构**：五维在同一次调用里**顺序**输出一个 JSON，准则 1 的分数在准则 2 被打分前已进入上下文，一路到准则 5，而顺序从未被扰动过（§2.8）。

⇒ **可检验的预测：对准则干扰做 prompt 层面的修补（换顺序、加"独立判断"指令、加 CoT）预计无效。** 若成立，G8 第 4 决策（调用结构）就不是「二选一」而是「**只有拆调用是真修复**」。这条预测便宜且可证伪——**R20 探针 b 的价值因此改变**：b 不再是「找出更好的顺序」，而是「**检验 prompt 层面能不能修**」。
⇒ 另一条派生预测（源自阈值式效应）：**先前分数的「有无」比其「取值」重要得多**——所以 b 应当把「五维同调用（有先前分数） vs 逐维单调用（无）」当主对比，而非在多个排列之间比较。

**④ 一处必须改的框架表述，外加一条指标警告**

- **不要再说「前沿判官未被测试」。** `2606.19544`（*Reliability without Validity*，**21 个判官 / 9 个供应商 / 118 次 run / 约 541,000 条判决**，明确覆盖「April 2026 frontier」）与 `2604.24074`（28,812 条判决，判官固定为 Claude Sonnet 4-6）都测了。**可辩护的表述收窄为：没人在前沿判官上测过*准则顺序***，要引的具体限制是 `2602.02219` 的 ≤120B 开权重上限。
- **`2606.19544` 的「一致性–偏置悖论」替我们挡掉最便宜的反驳**：两个**生产部署**的判官上，test-retest 可靠性 **>0.95** 与位置偏置 **>0.10** 并存。⇒「我们重跑了一遍结果一样，所以它是稳的」**不成立**——重测一致性与置换稳健性是两种不同性质。
- **指标警告**：同篇测出 exact-match 与 Cohen's κ 之间的 κ 通缩在 MT-Bench 上普遍达 **33–41pp**，原文称 exact-match「systematically overstates discriminative ability」。⇒ **R20 探针 b/c 不能只报原始 exact-match 一致率**，须同时报 κ（这与 §9.6 的 `2606.00093` 要求一致）。
- **文献自相矛盾一处，引用时必须分清构造**：`2604.23178` 报位置偏置 **≤0.04**，`2606.19544` 报生产判官 **>0.10**。前者测的是**响应位置**、后者是别的口径，**都不是准则顺序**——三者不可混引。

### 9.8 本轮抓到的引证错误（保留记录）

- **`2608.25869` 被挂错标题**：subagent 的条目标题写作 *References Improve LLM Alignment in Non-Verifiable Domains*，而该标题实属 **`2602.16802`**（Kejian Shi / Yixin Liu / … / Arman Cohan）。`2608.25869` 的真标题是 *Anchoring Bias in LLM-as-a-Judge Systems: Prior Scores Compromise Evaluation Independence*。**内容描述与真标题吻合，所以是「ID 对、标题张冠李戴」**——正是本仓引证纪律要拦的那一类。
- **`2601.08654` 被二手来源叫作 "RULERS"**，真标题是 *From Rubrics to Reliable Scores: Evidence-Grounded Text Evaluation with LLM Judges*。**这是本 effort 第四次撞上「方法名 ≠ 标题」**（GradeSQL / SARA / RRD / RULERS）——该 subagent 把它标为 grade C 并写明「未见过页面、勿直接引用」，**标得对**。
- 本 session 引证核验累计 **118 次**（R8 六篇全文引文 83 + 补搜 ID 元数据 35），其中实质错误 1 处、称法偏差若干、**0 处臆造 ID**。

### 9.9 参考锚定的 SQL 判官：实验**只做过一次**，而且锚本身是烂的

第四路补搜（12 候选 / 11 grade-A；5 个新 ID 验真全部真实）。

**① 直接对应物存在，但不是 2026 年的，而且只此一次** ✅ **已于 2026-09-11 由本文作者从 PDF 全文重导——本条已升到全文层**

`2409.19014`（**FLEX: Expert-level False-Less EXecution Metric for Reliable Text-to-SQL Benchmark**，2024-09-24，5 作者）把 judge 与专家共识的一致度从 EX 的 62 提到 **Cohen's κ 87.04**。

**Table 5 全表（`pdftotext` L411-415 逐字重导）**，基线为最优上下文 `C_FLEX`（Table 4 首行 87.04 / 93.5 / 88 / 99）：

| Ablation Settings | Kappa | Acc | EQ | NEQ |
|---|---|---|---|---|
| w/o Question | 80.10 | 90.0 | 84 | 96 |
| w/o Knowledge | 79.09 | 89.5 | 82 | 97 |
| w/o Criteria | 74.08 | 87.0 | 81 | 93 |
| **w/o Ground Truth** | **29.36** | **64.0** | **72** | **56** |

**拿掉问题 / 知识 / 评分准则，κ 只掉 7–13 分；拿掉 ground truth，掉 58 分。** 原文结论逐字（L436-438）：「Removing **the ground truth query and results** is the most significant factor, causing a substantial performance drop across all metrics. **This underscores the importance of a reliable reference point in LLM-based text-to-SQL evaluations.**」

**「w/o Ground Truth」的确切含义**（L344 上下文定义）：`C_FLEX` 含 question x、generated query `Qgen(x)`、**ground truth query `Qgt(x)`**、execution result；该 ablation 把 **gold query 与其结果两者**一并移除。

**最要紧的是最后两列，而不是 κ。** `EQ` = 等价集准确率（生成 SQL **本来就对**），`NEQ` = 非等价集准确率（生成 SQL **本来就错**）（L226 原文定义）：

```
                EQ（确认对的）   NEQ（识别错的）
完整上下文            88              99
w/o Ground Truth      72              56      ← 几乎退到抛硬币
```

⇒ **没有 gold，判官「确认对的」只掉 16 分，「识别错的」掉 43 分。** 这正是假通过的机制被直接测出来——**不对称地丧失拒绝能力**，与本仓 judge-only 61.5% vs real-exec 5.1% 的形状同类。**这是目前对本仓 56.4pp 最贴近的一手解释。**

**样本与标注**（L265-274 重导，**修正此前转述**）：n=200 条，**均分**为 Equivalent / Not-equivalent 两半（**刻意平衡，非自然分布**——与 TrustJudge 自建集同一类保留意见）；**三位有 3 年以上经验的 SQL 专家**独立评定、分歧经共识解决，标注者间 **Fleiss' κ = 79.32**。⚠ 此前本文据 subagent 转述写作「标注者是该文自己的三位作者」——**该处所读段落并未如此陈述**，已更正为上述原文表述。

⇒ 所以「无人研究」的答案是 **否——但只研究过一次，且至今无人复现**。
⇒ **`78.17` 这个疑似冲突的数，在全文中一次都没有出现**（`grep -n "78.17"` 零命中）——subagent 自报在二手片段里见到的那个数**不属于本篇**。原「须重导」的警示**已解除**。

**② 2026 年这条线全部绕过了这个问题**

reference-free 路线有一致且难看的天花板——`2608.17795`（*TraceSQL: Traceable Answerability Estimation for Reference-Free Text-to-SQL Verification*，BIRD 上 ROC-AUC 64.48）、`2607.06799`（*What Predicts Correctness in Text-to-SQL? A Selective-Prediction Study*）、`2503.11984`（*NL2SQL-BUGs*，检测准确率 75.16%）、`2604.28049`（*Agent-Agnostic Evaluation of SQL Accuracy in Production Text-to-SQL Systems*，无一致度数字）——**这独立佐证了本仓的 56.4pp 落差**。但**每一篇都是拿 reference-free 跟另一个 reference-free 比，从不把 gold 喂给判官**。最锐利的例子是 `2607.06799`：它分别 ablate 了 question / schema / evidence，**却只把 gold query 用于制造标签，一次都没交给判官**。⇒ **gold-conditioned 这一臂在该领域最强的论文里是缺的，不是因为试过失败，而是没人想到要跑。**

**③ 但锚本身是烂的——这条外部证据与本仓的 anchor 事故是同一回事**

- CIDR '26 测出 gold 标注错误率 **52.8%（BIRD Mini-Dev）/ 66.1%（Spider 2.0-Snow）**；
- SpotIt（`2510.26840`，*SpotIt: Evaluating Text-to-SQL Evaluation with Formal Verification*，2025-10-30，6 作者；**venue 未核**——subagent 称 ICLR 2026，本文未确认）发现当预测与 gold 不一致时，**「往往是 gold SQL 错了」**；
- FLEX 自己的 Appendix C 就展示了它的判官**为一条有缺陷的 gold 背书**。

⇒ **conditioning on gold 会把 gold 的错误一起引进来。** 这不是抽象风险：本仓 `rbi-10000251-exec` 的 event case **16/18 期望值已与自身 reference SQL 不符**（GA-EVAL-CASESET-EVENT-ANCHOR）。**所以「gold 腐坏」在本仓不是局部事故，而是这个领域的普遍状况。**
⇒ **对 §7.1 第 2 条的必要修饰**：「判官必须拿到参考答案」要加上「**——参考答案必须是你真的核过的那一个**」。落地形态上应对标 SpotIt 式的**有界验证**，而不是拿 raw gold / raw EX 当锚。**这条把 R8 的建议与 T11 的耦合又收紧一层**：T11 恢复的 `expected.sql` 不能直接当真值用，要先过 anchor 核对。

**④ 意外收获：schema 那一半看起来比 reference 那一半更糟**

`2607.06799` 测出给 reference-free 判官**加 schema**：`0.692 → 0.688`（**毫无帮助**）；而加 **evidence**：`→ 0.724`。Arize 的实践文独立报告**全量 schema 有害、只给被引用表的 schema 有益**（grade C，实践文非论文）。

⇒ 与本文 §2.9 对上了：本仓判官的 schema context 有两条路径（CLI 含完整列清单 / runner 兜底只有 id+relevance），而**结果文件不记录走了哪条**。现在多了一条外部提示：**「更多 schema」可能根本不是改进方向**，「更相关的 evidence」才是。这对 G8 的第 2 决策（参考答案的形态）是实质输入——**它暗示该给的不是更大的 schema，而是核过的 reference**。

**⑤ 一处待澄清的数字冲突（留给 R11，勿混引）**

map 方向 11 现记 `2607.06799` 为「self-consistency 0.675 AUROC，ensemble 0.82」；本轮 subagent 报「0.776 single-judge / 0.822 ensemble」。二者**可能是同一篇里不同的预测器**（self-consistency ≠ single-judge），但**未核**。R11 认读时须分清，不可混引。

**⑥ 第五次「方法名 ≠ 标题」**：`2604.28049` 被叫作 "STEF"，真标题是 *Agent-Agnostic Evaluation of SQL Accuracy in Production Text-to-SQL Systems*。累计：GradeSQL / SARA / RRD / RULERS / STEF —— **五次全部由二手来源供名时发生**，见 map §⚠ 验证 TODO。另：`2503.11984`（NL2SQL-BUGs）此前在 map §验证 TODO 里列为「secondary-only 不引」，**现已 ID + 标题验真**，可升级。

> **证据等级**：**FLEX（`2409.19014`）已于 2026-09-11 升至全文层**——Table 4/5、上下文定义、EQ/NEQ 定义、样本与标注流程均由本文作者从 `pdftotext` 全文逐字重导（见 ① 顶部标记）。**本节其余仍为 abs 页 / 元数据 / subagent 片段**：CIDR '26 的 52.8%/66.1%、SpotIt 的结论、`2607.06799` 的 schema-vs-evidence 数字**均未重导** ⇒ **不得进 ticket，须由 [R8c](../tickets/R8c-reference-anchor-papers.md) 复核**（其一手源已下载至 `.tmp/r8c/`，不入 git）。
