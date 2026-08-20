# P7b — phase-gate 生产硬化

**Type**: prototype
**Phase**: 3
**Status**: Resolved (2026-08-20, wayfinder-session); was Unblocked（P13 resolved 2026-08-20——GENERATION critic 形态已定：方案 1 薄 regex + 方案 4 轻量 JSON path 解析，node-sql-parser 不引；P7 sqlglot stub 可替换为真 critic）
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

**P13b critic API available (2026-08-20)**：`packages/data/nl2sql-engine/` ships `critiqueSql(sql, guardCtx)→CriticResult` + `sqlSyntaxGate(phaseOutput, ctx)→GateResult` + `GateResult` type + `CriticCtx` guard-data 契约（`candidateTables`/`eventParams`/`partitionCols`，`makeCriticCtx`）。P7b phase-gate `sql_syntax_gate` slot delegate 到 `sqlSyntaxGate`（or `critiqueSql` 若 P7b 自抽 SQL）；guard-data 从 session tool results 组装（search_data_sources 候选 + load_event_definition params）。Package `@deepseek-ai/dsh-nl2sql-engine`（bundle `cordis.patch.yml` nl2sql-engine row 已接）。search_data_sources model-facing tool 经 ctx.tools 注册=P13b deferred sub-item（需 dsh-tools API grounding；P7b 或 follow-up 接）。

## Finding / Design (resolved 2026-08-20)

4 决策（grilling 推荐→确认）+ 真 `packages/data/phase-gate/`（mirror P8b/P4b 先例：`Service extends` 形态的函数插件 `apply(ctx,config)` + `@deepseek-ai/schemastery` `Config` + `declare module` Events/Context 增强 + `ctx.effect` teardown）+ 真 preset + P13 critic fold。prototype grill 锁决策，build 期对真实 vendored Cordis（`packages/core/agent/runtime-types.ts` Events 接口 + `agent.ts` call sites + `system-prompt/tools/llm` 源）核验所有 seam 签名。

**4 决策（grilling）**：
- **Critic fold**：内置 `packages/phase-gate/src/critic.ts`（P13 方案 1 薄 regex + 方案 4 轻量 JSON path，替 P7 sqlglot stub，挂 `agent/turn-stopping` `sql_syntax_gate` 槽返 `GateResult`）。P13b 未 ship（不能依赖未发包）；P6/P5 已 ship 但 critic 数据从 `tools/post-execute`-captured state（`candidate_tables`/`event_params`/`partition_cols`）拿→自含无 P6 依赖；P13b 以后可抽离。
- **Preset 位置**：in-tree `apps/cli/config/agent-presets/data-agent/agent.cordis.yml`（mirror `standard`，§5.1 shipped 目录，verify-cordis-config 可验）；phase-gate 作 `cordis:group`+`isolate:phaseGate` realm 行。
- **Persona**：phase-gate 全管（经 `ctx.systemPrompt.section` 注册 base persona `PERSONA_SECTION` 影 deployment + `system-prompt/assemble` waterfall 动态注 `_PHASE_INSTRUCTIONS` 按 `current_phase`，option C，无 `complete:true`）；不另建 `dsh-data-persona`（D2 留口，defer 抽离）。
- **F4 question-start**：`agent/status` emit `idle→running`（kick-start=新用户问题）重置 question-scoped 计数器。原选「next-turn inbox insert」核验后**改**——`agent/inbox/inserted` payload 仅 `{message}` 无 FIFO target，无法区分 followup vs steer；fallback 到 `agent/status` idle→running（steer mid-kick 不经 idle）。

**控制流精炼（surfaced reading `agent.ts`，关键）**：`agent/turn-stopping` 是 `serial` 返 `Promise<void>|void`——agent-loop **丢弃 return**（仅 await + 查 abort）。故 P7 stub 的 return-based 控制（`{kind:'retry'|'advance'|...}`）**不映射**；生产控制改**副作用**：mutate per-agent state（下步 guard/assemble 读新 phase）+ `payload.agent.inject(message)` 续航下 phase / within-turn retry（inject=send next-step no-wakeup，driver 已在 turn-stopping 运行→注入保 kick 活）+ `honest_decline`（state，no inject→kick ends，M4 非 cancel；cancel 留外部 user-stop/stall）。

**F1-F6 解**：
- F1 forced_load：`ctx.tools.execute`（程序化分发走完整 pipeline 含 guard，README + §3.1 列其为公开 API，**验**）接 UNDERSTANDING 完成（候选空时）；`ToolExecutionInput` `CallId` 品牌化经 `CallId()` factory。
- F2 SQL 同源：GENERATION `extractSqlCandidate` 单源捕获→存 `last_sql`→EXECUTION `query_data` post-execute 校验 `sql===last_sql`，违则 `{kind:'block',feedback}`。
- F3 stall watchdog：插件独立 `setTimeout`（300s，rbi `_watch_for_stall`）；排除 awaiting（`agent/status` idle 或 `awaiting_clarification` 标）；fire→`honest_decline` + `agent.cancel({kind:'hook'})`；`ctx.effect` teardown 清 timer。
- F4 question-start：见上决策（agent/status idle→running 重置；**非** turn/start——kick 跨多 turn）。
- F5 llm 计费：`llm/stream` stream-wrap waterfall（流开始计，`options.sessionId` keyed；**非** agent/request——waterfall 重试可能不产真 LLM 调用）。
- F6 max_steps：`agent/pre-step` 计 step + `agent/turn-stopping` 超 `max_state_turns`→`honest_decline`（harness 无原生 step/turn 预算 §3.2#4）。

**7 hooks**：`ctx.tools.guard`（硬白名单 D5）+ `agent/turn-stopping` serial + `tools/post-execute` waterfall + `agent/request` waterfall（per-phase `ReasoningEffortId`，D7）+ `system-prompt/assemble` waterfall（persona option C）+ `llm/stream` stream-wrap（F5）+ `agent/pre-step` waterfall（F6）+ `agent/status` emit（F4）。per-agent 状态 keyed per session 内部（§5.3）。

**bundle re-interpretation（surface 不符）**：ticket「解注释 `packages/bundle/data-agent/cordis.patch.yml` 的 phase-gate insert 行」——该 bundle 的 data-plugin insert 块**无 phase-gate 行**（仅 query/embedder/retrieval/semantic-layer/audit[已解注]/admin/llm-dashscope/subagent-qoder）。按 §4.2B，phase-gate 是 **agent 平面**插件（`setup(agentCtx)` 注册），挂 **preset**（`agent.cordis.yml` isolate realm），**非 bundle**（host-plane service）。故重新释为「在 preset 加 phase-gate 行」。P7b 顺带修一处 **P2 遗留**（pre-existing，git 确认非本 ticket regression）：`web-app`+`data-agent` 两 bundle 的 `cordis.patch.yml` 都解注了 `llm-dashscope` 但其 `package.json` 未声明该 dep（P2 漏）→ `verify-cordis-config` 阻；P7b 加 dep 解锁（additive，1 行/包）。

**Verify（全绿）**：host `tsc -b packages/data/phase-gate/tsconfig.json` typecheck-clean；`vitest` 16/16 scenario（port P7 8 场景 + critic 单元：advance/guard-reject/forced_load/retry/budget-decline/execution-fallback/INTERPRETATION-incomplete/F2-block/F4-reset/assemble-inject + critic extract/table∉/JSON-field∉/SELECT*/ds）；`pnpm run verify-cordis-config` 124 config files passed；commit-time `oxlint --config .oxlintrc.staged.json`（typeAware false）0 error。full `oxlint`（.oxlintrc.json, typeAware true）7 type-aware 非阻塞 finding（off at commit，tsc clean）——defer polish。

**Surfaced（→Not-yet-specified / follow-up）**：7 type-aware oxlint finding（polish）；honest_decline 用户面交付消息（model phase 指令覆盖常见；inject-decline 延后）；forced_load auto-wire 细化（现接 UNDERSTANDING 完成，候选空时）；ctx.tools.execute 签名验（已验存在+经 guard）。

**Assets**：`packages/data/phase-gate/`（src/{types,critic,phase-gate,index,invariant}.ts + tests/phase-gate.spec.ts + package.json + tsconfig.json）+ `apps/cli/config/agent-presets/data-agent/agent.cordis.yml` + `tsconfig.host.json`(+ref) + `packages/bundle/{data-agent,web-app}/package.json`(+llm-dashscope dep, P2 遗留修) + `pnpm-lock.yaml`。真 critic 生产接线 fold 此处；P13b（NL→SQL 引擎生产 `packages/nl2sql-engine/`）仍 unblocked，其 critic 可从此抽离或共用。G1（Pipeline vs goal/todo）随 P7 已解锁。
