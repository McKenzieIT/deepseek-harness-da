# R1 — 执行级评分与非循环 ground truth 论文认读

日期：2026-09-07

## 结论摘要

以下结论区分为两类：

- **来源事实**：论文、官方评测代码或本仓库现状直接支持的事实。
- **设计推论**：针对 G1 和 K11-v2 的建议，不宣称是论文原文结论。

来源事实表明，业界并不存在单一的“执行结果相等”标准：BIRD 与 GradeSQL
的官方代码使用集合相等；Spider test-suite 使用多重集、列排列和条件式行序；
Spider 2.0 使用必需列向量匹配、逐题行序策略与多个可接受答案文件。单库执行相等
也不等于 SQL 语义等价。因而 G1 应把比较策略建模成显式、可版本化的 case
契约，而不是声称遵循一个通用 benchmark 标准。

168 个 K11-v2 case 中，当前 0 个包含 reference SQL，143 个包含
`result_value` 与 `match_mode`，25 个只有交付评分。现有结果值无法从 case 文件
重放或审计。后续期望结果必须由人工编写并复核的 SQL 在固定数据库快照上实际执行
得出，并记录完整 provenance；不能让被测模型或同源 LLM 直接生成 reference SQL
或 expected result。

## 一、来源事实

### 1. Spider 1.0：结构匹配为主，论文未发布 execution accuracy

Spider 论文把 exact matching 定义为对 SQL 子句组件的集合式比较，并明确说明
当前版本不提供 Execution Accuracy。原因之一是不同语义的查询可能在一个具体数据库
上偶然返回相同结果，形成假阳性。[Spider 论文][spider-paper]

数据标注由 8 名熟悉 SQL 的计算机专业学生完成；之后有独立复查，并使用执行与
解析脚本检查标注。论文还说明，语义等价的查询被规范到一种统一写法。因此 Spider
1.0 的 gold 主要是经人工撰写、复核和工具检查的 SQL，而不是由 execution match
自动生成的答案集合。[Spider 论文][spider-paper]

Spider 仓库后来的 evaluator 确实包含执行比较逻辑，但这不改变论文对当时指标的
陈述，也不应与 2020 年的 distilled test-suite 方法混为一谈。[Spider evaluator][spider-evaluator]

### 2. Distilled test-suite：用多数据库行为近似语义等价

“Semantic Evaluation for Text-to-SQL with Distilled Test Suites”指出，真正的
语义等价要求两条 SQL 在所有可能数据库上结果相同，通常不可判定；它用自动生成并
蒸馏的多个数据库来寻找反例。预测 SQL 只有在 suite 中每个数据库上都与 gold
匹配才通过。论文将该指标描述为 semantic accuracy 的上界，而非等价判定器。
[test-suite 论文][test-suite-paper]

官方执行器的可观察语义是：[test-suite evaluator][test-suite-evaluator]

- 每个样例使用一条 gold SQL；多 reference 被列为未来工作，而非已有能力。
- 行以 bag/multiset 比较，因此重复行的数量有意义。
- evaluator 搜索列排列，从而允许等价的输出列顺序。
- 仅当 gold SQL 文本含 `ORDER BY` 时保留行序；否则忽略行序。
- 预测 SQL 执行错误或超时判失败；gold SQL 执行错误触发断言。
- 默认超时为 60 秒。

这比单一数据库的 execution accuracy 更能排除偶然相等，但仍受生成数据库覆盖度
限制。

### 3. BIRD：单库执行结果的集合相等

BIRD 将 Execution Accuracy（EX）定义为预测 SQL 与 ground-truth SQL 的执行结果
一致的样例比例。[BIRD 论文][bird-paper]

BIRD 的 SQL 标注由两名独立 annotator 完成；分歧交由专家裁决。专家检查 SQL
可执行、结果非 NULL，以及问题、evidence 与 SQL 的一致性，并选择语义更准确且
效率更好的 ground truth。论文把 GPT 辅助标注列为未来工作，不是现行 gold
生成流程。[BIRD 论文][bird-paper]

官方实现直接比较：

```python
set(predicted_res) == set(ground_truth_res)
```

因此它忽略行顺序和重复行 multiplicity，但 tuple 中的列位置仍然有意义。执行错误
或超时得 0 分，默认超时为 30 秒。[BIRD evaluator][bird-evaluator]

BIRD 的 Valid Efficiency Score（VES）只对结果正确的 SQL 计效率，并通过重复计时
降低噪声；它不能替代正确性比较。[BIRD VES evaluator][bird-ves-evaluator]

### 4. Spider 2.0：focused EX、逐题策略与多个答案文件

Spider 2.0 的任务更接近真实企业工作流，包含复杂 schema、长上下文和多种 SQL
方言。其数据由 8 名计算机专业 annotator 构建；重写 SQL 必须能够执行、在可接受
时间内完成并返回非空结果。每条 instruction、gold SQL 和 evaluator 至少经过
3 次复核。前两轮验证分别发现约 45% 和 5% 的错误，随后修正。LLM 用于在人类先
确定并校验 SQL 语义后改写 instruction，而不是作为 gold SQL 的最终权威。
[Spider 2.0 论文][spider2-paper]

Spider 2.0 Lite 官方 evaluator 使用 focused execution accuracy：[Spider 2.0 evaluator][spider2-evaluator]

- `condition_cols` 指定 gold 输出中必须匹配的核心列。
- 每个必需 gold 列向量必须能在预测输出中找到。
- `ignore_order` 按 case 配置行序是否重要。
- 一个 case 可以有多个 potential gold answer files，任一匹配即可。

官方评测说明还记录了答案文件和配置格式。[Spider 2.0 evaluation README][spider2-readme]
当前代码的额外实现细节包括绝对数值容差 `1e-2`，以及把 pandas null 归一为 `0`。
它允许预测输出包含额外列，并且必需列匹配没有一对一消费。后两点可能产生宽松匹配，
应视为该版本代码的行为，而不是可普遍移植的论文原则。

### 5. GradeSQL：execution-derived label 训练 outcome reward model

GradeSQL 当前论文题为 “Test-Time Verification for Text-to-SQL via Outcome Reward
Models”。系统先由 LLM 生成候选 SQL，再执行每个候选，并按执行结果与 gold SQL
结果是否相等生成 `Yes` / `No` 标签；执行失败的候选被丢弃。这些 ORM 标签来自
执行，不是人工主观打分。训练与评测使用 database-disjoint 的 benchmark split；
推理时选择候选不访问 gold SQL 或 gold result。[GradeSQL 论文][gradesql-paper]

这说明 LLM 可以生成**待验证候选**，而监督标签仍由独立执行结果产生；它并不支持
让同一个模型直接撰写 benchmark gold 或 expected value。

论文没有规定细粒度结果归一化。官方 evaluator 实际使用 Python `set` 比较预测与
gold 结果，因而忽略行序与重复 multiplicity。[GradeSQL evaluator][gradesql-evaluator]
官方仓库 README 仍引用较早的 GradeSQL 论文编号 `2509.01308`；本认读按任务指定
并已核验的 `2606.30851` 版本陈述。

## 二、执行相等语义对照

| 系统 | 比较对象 | 重复行 | 行顺序 | 列顺序/子集 | 多个可接受答案 | 超时/错误 |
| --- | --- | --- | --- | --- | --- | --- |
| Spider 1.0 论文 | SQL 结构组件 | 不适用 | 结构规则 | 结构规则 | 标注规范为单一模式 | 不发布 EX |
| Distilled test-suite | 多个生成 DB 上的结果 | 保留 multiplicity | gold 有 `ORDER BY` 时保留 | 搜索列排列 | 每例一条 gold SQL | 预测失败；gold 报错断言 |
| BIRD | 单 DB 结果集合 | 忽略 | 忽略 | tuple 位置敏感 | 一条裁决后的 gold SQL | 失败得 0 |
| Spider 2.0 Lite | 必需 gold 列向量 | 向量内保留 | 每例 `ignore_order` | focused columns；允许额外预测列 | 多个 gold answer files | 不匹配/失败 |
| GradeSQL 官方代码 | 单 DB 结果集合 | 忽略 | 忽略 | tuple 位置敏感 | gold SQL 产生标签 | 执行失败候选丢弃 |

所以“execution match”必须至少明确：set/bag/sequence、列是否可排列、是否仅比较
focused columns、数值容差、类型转换、NULL、超时、错误、资源上限，以及是否存在
多个可接受结果。只保存一个无策略说明的 JSON 值不足以定义可复现评分。

## 三、ground truth 的 provenance 与非循环性

### 3.1 来源支持的共同模式

上述基准的可信链条虽不同，但有三个共同点：

1. gold SQL 或 evaluator 语义由人类 annotator 与 reviewer 建立；
2. gold 会经过真实数据库执行与可执行性检查；
3. 模型输出与独立 gold 进行比较，而不是由被测模型自行声明正确。

单库执行相等仍会假阳性；test-suite 通过多个数据库寻找反例，Spider 2.0 则通过
focused evaluator、多个答案文件和多轮人工复核处理真实任务中的多义性。这些方法
都没有证明有限测试能完全判定语义等价。

### 3.2 设计推论：G1 的非循环边界

以下是针对本仓库的设计推论：

- reference SQL 必须由具备数据语义知识的人或 DBA 编写，并由另一位 reviewer
  复核；被测模型不得作为 reference 的作者或最终裁决者。
- LLM 可以协助解释、格式化或提出候选，但候选只有经过人工复核和受信数据库执行
  后才能进入 gold。必须记录 LLM 参与方式，避免把同源模型偏差隐藏在数据中。
- expected result 必须由 reference SQL 的实际执行生成；不得人工心算、四舍五入，
  也不得复制模型回答。
- 独立 LLM SQL judge 可以作为诊断信号，但不能覆盖 execution mismatch。本仓库
  runner 当前的双评分独立性应保留。
- 多个 accepted SQL text 可以表达多种合法写法，但不能消除单快照偶然相等。
  高风险 case 应增加反例快照/test-suite，或采用人工复核的关系断言与专用 evaluator。

### 3.3 设计推论：每个 expected artifact 的最小 provenance

建议把以下字段作为可版本化契约，而不是散落在注释中：

- case ID、问题版本和 reference SQL（允许多条并标明采用条件）；
- 数据库产品、SQL 方言、逻辑数据库/schema；
- 不可变 snapshot ID，以及可校验的 snapshot/schema/data hash；
- reference SQL 作者、reviewer、裁决记录；
- 执行工具/driver 与版本、执行时间、超时和资源限制；
- 原始结果 artifact、规范化后 artifact 及各自 digest；
- comparator policy ID/version：set/bag/sequence、列策略、order policy、numeric
  tolerance、type/NULL policy；
- 首次 derivation 时间、最近 verification 时间和 drift policy。

只记录“查询日期”不能固定动态数据；必须能定位到不可变快照或等价的 time-travel
版本。无法固定的数据应隔离为非绝对值 regression case，改用稳定关系断言，或从
阻塞性执行分数中排除。

## 四、与本仓库 evaluator 的对应关系

### 4.1 当前 seam

`packages/eval/eval/src/match_modes.ts` 当前支持：

- `scalar_exact`
- `multi_scalar_exact`
- `row_count_range`
- `set_equal`
- `ordered_subset`

其数值比较允许字符串数字与 number 精确等值，但没有浮点容差；`set_equal` 使用
JavaScript `Set`，会丢失重复行 multiplicity；`ordered_subset` 是子序列检查，不是
完整 sequence equality。对象 fingerprint 会排序 key，但 value 仍按序列化值精确
比较。

`packages/eval/eval/src/eval_case.ts` 要求 `expected.result_value` 与
`expected.match_mode` 同时出现，但没有 reference SQL、snapshot 或 provenance
字段。

`packages/eval/eval-runner/src/runner.ts` 先执行生成 SQL，再把实际 rows 交给
`checkResultMatch`。当 executor 与 `sqlJudge` 都存在时，两者独立计分；judge
不能覆盖 execution mismatch。相关行为由
`packages/eval/eval-runner/tests/sql_judge_integration.spec.ts` 覆盖。若没有
executor 但有 judge，judge 会成为唯一 execution signal；G1 的正式 execution
路径不应依赖这一降级模式。

### 4.2 设计推论：G1 future execution-grader seam

G1 可以保留 `executor -> normalized result -> comparator` 的现有边界，但 comparator
应从五个枚举扩展为显式 policy object，并至少包含：

```text
row_semantics: set | bag | sequence
column_semantics: positional | permutation | focused
order_policy: required | ignored | per_case
numeric_policy: exact | absolute_tolerance | relative_tolerance
null_policy: strict | explicit_normalizer
accepted_results: one_or_more
limits: timeout + row/byte/resource caps
```

默认策略应偏严格：bag equality、位置列、显式 per-case order、严格 NULL、无隐式
容差。放宽规则只能逐 case 声明并解释。尤其不要照搬 Spider 2.0 的 null-to-zero，
也不要默认使用 BIRD/GradeSQL 的 set equality，否则会把 NULL/0 或重复行差异误判为
正确。

每次评分输出还应记录 SQL、snapshot ID、policy version、raw/normalized result
digest、耗时和错误类别，使结果可以独立重放。比较器升级后必须保留旧 policy
version，避免历史 run 被静默重解释。

## 五、168 个 K11-v2 case 的 expected result 推导

### 5.1 当前事实

对 `packages/eval/eval/cases/k11-v2/*.yaml` 的本地枚举结果是：

| 指标 | 数量 |
| --- | ---: |
| YAML case | 168 |
| 含 reference/expected SQL | 0 |
| 含非空 `result_value` | 143 |
| 含非空 `match_mode` | 143 |
| 仅交付评分、无执行 expected | 25 |

例如 `k11v2_001.yaml` 保存了 scalar `1500000`，但没有生成它的 SQL、snapshot
或执行 provenance。现有仓库记录还显示，一批 event case 的 expected value 会随
实时数据漂移，而 DWS 聚合相对稳定。这说明现有 143 个值不能仅因已存在就视为
可审计 ground truth。

### 5.1a 补记（2026-09-07，G1 session）：本认读只枚举了 k11-v2

本节的枚举范围是 `k11-v2`，结论在该范围内成立。但仓库里**另有一套带完整
provenance 的 case set**，本认读未覆盖：

| case set | 文件数 | 带 `expected.sql` | 带 `meta.anchor_ds` |
| --- | ---: | ---: | ---: |
| `k11-v2` | 168 | 0 | 0 |
| `rbi-10000251-exec` | 39 | **39** | **37** |

`rbi-10000251-exec` 的 case 采用 rbi `schema_version: 3`，带 `expected.sql`、
`meta.anchor_ds`、`meta.tier: verified`、`meta.provenance: migrated`。所以
§3.3 所列的「最小 provenance 契约」有一部分**已经在仓库里实现**，后续设计应
以它为起点而非从零设计。

三点限定，避免把这套 schema 误当成已解决的答案：

1. **eval 路径读不到它。** `loadCase` 的 zod object 会 strip 未知键，
   `expected.sql`、`meta`、`schema_version` 在加载时被静默丢弃（实测）。
2. **`expected.sql` 是模板而非可执行 SQL。** 37/39 含 `{{ds_yesterday}}` 或
   `{{ds_7d_ago}}`，解析依赖同一 case 的 `meta.anchor_ds`；因此§6「可从
   reference SQL + snapshot 重放」这条要求包含参数绑定契约。
3. **`anchor_ds` 已被证明不是有效冻结锚点。** 实跑每个 case 自己的
   `expected.sql` 对账其 `result_value`：event 类 16/18 已不符，DWS 类 13/13
   相符——ODS 原始视图的历史分区不冻结，DWS 汇总表 T+1 算完即冻。这恰好是
   §3.3「只记录查询日期不能固定动态数据」的实测确证。

### 5.2 设计推论：迁移步骤

对全部 168 个 case 建议逐项执行以下流程：

1. **分类**：标记为 executable、delivery-only、ambiguous 或 dynamic/unstable。
2. **人工 reference**：由领域人员编写 SQL；第二人复核业务口径、过滤条件、粒度、
   重复和排序语义。不得从被测模型输出回填。
3. **冻结数据**：为 executable case 绑定同一可访问的不可变 snapshot；不能冻结的
   case 不进入绝对值阻塞分数。
4. **先执行再落值**：在与生产 grader 相同的 dialect/driver/权限下执行 reference
   SQL，保存 raw artifact、normalized artifact 与 digest。
5. **声明 policy**：逐 case 选择严格 comparator；只有问题文本允许时才忽略顺序、
   忽略额外列或设置容差。
6. **复核歧义**：若多种结果都合法，保存多个 accepted result artifact，或建立
   case-specific evaluator；不要只堆多条 SQL 文本。
7. **反例验证**：为容易在单快照偶然相等的 case 加入 mutation/test-suite 数据，
   确认 comparator 能拒绝已知错误查询。
8. **双重审计**：比较新执行值与旧 `result_value`。差异必须分类为旧值错误、数据
   漂移、reference 口径变化或 normalization 变化，不能无记录覆盖。
9. **重放门禁**：CI 在固定 snapshot 上重跑 reference 与 stored digest；任何漂移、
   超时或 gold 执行错误都阻断发布，而不是给候选模型记 0 分。

迁移完成前，143 个旧 execution expectation 应标为 legacy/unverified；25 个
仅 delivery case 不应伪造 execution gold。对动态 event 数据，优先切到稳定聚合层
或固定 snapshot；否则使用关系断言并与绝对值 execution score 分开报告。

## 六、对 G1 的最小验收建议

以下均为设计推论：

- 一个 case 可引用一个或多个 versioned expected artifacts，而不是只内嵌 JSON。
- grader 在执行前验证 snapshot 与 policy version，执行后保存可重放证据。
- gold SQL 的错误/超时是 benchmark infrastructure failure，不是模型失败。
- execution score 是主裁决；LLM semantic judge 单独报告，永不覆盖 execution。
- 回归集至少包含：重复行、NULL 与 0、浮点边界、字符串数字、列排列、额外列、
  有/无 `ORDER BY`、多个 accepted result、超时、gold failure 和单快照假阳性。
- 发布 168-case 基线前，必须达到 `168/168` provenance 分类完成；其中所有标记为
  executable 的 case 都应能从 reference SQL + snapshot 重放。无需强迫 25 个
  delivery-only case 获得虚假的 execution expected。

## 参考资料

- [Spider: A Large-Scale Human-Labeled Dataset for Complex and Cross-Domain Semantic Parsing and Text-to-SQL Task][spider-paper]
- [Semantic Evaluation for Text-to-SQL with Distilled Test Suites][test-suite-paper]
- [BIRD: A Big Bench for Large-Scale Database Grounded Text-to-SQLs][bird-paper]
- [Spider 2.0: Evaluating Language Models on Real-World Enterprise Text-to-SQL Workflows][spider2-paper]
- [Test-Time Verification for Text-to-SQL via Outcome Reward Models][gradesql-paper]

[spider-paper]: https://arxiv.org/abs/1809.08887
[spider-evaluator]: https://github.com/taoyds/spider/blob/b7b5b8c890cd30e35427348bb9eb8c6d1350ca7c/evaluation.py#L614-L639
[test-suite-paper]: https://aclanthology.org/2020.emnlp-main.29/
[test-suite-evaluator]: https://github.com/taoyds/test-suite-sql-eval/blob/e97acc546ecbee8fa27fa8dbf025ef61493a876c/exec_eval.py#L46-L120
[bird-paper]: https://arxiv.org/abs/2305.03111
[bird-evaluator]: https://github.com/AlibabaResearch/DAMO-ConvAI/blob/483554eae102996f5ec1f4feab4e78ef29c2a394/bird/llm/src/evaluation.py#L17-L40
[bird-ves-evaluator]: https://github.com/AlibabaResearch/DAMO-ConvAI/blob/483554eae102996f5ec1f4feab4e78ef29c2a394/bird/llm/src/evaluation_ves.py
[spider2-paper]: https://arxiv.org/abs/2411.07763
[spider2-evaluator]: https://github.com/xlang-ai/Spider2/blob/cafb867313aab4e674652054198f383cf4018943/spider2-lite/evaluation_suite/evaluate.py#L67-L127
[spider2-readme]: https://github.com/xlang-ai/Spider2/blob/cafb867313aab4e674652054198f383cf4018943/spider2-lite/evaluation_suite/README.md
[gradesql-paper]: https://arxiv.org/abs/2606.30851
[gradesql-evaluator]: https://github.com/sisinflab/GradeSQL/blob/9b59d6ca2f5944d22f6d375e097779163c99da21/src/evaluation/evaluation_omni.py#L29-L82
