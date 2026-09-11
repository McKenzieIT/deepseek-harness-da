# Agent Note: Evaluation 通过 query capability 执行 SQL

Status: proposed

[English](2026-09-07-evaluation-query-capability-boundary.md) | 中文

## 问题

执行级评估必须在已标识的数据快照上运行候选 SQL 和参考 SQL，但 SQL 提交不属于 evaluation 职责。如果 evaluation 拥有数仓客户端、凭据、scope routing、pending query attach、取消或 provider failure，它就会在生产 query capability 旁边建立第二套执行栈。如果 evaluation 转而对模型可见的 `query_data` 渲染结果或 transcript 预览评分，presentation 与截断会进入 oracle，评分也无法从权威执行证据重放。

职责边界是持久决策，但 evaluation interface、ground-truth lifecycle 和 comparator 默认值仍是开放问题。此处记录这些未决细节会绕过 [G1 — Execution grader seam](../../../../wayfinder/evaluation/tickets/G1-exec-grader-seam.md) 与 [G1b — Ground-truth lifecycle](../../../../wayfinder/evaluation/tickets/G1b-ground-truth-lifecycle.md) 的 HITL 决策，以及 [R23 — Comparator-policy mutation baseline](../../../../wayfinder/evaluation/tickets/R23-comparator-policy-mutation-baseline.md) 的实验。

## 提案

让 `@deepseek-ai/dsh-query` 继续作为 SQL 提交与 backend lifecycle 的唯一 capability。Evaluation 通过注入 adapter 消费 `ctx.query.execute`，并独立执行它要评分的 SQL。Query capability 拥有 scope routing、凭据、provider request 与 error、pending query attach、取消和进度；evaluation 拥有从 `QueryOutcome` 到 evaluation evidence 的转换、snapshot 与 ground-truth provenance、result normalization、comparator policy、评分和持久化 verdict。

Evaluation 依赖 query Service Definition，而非 `MaxComputeQueryEngine` 或其他 provider class。评分路径消费结构化 execution outcome，不经过模型可见的 `query_data` rendering layer 或 transcript preview。只有当 G1 找到具体缺失的 operation 或 invariant 时，provider-specific capability gap 才形成独立的 query/data-agent ticket；evaluation 不提前臆造并行 provider API。

### 延后决策

G1 决定窄 adapter interface、`QueryOutcome` mapping，以及 execution verdict、judge diagnosis 与 infrastructure failure 的分离方式。G1b 决定 reference authoring 与 review、snapshot identity、artifact provenance、benchmark versioning，以及 legacy 和 delivery-only cases 的处理。R23 在任何默认值成为权威前测量 comparator profile 与例外。本提案只约束职责归属。

既有的 [eval adapter 合并提案](../../rejected/simplification/2026-09-03-promote-eval-cli-adapters-to-eval-runner.md)处理重复的 adapter implementation。本提案既不取代该 simplification，也不在 G1 解决 interface 与 ownership 前决定 adapter 的 package 归属。

## 考虑过的替代方案

**构建 evaluation-specific warehouse executor。** 这会让 evaluator 直接为 benchmark workflow 优化，但也会重复 credentials、scope routing、cancellation、provider error handling 和 pending-query lifecycle。生产与 evaluation 随后可能因为通过不同基础设施执行而产生分歧。

**直接依赖 `MaxComputeQueryEngine`。** 这比复制 client 更窄，但会把 evaluation 耦合到单一 provider implementation，并绕过稳定的 query Service Definition。多 provider evaluation 与 provider substitution 都会因此要求修改 evaluation。

**对 `query_data` 输出或 transcript preview 评分。** 这可以复用模型可见 consumer 而无需另一层 adapter，但 rendered output 可能被截断、重排格式或为 presentation 选择。Transcript 记录的是 agent 所见内容，而不是待评分 SQL 的独立重放权威。

**把 normalization 与 comparison 移入 query capability。** 这会集中 result handling，但 comparator policy、accepted artifacts、snapshot provenance 和 verdict evidence 都是 evaluation semantics。把它们移入 query 会让生产执行依赖 benchmark policy。

## 验收标准

- G1 与 T1 使用 `ctx.query.execute` 上的 injected adapter；evaluation packages 不实现 provider submission、credentials、scope routing、pending-query attachment、cancellation 或 progress。
- Execution-grader 路径不直接依赖 `MaxComputeQueryEngine`，也不对 `query_data` rendering 或 transcript preview 评分。
- 持久化 evaluation evidence 区分 normalized execution result、execution 或 infrastructure failure、comparator policy、ground-truth provenance 与 judge diagnosis，并足以支持重放。
- 任何必要的 query-capability extension 都作为独立 data-agent/query ticket 规划，并一起考虑其 Service Definition、provider 与 consumer 影响。
- G1、G1b 与 R23 继续拥有上述延后决策；本 note 不解决它们。

## 风险

**当前 `QueryOutcome` 可能不足以提供可重放证据。** G1 可能暴露具体缺失字段或 lifecycle invariant。此时应通过独立且完整的 capability-seam change 扩展 query capability，而不是把 provider knowledge 编码进 evaluation。

**独立重放比复用 transcript output 成本更高。** 候选与参考执行都会消耗时间和数仓资源。Evaluation 必须施加显式限制并持久化足够证据以避免不必要的重复执行，同时不能把缓存的 presentation output 当作权威。

**Infrastructure failure 可能被误判为 model failure。** Adapter 必须保留二者区别，但具体 status model 与 retry semantics 仍由 G1 决定。
