# W3 — Eval evidence engine + live wiring

**Type**: task
**Status**: Open
**Blocked by**: W2（case-set）

## Question

在 `packages/eval/eval` 核心（**复用不重构**——pass_k anti-flakiness / 基建故障分类 / 执行重跑确定性 / H1·H2 mitigation / 零缝注入均已固化）之上建证据基建（G4 决议 ① 的计算半）：

1. **batch runner**：`runMultiTurnCase` 全 161 × pass_k=3，**eval 跑全量**（G4 决议；不做 affected-case 子集——catch side-effects，接受成本）
2. **持久化 + 报告**（= P11c，已 deferred）：pass_at_k + correct/declined/wrong/unjudged 聚合
3. **before/after delta + per-case flip**：哪条 case pass↔fail 翻转（喂证据面 + ③ goal-integration）
4. **health-gate + infra-retry 编排**（G1 Q9）：每 run 前连通/凭证/scope 门 + infra 失败有界重试（区别 model attempt，不计 max_attempts）+ infra 失败单独标
5. **live wiring**：真 collaborators——DeepSeekHarness responder（`buildAgentResponder`）+ `ctx.query.execute` executor（`mapQueryOutcome`）+ llm-dashscope judge（`JudgeProvider`）+ `dsh-llm-replay` snapshot（agent 冻结）

## 2 wiring caveat（接 live 时验证，可能小调 adapter 非 core 改）

- **(a) H1 单 assistant/message 断言 vs 四阶段 agent**：`validateRunResult` 断言一个 run interval 恰 1 条 `assistant/message`；shipped 四阶段 agent（UNDERSTANDING→GENERATION→EXECUTION→INTERPRETATION + sub-questions/fallback）一个 interval 可能 >1 条 → H1 可能误跳。须验证，可能放宽断言或改 interval 边界。
- **(b) `SQL_KEYS=['sql','generated_sql']`**：adapter 从 `tool/call` 读 SQL；若语义层 agent 查询工具 arg 名不同须扩 `SQL_KEYS`（adapter config 级小调）。

## 跨 map

P11c runner/持久化是**真正共享新资产**——可能与 data-agent map **G1b**（pipeline-vs-goal 实验也需同 runner）共用。谁先建谁拥有，另一边复用。需与 data-agent map 协调归属。

## 验收

- [ ] 全量 eval 可跑 + 持久化 + before/after delta + per-case flip 可查
- [ ] health-gate + infra-retry 编排生效（infra 失败不污染 correct/wrong）
- [ ] live collaborators 接通（真 agent + 真 ODPS + 真 judge + replay 冻结）
- [ ] 2 wiring caveat 已验证并处置（或确认无需改）

## 参考

- G4（① 证据基建 / eval 跑全量 / 复用核心不重构 / 2 caveat / tiered evidence per-batch）、G1（Q5 指标 / Q9 infra 控制）
- 核心：`packages/eval/eval/`（README + src/）、`packages/data/nl2sql-engine/src/eval/`（~9 scripted 回归 case 对照）
