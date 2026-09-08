# R1-exec-grader-papers — 认读执行级评分与非循环 GT 溯源的一手文献

**Type**: research（AFK，认读分析）  ·  **Direction**: 1（执行级评分 + 非循环 GT 溯源，linchpin）  ·  **Status**: Resolved (2026-09-07)
**Branch**: `research/R1-exec-grader-papers`（worktree `../dsh-R1`，base `master` @ `47ef19a26f`）
**Blocked by**: 无
**Blocks**: [G1-exec-grader-seam](G1-exec-grader-seam.md)（grilling 需论文分析在手）→ T1-exec-grader-impl
**产物**: [`../research/R1-exec-grader-papers.md`](../research/R1-exec-grader-papers.md)

---

## Question

为方向 1（EX grader + 非循环 expected 溯源）建立一手文献基线：**执行级评分（EX）在已发表基准里到底怎么定义、结果集怎么归一化、gold 怎么产出与验证、如何避免"用模型产 ground truth"的循环**。产出一份可直接喂 G1 grilling 的 research note，逐篇给核心方法 + 对本仓映射 + 可执行的规则清单。

## 认读清单（primary-fetch 要求）

| # | 论文 | arXiv | 认读状态 |
|---|---|---|---|
| 1 | Spider 1.0 | 1809.08887 | ✅ 全文 11 页 |
| 2 | BIRD | 2305.03111 | ✅ 全文 28 页 |
| 3 | Spider 2.0 | 2411.07763 | ✅ 全文 45 页 |
| 4 | Northcutt, Pervasive Label Errors | 2103.14749 | ✅ 全文 24 页 |
| 5 | GradeSQL / ORM | 2606.30851 | ✅ 全文 10 页 |
| 6 | **test-suite（认读中发现的必读补充）** | **2010.02840** | ✅ 全文 16 页 |

**验证方式**：本环境（pod）对 arxiv.org 403 / 域名校验失败；改由 `mcp__local__bash` 从**本地 Mac 网络** curl 直连，arxiv.org 返回 HTTP 200。5 篇经 **arXiv API 权威元数据**（title/authors/published/journal_ref）确认为真，再取 PDF 全文 `pdftotext -layout` 逐节认读。**未使用 WebSearch 最低确认这一退化路径。**

**额外一手来源（评测代码，比论文散文精确）**：
- `taoyds/test-suite-sql-eval/exec_eval.py`（`result_eq` / `order_matters` / 列置换）
- `taoyds/spider/evaluation.py`（`eval_exec_match` / 子句集合比较）
- `AlibabaResearch/DAMO-ConvAI/bird/llm/src/evaluation.py` + `evaluation_ves.py`（`set(pred)==set(gold)` / VES）

## 成功标准

1. ✅ 每篇给核心方法 + 关键数字 **verbatim** + 验证状态。
2. ✅ 产出**跨 4 个基准的 EX 归一化规则对照表**（bag/set、行序、列序、NULL、浮点、类型、多 SQL、超时、gold 可执行性），并标出**论文集体留白**的维度。
3. ✅ 产出 **provenance taxonomy 草案**，能同时容纳本仓两类已实测的 gold 缺陷：①从未执行派生（34 手挑圆整数）②曾正确但已腐坏（16/18 event case stale）。
4. ✅ 产出**反循环约束**清单（禁 LLM 产 expected 的边界在哪、哪些 LLM 用法是被已发表工作接受的）。
5. ✅ 逐条对本仓 `packages/eval/` 现状（`match_modes.ts` / `runner.ts` dual-score / K11-v2 0/168 `expected.sql`）做映射。

## Resolution (2026-09-07)

产物：[`../research/R1-exec-grader-papers.md`](../research/R1-exec-grader-papers.md)。

**六条对 G1 有直接后果的结论：**

1. **"Spider 的 test-suite" 归属错了** —— test-suite accuracy 不在 Spider 1.0（1809.08887）里，而是独立论文 **2010.02840《Semantic Evaluation for Text-to-SQL with Distilled Test Suites》(Zhong, Yu, Klein, EMNLP 2020)**。Spider 1.0 原文明写 *"do not provide Execution Accuracy in the current version"*。map §3 方向 1 的论文行需改。

2. **四个基准的结果集比较语义两两不同**，不存在"业界标准 EX"：test-suite 是 **bag/multiset + 列置换搜索**，BIRD 是 **HashSet（去重、无序）**，Spider 2.0 是 **列成员检查 `∀vi ∈ v̂`（宽松，故意压假阴性）**，Spider 1.0 无 EX。G1 必须**选一个并写清代价**，不能说"照业界做"。

3. **行序敏感性有三种可用机制**：test-suite **从 gold SQL 文本推导**（`order_matters = 'order by' in g_str.lower()`）、BIRD **一律忽略**（自承 ORDER BY 假通过 <1%）、Spider 2.0 **每例声明** `ignore_order`。本仓现状是"按 match_mode 隐含声明"（`ordered_subset` 序敏感 / `set_equal` 不敏感），最接近 Spider 2.0。

4. **NULL 与浮点容差是四篇论文的集体留白**（全部 `NOT IN PAPER`）。这不是可以抄的东西，**必须 G1 自己定**。且这条直接命中本仓已实测的回归：`046` 因 `67.81 ≠ 67.814`（模型加 ROUND）翻案 —— 本仓 `looseNumericEqual` 做了类型宽松（`"42"==42`）但**零浮点容差**。

5. **provenance 必须是二维的**：Northcutt 给了"错在创建时"的四分类（correctable / multi-label / neither / non-agreement，后三类进 unknown-label set U 并**从计分中排除**），但**全篇 `NOT IN PAPER` 时间腐坏**。本仓的 16/18 event case stale 是 Northcutt 未覆盖的第二维 → provenance schema 需 `snapshot_id` + `verified_at` 且**不是可选项**。

6. **反循环的边界比"禁 LLM"更细**：GradeSQL 的 ORM 监督信号**纯执行派生**（`ℓ(cj)=Yes iff R(cj)=R(ygold)`），可作 T1 后 judge 的替代路线（→ G12/R12）；BIRD 把"用 GPT-4 分担标注"明确列为 **future work 而非现状**；Spider 2.0 **允许 LLM 润色问题措辞**（*"paraphrasing for clarity with the help of LLMs"*）但 gold SQL 由 8 位 CS 标注者人写。即：**LLM 可碰问题表述，不可碰 expected 值**。

**顺带纠正两个数字**（详见 note §7）：Northcutt 是 **"at least 3.3%"** 非 3.4%；BIRD 的 v3 PDF 摘要头条是 **GPT-4 54.89%**，arXiv 元数据摘要（ChatGPT 40.08%）已过期。

**新增 fog（已在 note §8 列出，待 G1 决定是否成票）**：EX grader 与 [GA-EVAL-CASESET-EVENT-ANCHOR](../../data-agent/tickets/phase-misc/GA-EVAL-CASESET-EVENT-ANCHOR-stale-expected-values.md)（grilling, open）在归一化规则与 provenance 上**重叠**，G1 必须处理二者关系（先例：map 里 G5 supersedes GA-GT4）。

## K11-v2 case 状态（from earlier stub 1396a8b89c, preserved for no-loss merge）

168 个 K11-v2 case 当前没有 reference SQL；143 个已有 `result_value` 也缺 snapshot、执行 SQL 和可重放 provenance。后续 ground truth 必须由领域人员编写并复核的 reference SQL 在不可变数据库快照上实际执行派生，保存 raw/normalized artifacts、digest 与 policy version；被测模型或同源 LLM 不得成为 gold 的作者或最终裁决者。25 个 delivery-only case 保持非 execution case，不伪造 expected result。
