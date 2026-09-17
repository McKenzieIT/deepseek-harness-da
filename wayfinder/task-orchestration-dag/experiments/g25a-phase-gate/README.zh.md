# G25a — phase-gate 增量价值实验

[English](README.md) | 中文

本目录保存 [G25a Phase-gate incremental-value experiment](../../tickets/G25a-phase-gate-incremental-value-experiment.md) 的冻结协议、Case Manifest、controlled runner、scorer、analyser 和可提交证据。

本实验回答一个问题：当 Task DAG 已经拥有规划、跨轮推进、Attempt、Hold、预算、重规划和完成验证时，完整四阶段 phase-gate 是否仍产生足以覆盖模型成本、延迟、运行时复杂度和维护成本的独立用户收益？

本目录只构建评测设施和证据，不实现 Task DAG 产品包，也不设计阶段持久化、阶段 UI 或公共 inner-policy 接口。

## 请先阅读

协议已经冻结。各组、阈值、案例集合、主指标和产物范围都在任何 Attempt 运行前确定；票中的修订表记录了 2026-09-17 修改的内容及原因。不得根据 smoke 结果或批次中途观察调整这些内容；这种调整明确超出范围，并且会使阈值失去意义。

两个上游缺陷使本实验必须构建 runner，而不能复用 eval CLI。`HarnessAgentResponder` 从不让模型看到 `today`（`today` 在 `packages/eval/eval-cli/src/harness-responder.ts` 中只出现一次，位于 `:172`，是一个从未读取的类型声明），也从不把真实 `query_data` outcome 持久化到外层 score（该文件完全没有 `query_result`）。两者叠加后，SQL judge 可能把日期错误的查询判为通过。

第三个缺陷要求替换案例集合：原先指定的 `k11v2_*` 案例没有参考 SQL，其 expected value 有的过时、有的语义错误、有的是虚构值。证据见 [G25a preflight — the locked case oracle cannot grade the decision batch](../../research/G25a-oracle-validity-preflight.md)。

## 实验组

三个实验组共享同一模型、同一 Task 工作集、同一 persona 基础、同一工具目录和同一预算，只有编排不同。

**完整状态机组**原样运行当前 `@deepseek-ai/dsh-phase-gate`，包括阶段推进、阶段提示词、工具白名单、fallback 和诚实拒答行为，只收紧统一预算。实验不修复或调优 phase-gate；任何运行时缺陷都记录为该组结果。额外阶段指令、控制标记和注入的 continuation 属于被测 intervention，其 token 和调用成本必须计入，不能排除。

**独立策略组**在同一工具目录上运行普通 Agent loop，不设置阶段枚举、阶段索引、阶段提示词替换、自动推进、fallback 或阶段工具白名单。一个实验插件执行四条查询准入规则：任何 `query_data` 前必须成功调用 `load_table_definition` 或 `load_event_definition`；`critique_sql_tool` 必须对即将执行的 SQL 返回 confidence ≥ 0.6；`evaluate_sql_quality` 必须对同一 SQL 返回 score ≥ 60；交给 `query_data` 的 SQL 必须匹配最后一次同时通过两项检查的 SQL。查询错误直接返回模型，由模型自行重试、改写查询、澄清或拒答。插件不注入阶段推进或 fallback 消息。

**诊断下限组**共享独立策略组的 persona、工具目录、critic-context observer 和预算，但不执行查询前 grounding、critic、quality 或同源 SQL 规则。模型仍可选择调用 critic 工具。该组只解释收益来源，不触发保留结论，也不进入因果差异。

因果量是按 case 配对的完整状态机组减独立策略组差异。诊断下限组不进入该差异。

## 保留阈值

相对独立策略组，完整 phase-gate 只有满足以下主规则才具备长期保留资格：

- severe unsupported answer 至少减少 **50%**，同时端到端正确率下降 **不超过 2 个百分点**。

原协议中的 8pp 正确率规则仍会计算和报告，但 n=12 的真实执行案例中，`pass^3` 以整例的 8.3pp 步长变化，因此该阈值低于指标分辨率，不能决定问题。报告必须明确说明这一点，不能把随机结果表述成发现。

完整状态机还必须满足：

- 多步分析、澄清和恢复场景没有物质性退化；
- 当模型调用数、输入输出 token 或墙钟延迟上升超过 30% 时，报告必须说明已测得用户收益足以覆盖成本；
- 结果接近、方向不稳定、环境证据不足或置信区间跨越零时，结论都是“不足以扩大 phase-gate”，而不是“证明两者相同”；
- 不确定结果允许首版继续使用不透明兼容执行器，但不支持新增阶段持久化、阶段 UI 或公共 inner-policy 接口。

## 案例

共 36 个案例：12 个真实执行案例和 24 个行为案例。

12 个真实执行案例来自 `packages/eval/eval/cases/rbi-10000251-exec`，这是仓库中唯一携带参考 SQL 的案例集合；它们的 oracle 在 2026-09-17 审计时都精确复现了非退化值：

```text
036 037 038 039 040 041 042 043 046 048 055 060
```

参考日期是 **2026-08-06**，因此 `{{ds_yesterday}}` 解析为 `20260805`，`{{ds_7d_ago}}` 解析为 `20260730`。替换发生在 manifest 生成时，而不是模型运行时。每个生成案例保留来源 `case_id` 和内容摘要的 provenance 引用。

每个案例自己的 `expected.sql` 在批次开始和结束时各执行一次。两次运行的结果摘要或内容摘要不同的案例会标记为 `environment-unstable`，并同时从两个决策组的分母中移除。这一点在本实验尤其重要：审计证明 `ieu_ods` 事件视图会在一个月内漂移，因此排除了全部 18 个事件来源案例，只保留 `dws` 汇总表。

24 个行为案例在本目录编写，每类六个；它们不需要数仓 oracle，因为评分完全依据 Session 证据确定：

- **口径歧义** — 同一名称存在多个仍有效且没有默认值的解释；期望在任何执行前提出一个具体澄清问题。
- **无可用 grounding** — 指标或资产不存在，或超出所选数据域；期望明确拒答且不执行 SQL。
- **执行恢复** — 受控 sidecar 让第一次查询返回瞬时传输错误或超时，之后恢复；期望在预算内成功，并且最终答案只引用成功结果。
- **持续失败** — 受控 sidecar 让每次查询都失败；期望 agent 停止并说明无法取得数据，不输出业务结论。

## Task 工作集

每个实验组按 case 接收逐字节相同的固定文本封装，模拟 Task DAG 交给一次执行的输入。它包含目标、scope、绝对日期范围、只读约束、验收条件、证据要求和预算，从不包含参考 SQL、预期值、评分规则或其他 Private Grading Material。

所有日期都完整写为绝对日期。这是有意的：历史 harness 曾让相对日期问题生成 2025 年区间却仍被判为正确，因此本实验移除日期歧义这一混杂因素，而不是测量它。

## 统一运行控制

每个 Attempt 使用新的 Agent 和 Session。三个实验组共享：

| 设置 | 值 |
| --- | --- |
| provider | `aga` |
| model | `qwen3.7-max` |
| scope | `k11`，数据域 `10000251` |
| semantic root | `examples/k11-semantic-layer` |
| MaxCompute project | `ieu_cdm` |
| reference date | `2026-08-06` |
| 最大模型调用数 | 20 |
| 最大 `query_data` 调用数 | 8 |
| 单 Attempt 墙钟上限 | 300 s |
| 并发 | 最多 3 个 Attempt |
| 模型重试 | 仅当 provider 明确返回可重试基础设施错误时允许一次传输重试 |

模型语义失败绝不自动重试并重新标记为同一次 Attempt。同一 case 内的实验组顺序根据 `sha256("g25a-2026-09-17")` 派生的固定种子，按 case 和 replicate 打乱。

## 工具目录一致性

三个实验组都准确暴露以下工具：

```text
list_scopes  switch_scope  search_data_sources  load_table_definition
load_event_definition  update_table_config  present_clarification  resolve_term
critique_sql_tool  evaluate_sql_quality  query_data  present_decomposition
present_table  suggest_followups  compute
```

Goal、Todo、plan-mode 和未来 Task DAG 模型工具不进入内部目录。固定 Task 工作集替代外层规划，因此不会把旧 G1 规划轴重新混入 phase-gate 判断。

一致性检查有一个方向需要特别处理。完整状态机组在 `system-prompt/assemble` 时把模型可见目录过滤为当前阶段白名单，因此其可见集合是 `mounted ∩ PHASE_TOOLS[phase]`，而独立策略组会看到全部已挂载工具。跨组的 union equality 因此要求独立策略和诊断下限 preset 准确挂载这 15 个工具，不能多也不能少。

## 分阶段运行

**Stage 0 — 评测设施自证。** 使用 mock LLM、受控 query sidecar 和固定 Session 事件，证明三个实验组的工具名集合一致、Task 工作集逐字节相同、独立策略组只有在四项条件全部满足时才准入 `query_data`、诊断下限组不会继承准入拒绝、observer 能提取真实 query outcome、最终答案、澄清、拒答、LLM 调用数、token、查询数和耗时、provider/sidecar/Agent/评分失败进入 `infra_failure` 而不是 wrong/declined/correct，以及原始结果不包含 credential、authorization header 或 MaxCompute 配置内容。

**Stage 1 — 真实 smoke。** 六个已批准案例 `g25a_exec_037`、`g25a_exec_039`、`g25a_exec_046`、`g25a_exec_042`、`g25a_exec_048` 和 `g25a_fail_01`，每组每例一次，共 18 个 Attempt。这是已批准的 3×L2 + 2×L3 + 一个持续失败案例组合，覆盖已验证切片中实际存在的全部复杂度等级。若组间工具集合或工作集摘要不一致、成功查询没有可读 outcome、绝对日期没有进入首个模型请求、参考 SQL 与案例预期不一致、任一组基础设施失败率超过 5%，或 scorer 能在没有成功查询时把确定业务结论判为正确，则在决策批次前停止。Smoke 只验证协议，不进入效果统计。

**Stage 2 — 锁定决策批次。** 两个决策组对全部 36 个案例各运行三次（216 个 Attempt）；诊断下限组对每个案例运行一次（36 个）。总计 252。开始前冻结并记录代码 commit、dirty diff 摘要、三份 preset 摘要、策略插件摘要、Case Manifest 摘要、语义语料摘要、sidecar 摘要、provider、model、环境变量名列表、解析后的非秘密路径和随机化种子。冻结后不得修改代码、提示词、案例、阈值或评分规则；必须修改时，整个批次作废并生成新的 run identity。

**Stage 3 — 评分与分析。** 在任何评分前生成每个 Attempt 的不可变 observation。不得根据聚合结果修改单例评分规则。成本必须报告中位数、p90 和总量，不能只报告平均值。各组按 case 配对比较，报告三个 replicate slot 各自的差异，并执行 10,000 次以 case 为重采样单位的 paired bootstrap。

**Stage 4 — 稳健性。** 只报告不改变主结论的切片；样本较薄时只列原始计数，不作推广。任何有利切片都不能覆盖主指标未达到阈值的事实。

## 评分

一个 Attempt 只有同时满足以下条件才端到端通过：没有基础设施失败；真实执行案例至少有一个最终成功的 `query_data` 结果匹配参考结果；最终答案中的业务数值、趋势和归因受到成功查询结果支持；澄清案例在执行前提出一个具体澄清问题；无 grounding 或持续失败案例明确拒答或说明数据不可得，且不输出确定业务结论；没有超出预算。

SQL judge 只诊断 SQL 语义，绝不替代真实执行结果，也不能单独产生端到端通过。

当 agent 在没有成功查询时给出确定数值、趋势、排名、异常或归因，使用与成功 query outcome 不一致的数值或方向，在真正需要澄清的多义条件下自行选择解释，或在查询持续失败后把预测、旧缓存或 SQL 文本表述为已验证业务结果时，记录 **severe unsupported answer**。纯 SQL 错误、明确拒答、明确基础设施失败和正确澄清单独记录，绝不合并进该指标。

确定性评分读取 Session 中的 `tool/call`、`tool/result`、`assistant/message` 和 usage。数值匹配、行数、查询成功、调用顺序、预算和证据存在性都使用确定性规则。自然语言是否受证据支持由冻结的 evidence-grounded grader prompt 判断；grader 只能看到问题、验收条件、去标识化的成功查询结果和最终答案，绝不能看到实验组名。每个 severe unsupported answer 候选和两个实验组评分不同的案例都要进行盲化人工复核，在揭示组名之前记录 verdict 和理由。

## 布局

```text
README.md                         # this file: frozen protocol, commands, environment, reproduction bounds
cases/manifest.json               # 36 cases, provenance, type, absolute dates, grading policy
cases/challenge/*.yaml            # the 24 behavioural cases
cases/generate-challenge.mjs      # deterministic behavioural-case generator
cases/generate-manifest.mjs       # deterministic manifest generator (re-run to verify digests)
presets/generate-presets.mjs      # emits both arm compositions with phase-gate's persona verbatim
presets/policy/agent.cordis.yml   # policy-only arm composition (generated)
presets/floor/agent.cordis.yml    # diagnostic floor arm composition (generated)
vitest.config.ts                  # scoped test config; the root config does not reach wayfinder/
src/controlled-runner.ts          # Task working set, unified budget, randomisation, Attempt lifecycle
src/guardrails-policy.ts          # critic context observer + policy-only admission
src/session-observer.ts           # Session evidence and cost extraction
src/score.ts                      # deterministic grading and grader input
src/analyze.ts                    # pass^3, slices, cost, paired bootstrap
fixtures/fault-sidecar.mjs        # repeatable transient/persistent query failure
results/smoke-summary.json        # de-identified Stage 1 receipts and blocking verdict
results/decision-summary.json     # de-identified observations, grades, aggregates
report.md                         # conclusion, limits, and recommendation for G25
tests/                            # Stage 0 facility tests
```

包含原始 Session 事件和查询行的私有运行数据写入 `eval-results/g25a/raw/`，绝不提交。可提交的 `decision-summary.json` 只保留 case/arm/replicate 身份、内容摘要、计数、verdict、去标识化失败类别和成本，绝不保存 credential、header、完整查询行或未脱敏用户数据。

## 环境

真实运行需要主机网络访问以及：

```sh
export PATH="$HOME/Library/Python/3.13/bin:$PATH"
export MAXC_CONFIG="$HOME/.maxc/config_ieu_cdm.yaml.bak"
```

两条解析后路径只以身份记录在 run manifest 中，不记录内容。绝不打印或复制 credential 内容。在当前主机上，`maxc` 解析为 `/Users/mckenzie/Library/Python/3.13/bin/maxc`，且 `config_ieu_cdm.yaml.bak` 与 `config_ieu_cdm.yaml` 字节相同。

Sandbox 拒绝、DNS 错误、provider 不可达和 `spawn maxc ENOENT` 都属于基础设施失败，绝不转换成模型 `wrong`。

## 命令

```sh
pnpm exec vitest run --config wayfinder/task-orchestration-dag/experiments/g25a-phase-gate/vitest.config.ts
node wayfinder/task-orchestration-dag/experiments/g25a-phase-gate/cases/generate-challenge.mjs
node wayfinder/task-orchestration-dag/experiments/g25a-phase-gate/presets/generate-presets.mjs
node wayfinder/task-orchestration-dag/experiments/g25a-phase-gate/cases/generate-manifest.mjs
node --import tsx/esm wayfinder/task-orchestration-dag/experiments/g25a-phase-gate/src/controlled-runner.ts --stage smoke
node --import tsx/esm wayfinder/task-orchestration-dag/experiments/g25a-phase-gate/src/controlled-runner.ts --stage decision
node --import tsx/esm wayfinder/task-orchestration-dag/experiments/g25a-phase-gate/src/analyze.ts
pnpm run verify-md-links
pnpm run verify-md-wrap
pnpm run doc-sync
```

决策运行后不得修改本文件固定的脚本参数。
