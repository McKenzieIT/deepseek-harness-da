# G9 — Failure normalization 与 attribution

**Type**: grilling  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: [R9 — Multi-engine execution failure taxonomy](R9-error-taxonomy-papers.md)、[T1 — Execution grader implementation](T1-exec-grader-impl.md)
**Blocks**: [T8 — Failure normalization implementation](T8-failure-classifier-impl.md)
**Mode**: HITL
**Branch**: `grilling/G9-failure-classifier`

## Question

Provider-specific outcomes、engine/agent execution failures 与 Benchmark verdict 应如何通过显式 adapter 映射为可扩展、可审计的 normalized execution facts，使 infrastructure、timeout、permission、pending/unresolved、model SQL error、case defect 与 grader failure 不再依赖语言/字符串匹配或被压成一个 `wrong`？

## Must decide

- Canonical core discriminants and namespaced provider extension payloads.
- Ownership of Provider → normalized execution mapping and normalized facts → Benchmark verdict mapping.
- Required evidence, unknown/unsupported handling and fail-loud policy.
- Relationship to G1 outcome classes、Environment assurance/finality and T1 ExecutionArtifact.
- Package location and dependency direction under G10 package topology.

## Out of scope

- Implementing engine-specific adapters ([T8](T8-failure-classifier-impl.md)).
- Comparator defaults or event-case correctness policy.

---

## ⊕ 前置已就位（2026-10-06）：[R9](R9-error-taxonomy-papers.md) resolved

**产物**：[`../research/error-taxonomy-papers.md`](../research/error-taxonomy-papers.md) —— §5 的 **13×4 归属矩阵**（7 格标为当前无任何层可裁，各自指派 owner）、§6 的 **10 条「文献/厂商已裁定」vs 7 条「本仓自主选择」（D-1…D-7）**。

### ⚠ 本票的第一决策已被 R9 改写

原题面设想 G9 要裁 `FailureClassifier` 的**接口形状**。R9 查出一条**活的测量效度缺陷**，它比接口设计更紧迫：

- `classify_failure.ts:63` 的兜底分支 → `'infrastructure'`（repo 自有测试确认 `null/undefined/''` 皆然）
- `classify_failure.ts:30` —— `'infrastructure'` ∈ `ENVIRONMENTAL_FAILURE_CLASSES`
- `execution_grade.ts:325` —— `blocked ? 'environment-blocked' : 'fail'`，而 `environment-blocked` **离开模型分母**

识别靠的是在 MaxCompute 上调出的**英文/中文子串**。⇒ 运行时探针：**13 个真实多引擎报错里 11 个替模型免责**，含 MaxCompute 与 PostgreSQL 的**幻觉表名**、错列名、Snowflake `000904`、除零；只有 PG `42601` 与 BigQuery 字面 `Syntax error:` 能到 `fail`，**纯因含那个英文子串**。

> **这不是「判对了」，是「碰巧判对了」**，且偏向系统性地对模型有利。**⇒ D-1 应为「未识别失败文本的默认方向」**（fail-open 到 `environment-blocked`，还是 fail-closed 到 `fail`，还是强制 `unclassified` 第三态并拒绝计入任一分母）。**这是当前所有 real-exec 数字的效度前置。**

### 其余须裁项（R9 已备好证据）

1. **`ExecutionPort` 的词表**：两侧 `failureKind` 都是开放 `string`（注释称 typed），**6 套词表没有一套跨过 port**。
2. **6 套而非 3 套**：T1 新增 `InfraFailureKind` + `ExecutionOutcome`，未动旧三套；事实翻译是 `runner.ts:418` 的私有白名单（`:709` 重复），**并集而非映射，故结构上无法表达「未知」**。
3. **跨引擎稳定区分比预期少**：SQLSTATE `Class 42` 把 syntax/undefined-table/privilege 装进同一 class ⇒ **class 不是归属边界**；`cancelled` 在 PG 上**填不出来**（`57014` 兼表超时与取消，协议层也分不出）；BigQuery **明确拒绝闭合** ⇒ unknown 处理是强制项。
4. **`case-defect` 有同行评议先例**：`2501.09310`（**FSE 2026**）§3.2.6 `Not an Error` 含 `F1: Gold Error. The benchmark provides an incorrect ground-truth (gold query).`
5. **T1 的 timeout 标签撒谎**：harness 截止期杀掉查询与数仓仍在跑**合成同一个** `failureKind:'timeout'`，持久化后不可分，丢掉了 `attach?` 的恢复路径。
6. **SAL 不可当通用来源**：`2607.22572` 自述 Oracle-only，其 4 类是模型幻觉、全在 `fail` 内部。

`FailureClassifier` 的建议形状（R9 **设计推论**，非论文结论）承重四项：`observedBy`、`basis`、**强制 `unclassified` 成员**、**必填 `engineId`**。
