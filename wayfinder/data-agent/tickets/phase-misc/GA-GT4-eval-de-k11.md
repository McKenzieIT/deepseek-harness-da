# GA-GT4 — eval 框架去 K11

**Type**: grilling  ·  **Phase**: misc  ·  **Status**: resolved — architecture superseded by G10; surviving obligations routed
**Source**: [audit report](../../research/generalization-audit-2026-08-31.md) · [tickets doc](../../research/generalization-audit-tickets-2026-08-31.md) — H5+H8 / arch G6 · **high**

**Problem**: eval runner + bundle 硬编码 K11（`scopeId='k11'`、case 正则 `/^k11_\d+\.yaml$/` 连自家 `k11v2_*` 都不匹配→`runBatch` 抛 "no cases found"、caseDir/defaultProject/semanticRoot 指向 K11）；`classifyExecutionFailure` 只认 ODPS 错误码+中文 marker，`verdict_mapper` 却只认英文 → PG/Snowflake/BigQuery 真实 SQL 缺陷静默不评分。

**Scope**:
- scopeId 从 `case.scope_id` 或 config 读（不字面 'k11'）
- case 正则改 eval-cli 已有 glob（`*.yaml`/`*.yml`/`*.json`）
- `caseDir`/`scopeId`/`defaultProject`/`semanticRoot` 改必填部署项（无 K11 默认，未设 fail-loud）；`today` 用真实当前日期
- `FailureClassifier` 接口 + 多引擎错误模式集（PG/Snowflake/BigQuery 串）
- `classify_failure` 与 `verdict_mapper` 共享一个失败分类真值源（不再两套发散）
- `compare.ts` 分类从 case dimensions 取而非 k11v2 子串

**Blocked by**: 无  ·  **关联**: GA-GT2（engine 失败模式）、CL2（compare.ts k11v2 分桶）、CL13（generate-k11.mjs）
**Key files**: packages/eval/eval-runner-service/src/index.ts:379,391,418; packages/bundle/data-agent/cordis.patch.yml:162,178; packages/eval/eval-cli/src/{context.ts:405,413,compare.ts:76}; packages/eval/eval/src/classify_failure.ts:56; packages/eval/eval-runner/src/verdict_mapper.ts:94

## 2026-09-10 readiness refresh

本票的 de-K11 问题仍存在，但架构所有权已移交 [G10 — Harness B/H/E + Context capability 拆分](../../../evaluation/tickets/G10-harness-bhe-split.md)。G10 已完成 R10/R10b/R10c 前置研究并达到 research-ready；本票不再独立决定包边界。

当前代码复核：

- `packages/eval/eval-runner-service/src/index.ts:383,390,397` 仍默认 `packages/eval/eval/cases/k11-v2`、固定 `today`，并用 `^k11_\d+\.yaml$` 过滤；
- `packages/bundle/data-agent/cordis.patch.yml:178,199` 仍声明 K11 semantic root 与 case directory；
- `packages/eval/eval-cli/src/compare.ts:5-7` 仍按 `k11v2_*` 名称推断分类；
- “`classifyExecutionFailure` 无人调用”已过期：`packages/eval/eval/src/multi_turn.ts:151` 已调用它。多引擎 failure taxonomy 仍未解决，但归方向 9/G9/T8；G10 只决定它在目标包结构中的位置和依赖方向。

调和规则：G10 保留本票的部署配置 fail-loud、通用 case discovery、维度驱动 compare 和 de-K11 目标；以 R10/R10b/R10c 的 Benchmark/Adapter/Context/Environment 所有权替代本票原先未展开的包边界假设。G10 resolved 后，本票按其决议拆给 T9/G9 或关闭。

## 2026-09-11 G10 routing preview

- K11/RBI 内容与 filename discovery → [T14 — Data-analysis extension 与 canonical Pack migration](../../../evaluation/tickets/T14-data-analysis-extension-pack-migration.md)；正式路径由 BenchmarkRepository 解析 sealed Pack，不再 glob caseDir。
- `scopeId`/project/provider binding、fail-loud preflight 与 product run → [T9 — Evaluation foundations](../../../evaluation/tickets/T9-evaluation-foundations.md) + [T15 — Product Evaluation Controller 与 external CLI](../../../evaluation/tickets/T15-evaluation-controller-cli.md)。
- `semanticRoot` 与 duplicated Context assembly → [T13 — Production Context Projection capability](../../../evaluation/tickets/T13-context-projection-service.md)。
- `compare.ts` 的 dimension/identity/Goodhart 语义 → T15 + [R25 — New Evaluation stack baseline](../../../evaluation/tickets/R25-evaluation-rebaseline.md) + [R21 — Goodhart audit](../../../evaluation/tickets/R21-goodhart-audit.md)。
- Provider-specific failure taxonomy → [R9](../../../evaluation/tickets/R9-error-taxonomy-papers.md) → [G9](../../../evaluation/tickets/G9-failure-classifier.md) → [T8](../../../evaluation/tickets/T8-failure-classifier-impl.md)。
- 旧 package/runtime/default bundle rows 的删除 → [T12 — Final Evaluation package graph 与 legacy cutover](../../../evaluation/tickets/T12-eval-package-consolidation.md)。

## Resolution

本票关闭，因为它识别的 K11 coupling 已全部由更精确的 owner、interfaces 与 implementation tickets 承接；继续保留独立 implementation authority 会允许旧的 flat config、glob、ambient date、service-runner 和单 classifier 解法与 G10 并存。关闭不表示 hardcode 已修复，只表示问题已从审计入口迁移到可执行 ticket graph。

保留的目标是 shared runtime 无具体 DataScope/Benchmark hardcode、配置 fail loud、discovery 不依赖 filename、comparison 不依赖 case-id naming、Provider portability 与 failure facts 不漂移。被 supersede 的解法是 case/config fallback precedence、broad glob、flat runner config、ambient `today`、继续扩展 `eval-runner-service`，以及把 Environment classification 和 correctness verdict 合成一个 classifier。上列 T13/T9/T14/T15/T12、R9/G9/T8、R25/R21 与 G15 是全部 surviving obligations 的 owner。
