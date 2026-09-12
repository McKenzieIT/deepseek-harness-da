# Agent Note: 基于生产 DSH composition 的数据领域 Evaluation Core

Status: proposed

[English](2026-09-11-data-domain-evaluation-core.md) | 中文

## 问题

当前 evaluation 路径把 Benchmark 内容、SQL 专用评分、批量执行、Provider 接线、Context 组装、持久化、比较和产品控制混合在 `dsh-eval`、`dsh-eval-runner`、`dsh-eval-runner-service` 与 `dsh-eval-cli` 中。两套 runner 和两套 adapter 已经产生分歧，而实际路径绕过生产 Agent、重复 Context 组装、硬编码一个 DataScope，并把 evaluation 控制挂入普通 data-agent bundle。

这种结构无法支持可信的产品结论。直接运行 `Nl2sqlEngine` 或 responder 不会经过生产 profile、preset、Agent loop、Session、tool pipeline、approval policy、hooks、guards、workflow、persistence 或配置的 Provider graph。只用 model、case id 和少量 flag 标识的结果，也无法区分 Benchmark 内容、Harness composition、Context、Environment、grading、observation 或 sampling 的变化。

Benchmark 内容和 runtime code 的生命周期不同。Case、split、policy 与 fresh cohort 需要内容 identity 和 private-material isolation；grader、repository、Environment controller 与 generator 则需要可执行的 Cordis lifecycle。让每个 Pack 都成为 plugin 会把内容变化绑定到 package release；让每个 Pack 都只是可变目录又没有稳定 identity。把 private answer 放在 Harness 可见的 package assets 旁边同样破坏访问隔离。

目标必须继续是 data agent，而不是 evaluation 专用 agent。Evaluation 可以观察、控制一次 attempt lifecycle，并对 sealed evidence 评分；但它不能在声称 production equivalence 时插入隐藏 prompt、tool、retry、approval、feedback 或 stopping 行为。移除 Evaluation overlay 后，系统仍必须是完整的普通 data-agent 产品。

## 提案

为数据工程、数据分析和数据科学建立 Data-domain Evaluation Core。Data analysis 是首个完整 extension；共享 protocol 不包含 SQL rows、数据库品牌、具体 DataScope 或 semantic-layer 默认值。Product Evaluation 通过正常 Agent 和 Session 接口驱动冻结的生产 DSH composition。Component Evaluation 以不同 subject identity 保留，且不能支持产品级结论。

### 所有权与接口

| 角色 | 拥有 | 不拥有 |
|---|---|---|
| Benchmark Pack | Case manifest、public task material、private-material reference、policy、requirement、split、provenance、aggregation | Agent execution、Provider selection、runtime default |
| Harness | 已解析的生产 profile、preset、model interface、Agent interaction、tools、approval、hooks、guards、workflow | Correctness policy、private grading material |
| Evaluation Environment | Requirement preflight、attempt lease、Provider state observation、finality、separation、cleanup、assurance | Query/filesystem/workflow operation、DataScope、correctness |
| Context Projection | 生产 context selection、ranking、budgeting、serialization、provenance、projection evidence | Benchmark oracle、grading、Environment execution |
| Grading Runtime | Sealed-cut validation、private-material authorization、mechanism invocation、immutable Grade Record | Agent execution、Context retrieval、business Provider |
| Evaluation Controller | Run resolution、Attempt orchestration、sealing、grading invocation、cancellation、publication eligibility | Benchmark content、domain action、storage implementation |

每个可替换 capability 都使用 Cordis Definition / Provider / Consumer 角色。生产 Provider 不感知 evaluation。首版使用外部 CLI/SDK Host，不在普通 data-agent composition 中永久挂载 Evaluation Service 或 model-facing benchmark trigger。

### Benchmark 与 Context 内容

Canonical case 是浅层 `CaseManifest`，显式引用 public material、private grading material、具名 policy profile、Environment requirement 与 Context requirement。缺失的语义字段不会继承隐藏默认值。内部 K11/RBI 格式只是迁移输入，不是兼容约定。

Benchmark Pack 是 sealed、content-addressed 的数据 bundle，本身不必是 Cordis plugin。`BenchmarkRepository` capability 解析显式 locator、验证完整 closure、将其 seal 到 Artifact Store，并返回精确 digest。可执行的 grading mechanism、importer、generator、validator 与 Environment fixture 是可选 companion plugin。公开 npm package 可以携带 public Pack assets 作为分发适配器，但 package version 不会替代 Pack content identity。Private grading material 只能由 grader 侧 service graph 访问。

Context Projection 是普通产品 capability。生产 Agent 与 Product Evaluation 使用同一条 typed request-to-projection 路径。Projection 记录 candidates、selected facts and relations、scores、provenance、budget、serialization identity 与 model-visible digest。No-context、schema-only、relation、production 与 oracle 配置都是显式 variant；oracle 或 hidden-derived Context 永不进入 production headline。

### Evidence、Measurement 与 Identity

Protocol 分开产品 Session facts、evaluation records 与 artifact bytes。`SessionStore` 继续作为 model-visible history 的权威。`EvaluationStore` 拥有 Run、Attempt、evidence manifest、grade、measurement、comparison plan 与 publication eligibility。`ArtifactStore` 拥有 immutable content-addressed bytes。外部 table、job、service 与 registry 是 Resource，不是 Artifact；Provider receipt 标识已观察的 snapshot 与 assurance。

Formal grading 消费 persisted、sealed、completeness-checked Evidence Cut。Product subject 分别引用 Session cut 与 Evaluation cut；Component subject 使用自己的 cut，不虚构 Session。Live score 是 provisional。Rescore 创建新的 immutable Grade Record，不重新运行 model 或 Environment。Cleanup failure 保留已计算的 evidence 与 grade，但可能阻塞 finality、publication 或 independent-trial eligibility。

一个 Evaluation Run 拥有一个冻结的 resolved DSH root，并包含一个或多个 Attempt-scoped Agent。在 Provider 证明 per-attempt isolation 之前，Attempt 默认串行。Run Identity 是 Benchmark、Harness、model/interface、DataScope、Environment、Context、grading、Observer、operation 与 extension 的 content-addressed component identity 无环图。Materialized manifest 是确定性导出，不是第二个权威来源。

跨 Run 分析需要 versioned Comparison Plan，声明 treatment 与 controlled factors、matching unit、estimand、inclusion policy、aggregation 与 uncertainty。Evidence validity、metric semantics、analysis-unit compatibility、publication eligibility、hidden-material isolation 和 case coverage 构成不可放宽的 safety floor。没有 plan 时，只能聚合同一 Run Identity 下的重复 observation。

### 产品真实性

Evaluation Observer 是 scope-local、effect-owned 且只读的。它可以索引 immutable Session 与 capability facts，但不能修改 prompt、model request、tool schema、tool argument、approval、retry、steering、stopping 或 Provider behavior。任何此类变化都是具有不同 Harness identity 的 Intervention。Observer failure 会让 evaluation evidence incomplete，而不会变成模型失败。

Product Evaluation 加载生产 profile、bundle、preset、DataScope、Context Projection 和已配置 Provider，再通过公开 Agent/SDK 入口创建正常 Agent。首版只有一个共享 Evaluation Controller 和薄外部 CLI/SDK Host。当前 in-process runner service、direct engine responder、重复 adapter 与 default bundle evaluation controls 在最终 cutover 时删除。

### Package 与迁移

首版角色分别对应 Protocol、Controller、Grading Runtime、Environment Definition、BenchmarkRepository Definition/local Provider、EvaluationStore Definition/local Provider、ArtifactStore Definition/local Provider、data-analysis extension 与 CLI Host。生产 Context Projection 位于 data-agent capability 区域。只有真实 capability role 才创建 package；Definition package 必须拥有完整语义，Provider package 必须隐藏实质实现复杂度，不能只 re-export types。

迁移按已审查的 stack 进行：[T11](../../../../wayfinder/evaluation/tickets/T11-loader-provenance-strip.md) → [T1](../../../../wayfinder/evaluation/tickets/T1-exec-grader-impl.md) → [T13](../../../../wayfinder/evaluation/tickets/T13-context-projection-service.md) → [T9](../../../../wayfinder/evaluation/tickets/T9-evaluation-foundations.md) → [T14](../../../../wayfinder/evaluation/tickets/T14-data-analysis-extension-pack-migration.md) → [T15](../../../../wayfinder/evaluation/tickets/T15-evaluation-controller-cli.md) → [T12](../../../../wayfinder/evaluation/tickets/T12-eval-package-consolidation.md) → [R25](../../../../wayfinder/evaluation/tickets/R25-evaluation-rebaseline.md)。分阶段只服务 review 与归因，不形成兼容承诺。最终 cutover 删除旧 package、export、bundle row、glob、default 和 format，不保留 shim。

### 与 active 决策及 Agent Note 的关系

[Execution grader 决策](../../../../wayfinder/evaluation/tickets/G1-exec-grader-seam.md) 与 [query capability ownership](../../proposed/testing/2026-09-07-evaluation-query-capability-boundary.zh.md) 继续分别约束 execution normalization 与 SQL submission。[Dead eval-core runtime](../simplification/2026-09-03-delete-unused-eval-core-runtime-stack.md) 和 [dead NL2SQL eval subpackage](../simplification/2026-09-03-remove-nl2sql-engine-eval-subpackage.md) 提案保留独立删除证据，本 Note 拥有它们的目标架构。旧的 adapter fork 提升至 `dsh-eval-runner`、把 `compare.ts` 折入该 runner，以及保留 eval-cli repo-root discovery 的提案被拒绝，因为目标是删除这些 runtime 与 Host ownership，而不是原地整合。

## 考虑过的替代方案

**继续扩展当前 `eval-runner-service`。** 这样可以保留现有 consumer 和接线，但会继续保留 evaluation 专用 Agent substitute、重复的 Provider/Context glue、默认产品污染，以及首版并不需要的 service-first lifecycle。

**把所有 evaluation 代码合并到一个 `dsh-eval` package。** 这样可以减少 package 数量，但会迫使 Benchmark Pack、SDK projection、private grader、store、Provider 和 Controller 共享依赖与发布面，尽管它们独立演化、独立运行。

**让每个 Benchmark Pack 成为 npm/Cordis plugin。** 这样可以直接安装和注册，但会把 case 变化绑定到代码 release，并把 private data 放入 Harness 可见的 package tree。静态内容不会从 plugin lifecycle 中获得有效收益。

**只保存 live trace 并在内存中评分。** 这样可以降低延迟，但无法支持 crash-safe publication、offline rescore、完整 coverage、durable identity，也无法区分模型失败与 evidence failure。

**运行简化的 evaluation-only Agent。** Direct engine 或 responder 路径更快，但不会测量生产 prompt、tools、approval、hooks、guards、workflow、Session history、Context 或 Provider composition。

**一次性 big-bang rewrite。** 这样可以避免临时新旧路径，但会把 execution semantics、product Context、package move、case migration、product Harness behavior 和 baseline change 混成一个无法归因、无法局部 review 的结果。

## 验收标准

- Product Evaluation 运行正常 production composition；除非 Intervention 拥有不同 Harness identity，否则不存在 evaluation-only model-visible behavior。
- Benchmark、Harness、Environment、Context Projection、Grading Runtime、Controller、store 和 domain extension 遵循本 Note 的 ownership 与 dependency direction。
- Canonical Pack 与 Evidence Cut 已 seal 且 content-addressed；被测 Harness 无法访问 private material。
- Formal Grade Record 可由 persisted evidence 推导；PublicationEligibility 将 incomplete、unresolved、invalid、observational 和 cleanup/separation failure 与 incorrect answer 区分。
- Run Identity 与 Comparison Plan 拒绝非计划 component drift，以及不兼容的 metric、unit、split 或 assurance。
- Data-analysis 提供首个完整 extension；data-engineering 和 data-science conformance fixture 证明共享 protocol 不含 SQL 或单一 DataScope 默认值。
- 最终 cutover 删除当前重复 runtime、adapter、service host、default evaluation control、legacy case discovery 与 compatibility export。
- 首个新 baseline 记录为新 anchor，且绝不表示为可与无效历史百分数直接比较。

## 风险

Capability-oriented package graph 会在产生新分数前增加 package 与 schema 成本。每个 package 都必须通过 replaceability、isolation 或独立演化证明拆分价值；浅层 wrapper 应在实现落地前合并。

Production Context Projection seam 若缺少 parity test，会改变正常 Agent 行为。在 Evaluation 依赖它之前，必须具备 product snapshot、model-visible hash、token/latency measurement 与 matched run。

Content-addressed Pack、identity 与 Evidence Cut 需要 canonical encoding、stable read、closure validation 与 garbage collection。Digest 只证明自己覆盖的 bytes；External Resource 仍需要 Provider-specific snapshot 与 assurance receipt。

Observer、evidence writer 与 artifact capture 会增加开销。必须用 paired deterministic calibration 证明行为透明，并在性能报告中包含 Observer identity 与 cost。

分层 stack 会在开发分支上暂时保留旧代码。任何中间兼容路径都不会成为 release contract，最终 cutover 后 master 不得保留两套正式 Evaluation runtime。
