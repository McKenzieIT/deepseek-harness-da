# R9 — Multi-engine execution failure taxonomy 一手认读

**Type**: research  ·  **Status**: open
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
