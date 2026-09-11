# T9 — Evaluation protocol、stores 与 repository foundations

**Type**: task（impl，AFK）  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: [G10 — Harness Benchmark/Harness/Environment 拆分](G10-harness-bhe-split.md)、[T1 — Execution grader implementation](T1-exec-grader-impl.md)、[T13 — Production Context Projection capability](T13-context-projection-service.md)
**Blocks**: [T14 — Data-analysis extension 与 canonical Pack migration](T14-data-analysis-extension-pack-migration.md)、[T15 — Product Evaluation Controller 与 external CLI](T15-evaluation-controller-cli.md)
**Mode**: AFK（后端方向，本地直接做；按 [playbook](../playbook.md) §1.1）
**Branch**: `task/T9-evaluation-foundations`

## Question

如何建立 G10 决定的首版 foundation packages，使 Protocol、Grading Runtime、Evaluation Environment、Benchmark Repository、Evaluation Store 与 Artifact Store 各自拥有完整接口和本地 Provider，同时不启动真实 Agent、不迁移旧 case，也不把 data-analysis 字段写进共享 Core？

## Required scope

- Evaluation Protocol：identities、manifests、requirements/bindings、EvidenceEnvelope、Artifact/Resource refs、MetricObservation/AggregateMeasurement、ComparisonPlan、GradeRecord 与 PublicationEligibility。
- Grading Runtime：sealed cut validation、private-material authorization、mechanism registry、grader lifecycle 与 append-only rescore。
- Evaluation Environment Definition：resolve/open/EnvironmentLease、assurance、finality、separation 与 cleanup protocol。
- BenchmarkRepository Definition + local Provider：authoring directory validation、stable read、closure sealing、digest 与 public/private view。
- EvaluationStore Definition + local Provider：Run/Attempt state、evidence manifests、grades、measurements 与 publication records。
- ArtifactStore Definition + local CAS Provider：streaming bytes、digest verification、dedup、retention metadata 与 access classification。
- In-memory test Providers，以及无 SQL 的 data-engineering fixture 与无 warehouse 的 data-science fixture。

## Success criteria

- Package roles and dependencies match G10 D20–D24; Protocol imports no runtime/controller/domain implementation.
- Every capability seam has Definition, at least one Provider, one Consumer/test harness, config validation, effect-owned registration, invariants, README and focused tests.
- Unknown required evidence/identity types fail loud; ignorable extension records remain readable through standard projections.
- Benchmark local Provider rejects symlink/path escape, mutable read races, missing closure members and digest mismatch.
- Evaluation/Artifact Stores implement the sealing order and do not treat orphan bytes as a sealed cut.
- The two conformance fixtures prove Core has no SQL rows, MaxCompute, K11 or semantic-layer default.
- No product Agent, current eval CLI, current runner or default bundle is rewired in this ticket.
- Relevant focused tests, typecheck/build/hygiene smokes and documentation gates pass; report only commands run.

## Out of scope

- Production Context Projection implementation ([T13](T13-context-projection-service.md)).
- Data-analysis mechanisms and legacy case migration ([T14](T14-data-analysis-extension-pack-migration.md)).
- Product Agent execution and CLI cutover ([T15](T15-evaluation-controller-cli.md)).
- Old package deletion and external consumer migration ([T12](T12-eval-package-consolidation.md)).
