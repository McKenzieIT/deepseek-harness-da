# R1 v2 — 执行级评分与非循环 ground truth 认读

日期：2026-09-08 · 取代 [`_superseded/2026-09-07-exec-grader-papers.SUSPECT.md`](_superseded/2026-09-07-exec-grader-papers.SUSPECT.md)

## 0. 本轮方法与验证边界

**锚定披露**：执行本轮的 agent 在收到重做指令前已读过 v1 的 R1 Answer 与 v1 研究笔记全文；**未读**前一轮 G1 Resolution（在 `grilling/G1-exec-grader-seam` 分支，本轮刻意不打开）。因此第 4 节逐条标注本轮与 v1 的关系，使锚定可审查。

**本轮实际做到的验证**：

| 验证手段 | 状态 |
| --- | --- |
| 官方 evaluator 源码（GitHub API，v1 所引 commit 精确复核） | ✅ 完成，见 §1 |
| 本仓 `packages/eval/` 代码（本轮亲自逐行读） | ✅ 完成，见 §2 |
| 本仓 case 统计（本轮机械重导，非引用） | ✅ 完成，见 §2.1 |
| **arXiv 元数据（论文编号/标题/日期）** | ❌ **未完成** — 本环境 `export.arxiv.org` 直连 HTTP 000，WebFetch 超时/429 |

**因此本笔记的引用纪律**：所有关于 evaluator **行为**的断言都由官方源码在固定 commit 上核实；所有 **arXiv 编号**本轮**未独立确认**，沿用 map §验证 TODO 的既有状态，不因本笔记而升级为"已验"。GradeSQL 的 **GitHub 仓库**（`sisinflab/GradeSQL`）本轮确认存在且代码可取，但其 arXiv 编号 `2606.30851` 本轮**无法确认**——v1 自己也记录了该仓 README 引用另一编号 `2509.01308`，这个矛盾**本轮未解决**，G1 不应依赖任一编号。

## 1. 一手核实的 execution-match 语义

四套官方 evaluator，在 v1 所引的同一 commit 上逐段读取。结论：**"execution match" 没有统一语义，四套两两不同**。

### 1.1 BIRD — 集合相等

`execute_sql` 直接比较 `set(predicted_res) == set(ground_truth_res)`。
→ 忽略行序，**忽略重复行 multiplicity**，tuple 内列位置敏感。超时/异常均记 0。
[BIRD evaluation.py][bird-evaluator]

### 1.2 Distilled test-suite — 袋（bag）相等 + 列排列搜索

`result_eq(result1, result2, order_matters)` 在列排列空间上搜索，通过条件是
`set(result1) == set(result2_perm) and multiset_eq(result1, result2_perm)`——
`set` 与 `multiset_eq` **同时**成立，即 **bag 相等，保留重复行 multiplicity**；
`get_constraint_permutation` 搜索列排列（采样 20 行剪枝），因此**列顺序可等价**；
`order_matters` 控制是否保留行序。
[test-suite exec_eval.py][test-suite-evaluator]

### 1.3 Spider 2.0 Lite — focused columns + 数值容差 + 逐题行序 + 多 gold

`compare_pandas_table` 硬编码 `tolerance = 1e-2`，数值比较走
`math.isclose(float(a), float(b), abs_tol=tol)`——**绝对容差，非精确相等**；
`condition_cols` 指定必须匹配的核心列；`ignore_order` **逐题**配置；
`compare_multi_pandas_table` 支持一题多个 gold answer，任一命中即通过。
[Spider2-lite evaluate.py][spider2-evaluator]

### 1.4 GradeSQL — 集合相等（同 BIRD）

`compare_sql` 同样是 `set(predicted_res) == set(ground_truth_res)`；
`execute_sql` 用 `frozenset(execution_res)` 存执行结果。ORM 的
`Yes`/`No` 标签由此执行比较产生，不是人工主观打分。
[GradeSQL evaluation_omni.py][gradesql-evaluator]

### 1.5 对照表（均一手核实）

| 系统 | 重复行 | 行顺序 | 列顺序 | 数值 | 多 gold |
| --- | --- | --- | --- | --- | --- |
| BIRD | 忽略（set） | 忽略 | 位置敏感 | 精确 | 单 gold |
| test-suite | **保留（bag）** | `order_matters` | **搜索排列** | 精确 | 单 gold SQL |
| Spider 2.0 Lite | 向量内保留 | 逐题 `ignore_order` | focused `condition_cols` | **`abs_tol=1e-2`** | **多答案文件** |
| GradeSQL | 忽略（set） | 忽略 | 位置敏感 | 精确 | gold 产标签 |

**对 G1 的硬约束**：不存在可"照抄"的默认值。任何 comparator 默认档都是本仓自己的选择，必须显式、可版本化、逐 case 可覆写——这一点四套 evaluator 的**分歧本身**就是证据，不需要更强的论证。

## 2. 本仓事实（本轮亲自读，file:line 可跳转核对）

### 2.1 K11-v2 case 构成（本轮机械重导）

用 `js-yaml` 解析 `packages/eval/eval/cases/k11-v2/*.yaml` 全部 168 个文件：

| 指标 | 数量 |
| --- | ---: |
| YAML case | 168 |
| EXECUTION（`result_value`+`match_mode` 均非空） | 143 |
| DELIVERY-only（仅 `answer`） | 25 |
| 同时具备 EXECUTION 与 DELIVERY | **0** |
| 含 reference SQL / snapshot / provenance 任一字段 | **0** |

**本轮新发现（v1 完全未报告）——143 个 EXECUTION case 只用了 5 个 match_mode 中的 2 个**：

| match_mode | 数量 | 实际断言强度 |
| --- | ---: | --- |
| `row_count_range` | **86**（60.1%） | **只断言行数落在区间，不检查任何单元格值** |
| `scalar_exact` | 57（39.9%） | 只检查**首行首列**一个标量 |
| `multi_scalar_exact` / `set_equal` / `ordered_subset` | **0** | 未被任何 case 使用 |

86 个 `row_count_range` 的区间宽度（`max-min`）分布：13 个宽度为 0（精确行数），其余 73 个为区间，最宽达 99（例：`k11v2_038.yaml` 为 `{min_rows:3, max_rows:20}`）。

> **推论（本轮最重要的一条）**：K11-v2 **没有任何一个 case 断言超过一个单元格的值**。所谓"execution 评分"，60% 是行数区间检查，40% 是单标量检查。v1 花了大量篇幅分析 `set_equal` 的 set-vs-bag 语义与 `ordered_subset` 的子序列语义——**这两个 mode 当前零 case 使用**，那部分分析对现状不产生约束。真正的 EX 强度缺口在**断言宽度**，不在 comparator 的集合语义。

### 2.2 两套并行评分栈，生产路径用的是弱的那套

`packages/eval/` 下存在两个独立的评分实现：

**A. `packages/eval/eval/`（dsh-eval 库）** — 有失败分类与环境性拒绝：
- `classify_failure.ts:81` `mapQueryOutcome`：`completed` 时 zip columns→dict 行；`pending`→`failureClass:'patience'`（`:94-101`）；`failed`→`classifyExecutionFailure`（`:110`）。
- `classify_failure.ts:30-34` `ENVIRONMENTAL_FAILURE_CLASSES` = infrastructure/timeout/patience。
- `multi_turn.ts:150-155` `submitTurn`：环境性失败 → **拒绝、不推进 session、不计分**。

**B. `packages/eval/eval-runner/`（eval-runner）** — 无失败分类：
- `eval-runner/src/types.ts:231-236` `QueryResult` = `{success, rows, row_count, error}`，**没有 `failureClass` 字段**；`failureClass` 在整个 `eval-runner/src/` 中**零出现**。
- `eval-runner/src/runner.ts:253-255`：`!execResult.success` → 直接 `executionMatch = false`。

**生产路径是 B**：`eval-cli/src/main.ts:29` 导入 `@deepseek-ai/dsh-eval-runner` 的 `runBatch`，`:375` 调用它。`driveSession`（A 栈入口）在 `packages/` 内**无任何非测试调用点**（仅 `multi_turn.ts:276` 模块内自用 + `index.ts:35` 导出）。eval-runner 从 dsh-eval 只取 `loadCases` / `checkResultMatch` / `JUDGE_PASS_THRESHOLD`（`eval-runner/src/runner.ts:12`）。

**后果（可验证）**：CLI 自己 fork 了一份 adapter，`eval-cli/src/context.ts:227-245` `CtxQueryExecutor`——
`:239` 只认 `done|completed`，**其余一律 `success:false`**（`:243`）。所以 **`pending`（仓库还没答）在生产路径上被记成模型答错**，而 A 栈的 `mapQueryOutcome:94-101` 会正确记为 `patience` 环境性拒绝。这不是风格差异，是**把基础设施故障算进模型分母**。

### 2.3 `execution_match` 这个字段名在两种模式下含义不同

`eval-runner/src/runner.ts` `executeAttempt`：
- `:248` `let executionMatch = true`（**默认 true**）；只有当 case 同时声明 `result_value` 与 `match_mode` 时才进入判定（`:249`）。→ 25 个 DELIVERY-only case 在 JSONL 里**照样写 `execution_match: true`**（`:193`），与"真执行且匹配"在记录上不可区分。
- `:250-276` **dual-score**（有 executor）：`executionMatch` 来自真实行比较（`:260`），judge 独立跑、只记录（`:264-275`），**不覆盖**。✅
- `:277-291` **SQL-only**（无 executor）：`executionMatch = judgeResult.score >= SQL_JUDGE_PASS_THRESHOLD`（`:286`，阈值 0.6 见 `:34-35`）。→ **名为 `execution_match` 的字段由 LLM 意见填充，全程没有执行。**
- `:292-298` 无 executor 且无 judge → `executionMatch = false`（注释说明理由，正确）。

模式本身可从 run 级 `RunConfig.with_query`（`eval-runner/src/types.ts:123`）恢复，**这一点是充分的**（executor 按 run 挂载，非按 case）。但 attempt 级记录不含模式标记，跨 run 比较时必须先读 `with_query`，否则 61.9%（judge-only）与 12.8%（real-exec）会被当成同一指标的两次测量。

### 2.4 重放证据不足

`AttemptResult`（`eval-runner/src/runner.ts:191-199`）记录 `execution_match` / `delivery_match` / `sql_judge` / `generated_sql` / `query_result` / `expected_result`。**缺**：所用 `match_mode`、snapshot 标识、comparator policy 版本、执行时刻、完整结果集。且 `query_result` 在 `:257` 被 `.slice(0, 5)` 截断——**只存前 5 行**。

→ 对 `row_count_range`（86 个 case，判定依据是 `execResult.rows.length`）而言，存 5 行**无法重算判定**。当前 JSONL **不足以重放一次评分**。

### 2.5 schema 静默吞掉 provenance 字段（机械验证）

`case_loader.ts:24` 调用 `EvalCaseSchema.parse(raw)`。`CaseExpectedSchema`（`eval_case.ts:39-44`）只声明 4 个字段。zod object 默认 **strip** 未知键。

本轮用仓内实际版本 **zod 4.4.3** 复现 `CaseExpectedSchema` 并 parse 一个带 `sql` / `snapshot_id` / `provenance` 的输入：三者**全部被静默丢弃，不抛错、不告警**。

→ **今天往 case YAML 里加 `expected.sql` 会无声消失**。provenance 无法增量添加，必须先改 schema；否则贡献者会以为写进去了。

### 2.6 一处 docstring 与实现不符

`eval-runner/src/runner.ts:353-357` 的 docstring 称该函数"忽略列名""用 1:1 消费防止同一实际值满足多个期望值"。实现（`:358-370`）**两者都没做**：它把数组行规范成 `col0..colN` 后直接委托给 `coreCheckResultMatch`，而 core 的 `multiScalarExact` 恰恰是**按列名**查找（`match_modes.ts:95-96`）。docstring 描述的是一个不存在的实现。（当前无 case 使用 `multi_scalar_exact`，故为潜伏问题。）

## 3. 三处 comparator 内部不一致（本轮新发现）

`match_modes.ts` 内部存在**三种不同的相等语义**：

1. `scalar_exact`（`:75`）/ `multi_scalar_exact`（`:96`）→ `looseNumericEqual`（`:24-30`）：字符串数字与 number 互通（`"42"==42`），**无浮点容差**，回退 `String(a)===String(b)`。
2. `set_equal` 标量分支（`:124-125`）→ `String(v)` 比较，且 `actualRows.flatMap(r => Object.values(r))` **把所有行的所有列压平成一个集合**（不是首列）。
3. `set_equal` / `ordered_subset` 行对象分支（`rowKey`，`:190-195`）→ `JSON.stringify(r[k])`，**精确**，因此 `1` 与 `"1"` **不**相等——与第 1 条的 `looseNumericEqual` 直接冲突。

另：`checkResultMatch` 遇未知 `match_mode` 返回 `{status:'fail'}`（`:62`），即**拼错 mode 名会记成模型答错**，而非配置错误。

## 4. 与 v1 的逐条对照（锚定审查）

| v1 的断言 | 本轮结论 |
| --- | --- |
| 四套 evaluator 无统一 execution-match 语义 | **一致**，且本轮由官方源码在同一 commit 上一手核实 |
| BIRD / GradeSQL = set equality | **一致**（一手核实） |
| test-suite = bag + 列排列 + 条件行序 | **一致**（一手核实，`:120` set∧multiset） |
| Spider 2.0 = focused cols + 逐题行序 + 多 gold + `1e-2` 容差 | **一致**（一手核实，`:85`/`:107`） |
| 168 case / 143 有 `result_value` / 25 delivery-only / 0 reference SQL | **一致**（本轮机械重导，非引用 v1） |
| `set_equal` 用 JS `Set` 丢 multiplicity；`ordered_subset` 是子序列 | **代码层面一致，但结论无实际约束力**——两个 mode **零 case 使用**，v1 未发现这一点 |
| 数值比较无浮点容差 | **一致**（`match_modes.ts:24-30`） |
| "`mapQueryOutcome` 从未被调用" | **确认，但 v1 严重低估**：不止一个函数，**整个 A 栈（`driveSession`+失败分类）都不在生产路径上**，且 CLI fork 了一个**更弱**的替代品（§2.2） |
| "loader 静默丢弃 `expected.sql`" | **确认**，并本轮用 zod 4.4.3 机械证明（§2.5） |
| 建议默认档：bag / 位置列 / 显式行序 / 严格 NULL / 无容差 | **本轮不背书为"起始默认档"**。理由：当前零 case 使用行集比较 mode，为不存在的用法定默认值是空转；默认档应在 §2.1 的断言宽度问题解决、真正写出 reference SQL 之后再定，并由 R23 mutation baseline 检验 |
| v1 未报告的项 | match_mode 分布（§2.1）、两套并行栈（§2.2）、`execution_match` 双义（§2.3）、`query_result` 截断 5 行致不可重放（§2.4）、comparator 三种相等语义（§3）、docstring 失实（§2.6） |

**判定**：v1 的**论文层**基本可靠（本轮一手复核后全部成立）；v1 的**仓内层**方向对但深度不足，且把分析力气花在了零使用的 code path 上，遗漏了生产路径的实际缺陷。用户"可能是错的"的怀疑，落点在仓内层而非论文层。

## 5. 交给 G1 的输入

按对"73.7% 假通过"的解释力排序（均为本轮可验证事实，非推论）：

1. **断言宽度**：86/143 只查行数，57/143 只查一个标量，无 case 查多单元格（§2.1）。这是 EX 强度的第一缺口。
2. **`execution_match` 双义**：SQL-only 模式下该字段是 LLM 意见（`runner.ts:286`）；判读任何历史数字前必须先读 `RunConfig.with_query`（§2.3）。
3. **环境性失败被计入模型分母**：CLI fork 的 `CtxQueryExecutor` 把 `pending` 记成模型答错（§2.2）。
4. **不可重放**：`query_result` 截断 5 行，无 policy/snapshot 记录（§2.4）。
5. **provenance 无处可放**：schema strip 静默吞字段，必须先改 schema（§2.5）。
6. **comparator 语义内部三分**（§3）——但优先级低于 1，因为当前用到的两个 mode 都不走行集比较。

**G1 不应从"选哪个 comparator 默认档"起手**——那是第 6 位的问题。前 5 条都是先于 comparator policy 的结构问题。

## 参考资料

官方 evaluator 源码（本轮一手核实，commit 固定）：

- [BIRD evaluation.py][bird-evaluator]
- [test-suite exec_eval.py][test-suite-evaluator]
- [Spider 2.0 Lite evaluate.py][spider2-evaluator]
- [GradeSQL evaluation_omni.py][gradesql-evaluator]

论文本体（arXiv 编号本轮**未独立确认**，见 §0）：Spider 1809.08887、BIRD 2305.03111、Spider 2.0 2411.07763、GradeSQL 2606.30851（编号存疑）、test-suite（ACL Anthology 2020.emnlp-main.29）。

[bird-evaluator]: https://github.com/AlibabaResearch/DAMO-ConvAI/blob/483554eae102996f5ec1f4feab4e78ef29c2a394/bird/llm/src/evaluation.py
[test-suite-evaluator]: https://github.com/taoyds/test-suite-sql-eval/blob/e97acc546ecbee8fa27fa8dbf025ef61493a876c/exec_eval.py
[spider2-evaluator]: https://github.com/xlang-ai/Spider2/blob/cafb867313aab4e674652054198f383cf4018943/spider2-lite/evaluation_suite/evaluate.py
[gradesql-evaluator]: https://github.com/sisinflab/GradeSQL/blob/9b59d6ca2f5944d22f6d375e097779163c99da21/src/evaluation/evaluation_omni.py
