# G10 学习指南：可信 evaluation 的 Benchmark / Harness / Environment 拆分

日期：2026-09-09

本文面向准备参与 [G10 — Harness Benchmark/Harness/Environment 拆分](../tickets/G10-harness-bhe-split.md) 决策的人，解释 G10 要解决的问题、术语、数据流、失败模式和决策检查表。论文依据见 [R10 认读](harness-goodhart-papers.md)，2026 年后续文献见 [follow-up scout](g10-2026-followup-papers.md)。本文是教程，不替代 G10 的最终决议。

## 1. R10 与 G10 的区别

R10 回答“已有论文和官方实现证明了什么”；G10 回答“本仓据此选择什么包、接口、schema 和迁移顺序”；T9/T12 才执行代码与包重组。R10 提供约束，G10承担取舍。

## 2. 用考试系统理解三个角色

### Benchmark：命题组

Benchmark 决定测什么、题目版本、标准答案、正确性规则、分数聚合、数据 split 和 provenance。对应本仓的是 case、reference SQL、expected result、grader/comparator policy、`train | heldout | fresh` 和 benchmark identity。

没有 Benchmark，系统不知道“什么算正确”。

### Harness：监考与答题流程

Harness 把题交给模型或 agent，管理 prompt、单轮/多轮状态、工具调用、provider API、重试和 trajectory。它记录考生如何作答，但不拥有标准答案，也不解释 benchmark correctness。

### Environment：考场与实验设备

Environment 提供数据库、进程、沙箱、文件、网络、资源、超时与清理。它返回执行事实，不决定最终 verdict。`ctx.query.execute`、MaxCompute credentials 和 backend lifecycle 属于这一角色。

### Protocol：密封交接单

Protocol 让三类模块独立演化。它定义公开任务材料、运行证据与评分结果的传递方式，但不拥有题目、agent loop 或数据库。

```text
Benchmark ──compile──> PreparedTask ──> Harness
    │                                      │
    │ hidden evaluation material           │ tool/action
    │                                      ▼
    └─────────────────────────────── Environment
                                           │ evidence
                                           ▼
                                      Benchmark grader
```

## 3. 一个 SQL case 的完整生命周期

假设题目是“昨天有多少个角色完成了付费？” Benchmark 作者态 case 保存问题、reference SQL、expected value、snapshot identity、模板参数、comparator policy 和 provenance。

Benchmark 编译 case 时生成两类材料：Harness 可见的公开任务输入，以及只供 evaluator 使用的隐藏材料。`expected.sql`、expected result、private tests 和 grading secret 不进入 Harness 可见的 `PreparedTask`。

Harness 创建 session，发送问题，驱动 agent，记录 raw model output、parsed tool call、retry、tool result 和 trajectory。Harness 此时仍不知道答案是否正确。

Environment 解析 scope，选择凭证和 backend，执行 SQL，并返回 rows、duration、truncation、provider error 和资源状态。Environment 返回的是事实，不是 `passed: true`。

Benchmark grader 取得隐藏 expected 与显式 policy，将 Environment 的执行事实归一化并比较，最后区分 `pass`、`fail`、`environment-blocked` 与 `case-defect`。reference SQL 自己失败属于 benchmark/case 缺陷，不是模型答错。

## 4. Grader、Comparator 与 Policy

Comparator 是可复用的比较算法，例如 scalar exact、set equality、bag equality、ordered subset 或浮点容差。它适合放在共享 eval library 中，成为深模块：调用者只提供输入和显式 policy，复杂归一化藏在实现内部。

Comparator policy 是某个 benchmark 对“什么算相等”的声明，例如是否忽略行序、是否保留重复、允许哪些列排列、浮点容差是多少。Policy 属于 Benchmark，不能由 comparator 实现或 runner 通过默认值猜测。

Grader 比 comparator 更广。它处理执行是否完成、reference 是否有效、snapshot 是否匹配、comparison 是否可运行以及最终 failure class。可以把 comparator 理解为红笔、policy 理解为本题评分细则、grader 理解为阅卷员、Benchmark 理解为考试委员会。

G10 应裁定的是 mechanism 与 semantics 的分离：共享包可实现 comparator mechanism，Benchmark Pack 必须选择并版本化 policy。

## 5. 系统里需要三层 schema

### 作者态 source schema

每个 Benchmark Pack 可以有适合作者维护的格式。`k11-v2` 与 `rbi-10000251-exec` 不必使用同一个 YAML 结构。

### Canonical task material

具名 Benchmark Adapter 将 source schema 无损编译到统一协议。Canonical material 至少包含稳定 identity、benchmark/version、split、公开输入、隐藏评测材料、environment requirements、grader policy 和 provenance。

### Run evidence schema

Harness/Environment 产生的是一次运行的事实：model、harness、adapter、environment、seed、raw emission、parsed action、execution、observation、trajectory、finality 和 isolation 状态。它不是 case 定义。

把作者态 case、PreparedTask、attempt evidence、grade 和 aggregate result 全塞进一个 `EvalCase`，会让所有权和可见性变得不可审计。

## 6. 两套 case schema 应怎样合流

错误做法是取最低公共字段，把两套 YAML 压成 `{question, result_value, match_mode}`。这种做法会丢失 `expected.sql`、`anchor_ds`、`tier`、provenance、template variables 和 snapshot requirement，是“通过遗忘制造兼容性”。

更合理的路径是：

```text
k11-v2 source ──K11 adapter──┐
                              ├─ canonical case envelope
RBI v3 source ───RBI adapter─┘
```

每个 adapter 必须证明字段无损、未知评分字段失败、reference/oracle 可由 grader 接受、转换前后评分语义一致，并固定 adapter version。两套 source schema 可以保留，但运行时协议只有一个。

`expected.sql` 和 comparator policy 属于 evaluator-side Benchmark material。`anchor_ds` 的语义要求属于 case；怎样连接并读取对应 snapshot 属于 Environment binding。两者应显式连接，不能由 runner 读字符串后隐式猜测。

## 7. 一个候选的深模块结构

以下是帮助讨论的候选，不是 G10 已完成的决议：

```text
Benchmark Pack
  identity/version/source/provenance
  authoring schema and cases
  hidden expected/reference
  grader/comparator policy
  aggregation declaration

Benchmark Adapter
  source case -> canonical case
  parity/oracle/provenance evidence

Eval Protocol / Shared Library
  PreparedCase
  AttemptEvidence
  Grade
  RunResult
  generic comparator implementations
  statistics and persistence formats

Harness
  session and agent loop
  prompt/workspace handoff
  provider and tool interaction
  retry and trajectory capture

Environment Adapter
  query/process/sandbox session
  resource/network/timeout
  finality/reset/cleanup
  structured execution observations

Composition Root
  Cordis service or CLI
  chooses pack + harness + environment + model
```

真正的外部 seam 应保持小而稳定；benchmark-specific 复杂度留在 pack，provider-specific 复杂度留在 Harness adapter，backend-specific 复杂度留在 Environment adapter。

## 8. Harness 不是中性管道

观测分数是模型、prompt template、parser、tool schema、Harness、Environment 与 grader 的共同产物。模型可能已经发出合法 tool call，但 parser 因格式不匹配而丢弃；最终 `tool_call_count = 0` 不能证明模型没有调用工具。

因此 run evidence 应保留阶段链：

```text
raw emission
→ parsed action
→ validated action
→ execution
→ observation
→ grader evidence
```

G10 应要求 interface preflight 在批量运行前检查 template/parser/tool schema 组合，而不是用昂贵 run 发现整个批次的 action 都被静默吞掉。

## 9. Environment 何时才算结束

Agent 停止输出不代表环境达到最终状态。SQL、后台进程、文件写入、异步服务或缓存可能继续变化。

Outcome finality 表示后续事件不会再改变当前结果；cross-run separation 表示前一个 run 不会影响下一个 run。Environment interface 因而需要表达 `pending | final | indeterminate`，并提供 namespace、reset、cleanup 与资源释放证据。

一次 pending SQL 不应被提前记作模型失败；一个未清理 workspace 也不应被下一 case 继承。

## 10. Goodhart 的六条路径

### Case overfitting

反复查看公开 case 并据此修改系统，最终提高的是对已知题的适配。

### Judge gaming

答案通过长度、Markdown、自信措辞或 rubric 关键词提高 judge 分数，而执行正确性没有提升。

### Harness gaming

增加 retry、工具、token budget、检索或反馈后得分上涨，但上涨来自 Harness，不应全部归因于模型。

### Environment leakage

缓存、workspace、session、memory 或后台进程跨 case 泄漏，后续 case 获得不应有的信息。

### Benchmark contamination

题目、语义变体、模板、teacher knowledge 或运行中反馈进入模型、检索或 agent memory。

### Statistical Goodhart

选择有利的聚合、丢弃 invalid、使用错误 bootstrap unit、只报均值或只报单次 pass，制造不存在的提升。

## 11. Train、Heldout 与 Fresh

`train` 用于开发、调 prompt、调 comparator 和逐题分析，可以公开并反复运行，但不能作为唯一 headline。

`heldout` 用于固定版本的同分布泛化检查。它不进入训练、few-shot、检索、阈值调参或人工挑例；默认只返回聚合结果和受控错误样本。反复查看 heldout 并修改系统后，它就成为事实上的 train。

`fresh` 在模型、Harness 和 grader policy 冻结后从新时间窗口采集，用于检测时间漂移、公开集过拟合、heldout 适应和间接污染。旧题改名不是 fresh，看过结果再修改筛选规则也不是 fresh。

三个 slice 必须使用相同 canonical envelope 和显式评分 policy，同时分别报告构成、难度、来源和环境条件。否则 slice 差异可能只是分布差异。

## 12. 怎样读取 Goodhart delta

假设 baseline 是：

```text
train 60
heldout 58
fresh 57
```

候选版本变成：

```text
train 78
heldout 60
fresh 52
```

这更像公开集过拟合或污染，而不是可信提升。若候选变成 `68 / 66 / 64`，跨 slice 同向提升才更可信。

报告至少包含每个 slice 的 execution score、judge score、两者 gap、失败结构、样本数与 CI，并输出 `Δ_train-heldout`、`Δ_heldout-fresh` 及其相对上一冻结 baseline 的变化。

## 13. pass@1、pass@n 与 strict pass^k

`pass@1` 是一次调用的成功率。标准 `pass@n` 表示 n 次中至少一次成功，测探索与多样性。Strict `pass^k` 表示 k 次必须全部成功，测重复可靠性。

对于 `[pass, fail, pass]`：

```text
pass@3 = pass
pass^3 = fail
```

结果必须保存逐次 attempt vector，才能重算探索、稳定性、方差和相关性。两种聚合不能继续混名为 `pass_k`。

## 14. Judge 需要双向验证

Judge reliability 至少包括两个方向：

- Invariance：SQL 等价变换、变量改名或无关格式变化不应改变 verdict。
- Construct sensitivity：删除关键过滤、改变时间范围、使用错误表或破坏聚合粒度时 verdict 必须变化。

一个 judge 可以高度稳定，却对真正错误不敏感。Judge validation 因而不能只看 self-consistency、human correlation 或 style control。

## 15. CI 之前先声明 estimand

“95% CI”只有在下列内容固定后才有意义：

- estimand：attempt accuracy、case accuracy、strict stability、win rate 或 paired delta；
- tie/invalid/abstention policy；
- micro/macro/item aggregation；
- sampling unit 与 cluster unit；
- coverage 与有效样本数。

同一 case 的多次 attempt、多个 rubric dimension、多个 judge 与位置交换结果通常相关，不能全部当成独立样本做普通 bootstrap。

## 16. 多轮评测不仅是多条消息

真实多轮 agent 评测还包括 workspace 与 environment state 延续、旧需求继续成立、verifier 累计、artifact lineage 和 regression。`MultiTurnSession` 若只保存 transcript，会把真实持久任务退化为聊天测试。

需要记录 workspace identity、environment identity、state lineage、每轮 verifier version、累计 requirements、artifact changes、round success、regression 和 fail-stop outcome。

## 17. G10 的最终决策检查表

1. Benchmark Pack 是否拥有 case、hidden material、policy、provenance 和 aggregation？
2. Harness 是否只拥有 agent execution，而看不到 hidden ground truth？
3. Environment 是否只返回执行事实，不决定 benchmark verdict？
4. Source schema 是否通过具名 adapter 无损编译到 canonical protocol？
5. 每个 adapter 是否有 parity、oracle 和 provenance-preservation 证据？
6. Run identity 是否固定 benchmark、adapter、harness、model、environment、policy 和 seed？
7. raw→parsed→executed→observed 是否逐阶段记录？
8. Interface mismatch 是否在批量运行前失败？
9. Outcome finality 与 cross-run separation 是否有系统证据？
10. `train | heldout | fresh` 是否具有独立版本、时间和访问规则？
11. Benchmark provenance 与 run provenance 是否分开？
12. Judge 是否有 invariance 与 sensitivity 双向探针？
13. 统计协议是否声明 estimand、cluster unit、abstention 和 CI 定义？
14. 标准 `pass@n` 与 strict `pass^k` 是否分别保存和报告？
15. 多轮结果是否包含 state/verifier/artifact lineage？

## 18. G10 不负责的内容

G10 不决定具体 comparator 默认值，不决定 event case 最终评分口径，不实现污染 detector，不负责 fresh case 生产，也不执行 T9/T12 重构。它负责给这些后续工作提供正确的模块所有权、协议字段和生命周期接口。
