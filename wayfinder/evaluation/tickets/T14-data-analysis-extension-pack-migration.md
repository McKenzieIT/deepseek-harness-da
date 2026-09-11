# T14 — Data-analysis extension 与 canonical Pack migration

**Type**: task（impl，AFK）  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: [T9 — Evaluation foundations](T9-evaluation-foundations.md)、[T1 — Execution grader implementation](T1-exec-grader-impl.md)、[G1b — Ground-truth lifecycle](G1b-ground-truth-lifecycle.md)
**Blocks**: [T15 — Product Evaluation Controller 与 external CLI](T15-evaluation-controller-cli.md)
**Mode**: AFK（后端方向，本地直接做）
**Branch**: `task/T14-data-analysis-extension-pack-migration`

## Question

如何实现首个完整 data-analysis extension，并把 K11-v2/RBI legacy inputs 迁移为 canonical Benchmark Pack，使 query/report evidence、SQL/result grading、private material、policy objects 与 provenance 全部进入目标协议，而旧 schema 不再成为正常运行格式？

## Required scope

- Namespaced data-analysis evidence payloads and standard projections.
- SQL execution artifact normalization and result/report grading mechanisms consuming T1 outputs.
- `match_modes` authoring migration into explicit Benchmark-owned policy objects; shared comparator primitives carry no defaults.
- One-time legacy importer for K11-v2/RBI, canonical CaseManifest/PublicPreparedTask/GradingMaterialRef generation, and content-addressed Pack sealing.
- `validated | parity_unresolved | invalid` migration state with oracle/reference validation, matched parity, field-preservation evidence and per-case diagnostics.
- Public/private split and grader-only material repository path.

## Success criteria

- No canonical type contains K11, RBI, filename category, MaxCompute or semanticRoot defaults.
- Unknown grading/provenance fields fail loud; `expected.sql`, anchor, tier, provenance and schema lineage are preserved or rejected explicitly.
- Harness-visible Pack closure contains no private expected/reference/hidden material.
- Every migrated case has a status and evidence links; aggregate success cannot hide missing/invalid cases.
- Old percentages are declared incomparable; this ticket does not publish a new baseline.
- Old loader remains only where T1 still requires it before final cutover; formal new path resolves Packs through BenchmarkRepository.

## Out of scope

- Running the production Agent ([T15](T15-evaluation-controller-cli.md)).
- Final package deletion/cutover ([T12](T12-eval-package-consolidation.md)).
- Event-case correctness policy beyond [GA-EVAL-CASESET-EVENT-ANCHOR](../../data-agent/tickets/phase-misc/GA-EVAL-CASESET-EVENT-ANCHOR-stale-expected-values.md).
