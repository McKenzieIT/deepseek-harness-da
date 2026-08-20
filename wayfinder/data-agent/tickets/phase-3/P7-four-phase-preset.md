# P7 — 四阶段 preset + phase-gate 插件

**Type**: prototype
**Phase**: 3
**Status**: Resolved (2026-08-20) — prototype validated（8 场景全绿）；生产硬化见 **P7b**（blocked by P13）
**Assignee**: wayfinder-session 2026-08-20

**Question**: 一份 preset 组装四阶段全部工具/persona/段 + 压缩（保目录稳定）+ phase-gate 插件（`guard` + `turn-stopping` + `post-execute` + `request` waterfall）。

**Research**: → `../../research/harness-agent-loop.md`（preset + agent-loop + 四阶段映射 + Q7 phase-gate）+ `../../research/rbi-purpose-arch.md`（§5 生命周期 + §7 迁移开放问题）+ `../../research/p7-four-phase-fit-to-da.md`（§1-§5 rbi 编排内幕 + 忠实 da 再表达推荐）。

## Finding / Design (resolved 2026-08-20)

fit-to-da research subagent〔`../research/p7-four-phase-fit-to-da.md`〕+ grilling 8 决策定形态；prototype `../prototypes/p7-four-phase-preset/` 8 场景全绿 validated。

**决策**（grilling）：
- **D1 交付范围**：一次性原型（`prototypes/p7-...` .mjs+harness-stub 镜像 p4/p6/p8）；生产（`packages/phase-gate/` TS + `agent.cordis.yml` + 解注释 bundle phase-gate 行）毕业 **P7b**（P4b/P8b/P12b 先例）。
- **D2 persona (option C)**：base persona 作 preset 静态 `section()`（order 0）；`_PHASE_INSTRUCTIONS`（每 phase 指令 + SQL conventions 仅 GENERATION）由 phase-gate 在 `system-prompt/assemble` 按 `current_phase` 动态注入（避免 `complete:true` 抑制其他段）。生产可拆 `dsh-data-persona`（P7b）。
- **D3 goal/todo/plan 共存**：四阶段 preset **不挂** planning group（research §5#3 两模式不混）；goal/todo/plan 包 host-plane **不禁用**（honors Q8「保留不禁用」=不 disable 包）；G1 另开含 planning group 的 preset 做实验对比（P7 解→G1 解锁）。
- **D4 phase 转换 = `agent/turn-stopping` serial**：model 自然停→turn-stopping→phase-gate 查 gate→推进/retry/fallback/decline。**非** model-driven exit_<phase>（research §3a 语义位移——rbi `sql_syntax_gate` 模型不知 gate 结果）。harness 无原生 step/turn 预算（§3.2#4）→ phase-gate 持 per-agent 计数器 + `agent.cancel`。
- **D5 gate 落地**：UNDERSTANDING/INTERPRETATION `always_pass`→no-op；GENERATION `sql_syntax_gate`→**turn-stopping 查 phase 最终文本**（非 post-execute 单工具），P7 sqlglot stub（完整 critic 留 P13）；EXECUTION `always_pass` never consulted→`ctx.query.execute` 3-state `QueryOutcome` 直接驱动（done→advance / failed→fallback GENERATION）；fallback/delivery→`tools/post-execute`。gen(语法)/exec(资源安全) 两层 gate 须 SQL 同源（F2）。
- **D6 budgets**：采用 rbi `PipelineConfig` 初始默认（max_fallbacks=2/max_subquestions=4/max_executions_per_turn=8/max_llm_calls_per_turn=60/max_state_turns=20/disambiguation_timeout=300s/forced_table_load_timeout=30s + per-phase max_attempts 5/5/1/5 + timeout 60/60/120/60s + fallback UNDERSTANDING/none/GENERATION/none），R8 evals 重定标；llm 计 `llm/stream`、exec 计 `tools/post-execute`、fallback/推进 计 `turn-stopping`。
- **D7 model 路由**：四阶段全 dashscope（P2）+ per-phase reasoning effort 经 `agent/request` waterfall；Qoder（P3）作可选委派工具（非 phase-bound，主 LLM 非 Qoder——map out-of-scope）；model route 不进 preset（`installAgentLlmTarget` seam）。
- **D8 stub 策略 = stub-isolate**：所有 per-phase 工具作 canned-result stub（按就绪矩阵命名），聚焦验证四阶段**编排**；不耦合 p4/p6/p8 throwaway 内部，镜像 p8 harness-stub；ready seam tool-name + 3-state outcome 真实化 stub。

**就绪矩阵**（rbi 工具→da seam）：ready = `ctx.query`(P4b)/`ctx.schema`(P6)/`ctx.embedder`+`ctx.retrieval`(P5)/`ctx.audit`(P8)/subagent-qoder(P3)；stub = GENERATION critic→**P13** / EXECUTION tool-query consumer→**Not-yet-specified** / UNDERSTANDING search_data_sources→P13(或薄包 P5) / INTERPRETATION 呈现交付工具→**雾** / get_user_preferences / record_template_usage。

**Validated（prototype 8 场景全绿）**：四阶段经 turn-stopping 推进✓ / guard 硬拒越界✓ / ctx.query 3-state 驱动 EXECUTION fallback✓ / budget 在 turn-stopping 取消✓ / GENERATION sql_syntax_gate 查 phase 最终文本→retry✓ / persona option C 每 phase 注入段+SQL conventions 仅 GENERATION+无 complete:true✓ / honest_decline✓ / forced_load in-phase 过 guard✓。

**Surfaced findings（→P7b）**：F1 forced_load 程序化 `ctx.tools.execute` 路径+是否经 guard（待验真 harness）；F2 SQL 同源（gen `sql_syntax_gate` vs exec guard chain）；F3 stall watchdog（300s 无事件）harness 无原生→插件独立 timer；F4 question-scoped 计数器（rbi per_turn=per 用户问题=per kick 多 turn；turn/start 不得重置 llm/exec/fallback→须 question-start seam）；F5 llm 计费在 `llm/stream` 非 `agent/request`；F6 step max_steps（harness 无原生→per-step hook 延后）。

**Assets**：`../prototypes/p7-four-phase-preset/`（types/phase-gate/harness-stub/preset/tools/run.mjs + README.md + package.json + .gitignore）+ `../research/p7-four-phase-fit-to-da.md`。真实生产包（`packages/phase-gate/` TS + 真 `agent.cordis.yml` + 解注释 bundle + 解 F1-F6）→ **P7b**（blocked by P13——GENERATION critic 生产 preset 接线）。G1（Pipeline vs goal/todo/plan）随 P7 解锁。
