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
