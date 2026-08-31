# GA-GT4 — eval 框架去 K11

**Type**: architecture (design-decision + impl)  ·  **Phase**: misc  ·  **Status**: Open
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
