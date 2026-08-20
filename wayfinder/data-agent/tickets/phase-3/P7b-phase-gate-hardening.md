# P7b — phase-gate 生产硬化

**Type**: prototype
**Phase**: 3
**Status**: **Resolved (re-open closed 2026-08-20)**（2026-08-20, wayfinder-session re-open）。Was Resolved @ `da20cd5268`（shipped phase-gate 包 + P13 critic fold + F1-F6 + 16/16 scenario），但**非 functional**：code review（subagent `aa744f6e74e81b1db`）+ map follow-up（Not-yet-specified 末行「critic dedup P13b/P7b 并发产物」）surfaced B1/B2 CRITICAL（GENERATION gate 恒 fail + persona C 恒 UNDERSTANDING）+ critic 与 P13b nl2sql-engine 并发重复 → 同 session 一起修。原 was Unblocked（P13 resolved 2026-08-20——GENERATION critic 形态=方案 1 薄 regex + 方案 4 轻量 JSON path，node-sql-parser 不引；P7 sqlglot stub 已替换为真 critic）。
**Assignee**: wayfinder-session 2026-08-20 (re-open)

## Surfaced (re-open 2026-08-20)

code review subagent `aa744f6e74e81b1db` + map follow-up（Not-yet-specified 末行）共 surfacing（皆待 build 期对真实 vendored Cordis 源核验）：

**B1（CRITICAL）phase_output 捕获缺失**：无 hook 捕 assistant 文本 → GENERATION `sql_syntax_gate` 恒无 SQL 可评 → gate 永远 fail（现 16/16 scenario 每 gate test 手 set `phase_output` 掩盖）。修（推荐前者）：`onTurnStopping` 读 `agent.session.events` 最新 `assistant/message` 的 text 设 `s.phase_output`（`packages/core/session` Session.events，免 re-entrant stream wrap）；备选 `onLlmStream` 累 `StreamChunk` text-delta（`packages/llm/llm/src/types.ts:312` text-delta.text）stream-end 赋值。

**B2（CRITICAL）readAgentId 恒 null**：读 `context.scope.agent.id` 但 `assembleContextFor` 返 `{agent, scope:agent}`（`packages/core/agent/src/dispatch.ts:174` verified），scope 即 Agent 本身无 `.agent` → `readAgentId` 恒 null → `onAssemble` 恒注 UNDERSTANDING（persona C 坏）。修：`readAgentId` 读 `context.agent?.id`（AssembleContext 经 `@deepseek-ai/dsh-agent` augment 有 `agent?: Agent`）。

**critic dedup（map follow-up 末行，与 B1/B2 同 session）**：P13b（已 committed `37231abea0`）ship `packages/data/nl2sql-engine/src/critic.ts`——`critiqueSql(sql,CriticCtx)`/`sqlSyntaxGate(phaseOutput,CriticCtx)`/`extractSqlCandidate`/`GateResult`/`CriticCtx` + code-review-low fix #1（hasPartitionFilter scope 到每 `;`-stmt 的 WHERE 子句；P7b greedy 误匹配 GROUP BY 的 ds）+ #2（hasSelectStar 解析 select list 检 `t.*`/`SELECT a,*`；P7b 仅 `SELECT *`）。P7b `src/critic.ts` 是 P13 stub 形态缺 #1/#2。→ 去重：删/改薄 phase-gate `critic.ts` delegate 到 nl2sql-engine `sqlSyntaxGate(s.phase_output, criticCtx)`；P7b 从 post-execute-captured state（`candidate_tables`/`event_params`/`partition_cols`）组装 `CriticCtx` 传入。白捡 #1/#2 + 对齐 P13b Q2 boundary（critic 在 nl2sql-engine、phase-gate delegate、单向无环）。前置：P7b `package.json`+`tsconfig` 加 dep `@deepseek-ai/dsh-nl2sql-engine`（P13b 已 committed ✓ 可接线）。

**B3-B14（secondary，同 session 若 budget 否则 follow-up）**：B3 onPreStep/onTurnStopping enforce `llm_call_count≥max_llm_calls_per_turn`→decline；B4 captureToolData present_clarification→`awaiting_clarification=true` + resetQuestionScoped 清 false；B5 F2 两边 normalizeSql（同 extractSqlCandidate 的 `replace(/\s+/g,' ').trim()`）；B6 await forcedLoad 后 re-check `s.honest_decline_reason`/cancelled→return；B7 resetQuestionScoped 顶 clearStallTimer；B8 F2 block 路径设 `last_query_outcome='failed'`；B9 DECLINED 在新 user message 重置；B10 onRequest 类型 LlmCallConfig（非 GenerateOptions）+ 尊 adapterDefaults；B11 step_count 删或加 max_steps enforce；B12 删 AssembledSection order 字段+cast（`packages/core/system-prompt/src/index.ts:88` AssembledSection={name,text}，sort 在 waterfall 前）；B13 onLlmStream skip options.purpose auxiliary（compaction/session-title）；B14 onAssemble phase clamp DECLINED/COMPLETE→UNDERSTANDING。

**test gap（补，揭 B1/B2 掩盖）**：#1 onAssemble 真实 stub `{agent:{id:'s1'}, scope:{id:'s1'} as Agent}`（揭 B2）；#2 phase_output 真实捕获路径不手 set（揭 B1）；#3 stall fire（vi.useFakeTimers+advanceTimersByTime(300s)→honest_decline+cancel）；#4 llm/stream count+sessionId filter；#5 pre-step/request reasoningEffort；#6 fallback 耗尽→decline；#7 honest_decline no-fallback phase（UNDERSTANDING/INTERPRETATION）；#8 F2 whitespace 变体；#9 EXECUTION running/done；#10 forcedLoad re-entrant post-execute 填 candidate_tables；#11 B8；#12 B9。

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


## Finding / Design (re-open resolution 2026-08-20)

re-open 修复合并（B1/B2 CRITICAL + critic dedup + B3-B14 secondary + test gap），皆 build 期对真实 vendored Cordis 源核验：

**B1（CRITICAL）phase_output 捕获**：`onTurnStopping` 加 `capturePhaseOutput(agent, s)`——逆序扫 `agent.session.events`（`packages/core/session/src/index.ts:559` `get events(): readonly SessionEvent[]`）最新 `assistant/message`，取 `TextBlock.text`（`packages/llm/llm/src/types.ts:54`）拼接设 `s.phase_output`，免 re-entrant stream wrap（onLlmStream text-delta 备选未取）。修前无 hook 捕 assistant 文本 → `generationGate` 恒 `fail('no phase output')`（spec 每 gate test 手 set 掩盖）。

**B2（CRITICAL）readAgentId**：读 `context.agent?.id`（`AssembleContext.agent` 经 `@deepseek-ai/dsh-agent` augment，`packages/core/agent/src/runtime-types.ts`；`assembleContextFor` `packages/core/agent/src/dispatch.ts` 返 `{agent, scope:agent}`——scope 即 Agent 无 `.agent`）。修前读 `context.scope.agent.id` 恒 undefined→null→`onAssemble` 恒 UNDERSTANDING（persona C 坏）。

**critic dedup（map follow-up 末行，resolved）**：删 `src/critic.ts`（P13 stub 缺 fix #1/#2）；`generationGate` 从 state（`candidate_tables`/`event_params`/`partition_cols`）组 `CriticCtx`→调 `@deepseek-ai/dsh-nl2sql-engine` `sqlSyntaxGate(phase_output, ctx)` + `extractSqlCandidate` 设 `s.last_sql`（F2），返 phase-gate 自有 `GateResult`（`new GateResult(gate.passed, gate.reason)` 适配；两包 GateResult 结构同构 `{passed,reason}`）。`index.ts` 移除 critic re-export；`package.json`+`tsconfig` 加 `@deepseek-ai/dsh-nl2sql-engine` dep（P13b committed `37231abea0` ✓）；spec 移除 critic 单元 block（nl2sql-engine 自有 9/9）+ `sqlSyntaxGate sets last_sql` 测试（断言 nl2sql-engine 不再设的 last_sql）。对齐 P13b Q2 boundary（critic 在 nl2sql-engine、phase-gate delegate、单向无环）+ 白捡 fix #1（hasPartitionFilter scope 到 `;`-stmt WHERE 子句）+ #2（hasSelectStar 解析 select list 检 `t.*`/`SELECT a,*`）。

**B3-B14（secondary）**：
- B3 `onTurnStopping` enforce `llm_call_count≥max_llm_calls_per_turn`→decline（llm 计费在 `llm/stream`）。
- B4 `captureToolData` `present_clarification`→`awaiting_clarification=true`；`resetQuestionScoped` 清 false。
- B5 F2 两边 `normalizeSql`（`replace(/\s+/g,' ').trim()`，同 `extractSqlCandidate`）；加 `normalizeSql` helper。
- B6 `await forcedLoad` 后 re-check `honest_decline_reason`/cancelled→return。
- B7 `resetQuestionScoped` 顶 `clearStallTimer`（防旧 timer 跨 question 误 fire）。
- B8 F2 block 路径设 `last_query_outcome='failed'`（executionDecision 视为 failed 而非 stale 'not run'）。
- B12 删 `AssembledSection` `order` 字段 + `as AssembledSection` cast（`packages/core/system-prompt/src/index.ts:88` AssembledSection={name,text}，sort 在 waterfall 前）。
- B14 `onAssemble` phase clamp DECLINED/COMPLETE→UNDERSTANDING（PHASE_INSTRUCTIONS 无 terminal entry，防 undefined text）。
- **B9 DECLINED 经 F4 重置——verified**（`onStatus` idle→running→`resetQuestionScoped` 已清 `honest_decline_reason`+current_phase=UNDERSTANDING；test gap #12 测验证）。
- **DEFERRED**：B10（onRequest 类型 LlmCallConfig vs GenerateOptions——tsc green 示类型兼容，adapterDefaults nuance 延后）、B11（step_count 增量但无 max_steps enforce，dead-ish，延后）、B13（onLlmStream skip options.purpose auxiliary——需 llm types 核 purpose 字段，延后）。

**test gap（补，揭 B1/B2 masking + lock-in）**：
- #1 onAssemble 真实 stub `{agent:{id}, scope:{id}}`（揭 B2）——done。
- #2 phase_output 真实捕获路径（揭 B1，断言稳定可观测 `last_sql`——critic 仅在 phase_output 被捕获后才设）——done。
- #3 stall fire（vi.useFakeTimers+advance 300s→honest_decline+cancel）——done。
- #9 EXECUTION 3-state（done→advance INTERPRETATION；running→inject poll）——done。
- #12/B9 DECLINED 经 idle→running 重置——done（验 B9）。
- **DEFERRED**（lock-in，非 masking-reveal）：#4 llm/stream count+sessionId filter、#5 reasoningEffort、#6 fallback 耗尽→decline、#7 honest_decline no-fallback phase、#8 F2 whitespace 变体（B5 normalizeSql 已覆盖逻辑）、#10 forcedLoad re-entrant 填 candidate_tables、#11 B8（B8 已覆盖逻辑）——follow-up。

**Verify（全绿）**：`tsc -b packages/data/phase-gate/tsconfig.json` typecheck-clean；`vitest` 14/14；`pnpm run verify-cordis-config` 124 files；commit-time `oxlint --config .oxlintrc.staged.json` 0/0。pnpm install 自动接线 nl2sql-engine dep（supply-chain 1215 entries 通过）。

**Assets（re-open 增量）**：`packages/data/phase-gate/src/phase-gate.ts`（capturePhaseOutput + readAgentId fix + generationGate delegate + B3/B4/B5/B6/B7/B8/B12/B14）、`src/critic.ts`（**删除**）、`src/index.ts`（移除 critic re-export）、`tests/phase-gate.spec.ts`（B1/B2/F3-stall/EXECUTION-3state/B9-F4 测试 + critic block 移除）、`package.json`+`tsconfig.json`（nl2sql-engine dep + reference）。G1b（实验执行）随 P7b 真 functional 解除 P7b blocker（G1b blocked by P7b+P11b；P7b done，P11b 并发 in-progress）。


> **Note (concurrent coordination 2026-08-20)**：map Not-yet-specified 的「critic dedup」follow-up 已被并发 P11b session graduated 至 `tickets/phase-misc/host-typecheck-wiring.md` task 票（commit/revert critic-dedup WIP + nl2sql-engine tsconfig.host ref + phase-gate PromptAssembly）。本 P7b re-open commit 即 commit 该 critic-dedup WIP（解 host-typecheck-wiring 的 "commit WIP" 项）；剩余 host-wiring（nl2sql-engine tsconfig.host ref、phase-gate PromptAssembly）留 host-typecheck-wiring 票。B12（AssembledSection order+cast 移除）可能解 phase-gate PromptAssembly gap。本 re-open 不改 tsconfig.host.json（shared 并发 M）——phase-gate 自有 tsconfig ref + tsconfig.base paths wildcard 已使 phase-gate project tsc + vitest 绿；host 全量 typecheck 的先验 gap 由 host-typecheck-wiring 票收尾。
