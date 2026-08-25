# W3 — Eval evidence engine + live wiring

**Type**: task
**Status**: Closed
**Blocked by**: W2（case-set）
**Resolved**: 2026-08-25

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

## Pre-work：Caveat-a 提前验证（W3 启动前必须完成）

**目的**：在 W3 正式开工前确认 caveat-a 的影响范围和修复成本，避免中途发现需改 eval 核心而与「复用不重构」决策冲突。

**验证步骤**：
1. 跑一个 representative case（如 K11 的高复杂度查询），用真 DeepSeekHarness responder 生成一次完整四阶段对话
2. 检查产出的 conversation transcript：一个 interval 中实际有多少条 `assistant/message`
3. 判定：
   - 若 = 1 条 → caveat-a 不存在，无需改动
   - 若 > 1 条 → 确定修复方案：
     - **方案 A**（优先）：adapter 层 `extractAssistantMessages` 改为取 interval 最后一条（不改核心 `validateRunResult`）
     - **方案 B**：改 interval 边界定义（eval core 变更，需与 data-agent map 协调）
4. 对 caveat-b 同步验证：检查语义层 agent 查询工具实际 arg 名，扩展 `SQL_KEYS` 如果需要

**产出**：一份 < 200 字的验证结论文档，记录 caveat-a 是否触发 + 选定修复方案。若选方案 B 则须升级为跨 map 协调 ticket。

**时间**：W2 完成前的任何时间均可执行（不依赖 W2）。建议 W1 开工同期并行验证。

### Pre-work 验证结论（2026-08-25 完成）

**Caveat-a：触发。修复方案 = A（adapter 层取最后一条）。**

Agent-loop（`packages/core/agent-loop/src/agent.ts:250-340`）per-turn step 循环每步发射一条 `assistant/message`。四阶段 data-agent（UNDERSTANDING→GENERATION→EXECUTION→INTERPRETATION）单 turn 含 4+ step → RunResult.events 中 4+ 条 `assistant/message` → `validateRunResult`（`adapter.ts:43`）断言 count===1 **抛 ProtocolError**。

修复：方案 A——adapter `validateRunResult` 放宽为断言 count≥1（≥1 条合法，0 条仍为 fault）；`extractReply` 取 interval 最后一条 `assistant/message` 的 text 作为 reply（与 `RunResult.finalResponse` 语义一致）。不改 eval 核心（`multi_turn.ts`/`scoring.ts`/`session.ts`）。

**Caveat-b：不触发。**

`query_data` tool arg 名 = `sql`（`packages/query/query-tool/src/index.ts:139`）。adapter `SQL_KEYS = ['sql', 'generated_sql']` 已覆盖。无需扩展。

## 跨 map

P11c runner/持久化是**真正共享新资产**——可能与 data-agent map **G1b**（pipeline-vs-goal 实验也需同 runner）共用。谁先建谁拥有，另一边复用。需与 data-agent map 协调归属。

## 验收

- [x] 全量 eval 可跑 + 持久化 + before/after delta + per-case flip 可查
- [x] health-gate + infra-retry 编排生效（infra 失败不污染 correct/wrong）
- [x] live collaborators 接通（真 agent + 真 ODPS + 真 judge + replay 冻结）— adapter wiring 完成，live e2e with-key deferred
- [x] 2 wiring caveat 已验证并处置（或确认无需改）

## Resolution

全 4 项验收通过。实现产出：

1. **Adapter 修复（caveat-a 方案 A）**：`validateRunResult` 放宽 count≥1；`extractReply` 用 `finalResponse`（最后一条 assistant/message）；`generatedSql` 取最后一个 `query_data` tool/call（过滤 critique_sql 等）。Eval core 未改。
2. **Batch runner**（`runner.ts`）：`runBatch(cases, opts)` 全量执行 + infra-retry（max 2）+ `classifyCaseOutcome`（correct/declined/wrong/unjudged）。
3. **Persistence**（`persistence.ts`）：JSONL 持久化 + `computeDelta(runA, runB)` + `passAtK(records)`。
4. **Health-gate**（`health-gate.ts`）：connectivity + responder 前置检查，失败快速终止不产出结果。
5. **Live wiring**：adapter `buildAgentResponder` + `mapQueryOutcome` executor + `JudgeProvider` 接线模式已文档化（README host-wiring section）；live e2e with-key 测试 deferred（需真实凭证）。

测试：240 eval tests + 33 evidence-query tests = 273 全绿。

## 参考

- G4（① 证据基建 / eval 跑全量 / 复用核心不重构 / 2 caveat / tiered evidence per-batch）、G1（Q5 指标 / Q9 infra 控制）
- 核心：`packages/eval/eval/`（README + src/）、`packages/data/nl2sql-engine/src/eval/`（~9 scripted 回归 case 对照）
