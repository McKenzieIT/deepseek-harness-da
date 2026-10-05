# R9 — Multi-engine execution failure taxonomy 一手认读

**Type**: research  ·  **Status**: **resolved**（2026-10-06）
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: 无
**Blocks**: [G9 — Failure normalization 与 attribution](G9-failure-classifier.md)
**Mode**: AFK
**Branch**: `research/R9-error-taxonomy-papers`

## Question

跨 MaxCompute、PostgreSQL、Snowflake、BigQuery 与本地 execution environments 时，哪些 failure facts 能由 Provider 权威分类，哪些只能由 execution adapter、Harness 或 Benchmark grader 判断；已有一手论文、官方 driver/protocol 和 benchmark 如何区分 syntax、semantic、resource、timeout、transport、permission、cancellation、pending/unresolved 与 benchmark defect？

## Research requirements

- Primary sources only: official protocols/drivers/repos and verified papers.
- Separate provider facts、normalized execution facts、model attribution、Environment blockage and Benchmark defect.
- Audit DSH `QueryOutcome.failureKind`、NL2SQL `FailureKind`、eval `FailureClass` and current string classifiers without treating any as target authority.
- Identify stable cross-engine discriminants versus provider-specific extension payloads.
- Produce `../research/error-taxonomy-papers.md` with source facts、DSH implications and gaps.

---

## Answer（resolved 2026-10-06）

**产物**：[`../research/error-taxonomy-papers.md`](../research/error-taxonomy-papers.md)（8 节，核心是 §5 的 13×4 归属矩阵）。**71 条引文，由本 session orchestrator 以独立脚本机械回核 71/71 通过**，并额外独立复验了下面第 3 条的整条代码链与第 5 条的全称否定命题。

### 1. 发现一个比票面四篇都更对口的一手来源（已补 identity 闸）

SQL-of-Thought 的错误分类是**二手的**——原文自述 derived from Shen et al.，指向 **`2501.09310`**。本票取回全文并经 orchestrator 批量 arXiv 查询验真：

> `2501.09310`v3（2025-01-16 → 2026-06-15）·*Understanding, Detecting, and Repairing Real-World In-Context-Learning-Based Text-to-SQL Errors* · Jiawei Shen, Chengcheng Wan, Ruoyi Qiao, Jiazhen Zou, Hang Xu · **Accepted by FSE 2026**

其 §3.2.6 是 **`Not an Error`**，内含 **`F1: Gold Error. The benchmark provides an incorrect ground-truth (gold query).`**，并明写该类「is only caused by benchmark quality, regardless of the actual correctness of the generated query」。

⇒ **这是 T1 五分结局里 `case-defect` 的同行评议先例**，本仓此前只有自建论证。它同时给出 syntax/semantic 的可操作边界（AST 解析 vs schema 解析）。**建议 map 把它列入方向 9 的论文行。**

### 2. SAL（`2607.22572`）对多引擎工作无用——该文自己说的

§12 Limitation 3 逐字：「**Single RDBMS. The system is tested exclusively on Oracle ADB.** The validator, error handling, and introspection are Oracle-specific.」其分类是 4 类**模型幻觉** H1–H4（H4 = 「The query executes but the result set is semantically incorrect.」），**四类全部落在 T1 的 `fail` 内部**，与「执行失败归属」不是同一个对象。

⇒ **map 方向 9 论文行把它当通用来源是错的**，须加限定。更一般的教训：**本批四篇里有三篇的分类对象是「模型错误」而非「执行失败」**，map 此前混为一谈。

### 3. 本票最重要的发现：当前判分在非 MaxCompute 引擎上系统性地替模型免责

链路（**由 orchestrator 独立复核，非转述**）：

1. `packages/eval/eval/src/classify_failure.ts:63` —— `return 'infrastructure'` 是**兜底分支**（repo 自己的测试确认 `classifyExecutionFailure(null/undefined/'')` 全部 → `'infrastructure'`）；
2. 同文件 `:30` —— `ENVIRONMENTAL_FAILURE_CLASSES` **包含** `'infrastructure'`；
3. `packages/eval/eval/src/execution_grade.ts:325` —— `const blocked = failureClass === null || ENVIRONMENTAL_FAILURE_CLASSES.has(failureClass)` → `outcome: blocked ? 'environment-blocked' : 'fail'`。

而识别靠的是**英文/中文子串匹配**，needle 集在 MaxCompute 上调出来的。⇒ **任何没被 needle 命中的报错文本 → `infrastructure` → `environment-blocked` → 离开模型分母。**

对真实构建跑的运行时探针：**13 个真实多引擎报错里 11 个落 `environment-blocked`**，包括**幻觉表名**（MaxCompute 与 PostgreSQL 双双如此）、错列名、Snowflake `000904 invalid identifier`、除零。只有 PG `42601` 与 BigQuery 字面量 `Syntax error:` 能到 `fail`，**纯粹因为它们含那个英文子串**。

> **这不是「判对了」，是「碰巧判对了」。** 换引擎、换语言、或供应商改一次文案，归属就翻面，而方向在系统性地对模型有利——这正是 `environment-blocked` 不进分母的那一侧。**[G9](G9-failure-classifier.md) 的第一决策因此是「未识别文本的默认方向」，而非分类器接口形状。**

### 4. 词表是 6 套不是 3 套；map 的行号零漂移；但「无 adapter」已过期

- 票面预期行号因 T1 而失效——**实测零漂移**，map 记的五个指针全部命中。
- 真正的漂移在别处：T1 新增 `InfraFailureKind` 与 `ExecutionOutcome`，且**没有动既有三套** ⇒ 现为 **6 套**。
- map 的「三套互不重叠且无 adapter 在其间翻译」**已过期**：事实上的翻译已存在，是 `eval-runner/src/runner.ts:418` 的**私有字符串白名单**（`:709` 处重复一份）。但它是**并集而非映射**，所以**结构上无法表达「未知」**——这正是第 3 条 fail-open 的成因。
- **`ExecutionPort` 根本没有词表**：`failureKind` 在两侧都是开放 `string`（注释称 typed，类型是 `string`）。6 套里**没有一套跨过 port**。
- **`mapQueryOutcome` 仍是死码**：orchestrator 独立复核确认 **0 个生产调用点**（全部命中为测试、`.d.ts`、文档注释、导出 barrel），repo 自述「remains only in the legacy runtime pending T12 removal」。**[G1](G1-exec-grader-seam.md) 的发现经 T1 后仍然成立。**

### 5. 厂商侧：可跨引擎稳定的区分比预期少得多

- **SQLSTATE class 不是归属边界**：`Class 42 — Syntax Error or Access Rule Violation` 把 syntax、undefined-table、insufficient-privilege 装进同一个 class。PG 的稳定性措辞只是比较级（「less likely to change」），**非契约**；但它明说**该测 code 不是 text**——本仓做的恰好相反。
- **cancellation 不是跨引擎稳定区分**：PG 只有 `57014 query_canceled` 兼表超时与用户取消，协议层「the frontend has no direct way to tell whether a cancel request has succeeded」；MaxCompute 有独立 code；BigQuery 以 `stopped` 在 **HTTP 200** 上报。⇒ canonical `cancelled` 成员在 PG 上**填不出来**。
- **BigQuery 明确拒绝闭合**：reason 表「does not include all possible HTTP errors」，且取值随 client library 变 ⇒ **unknown 处理是强制项**。它还厂商确认了 pending-unresolved 格：`jobs.insert` 5xx 时「unclear if the job succeeded」。
- **MaxCompute 有一个被本仓丢掉的可解析模块位**：`ODPS-01CCCCX`，**67/67 code 合规、0 违例**；但 module ≠ fault（`Authorization exception` 横跨 3 code/3 module/2 severity；`ODPS-0130071` 覆盖 17 种触发条件，跨模型错与项目策略错）。
- **Snowflake 最弱**：仅 2 个内建 exception，SQLSTATE 只「modeled on」标准，且**canonical error-code 页面是真 404**。

### 6. 与 T1 五分结局的衔接

T1 的 2 次 event 查询超时**路径正确**（`pending` → `patience` 直通，绕过文本匹配），但**磁盘标签撒谎**：harness 截止期杀掉查询会合成**同一个** `failureKind:'timeout'`，所以「数仓还在跑」与「我们不等了」持久化后不可分——这丢掉了 T1 特意保留 `attach?` 所要支持的恢复路径。另两处标签错（缺 provider → `permission_denied`；`odps-0010000` → `timeout`，实为系统/配额错）**桶对、理由错**。

### 解锁

**[G9 — Failure normalization 与 attribution](G9-failure-classifier.md)**：产物 §5 给出 13 行（syntax/semantic/resource/timeout/transport/permission/cancellation/pending-unresolved/benchmark-defect 等）× 4 列（Provider / execution adapter / Harness / Benchmark grader）的归属矩阵，**7 个格标为当前无任何层可裁**（A–G，各自指派 owner）；§6 把 G9 的决策拆为 **10 条文献/厂商已裁定** vs **7 条本仓自主选择**（D-1…D-7）。`FailureClassifier` 形状作为**设计推论**给出，承重的四项为：`observedBy`（分开 harness 与 provider 的超时）、`basis`（让「按 code 判」与「按文本猜」可审计）、**强制的 `unclassified` 成员**（今天的静默 fail-open 就是 11/13 的成因）、以及**必填 `engineId`**。G9 之后接 [T8](T8-failure-classifier-impl.md)。

### 本票未回答 / 取证失败

Snowflake canonical error-code 页与另 2 个 URL 为**真 404**；票面给的两个 MaxCompute URL 为 **soft-404**（HTTP 200 / 404 正文），实际页面在 `/zh/maxcompute/user-guide/sql-errors` 且**需浏览器 User-Agent**（WebFetch 403、curl+UA 200）⇒ **MaxCompute error code 仅有中文文档**，T8 里任何 code 表都将溯源至中文页。另开：Shen 的 `Not an Error` 精确占比（`pdftotext` 压扁多栏表，仅得量级）、`ODPS-0010000` 官方语义、MaxCompute severity 定义、Snowflake 资源/配额 code、本地 SQLite/DuckDB 行（无论文覆盖且本仓无本地 executor）。完整 URL+status 日志在 `.tmp/r9/access-log.txt`。
