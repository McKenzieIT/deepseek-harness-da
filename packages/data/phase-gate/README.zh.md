# @deepseek-ai/dsh-phase-gate

[English](README.md) | 中文

DeepSeek Harness data agent 的四阶段 phase-gate 编排插件。实现 RBI `DataAgentPipeline`（UNDERSTANDING -> GENERATION -> EXECUTION -> INTERPRETATION），在 harness Cordis 事件接缝上重新表达（additive-only，无 core 变更）。

## 概述

一个 function plugin（`apply(ctx, config)`），在 agent 事件系统上注册 7 个 hooks：

- `ctx.tools.guard` — 按阶段的硬 tool 白名单
- `agent/turn-stopping` — 阶段转换、critic gate（GENERATION）、stall 看门狗、预算执行
- `tools/post-execute` — 捕获 tool 结果到状态（candidate_tables、event_params、partition_cols）
- `agent/request` — 按阶段的推理力度
- `system-prompt/assemble` — persona 注入 + 动态阶段指令
- `llm/stream` — LLM 调用计数（F5）
- `agent/pre-step` — 步骤计数 + max_steps 执行（F6）

## 关键设计决策

- **Critic 委托给 `@deepseek-ai/dsh-nl2sql-engine`** — `sqlSyntaxGate` + `extractSqlCandidate` 来自 nl2sql-engine 包（P13b Q2 边界：critic 在 nl2sql-engine，phase-gate 委托，单向无环）。
- **经副作用控制** — `agent/turn-stopping` 是 `serial` 返回 `void`；控制通过修改 per-agent 状态 + `agent.inject(message)` 实现 within-turn 重试 / 阶段推进。
- **F2 SQL 同源** — GENERATION `extractSqlCandidate` 捕获到 `last_sql`；EXECUTION `query_data` post-execute 验证 `sql === last_sql`。
- **F4 question-start** — `agent/status` idle->running 重置 question-scoped 计数器（非 `turn/start`，后者会破坏跨多 turn kick 的预算）。

## 验证

```sh
tsc -b packages/data/phase-gate/tsconfig.json   # typecheck
pnpm vitest run packages/data/phase-gate         # 14 specs
pnpm verify-cordis-config                        # preset mount resolves
```

## Model Experience

### System prompt assembly

#### What the model sees

`system-prompt/assemble` waterfall hook 委托下游，然后追加式地附加一个 base persona shadow section 和一个按 `current_phase` 键控的动态 `phase-instruction` section（GENERATION 期间还有 `sql-conventions` section）。终止阶段（`DECLINED`/`COMPLETE`）钳位到 UNDERSTANDING，使指令集永不为空。base persona 在整个运行中固定；phase instruction 在每次推进或回退时切换。

##### Base persona

```markdown
You are a data agent for a per-game analytics platform. You answer natural-language data questions over a semantic layer (events/tables/terminology) by running a four-phase pipeline: UNDERSTANDING → GENERATION → EXECUTION → INTERPRETATION. Follow the per-phase instructions injected at runtime. If you cannot answer, emit a honest decline (the 【incomplete】 marker in INTERPRETATION); never fabricate tables, fields, or results.
```

#### Token effect

persona、phase-instruction 和 SQL-conventions section 每个请求添加一个有界的固定长度 system-prompt token 块；它们不随对话历史增长。

#### KV Cache effect

base persona 在整个运行中恒定，扩展可复用缓存前缀；`phase-instruction` section 在阶段转换时重写，使从该 section 起的缓存失效。

### Per-phase tool whitelist

#### What the model sees

`ctx.tools.guard` hook 在执行前硬拒绝任何 `name` 不在当前阶段 `PHASE_TOOLS` 白名单中的 tool 调用，返回诸如 `phase-gate: "query_data" not in understanding whitelist [...]` 的理由。因此模型将活跃阶段体验为调用成功的 tool 集合；阶段外调用仅返回拒绝反馈，而非 tool 结果。

#### Token effect

被拒绝的调用仅计拒绝反馈 token（被门控的 tool 永不执行）；被允许的调用计正常 tool 结果 token。

#### KV Cache effect

被拒绝调用的反馈作为 tool-result 消息返回，仅追加扩展上下文，不使前缀失效。

### Per-phase reasoning effort

#### What the model sees

`agent/request` waterfall hook 委托下游，然后按 `REASONING_EFFORT` 映射将 `reasoningEffort` 覆盖为 UNDERSTANDING 和 GENERATION 的 `high`、EXECUTION 和 INTERPRETATION 的 `medium`。模型不会将其视为文本；它将其体验为当前阶段的逐调用思考预算。

#### Token effect

effort 拨盘改变每次调用的 reasoning-token 预算；不改变可见的 prompt 或结果 token 计数。

#### KV Cache effect

无直接影响；reasoning effort 不改变请求前缀，故缓存前缀不受 effort 拨盘本身影响。

### Phase transition and retry injections

#### What the model sees

`agent/turn-stopping` serial hook 通过副作用驱动控制：gate 通过时 `agent.inject` 一条 `[phase advance → GENERATION]` user 消息；预算内 gate 失败时注入 `[phase ... retry]` 纠正；回退时注入 `[fallback → ...]` 引导。模型将这些视为普通 user-role turn，保持 kick 存活并指导下一步。

#### Token effect

每条注入消息向对话历史添加一条短的固定 user-role turn；计数随 per-kick 预算（`max_fallbacks`、`max_state_turns`）内的阶段推进、重试和回退扩展。

#### KV Cache effect

注入的 user 消息仅追加；阶段推进时的任何缓存失效来自同时发生的 `phase-instruction` 重写，而非追加的消息。

## Known Limitations and Deferred Work

- **F1 forced_load 粒度** — `ctx.tools.execute` 程序化分发检索工具在 UNDERSTANDING 完成时（候选为空时）触发；更细的自动连线启发式延期。
- **B10 — `onRequest` 类型** — `LlmCallConfig` vs `GenerateOptions` 类型细微差异；tsc green（类型兼容）但 `adapterDefaults` 交互延期。
- **B11 — `step_count` 执行** — 步骤计数递增但 `max_steps` 硬执行未连线（dead-ish）；延期。
- **B13 — `onLlmStream` 辅助流跳过** — 跳过 `options.purpose` 辅助流（compaction/session-title）需验证 `llm` 类型的 `purpose` 字段；延期。
- **Persona 包抽取** — phase-gate 完全管理 persona（base + 动态阶段指令）；抽取为独立 `dsh-data-persona` 包是 D2 留口（延期）。
- **`honest_decline` 用户面交付消息** — 模型阶段指令覆盖常见情况；专用 inject-decline 消息延期。
- **Type-aware oxlint findings** — 完整 oxlint 的 7 个非阻塞 type-aware 发现（commit 时关闭，tsc clean）；延期打磨。
