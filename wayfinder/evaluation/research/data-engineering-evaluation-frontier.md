# 数据工程 Agent Evaluation Frontier

日期：2026-09-10  ·  范围：Data-domain Evaluation Core / data-engineering extension  ·  资料截止：2026-09-10

## 结论先行

数据工程 agent 的评测对象不是一段 SQL，也不只是最终答案，而是一次**在有状态环境中完成、可验证、可重放的数据系统变更**。截至本轮资料截止日，前沿 benchmark 已经从单次查询推进到仓库级 pipeline 实现和演化、异构 ELT、批流执行、环境内调试、分层数据产物和过程证据，但尚无一个公开 benchmark 同时覆盖 schema migration、data quality、lineage、batch/stream recovery、isolation 与 reproducibility。DSH 因此不应照抄某一 benchmark 的 schema，而应保留一个稳定的 Data-domain Evaluation Core，再由 data-engineering extension 定义 pipeline、dataset、checkpoint、watermark、schema change、quality assertion 和 lineage 等领域证据。

共享 Core 应拥有 identity、public/private material、requirement/binding、environment lifecycle、artifact reference、extensible evidence envelope、finality/isolation 状态、replay provenance、grading plan/result 和 comparison compatibility。Data-engineering extension 应拥有 pipeline graph、batch/stream semantics、schema migration、data quality、lineage、engine adapter 和相应 verifier。Core 不应定义 SQL rows、dbt layer、Airflow state、Flink watermark 或 MaxCompute project 等具体字段。

首个反 SQL/K11 过拟合 fixture 应是一个本地、无 SQL、无 Context 的两阶段增量文件 pipeline：agent 编写并运行程序，跨进程重启保留 checkpoint，处理 schema evolution、重复与坏记录，产生数据集、quarantine、checkpoint 和 lineage artifacts；private verifier 检查结果、质量、幂等、finality、隔离与清理。它不是第二个产品 benchmark，只是证明 Core 能承载数据工程状态与产物的 conformance fixture。

## 研究方法与证据等级

本笔记只采用论文、论文作者维护的 benchmark 仓库，以及项目官方 specification/documentation。论文与仓库实现不一致时分别陈述；仓库链接尽量固定到 2026-09-10 观察到的 commit。本文将“来源事实”和“DSH 设计推论”分开，避免把某一 benchmark 的偶然实现升级为通用要求。

证据分三层：

1. **可执行 agent benchmark**：直接说明前沿任务、环境与 grader 已经怎样实现。
2. **数据系统规范**：说明 batch/stream、schema、transaction、lineage 与 data quality 本身具有什么语义。
3. **通用 evaluation framework**：说明 task image、private verifier、oracle 与 adapter parity 等运行约束。

## 一、来源事实：可执行数据工程 benchmark 已经测什么

### 1. DAComp：仓库级实现、架构与演化已经成为独立任务类型

[DAComp paper][S1] 将 data agent 覆盖范围扩展到完整 data-intelligence lifecycle；其 [官方仓库固定版本][S2] 将 data-engineering 子集拆成 `DE-Arch`、`DE-Impl` 和 `DE-Evol`。`DE-Impl` 与 `DE-Evol` 要求 agent 产出可执行的 repository-level pipeline，而不是返回一段查询；官方 evaluator 先执行 candidate 的 `run.py` 生成 DuckDB artifact，再按 `staging`、`intermediate`、`marts` 等层检查 schema、table 和数据。它还提供两种不同的 execution-grounded 读出：在 candidate 自己生成的完整数据库上比较，以及把候选 SQL 放进 gold environment 逐表诊断。`DE-Arch` 则输出 blueprint YAML，并使用 rubric-guided LLM evaluator。

这一实现暴露出三个重要事实。第一，data-engineering task 的提交物可以是**可执行仓库加物化数据库**，而不是文本答案。第二，grading 需要同时表达 hard threshold、全局一致性和分层 partial credit。第三，architecture、implementation 和 evolution 不一定共享 grader；开放式 architecture 仍可能使用 judge，而可执行实现应优先使用确定性 verifier。

### 2. DataClawEval：真实执行环境、批流状态与 artifact/process 双重证据

[DataClawEval paper][S3] 和 [官方仓库固定版本][S4] 包含 100 个 production-grounded 端到端任务，覆盖 PySpark、MySQL、HiveSQL、PrestoSQL/Trino 和 FlinkSQL。任务要求 agent 检查 schema 和样本、实现程序、执行、根据错误调试、验证输出并物化最终 artifact。FlinkSQL 任务显式涉及 event time、watermark、window、join 和 streaming aggregation。

每个 case 在 fresh Docker container 中运行，容器预置 task-specific data、services、engine 和 utilities；reference implementation 与 grader 在 agent 结束后才加载。输出不仅包含 score，还包含 submitted files、workspace snapshot、transcript 和 usage。artifact grader 检查 executability、schema、row/value 和业务正确性；process score检查 exploration、execution efficiency 和 self-verification。数据构建阶段还会执行 ground-truth、构造能区分正确与错误实现的输入、运行 expert perturbations，并验证 grader 对 ground-truth 给满分、对有意错误实现不给满分。

论文附录进一步报告，仅读取代码文本的 LLM judge 在 streaming semantics 上会双向误判，而 rule-based grader 是 bit-exact；这支持“可执行语义可验证时不用 judge 代替执行”的原则。需要注意，DataClawEval 的 process 权重与具体 rubric 是 benchmark policy，不是共享 Core 的默认规则。

### 3. ELT-Bench 与 ELT-Bench-Verified：pipeline grader 自身必须被审计

[ELT-Bench paper][S5] 用 Airbyte、Terraform、Snowflake 和 dbt 组成端到端 ELT workload，并把 Extract/Load 与 Transform 分成两个阶段。当前 [官方仓库固定版本][S6] 已扩展到 Snowflake、Databricks 和 Redshift；stage 1 检查 expected source tables 与 row counts，stage 2 查询 candidate target models 并与 warehouse-specific ground-truth CSV 比较。它说明 environment binding、pipeline stage 与 grader artifact 都可能依赖具体 provider，但这些 provider 细节不应成为通用 Core 字段。

[ELT-Bench-Verified][S7] 对原 benchmark 做系统审计：在 81 个产生 transformation output 但未通过 column evaluation 的任务中，67 个（82.7%）至少包含一项 benchmark-attributable error；列级 mismatch 中 33.0% 被归因为 benchmark，而非 agent。错误包括过于刚性的 comparator、歧义 specification 和错误 ground truth。修正 benchmark 而保持 agent/model 不变后，SRDT 从 22.66% 上升到 32.51%，通过的 data model 从 46/203 上升到 66/203。

这说明 grader “能运行”远远不等于有效。Benchmark 发布前必须同时证明 oracle/reference 正确、输入能区分有意义的错误、comparator 不误杀等价答案，并保留 benchmark defect 与 agent failure 的独立归因。

### 4. DBA-Bench：数据环境中的 agent 行为可能是开放式、有副作用且有安全约束

[DBA-Bench paper][S8] 与 [官方实现][S9] 在五种真实数据库中评测 diagnosis、root-cause analysis、mitigation 和 system optimization，并区分 success、diagnostic reasoning、remediation 与 efficiency。其任务允许多个合法操作序列，并以 system-state improvement 作为重要读出。这一相邻方向表明，Data-domain Evaluation Core 不能假设每道题只有一个 reference program，也不能把“命令执行完成”视为“环境问题已解决”。

DBA-Bench 不应直接决定 data-engineering extension 的 task schema；它只提供一条边界证据：有状态数据系统任务需要 pre-state、side effects、post-state、安全限制、rollback/reset 与多维 verdict。

### 5. DataFlow-Harness：pipeline 本身正在成为持久、可检查、可编辑的中间 artifact

[DataFlow-Harness paper][S10] 将 agent 生成的数据处理过程表示成 typed operator graph，支持 structural、semantic 与 execution validation，并在交互式环境中保留当前 pipeline state。它的 benchmark 规模仍小，不能单独支撑通用架构，但支持一个方向：pipeline specification 不是隐藏在 transcript 里的临时文本，而是可版本化、可执行、可校验的 artifact。

## 二、来源事实：数据系统语义要求评测记录什么

### 1. Pipeline finality 不是单一 `done` 布尔值

[Apache Airflow DAG Run 规范][S11] 依据 leaf task 的 terminal states 计算 DAG Run 状态；官方文档同时警告，某些 trigger rule 可让 leaf 成功并掩盖中间 task failure。对 batch pipeline，粗粒度 orchestrator 状态因此不足以证明任务完成，grader 还要核对 required nodes、materialized outputs 与 commit 状态。

[Apache Beam model][S12] 将 event time、processing time、window、watermark、trigger 与 allowed lateness 分开。Watermark 是系统对 event-time completeness 的估计；trigger 决定何时产生 pane，late data 仍可修改结果。对 stream pipeline，“进程仍在运行”并不代表未完成，“已有输出”也不代表结果已 final。

[Apache Flink stateful processing 与 checkpoint 文档][S13] 将 operator state、source position 与 checkpoint 一起恢复；end-to-end exactly-once 还依赖可重放 source 与 transactional 或幂等 sink。[Flink savepoint 文档][S14] 又将自动 recovery checkpoint 与人为触发、用于升级或迁移的 savepoint 区分开。Checkpoint、savepoint、watermark 和 sink commit 因而是不同 evidence，不应压成一个字符串状态。

### 2. Schema evolution 与 migration 要验证 identity、数据与兼容窗口

[Apache Iceberg table specification][S15] 使用稳定 field ID 跟踪 column identity；schema 与 partition evolution 通过 metadata 演化，table snapshot 表示原子提交后的表状态。只比较 column name 或最终 DDL 会漏掉 rename、drop/add 误判和 snapshot identity。

[Delta Transaction Log Protocol][S16] 把 table state 建模为按版本排序的 atomic actions，并提供基于 application ID 与 transaction version 的幂等写入语义。对使用 transaction-log table format 的任务，可靠 grader 可比较 snapshot/version、metadata、data files 与 transaction identity，而不必把最终查询结果当作唯一事实。

[pgroll 官方实现与文档][S17] 采用 expand/contract 流程，在 migration 中同时维护 old/new schema version，执行 backfill，并允许 complete 或 rollback。该实现说明 schema migration 的正确性至少包含迁移前兼容、迁移中双版本行为、backfill、cutover 和 rollback；最终 schema 相同不能证明迁移过程安全。

### 3. Data quality 是带作用对象、规则与观测值的证据

[Deequ paper 与官方实现][S18] 将 data quality 表示为对 dataset 计算 metrics，并用 constraints/verification suites 判断 completeness、uniqueness、distribution 等属性；它也支持从历史 metrics 做 anomaly detection。[dbt data tests][S19] 将断言实现为返回 failing rows 的查询，并区分可复用 generic tests 与项目特有 singular tests。

[OpenLineage 1.53 object model 与 facets][S20] 以 Run、Job、Dataset 为核心，通过可扩展 facets 记录 schema、dataset version、column lineage、data-quality metrics 和 assertions。Data Quality Assertions facet 能记录断言内容、作用 column、pass/fail 与 observed/expected values；Column Lineage facet 能表示某个 output field 由哪些 input fields 产生。

这些规范提供可交换的数据结构，但都不自动证明 benchmark 的断言与用户意图一致。Quality 和 lineage 必须作为可审计 artifacts/evidence 保存，其 correctness policy 仍由 Benchmark Pack 明确声明。

### 4. 隔离与 private verifier 已有成熟模式

[Harbor task specification][S21] 将 task environment、instruction、reference answer/solution、verifier 和资源配置分开；官方 adapter 指南要求先验证 oracle solution，再做原 benchmark 与 Harbor adapter 的 matched parity。[DataClawEval][S3] 也在 fresh case container 中运行 agent，并在 agent 结束后加载 reference 与 grader。

共同事实是：agent-visible workspace 与 grader-only material 必须有实际访问隔离；每次 attempt 的环境初始化、运行时资源、网络/tool permissions、清理结果和 verifier identity 都属于测量条件。仅在对象上加一个 `private` 字段不能支持可信 heldout evaluation。

## 三、跨来源综合：前沿 evaluation 的最小能力集合

以下是对上述来源的综合，不是任何单一论文的原话。

### 1. 评测单位是 state transition 加 artifacts

一个 data-engineering attempt 应被建模为：

```text
(initial environment snapshot, public task, resolved capabilities)
  -> agent trajectory and side effects
  -> terminal or sampled environment state
  -> produced artifacts and evidence
  -> benchmark-owned grading
```

必须保存 initial state identity、实际执行的 action/trajectory、intermediate and final artifacts、terminal/finality evidence、grader input identity 与 verdict。只保存 prompt、最终文本或一条 `execution_match` 会丢失 pipeline 的主要测量对象。

### 2. Artifact 是一等对象，不是日志附件

最低 artifact metadata 应包含 branded ID、content digest、media type/schema version、producer、created-at、access classification、logical role、physical locator 和 parent/derivation references。典型 data-engineering artifacts 包括 source snapshot、pipeline source tree、compiled plan、table/dataset snapshot、checkpoint/savepoint、schema diff、quality report、lineage graph、quarantine dataset 和 execution transcript。

Core 只定义 artifact reference 与访问规则；artifact payload 由 extension 解释。这样 DAComp 的 DuckDB、DataClawEval 的 workspace/output table、Iceberg snapshot 和 Flink checkpoint 不必被压进一个 `unknown result` 字段。

### 3. Finality 必须是声明并解析的 policy

Core 应只拥有通用状态，例如 `resolved | unresolved | failed`，以及 finality policy identity、deadline 和 evidence references。Data-engineering extension 再定义可判定的模式：

- `batch-terminal`：required tasks terminal、required outputs committed、无 pending retry/transaction；
- `bounded-stream`：input 已封闭、watermark 超过目标 horizon、allowed lateness 已处理、sink commit 与指定 checkpoint 对齐；
- `migration-cutover`：backfill 完成、兼容检查通过、cutover/rollback 状态明确；
- `sampled-continuous`：只声明对某个 checkpoint/window 的 estimand，不声称整个 stream 完成。

Environment provider 返回事实；Benchmark 选择所需 policy；Harness 不推断“够不够 final”。

### 4. Grading 必须分层且可重放

建议保留至少四层：

1. **Execution normalization**：进程、engine、orchestrator、checkpoint、commit 与 artifact 事实。
2. **Invariant checks**：schema、row/value、quality、lineage、安全、幂等与资源约束。
3. **Benchmark grading**：由冻结的 `ResolvedGradingPlan` 选择 comparator、权重、hard gates 与 partial credit。
4. **Aggregation/comparison**：只对 compatible run identities 聚合。

当输出可执行时，deterministic verifier 是主裁决。LLM judge 只用于无法机械验证的 architecture/rationale 等维度，并应作为单独、带 judge identity 和不确定性的 grade component，不能覆盖 execution facts。

### 5. Benchmark validation 是产品能力

结合 DataClawEval 的 perturbation pipeline、ELT-Bench-Verified 的 benchmark-attribution 结果和 Harbor parity 要求，Benchmark Pack 的准入至少需要：

- oracle/reference 在目标 environment 上可执行并通过；
- positive fixtures；
- invariance probes，证明语义等价实现不会被拒绝；
- sensitivity/mutation probes，证明关键错误会失败；
- task specification、input、oracle、grader 的一致性审计；
- legacy migration 的 matched parity；
- `validated | parity_unresolved | invalid` 状态；
- grader/version/digest 与 validation evidence。

“case 能加载”“gold 程序能跑”或“新旧平均分接近”都不足以证明 parity。

### 6. Reproducibility 是 environment replay，不是要求 LLM 重复同一输出

可重放 run plan 至少冻结 Benchmark/Case、public/private artifacts、DataScope、Environment image/provider、input dataset snapshot、Context snapshot、Harness/interface/tool stack、model/provider parameters、clock/timezone、random seeds、network policy、resource limits、finality policy 与 grading plan 的 identity/digest。Environment 与 grader 应可重建；stochastic agent output 则通过保存原始 trajectory/evidence，并在需要时进行重复 runs 来估计方差。

## 四、Shared Core 与 data-engineering extension 的归属

### 共享 Data-domain Evaluation Core

| 概念 | Core 责任 | 不进入 Core 的具体字段 |
|---|---|---|
| Benchmark/Case | `BenchmarkPackId`、`CaseManifestId`、split、dimensions、provenance、validation status | dbt layer、Flink window、warehouse table name |
| Material visibility | `PublicPreparedTask`、opaque `GradingMaterialRef`、access classification | reference SQL、gold DuckDB、hidden quality rules |
| Data project | `DataScopeManifest` 及其 allowed binding references | MaxCompute project、Snowflake account、local path |
| Resolution | typed requirement、explicit binding、frozen resolved plan、digest | Airflow connection、Flink cluster、dbt profile |
| Run lifecycle | Run/attempt/stage identity、started/ended、deadline、outcome attribution | operator state、watermark、migration phase |
| Environment lifecycle | provision、preflight、observe、finalize、reset、cleanup 的接口与 evidence linkage | engine-specific command 与 terminal-state interpretation |
| Artifact | immutable `ArtifactRef`、digest、schema/media type、producer、derivation、visibility | table snapshot、checkpoint、lineage payload schema |
| Evidence | stable envelope、producer identity、schema version、artifact refs、required/ignorable semantics | query rows、pipeline graph、quality assertion payload |
| Finality/isolation | generic status、policy identity、proof refs、sandbox/access facts | watermark threshold、leaf-task rule、sink commit predicate |
| Grading | immutable `ResolvedGradingPlan`、grade component/result、grader failure、replay | row comparator、lineage matcher、migration safety rules |
| Comparison | estimand、compatibility key、aggregation declaration、invalid/unresolved exclusion | engine-specific metric interpretation |

Core 的 evidence 应采用已讨论的“稳定 envelope + extension 注册 payload”模型。它不应建立一个封闭的 `DataEvidence` union，也不应发明 `Action { type, payload: unknown }` 作为第二套 tool/session protocol。

### Data-engineering extension

| 能力 | Extension 应拥有的对象或策略 |
|---|---|
| Pipeline construction | repository/workspace artifact、pipeline graph、node/edge、dependency、schedule/trigger、compiled plan |
| Pipeline execution | task/operator states、attempt/retry、logs、materialization events、required-node policy |
| Dataset artifacts | table/file/stream identity、schema snapshot、partition、version/snapshot、row/file metrics |
| Schema migration | pre/post schema、field identity、migration operations、compatibility window、backfill、cutover、rollback evidence |
| Batch state | orchestrator terminal states、commit markers、required output set、backfill partitions |
| Stream state | source offsets、checkpoint/savepoint、watermark、window/pane、allowed lateness、sink transaction |
| Data quality | assertion spec、metrics、observed/expected values、pass/fail、quarantine/reject artifacts |
| Lineage | job/dataset/field edges、transform kind、source/output versions、completeness policy |
| Finality policy | `batch-terminal`、`bounded-stream`、`migration-cutover`、`sampled-continuous` 的判定逻辑 |
| Graders | schema/data equivalence、layered pipeline scoring、DQ/lineage/migration/safety/idempotence/performance checks |
| Failure normalization | provider/orchestrator exceptions到通用 attribution 的映射，保留原始 engine evidence |

### 暂不进入首版

- 通用代码、Web、medicine 等非数据领域协议；
- 一个能统一所有 engine command 的万能 action model；
- 把 pipeline architecture judge 变成共享默认 grader；
- 跨 engine 的统一 performance headline score；
- 未有真实任务支撑的 continuous-production evaluation lifecycle；
- 任何以 K11、RBI、MaxCompute 或 SQL 作为 Core 默认值的设计。

## 五、最小反 SQL/K11 conformance fixture

### Fixture：`incremental-file-pipeline`

这是 DSH 设计推论，不是现有论文中的原样任务。它组合了 DataClawEval 的 isolated executable task、DAComp 的 repository artifact 与 layered verification、Beam/Flink 的 state/finality 语义、OpenLineage 的 dataset/job/run 关系，以及 ELT-Bench-Verified 的 mutation/audit 要求。

#### Public task

Agent 在一个临时 workspace 中实现 `pipeline.py`。输入是两个 bounded JSONL micro-batch；不提供数据库、SQL engine、semantic Context 或网络。

- Batch 1 使用 schema v1：`event_id`、`event_time`、`account_id`、`amount_cents`。
- Batch 2 含重复事件、乱序事件、一条坏记录，并引入 schema v2 的 `currency` 字段。
- Pipeline 必须输出 canonical `daily_totals.jsonl`、`quarantine.jsonl`、`checkpoint.json` 和 `lineage.json`。
- 第二阶段在新的 pipeline process 中继续使用第一阶段 checkpoint；随后再次 replay Batch 2。

#### Environment sequence

1. 创建 clean attempt sandbox，并记录 input/workspace digests。
2. 执行 agent 产物处理 Batch 1；等待进程 terminal，并捕获 artifacts。
3. 终止进程但保留 attempt-scoped state，重新启动处理 Batch 2。
4. 再次 replay Batch 2，检查幂等。
5. 调用 independent private verifier；随后 cleanup，并验证下一 attempt 不可见前一 attempt 的状态。

#### Private verifier assertions

- 两阶段均 executable，且 required artifacts 存在；
- canonical output 的 schema、内容和 partition/date 语义正确；
- duplicate 不重复计数，乱序事件按 task policy 处理；
- bad record 进入 quarantine，valid rows 不被误杀；
- checkpoint 单调推进，并能支持 process restart；
- Batch 2 replay 后输出 digest 不变；
- lineage 至少包含两个 input batches 到 canonical output 的 dataset edges，以及 source fields 到 amount aggregate 的 field-level derivation；
- source inputs 未被修改，workspace 外无副作用；
- finality 是“bounded inputs closed + process terminal + output stable + checkpoint persisted”，不是仅 `exitCode === 0`；
- private expected artifacts 与 grading plan 对 Harness 不可读。

#### 需要产生的 evidence payload

```text
data-engineering/pipeline-run
data-engineering/dataset-snapshot
data-engineering/checkpoint
data-engineering/data-quality
data-engineering/lineage
```

它们共用 Core `EvidenceEnvelope`，但 payload 由 data-engineering extension 注册。Fixture 通过即证明 Core 没有要求 `scopeId`、SQL rows、`expected.sql`、semantic root、warehouse provider 或 K11 filename；也证明 Environment 能承载多阶段 state、restart、finality 与 cleanup。

#### 为什么这是最小 fixture

它只需要 Python 标准库和本地文件，数秒内可完成，不建设完整 Airflow/Flink/dbt 平台；同时覆盖单轮 NL2SQL fixture 无法触及的五个关键面：repository artifact、schema evolution、state/checkpoint、data-quality side output 和 lineage。真实 engine adapter 留给后续 integration/e2e。

## 六、G10/T9 可直接采用的约束

1. Evaluation 定位为 Data-domain Core；data analysis 是首个 production vertical，data engineering 以本研究定义 extension seam。
2. K11/RBI 只作为 legacy migration/parity material，不出现在通用示例、类型或默认配置中。
3. Core evidence 采用稳定 envelope + extension payload registration；通用层不封闭枚举 SQL/pipeline/model evidence。
4. Environment interface 必须支持 attempt-scoped provision、multi-stage observation、explicit finality、reset 和 cleanup，不能只暴露 `execute(sql)`。
5. Artifact reference、dataset/environment snapshot、checkpoint 和 grading plan 都进入 run identity；artifact payload 不内联进通用 result。
6. Public task 与 private verifier material 继续使用 opaque reference 和真实访问隔离。
7. Benchmark Pack 必须携带 validation status、oracle evidence、mutation/invariance evidence；adapter migration 必须有 matched parity。
8. Execution facts、quality/lineage checks、benchmark verdict 和 aggregation 四层分开；grader 不回写环境事实。
9. Batch 与 stream finality 由 data-engineering extension 的 discriminated policy 定义；Core 只记录解析结果和证明。
10. 首版加入 `incremental-file-pipeline` conformance fixture，但不因此预先实现完整 data-engineering benchmark。

## 七、明确的资料空白

1. **没有统一 benchmark 覆盖全部目标。** DAComp、DataClawEval 与 ELT-Bench 覆盖 repository pipeline、异构引擎和批流执行，但公开资料没有形成同时覆盖 schema migration、lineage correctness、data-quality policy、failure recovery 和 rollback 的统一 suite。
2. **Schema migration agent evaluation 仍缺少成熟公开 oracle。** Iceberg、Delta 与 pgroll 给出了系统语义，但不是 agent benchmark；如何跨数据库验证 zero-downtime compatibility、backfill 与 rollback，仍需 DSH 自己定义并通过真实 adapter 验证。
3. **Streaming finality 没有跨 engine 的统一定义。** Beam/Flink 提供 watermark/checkpoint 语义，DataClawEval 使用 case-specific grader；尚无足够证据支持一个 engine-agnostic 的单一 finality formula。
4. **Lineage standard 不等于 lineage oracle。** OpenLineage 定义交换格式，但没有规定特定业务变换的 expected lineage completeness 或 correctness。
5. **Data-quality check 本身可能错误。** Deequ/dbt/OpenLineage 能表达 metrics/assertions；ELT-Bench-Verified 证明 evaluation specification 和 ground truth 仍需独立审计。
6. **Architecture grading 尚未解决。** DAComp `DE-Arch` 使用 LLM evaluator，而 DataClawEval 展示 judge 对执行与 streaming 语义的系统性误判；开放式 blueprint 的可靠 grader 仍是研究空白。
7. **Process score 的外部效度不足。** Exploration、efficiency 和 self-verification 有实践价值，但目前没有统一证据证明某套固定权重可跨 task/engine 比较，因此它们应保持 benchmark-specific grade components。
8. **跨 engine 性能分数不可直接合并。** 不同 runtime、资源、启动时间和 billing model 使 latency/cost 需要明确 estimand 与 matched environment；本轮未找到可直接采用的通用归一化标准。
9. **当前公开 benchmark 仍可能持续修订。** 本文固定了仓库 commit；未来 case、grader 或 ground truth 更新必须视为新的 benchmark identity，不得静默覆盖历史结果。

## 八、Primary sources

- [S1] DAComp paper: [*DAComp: Benchmarking Data Agents across the Full Data Intelligence Lifecycle*](https://arxiv.org/abs/2512.04324).
- [S2] DAComp official repository, snapshot `027ccaf20f0d3743d9291fd575d9bc785a5fe3db`: [repository](https://github.com/ByteDance-Seed/DAComp/tree/027ccaf20f0d3743d9291fd575d9bc785a5fe3db), [DE evaluator README](https://github.com/ByteDance-Seed/DAComp/blob/027ccaf20f0d3743d9291fd575d9bc785a5fe3db/dacomp-de/evaluation_suite/README.md), [DE architecture evaluator README](https://github.com/ByteDance-Seed/DAComp/blob/027ccaf20f0d3743d9291fd575d9bc785a5fe3db/dacomp-de/evaluation_suite_arch/README.md).
- [S3] DataClawEval paper: [*DataClawEval: A Benchmark for Data Engineering Agents in Real Industrial Harness*](https://arxiv.org/abs/2607.28033).
- [S4] DataClawEval official repository, snapshot `725e3a268357705c422d249ed21f2147ff9f791a`: [repository](https://github.com/Dicemy/DataClawEval/tree/725e3a268357705c422d249ed21f2147ff9f791a).
- [S5] ELT-Bench paper: [*ELT-Bench: An End-to-End Benchmark for Evaluating AI Agents on ELT Pipelines*](https://arxiv.org/abs/2504.04808).
- [S6] ELT-Bench official repository, snapshot `fcf3129df49ce5ce63ff46b2bbbbba1eaf9ec055`: [repository](https://github.com/uiuc-kang-lab/ELT-Bench/tree/fcf3129df49ce5ce63ff46b2bbbbba1eaf9ec055), [stage-1 evaluator](https://github.com/uiuc-kang-lab/ELT-Bench/blob/fcf3129df49ce5ce63ff46b2bbbbba1eaf9ec055/evaluation/eva_stage1.py), [stage-2 evaluator](https://github.com/uiuc-kang-lab/ELT-Bench/blob/fcf3129df49ce5ce63ff46b2bbbbba1eaf9ec055/evaluation/eva_stage2.py).
- [S7] ELT-Bench-Verified paper: [*ELT-Bench-Verified: Benchmark Quality Issues Underestimate AI Agent Capabilities*](https://arxiv.org/abs/2603.29399).
- [S8] DBA-Bench paper: [*DBA-Bench: A Scalable Benchmark for Evaluating Database Administration Agents*](https://arxiv.org/abs/2505.14436).
- [S9] DBA-Bench official repository, snapshot `73cb3297fae0823c4bf8c3451513f7dbd3961f4b`: [TsinghuaDatabaseGroup/DB-GPT](https://github.com/TsinghuaDatabaseGroup/DB-GPT/tree/73cb3297fae0823c4bf8c3451513f7dbd3961f4b).
- [S10] DataFlow-Harness paper: [*DataFlow-Harness: An Interactive Dataflow Representation for Agentic Data Engineering*](https://arxiv.org/abs/2607.16617); official implementation snapshot `2e95d40ad504a6b4ba9e71d335ad85e3b12a92b6`: [OpenDCAI/DataFlow-WebUI](https://github.com/OpenDCAI/DataFlow-WebUI/tree/2e95d40ad504a6b4ba9e71d335ad85e3b12a92b6).
- [S11] Apache Airflow official docs: [DAG Runs](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dag-run.html).
- [S12] Apache Beam official docs: [Beam model basics](https://beam.apache.org/documentation/basics/) and [Programming Guide](https://beam.apache.org/documentation/programming-guide/).
- [S13] Apache Flink official docs: [Stateful Stream Processing](https://nightlies.apache.org/flink/flink-docs-stable/docs/concepts/stateful-stream-processing/) and [Checkpointing](https://nightlies.apache.org/flink/flink-docs-stable/docs/ops/state/checkpointing/).
- [S14] Apache Flink official docs: [Savepoints](https://nightlies.apache.org/flink/flink-docs-stable/docs/ops/state/savepoints/).
- [S15] Apache Iceberg official specification: [Table specification](https://iceberg.apache.org/spec/); repository snapshot `9d7b2c52fb62de40ff8bc7f15f8923bd62201c21`: [apache/iceberg](https://github.com/apache/iceberg/tree/9d7b2c52fb62de40ff8bc7f15f8923bd62201c21).
- [S16] Delta Lake official protocol, snapshot `4c1dbe94aa280591a11ebee9cd7d7c910923f201`: [PROTOCOL.md](https://github.com/delta-io/delta/blob/4c1dbe94aa280591a11ebee9cd7d7c910923f201/PROTOCOL.md).
- [S17] pgroll official repository, snapshot `777a5350e09012b29d26b9611122046d8a96fc1c`: [xataio/pgroll](https://github.com/xataio/pgroll/tree/777a5350e09012b29d26b9611122046d8a96fc1c); [How pgroll works](https://pgroll.com/docs/latest/how-it-works/).
- [S18] Amazon Deequ: [*Automating large-scale data quality verification*](https://www.amazon.science/publications/automating-large-scale-data-quality-verification) and repository snapshot `e56f3af7c195c2c1b83e9311a80b80c482663bd2`: [awslabs/deequ](https://github.com/awslabs/deequ/tree/e56f3af7c195c2c1b83e9311a80b80c482663bd2).
- [S19] dbt official docs: [Data tests](https://docs.getdbt.com/docs/build/data-tests).
- [S20] OpenLineage 1.53 official specification: [Object Model](https://openlineage.io/docs/spec/object-model/), [Facets & Extensibility](https://openlineage.io/docs/spec/facets/), [Column Level Lineage Dataset Facet](https://openlineage.io/docs/spec/facets/dataset-facets/column_lineage_facet/), [Data Quality Assertions Facet](https://openlineage.io/docs/spec/facets/dataset-facets/data_quality_assertions/), and repository snapshot `9ac19298c8ef518ed10c7a3af547c8ac86c2e012`: [OpenLineage/OpenLineage](https://github.com/OpenLineage/OpenLineage/tree/9ac19298c8ef518ed10c7a3af547c8ac86c2e012).
- [S21] Harbor official docs and repository: [Task structure](https://harborframework.com/docs/tasks/), [Adapter guide](https://harborframework.com/docs/adapters/), repository snapshot `191d1b989bbba1d77c2db23e17aec308d7c08046`: [harbor-framework/harbor](https://github.com/harbor-framework/harbor/tree/191d1b989bbba1d77c2db23e17aec308d7c08046).

[S1]: https://arxiv.org/abs/2512.04324
[S2]: https://github.com/ByteDance-Seed/DAComp/tree/027ccaf20f0d3743d9291fd575d9bc785a5fe3db
[S3]: https://arxiv.org/abs/2607.28033
[S4]: https://github.com/Dicemy/DataClawEval/tree/725e3a268357705c422d249ed21f2147ff9f791a
[S5]: https://arxiv.org/abs/2504.04808
[S6]: https://github.com/uiuc-kang-lab/ELT-Bench/tree/fcf3129df49ce5ce63ff46b2bbbbba1eaf9ec055
[S7]: https://arxiv.org/abs/2603.29399
[S8]: https://arxiv.org/abs/2505.14436
[S9]: https://github.com/TsinghuaDatabaseGroup/DB-GPT/tree/73cb3297fae0823c4bf8c3451513f7dbd3961f4b
[S10]: https://arxiv.org/abs/2607.16617
[S11]: https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dag-run.html
[S12]: https://beam.apache.org/documentation/basics/
[S13]: https://nightlies.apache.org/flink/flink-docs-stable/docs/concepts/stateful-stream-processing/
[S14]: https://nightlies.apache.org/flink/flink-docs-stable/docs/ops/state/savepoints/
[S15]: https://iceberg.apache.org/spec/
[S16]: https://github.com/delta-io/delta/blob/4c1dbe94aa280591a11ebee9cd7d7c910923f201/PROTOCOL.md
[S17]: https://github.com/xataio/pgroll/tree/777a5350e09012b29d26b9611122046d8a96fc1c
[S18]: https://www.amazon.science/publications/automating-large-scale-data-quality-verification
[S19]: https://docs.getdbt.com/docs/build/data-tests
[S20]: https://openlineage.io/docs/spec/object-model/
[S21]: https://harborframework.com/docs/tasks/
