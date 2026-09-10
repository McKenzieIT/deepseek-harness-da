# R1 v3 — 执行级评分与非循环 ground truth：独立一手认读

日期：2026-09-08  ·  票：[R1-exec-grader-papers](../tickets/R1-exec-grader-papers.md)  ·  分支：`grilling/R1-G1-v3-independent`

## 本轮的独立性与验证路径

本轮在**撰写本文期间未读取 v1（`exec-grader-papers.md`）与 v2（`exec-grader-papers-v2.md`）任何内容**，全部结论从一手来源重新推导；三方对账见 [§7](#7-三方对账v1--v2--v3)，在本文定稿并提交后才进行。

已披露的污染：作者在本轮开始前读到过 v2 的 git commit message，其中含三条仓库层断言（143 个 EXECUTION case 只用 2 种 match mode、loader 丢弃 `expected.sql`、eval 判分栈偏离生产路径）。因此仓库层另派**两个完全不知情的 subagent** 独立取证（禁读 `wayfinder/**`、`.agents/notes/**`），本文的仓库层结论均以作者亲自执行的确定性命令或运行时探针复核，来源逐条标注。

本轮验证手段，与 v1/v2 的关键差别在于**网络可用**：

| 手段 | 本轮实测 |
|---|---|
| `https://arxiv.org/abs/<id>` | HTTP 200 |
| `https://export.arxiv.org/api/query`（权威元数据） | HTTP 200 |
| `https://arxiv.org/pdf/<id>` + `pdftotext -layout` | 200，全文可认读 |
| `https://raw.githubusercontent.com/...`（官方评测器源码） | 200（间歇性 000，`--retry 4 --retry-all-errors` 后稳定） |

原始抓取物留在 `.tmp/r1-v3/`（不入 git）：`arxiv-meta.xml`、6 份评测器源码、3 份 PDF 及其文本化结果。

## 1. 论文身份：6/6 经 arXiv 权威元数据确认真实

逐条取自 `export.arxiv.org` API 的 `title`/`authors`/`published`/`journal_ref`，非 WebSearch、非模型记忆。

| map 中的称法 | arXiv | 元数据实际标题 | 作者数 / 首作 | 时间 | journal_ref |
|---|---|---|---|---|---|
| Spider 1.0 | 1809.08887v5 | Spider: A Large-Scale Human-Labeled Dataset for Complex and Cross-Domain Semantic Parsing and Text-to-SQL Task | 12 / Tao Yu | 2018-09-24，末更 2019-02-02 | 无 |
| BIRD | 2305.03111v3 | Can LLM Already Serve as A Database Interface? A BIg Bench for Large-Scale Database Grounded Text-to-SQLs | 18 / Jinyang Li | 2023-05-04，末更 2023-11-15 | 无 |
| Spider 2.0 | 2411.07763v2 | Spider 2.0: Evaluating Language Models on Real-World Enterprise Text-to-SQL Workflows | 16 / Fangyu Lei | 2024-11-12，末更 2025-03-17 | 无 |
| Northcutt | 2103.14749v4 | Pervasive Label Errors in Test Sets Destabilize Machine Learning Benchmarks | 3 / Curtis G. Northcutt | 2021-03-26，末更 2021-11-07 | NeurIPS 2021 Datasets and Benchmarks |
| test-suite | 2010.02840v1 | Semantic Evaluation for Text-to-SQL with Distilled Test Suites | 3 / Ruiqi Zhong | 2020-10-06 | 无 |
| “GradeSQL / ORM” | 2606.30851v1 | Test-Time Verification for Text-to-SQL via Outcome Reward Models | 7 / Mattia Tritto | 2026-06-29 | 无 |

**对 map 的两处修正**：

1. `2606.30851` 的标题不是 “GradeSQL”。GradeSQL 是该论文提出的**框架名**（原文 §1：“we introduce GradeSQL, a scalable framework”），引用时须用真标题。
2. `2010.02840` 首次进入本 effort 的引用集：它是 test-suite accuracy 的出处，而 map 方向 1 的论文行把 test-suite 归给了 Spider 1.0（见 §3.1）。

## 2. 四个官方评测器的结果比较语义（逐条来自源码，非论文散文）

不存在“业界标准执行相等”。四份官方实现在**每一个**维度上都不一致：

| 维度 | test-suite `exec_eval.py` | BIRD `evaluation.py` | Spider 2.0 `evaluate.py` | Spider 1.0 `evaluation.py` |
|---|---|---|---|---|
| 重复行 | **bag/multiset**：`set(r1)==set(r2p) and multiset_eq(r1,r2p)`（L120） | **set**，重复被折叠：`set(predicted_res) == set(ground_truth_res)`（L26） | 按列向量逐列比对（L126） | 无执行比较 |
| 行序 | **从 gold SQL 文本推导**：`order_matters = 'order by' in g_str.lower()`（L197） | 一律忽略（set 语义） | **每例声明** `standard.get("ignore_order", False)`（L293），默认序敏感 | — |
| 列序 | **枚举列置换**，用 20 行采样约束搜索空间（L59、L106） | 位置敏感（元组入 set） | **列成员**：每个 gold 列须匹配某个 pred 列（L126），允许 pred 多出列 | — |
| 浮点 | 无容差 | 无容差 | **`math.isclose(float(a), float(b), abs_tol=tolerance)`，`tolerance = 1e-2`**（L85、L107） | — |
| NULL | 进 `tuple(sorted(row, key=str(x)+str(type(x))))` 规范键（L29） | 随元组进 set | 排序键 `(x is None, str(x), ...)` 显式前置 None（L97-98） | — |
| 超时 | 自带 | `meta_time_out=30.0` 秒/查询，多进程并行（L75） | 未见于比较函数 | — |
| 判分对象 | 结果集 | 结果集 | 结果集 + 每例 `condition_cols` 列子集 | 解析后的 SQL 子句集合（`eval_order` 等，L183+） |

来源（`master`/`main` 分支，2026-09-08 抓取）：`taoyds/test-suite-sql-eval/exec_eval.py`、`AlibabaResearch/DAMO-ConvAI/bird/llm/src/evaluation.py`、`xlang-ai/Spider2/spider2-lite/evaluation_suite/evaluate.py`、`taoyds/spider/evaluation.py`。

**后果**：G1 不能说“照业界做”。四条路线的假阴/假阳代价不同，必须**选一条并写清代价**；且**只有 Spider 2.0 一家给了浮点容差**（`1e-2`），另两家零容差——所以浮点不是“集体留白”，而是**只有一个可抄的先例**。

## 3. 论文散文层：三条决定性原文

### 3.1 Spider 1.0 明写它不提供 Execution Accuracy

1809.08887 全文（`pdftotext` 第 446-451 行）：

> “We exclude value prediction in Component and Exact Matching evaluations and **do not provide Execution Accuracy in the current version**. However, it is also important to note that Execution Accuracy can create false positive evaluation…”

Spider 1.0 的自有指标是 Component Matching 与 Exact Matching，并以“每个子句内做集合比较”处理 ordering issue（第 433-436 行）。test-suite accuracy 由 2010.02840 提出——该文摘要原文：“We propose test suite accuracy to approximate semantic accuracy for Text-to-SQL models”。**map 方向 1 把 test-suite 归给 Spider 1.0 是错的，须改。**

### 3.2 ORM 的监督信号纯由执行派生，且执行报错的候选被丢弃

2606.30851 §Stage 2 Data Labeling（全文第 243-251 行）：

> “Each candidate is executed on the database. Let R(cj) denote the result set of query cj. A candidate is labeled as correct if R(cj) = R(ygold_i) and incorrect otherwise. **Queries that raise execution errors are discarded.**”

两条对 G1 的后果：其一，用执行结果训 verifier 替代 LLM-judge 是**已发表**路线（喂条件票 G12/R12）；其二，该文把**执行报错的候选从监督信号中剔除，而非记为答错**——这是“执行/基础设施失败必须与答错分开”的一手先例。

### 3.3 Northcutt 的数字是 “at least 3.3%”

2103.14749 摘要原文：“we estimate an average of **at least 3.3% errors** across the 10 datasets”；并给出人工复核率“51% of the algorithmically-flagged candidates are indeed erroneously labeled”。

## 4. 本仓 `packages/eval/` 实测（确定性命令 + 运行时探针）

### 4.1 case 清点：只有 2 种 match mode 在用，143 EXEC / 25 DELIVERY

以 `yaml.safe_load` 解析全部 case 文件（pyyaml 6.0.3）得：

| 目录 | 文件数 | `expected.match_mode` 分布 | 带 `expected.sql` | EXECUTION / DELIVERY |
|---|---|---|---|---|
| `packages/eval/eval/cases/k11-v2` | 168 | `row_count_range` 86、`scalar_exact` 57、null 25 | **0 / 168** | 143 / 25（无交集） |
| `packages/eval/eval/cases/rbi-10000251-exec` | 39 | `scalar_exact` 39 | **39 / 39** | 39 / 0 |

`k11-v2` 的 143 个 EXECUTION case **只用到 5 种模式中的 2 种**；`multi_scalar_exact`、`set_equal`、`ordered_subset` 在活跃 case 集里是 **0 使用**。因此 bag-vs-set、行序、列置换这些语义之争，当前**触及不到任何一个活跃 case**——真正在判分的只有“第一行第一格是否相等”（`scalar_exact` 57）与“行数是否落在区间内”（`row_count_range` 86）。

`row_count_range` 是本仓活跃 case 的多数（86/143）。它**只数行数**，不看任何一个单元格的值（`packages/eval/eval/src/match_modes.ts:102-110`）。

### 4.2 loader 静默丢弃唯一存在的人写 ground truth

`rbi-10000251-exec` 的 39 个 case 是全仓**唯一**带人写参考 SQL 的资产，且带溯源字段（`meta.provenance`、`meta.anchor_ds`、`meta.tier: verified`、`meta.created_at`、顶层 `schema_version: 3`、`expected.behavior`）。

运行时探针（zod 4.4.3，真实 `loadCase()`，对 `eval_10000251_036.yaml`）：

```
RAW    top keys       : [schema_version, case_id, input, expected, dimensions, meta]
LOADED top keys       : [case_id, input, expected, dimensions]
LOADED expected keys  : [result_value, match_mode, answer, delivery_match]
sql survived?         : false
```

`EvalCaseSchema`（`packages/eval/eval/src/eval_case.ts:39-58`）只声明 `result_value`/`match_mode`/`answer`/`delivery_match`，未开 `passthrough`，故 `expected.sql`、`expected.behavior`、`meta`、`schema_version` 在加载时被**无声剥离**。结论：参考 SQL 不是“语料里没有”，而是**被 schema 丢掉**；ground-truth provenance 的第一个缺口在 loader，不在 case 作者。

### 4.3 判分用的比较器不是被测试的那一个

仓内存在**两个** `checkResultMatch`：

| 实现 | 签名 | 语义 | 谁在用 |
|---|---|---|---|
| `packages/eval/eval/src/match_modes.ts:51` | `(expected, actualRows, matchMode) → AssertionResult{status,detail}` | 文档称 rbi 5 模式 1:1 镜像 | `packages/eval/eval/src/scoring.ts:70`；单测 `packages/eval/eval/tests/match_modes.spec.ts` |
| `packages/eval/eval-runner/src/runner.ts:358`（**私有**） | `(actualRows, expected, matchMode?) → boolean` | 数组行改写为 `col0..colN` 后转调前者，**把 `{status,detail}` 压成 boolean**；且 **`if (!matchMode) return actualRows.length > 0`**（L359） | CLI 真实判分路径（`executeAttempt`，runner.ts:260） |

私有包装器在 `runner.ts:12` 以 `checkResultMatch as coreCheckResultMatch` 转调库实现，故**被测的核心语义确实生效**；未被 `match_modes.spec.ts` 覆盖的是包装器自身的三个行为：`!matchMode` 时的“有行即通过”、数组行改写 `col0..colN`、以及把 `{status,detail}` 压成 boolean 从而**丢弃比较失败的原因**。（本文首版把这条写成“单测约束不到 CLI 分数”，过强，已按 §7 对账修正。）另外 `if (!matchMode) return actualRows.length > 0` 意味着**缺 match_mode 时“有行即通过”**——`k11-v2` 有 25 个 case 的 `match_mode` 为 null，它们不走这一支（被 L249 的 `result_value !== null && match_mode !== null` 挡住），但该分支对任何未来的“只给 expected 不给 mode”的 case 是静默放行。

### 4.4 仓库返回“仍在执行”被记成模型答错

`eval-cli` 的 `CtxQueryExecutor.execute`（`packages/eval/eval-cli/src/context.ts:239-243`）：仅 `state === 'done' | 'completed'` 算成功，**其余一切（含 `pending`）返回 `success: false`**。

`executeAttempt`（`runner.ts:253-255`）：`success:false` → `executionMatch = false`。`passKVerdict`（`runner.ts:387`）：任一 attempt `execution_match === false` → verdict **`'wrong'`**。

`'infra_failure'` 只能由**抛出**并被 `isInfraError` 识别的异常到达（`runner.ts:201`、`passKVerdict` L384 要求 `every`）。返回式 `pending` 从不抛异常，于是**“仓库还没跑完”与“模型答错”在最终 verdict 上不可区分**。

而 `dsh-eval` 库本身备有正确映射：`packages/eval/eval/README.md:17` 记 `mapQueryOutcome(outcome)` 为 “`QueryOutcome` → `ExecutionResult` 映射（pending → `patience` refuse）”——这条**不在** CLI 判分路径上。`eval-runner-service/src/index.ts` 另有一份 fork（只接受 `'completed'`，pending 回 `'query still running'`），verdict 后果相同。

### 4.5 同一个 `execution_match` 字段承载三种不同含义

`executeAttempt` 中（`runner.ts:248-301`）：

- 有 executor：真实结果比对；
- 无 executor 有 sqlJudge：`executionMatch = judgeResult.score >= SQL_JUDGE_PASS_THRESHOLD`（L286）——**judge 意见直接顶替执行判定**；
- 无 executor 无 sqlJudge：`executionMatch = false`（L297，注释明写这是为免虚高 `pass_rate`）；
- case 无 `result_value`/`match_mode`（25 个 DELIVERY case）：`executionMatch` 保持初值 `true`（L248）——一个**从未执行过**的 `true`。

落盘只有一个 `execution_match: boolean`，attempt 级四种来路不可分辨。**run 级只在极少数文件里可恢复**：executor 按 run 挂载而非按 case，故 `RunConfig.with_query`（`packages/eval/eval-runner/src/types.ts:123`）原则上能区分“judge-only 模式”与“真执行模式”——但实测 `eval-results/` 内**仅 4 个批量 run 带 `config` 块**，其余 35 个（含全部 168-case run）连 `config` 都没有，模式**不可恢复**；且四个有记录的 run 里，同 39 case / 同模型 / 同 `pass_k=3` 的对比为 judge-only 61.5% vs real-exec 5.1%（**56.4pp**）。（本文首版称四种来路“事后不可分辨”、二版称“run 级可恢复”，二者都不准，已按 §7.4 修正。）

### 4.6 evidence 不足以重放一次评分

`queryResult = execResult.rows.slice(0, 5)`（`runner.ts:257`）——只留前 5 行；失败时留 `[{_error: ...}]`（L255）。没有归一化后结果、没有比较器/policy 版本、没有 `QueryOutcome` 的 `state`/`instanceId`/`executionMeta`。

## 5. 对 G1 的直接后果（本轮新增的决策约束）

1. **比较器归一之争的优先级低于“判分器统一”**：活跃 case 只用 2 种模式，bag/set/列序当前触及 0 个 case；而“被测试的比较器不是判分的比较器”（§4.3）影响 100% 的 case。G1 的 seam 必须先解决后者。
2. **`row_count_range` 占 86/143，本质是不看值的结构断言**：EX grader 的验收面若以“结果集相等”为中心，将有 60% 的活跃 case 无法从中受益——要么迁移这些 case（需 §4.2 的参考 SQL），要么明确承认 EX 只覆盖 57 个 `scalar_exact`。
3. **provenance 的第一个动作是恢复而非新建**：39 个带人写 SQL + `tier: verified` 的 case 已在仓内，被 loader 丢弃；先让 schema 保留它们，再谈为 143 个 case 派生 expected。
4. **verdict 必须把“非终态/执行失败”从“答错”里拆出来**，且这有一手先例（§3.2 ORM 丢弃执行报错候选、`mapQueryOutcome` 的 `pending → patience`）。当前 `'wrong'` 混装二者，任何 pass^k 数字都据此偏低且不可解释。
5. **`execution_match` 需要成为带来源标签的判定，而非 boolean**（§4.5 四种来路）。
6. **浮点容差有唯一可抄先例 `abs_tol = 1e-2`（Spider 2.0）**，其余两家零容差；本仓 `looseNumericEqual`（`match_modes.ts:24-30`）做类型宽松而**零浮点容差**，需 G1 明确取舍。

## 6. 本轮未验证 / 留白（不得当成已证）

- **BIRD 与 Spider 2.0 的散文层未认读**（只验了元数据与官方评测器源码）：包括 BIRD 关于 LLM 协助标注属 future work、Spider 2.0 允许 LLM 润色问题措辞而 gold SQL 由人写等断言，本轮**未取原文**。
- **BIRD 摘要数字**：arXiv v3 元数据摘要为 “ChatGPT, only achieves 40.08% in execution accuracy … human result of 92.96%”；PDF 内摘要是否另有 GPT-4 数字，本轮未核。
- **Northcutt 的四分类（correctable / multi-label / neither / non-agreement）** 与“从计分中排除”机制：本轮只验了 3.3% 与 51% 两个数字，分类体系未取原文。
- **Northcutt 是否覆盖“gold 随时间腐坏”**：未核。本仓的 stale expected 现象需要独立依据。
- **生产 `MaxComputeQueryEngine` 对 `pending` 的实际行为**：未读实现，只读了 `QueryEngine` 抽象与 eval 侧适配。
- **`rbi-10000251-exec` 未被 git 追踪的风险**：map §可复现性风险已记，本轮未复核其当前 git 状态。

## 7. 三方对账（v1 / v2 / v3）

对账在 v3 的 §1-§6 提交（`8a97b3812b`）之后进行。v1 = `exec-grader-papers.md`（master），v2 = `exec-grader-papers-v2.md`（`grilling/G1-exec-grader-seam-redo`）。凡本轮能亲自复核的 v2 断言，均以命令复核后再采信，不因“v2 说过”而入账。

### 7.1 三方独立收敛（最高可信度，G1 可直接依赖）

v2 与 v3 各自机械重导、互不参照，数字逐位相同：

| 事实 | v1 | v2 | v3 |
|---|---|---|---|
| 168 case / 143 EXECUTION / 25 DELIVERY / 交集 0 | ✅ | ✅ | ✅ |
| `row_count_range` 86、`scalar_exact` 57、其余三模式 0 使用 | ❌ 未报告 | ✅ | ✅ |
| `k11-v2` 带 reference SQL = 0 | ✅ | ✅ | ✅ |
| loader 静默 strip `expected.sql`（zod 4.4.3） | ✅ 提出 | ✅ 复现 schema 证明 | ✅ 真实 `loadCase()` 端到端证明 |
| 生产判分路径是 `eval-runner`，`mapQueryOutcome` / `patience` 不在其上 | ⚠ 低估为“一个函数未被调用” | ✅ 证明整条 A 栈无非测试调用点 | ✅ 由 README 与调用点确认 |
| 仓库 `pending` → `execution_match=false` → verdict `wrong` | ❌ 未报告 | ✅ | ✅ |
| `query_result` 截断前 5 行，不足以重放 | ✅ | ✅ | ✅ |
| 四套官方 evaluator 语义两两不同，唯 Spider 2.0 有 `abs_tol=1e-2` | ✅ | ✅ | ✅ |
| G1 不应从“选 comparator 默认档”起手 | ❌ 反之：v1 给出建议默认档 | ✅ 明确拒绝背书 | ✅ 独立得出同一优先级 |

本轮亲自复核的 v2 数字，全部复现：`row_count_range` 区间宽度 86 个中 13 个宽度为 0、73 个为区间、最宽 99（`k11v2_voice_023` 为 1..100；v2 举的 `k11v2_038` 是 3..20、宽 17，非最宽）。

### 7.2 v3 独有的新增（v1/v2 均无）

| 新增 | 依据 |
|---|---|
| 6 个 arXiv 编号经权威 API 全部确认真实 | v2 §0 明记“编号本轮未独立确认”，并把 `2606.30851` 标为“编号存疑”——本轮解除该存疑 |
| `2606.30851` 真标题为 Test-Time Verification for Text-to-SQL via Outcome Reward Models，GradeSQL 是框架名 | 论文 §1 原文（与 v2 引用的 `sisinflab/GradeSQL` 仓库一致） |
| Spider 1.0 “do not provide Execution Accuracy in the current version” 逐字取自 PDF | v1 提出该结论，v2 未复核论文散文；本轮补齐一手证据 |
| test-suite accuracy 出自 2010.02840（“We propose test suite accuracy”） | PDF 摘要原文 |
| GradeSQL **丢弃**执行报错的候选而非记为答错 | 论文 Stage 2 原文；给“执行失败≠答错”提供已发表先例 |
| Northcutt “at least 3.3%” 与 51% 人工复核率 | arXiv 摘要原文 |
| runner 私有包装器的 `if (!matchMode) return actualRows.length > 0` | `runner.ts:359` |

### 7.3 v2 独有的新增（v3 未发现，复核后采信）

| v2 的新增 | 本轮复核 |
|---|---|
| A 栈的失败分类体系：`classify_failure.ts` 的 `ENVIRONMENTAL_FAILURE_CLASSES` = infrastructure/timeout/patience，`multi_turn.ts:150-155` 环境性失败拒绝推进且不计分 | 采信（v3 仅由 README 认出 `mapQueryOutcome`，未追到分类常量与拒绝语义） |
| `driveSession` 在 `packages/` 内无非测试调用点 | 采信 |
| `match_modes.ts` 内部三种相等语义并存：`looseNumericEqual` / `String(v)` 压平 / `rowKey` 的 `JSON.stringify` 精确（故 `1` 与 `"1"` 在行对象分支**不**相等，与标量分支冲突） | 采信 |
| 未知 `match_mode` 返回 `{status:'fail'}`（`match_modes.ts:62`）——**拼错模式名会被记成模型答错**，而非配置错误 | 采信；与本文 §4.4 的“基础设施故障算进模型分母”同类，属同一个 verdict 语义缺陷 |
| runner 私有比较器的 docstring 失实（自称忽略列名 + 1:1 消费，实现两者皆无） | 采信 |
| `row_count_range` 的判定依据是 `rows.length`，故存 5 行**无法重算**该判定 | 采信，且这使“不可重放”从缺陷升级为对 60% 活跃 case 的**判定不可复核** |

### 7.4 对 v3 的两处自我修正（由 v2 触发，本轮复核确认）

1. **“单测约束不到 CLI 分数”过强**：`runner.ts:12` 显示私有包装器转调库实现，核心语义生效；未覆盖的只是包装器三行为。已改 §4.3。
2. **“四种来路事后不可分辨”未分层**：attempt 级不可分辨，而 run 级原则上由 `RunConfig.with_query` 可恢复（executor 按 run 挂载）。已改 §4.5。
3. **但“run 级可恢复”也不准（G1 D4 期间新发现，本轮第三处自我修正）**：逐文件解析 `eval-results/` 后，**仅 4 个批量 run 带 `config` 块**（均为 39-case rbi 集），其余 **35 个批量 run——包括全部 168-case run——没有 `config`**，执行模式不可恢复。**从未有任何一次完整 168-case run 真连过数仓**（唯三个 `with_query=True` 的文件是 39-case 的 `eventdef-realexec` 与两个单 case smoke）。同条件对比（同 39 case / 同模型 / 同 k=3）：judge-only 61.5% / 53.8% / 41.0% vs real-exec **5.1%**。故 map 与历史票中所有 168-case 百分数（68.1%、73.8%、61.9% 等）均为 judge-only 或不可归属，不得与真执行数字同尺比较。

### 7.5 v1 的处置

- **论文层留用**：其两条头条（Spider 1.0 无 EX、test-suite 归属 2010.02840）本轮由 PDF 原文独立证实，Northcutt 3.3% 的纠正亦成立。
- **仓内层退役**：v1 对 `set_equal` set-vs-bag、`ordered_subset` 子序列语义的分析针对**零使用**的模式，对现状无约束；其“建议默认档”（bag / 位置列 / 显式行序 / 严格 NULL / 无容差）**不作为 G1 起点**——三方一致认为默认档应在 reference SQL 与断言宽度问题解决后、由 R23 mutation baseline 检验时再定。
- v1 未报告而 v2/v3 共同确认的结构缺陷（模式分布、双栈、`execution_match` 多义、pending 计入模型分母、不可重放、provenance 无处可放）构成 G1 的实际输入。

### 7.6 G1 的输入以此为准（按解释力排序）

1. **verdict 混装**：`pending`/执行失败与“答错”同为 `wrong`（§4.4）；拼错 mode 名亦然（§7.3）。有一手先例支持拆分（§3.2、A 栈 `patience`）。
2. **断言宽度**：86/143 只查行数（13 个精确、最宽 1..100），57/143 只查首行首格，**无一个 case 断言多于一个单元格**（§4.1、§7.1）。
3. **`execution_match` 多义**：SQL-only 模式下由 LLM 意见填充；run 级需靠 `with_query` 反查（§4.5）。
4. **ground truth 就在仓内却被丢弃**：39 个人写 SQL + `tier: verified` 被 schema strip（§4.2）。
5. **不可重放/不可复核**：截断 5 行、无 policy 版本、无 snapshot（§4.6、§7.3）。
6. **comparator 语义内部三分 + 跨基准无共识默认**（§2、§7.3）——优先级最低，当前触及 0 个活跃 case。
