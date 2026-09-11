# T8 — Failure normalization implementation

**Type**: task（impl，AFK）  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: [G9 — Failure normalization 与 attribution](G9-failure-classifier.md)、[T1 — Execution grader implementation](T1-exec-grader-impl.md)
**Blocks**: 无
**Mode**: AFK（后端方向，本地直接做）
**Branch**: `task/T8-failure-classifier-impl`

## Question

如何实现 G9 决定的 normalized failure facts 与 Provider adapters，替换 eval、NL2SQL 和 Query Provider 之间的三套漂移词表，使每个 failure 有权威来源、stage correlation 和统一 publication/aggregation 语义？

## Success criteria

- Core normalized facts and extension payloads match G9; closed core unions use `assertNever`, merge-extensible types use documented defaults.
- MaxCompute and PostgreSQL adapters use typed Provider outcomes where available; string parsing is localized、versioned and evidence-preserving where unavoidable.
- `classify_failure`、`infra_retry`、`verdict_mapper` and NL2SQL failure mappings no longer independently classify the same observation.
- Pending/unresolved、Environment blockage、case defect、grader failure and model execution error remain distinct through EvidenceCut and GradeRecord.
- Tests cover equivalent failures across at least two engines, unknown provider payloads, cancellation, timeout, permission, syntax and transport cases.
- Data-analysis reports can aggregate failure mix without treating non-model failures as incorrect.
