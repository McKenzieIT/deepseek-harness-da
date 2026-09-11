# G15 — Dynamic data evaluation lifecycle

**Type**: grilling  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: [G10 — Harness Benchmark/Harness/Environment 拆分](G10-harness-bhe-split.md)、[G5 — Dynamic case pipeline](G5-dynamic-case-pipeline.md)
**Blocks**: [R21 — 跨 slice 与跨时间 Goodhart audit](R21-goodhart-audit.md)
**Mode**: HITL
**Branch**: `grilling/G15-dynamic-evaluation-lifecycle`

## Question

Production canary、rolling benchmark 与周期冻结的 fresh cohort 应是三种独立 product/evaluation lifecycle，还是共享一个带明确 temporal/cohort policy 的协议；各自允许什么 Environment assurance、expected resolution、publication claim 与跨时间比较？

## Must decide

- Operational canary vs formal benchmark claim boundary.
- Rolling data/case mutation, cohort sealing and historical replay.
- Fresh eligibility、collection/freeze/unblind timestamps and contamination controls.
- Which lifecycle can enter baseline、headline、Goodhart delta or only diagnostics.
- Relationship to G5 dynamic case production and R21 chronological audit.
