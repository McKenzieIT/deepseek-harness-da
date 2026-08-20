# P7b — phase-gate 生产硬化

**Type**: prototype
**Phase**: 3
**Status**: In progress — claimed 2026-08-20 (wayfinder-session); was Unblocked（P13 resolved 2026-08-20——GENERATION critic 形态已定：方案 1 薄 regex + 方案 4 轻量 JSON path 解析，node-sql-parser 不引；P7 sqlglot stub 可替换为真 critic）
**Assignee**: wayfinder-session 2026-08-20

**Question**: 把 P7 validated 的四阶段 preset + phase-gate 编排硬化为生产：真 `packages/phase-gate/`（TS、Schemastery、真实 Cordis `ctx.on`/`ctx.tools.guard`/`ctx.systemPrompt.assemble`/`ctx.agents`/`installAgentLlmTarget`）+ 真 `apps/cli/config/agent-presets/data-agent/agent.cordis.yml`（或 out-of-tree）+ 解注释 `packages/bundle/data-agent/cordis.patch.yml` 的 phase-gate insert 行；解 P7 surfaced 的 6 finding（F1-F6）。

**From P7（resolved 2026-08-20）**：8 决策（D1-D8）+ prototype `../prototypes/p7-four-phase-preset/` 8 场景全绿 + 6 finding（F1-F6）见 `../tickets/phase-3/P7-four-phase-preset.md` Finding/Design。生产形态草图见 `../research/p7-four-phase-fit-to-da.md` §4（preset overlay 行 + phase-gate 插件 6 hooks + per-agent 状态）。

**6 finding（P7b 须解）**：
- **F1 forced_load 程序化调工具**：harness 是否有 `ctx.tools.execute` 程序化路径 + 是否经 guard？P7 stub 经 guard（in-phase 放行）；真 harness 须验（forced_load 在 UNDERSTANDING 完成时程序化补调检索工具，绕过模型，保留 rbi 顺序 for-await + 单 `wait_for` 整批语义——research §3e 适合度：中）。
- **F2 SQL 同源**：GENERATION `sql_syntax_gate`（生成期语法）与 EXECUTION guard chain（执行期资源/安全）是不同层，须保「被评审的 SQL 恒等于被执行的 SQL」（rbi `extract_sql_candidate` 原则）。
- **F3 stall watchdog**：rbi `_watch_for_stall`（300s 无事件，排除 `ctx.awaiting_input`）在 harness 无原生→phase-gate 插件须设独立 timer。
- **F4 question-scoped 计数器**：rbi「per_turn」预算 = per 用户问题 = per harness kick（多 turn）。`turn/start` **不得**重置 llm/exec/fallback 计数器（会破预算）→ 须 question-start seam（或检测首 turn / `current_phase`→UNDERSTANDING）重置。
- **F5 llm 计费点**：在 `llm/stream`（流开始）计，**非** `agent/request`（waterfall 重试可能不产真实 LLM 调用）。
- **F6 step max_steps**：harness 无原生 step/turn 预算（§3.2#4）；P7 stub 仅在 turn-stopping 模型预算——per-step 上限（rbi `AgentLoop.max_steps`=20/30）须 per-step hook。

**前置/衔接**：P13（**resolved 2026-08-20**——GENERATION critic 形态已定：方案 1 薄 regex 守卫 + 方案 4 轻量 JSON path 解析，挂 `agent/turn-stopping` 返 `GateResult` 对齐 `phases.py:33`，node-sql-parser 不引留 P14+，见 P13 Finding/Design）= ~~主 blocker~~（已解）；其余 data 插件包（P4 `query-tool` consumer Not-yet-specified / P5 / P9 / P10）随各自 ticket 发包后接入 preset 行。persona 拆 `dsh-data-persona` 包（P7 D2 留口）。G1（Pipeline vs goal/todo）随 P7 已解锁，可平行实验对比。
