# G1 — Pipeline vs goal/todo/plan 实验对比

**Type**: grilling
**Phase**: 3+
**Status**: Resolved (2026-08-20) — 实验设计(不跑)定稿；执行毕业 **G1b**（P7b-blocked；P11 已 resolved、生产级须 P11b）
**Assignee**: wayfinder-session 2026-08-20

**Question**: 保留两者，实验对比哪种更好（不同模型可能不同搭配）。

**Research**: → `../../research/p7-four-phase-fit-to-da.md`（§5#3 两模式不混=A 钉 (gate 开,plan 关)）+ `../../research/harness-agent-loop.md`（§1.2 planning group=goal/todo/plan-mode、§3.2 plan-mode 软门目录稳定、Q8 保留）+ `../../research/p2-dashscope-wire.md`（模型清单+思考靠选模型）+ `../../research/r3-multiturn-eval-hook.md`（eval hook+pass_k+AgentResponder）+ `../../research/p6-nl2sql-feasibility.md`（161 case+L1 基线+flakiness）+ reverse-bi `libs/rbi-eval/`（rbi-eval 结构参照）。

## Finding / Design (resolved 2026-08-20，/grilling + /domain-modeling 一问一答 11 决策)

实验**设计**（不跑——跑须 P11 eval harness + P7b 真 phase-gate；毕业 **G1b** 执行票）。11 决策：

**轴与变体（Q1/Q3/Q4）**：双正交轴 2×2 = **Gating**(硬 phase-gate 开/关) × **Planning**(goal/todo 开/关)。
- A=(gate 开, planning 关)=P7 四阶段 as-is；B=(关, 开)=自由 ReAct+planning；C=(开, 开)=混合(四阶段+planning)；D=(关, 关)=裸 ReAct 地板。
- 全 2×2 因子（四格缺一不可：估 Gating/Planning 主效应 + G×P 交互；C 是 orientation 维度 3「哪个 phase 用 goal/todo」的前提，丢 C 则答不了）。
- Planning 因子 = {goal, todo}（跟踪基底，B/C 同质）；**plan-mode 是软结构相位（模糊 Gating 轴）**→ C 构造性禁 plan-mode（零硬冲突），作 B-内部 Level-2 细化。C 可行性待 P7b 真插件验（结构零硬冲突）。

**目的（Q2）**：ship 默认编排（主）+ per-model breakdown（次，分歧>5pp 才毕业路由票）；(d)「是否禁用 goal/todo」是 A-vs-B 下游后果（非目的）。

**指标（Q5）**：主 = 端到端答案正确率（execution-match strict「完全正确」=exact match，correct/declined/wrong 三分，**declined≠wrong**——declined 是诚实拒答、单独报；R3 `RunResult.events` 取 agent 终态推 declined，RBI L3 honesty 未跑→执行票须启 honesty tagging）。诊断 = SQL 正确率（语法经 A gate / 语义经执行 match，解释 A vs B 为何赢/输）。次 = turn 效率 + LLM 成本(token/调用数；Qoder 路径记 Credits) + latency。breakdown = per-variant × per-model。
- ⚠ A 的 GENERATION gate 真版 = **P13**（sqlglot critic；P7 是 stub）→ 实验测真 A 须 P13+P7b 就绪，否则 A 是 stub-gate、对比失效。B/D 不需 P13。

**语义（Q6，domain-modeling）**：goal/todo 在 data-agent ≈ **四阶段 pipeline 的自由形式**（goal 恒为「答问题」、todo=理解/SQL/跑/解读步骤）。故 A vs B 真正对照 = **硬强制 canonical data-retrieval 管线 vs 模型经 todo 自我结构化同条管线**（B 非无结构、交结构权回模型）。盯 3 差异化：(1) B 是否真走 canonical 序列还是跳 gate；(2) A 硬 gate 是否抓住 B 跳的（更少畸形 SQL 被执行）；(3) **迭代题 A 弱 B 强**——A 四阶段线性、迭代靠 phase-bounded fallback(EXECUTION fail→GENERATION、max_subquestions=4)，B 自由 ReAct 随时再查/精炼(free iteration)。→ eval case 须横跨线性+迭代。

**模型矩阵（Q7）**：2 配置——**Config T（思考轴：非思考 vs 思考、~同能力配对→隔离思考效应）+ Config C（能力轴：弱→中→强阶梯、~同思考→隔离能力效应）**。执行前置**探针全 10 dashscope 模型**（`p2-dashscope-wire.md` 实测清单 + GET /api/v1/models）map 哪些返 reasoning_content(思考)+能力档位；选 2 配置（并集 ~4-5 模型）；qwen3.7-max reachability 先探(ping 不通则弃)。思考靠选模型(native 无 per-request thinking 开关)。**Qoder 不进主 LLM 矩阵**（委派 subagent 工具、map out-of-scope「用 Qoder 当主 LLM」）。混淆控制：A 的 per-phase 模型混搭(P7 D7 意图)**剥离**作 A-内部 Level-2（每格单模型、跨变体同模型隔离结构效应）。

**eval case 集（Q8）**：来源 = RBI 的 161 case（5 scope、同游戏/schema、expected 结果可复用——这就是 da 的 eval 集）；**单轮 primary**（喂 input.question、无 scripted 澄清；多轮澄清=Level-2；「迭代」=一问内多查+精炼=线性/迭代 tag 非 multi-turn）；**分层** = sql_complexity(L1-L4) + query_intent(7: metric_lookup/trend/comparison/ranking/distribution/proportion/cohort) + **线性/迭代 tag（新——RBI 不标须标注；代理 comparison/cohort 常需多查→迭代-ish）**；~30 分层代表性子集。判分对齐 Q5 execution-match+declined-from-终态。⚠ **flakiness**：RBI L1 ~7-9% 中位且跨 run 巨幅波动(ODPS 连接/凭证/跨 region)→ 须 infra 稳定控制(Q9)。

**protocol（Q9，staged）**：
- **Stage 1** = 全 {A,B,C,D} × **Config C**（能力轴、ship 相关、~3 模型）≈1080 run，完整因子（估 Gating/Planning 主效应+交互）于 ship 相关轴。
- **Stage 2** = + **Config T**（思考轴、~2 模型）×{A,B,C,D} ≈360-720 run，**条件跑**——仅当 Stage 1 显 per-model 分歧值得探思考维度。
- **控制**：pass_k=3（RBI `DEFAULT_PASS_K=3`）取 CI + dsh-llm-replay 归档/复核；case ~30；**infra-flakiness**——每 run 前 health 门(连通+凭证+scope) + infra 失败有界重试(区别 model attempt、不计 max_attempts) + infra 失败单独标(不污染 correct/wrong/declined)；**混淆**——每格单模型、变体仅差编排(base persona+数据工具+模型+case 跨变体恒定、A 的 _PHASE_INSTRUCTIONS 是其处理非混淆)、固定温度跨全格；**公共预算上限** max 60 LLM calls / max 20 turns per case(对齐 rbi budgets)跨全变体统一(A per-phase budget 是内部更细)；**配对设计** 每案例跑遍全 cell(within-subject)降方差。

**完成判据 + ship 规则（Q10）**：决策规则(非仅显著性)——ship 主指标最高变体；top-2 实际等效(≤3pp 且 CI 重叠)→ship 更简(Q2：D≈A≈B→ship 最简=B/D 无 phase-gate 插件)；统计用配对 bootstrap(per-case correct/declined/wrong 三分+95% CI)+二元 correct-rate McNemar，但 ship 决策用实际等效边际。Stage 2/per-model 路由触发 = Stage 1 显最佳变体随模型分歧>5pp。执行票完成 = Stage 1(+Stage 2 若触发)跑完+决策规则应用→报告+ship 推荐+per-model breakdown；实际「改 da 默认为 X」=下游决策票(fed by 本报告，类比 P7b 从 P7 毕业)。

**Level-2 条件精化（Q11）**：变体内部精化、条件跑(Level-1 信号触发)。
- **C per-phase goal/todo（headline=orientation 维度 3）**：normative 先验 = goal/todo **allow UNDERSTANDING+INTERPRETATION**(推理相：U 规划检索/消歧、I 组装/格式化) / **disallow GENERATION+EXECUTION**(机械相：G 写一 SQL gate+conventions 已结构 todo 反分散、E 跑 SQL 3-state 多查走 sub-questions 非 todo)。config 覆盖 orientation「全禁/per-phase/全开」三择：A=C_none(全禁、即 gate ON planning OFF 格不另跑) vs C_prior(U+I allow) vs C_all(全开)。触发：仅当 Level-1 显 planning×gating 交互显著才跑；交互 null→用 C_prior 作默认。
- **B plan-mode（B-内部、低优先）**：B_core(无 plan-mode) vs B+plan-mode(加软 plan 相位)；触发：仅当 B 欠结构表现差。预期低值(与 B todo 自规划冗余)。
- **A per-phase model-mix（A-内部、低优先）**：A_single vs A_per-phase-mix(GENERATION=qwen3-max、INTERPRETATION=qwen-plus 之类)；触发：仅当 A 有竞争力想优化生产态(model-mix 亦成本优化)。

**毕业**：执行 = 新票 **G1b**（prototype、phase-misc、blocked by P11+P7b）——建 B/C/D 对比 preset(A=P7b 已有)+ 跑 staged 矩阵(via P11)+ 应用决策规则+出报告；hold 本设计作 protocol。下游 ship-default + per-model-routing 决策 = map Not-yet-specified 雾(G1b 报告后才 specifiable→毕业)。
