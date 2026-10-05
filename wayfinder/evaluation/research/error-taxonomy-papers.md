# R9 — 多引擎执行失败分类法：一手认读

日期：2026-10-06 · 票：[R9-error-taxonomy-papers](../tickets/R9-error-taxonomy-papers.md) · 分支：`research/R9-error-taxonomy-papers`
下游：[G9 — Failure normalization 与 attribution](../tickets/G9-failure-classifier.md)

**引用约定**（house style 同 [exec-grader-papers-v3](exec-grader-papers-v3.md)）：**来源事实**逐条带 `【Cn】`，对应 `.tmp/r9/citations.jsonl` 的机器可校验清单（71 行，`quote` 均为所指行的 verbatim 子串，已用 `.tmp/r9/build_manifest.py` 全量复验通过）。**设计推论**单独标注，不冒充来源结论。取不到的一律写「待核 / 取证失败」。

> **本轮最该先读的三条**
>
> 1. **SAL（2607.22572）对多引擎工作无用，且是论文自己说的**：§12 限制 3 原文「Single RDBMS. The system is tested exclusively on Oracle ADB.」【C1】「The validator, error handling, and introspection are Oracle-specific.」【C2】。map 把它当通用来源是错的。
> 2. **map 记的「三套词表」已过时**：实际是 **6 套**；而且 T1 之后**已经有一份事实上的翻译表**，只是以私有字符串白名单的形式藏在 `eval-runner/src/runner.ts:418`【C55】。map「无 adapter 在其间翻译」这句需要改。
> 3. **当前归因口径在非 MaxCompute 引擎上会系统性放过模型**：实测 13 条真实多引擎报错里 **11 条**被判 `environment-blocked`（移出模型分母），含「模型臆造表名」「Snowflake invalid identifier」「除零」。见 [§4.4](#44-实测当前分类器在多引擎文本上的行为). 这不是推测，是跑出来的。

---

## 1. 身份核验与证据等级

### 1.1 orchestrator 已核验的四篇（权威，不再自行推导）

| arXiv | ver / dates | 标题（已核验） | 作者 | 证据等级 |
|---|---|---|---|---|
| 2607.22572 | v1, 2026-06-03 | Schema-Aware Localisation (SAL): Live Schema Grounding and Hallucination Validation for **Oracle** NL2SQL | Sanjay Mishra, Divya Chukkapalli, Ganesh R. Naik | **无 venue**（preprint）。⚠ Oracle 专用 |
| 2509.00581 | v2, 2025-08-30 → 2025-09-28 | SQL-of-Thought: Multi-agentic Text-to-SQL with Guided Error Correction | Saumya Chaturvedi, Aman Chadha, Laurent Bindschaedler | NeurIPS 2025 **DL4C workshop**（workshop，非主会） |
| 2606.31041 | v1, 2026-06-30 | A Semantic-Layer-Mediated Agent for Natural Language to SQL over Heterogeneous Enterprise Databases | Ha Jeong Kim, Saksonita Khoeurn, Ye Ji Yoon | ⚠ 「Submitted to FITAT 2026 for peer review」= **未经同行评审**，本批最低 |
| 2408.05109 | v7, 2024-08-09 → 2026-08-25 | A Survey of Text-to-SQL in the Era of LLMs: Where are we, and where are we going? | Xinyu Liu, Shuyu Shen, Boyan Li, Peixian Ma +6 | **TKDE 2025-07**（期刊）。但 survey 属二手 |

### 1.2 本轮追加的一篇（R9 的真正一手来源）

追 SQL-of-Thought 的引用链时发现：**它的分类法不是它自己的**。SQL-of-Thought §3.2 原文「…is derived from the classifica-/tion proposed in Shen et al. [15], which systematically categorizes standard failure modes encountered」【C9】，参考文献 [15] 指向「2025. URL https://arxiv.org/abs/2501.09310.」【C10】。

于是取回 **arXiv:2501.09310**（Shen et al.），其 PDF 页眉自述 venue：「Proc. ACM Softw. Eng. 3, FSE, Article FSE164 (July 2026)」【C14】——**FSE 2026，同行评审会议论文**，证据等级高于本批除 TKDE survey 外的全部三篇，且它才是执行失败分类法在本 effort 里的一手出处。

> ⚠ **身份边界声明**：2501.09310 **不在 orchestrator 的已核验表内**，本文未查 arXiv metadata API（按票面禁令）。其 venue 字串取自 PDF 正文页眉【C14】，可自证；但**作者/日期未经权威元数据核验**，标记为 **「身份待核」**。引用它的结论若要进 G9 裁定，须先补一次身份核验。

### 1.3 证据等级阶梯（本文一律按此加权）

```
期刊/主会同行评审  >  workshop  >  未评审 preprint  >  厂商官方文档  >  本仓代码
2408.05109 (TKDE)     2509.00581   2607.22572          PG / BQ / SF / MaxC   packages/**
2501.09310 (FSE)                   2606.31041
```

**但有一处必须倒置**：问「跨引擎的失败事实如何分类」时，**厂商文档是比论文更强的来源**。原因见 §3.4——四篇论文里没有一篇在分类执行环境失败；它们分类的是**模型写错 SQL 的方式**。这两个是不同的对象。

### 1.4 实际读了什么

- 5 份 PDF 全文（`pdftotext -layout`，留在 `.tmp/r9/*.txt`）：2607.22572(1984行)、2509.00581(769)、2606.31041(307)、2408.05109(1754)、2501.09310(1471)。
- 官方文档 6 份（HTML→text，留在 `.tmp/r9/`）：PostgreSQL SQLSTATE 附录 / ErrorResponse 字段 / 协议流程；BigQuery error-messages；Snowflake Scripting exceptions；MaxCompute SQL 错误码。逐条 HTTP 状态见 `.tmp/r9/access-log.txt` 与 [§8.2](#82-取证失败)。
- 本仓：以 `mcp__local__grep` 重新推导全部失败词表（§4），并用**真实构建产物跑了一次运行时探针**（§4.4，脚本 `.tmp/r9/probe.mjs`，输出 `.tmp/r9/classify-probe-output.txt`）。

---

## 2. 来源事实：标准化错误分类

### 2.1 SQLSTATE 是唯一真正标准化的参照系

PostgreSQL 错误码附录原文：

> 「According to the standard, the first two characters of an error code denote a class of errors, while the last three characters indicate a specific condition within that class.」【C24】

稳定性语言（这是本节最该引的一句）：

> 「The error codes are less likely to change across PostgreSQL releases, and also are not subject to change due to localization of error messages.」【C23】
> 「…should usually test the error code, rather than looking at the textual error message」【C22】

**注意措辞强度**：是 *less likely to change*，**不是** *stable* / *contractual*。PostgreSQL 并未承诺错误码不变——它承诺的是「比错误文本更不易变，且不随本地化变」。这是本批所有引擎里**最强**的稳定性表述，而它仍然只是比较级。

线协议层，`ErrorResponse` 的 `C` 字段：

> 「Code: the SQLSTATE code for the error」【C28】，「Not localizable. Always present.」【C29】

**→ 契约等级**：SQLSTATE 在 PostgreSQL 上是 *always present + not localizable*，这是全部四个引擎中唯一达到「字段必在且不随语言漂移」的信号。

### 2.2 但 SQLSTATE 的 class 不是归因边界

**这条推翻了「拿 class 当 failure class 用」的直觉。**

- `Class 42 — Syntax Error or Access Rule Violation`【C25】——**一个 class 里同时装着语法错和权限错**。`42601 syntax_error`、`42P01 undefined_table`、`42501 insufficient_privilege` 同属 42。所以「前两位定 class」给出的是 *SQL 编译期诊断归属*，**不是** *谁的错*：模型写错语法、模型臆造表名、库没给权限，三件归因完全不同的事共享 class 42。
- `Class 57 — Operator Intervention`【C27】下只有一个 `query_canceled`【C26】。附录里**没有**独立的 statement-timeout 码——`statement_timeout` 到期与 `pg_cancel_backend()` 都报 57014。

**→ 于是 cancellation 与 timeout 在 PostgreSQL 上不可由错误码区分**，只能看报文文本（`canceling statement due to statement timeout` vs `… due to user request`）——而这恰好是 PG 自己叫你别依赖的东西【C22】。

线协议层更糟：

> 「the frontend has no direct way to tell whether a cancel request has succeeded」【C30】
> 「If the cancellation is effective, it results in the current command being terminated early with an error message.」【C31】

**→ 结论（来源事实）**：取消在 PostgreSQL 协议上**不可观测为独立事实**。客户端只能看到一个「提前以错误结束」的查询，且无法确认自己的取消是否生效。cancellation 不是一个 provider 能权威回答的问题。

### 2.3 MaxCompute：有结构化码制，而且比本仓现在用的强得多

官方 SQL 错误码页（`help.aliyun.com/zh/maxcompute/user-guide/sql-errors`）原文：

> 「ODPS-01CCCCX:通用描述 - 上下文相关说明」【C37】
> 「SQL 错误包含 META（CCCC 段为 1000~1999）、PROCESSOR（CCCC 段为 2000~2999）、PARSER（CCCC 段为 3000~3999）和 PLANNER（CCCC 段为 4000~4999）模块错误」【C38】

**本轮机械验证**：从该页解析出 67 条带「模块 + 严重等级」的错误码，逐条按 `ODPS-01CCCCX` 取 `CCCC` 段比对声明区间——**67/67 全部落在声明的模块区间内，0 例违例**（脚本见 §4 末尾说明）。分布：PARSER 26、PROCESSOR 25、PLANNER 13、META 3；严重等级取值 {1:48, 5:14, 3:2, 2:1, 8:1, 9:1}。

**→ MaxCompute 的数字区间是可机械解析的模块分类器**，等价于 SQLSTATE 的 class 位。本仓现在完全没用它（§4.3）。

两条额外事实，直接回答票面问题：

- **MaxCompute 区分 cancellation**：「ODPS-0120031:Instance has been cancelled 模块：PROCESSOR。 严重等级：1。」【C39】，另有 `ODPS-0123105:Job got killed`（严重等级 5）。**比 PostgreSQL 强** —— PG 把取消和超时压成 57014，MaxCompute 给了独立码。
- **厂商唯一明说「重试」的地方**：「ODPS-0140178: Internal system failure 模块：PLANNER。 严重等级：8。 触发条件：系统异常。 处理方法：重试。」【C40】 —— 全页仅此一条 `处理方法：重试`。**→ 严重等级 8 是 MaxCompute 事实上的 retryable 信号**，其余均为「改 SQL / 改参数 / 联系 owner」。

但**模块 ≠ 故障归属**，两处硬证据：

1. 同一语义条件横跨三个模块、两种严重等级：`ODPS-0110011`(META,sev1) / `ODPS-0120011`(PROCESSOR,sev1) / `ODPS-0130013`(PARSER,**sev3**) 全部叫 `Authorization exception`【C41】。
2. **一个码对应 17 种触发条件**：`ODPS-0130071`（Semantic analysis exception）在该页出现 17 次，涵盖的触发条件从「列名错误，没有找到对应的列」「Partition not found」（模型的错）一路到「表所属项目禁止了分区表全表扫描，需要指定分区条件」「单个作业中的 instance 超过最高限制」（**项目策略 / 资源配额，不是模型的错**）。

**→ 对 G9 的硬约束**：MaxCompute 上**单靠错误码无法归因**。`ODPS-0130071` 同时覆盖 model-fault 与 policy/resource-fault，必须再读上下文说明段才能分开。`ODPS-0130131:Table not found`（PARSER, sev1）【C42】则是干净的单义码。

### 2.4 BigQuery：有机读字段，但明确拒绝给穷尽性与稳定性

机读分类器是 `ErrorProto.reason`：

> 「The Error message column in the following table maps to the reason property」【C36】

本轮从该页提取到 21 个 `reason` 值：`accessDenied, backendError, billingNotEnabled, billingTierLimitExceeded, blocked, duplicate, internalError, invalid, invalidQuery, jobBackendError, jobInternalError, jobRateLimitExceeded, notFound, notImplemented, quotaExceeded, rateLimitExceeded, resourceInUse, resourcesExceeded, responseTooLarge, stopped, tableUnavailable, timeout`。

但厂商自己下了两道免责：

> 「The table does not include all possible HTTP errors or other networking errors.」【C32】
> 「…you might receive different errors or」（接下文 error objects if you use the Cloud Client Libraries）【C33】

**→ 契约等级**：BigQuery 的 `reason` 集合**不是封闭集**，而且**换客户端库就可能换值**。这比 SQLSTATE 弱一个量级：不能对 `reason` 做穷尽 switch，必须有 unknown 兜底。

两条对 R9 特别重要的：

- **cancellation 独立且不是错误**：`stopped` 的 HTTP code 是 **200**，描述为「This status code returns when a job is canceled.」【C34】。`timeout`（HTTP 400，「The job timed out.」）是另一个值。**→ BigQuery 是四家里唯一把「取消」建模为非错误终态的**。
- **pending/unresolved 的厂商级承认**：`jobs.insert` 收到 5xx 时「unclear if the job succeeded」【C35】。**→「不知道跑没跑成」是厂商承认的合法状态**，不是本仓的实现缺陷。这给了 T1 `environment-blocked` 覆盖「非终态 pending」一个外部支撑点。

### 2.5 Snowflake：四家里最弱

- **没有 canonical error-code 列表页**：`https://docs.snowflake.com/en/sql-reference/error-codes` 实测 **HTTP 404**（另两个候选 URL 同样 404，见 §8.2）。
- 命名异常词表只有**两个成员**：「following built-in exceptions:」【C67】 → 「STATEMENT_ERROR: This exception indicates an error while executing a statement.」【C68】、「EXPRESSION_ERROR: This exception indicates an error related to an expression.」【C69】。
- 暴露了 SQLSTATE，但措辞是**对标而非遵循**：「SQLSTATE: This is a 5-character code modeled on the ANSI SQL standard SQLSTATE .」【C70】；另有 `SQLCODE`「This is a 5-digit signed integer.」【C71】。

**→ 契约等级**：*modeled on* 比 PostgreSQL 的 *follow the SQL standard's conventions* 更弱。Snowflake 的 `SQLSTATE` 可读但不可假定与 PG 同义；其自有 `SQLCODE`（如 `000904` invalid identifier）才是实际判别位，而该码表无官方索引页。

### 2.6 跨引擎稳定判别式 vs provider 专有载荷

**跨引擎稳定（四家都能给，可进 canonical core）**

| 判别式 | 各引擎的权威信号 | 稳定性 |
|---|---|---|
| **终态三分**（完成 / 未完成 / 失败） | PG: ErrorResponse 有无；MaxC: `state`；BQ: job state；SF: 异常有无 | 强。四家一致 |
| **compile-time vs run-time** | PG: class 42/22 之分；MaxC: 模块 PARSER/PLANNER vs PROCESSOR【C38】；BQ: `invalidQuery` vs `resourcesExceeded`；SF: `EXPRESSION_ERROR` vs `STATEMENT_ERROR`【C68】【C69】 | 中。语义对齐但粒度不同 |
| **权限类** | PG: 42501/28xxx；MaxC: `Authorization exception`（三码）【C41】；BQ: `accessDenied`；SF: SQLSTATE 42501 族 | 中。都有，但 MaxC 一名三码 |
| **资源/配额类** | PG: class 53/54；MaxC: sev 8/9 + `Quota not enough`；BQ: `quotaExceeded`/`resourcesExceeded`；SF: 待核 | 中 |
| **name-resolution（表/列不存在）** | PG: 42P01/42703；MaxC: `ODPS-0130131`【C42】；BQ: `notFound`；SF: `000904` | 中。都有独立表达 |

**provider 专有，必须进 namespaced extension 载荷**

| 事实 | 只有谁有 | 后果 |
|---|---|---|
| **cancellation 可否与 timeout 分开** | MaxC 可（`ODPS-0120031`）【C39】、BQ 可（`stopped`@200）【C34】；**PG 不可**（同 57014）【C26】 | **不能进 canonical core**。核心词表若设独立 `cancelled` 成员，PG 适配器永远填不出来 |
| **retryable** | 仅 MaxC 有逐码「处理方法：重试」【C40】；BQ 只有 5xx 层面的通则；PG/SF 无逐码 retryable 声明 | 不能当 provider 事实消费，须由 adapter 按引擎策略推导 |
| **严重等级** | 仅 MaxCompute（1/2/3/5/8/9）【C40】【C41】 | 纯 extension |
| **instance id / job id** | MaxC instanceId、BQ jobId | 已在 T1 `ExecutionArtifact.instanceId` |
| **「不知道跑没跑成」** | BQ 明说【C35】；其余未明说 | 须建模为一等状态，不可折进 failed |

---

## 3. 来源事实：论文侧的错误分类

### 3.1 SAL（2607.22572）：Oracle 专用，且论文自己承认 error handling 是 Oracle-specific

票面要求「如果不能泛化就直说」。**直说：不能，而且是论文自己说的。**

§12 Limitations 第 3 条原文：

> 「Single RDBMS. The system is tested exclusively on Oracle ADB.」【C1】
> 「The validator, error handling, and introspection are Oracle-specific.」【C2】

**→ 对 map 的修正**：map 把 SAL 当多引擎失败分类的通用来源，是错的。SAL 对 R9 的多引擎问题**没有可迁移的分类法贡献**；它唯一可引的是「错误处理必须贴引擎」这个反面教训本身。

SAL 的分类法是**模型幻觉分类，不是执行失败分类**：

> 「We develop a four-class hallucination taxonomy」【C3】

四类为 H1 Phantom identifier（臆造表/列名）、H2 Column–table mismatch、H3 Dialect confusion、H4 Structural reasoning error。H4 的定义把性质说透了：

> 「The query executes but the result set is semantically incorrect.」【C4】

**→ H1–H4 全部落在 T1 五分结局的 `fail` 内部**。它细分的是「模型怎么错的」，对「这次失败该不该记模型头上」零贡献。

**但 SAL 有一处对 R9 有用，而且是反面先例**：它的 Table 10 确实把结局拆开了——

> 「Semantic fail      FAIL: mismatch          174    34.8」【C6】
> 「Execution fail     FAIL: ORA- error        13     2.6」【C5】

即「结果不匹配」与「执行报 ORA- 错」分列两行。**但两者都计入 FAIL**，SAL **没有** environment-blocked 这一类。

**→ 一手反面先例**：一篇已发表工作把执行期报错全额记在模型账上。这与 T1 第 3 条（gold 执行失败 = 基础设施失败）方向相反。G9 若要维持 `environment-blocked`，须知道它**不是文献共识**，而是本仓场景（远端数仓 + pending + 配额）特有的选择——与 G1 v3 「environment-blocked 在已发表工作里无先例」的判断一致，本轮未找到推翻它的证据。

### 3.2 SQL-of-Thought（2509.00581）：9×31，但全是 logical errors，且是二手

图 2 标题原文：

> 「This taxonomy has 9 categories and 31」【C7】 / 「sub-categories of logical errors to be identified and rectified by LLMs.」【C8】

九个类目（自图 2 认读）：syntax、Schema Link、Join、Filter、Aggregation、Subquery、Set Operations、Value（hardcoded_value / value_format_wrong）、Other Issues。叶子如 `where_missing`、`join_wrong_type`、`agg_no_groupby`、`having_vs_where`、`union_missing`。

**→ 零个执行环境类目**。没有 timeout、没有 permission、没有 transport、没有 cancellation、没有 resource。全部 31 个叶子都是「模型该怎么改这条 SQL」。论文自己把定位说明白了：该分类法用于「move beyond coarse execution-based feedback」——即它是**执行反馈的替代品**，不是执行失败的分类法。

**并且它是二手**：「derived from the classifica-/tion proposed in Shen et al. [15]」【C9】→【C10】。

⚠ **一处数字不一致，留给 G9 注意**：SQL-of-Thought 自述 9 类 31 子类【C7】【C8】，但其声称的来源 Shen et al. 是 **7 类 27 型**【C11】。而 TKDE survey 记载另一项工作「NL2SQL-BUGs … organizing them into 9 main categories and 31 subcategories」——与 SQL-of-Thought 的 9/31 **数字完全吻合**。按本票禁令，`NL2SQL-BUGs` 仅作概念参考、**不作为已核验一手来源引用**，故此处只记录「SQL-of-Thought 的分类法归属存疑（9/31 与其声称来源的 7/27 不符）」，**标记待核**，不下结论。

### 3.3 Shen et al.（2501.09310, FSE 2026）：唯一含 benchmark-defect 的一手分类法 ← 本节最高价值

7 个一级类目（自 §3.2 认读）：Syntax Error、Schema Error、Logic Error、Convention Error、Semantic Error、**Not an Error**、Others。

> 「two-level error taxonomy with 27 types」【C11】

前两类的定义值得逐字引，因为它给了 **syntax vs semantic 的可操作边界**（票面点名的区分）：

> 「Syntax Error. The SQL query could not be parsed into a valid abstract syntax tree (AST), and」（接 thus fail to execute）【C15】
> 「Schema Error. The SQL query is successfully parsed into an AST, but fails in schema resolution」（接 stage and thus cannot execute）【C16】

**→ 一手判别式**：syntax = 进不了 AST；schema = 进了 AST 但名字解析失败。这与 PostgreSQL 把两者同塞进 class 42【C25】形成对照——**论文给的边界比 SQLSTATE class 更细，且可由引擎的 parse/resolve 阶段客观判定**。MaxCompute 的模块位恰好能表达它（PARSER vs PLANNER）【C38】，PG 需要看完整 5 位码（42601 vs 42P01）。

**最关键的一条**：§3.2.6 是 **`Not an Error`**——

> 「Not an Error. The generated SQL query is regarded as incorrect due to the error of benchmark,」（接 ambiguity of NL question, or improper implementation of correctness judgment）【C12】

其三个子型：

> 「F1: Gold Error. The benchmark provides an incorrect ground-truth (gold query).」【C13】

F2 Violation of Foreign Key Integrity（库自身违反外键约束导致结果异常）、F3 Output Ambiguity（NL 问题本身没说清输出格式 / NULL 取舍 / 并列极值怎么办）。

**→ 这是 R9 要的 benchmark-defect 格的一手、同行评审先例**，而且它被**量化**了：该文表格中 `SUM: Not an Error` 各列为 266 / 290 / 288 / 296 …，与另行统计的 `Total number of all errors` 786 / 621 / 765 / 448 … 并列。即**被判错的查询里有相当比例（按首列 266 vs 786，约四分之一量级）其实是语料/判定缺陷，不是模型错**。

> **引用纪律**：上述计数取自 `.tmp/r9/2501.09310.txt` 表格区（第 528–532 行），因 `pdftotext` 展平多列表格，**列与技术/基准的对应关系未能可靠还原**，故只报量级、不报比率，并标 **「比率待核」**。F1/F2/F3 的定性定义【C12】【C13】不受此影响。

**对 T1 `case-defect` 的意义**：T1 的 `case-defect` 覆盖「未知 match_mode、expected 缺失/不自洽、reference SQL 不可执行」。Shen 的 F1/F2/F3 说明还缺两类：**F2 库层约束违反**（本仓分区表/事件表完全可能撞上）与 **F3 问题本身歧义**（并列极值、NULL 取舍）。G9 应考虑扩。

**Shen 的覆盖缺口**：全文检索 `timeout / permission / privilege / transport / network / cancel / resource exceeded / infrastructur`，**在分类法部分零命中**（仅 §5.3.6 提到自身工具的 network transmission 开销）。**→ 即使文献里最好的一手错误分类法，也完全不含执行环境轴。**

### 3.4 TKDE survey（2408.05109）：明说现有分类法不通用；其自身分类法是「模型错误」分类法

> 「Error analysis involves examining model errors to identify」（接 limitations and guide corrective actions）【C19】

**→ survey 自己把对象限定为 model errors。**

survey 的两级分类法：一级 Error Localization（错在哪个 SQL 子句），二级 Cause of Error（为什么错）。仍是模型侧。

survey 对本 effort 最有用的其实是**它给的四条分类法设计原则**（可直接当 G9 的验收面）：Comprehensiveness、**Mutual Exclusivity**、Extensibility、Practicality——

> 「Mutual Exclusivity: Each error type should be clearly」（接 distinct to avoid classification ambiguity）【C18】

以及对现状的判断：

> 「Current error taxonomies in Text-to-SQL are often specific」（接 to particular datasets, limiting their general applicability）【C17】

**→ 一手支撑了 R9 的前提**：没有一个现成分类法可以照抄；G9 必须自己定，而且 survey 给了「互斥性」作为硬标准——本仓现状恰恰违反互斥（§4.5）。

### 3.5 语义层论文（2606.31041）：本批唯一真做多引擎的，但没有失败分类法

> 「execution across SQLite, BigQuery, and Snowflake backends,」【C20】

**→ 本批唯一真正跨多个真实引擎执行的工作**（尽管证据等级最低——未经同行评审）。其 §VI 执行与评测 harness 有一条设计上可借的：

> 「timeouts, retry limits, credentials) is centralized in a single」（接 application config so the same harness runs across the SQLite, BigQuery, and Snowflake environments without code changes）【C21】

**→ 一手先例**：超时 / 重试上限 / 凭证**集中到单一配置**，使同一 harness 跨三引擎无需改代码。这正对应 T1 第 9 条「模式与 policy version 随 run 落盘」，并支持 G9 把「超时阈值」当 **harness 配置**而非 provider 事实。

但该文的 failure modes 只有三条散文级描述（SMQ 编译缺口 / agent 组装错误 / 语义层未暴露所需列），**无错误分类法、无 environment 轴**。

### 3.6 小结：四篇论文与 R9 的问题基本错位

| 论文 | 分类的是什么对象 | 落在 T1 五分的哪一格 | 对 R9 归属矩阵的贡献 |
|---|---|---|---|
| SAL 2607.22572 | 模型幻觉 H1–H4【C3】【C4】 | 全在 `fail` 内 | **≈0**（且自承 Oracle-specific【C2】）；仅作「执行错记模型账」的反面先例【C5】 |
| SQL-of-Thought 2509.00581 | 模型 logical errors 9×31【C7】【C8】 | 全在 `fail` 内 | **0**；且为二手【C9】 |
| Shen 2501.09310（追加） | 模型错 + **benchmark 缺陷**【C12】【C13】 | `fail` + **`case-defect`** | **高**：syntax/schema 可操作边界【C15】【C16】+ benchmark-defect 一手先例 |
| survey 2408.05109 | model errors【C19】 | `fail` 内 | **中**：四条分类法设计原则【C18】+ 「现有分类法不通用」【C17】 |
| 语义层 2606.31041 | （无分类法） | — | **中**：多引擎 harness 配置集中化先例【C21】 |

**→ 这是对 map 的第二处修正**：map 方向 9 把这批论文列为「跨引擎错误模式注册」的依据。实际上**除追加的 Shen 之外，没有一篇在处理执行环境失败**。syntax/semantic/resource/timeout/transport/permission/cancellation 这七项里，论文只覆盖 syntax 与 semantic（且只在「模型写错」的意义上），其余五项**全部只有厂商文档可依**。

---

## 4. 本仓现状（re-derived）

全部以 `mcp__local__grep` 重新定位，未采信 map 的旧行号。

### 4.1 map 行号实测：**零漂移**（与票面预期相反）

票面预期「T1 已落地，行号很可能过时」。**实测全部精确命中**：

| map 记载 | 实测 | 结论 |
|---|---|---|
| eval `FailureClass` 5 类 @ `types.ts:28` | `packages/eval/eval/src/types.ts:28`【C43】 | ✅ 完全一致 |
| engine `FailureKind` frozen 6 类 @ `:96-103` | `packages/data/nl2sql-engine/src/types.ts:96`【C44】 起 6 个成员至 `:103` | ✅ |
| `RECOVERABLE_FAILURES` @ `:109-112` | `:109`【C45】 | ✅ |
| `UNRECOVERABLE_FAILURES` @ `:115-120` | `:115` | ✅ |
| provider `classifyMaxcError` 5 值 @ `:179-181` | 声明 `:179`，返回类型 `:181`【C46】 | ✅ |

**→ 漂移不在行号，在别处**（§4.2、§4.5）。T1 的改动是**叠加**式的：它新增了结局与 artifact，但**没有动任何一套既有词表**。

### 4.2 实际是 6 套词表，不是 3 套

| # | 词表 | 位置 | 成员 | map 记载？ |
|---|---|---|---|---|
| 1 | eval `FailureClass` | `packages/eval/eval/src/types.ts:28`【C43】 | `syntax_error \| guard_rejected \| infrastructure \| timeout \| patience` | ✅ |
| 2 | engine `FailureKind`（frozen） | `packages/data/nl2sql-engine/src/types.ts:96`【C44】 | `parse_failed, table_not_found, field_not_found, semantic_mismatch, permission_denied, cost_exceeded` | ✅ |
| 3 | provider `classifyMaxcError` | `packages/query/query-maxcompute/src/index.ts:181`【C46】 | `not_found \| permission \| syntax \| timeout \| unknown` | ✅ |
| 4 | provider 实际发出的 `failureKind` | 同文件 `:418`【C60】、`:429`、`:444` | 上面 4 个具体值 + **`remote`**（unknown 的兜底）+ **`transport`** | 部分（map 提到 transport/retryable/remote「走别的分支」） |
| 5 | **`InfraFailureKind`（T1 新增）** | `packages/eval/eval-runner/src/types.ts:391`【C47】 | `connectivity \| timeout \| rate_limit \| transient` | ❌ **未记载** |
| 6 | **`ExecutionOutcome`（T1 新增，五分结局）** | `packages/eval/eval/src/execution_grade.ts:53`【C48】【C66】 | `pass \| fail \| environment-blocked \| case-defect \| not-measured` | ❌（map 未在 §194 并列） |

**→ 对 map 的第三处修正**：「三套失败词表」应改为「六套」，其中两套是 T1 引入的。

### 4.3 关键结构事实：`failureKind` 跨端口是**无类型字符串**

- provider 侧：`packages/query/query/src/types.ts:61` 是 `readonly failureKind?: string`【C54】。
- artifact 侧：`packages/eval/eval/src/execution_grade.ts:139` 是 `readonly failureKind: string | null`【C53】——注释自称「The provider's **typed** failure kind」，但类型就是 `string`。**注释与类型矛盾。**

**→ 后果**：T1 立了单一端口 `ExecutionPort`【C59】，但**端口上没有任何封闭的失败词表**。六套词表里没有一套穿过端口；穿过去的是一个开放字符串。这就是 G9 的结构性缺口：**不是"词表不一致"，是"端口没有词表"**。

而 MaxCompute 明明提供了可机械解析的模块位【C38】（本轮 67/67 验证通过）与严重等级【C40】——**provider 适配器把它们全部丢弃了**：`classifyMaxcError` 用正则匹配散文【C46】，而不是解析 `ODPS-01CCCCX` 的数字段。

### 4.4 实测：当前分类器在多引擎文本上的行为

归因的唯一判据在 `gradeExecution`：

```
const blocked = failureClass === null || ENVIRONMENTAL_FAILURE_CLASSES.has(failureClass)
```
（`execution_grade.ts:325`【C49】；`ENVIRONMENTAL_FAILURE_CLASSES = {infrastructure, timeout, patience}`【C61】）

而 `failureClass` 来自 `classifyExecutionFailure(error)`——**对错误文本做子串匹配**，且**默认值是 `infrastructure`**【C50】，而 `infrastructure` ∈ 环境类【C61】。

**→ 任何未被硬编码子串命中的报错，一律落 `environment-blocked`，即从模型分母中移出。**

用真实构建产物（`packages/eval/eval/lib/index.js`）跑的运行时探针（`.tmp/r9/probe.mjs`，输出 `.tmp/r9/classify-probe-output.txt`）：

| 报错文本（真实引擎格式） | 判得 `FailureClass` | 归因结果 |
|---|---|---|
| MaxCompute `ODPS-0130131 … Table not found … cannot be resolved` | `infrastructure` | **environment-blocked（放过模型）** |
| MaxCompute `ODPS-0130071 … Semantic analysis exception - column xyz cannot be resolved` | `infrastructure` | **environment-blocked** |
| PostgreSQL 42P01 `relation "orders" does not exist` | `infrastructure` | **environment-blocked** |
| PostgreSQL 42601 `syntax error at or near "SELCT"` | `syntax_error` | fail ✅ |
| PostgreSQL 42501 `permission denied for table salaries` | `infrastructure` | **environment-blocked** |
| PostgreSQL 22012 `division by zero` | `infrastructure` | **environment-blocked** |
| PostgreSQL 57014 `canceling statement due to statement timeout` | `timeout` | environment-blocked ✅ |
| PostgreSQL 57014 `canceling statement due to user request` | `infrastructure` | environment-blocked（但原因记错） |
| Snowflake `000904 (42000): SQL compilation error … invalid identifier` | `infrastructure` | **environment-blocked** |
| BigQuery `Syntax error: Unexpected identifier "SELCT" at [1:1]` | `syntax_error` | fail ✅ |
| BigQuery `Access Denied: … does not have permission to query table` | `infrastructure` | **environment-blocked** |
| BigQuery `Quota exceeded: … concurrent queries` | `infrastructure` | environment-blocked ✅ |
| BigQuery `Resources exceeded during query execution` | `infrastructure` | **environment-blocked** |

**13 条里 11 条判 `environment-blocked`，其中 6 条是真正的模型错误被放过**（臆造表名 ×2、坏列名、Snowflake invalid identifier、除零、权限——权限是否算模型错取决于策略，见 §5）。只有 PostgreSQL 42601 与 BigQuery 的字面 `Syntax error:` 进了 `fail`，**纯因为它们恰好含英文子串 `syntax error`**。

两条具体的误分类，均可定位：

1. **table-not-found 被显式判为 `infrastructure`**：`classify_failure.ts:60`【C51】——命中语法分支后，若文本含 `odps-0130131 / table not found / cannot be resolved` 就**改判** `infrastructure`。注释理由是「`table not found` inside a semantic-analysis exception is a routing fault」。在 **engine 侧**这个理由成立（scope routing 没把表带进来）；在 **eval 侧判分**时它意味着**模型臆造表名不计失败**。同一段代码服务两个目的相反的场景。
   - 对照：同一仓的 reference-SQL 路径把 `not_found` 判为**非**环境失败【C55】——即 reference SQL 查不到表算语料缺陷，候选 SQL 查不到表算环境问题。**同一事实，两条路径结论相反。**
2. **`odps-0010000` 被当 timeout**：`classify_failure.ts:58`【C52】把 `odps-0010000` 归 `timeout`。但 `ODPS-0010000` 的官方含义是 *System internal error*（如 `fuxi job failed … Quota not enough`），属**系统/配额**而非超时。二者都在 `ENVIRONMENTAL_FAILURE_CLASSES` 内，故**五分结局不变**，但落盘原因是错的，趋势分析会被污染。（该码不在 `ODPS-01CCCCX` 页上，官方语义**待核**。）

### 4.5 T1 之后确实出现了翻译表 —— 但是私有字符串白名单，且违反互斥性

map 说「三套互不重叠，且无 adapter 在其间翻译」。**后半句已过时。** `eval-runner/src/runner.ts:418`【C55】：

```
if (['syntax', 'syntax_error', 'invalid_sql', 'semantic', 'guard', 'guard_rejected', 'not_found'].includes(failureKind)) {
```

紧随其后（`:421-432`）是环境侧白名单：`transport, connectivity, timeout, throttling, throttled, rate_limit, retryable, transient, permission, permission_denied`。

这**是**一张翻译表：它把词表 1（`syntax_error`/`guard_rejected`）、词表 3/4（`syntax`/`not_found`/`transport`/`retryable`/`permission`）、词表 2（`permission_denied`）、词表 5（`connectivity`/`rate_limit`/`transient`）混在一个数组里。但它有四个问题：

1. **私有**：函数 `isReferenceEnvironmentFailure` 未导出，不是声明式映射，G9 无法复用。
2. **重复**：`classifyReturnedExecutionInfraFailure`（`runner.ts:709`【C64】）是第二份近似表，同样手写、规则略不同。
3. **是并集不是映射**：无法表达「这个值我不认识」。未命中就落到 `failureClass` 子串匹配兜底【C55 末尾逻辑】，于是又回到 §4.4 的默认 `infrastructure`。
4. **只管 reference SQL 路径**，候选 SQL 路径走 `gradeExecution:325`【C49】，两条路径对同一 `failureKind` 结论可以相反（§4.4 的 `not_found`）。

**违反 survey 的 Mutual Exclusivity 原则**【C18】：`timeout` 同时是词表 1、3、4、5 的成员，但含义不同——词表 5 的 `timeout` 指**harness 自己的 wall-clock deadline 到了**，词表 3 的 `timeout` 指**MaxCompute 报了超时**。两者在 `.includes('timeout')` 下不可分。

### 4.6 两处把「谁的超时」压成同一个 token

`ctx_query_executor.ts:85`【C56】：

```
return { state: 'failed', sql, error: timeoutReason.message, failureKind: 'timeout' }
```

这是 **harness 主动放弃**（`queryWaitSeconds` 到期、AbortSignal 触发）时**合成**的 outcome，但它用了与 provider 上报超时**完全相同**的 `failureKind: 'timeout'`。

**→ 「我没等了」与「仓库说它超时了」是归属不同的两个事实**（前者 Harness 拥有，后者 Provider 拥有），当前不可分。这直接关系到 T1 实测的那 2 个 `environment-blocked`（§7.3）。

另一处标签错误：`ctx_query_executor.ts:65`【C57】——**没挂 query provider** 时合成 `failureKind: 'permission_denied'`。配置缺失被标成权限拒绝。五分结局恰好仍对（都进环境类），但任何基于 `failureKind` 的统计都会把「没装 provider」计入「权限问题」。

**T1 在此处确实修对了一件事**（值得记下，避免 G9 重复劳动）：`ctx_query_executor.ts:29` 现为 `const COMPLETED_STATES: readonly string[] = ['completed', 'done']`【C58】——即 T1 验收面点名的「`'done'` 白名单不得静默丢失」已落地为**显式声明的 state 白名单**，两份 adapter 合并时 `'done'` 路径没有从「成功」静默变成 `environment-blocked`。这是六套词表里唯一一处**已经做对**的归一。

### 4.7 `mapQueryOutcome`：G1 的「从未被调用」**在 T1 之后依然成立**

全仓 `src/` 检索 `mapQueryOutcome` 的**生产调用点：0 个**。它只出现在自身定义【C62】、单测、README 示例。仓库自己也写明了：

> 「The older `CaseSqlExecutor` / `mapQueryOutcome` path remains only in the legacy runtime pending T12 removal.」【C63】

**→ 现行判分路径不经 `mapQueryOutcome`**，它仍在 `index.ts` 导出面上。注意它与现行路径的**行为差异**：`mapQueryOutcome` 把 `pending` 判 `patience`，而 T1 的 `normalizeOutcome` 在 `execution_grade.ts:273` 同样把 `pending` 判 `patience`——这一条是一致的。G9 不必为它设计映射，但 **T12 删它之前，它仍是导出 API 的一部分**。

### 4.8 另一处隐患：`infra_retry` 的 `'500'` 子串

`infra_retry.ts:50`【C65】：

```
if (msg.includes('503') || msg.includes('502') || msg.includes('500') ||
```

`msg` 是小写化的**整条错误文本**。任何含 `500` 的报错——`LIMIT 500`、表名 `t500`、`rowCount=1500`、`ODPS-0130071:[1,500]` 的行列位置——都会被判 `transient` 并触发重试。**误判方向是「重试 + 记环境」，即继续放过模型。**（未实测命中，列为**设计隐患**而非已证缺陷。）

> **§2.3 / §4 中的机械验证脚本**：MaxCompute 67/67 模块区间核对、`Authorization exception` 一名三码、`ODPS-0130071` 17 次出现、全页唯一 `处理方法：重试`，均由 `.tmp/r9/` 内的一次性 Python 片段产出（非持久脚本）；`classifyExecutionFailure` 探针为 `.tmp/r9/probe.mjs`，输出 `.tmp/r9/classify-probe-output.txt`。引用清单复验脚本 `.tmp/r9/build_manifest.py`（71/71 通过）。

---

## 5. 归属矩阵（核心交付）

**读法**：列 = 唯一能**权威**裁定该事实的层。「权威」= 该层直接观测到该事实，不靠猜。`—` = 该层无法贡献。**粗体**= 该层是唯一所有者。

| # | failure fact | Provider | execution adapter | Harness | Benchmark grader |
|---|---|---|---|---|---|
| 1 | **syntax**（进不了 AST【C15】） | **权威**：PG 42601；MaxC PARSER 模块位【C38】；BQ `invalidQuery`；SF `EXPRESSION_ERROR`【C69】 | 翻译为 canonical | — | — |
| 2 | **semantic / name-resolution**（进了 AST，解析失败【C16】） | **权威**：PG 42P01/42703；MaxC `ODPS-0130131`【C42】；BQ `notFound`；SF `000904` | 翻译 | — | — |
| 3 | **semantic / 结果错但执行成功**（SAL H4【C4】） | — | — | — | **权威**：唯一能比对 expected |
| 4 | **resource / quota** | **权威**：PG class 53/54；MaxC sev 8/9；BQ `quotaExceeded`/`resourcesExceeded` | 翻译 | 决定是否重试 | — |
| 5 | **timeout（provider 侧）** | **权威**（MaxC/BQ `timeout`）；⚠ **PG 不权威**：57014 不分超时/取消【C26】 | 翻译 + 记录来源层 | — | — |
| 6 | **timeout（harness 侧 deadline）** | — | 观测（它合成的）【C56】 | **权威**：deadline 是 harness 配的【C21】 | — |
| 7 | **transport / connectivity** | 部分：BQ 明说 error object 可能缺失【C32】 | **权威**：只有调用方知道「连都没连上」 | 决定重试 | — |
| 8 | **permission** | **权威**：PG 42501；MaxC `Authorization exception`（三码两级）【C41】；BQ `accessDenied` | 翻译 | **策略**：算环境还是算模型（见下） | — |
| 9 | **cancellation** | ⚠ **分裂**：MaxC 权威【C39】、BQ 权威（`stopped`@200）【C34】；**PG 不可能**【C30】【C31】 | 观测「是我发的取消」 | **权威**（当取消由 harness 发起） | — |
| 10 | **pending / unresolved** | 部分：给 instanceId / jobId；BQ 自承「unclear if the job succeeded」【C35】 | 观测非终态 | **权威**：决定 attach 还是放弃【C59】 | — |
| 11 | **benchmark-defect / gold error**（Shen F1【C13】） | — | — | — | **权威**：唯一持有 expected 与 reference SQL |
| 12 | **benchmark-defect / 输出歧义**（Shen F3） | — | — | — | **权威**（但需人判） |
| 13 | **benchmark-defect / 库层约束违反**（Shen F2） | 部分：能报外键异常 | — | — | **权威**：需与 expected 对照才知是缺陷 |

### 5.1 当前无任何层能裁定的格 —— G9 的真议程

| 缺口 | 为什么现在没人能定 | 谁该拿走 |
|---|---|---|
| **A. PG 上 timeout vs cancellation** | SQLSTATE 只有 57014【C26】，协议层连「取消是否生效」都不可知【C30】 | **不可解**。G9 须接受：canonical 词表若设独立 `cancelled`，PG 永远填不出。建议合并为 `terminated-early` + extension 标注来源 |
| **B. harness deadline vs provider timeout** | 两者共用 `failureKind:'timeout'`【C56】，下游 `.includes('timeout')` 不可分（§4.6） | **execution adapter**：合成 outcome 时必须打 `observedBy: 'harness' \| 'provider'` |
| **C. 「模型臆造表名」vs「routing 没带上表」** | 同一 `ODPS-0130131` 文本，两种归因；当前两条路径结论相反（§4.4） | **Harness**：只有它知道 scope 里本该有哪些表。Provider 给不出，grader 也给不出 |
| **D. permission 算谁的** | 无层「不能」裁定，是**没人裁定过**：当前默认落环境【C50】 | **Harness 策略**（G9 必须显式选，见 §6.2） |
| **E. 未知 `failureKind` 的归属** | 端口上是开放 `string`【C53】【C54】，未知值默认 `infrastructure`→放过模型【C50】 | **G9 必须定 fail-loud 还是 fail-open**。当前是静默 fail-open，最危险的默认 |
| **F. 「不知道跑没跑成」** | BQ 承认存在【C35】；本仓只有 `pending` 一个表达，混用于「在跑」与「不知道」 | **execution adapter**：区分 `running-known` 与 `outcome-unknown` |
| **G. Shen F2 / F3 两类语料缺陷** | T1 `case-defect` 未覆盖（§3.3） | **Benchmark grader** |

---

## 6. 对 G9 的输入

### 6.1 文献 / 厂商已裁定（G9 不必重开，照抄即可）

1. **不要对错误文本做分类，要用码** —— PostgreSQL 原文【C22】；配套理由是码「不随本地化变」【C23】。**本仓当前做法与此直接相反**（§4.4）。
2. **class / module 位不是归因**，只是编译阶段归属 —— PG class 42 同装语法与权限【C25】；MaxC `Authorization exception` 横跨三模块【C41】。
3. **syntax 与 semantic 的可操作边界** = 能否进 AST【C15】 / 能否完成 schema resolution【C16】（Shen, FSE 2026）。
4. **`reason` / `failureKind` 集合不可假定封闭** —— BigQuery 明说表不穷尽【C32】、换客户端库可能变【C33】。**→ canonical 词表必须有 unknown 成员 + 显式未知策略。**
5. **cancellation 不是跨引擎稳定判别式** —— PG 不可分【C26】【C30】，MaxC/BQ 可分【C39】【C34】。
6. **「不知道跑没跑成」是合法一等状态** —— BigQuery `jobs.insert` 5xx【C35】。
7. **benchmark-defect 必须是分类法的一等成员** —— Shen §3.2.6 `Not an Error` / F1 Gold Error【C12】【C13】（同行评审先例）。T1 的 `case-defect` 方向正确，但缺 F2/F3。
8. **分类法须满足互斥性** —— survey 四原则【C18】。本仓现状违反（§4.5）。
9. **超时 / 重试上限 / 凭证应集中为单一配置** —— 多引擎 harness 先例【C21】。
10. **「执行错即记模型错」有已发表先例，但与本仓选择相反** —— SAL Table 10【C5】【C6】。`environment-blocked` 仍**无文献先例**，G9 须继续把它标注为本仓自主选择。

### 6.2 本仓自主选择（文献与厂商都不给答案，G9 必须拍）

| 决策 | 选项 | 本文的判断倾向（设计推论） |
|---|---|---|
| **D-1 permission 算谁的** | (a) 环境（现状） / (b) 模型 / (c) 看是否 scope 内 | 倾向 **(c)**：scope 内表拿不到权限 = 环境；scope 外表 = 模型越界。需 Harness 持有 scope 清单 |
| **D-2 未知 `failureKind`** | (a) 静默归环境（现状【C50】） / (b) 归 `fail` / (c) **fail-loud** 单列 `unclassified` | 倾向 **(c)**。(a) 系统性放过模型（§4.4 实测 11/13），(b) 会把真环境故障记模型头上 |
| **D-3 name-resolution 失败** | (a) 环境（现状【C51】） / (b) 模型 / (c) 看 scope | 倾向 **(c)**，与 D-1 同源。**必须同时修掉候选路径与 reference 路径的相反结论**（§4.4） |
| **D-4 canonical 是否设 `cancelled`** | (a) 设（PG 填不出） / (b) 不设，归 timeout / (c) 设 `terminated-early` + extension 区分 | 倾向 **(c)**，唯一同时容纳 PG【C26】与 MaxC/BQ【C39】【C34】的形状 |
| **D-5 harness deadline 的归属** | (a) 同 provider timeout（现状） / (b) 独立成员 / (c) 同成员 + `observedBy` | 倾向 **(c)**，最小改动即可分辨（§5.1 缺口 B） |
| **D-6 是否解析 provider 码** | (a) 继续正则散文（现状） / (b) 解析 `ODPS-01CCCCX` 模块位【C38】 + SQLSTATE 5 位 | 倾向 **(b)**。MaxC 模块位本轮 67/67 验证可靠；但注意模块 ≠ 归因【C41】，且 `ODPS-0130071` 一码 17 义，码只是**第一级**筛 |
| **D-7 严重等级怎么用** | (a) 忽略 / (b) 当 retryable 信号 | MaxC 全页唯一 `处理方法：重试` 在 sev 8【C40】；**但 n=1，不足以立规则**。倾向 (a) + 落盘备查 |

### 6.3 `FailureClassifier` 接口形状 —— **设计推论，非来源结论**

> 以下为本文的建议形状，**不是任何来源的结论**。承重理由逐条指回 §5.1 的缺口。

```ts
/** 跨引擎归一后的失败事实。封闭联合 + 必有 unknown（BigQuery 明说集合不穷尽【C32】）。 */
type NormalizedFailure =
  | 'syntax'                 // 进不了 AST【C15】
  | 'name-resolution'        // 进了 AST，解析失败【C16】；归因由 scope 决定（D-3）
  | 'semantic-guard'         // 本仓 guard / 必需谓词
  | 'permission'             // 归因由 D-1 决定
  | 'resource-quota'
  | 'terminated-early'       // 超时+取消合并（D-4）；来源由 cause 区分
  | 'transport'
  | 'outcome-unknown'        // 「不知道跑没跑成」【C35】；与 still-running 分开（缺口 F）
  | 'unclassified'           // fail-loud 的落点（D-2）—— 不得静默归环境

interface FailureFact {
  readonly normalized: NormalizedFailure
  /** 谁观测到的 —— 解决缺口 B：harness deadline vs provider timeout 不可再同名 */
  readonly observedBy: 'provider' | 'adapter' | 'harness'
  /** provider 的原始码，逐字保留，不解释。PG=SQLSTATE 5 位；MaxC=ODPS-01CCCCX；BQ=reason；SF=SQLCODE */
  readonly providerCode: string | null
  /** provider 的原始 failureKind 字符串，逐字保留（现 execution_grade.ts:139 已在存【C53】） */
  readonly providerKind: string | null
  /** 引擎专有载荷，namespaced。MaxC 的 module/severity、BQ 的 httpStatus 等 */
  readonly extension: Readonly<Record<string, unknown>>
  /** 该 normalized 值是怎么得出的 —— 使「码判定」与「文本兜底」可事后分辨 */
  readonly basis: 'provider-code' | 'provider-kind' | 'message-match' | 'adapter-synthesized' | 'default'
}

interface FailureClassifier {
  /** engineId 是必需的：不存在引擎无关的错误文本分类（§4.4 实测）。 */
  classify(engineId: string, raw: RawFailureSignals): FailureFact
}
```

四个承重点：

1. **`observedBy`** 是最小代价修掉缺口 B 的办法——不新增成员，只标来源。
2. **`basis`** 让「我是按码判的」与「我是猜文本的」在落盘后可分辨。若全仓 `basis: 'default'` 占比高，就是 §4.4 那个病在复发，可被 compare.ts 做成闸门。
3. **`unclassified` 必须存在**，否则 D-2 只能在「放过模型」和「冤枉模型」之间选，这正是现状。
4. **`engineId` 是必需参数**，不是可选——这是本轮最硬的实证结论（§4.4：同一分类器在 4 个引擎上的正确率天差地别）。

### 6.4 G9 验收面建议（设计推论）

- 一个 case：MaxCompute `ODPS-0130131` 与 PostgreSQL `42P01` 必须归到**同一** `normalized`，且 `providerCode` 各自保留。
- 一个 case：harness deadline 与 provider timeout 的 `FailureFact` 必须 `observedBy` 不同。
- 一个 case：注入一个**从未见过**的 `failureKind`，必须得到 `unclassified` 而**不是** `environment-blocked`。
- 回归：§4.4 那 13 条文本作为固定向量，每条的归因须显式断言（当前 11 条放过模型，改完应显著下降，且**每条翻面都要有裁定依据**）。

---

## 7. 与 T1 五分结局的衔接

### 7.1 映射

| normalized failure | T1 结局 | 依据 |
|---|---|---|
| `syntax` | **`fail`** | 候选 SQL 自身错 = 模型失败（G1 D1 第 2 行）。Shen 把它定为「进不了 AST」【C15】 |
| `name-resolution` | **取决于 D-3** | 现状落 `environment-blocked`【C51】，本文倾向按 scope 判（§6.2） |
| `semantic-guard` | **`fail`** | `guard_rejected` 现已非环境类【C61】，正确 |
| `permission` | **取决于 D-1** | 现状 `environment-blocked`【C50】 |
| `resource-quota` | **`environment-blocked`** | 配额不是模型能控制的 |
| `terminated-early`（provider 超时） | **`environment-blocked`** | 与 T1 第 7 条一致 |
| `terminated-early`（harness deadline） | **`environment-blocked`**，但须可分辨 | §7.3 |
| `transport` | **`environment-blocked`** | |
| `outcome-unknown` | **`environment-blocked`** | T1 第 7 条已明示覆盖「仓库返回非终态 pending」 |
| `unclassified` | **`environment-blocked` + 告警** | 设计推论：不进模型分母，但必须可见，否则就是现状的静默放过 |
| Shen F1/F2/F3 | **`case-defect`** | F1 已被 T1 覆盖；**F2/F3 未覆盖**【C12】【C13】 |
| 执行成功但结果不匹配（SAL H4【C4】） | **`fail`** | grader 独占（矩阵第 3 行） |

### 7.2 必须是 `environment-blocked` 而不是 `fail` 的（不计模型头上）

`resource-quota`、`transport`、`outcome-unknown`、provider 超时。理由同源：模型对它们无因果影响。
**→ 这一组当前判对了**，因为它们恰好落进默认 `infrastructure`【C50】。**但是判对的原因是错的**——是默认兜底碰对，不是识别出来的。所以同一个默认也把 §4.4 那 6 条模型错误一起放过了。**「碰对」不是「判对」。**

### 7.3 T1 那 2 个 event-query timeout：路径核验

T1 Resolution 记：`environment-blocked` 计数 2（event `123`、`126`），均为 `query pending` + instanceId，`MAXC_WAIT_SECONDS=300` 仍超窗。

**核验结论：该路径成立，但归因层标注错误。**

- 两例落 `environment-blocked` 是对的：`normalizeOutcome` 对 `pending` 直接判 `patience`（`execution_grade.ts:273`），`patience` ∈ 环境类【C61】，`gradeExecution:325`【C49】据此判 `environment-blocked`。**不经文本匹配**，所以这条路径不受 §4.4 的病影响。✅
- **但**：若同一查询不是返回 `pending` 而是被 `ctx_query_executor` 的 wall-clock deadline 砍掉，就会走 `:85`【C56】合成 `failureKind: 'timeout'` → `classifyExecutionFailure('query timed out after configured 300s wait window')` → 命中子串 `timed out` → `timeout` → 同样 `environment-blocked`。**结局相同，但第一种是「仓库还在跑」（provider 事实），第二种是「我们不等了」（harness 决定）。落盘后不可分辨。**
- **→ 对 G9 的具体要求**：这 2 例应带 `observedBy: 'provider'` + `outcome-unknown`（仓库仍在跑，结果未知），而 harness 砍掉的那类应带 `observedBy: 'harness'` + `terminated-early`。**两者都是 `environment-blocked`，但复跑策略不同**：前者可 `attach` 取回【C59】，后者只能加大 deadline。当前把它们压成一类，等于丢掉了 `attach` 这条路——而 T1 第 4 条保留 `attach?` 的全部意义就是让它成为策略选择。

### 7.4 一处与 T1 第 7 条的张力

T1 第 7 条把 `environment-blocked` 与 `case-defect` 分开的理由是「行动不同（重跑 vs 修语料）且趋势意义相反」。**这个理由现在被 `unclassified` 的缺位削弱了**：当未知错误静默进 `environment-blocked`【C50】，"environment-blocked 降下去 = 环境变好"的趋势解读就不成立——它也可能是「分类器恰好认识了更多字符串」。**→ G9 引入 `unclassified` 后，`environment-blocked` 的趋势才重新可解读。** 这是 §6.3 把 `unclassified` 列为承重成员的第二个理由。

---

## 8. 待核 / 取证失败 / 未回答

### 8.1 待核

| # | 事项 | 现状 |
|---|---|---|
| 1 | **2501.09310 的作者/日期身份** | 未经权威元数据核验（按票面禁令未查 arXiv API）。venue 字串自 PDF 页眉自证【C14】。**引用其结论进 G9 裁定前须补核** |
| 2 | **Shen「Not an Error」的确切比率** | `pdftotext` 展平多列表格，列↔技术/基准对应关系未能可靠还原。只报量级（266 vs 786 首列），**比率待核**（§3.3） |
| 3 | **SQL-of-Thought 分类法的归属** | 自述 9 类 31 子类【C7】【C8】，其声称来源 Shen 是 7 类 27 型【C11】；9/31 与 survey 记载的 NL2SQL-BUGs 数字吻合。NL2SQL-BUGs 按禁令不作一手引用，故**不下结论** |
| 4 | **`ODPS-0010000` 的官方语义** | 不在 `ODPS-01CCCCX` 页上（该页只覆盖 01 段）。本仓判它为 `timeout`【C52】，非官方来源指向 *System internal error / Quota not enough*。**官方定义未取到** |
| 5 | **Snowflake 的资源/配额类错误码** | `sf-exceptions` 页不含码表；无官方索引页（§8.2）。§2.6 表中 SF 的「资源/配额」格为空 |
| 6 | **MaxCompute 严重等级的官方定义** | 页面逐码标 1/2/3/5/8/9，但**未找到解释各级含义的说明**。sev 8 唯一带「重试」【C40】，n=1 |
| 7 | **`infra_retry` `'500'` 子串是否真误判过** | 列为设计隐患【C65】，**未实测命中** |
| 8 | **MaxCompute 非 SQL 错误（Tunnel / 作业层）** | 另有 Tunnel 错误码页（`NoSuchPartition`/`NoPermission`/`QPSExceeded` 等，含 `ODPS-0110044: Flow control triggered`），**本轮未系统认读**。本仓 provider 走 MCP sidecar，是否会收到 Tunnel 层错误**未核** |

### 8.2 取证失败

| URL | 状态 | 说明 |
|---|---|---|
| `https://docs.snowflake.com/en/sql-reference/error-codes` | **404** | Snowflake **无 canonical error-code 列表页**。这是事实，不是抓取问题 |
| `https://docs.snowflake.com/en/developer-guide/snowflake-scripting/conditions` | **404** | |
| `https://docs.snowflake.com/en/user-guide/querying-error-handling` | **404** | |
| `https://help.aliyun.com/zh/maxcompute/user-guide/error-code-description` | **soft-404** | HTTP **200** 但正文是 404 页（`404错误页-阿里云帮助中心`）。**票面给的「错误码参考」路径已失效** |
| `https://www.alibabacloud.com/help/en/maxcompute/user-guide/error-code-description` | **soft-404** | 同上。**MaxCompute 错误码英文版未取到** |
| `https://help.aliyun.com/zh/maxcompute/user-guide/sql-errors` | **403 via WebFetch / 200 via curl+UA** | 真实页面在此。阿里云对无 User-Agent 的请求返 403；加浏览器 UA 后 200。**后续认读须带 UA** |

逐条抓取记录留在 `.tmp/r9/access-log.txt`。

**关于「MaxCompute 文档是否中文独有」**（票面点名要记录）：**是**。SQL 错误码的完整列表只在 `help.aliyun.com/zh/` 下取到；`alibabacloud.com/help/en/` 对应路径 soft-404。**→ 任何依赖 MaxCompute 错误码表的实现，其一手依据是中文文档**；G9/T8 若要把码表写进代码，须接受这一溯源现实。

### 8.3 未回答

1. **本地 execution environment（SQLite / DuckDB）的错误分类**：票面列入范围，但四篇论文均未系统处理（语义层论文用 SQLite 但无分类法【C20】），本仓亦无本地执行器（T1 已核实 evaluation 无自建 SQL 引擎）。**→ 本轮未产出本地环境的归属行。** Shen 的 F2 提到 SQLite 默认关闭外键校验导致结果异常，是唯一相关的一手线索。
2. **cancellation 在 MaxCompute MCP sidecar 上是否真能观测到**：官方有 `ODPS-0120031`【C39】，但本仓 provider 经 MCP sidecar 转一手，`ODPS-0120031` 是否会原样到达 `failureKind` **未实测**。
3. **provider 截断信号**：T16 的待办，本轮未触及（`providerTruncated` 走 `rowCount !== rows.length` 测算，仍未实测分叉）。
4. **各引擎错误码的实测覆盖率**：§4.4 的 13 条文本是**手工构造的代表样本**，不是从真实 run 采样。真实分布未知——`unclassified` 若上线，第一周的计数才是真答案。
5. **retryability 的跨引擎统一规则**：只有 MaxC 给了逐码「重试」（n=1）【C40】、BQ 给了 5xx 通则【C32 上下文】，PG/SF 无逐码声明。**→ 不足以归纳出跨引擎 retryable 判据**；G9 若要 retry 策略，须按引擎分别写并标注依据薄弱。
