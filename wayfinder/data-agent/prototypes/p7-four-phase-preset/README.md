# P7 four-phase preset + phase-gate — PROTOTYPE (throwaway)

> ⚠️ **THROWAWAY PROTOTYPE.** 非 shipped 包、非生产代码。validated 形态将重新实现为真实 `packages/phase-gate/`（TS、Schemastery、真实 Cordis `ctx.on`/`ctx.tools.guard`/`ctx.systemPrompt`/`ctx.agents`）+ 真 `apps/cli/config/agent-presets/data-agent/agent.cordis.yml` + 解注释 `packages/bundle/data-agent/cordis.patch.yml` 的 phase-gate insert 行——那是生产步骤（**P7b**），非本原型。本目录是 wayfinder ticket **P7** 的 primary-source artifact；勿 promote。见 `../../tickets/phase-3/P7-four-phase-preset.md`。

## The question it answers

四阶段 preset + phase-gate 插件的**编排状态模型**对不对？——把 reverse-bi `DataAgentPipeline`（`pipeline.py` 四阶段 phase-gated ReAct 管线，跑在 rbi 自有 `core.loop.AgentLoop` 上）**重新表达到 deepseek-harness-da 的 harness 事件 seam 上**：additive（preset overlay + phase-gate 插件，**不自定义 agent-loop、不坍缩四阶段**——map ③③），组合 P4(`ctx.query`)/P5(`ctx.embedder`+`ctx.retrieval`)/P6(语义层 `ctx.schema`)/P8(`ctx.audit`)/P3(`subagent-qoder`)。harness **无原生 per-phase 工具白名单**（Q7）→ phase-gate 必须是 hook。研究〔`../../research/harness-agent-loop.md` §4.3 映射表 + 可行性=高〕+〔`../../research/rbi-purpose-arch.md` §5 生命周期〕+〔`../../research/p7-four-phase-fit-to-da.md` §1-§5 rbi 编排内幕 + 忠实再表达推荐〕。

## Locked decisions (见 ticket P7 + 研究笔记 + grilling)

- **D1 交付范围**：一次性原型（`prototypes/p7-...` .mjs + harness-stub，镜像 p4/p6/p8）；生产（`packages/phase-gate/` TS + `agent.cordis.yml` + 解注释 bundle）毕业 **P7b**（P4b/P8b/P12b 先例）。
- **D2 persona (option C)**：base persona 作 preset 静态 `section()`（order 0）；`_PHASE_INSTRUCTIONS`（每 phase 指令 + SQL conventions 仅 GENERATION）由 phase-gate 插件在 `system-prompt/assemble` 按 `current_phase` **动态注入**（作 section/context 行，避免 `complete:true` 抑制其他段）。生产可拆 `dsh-data-persona` 包（P7b）。
- **D3 goal/todo/plan 共存**：四阶段 preset **不挂 planning group**（research §5#3：两编排模式不混）；goal/todo/plan 包 host-plane **保留不禁用**（honors Q8「保留不禁用」=不 disable 包）；G1（blocked-by-P7，正解）另开含 planning group 的 preset 做实验对比。
- **D4 phase 转换** = `agent/turn-stopping` serial 检查点驱动（model 自然停→turn-stopping→phase-gate 查 gate→推进/retry/fallback/decline）。**非** model-driven exit_<phase>（research §3a：语义位移——rbi `sql_syntax_gate` 恰是「模型不知 gate 结果」）。harness 无原生 step/turn 预算（§3.2#4）→ phase-gate 持 per-agent 计数器 + `agent.cancel`。
- **D5 gate 落地**：UNDERSTANDING/INTERPRETATION `always_pass`→no-op 推进；GENERATION `sql_syntax_gate`→**turn-stopping 查 phase 最终文本**（非 post-execute 单工具结果），P7 用 sqlglot stub（完整 critic 留 P13）；EXECUTION `always_pass` never consulted→`ctx.query.execute` 3-state `QueryOutcome` 直接驱动 fallback（done→advance / failed→fallback GENERATION）；fallback/delivery→`tools/post-execute`（accept/block/attach）。gen(语法) vs exec(资源安全) 两层 gate 须 SQL 文本同源（F2）。
- **D6 budgets** = 采用 rbi `PipelineConfig` 初始默认（max_fallbacks=2/max_subquestions=4/max_executions_per_turn=8/max_llm_calls_per_turn=60/max_state_turns=20/disambiguation_timeout=300s/forced_table_load_timeout=30s + per-phase max_attempts 5/5/1/5 + timeout 60/60/120/60s + fallback UNDERSTANDING/none/GENERATION/none），R8 evals 重定标；llm 计 `llm/stream`（F5：非 `agent/request`）、exec 计 `tools/post-execute`、fallback/推进 计 `turn-stopping`。
- **D7 model 路由** = 四阶段全 dashscope（P2）+ per-phase reasoning effort 经 `agent/request` waterfall（UNDERSTANDING/GENERATION 高、EXECUTION/INTERPRETATION 中）；Qoder（P3）作可选委派工具（`dsh-tool-subagent` provider:qoder，**非 phase-bound**，主 LLM 不用 Qoder——map out-of-scope）；model route 不进 preset（`installAgentLlmTarget` seam）。
- **D8 stub 策略** = stub-isolate——所有 per-phase 工具作 canned-result stub（按就绪矩阵命名），聚焦验证四阶段**编排**；不耦合 p4/p6/p8 throwaway 内部（那些已自验状态模型），镜像 p8 harness-stub.mjs 假 ctx；ready seam 的 tool-name + 3-state outcome 用于 stub 真实化。

## Run

```
cd wayfinder/data-agent/prototypes/p7-four-phase-preset
node run.mjs --demo     # 自动跑 8 场景，每步打印全 phase-gate 状态
node run.mjs            # 交互菜单
```
无依赖（纯 node .mjs，无 build，无 node_modules）。

## Validated（状态模型成立，8 场景全绿）

- **四阶段经 turn-stopping 推进**（S1）：UNDERSTANDING→GENERATION→EXECUTION→INTERPRETATION→COMPLETE，每 phase model 自然停→turn-stopping→gate(always_pass/sql_syntax_gate)→advance。
- **guard 硬白名单**（S2）：越界工具（UNDERSTANDING 调 query_data）被 `ctx.tools.guard()` 单调拒（下游不可翻案），工具目录跨 phase 稳定（cache 友好）。
- **ctx.query 3-state 驱动 EXECUTION fallback**（S3）：query_data(outcome=failed)→post-execute block + fallback→GENERATION（max_attempts=1，turn-stopping gate never consulted）。
- **budget 在 turn-stopping 取消**（S4）：exec_count≥max_executions_per_turn(8)→`agent.cancel`。
- **GENERATION sql_syntax_gate 查 phase 最终文本**（S5）：无 SQL→gate fail→retry（attempts<max）；证 gate 在 turn-stopping 非 post-execute。
- **persona option C**（S6）：_PHASE_INSTRUCTIONS 每 phase 注入 + SQL conventions 仅 GENERATION + 无 complete:true（其他段保留）。
- **honest_decline**（S7）：GENERATION gate fail + max_attempts + fallbacks 耗尽→honest_decline。
- **forced_load in-phase 过 guard**（S8）：程序化调 UNDERSTANDING 白名单内工具→guard 放行。

## Surfaced findings（P7b 生产硬化须解，p4 先例）

- **F1 forced_load 程序化调工具**：harness 是否有 `ctx.tools.execute` 程序化路径 + 是否经 guard？本 stub 经 guard（in-phase 放行）；真 harness 须验（forced_load 在 UNDERSTANDING 完成时程序化补调检索工具，绕过模型，保留 rbi 顺序 for-await + 单 `wait_for` 整批语义——research §3e 适合度：中）。
- **F2 SQL 同源**：GENERATION `sql_syntax_gate`（生成期语法）与 EXECUTION guard chain（执行期资源/安全）是不同层，须保「被评审的 SQL 恒等于被执行的 SQL」（rbi `extract_sql_candidate` 原则）。
- **F3 stall watchdog**：rbi `_watch_for_stall`（300s 无事件，排除 `ctx.awaiting_input`）在 harness 无原生对应 → phase-gate 插件须设独立 timer。
- **F4 question-scoped 计数器**：rbi「per_turn」预算 = per 用户问题 = per harness kick（多 turn）。`turn/start` **不得**重置 llm/exec/fallback 计数器（会破预算）→ 须有 question-start seam（或检测首 turn / current_phase→UNDERSTANDING）重置。本 stub 跨 turn 保留。
- **F5 llm 计费点**：在 `llm/stream`（流开始）计，**非** `agent/request`（waterfall 重试可能不产真实 LLM 调用）。
- **F6 step max_steps**：harness 无原生 step/turn 预算（§3.2#4）；本 stub 仅在 turn-stopping 模型预算——per-step 上限（rbi `AgentLoop.max_steps`=20/30）须 per-step hook，延后 P7b。

## Assumptions (react to these)

1. **`.mjs`, not TS.** Throwaway；无 build。真实实现是 TS（Schemastery + 真实 Cordis `ctx.on`/`ctx.tools.guard`/`ctx.systemPrompt.assemble`/`ctx.agents`）。
2. **harness-stub.mjs is a STAND-IN.** 假 Cordis ctx 模拟 tools/* pipeline（pre-execute→guard→execute→post-execute→result）+ `agent/turn-stopping` serial + `agent/request`/`system-prompt/assemble` waterfall + `llm/stream` 计数 + `turn/start`。真实实现在 vendored Cordis（`packages/core/{tools,session,agent-loop,system-prompt}`）。stub 简化：waterfall 同步、first-deny-wins、guard 单调（镜像 harness `tools/README`）。
3. **所有 per-phase 工具 = canned-result stub.** 非 ready da seam（ctx.query P4b / ctx.schema P6 / ctx.embedder+ctx.retrieval P5 / ctx.audit P8 / subagent-qoder P3——各已自验）。P7 stub-isolate 聚焦编排。ready seam 的 tool-name + 3-state outcome 用于 stub 真实化。
4. **GENERATION critic = sqlglot stub.** 真 critic（sqlglot AST + JSON-path + registry）留 P13 NL→SQL 引擎。
5. **phase_output 由场景手设.** 真实 harness 模型在 turn 内产 phase_output（文本含 SQL），turn-stopping 读之；本 stub 手设以模拟模型输出。
6. **per-agent state keyed by sessionId.** 镜像 harness 预设 standing mount + 插件内部 per-session keying（`harness-agent-loop.md` §5.3 INFERENCE）；真实 dispose/HMR 未模。

## Files

- `types.mjs` — Phase 枚举 + `PhaseConfig`(rbi factory.py 确切值) + `PipelineConfig`(rbi budgets) + `GateResult` + 工具白名单(phases.py) + per-agent state。
- `phase-gate.mjs` — phase-gate 插件：per-agent state + 6 hooks（guard/turn-stopping/post-execute/request/system-prompt/assemble/turn-start）+ `sqlSyntaxGate` stub + `PHASE_INSTRUCTIONS`/`SQL_CONVENTIONS`。
- `harness-stub.mjs` — 假 Cordis ctx（tools/* pipeline + turn-stopping/request/assemble/llm-stream/turn-start 模拟）。
- `preset.mjs` — preset overlay 结构（`agent.cordis.yml` 原型表示：persona 行 + 全阶段工具行 + phase-gate isolate + compaction；无 planning group）。
- `tools.mjs` — per-phase canned-result stub 工具。
- `run.mjs` — demo driver（8 场景 `--demo` + 交互菜单）。
- `../../research/p7-four-phase-fit-to-da.md` — rbi 四阶段编排内幕 + 忠实 da 再表达 cited 笔记（§1-§5）。
