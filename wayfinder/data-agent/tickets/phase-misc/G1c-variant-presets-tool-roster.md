# G1c — G1 实验变体 preset（B/C/D）+ 共享 data-tool roster 补完 + honesty tagging

**Type**: prototype
**Phase**: misc
**Status**: Resolved (2026-08-21) — P4c(c) `query_data` tool landed (commit 1e637bc568), unblocking the variant EXECUTION phase; B/C/D presets built + A roster evaluated + honesty tagging recorded. Sub-blockers: C_prior phase-gate whitelist (goal/todo in U+I) + load_*/present_* tool packages (deferred).
**Blocked by**: ~~P4c（`query_data` 注册）~~ RESOLVED 2026-08-21（P4c(c) commit 1e637bc568）+ P6b（resolved——ctx.schema substrate 就位，model-facing load_* tool 包 deferred）+ P13b（resolved——critic+search_data_sources 就位）+ P7b（resolved——phase-gate 编排 + persona option C）
**From**: G1b 执行范围 step 1（「建变体 preset：A=P7b 已有，须建 B/C/D」）+ G1b 可行性 finding（A 自身 data-tool roster 是 stub：仅 `tool-search-data-sources` 注册，`query_data`/`load_*`/`critique_sql`/`evaluate_sql_quality`/`present_*` 全注释 TBD）

**Question**: 把 G1 设计的 4 变体建成**可跑 RBI case 的真 preset**——A 补完 data-tool roster + 新建 B/C/D——让 G1b 矩阵能在 P11c runner 上跑。变体仅差**编排**（base persona + 全数据工具 + 模型 + case 跨变体恒定，G1 Q9 混淆控制）：

- **A**（gate ON, planning OFF）= P7b 四阶段 as-is；补注册 data-tool roster（`tool-query-data`←P4c / `load_table_definition`+`load_event_definition`←ctx.schema / `critique_sql`+`evaluate_sql_quality`←P13b critic 已 fold 进 phase-gate，preset 行或可省 / `present_*`←INTERPRETATION delivery later）。
- **B**（gate OFF, planning ON）= 自由 ReAct + planning group（goal/todo，**不含 plan-mode**=B_core；plan-mode 作 B-内部 Level-2 条件跑）：persona + 全数据工具 + planning group、**无** phase-gate 插件。
- **C**（gate ON, planning ON）= 混合：四阶段 + planning group（goal/todo 进 UNDERSTANDING+INTERPRETATION guard 白名单=C_prior；C_all/C_none 作 Level-2）。依赖 P7b 真 phase-gate + P13b 真 critic。**构造性禁 plan-mode**（零硬冲突，G1 Q1）。
- **D**（gate OFF, planning OFF）= 裸 ReAct 地板：persona + 全数据工具，无 planning、无 phase-gate。

## Resolution (2026-08-21)

P4c(c) `query_data` tool landed (commit 1e637bc568) → 变体 EXECUTION 相可跑真 SQL，G1c unblocked。B/C/D preset 建成 + A roster 评估 + honesty tagging 记录：

- **B/C/D preset**：新文件 `apps/cli/config/agent-presets/data-agent/{b-free-react-planning,c-hybrid,d-bare-react}.cordis.yml`（Mode 6），复用 A data-tool roster（search_data_sources + query_data）+ CORE data-agent persona（per-game analytics / semantic layer / four-phase U→G→E→I / honest decline / no fabrication，G1 混淆 control base persona 跨变体恒定）；toggle：phase-gate group（A/C 有 `cordis:group`+`isolate:phaseGate`；B/D 无）+ planning group（B/C 挂 tool-goal+tool-todo agent-plane；A/D 不挂）。persona：A/C 由 phase-gate option C 拥有（无独立 persona 行）；B/D 独立 `persona` 行（无 phase-gate）——B/D persona 复用 CORE identity，orchestration 差异（B: goal/todo 自结构四阶段；D: bare ReAct）+ honest-decline 为 prose（无 phase-gate 【未完成】 marker）。C 构造性禁 plan-mode（G1 Q1 零硬冲突）。
- **planning group 接线**：goal/todo 是 session-keyed host-registry tools（standard preset 形态——plain rows，非 cordis:group；research §1.2 `planning` group 仅包 plan-mode，C 禁 + B_core 无故不挂）。data-agent bundle **host-disable** tool-goal+tool-todo+plan-mode（A/D clean planning-OFF：A 经 phase-gate guard 拒非白名单 goal/todo、D 无 guard 故 host disable 为机制；B/C agent-plane re-mount goal/todo = planning ON；C constructive plan-mode disable；B+plan-mode Level-2 可 re-mount override）。镜像 web-app 对 standard preset 的 host-disable+agent-mount 模式。
- **A roster 补完**：search_data_sources + query_data（P4c(c)）已解注释 ship；`load_table_definition`/`load_event_definition`（ctx.schema P6b model-facing load_* tool 包 deferred）+ `present_*`（INTERPRETATION delivery deferred）+ `critique_sql`/`evaluate_sql_quality`（P13b critic 已 fold 进 phase-gate GENERATION gate，无需独立 tool 行）仍注释。→ **A 仍非全 runnable end-to-end**（NL→SQL→query 链路可跑；delivery + load_* 缺，需 load_*+present_* tool 包 ship——sub-blocker）。
- **honesty tagging**：declined 从 agent 终态可推（G1 Q5）。A/C 经 phase-gate `honest_decline` state（model emit `【未完成】` INCOMPLETE_MARKER in INTERPRETATION / budget 耗尽 max_executions_per_turn|max_llm_calls_per_turn|max_state_turns / stall_watchdog / EXECUTION query failed fallbacks exhausted）→ finalResponse/events；B/D 无 phase-gate → prose decline（finalResponse "I cannot answer"）→ P11c 判 declined≠wrong（三分）。
- **verify**：`verify-cordis-config`✅（135 files，B/C/D 扫描 + bundle disable rows 绿）+ B/C/D toggle 正确（phase-gating 有/无、goal/todo 有/无、persona 有/无、plan-mode 无）。

**Sub-blockers（诚实记，不伪造 ship）**：
- **C_prior（G1 Q11）**：C 的 goal/todo 在 U+I 可调须 phase-gate guard per-phase whitelist 含 goal/todo——whitelist built-in `packages/data/phase-gate/src`（并发域，不改），未含则 C goal/todo guard-rejected（callable-but-unwired）至 whitelist 更新（phase-gate/src follow-up 或 G1b 实跑前）。mount forward-compatible（verify-cordis-config 绿），runtime callability 为 sub-blocker。
- **load_*+present_* tool 包 deferred**（A 全 runnable end-to-end 须其 ship）。
- **G1b 仍 re-block** on P11c（runner）+ G1c（本票 resolved）+ C_prior whitelist；P4c(c) done 解 P4c 硬门。

## Scope

- **A roster 补完**：解注释 `apps/cli/config/agent-presets/data-agent/agent.cordis.yml` 的 TBD 工具行（`query_data` 待 P4c；`load_*` 待 ctx.schema model-facing tool 包；`present_*` 待 INTERPRETATION delivery ticket；`critique_sql`/`evaluate_sql_quality` 评估是否需独立 tool 行——critic 已 fold 进 phase-gate 单向 delegate）。
- **B/C/D preset**：新 preset 文件（`apps/cli/config/agent-presets/data-agent/{b-free-react-planning,c-hybrid,d-bare-react}.cordis.yml` 或同文件多 preset，dsh-plugin-development **Mode 6 agent-preset-composition**），复用 A 的 persona+数据工具 roster，仅 toggle phase-gate 行（`cordis:group`+`isolate:phaseGate` realm）+ planning group 行。
- **planning group 接线**：goal/todo/plan 包（`packages/{goal,todo,plan}`）挂 planning group 的形态——核 harness planning-group 语义（`../../research/harness-agent-loop.md` §1.2 planning group=goal/todo/plan-mode）+ dsh-plugin-development Mode 6。B/C 的 planning group 非 disable 包（honors G1 Q8「保留不禁用」=挂 group 不禁用包）。
- **honesty tagging**：declined 须从 agent 终态可推（G1 Q5「R3 RunResult.events 取 agent 终态推 declined，RBI L3 honesty 未跑→执行票须启」）。变体 preset + P11c runner 侧启诚实拒答标记——agent `honest_decline`（phase-gate state，P7b F3 stall/B3 budget）→ finalResponse/events 可被 P11c 判 **declined≠wrong**（三分）。
- **每 cell 单模型**（A per-phase model-mix 剥离作 Level-2，G1 Q7 混淆控制——跨变体同模型隔离结构效应）。

## 关联

G1（resolved——变体设计 11 决策，`../phase-misc/G1-pipeline-vs-goal-todo.md`）+ P7b（resolved——A 的 phase-gate 编排 + persona option C）+ P13b（resolved——critic+search_data_sources）+ P4c（`query_data` 硬依赖）+ P11c（runner，变体在其上跑）。**G1b 依赖**：G1b re-blocked on G1c（无 B/C/D preset + A roster 未补完，矩阵跑不起来）。

## Level-2（G1 Q11，条件触发——G1b 在 Level-1 信号触发时毕业子票，G1c 建基础形态）

- **C per-phase**（headline=orientation 维度 3）：C_none=A（全禁）vs C_prior（U+I allow）vs C_all（全开）；触发=Level-1 planning×gating 交互显著；交互 null→C_prior 默认。
- **B plan-mode**（B-内部、低优先）：B_core vs B+plan-mode；触发=B 欠结构。
- **A per-phase model-mix**（A-内部、低优先）：A_single vs A_per-phase-mix；触发=A 有竞争力。

## 前置

- **P4c**（`query_data` 注册——变体 EXECUTION 相可跑；blocked on 真 MaxCompute 凭证）。
- **G1**（resolved 2026-08-20，变体设计 11 决策）。
