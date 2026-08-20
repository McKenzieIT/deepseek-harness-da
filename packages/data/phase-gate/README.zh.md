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

## Known Limitations and Deferred Work

- **F1 forced_load 粒度** — `ctx.tools.execute` 程序化分发检索工具在 UNDERSTANDING 完成时（候选为空时）触发；更细的自动连线启发式延期。
- **B10 — `onRequest` 类型** — `LlmCallConfig` vs `GenerateOptions` 类型细微差异；tsc green（类型兼容）但 `adapterDefaults` 交互延期。
- **B11 — `step_count` 执行** — 步骤计数递增但 `max_steps` 硬执行未连线（dead-ish）；延期。
- **B13 — `onLlmStream` 辅助流跳过** — 跳过 `options.purpose` 辅助流（compaction/session-title）需验证 `llm` 类型的 `purpose` 字段；延期。
- **Persona 包抽取** — phase-gate 完全管理 persona（base + 动态阶段指令）；抽取为独立 `dsh-data-persona` 包是 D2 留口（延期）。
- **`honest_decline` 用户面交付消息** — 模型阶段指令覆盖常见情况；专用 inject-decline 消息延期。
- **Type-aware oxlint findings** — 完整 oxlint 的 7 个非阻塞 type-aware 发现（commit 时关闭，tsc clean）；延期打磨。
