# R8c — 参考锚定与 judge artifact：全文认读（FLEX / SpotIt / schema-vs-evidence / Inspect AI）

**Type**: research（认读分析论文 + 一手源码）  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: 无（[R8](R8-pairwise-judge-papers.md) 已 resolved 并交付候选清单）
**Blocks**: [G1b — Ground-truth lifecycle](G1b-ground-truth-lifecycle.md)（参考答案的形态）；[T1](T1-exec-grader-impl.md) 的 artifact schema；**修改 [T11](T11-loader-provenance-strip.md) 的下游语义**（见下「紧迫性」）
**Mode**: AFK（本环境直接做，见 [playbook](../playbook.md) §1.1）
**Branch**: `research/R8c-reference-anchor-papers`
**依据**: [R8 Resolution 补记](R8-pairwise-judge-papers.md) + [`../research/lit-gap-2026-09-11.md`](../research/lit-gap-2026-09-11.md) §3.2、§3.4 + [`../research/pairwise-judge-papers.md`](../research/pairwise-judge-papers.md) §9.6、§9.9

## 紧迫性：它改的是 T11 的下游语义，而 T11 是 map 推荐的下一步

[R8](R8-pairwise-judge-papers.md) 曾裁定「判官必须拿到参考答案」，并指出本仓 39 个 case 的 `expected.sql` 正被 loader 丢弃 ⇒ 与 [T11](T11-loader-provenance-strip.md) 是同一块工作。**补搜给这条加了一个必须的修饰**：

- `2409.19014`(FLEX) 是唯一测过「给不给 gold」的实验（κ 87.04 → 29.36），**但只此一次、n=200、标注者是该文自己的三位作者、无人复现**；
- **而 gold 锚本身是烂的**——CIDR '26 报 gold 标注错误率 **52.8%（BIRD Mini-Dev）/ 66.1%（Spider 2.0-Snow）**，SpotIt 报「当预测与 gold 不一致时，**往往是 gold 错了**」，FLEX 自己的 Appendix C 展示其判官**为一条有缺陷的 gold 背书**；
- **本仓已经踩在这上面**：`rbi-10000251-exec` 的 event case **16/18 期望值与自身 reference SQL 不符**（GA-EVAL-CASESET-EVENT-ANCHOR）。

⇒ **T11 恢复出来的 `expected.sql` 不能直接当真值交给判官。** 「给参考」与「参考是对的」是两件事，而本仓的语料在第二件上已经失败过一次。**这条必须在 T11 落地前定清楚，否则 T11 会把一批未核的锚接进判官。**

## Question

1. ~~**gold 给判官带来多少？**~~ ✅ **已答（2026-09-11，全文重导，见 [note §9.9 ①](../research/pairwise-judge-papers.md)）**：`w/o Ground Truth` = 移除 **gold query 与其执行结果两者**；κ **87.04 → 29.36**，是四项 ablation 里唯一的断崖（其余仅掉 7–13 分）。`78.17` **全文零命中**，该疑虑解除。
   **真正的发现在 EQ/NEQ 两列，而不是 κ**：`EQ`（确认本来就对的）**88 → 72**，`NEQ`（识别本来就错的）**99 → 56**。⇒ **没有 gold，判官不对称地丧失「拒绝」能力**——这是目前对本仓 56.4pp 最贴近的一手解释。
   **⇒ 本票剩余的 FLEX 工作只有一项**：Appendix C 那个「判官为缺陷 gold 背书」的案例（它是「锚是烂的」这条的自证据）。
2. **锚烂到什么程度、怎么办？** CIDR '26 的 52.8% / 66.1% 是怎么测的（哪种错误算错）？SpotIt 的**形式验证**方法能否用于本仓——它需要什么输入，MaxCompute 方言下可行吗？
3. **该给判官什么证据：更大的 schema，还是核过的 reference？** `2607.06799` 测出给 reference-free 判官加 **schema**：`0.692 → 0.688`（**毫无帮助**），加 **evidence**：`→ 0.724`。这与本仓 §2.9 的两条 schema-context 路径（CLI 含完整列清单 / runner 兜底只有 id+relevance）直接相关。**若「更多 schema」不是方向，本仓那条 CLI 路径的价值需要重估。**
4. **判官证据该落盘什么？** 文献里**没有人写下过要求**（[note §9.6](../research/pairwise-judge-papers.md)）。唯一真先例是 **Inspect AI 的代码**。它的三段式（`--no-score` / `inspect score --scorer` / `action="append"`）具体字段是什么，缺的那一半（**换聚合政策重算无需任何模型调用**）该怎么补？
5. **怎么证明判官真的在用我们给的参考？** `2601.07506` 与 `2609.02942` 独立显示判官经常**并不以交给它的参考/准则为条件**。⇒ 任何「给参考」的实验**必须自带操纵检查**。那个检查该怎么设计？

## 待认读（按读序；arXiv 条目均已 ID + 标题验真，见 lit-gap §3.2、§3.4）

| 序 | 来源 | 抽什么 |
|---|---|---|
| 1 | `2409.19014` **FLEX** | ✅ 主体已完成（Table 4/5、上下文定义、EQ/NEQ 定义、样本与标注流程均已重导入 note §9.9 ①；**修正**：标注者是「三位 3 年以上经验的 SQL 专家、共识裁定、Fleiss' κ=79.32」，此前转述的「该文作者自标」于所读段落无据；样本为 100/100 **刻意平衡**，非自然分布）。**剩余**：Appendix C「判官为缺陷 gold 背书」的案例 |
| 2 | `2510.26840` **SpotIt** | 形式验证的输入需求与覆盖边界；「往往是 gold 错了」的原文与量化；**能否在 MaxCompute 方言 / 本仓快照语义下落地**；venue（subagent 称 ICLR 2026，**未核**） |
| 3 | CIDR '26 `p5-jin.pdf` | **非 arXiv，须本地 fetch**（`vldb.org/cidrdb/papers/2026/p5-jin.pdf`）。52.8% / 66.1% 的测法与「错」的判据；与本仓 16/18 的可比性 |
| 4 | `2607.06799` | schema `0.692→0.688` vs evidence `→0.724` 的实验设置；**「evidence」在该文里具体指什么**（这决定本仓该给判官什么）；⚠ **数字冲突待澄清**：map 方向 11 现记「self-consistency 0.675 AUROC / ensemble 0.82」，subagent 报「0.776 single-judge / 0.822 ensemble」——**可能是同一篇里不同的预测器，须分清后回填 map**（该条也归 R11，先到先改） |
| 5 | **Inspect AI** 源码/文档 | `--no-score`、`inspect score --scorer`、`action=append/overwrite` 的确切语义与字段；`Score.metadata` 里 `panel` 的结构；**两条已知限制复核**：① 用 `model_graded_qa` 重打分**仍会重新调用 grader**；② append 模式「the original eval's metric configuration is not applied to the appended scorer」。文档站对 WebFetch 返回 **403**，改读仓库 `docs/scoring-workflow.qmd` / `model-graded.qmd` / `scorers.qmd` |
| 6 | `2601.07506` + `2609.02942` | 判官不以参考/准则为条件的证据形态与量级；`2609.02942` 的「仅用 rubric 文本训的分类器能预测判官输出」是怎么做的 ⇒ **直接给出操纵检查的设计模板** |
| 7 | `2606.00093` | 仅取一条（与 [R8b](R8b-judge-readout-papers.md) 共享，勿重复做）：「仅换池化口径即 0.551→0.899、κ 跨零，**without altering a single verdict**」——**该结果只有在逐准则判决被持久化时才算得出来**，是「只存分数不够」最强的引用 |
| 8 | `2606.14516` / `2606.09809` / `2604.03244` | 三份 schema/card 各**要求**什么、**不要求**什么。重点核实：`2606.14516` 是否真把 per-instance 输出列为**可选**、是否真的没有 judge 侧字段；`2606.09809` 的 `evaluator_relationship` / `generation_config` 字段（subagent 标为**未证**，只在检索片段里出现）；`2604.03244` 的 schema 是否把**实际发给模型的渲染输入**与**源 item** 分开（同样未证） |

## 必答

1. **`gold 有无` 的 delta 在本仓值多少**——给出可在 39 个 case 上执行的复现实验规格（这是 R8 判定为「真空缺、做得起、可发表」的那个实验）。须含**操纵检查**（问题 5）。
2. **锚的可信度门**：在把 `expected.sql` 交给判官之前，必须先通过什么检查？给出与 GA-EVAL-CASESET-EVENT-ANCHOR 的 `case-expected-value-audit.mjs` 的衔接方式。**这条直接写进 T11 的下游契约。**
3. **judge artifact schema 草案**：字段清单 + 为什么。须明确 Inspect AI 已有的部分与本仓要补的那一半（**换政策重算不调模型**）。注意本仓**已有那一半的工作实例**——[R20 探针 a](R20-judge-readout-probes.md) 就是零 LLM 调用重算读出。交 [T1](T1-exec-grader-impl.md)。
4. **schema 还是 evidence**：给 G1b 一个有依据的建议，并说明本仓 §2.9 那两条 schema-context 路径该保留哪条。
5. **对 R8 §7.1 第 2 条的最终措辞**：「判官必须拿到参考答案**——且必须是核过的那一个**」是否成立、修饰词该多强。

## 证据标准（不可降级）

同 [R8b](R8b-judge-readout-papers.md)：**全文认读**、引文逐字 + 行号 + `grep -nF` 机械回核、抓取物留 `.tmp/`、批量查 arXiv 避 429、警惕两个标题坑、subagent 输出未回核不得进产物。

**本票额外两条**：
- **CIDR '26 与 Inspect AI 都不是 arXiv**。前者须本地 fetch PDF；后者文档站 403，**读仓库 `.qmd` 源**而非渲染页。两者的引证格式须能让后来人跳过去核。
- ~~FLEX 的 `87.04 → 29.36` 在重导成功前不得进 ticket~~ ✅ **已于 2026-09-11 重导通过**，该数与 EQ/NEQ 两列现已达全文层，可引用。**其余数字（CIDR '26 的 52.8%/66.1%、SpotIt 的结论、`2607.06799` 的 schema-vs-evidence）仍未重导，维持禁令。**
- **一手源已在本地**：`.tmp/r8c/`（6 份 PDF + `pdftotext` 文本 + Inspect AI 三份 `.qmd` 源；**不入 git**，`.tmp/` 已被 `.gitignore`）。接手时不必重新下载，但**须自行重导引文**，不得沿用本票转述。

## 不在本票范围

- 读出形状 / 聚合规则 / 量表 → [R8b](R8b-judge-readout-papers.md) 与 [G8](G8-judge-readout-scale.md)。
- 实施 loader 修复（[T11](T11-loader-provenance-strip.md)）或 grader（[T1](T1-exec-grader-impl.md)）——本票只交付契约与字段草案。
- 真的去重建 EXECUTION 语料（G1b 的重建决议 + GA-EVAL-EXPAND）。
