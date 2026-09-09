# T1 — Execution grader 实现

**Type**: task  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: [G1](G1-exec-grader-seam.md)（resolved 2026-09-07）、[G1b](G1b-ground-truth-lifecycle.md)、[T11](T11-loader-provenance-strip.md)、[G10](G10-harness-bhe-split.md)（仅落包位置）、GA-EVAL-CASESET-EVENT-ANCHOR（仅 re-baseline 口径）
**Blocks**: [R23](R23-comparator-policy-mutation-baseline.md) → GA-EVAL-EXPAND → {R12 / R17 / G9}
**Mode**: AFK（**攒批落包：T11 + T1**，G10 定完可并入 T9；见 [playbook](../playbook.md) §4 T-攒批规则）
**Branch**: `feat/T1-exec-grader-impl`

## Question

按 [G1](G1-exec-grader-seam.md) 锁定的 6 条决策实现 execution grader：单一 executor 端口、三事实分离、provenance 由 grader 装配、截断与耗时自己观测。

## G1 锁定的 6 条（实现契约，不重开）

1. **三事实分离** —— 模型错 / 仓库没答 / judge 意见，各自独立记录，任一不得覆盖另一。
2. **execution 是主裁决** —— LLM judge 单独报告，永不覆盖 execution mismatch。
3. **gold/reference SQL 执行失败 = benchmark 基础设施失败** —— 不给候选模型记 0 分。
4. **端口是一个函数** —— `(sql) => Promise<ExecutionResult>`；host 交 capability 不交 verdict；不直接依赖 `MaxComputeQueryEngine`，不经 `query_data` rendering 层评分。
5. **provenance 由 grader 装配** —— `ExecutionResult` 只装 executor 真观测到的（rows / columns / rowCount / 截断信号 / 实际执行的 SQL / provider `failureKind` / 耗时）；snapshot id、comparator policy id+version、raw/normalized digest 由 grader 从 run config + case 组装成独立 evidence 记录。
6. **截断与耗时自己观测** —— 不透传 provider 的 `truncated`（恒 `false`）与 `durationMs`（恒 `0`）；耗时由 adapter 在调用两端量 wall-clock。

## 验收面（G1 决议原文）

- 单一 executor 端口；`QueryResult` 与 `eval-cli`/`eval-runner-service` 两份 fork 退役（两份 fork 的退役已由 [promote-eval-cli-adapters](../../../.agents/notes/proposed/simplification/2026-09-03-promote-eval-cli-adapters-to-eval-runner.md) 独立提出）。
- 产物 JSON 中三事实可分辨；**infra 失败不进 `wrong` 分母**。
- 比较失败原因不得压成 boolean —— 现 `packages/eval/eval-runner/src/runner.ts:368-369` 丢掉了核心比较器返回的 `AssertionResult.detail`。
- 一次评分可重放：记录实际执行的 SQL、snapshot id、policy version、raw/normalized digest。现 `runner.ts:257` 把证据截到 5 行，不足以重放。
- **截断信号实测，不是假设** —— 用已知超大结果集实测 `rowCount`（取自 maxc 自报的 `row_count`，`packages/query/query-maxcompute/dev/maxc-sidecar.mjs:100`）是否与 `rows.length` 分叉。分叉则成立；不分叉则 eval 无截断信号，回落「透传 + 开 provider 缺陷票」。
- 回归集覆盖 R1 §6 清单：重复行、NULL vs 0、浮点边界、字符串数字、列排列、额外列、有/无 `ORDER BY`、多个 accepted result、超时、gold failure、单快照假阳性。
- 按 [playbook](../playbook.md) 的 T-伴随-eval 规则跑一次 eval 并记入 `../research/experiment-audit-log.md`。**第一批用 T11 的 39-case 对账重跑**（须复现 event MATCH=2/STALE=16 + DWS 13/0），不是 k11-v2 全量 pass_rate。

## 两处行为变化，不是纯重构 —— 必须带 re-baseline

采纳核心的 `mapQueryOutcome` 会改变结果，T1 须**预期并记录**这两处，不得当作回归失败：

1. **列语义冲突** —— `mapQueryOutcome` 的 `zipRow` 按**列名** key（`packages/eval/eval/src/classify_failure.ts:115-124`），而 runner 私有 `checkResultMatch` 按**位置** key `col${i}`（`runner.ts:360-367`，注释理由是 aliases 因模型/方言而异）。二者直接矛盾；凡模型用了不同别名的 case 都可能翻面。这是 R1 §4.2 `column_semantics` 的决策点，值由 [R23](R23-comparator-policy-mutation-baseline.md) 定。
2. **pending → 不计分** —— sidecar 等待窗口默认 60s，而 event-view 查询实测 **68s**（`maxc-sidecar.mjs:134-140`），超窗即 promote 成 pending，`mapQueryOutcome` 判 `patience` refuse。**event case 会从 `wrong` 变成不计分，分母会变。** 与 GA-EVAL-CASESET-EVENT-ANCHOR 的口径决策耦合。

## 不在本票范围

- case migration 与 expected 值重新派生（[G1b](G1b-ground-truth-lifecycle.md)）。
- 包边界重切（[G10](G10-harness-bhe-split.md) → T9-bhe-split-impl）。**T1 不得顺手决定 grader 落哪个包**——那会推翻 G1 的移交。
- comparator 默认值与容差（[R23](R23-comparator-policy-mutation-baseline.md) 提供 mutation 证据）。
- loader 保住 provenance（[T11](T11-loader-provenance-strip.md)，同批但独立验收）。
- judge 侧的任何改动（方向 2/3/8）。
