# R23 — Comparator-policy mutation baseline

**Type**: research (experiment)  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: T1-exec-grader-impl
**Blocks**: [GA-EVAL-EXPAND — 扩充 eval 集以获得可用统计功效](../../data-agent/tickets/phase-misc/GA-EVAL-EXPAND-case-set-power.md)
**Mode**: AFK（按 [playbook](../playbook.md) 走 SPEC → instruction + rubric → 另一环境）
**Branch**: `research/R23-comparator-policy-mutation-baseline`

## Question

在 T1 提供可重放 execution grader 后，逐 case comparator policy 的哪些组合能以最低 false accept / false reject 区分语义错误与表示差异，并为 G1b 决议中预留的 policy defaults 以及 GA-EVAL-EXPAND 的 case migration 提供可量化默认值与显式例外依据？

实验必须通过 evaluation adapter 复用 dsh-data-agent 的 `@deepseek-ai/dsh-query` / `ctx.query.execute`，不得实现第二套 warehouse executor。变异集至少覆盖 set / bag / sequence、重复行、NULL 与零、整数/浮点/decimal 边界、字符串数字 coercion、列重排、focused columns、额外列、有序/无序问法、多个 accepted artifacts、gold execution failure、candidate timeout/error 与单 snapshot accidental match。

主要输出是 false-accept、false-reject、各 policy 的 mutation rejection、gold replay stability 与 policy-specific ambiguity counts；必须保留 case、snapshot、policy version、raw/normalized artifact digest 和执行失败证据。数值逐字写入 [`research/experiment-audit-log.md`](../research/experiment-audit-log.md)，并显式记录 production query adapter 与 shipped grader 的 fidelity 差异。本票只产实验结论，不修改 comparator policy、case set 或 SQL execution provider。
