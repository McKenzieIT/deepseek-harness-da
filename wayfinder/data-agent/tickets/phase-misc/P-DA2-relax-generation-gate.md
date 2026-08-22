# P-DA2 — GENERATION 闸门过渡放宽（critic 工具未 ship 前）

**Type**: prototype（小）
**Phase**: misc
**Status**: resolved (2026-08-21, prototype landed + green — generationGate 加 criticToolsRegistered() 探测：critic 工具未注册时跳过 last_critique/last_quality floor 检查、只靠 folded sqlSyntaxGate；注册后回紧. 机制=config flag(默认 false)+best-effort ctx.tools.get 双探, flag 优先.)
**Graduated from**: [G-DA2](G-DA2-intent-confidence-router.md) Q4（scoped 出 乙′——乙′ 只管 UNDERSTANDING 路由，GENERATION 放宽单开）
**Assignee**: (unclaimed)

## Question

`phase-gate.ts` `generationGate` 今天在 folded `sqlSyntaxGate`（nl2sql-engine，已 ship，正则+JSON-path）之后**强求** `s.last_critique`/`s.last_quality`（来自 `critique_sql_tool`/`evaluate_sql_quality`，**未 ship**）→ 闸门恒 fail → GENERATION 死、grounded query 永远到不了 EXECUTION（P4c 已 DONE）。过渡放宽：critic 工具未注册时，gate 只靠 folded `sqlSyntaxGate`（+ `candidate_tables`/`event_params`/`partition_cols` 校验，已 captureToolData），不强求 `last_critique`/`last_quality`；待 critic 工具 ship 后回紧。

## 现状（代码事实）

`generationGate`（`packages/data/phase-gate/src/phase-gate.ts`）：
```
const gate = sqlSyntaxGate(s.phase_output, criticCtx)   // folded，已 ship
if (!gate.passed) return fail(gate.reason)
if (s.last_critique === null) return fail('critique not run (critique_sql_tool missing)')   // ← 恒 fail
if (s.last_critique < floor) ...
if (s.last_quality === null) return fail('quality not run / not evaluated (evaluate_sql_quality missing)')  // ← 恒 fail
if (s.last_quality < floor) ...
return pass()
```
`critique_sql_tool`/`evaluate_sql_quality` 在 `agent.cordis.yml` preset **注释**（未 ship）→ `last_critique`/`last_quality` 恒 null → GENERATION 恒 fail → 5 retry → fallback UNDERSTANDING → `honest_decline`。grounded query 即便 P-DA1 路由对了也死在 GENERATION。

## Spec

- 探测 critic 工具是否注册（`ctx.get('tools')` 查 `critique_sql_tool`/`evaluate_sql_quality` 是否 callable，或 preset 标志位）。
  - **未注册（过渡期）**：gate 跳过 `last_critique`/`last_quality` 检查，只靠 `sqlSyntaxGate`（+ candidate/event_params/partition 校验）判 pass/fail。grounded + 语法过 → pass → 进 EXECUTION（P4c 真跑）。
  - **已注册（critic ship 后）**：回紧——`last_critique`/`last_quality` 必跑 + floor 检查（rbi 忠实）。
- 加性、可回滚：未注册分支是 fallback，注册后自动回紧，无双行为。
- `max_attempts`/`fallback_phase` 不变。

## 前置 / 阻塞

- 无：phase-gate 已 ship；P4c EXECUTION 真（case 037→4336）。
- 与 P-DA1 正交：P-DA1 修 UNDERSTANDING 路由（让 grounded query 进 GENERATION）；P-DA2 修 GENERATION 闸门（让它能 pass 到 EXECUTION）。两者合 = grounded query 可端到端跑到 EXECUTION（仍卡 INTERPRETATION 交付——present_* 未 ship，见 readiness #3）。

## 验收

- critic 未注册时：grounded + 语法过的 SQL → `generationGate` pass → `query_data` 真跑 ODPS（P4c）→ 3-state QueryOutcome 驱动 EXECUTION。
- critic 注册后：自动回紧，`last_critique`/`last_quality` floor 检查生效。
- per-pkg tsc + vitest + verify-cordis-config 全绿；additive。

## Out of scope

- ship critique_sql_tool/evaluate_sql_quality（→ readiness #3）；INTERPRETATION 交付工具（present_*，→ readiness #3）；corpus 激活（→ D2f）；P-DA1 的 UNDERSTANDING 路由。
