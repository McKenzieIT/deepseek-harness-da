# G1b — Pipeline vs goal/todo/plan 实验执行

**Type**: prototype
**Phase**: misc
**Status**: Partially resolved (2026-08-25) — C_prior resolved; model probe complete; eval pipeline validated end-to-end (LLM→SQL→MaxCompute→judge); full variant comparison (A/B/C/D) requires HarnessAgentResponder (eval CLI tests Nl2sqlEngine directly, not the agent loop with presets). Full matrix (~5h) is an async batch job. See `../../research/g1b-experiment-report.md`.
**Assignee**: (unclaimed)

**Question**: 跑 G1 设计的 staged 实验（2×2 变体 × 2 模型配置）+ 应用决策规则 + 出报告，答「ship 默认编排 + per-model 路由」。

G1（resolved 2026-08-20，`../phase-misc/G1-pipeline-vs-goal-todo.md`）定稿了实验**设计**（11 决策）；本票是**执行**——建对比 preset + 跑矩阵 + 报告。

## 可行性 finding（2026-08-21，re-block；wayfinder "work through the map" 执行票 recon）

G1b 原框定「依赖已解锁（P7b/P13b/P11b/G1 全 resolved）→ 可跑」**偏乐观**。recon（读 ticket+G1+P7b/P11b/P4b 包 + RBI case + cred）坐实 5 阻塞，主指标 execution-match **不可测**：

1. **无真 ODPS 路径（硬门）**：`packages/query/query-maxcompute` 是 stand-in（`dev/standin-sidecar.mjs` 对 fast 模式恒返 `rows:[['game-x',1234]]`、blocking 返 `[['game-x',9999]]`，`mode` 是测试旗标非 SQL 推出；README 明写 real pyodps deferred）。agent 侧 `tool-query-data` 在 preset **未注册**（"name TBD - P4b/Not-yet-specified"）。→ EXECUTION 相恒返 canned rows。
2. **RBI case 坐实需真 ODPS**：`reverse-bi/eval-cases/10000251/eval_10000251_037.yaml` `expected.sql` 打 `ieu_cdm.dws_10000251_univ_acc_act_di`、`expected.result_value:{value:4336}`、`match_mode:scalar_exact`、`meta.anchor_ds:20260806`。execution-match = 跑 agent 真 SQL 到真 MaxCompute `ieu_cdm`（锚点日数据）对照 4336；stand-in 恒 1234→永不匹配。无廉价本地替代（expected 按真 ODPS 数据算；seed 本地 DB = 巨量数据工程 + 方言/schema 位移 + 改实验）。
3. **无 eval runner**：`packages/eval/eval`（P11b）纯库——README「No CLI/persistence/pass_at_k reporting—deferred to P11c」+「Live e2e deferred」。P11 原型 `run.mjs` 是 throwaway stub（`harness-stub.mjs`：canned RunResult+executeSql+judge），验编排/判分逻辑非真执行。
4. **B/C/D preset 不存在 + A 自身是骨架**：`apps/cli/config/agent-presets/data-agent/agent.cordis.yml` 仅注册 `tool-search-data-sources`；`tool-query-data`/`load_*`/`critique_sql`/`evaluate_sql_quality`/`present_*` 全注释 TBD。故已 resolved 的 A 也跑不完一个 case。
5. **模型矩阵探针 + honesty tagging 未做**：探针是唯一真可跑的一步（key 可得，见下）但不解锁实验；honesty tagging（declined 从 agent 终态推）未接。

**Key 可得（用户门已过）**：`~/.dsh/.credentials.yaml` 存在（0600、273B），含 `DASHSCOPE_API_KEY`+`QODER_PERSONAL_ACCESS_TOKEN`；P2/P2b/P2c/T2 live 探针（2026-08-19/20）成功打到 AGA→key 有效、AGA 从本机可达。**但 key 不足**——缺真 ODPS 凭证（cred file 无 ODPS_ACCESS_ID/KEY/PROJECT/ENDPOINT），execution-match 的数据底座未建。

**毕业**（不伪造 ship 信号——无真执行数据，ship-default + per-model-routing 雾无法毕业，伪造会污染下游决策）：3 prereq 票——**P4c**（真 ODPS 路径，硬门，phase-2，`../phase-2/P4c-real-odps-execution-path.md`）+ **P11c**（eval runner，phase-4，已存在 unblocked，`../phase-4/P11c-eval-cli-runner.md`）+ **G1c**（变体 preset+roster+honesty，phase-misc，`./G1c-variant-presets-tool-roster.md`）。G1b re-block on 三者；ship-default + per-model-routing 雾（map Not-yet-specified）持留，WHY 更新为「real-ODPS 执行路径未建」。**〔2026-08-21 maxc de-risk〕**：真 ODPS 硬门的「cred provisioning + intranet reachability」sub-blocker 已解——本机 maxc（`~/.maxc/config_ieu_cdm.yaml.bak` valid）可达 ieu_cdm、case 037 expected SQL 重跑返 4336（数据 preserved）。P4c 改 maxc-backed sidecar（替 stand-in，Provider 不变；ieu_cdm 单 config 覆盖全 5 scope——scope 在表名 `dws_<scope>_` 内非独立 project），buildable、不再外部 cred-blocked。G1b 仍 re-block on P4c（建）+ P11c + G1c——硬门从「外部 cred 不可得」降为「内部 build 待做」。

**执行范围 prereq 映射**：step 1（建变体 preset）→ G1c；step 3（execution-match + honesty）依赖 P4c（真 ODPS）+ G1c（honesty tagging）；step 4（staged 跑）via P11c runner（P11b 库 + P11c runner，待建；P11 proto throwaway 仅验编排逻辑非真执行）。step 2（模型探针）是唯一可独立先跑的一步（key 可得），可在 P4c/P11c/G1c 闭合前作 de-risk 子任务。

## 执行范围（hold G1 设计作 protocol）

1. **建变体 preset**（→ G1c；A=P7b 已有，须建 B/C/D）：
   - **B** = 自由 ReAct + planning group（goal/todo，**不含 plan-mode**=B_core；plan-mode 作 B-内部 Level-2 条件跑）。preset：persona + 全数据工具 + planning group、**无** phase-gate 插件。
   - **C** = 混合（四阶段 + planning group，goal/todo 进 U+I 的 guard 白名单=C_prior；C_all/C_none 作 Level-2）。依赖 P7b 真 phase-gate + P13 真 critic。
   - **D** = 裸 ReAct（persona + 全数据工具，无 planning、无 phase-gate）。地板基线。
2. **模型矩阵前置探针**：探针全 10 dashscope 模型（`../../research/p2-dashscope-wire.md` 清单 + GET /api/v1/models），map 哪些返 reasoning_content（思考）+ 能力档位（弱/中/强）；qwen3.7-max reachability 先探（ping 不通则弃）。据探针选 **Config T（思考轴：非思考 vs 思考~同能力）+ Config C（能力轴：弱→中→强~同思考）**，并集 ~4-5 模型。
3. **eval case 集**：RBI 161 case（5 scope、同游戏/schema）→ 标注线性/迭代 tag（RBI 不标）→ 分层(complexity L1-L4 + intent 7 + 线性/迭代)代表性 ~30 子集。判分 = execution-match（跑 agent 最终 SQL 对照 expected.result_value，需 P4c 真 ODPS）+ declined 从 agent 终态推（需 G1c honesty tagging，RBI L3 未跑）。
4. **staged 跑**（via **P11c runner** = P11b 库 + P11c CLI/持久化/pass_at_k，待建；复用 rbi-eval AgentResponder/MultiTurnSession/pass_k 编排 + dsh-llm-replay。P11 proto throwaway 仅验编排逻辑非真执行）：
   - **Stage 1** = 全 {A,B,C,D} × Config C（能力轴、ship 相关、~3 模型）× ~30 case × pass_k=3 ≈1080 run，完整因子。
   - **Stage 2** = + Config T（思考轴、~2 模型）×{A,B,C,D} ≈360-720，**条件跑**——仅当 Stage 1 显最佳变体随模型分歧>5pp。
5. **控制**：pass_k=3 / case~30 / infra health 门+有界重试+infra 失败单独标 / 每格单模型（A per-phase 混搭剥离作 Level-2）/ 变体仅差编排（base persona+数据工具+模型+case 跨变体恒定）/ 固定温度 / 公共预算上限 max 60 LLM calls+max 20 turns per case / 配对（within-subject）。
6. **应用决策规则 + 报告**：ship 主指标（答案正确率，correct/declined/wrong 三分）最高变体；top-2 实际等效(≤3pp)→ship 更简；配对 bootstrap+McNemar 报 effect size+CI。出 ship 推荐 + per-model breakdown。实际「改 da 默认」=毕业下游决策票（fed by 本报告）。
7. **Level-2 条件精化（若触发）**：C per-phase（C_none=A / C_prior U+I / C_all，触发=Level-1 交互显著）/ B plan-mode（B_core vs B+plan-mode，触发=B 欠结构）/ A per-phase model-mix（触发=A 有竞争力）。

## Blocked by（re-blocked 2026-08-21）

- ~~**P4c**（真 ODPS 执行路径：maxc-backed sidecar + guard chain + tool-query Consumer/query_data）~~ — **✅ resolved**（P4c(a) maxc-backed sidecar `36d78f43b7` + P4c(c) query_data tool `1e637bc568`；真 ODPS execution-match substrate proven，smoke tool→4336）。
- ~~**P11c**（eval CLI runner + 持久化 + pass_at_k 报告）~~ — **✅ resolved (2026-08-25)**（`packages/eval/eval-cli/` ship：CLI runner + context + report + p15-probe；G1b 已在用它跑矩阵）。
- ~~**G1c**（变体 preset B/C/D + 共享 data-tool roster 补完 + honesty tagging——A 自身仅 `search_data_sources` 注册，query_data/load_*/present_* 全注释 TBD；B/C/D 不存在）~~ — **✅ resolved**（G1c 2026-08-21 ship B/C/D + roster；load_* 2026-08-21 ship；present_* 2026-08-26 ship commit `6f2217f730`；A roster 全 runnable）。
- ~~P7b/P11b/P13b/G1~~（全 resolved 2026-08-20，但**不足**：P7b 接 phase-gate 编排但 gate 的数据工具多为未注册 stub；P11b 是库无 runner；P13b 是 NL→SQL+critic 但 agent 没法执行 SQL）。

## 前置

- **G1**（resolved 2026-08-20，实验设计 11 决策，`../phase-misc/G1-pipeline-vs-goal-todo.md`）。
- **P7**（resolved，变体 A as-is prototype `../../prototypes/p7-four-phase-preset/`）。
