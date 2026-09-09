# R10b — Benchmark adapter parity、interface censoring 与 run isolation 认读

**Type**: research  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: 无
**Blocks**: [G10 — Harness B/H/E 拆分](G10-harness-bhe-split.md)
**Mode**: AFK
**Branch**: `research/R10b-harness-measurement-validity`
**Scout**: [`../research/g10-2026-followup-papers.md`](../research/g10-2026-followup-papers.md)

## Question

Harbor Adapters/Harbor-Index、Interface-Induced Trajectory Censoring、Outcome Finality and Cross-Unit Separation 与 HarnessDev 对 G10 的共享 task-material protocol、Benchmark Adapter、Harness identity、Environment finality 和 cross-run isolation 提出了哪些一手约束？哪些要求必须进入 G10 的接口与 T9/T12 验收，哪些只是特定 benchmark 的实现选择？

## 必须回答

- Legacy benchmark adapter 如何证明与原实现 parity，而不只是“能加载”。
- Oracle/reference、hidden tests、solution 与 comparator policy 分别由谁拥有，怎样与 Harness 隔离。
- Raw emission、parsed action、execution、observation 和 grader evidence 是否需要成为持久化阶段。
- Template/parser/tool schema 的组合 preflight 怎样定义失败语义。
- Outcome finality、pending effect、namespace/reset/cleanup 与 cross-run separation 如何进入 Environment interface。
- Harness artifact/version、runtime model 和 heldout transfer 怎样进入 run identity。

## 待认读一手来源

- Harbor Adapters and Harbor-Index (`2609.04298`)
- Interface-Induced Trajectory Censoring (`2609.03966`)
- When Is an Agent Evaluation Over? Outcome Finality and Cross-Unit Separation (`2608.14940`)
- HarnessDev (`2609.01437`)
- DAREBench (`2609.06059`，evidence-audit 旁证)
- Evaluation Context Protocol (`2608.19263`，wire-protocol 旁证)

## 产出

`../research/harness-measurement-validity-papers.md`。严格区分来源事实与本仓设计推论，并给 G10 输出一份新增/修订验收清单。
