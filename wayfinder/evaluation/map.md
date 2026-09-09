# wayfinder:map — dsh-data-agent evaluation

> 本地 markdown tracker。子 ticket 在 `tickets/`，研究笔记在 `research/`。本 map 是**索引**，非存储——决策详情在其 ticket / 研究笔记。
> **管理权**: 本 map 自 2026-09-06 起是 **evaluation** 工作的管理 map。历史 eval 票(`P11*`/`R3`/`G2`/`GA-EVAL-*`/`GA-EXP*`/`GA-GRILL*`)仍物理存于 `wayfinder/data-agent/tickets/`(phase-4 + phase-misc),本 map 引用之;**新方向票用本 effort 自己的 R/G/T/P 命名空间**,存于 `wayfinder/evaluation/tickets/`(非 GA-——GA 专指 2026-08-31 通用性审计)。
> **来源**: 两轮 frontier 研究(round 1 五角度 + round 2 五新角度 = 11 方向);2026 引用经 spot-check(TrustJudge 2509.21117、AgentCompass 2607.13705、GradeSQL 2606.30851 已验真实),臆造项已弃("More Convincing..." 2607.05904、"Noisy but Valid" 2601.20913)、待核项已标。

## Destination

把 dsh-data-agent 的 evaluation 从"判官说对就是对"推进到**可信评估栈**:执行级 ground truth → 校准/重写判官 → 显著性与功率 → 多维(错误结构/鲁棒性)→ 多轮轨迹。以 dual-score(execution + judge)的 gap 可量化、pass^k 带 CI、judge false-pass <10pp 为阶段验收。

> **⚠ 既有百分数全体失效（2026-09-08，G1 v3 D4/D6）**。不要再引用 73.7% / 61.9% / 12.8% / 35.9pp 作为基线：
> - **模式不可恢复**：`eval-results/` 内仅 **4 个批量 run 带 `config`**，其余 35 个（**含全部 168-case run**）连 `config` 都没有。**从未有任何一次完整 168-case run 真连过数仓。**
> - **便宜模式虚高已测出**：同 39 case / 同 qwen3.7-max / 同 `pass_k=3`，judge-only 61.5% vs real-exec 5.1% —— **56.4pp**。
> - **12.8% 那条也已污染**（G1 v1）：它测在那 39 个 case 上，而其中 16/18 event 期望值与自身 `expected.sql` 不符。
> - **语料本身不合格**（D6）：143 个 EXECUTION case 零参考 SQL，其中 86 个只断言行数。
> 因此 T1 后需**重建基线**，不是与旧数字对比。

## Notes

- **域**: evaluation 框架(`packages/eval/`)的可信化与扩展。data-agent 的 eval 子流,独立成 wayfinder effort(同 `semantic-layer` 先例)。
- **职责**: evaluation 拥有 ground-truth provenance、snapshot identity、result normalization、comparator policy、评分与 evidence 语义；SQL 提交、scope routing、credentials、provider error 和 backend lifecycle 复用 dsh-data-agent 的 `@deepseek-ai/dsh-query` capability（`ctx.query.execute`），不在 evaluation 重建 warehouse executor。Rationale 见 [Evaluation 通过 query capability 执行 SQL](../../.agents/notes/proposed/testing/2026-09-07-evaluation-query-capability-boundary.md)。
- **每会话应查 skills**:`research`(认读论文/调查)、`grilling`+`domain-modeling`(决策)、`prototype`(新 seam 原型)、`tdd`(impl)。
- **执行流程**（按领域分流，2026-09-09）：**后端方向（1/9/10-拆分）的 impl 本地直接做**（起 worktree→改码→跑本仓真门→更新票/map/audit-log）；**只有 ML-eval 方向（2/3/4/5/6/7/8/11 + 10-Goodhart）的跟-eval 实验票才考虑 SPEC→rubric→另环境**。G/R认读/P 一律本环境。详见 [`playbook.md`](playbook.md) §1.1（流程权威，不写进本 map）。
- **常设原则**:
  - **每方向先 R 票认读分析论文**(产 `research/<slug>-papers.md`,持久化关键 claim + 对本仓映射)→ 再 grilling → impl → experiment R。grilling 必须有论文分析在手。
  - **引用只引已验证论文**(见 §验证 TODO);进 ticket 前待核项须 primary-fetch arxiv.org(本环境 403,换网络/人工核)。subagent 输出 = 凭记忆断言,未验证前不进产物。
  - **实验数字入 `research/experiment-audit-log.md`**(本 effort 独立 log;历史 eval 实验在 `wayfinder/data-agent/research/experiment-audit-log.md`,本 map 引用)。
  - **允许重构**(2026-09-07 起,取代原 additive-only):eval 模块的历史包袱可以丢。两栈并存是撞车产物而非设计([G1](tickets/G1-exec-grader-seam.md) 发现 ①),重复的编排层该删。约束不是"不许改",而是三条:①任何行为变化必须带一次记录在案的 re-baseline;②包边界重切归 R10→G10,不在单票内顺手做;③已测且论文对齐的部分不重写(如 `classify_failure` 的 infra/model 分离,四套基准一致同意)。
  - **反循环**:expected 值须真实执行推导或人写,禁止 LLM 生成"正确 SQL"作 ground truth(会把系统当前错误固化为答案)。
  - 一票一 session+worktree;ticket 头声明 `Branch: <type>/<id>-<slug>`;改完逻辑单元立即 commit、绝不 `git add -A`。

## Decisions so far

| 票(loc) | Type | Resolved | 一句话 |
|---|---|---|---|
| P11/P11b/P11c (phase-4) | prototype | 2026-08-20~25 | eval harness + CLI runner + 持久化 + pass@k |
| P11d (phase-4) | prototype | 2026-08-26 | 5 维 LLM-judge(table/field/filter/aggregation/overall,0.6 阈),dual-score |
| P11e (phase-4) | task | 2026-08-26 | K11-v2 case set + 反作弊四验收标准 |
| G2 (phase-4) | grilling | 2026-08-20 | TS 重实现非 Python;DELIVERY/EXECUTION 判分 |
| GA-EVAL-REAL-EXEC (phase-misc) | task | 2026-09-04 | 首个真执行基线 12.8%;dual-score 测 judge false-pass 35.9pp(73.7% 假通过) |
| GA-EVAL-SQLGEN-PROMPT-FIX (phase-misc) | task | 2026-09-05 | 34% 非 SQL 发射→0%;real-exec 12.8→7.7(假设证伪,真瓶颈=SQL 正确性/eventDef) |
| GA-EVAL-SQLGEN-FOLLOWUP (phase-misc) | grilling | 2026-09-06 | post-prompt-fix 分歧根因=judge-leniency+anti-flakiness×feedback-gap+event-case 瓶颈(非 prompt 退化);chart (a)+(d) 2 impl 票 |
| GA-EVAL-RETRY-FEEDBACK (phase-misc) | task | 2026-09-06 | wire retry feedback 进 prompt(# 上次失败反馈);wiring 正确+unit-proven,但 judge-only null-SQL 22→21/pass 56.4→53.8(均 noise)— (d) alone 有界,需 (a) 组合给 schema |
| GA-EVAL-EVENTDEF-PREFETCH (phase-misc) | task | 2026-09-06 | (a) event_view grounding 落地并证明生效(null-SQL 21→13,−38%;119 生成 SQL 与 reference 逐字一致);检测标定 TP=6/FP=0/TN=21/FN=12(召回上限=453 事件仅 6 个有 `alt_labels`);**但查出两处仪表缺陷** → GA-EVAL-CASESET-EVENT-ANCHOR + judge 用 BM25 候选当 schema context |
| GA-EVAL-CLEAN-RERUN (phase-misc) | task | 2026-09-04 | uniform clean pass^k = 61.9%(104/168) |
| GA-EVAL-REBASELINE (phase-misc) | task | 2026-09-03 | pass^k 语义落地;52.4%→61.9%;item4 token usage open |
| GA-EVAL-MANIFEST-impl (phase-misc) | task | 2026-09-03 | 三 eval 包 manifest 合规 |
| GA-MODEL1 (phase-misc) | task | 2026-09-03 | qwen3.7-max 默认化(+16.1%,延迟 +48.9%) |
| GA-EXP2/3/4 (phase-misc) | research | 2026-09-02~03 | prompt 语言实验:中文保留 |
| GA-GRILL2 (phase-misc) | grilling | 2026-09-03 | Kind 1 英文化 won't-do → GA-EXP5 |
| [R1 — 执行级评分与非循环 ground truth 论文认读](tickets/R1-exec-grader-papers.md) (evaluation) | research | 2026-09-07 / **v3 重做 09-08** | execution match 无统一语义；G1/G1b 须定义逐 case、可版本化 policy 与非循环 provenance，默认 profile 交 R23 实测。**v3（网络可用后重做）**:6 个 arXiv 编号经权威 API 验真;`2606.30851` 真标题为 *Test-Time Verification for Text-to-SQL via Outcome Reward Models*(GradeSQL 是框架名);143 个 EXEC case 只用 2/5 模式(`row_count_range` 86 + `scalar_exact` 57);GradeSQL **丢弃**执行报错候选而非记答错 |
| [R24 — eval 包级合并可行性](tickets/R24-eval-package-consolidation.md) (evaluation) | research | 2026-09-08 | 一套 eval 引擎存两份（两份 `runBatch`、两份 health gate、两份比较器、两份已分叉的 adapter）；合并**无循环依赖**且为 benchmark-agnostic 铺路，但包边界移动触及仓外 5 处消费者 → 去重归 T1、包重组归 T12 |
| [G1 — Execution grader seam](tickets/G1-exec-grader-seam.md) (evaluation) | grilling | 2026-09-07 | 锁 6 条架构无关决策(三事实分离/execution 主裁决/gold 失败=benchmark infra/端口一函数/provenance 由 grader 装配/截断与耗时自己观测);包边界与 case schema 归属移交 R10→G10。查出:两栈并存是撞车非设计、`mapQueryOutcome` 从未被调用、infra 失败被计为模型失败、**loader 静默丢弃 39 个 case 已有的 reference SQL 与快照锚点**(→ T11) |
| ↑ **同票 v3 重做并合并** | grilling | **2026-09-08** | D1 结局四分 + `not-measured`（pass/fail/environment-blocked/case-defect）;D2 一能力一实现（包边界不动→T12）;D3 seam = `normalizeOutcome` + `gradeExecution` 两纯函数 + 可落盘 artifact（R23 需离线重打分）;D4 **judge 永不填 execution**、模式必须落盘（测出 56.4pp）;D5 G1 管机器/G1b 管语料;D6 **当前 EXECUTION 语料不合格、需重建**。合并裁定：归一位置取 v3、端口纪律取 v1；v1 修正 v3 两处（provider 声明不可当证据、provenance 由 grader 装配） |
| [T11 — loader provenance strip](tickets/T11-loader-provenance-strip.md) (evaluation) | task | **2026-09-09** | loader 保全 `expected.sql`/`meta.anchor_ds`/`tier`/`provenance`/`schema_version`；结构位置改 `strictObject`（未知键报错）而 `meta`/`dimensions` 保留自由形式溯源；新增 `resolveReferenceSql` 按 case 自己的 `anchor_ds` 解析模板（封闭占位符集 + 三种显式拒绝）。**不带模板的 2 个 case 与不带 `anchor_ds` 的 2 个是同一批**。闸门：真 maxc 重跑 39-case 对账，event MATCH=2/STALE=16、dws 13/0，与 2026-09-06 逐位相同 |
| [T1 — Execution grader 实现](tickets/T1-exec-grader-impl.md) (evaluation) | task | **2026-09-09（部分）** | 11 条属性中 9 条完成：单一 `ExecutionPort`、结局五分、`normalizeOutcome`/`gradeExecution` 两纯函数 + artifact（raw/normalized digest + 配置化行数上限）、judge 不再写 execution、`environment-blocked`/`case_defect` 出模型分母、执行器身份+policy 随 run 落盘、`compare.ts` 拒渲染、adapter/比较器/`QueryResult`/audit 执行路径去分叉。**未完 3 项**：两份 `runBatch`、两份 health gate、`eval-cli` 去 provider 直连（纯删除，与本批三处行为变更叠加会使归因不可分辨）+ 截断信号仍未实测。闸门：MATCH 复现（event 2 / dws 13，dws 21/21 逐 case 值一致）；**列语义翻面 0 个**（可解释：取首行首格，名键模式 0 使用）；**`environment-blocked` 2 个**（event 123/126，wait=300 仍超窗）。覆盖面仅 **57 个 `scalar_exact`** |

## Open frontier(未解,票在 `wayfinder/data-agent/tickets/`)

| 票(loc) | Type | Status | 核心 | blocked-by/blocks |
|---|---|---|---|---|
| GA-EVAL-EXPAND | task | open | n=168 MDE 5.4-10.1pp;需 n_d≥85;全部 EXEC expected 由真实执行推导（k11-v2 当前 0/168 带 expected.sql;**但 `rbi-10000251-exec` 39/39 已带,只是被 loader 丢弃** → T11），25 个 DELIVERY case 豁免;**D6（2026-09-08）起改为「重建」而非扩充**——143 个 EXEC case 的 expected 须由人写参考 SQL 在钉住快照上执行派生，重建前算 MDE 无意义 | by R23、T11、**G1b 重建决议**;blocks GA-EXP5 |
| GA-EXP5 | research | open | 2×2×2 全因子 8 臂语言相关性 | by GA-EVAL-EXPAND |
| GA-EXP1 | research | open·high | LLM-driven 表推断 vs 启发式;judge 校准从未执行 | — |
| [GA-EVAL-CASESET-EVENT-ANCHOR](../data-agent/tickets/phase-misc/GA-EVAL-CASESET-EVENT-ANCHOR-stale-expected-values.md) (phase-misc) | grilling | open·**high** | event case 期望值不是冻结锚点:实跑每个 case 自己的 `expected.sql` 对账 → **event 16/18 已不符、DWS 13/13 相符**(ODS 视图历史分区不冻结,DWS T+1 算完即冻);推翻既有结论(119 的 552、136 的 482 曾被记为模型错值,实为 reference SQL 今天的值);5 个候选口径 (A) 重锚 /(B) 容差 /(C) 冻结物化快照 /(D) event 退出 execution_match /(E) 相对锚,均不免费。工具 `packages/eval/eval-cli/dev/case-expected-value-audit.mjs` | blocks 任何用 real-exec `execution_match` 衡量 event-case 正确性的测量;blocks GA-EVAL-EXPAND 功效计算 |
| GA-EVAL-REBASELINE item4 | task | open | token usage interceptor | — |
| GA-GT4 | task | open | eval 去 K11(FailureClassifier+多引擎);**被本 map G9/G10 结构化** | — |

## Frontier directions(11;每方向:R 认读分析论文 → G grilling → T/P impl → R experiment)

> 排序按对 73.7% false-pass 危机的杠杆。每条给:**做什 / 已验证论文 / 票链**。R(n) 为认读分析票(AFK,产 research note),G(n) grilling(HITL),T(n) impl(AFK TDD),P(n) prototype,R(m) experiment。

### 1. 执行级评分 + 非循环 GT 溯源(linchpin)
做什:EX grader 通过 evaluation adapter 复用 `ctx.query.execute` 并归一结果集；evaluation 只拥有评分、ground truth、policy 与 evidence。为 143 个 EXEC cases 派生非-LLM expected result(human-reviewed `expected.sql`+snapshot identity)，25 个 DELIVERY cases 保持非 execution，退役 34 手挑圆整数，接受多种显式声明的等价结果。
论文:Spider(1809.08887,**原文明写不提供 Execution Accuracy**)、**distilled test-suite(2010.02840,Zhong/Yu/Klein EMNLP 2020——test-suite accuracy 属这篇独立论文,不是 Spider 1.0 的一部分**)、BIRD(2305.03111)、Spider 2.0(2411.07763)、Northcutt(2103.14749)、GradeSQL ORM(2606.30851 ✅验,真标题 *Test-Time Verification for Text-to-SQL via Outcome Reward Models*——GradeSQL 是其框架名;**执行报错的候选被丢弃而非记答错**)。全部经 R1 primary-fetch(arXiv API 元数据 + PDF 全文)确认。
票链:[**R1 — 执行级评分与非循环 ground truth 论文认读**](tickets/R1-exec-grader-papers.md)（resolved）→ 并行 [**G1 — Execution grader seam**](tickets/G1-exec-grader-seam.md)（resolved）+[**G1b — Ground-truth lifecycle**](tickets/G1b-ground-truth-lifecycle.md)→ [**T11**](tickets/T11-loader-provenance-strip.md)（**resolved 09-09**）+[**T1-exec-grader-impl**](tickets/T1-exec-grader-impl.md)（**implemented 09-09，核心已落、三项转 T12**）→ [**R23 — Comparator-policy mutation baseline**](tickets/R23-comparator-policy-mutation-baseline.md)（**下一步**）→ [**GA-EVAL-EXPAND**](../data-agent/tickets/phase-misc/GA-EVAL-EXPAND-case-set-power.md)→ 条件 **G12-exec-orm-verifier**+**R12-exec-orm-baseline**（用执行结果训 ORM 替代 judge）。

### 2. Judge 重写:blind-solve-then-score(根因)
做什:两阶段——judge 先独立推导+提交 expected 维度再看候选;候选对已提交 reference 比对而非自评 plausibility;目标 false-pass 35.9pp→<10pp。
论文:MT-Bench(2306.05685)、One Token to Fool(2507.08794)。⚠ 弃:"More Convincing..."(2607.05904)臆造。
票链:**R2-judge-blind-papers** → **G2-judge-blind-rewrite** → **T2-judge-blind-impl**(扩 P11d)→ **R13-judge-blind-baseline**。

### 3. Judge 校准 + gated dual-score
做什:按维分解 73.7%;39-case 集即校准集估 per-dim TPR/FPR;0.6 阈→variance-corrected;pass^k 输出 CI;sql_judge gated。
论文:Alternative Annotator Test(2501.10970)、Causal Judge Eval(2512.11150)、MT-Bench(2306.05685)。⚠ 弃:"Noisy but Valid"(2601.20913)臆造。
票链:**R3-judge-calibration-papers** → **R14-judge-falsepass-by-dim**(experiment,便宜既有数据分析,**unblocked**)→ **G3-judge-calibration** → **T3-calibration-impl** → **R15-calibrated-rebaseline**。

### 4. Power-aware eval + 显著性层
做什:sample planner 跑前算 McNemar MDE + n_d≥85;compare.ts 出 点估计+McNemar p+95%CI+n_d+power+MDE;缺 n_d/p 拒渲染;重跑 EXP2/3/4。
论文:pass@k 无偏估计(2107.03374)、Self-Consistency(2203.11171)、A Sober Look(2504.07086,COLM 2025)。
票链:**R4-significance-papers** → **G4-significance-contract** → **T4-sample-planner-impl** + **T4b-significance-impl**(与 CL2 同文件不同处)→ **R16-significance-rerun**。

### 5. 污染审计 + 动态 case pipeline
做什:Min-k% Prob + canaries + 客观 GT 重打报 Δ;CaseGenerator 带 provenance 时间戳;月度 slice k11-v3-YYYY-MM held out 作主指标;P11e 验收门。
论文:LiveBench(2406.19314)、LiveCodeBench(2403.07974)、LiveXiv(2410.10783)。⚠ 待核:CoreEval(2511.18889)、SWE-bench-Live(2505.23419)。
票链:**R5-contamination-papers** → **R17-contamination-audit**(experiment,by T1 客观 GT)→ **G5-dynamic-case-pipeline**(grilling,supersedes GA-GT4+GA-EVAL-EXPAND,须先调和)→ **T5-dynamic-cases-impl** + **T5b-evolving-slice-impl**。

### 6. 轨迹级评分 + 多轮 NL2SQL 基准(scope 扩展)
做什:per-turn 5-phase rubric + process-pass^k 配 outcome-pass^k + failure tag;seed 50-100 多轮 session(4 archetype)+ triadic + partial-credit。
论文:τ-bench(2404.04453,NeurIPS 2024)、AgentBench/SWE-bench/WebArena。⚠ 待核:DySQL-Bench、Claw-Eval(2604.06132)、AgentAtlas(2605.20530)。
票链:**R6-trajectory-papers** → **G6-trajectory-scoring**(extends R3 data-agent)→ **P1-trajectory-prototype**(prototype 先验)→ **T6-multiturn-cases** → **R18-trajectory-baseline**。

### 7. Step-level PRM + step-vs-final 分歧(新评分范式)
做什:对 pipeline 四步(intent-routing/schema-linking/SQL-draft/critic-revision)用 learned PRM 逐步打分;主指标=step-vs-final 分歧;避开 Qwen PRM 警告(MC ∩ LLM-judge consensus)。
论文:Let's Verify Step by Step(2305.20050)、Math-Shepherd(2312.08935)、Qwen2.5-Math-PRM(2501.07301)、Process Supervision MC Net Info Gain(2603.17815,ICML 2026,**唯一覆盖 SQL**)、Controllable Process Data Synthesis(2605.02395)。**无 published SQL step-PRM——开放赛道**。
票链:**R7-step-prm-papers** → **G7-step-prm** → **R19-step-prm-divergence**(experiment,by T1 校准 oracle)。

### 8. Pairwise/rubric-anchored judge + RADAR 冗余审计(补强 2/3)
做什:pairwise(候选 vs reference 逐维 head-to-head + 位置 swap)+ Bradley-Terry/Elo pass^k;或 rubric-anchored 逐维 isolated pass + gated graph。**Quick win:RADAR 跑现 5 维**——很可能 2-3 维测同一 latent "plausibility"=0.6 通胀根因,先塌成 gated 3 维。
论文:TrustJudge(2509.21117 ✅验,pointwise vs pairwise 23.32% 不一致)、Am I More Pointwise or Pairwise(2602.02219)、Grading Needs a Rubric Not Intelligence(2608.17938,answer 解释 95.6% 方差)、SARA(2608.14684,多 rubric 单 pass 仅 1/3 一致)、Graph-Structured Rubrics(2608.12097,gating)、RADAR(2608.01810,preflight coupling)。
票链:**R8-pairwise-judge-papers** → **R20-radar-redundancy**(experiment quick win,**unblocked**)→ **G8-pairwise-judge** → **T7-pairwise-judge-impl**。

### 9. Error taxonomy / FailureClassifier(closes GA-GT4)
做什:FailureClassifier 接口 + 跨引擎错误模式注册(PG/Snowflake/BigQuery/MaxCompute);syntax vs semantic(AST/gold diff);AttemptResult.errorType + compare.ts error-mix 直方图。
论文:SAL(2607.22572)、SQL-of-Thought(2509.00581)、Heterogeneous-Enterprise-DBs(2606.31041)、Text-to-SQL Survey(2408.05109)。⚠ secondary-only 不引:NL2SQL-BUGs。
票链:**R9-error-taxonomy-papers** → **G9-failure-classifier**(grilling,supersedes GA-GT4)→ **T8-failure-classifier-impl**(扩 classify_failure/verdict_mapper)。

### 10. Harness Benchmark/Harness/Environment 拆分 + Goodhart 审计(de-K11 架构答案)
做什:AgentCompass 三件套拆 eval-cli——K11-v2 移出版本化 benchmark-pack;eval-runner+MultiTurnSession benchmark-agnostic;加 LiveK11 pack;compare.ts 出 Goodhart Δ(K11-train vs heldout vs fresh);Arena-Hard 式 style control+separability+95%CI;dye-pack sentinel。
论文:AgentCompass(2607.13705 ✅验,B/H/E 拆分)、HELM(2211.09110)、BIG-bench(2206.04615)、Arena-Hard/MT-Bench(2306.05685)、WildBench(2406.04770)、LED(2602.01698,GRPO 升 pass@1 塌 pass@n=pass^k 上的 Goodhart)、Data Laundering(2412.15255)、MMLU-CF(2412.15194)、LLMs-Get-Lost(2505.06120)。
票链:[**R10 — Harness/Goodhart 论文认读**](tickets/R10-harness-goodhart-papers.md)（**下一 session 起这张**）→ [**G10 — Harness B/H/E 拆分**](tickets/G10-harness-bhe-split.md)(grilling,supersedes GA-GT4 架构面;**持有 G1 移交的包边界/case schema 归属**)→ **T9-bhe-split-impl** + **R21-goodhart-audit**(experiment,by T1)。

### 11. Robustness/perturbation(consistency@k)+ IRT active sampling(新维度+power 解)
做什:自动产 paraphrase + schema-perturbed 变体测 consistency@k(第 6 维);LaRT/IRT CAT 主动采样——cheap probe 估 per-case discordance p̂,预算砸 near-boundary(p̂≈0.5)→ ~40 case×3 run 出 n_d≥85,比 168 flat 更少 run 更高 n_d。
论文:Prompt Perturbation/Comparison Graphs(2606.17634)、What Predicts Correctness in Text-to-SQL(2607.06799,self-consistency 0.675 AUROC,ensemble 0.82,abstention 27%@24%risk)、LaRT(2512.07019,IRT+CAT)。⚠ secondary-only 不引:Spider-SYN/DK/ADVETA/Dr.Spider、IRT-safety-bench(2606.20626)。
票链:**R11-robustness-sampling-papers** → **R22-consistency-at-k**(experiment)→ **G11-irt-sampler** → **T10-active-sampler-impl**(与方向 4 互补)。

## Ticket index

**Historical(在 `wayfinder/data-agent/tickets/`)**:见 §Decisions so far + §Open frontier。

**新票(在 `wayfinder/evaluation/tickets/`,本 effort R/G/T/P 命名空间)**:
- **R(认读分析论文,AFK,产 research note)**:[R1](tickets/R1-exec-grader-papers.md)(resolved v3)、R2-judge-blind-papers、R3-judge-calibration-papers、R4-significance-papers、R5-contamination-papers、R6-trajectory-papers、R7-step-prm-papers、R8-pairwise-judge-papers、R9-error-taxonomy-papers、[R10](tickets/R10-harness-goodhart-papers.md)、R11-robustness-sampling-papers、[R24](tickets/R24-eval-package-consolidation.md)(resolved,仓库取证)。
- **R(experiment,AFK,数字入 audit-log)**:R12-exec-orm-baseline、R13-judge-blind-baseline、R14-judge-falsepass-by-dim、R15-calibrated-rebaseline、R16-significance-rerun、R17-contamination-audit、R18-trajectory-baseline、R19-step-prm-divergence、R20-radar-redundancy、R21-goodhart-audit、R22-consistency-at-k、[R23](tickets/R23-comparator-policy-mutation-baseline.md)。
- **G(grilling,HITL)**:[G1](tickets/G1-exec-grader-seam.md)(resolved)、[G1b](tickets/G1b-ground-truth-lifecycle.md)、G2-judge-blind-rewrite、G3-judge-calibration、G4-significance-contract、G5-dynamic-case-pipeline、G6-trajectory-scoring、G7-step-prm、G8-pairwise-judge、G9-failure-classifier、[G10](tickets/G10-harness-bhe-split.md)、G11-irt-sampler、(+G12-exec-orm-verifier 条件)。
- **T(impl,AFK TDD)**:[T1](tickets/T1-exec-grader-impl.md)、T2-judge-blind-impl、T3-calibration-impl、T4-sample-planner-impl+T4b-significance-impl、T5-dynamic-cases-impl+T5b-evolving-slice-impl、T6-multiturn-cases、T7-pairwise-judge-impl、T8-failure-classifier-impl、T9-bhe-split-impl、T10-active-sampler-impl、[T11-loader-provenance-strip](tickets/T11-loader-provenance-strip.md)(G1 产出,**阻塞 T1 与 G1b**)、[T12-eval-package-consolidation](tickets/T12-eval-package-consolidation.md)(G1 D2 产出,blocked by T1+G10)。
- **P(prototype,HITL)**:P1-trajectory-prototype。

> **已建票文件 10 张**:R1、R10、R23、**R24**、G1、G1b、G10、T1、T11、**T12**。其余仅在本 map 点名——问题尚未 sharp,**不预先切割 fog**(判据是「能否现在精确陈述这个问题」,不是「能否现在回答它」)。

## 推荐认领顺序

### 本批已完成（2026-09-09）：T11 + T1 同批落地

**一句话**：让评测能"真的把候选 SQL 跑出来跟答案比"，而不是让另一个大模型读 SQL 文本猜对错，并且把"模型答错"跟"数仓没答/case 本身坏了"三件事分开记。

**为什么要做**：改之前有三处会误导结论——(1) 没接数仓时，评测用"大模型看 SQL 打分"顶替真执行，同一批 case 同一模型下这样测出来的通过率比真执行**虚高 56.4 个百分点**；(2) 数仓连不上、超时、或 case 期望值本身写错，都被记成"模型答错"，冤枉模型、污染分母；(3) 判分证据只存前 5 行，事后无法复算，尤其占多数的"只数行数"类 case。

**做了什么**：把执行判分收敛成一条正规通路——单一执行端口（复用 `ctx.query`，不重写执行引擎）+ 归一/判分两个纯函数 + 可落盘的证据 artifact（带 digest 与配置化行数上限，供 R23 离线重打分）；结局从"对/错"两分改成**五分**（对/错/环境挡住/case 坏了/没测），后两类不进模型分母；judge 分数只并排报告、永不填执行维度；每次 run 把"用了哪个执行器、什么判分策略"写进结果文件，`compare.ts` 拒绝渲染说不清自己怎么测的 run。同时把重复的适配器/比较器/`QueryResult` 收成一份，loader 也不再静默丢掉 39 个 case 自带的参考 SQL 与快照锚点。

**效果（在真数仓上验证，非假设）**：39-case 对账在真 maxc 上复现旧结论（event 命中 2、dws 命中 13，dws 21/21 逐条一致），证明换通路没引入语义偏移；**列名 vs 列位 的判分翻面 0 个**（可解释：活跃语料用不到会翻面的模式）；**2 个 event 查询超时被正确归为"环境挡住"**而非"模型答错"（旧路径会错记成"语料陈旧"）。上线真执行判分覆盖 **57 个 scalar_exact case**；86 个只数行数的 case 待 G1b 重建语料，25 个 DELIVERY-only 记"没测"——**没有**"143 个 case 已被执行级评分"这种说法。

**留下的尾巴**（已在 [T1 票](tickets/T1-exec-grader-impl.md) Resolution 逐条记录，转出而非遗漏）：两份 `runBatch`/两份 health gate 的删除、`eval-cli` 去掉对 provider 的直连（纯删除，与本批的判分语义变更叠加会让"数字动了是哪件事引起"说不清，故转 [T12](tickets/T12-eval-package-consolidation.md)）；截断信号仍缺一个超大结果集来实测。

---

**linchpin 仍是 T1(EX grader)**——它是 R14/G3/R17/G9/G10/R21 的校准 oracle 与客观 GT 来源。**2026-09-09 修正前置判定**（依据：G1 已在 09-08 完成 v3 重做并合并，D2 把包边界移出 T1）：

**硬前置只剩一个** —— **[T11](tickets/T11-loader-provenance-strip.md)**（AFK impl，**2026-09-09 已 resolved**）：loader 丢弃 39 个 case 已有的 reference SQL 与快照锚点，T1 的「可重放证据」与「gold 失败=benchmark infra failure」两条验收面在此之前无法成立。二者**同批落包，T11 先完成全部验收再起 T1**（已按此顺序完成）。

**原列的另两个前置降为软前置**：

- ~~R10 → G10 定包边界~~——D2 定下 **T1 不动包名与 exports**（仓外共 5 处消费者），包级重组另开 [T12](tickets/T12-eval-package-consolidation.md)（blocked by T1+G10）。新代码落在 `dsh-eval`（被测比较器已在此），G10 日后重切时随 T12 一起搬。故 **T1 不必等 R10/G10**。
- GA-EVAL-CASESET-EVENT-ANCHOR——它 blocks 的是数字的**解读**，不是实现：本批以「复现 39-case 的 MATCH/STALE 计数」为验收，不以 pass 率为验收；任何 pass 率解读须标注「event 口径未定」。

**现在 unblocked(AFK 可自跑,先开,为 grilling 做数据/论文前置)**:
1. ~~**T11 + T1 同批**~~（**2026-09-09 已完成**；下一步推荐 R23）——T1 的可落盘 artifact + raw/normalized digest 已就位，R23 可直接用存量 artifact 离线重打分
2. **R10-harness-goodhart-papers**(认读)——解 G10（case schema 归属与 B/H/E 切分）；**已不再阻塞 T1**，但它 blocks T9/T12
3. **R14-judge-falsepass-by-dim**(既有数据分析,便宜)→ 喂 G3
4. **R20-radar-redundancy**(quick win,可能直接定位 0.6 通胀根因)→ 喂 G8
5. **R4-significance-papers**、**R8-pairwise-judge-papers**(认读分析,独立,便宜)

**[T11](tickets/T11-loader-provenance-strip.md) 与 T1 同批本地实现** —— T11 是 T1 唯一硬前置；方向 1 是**后端方向**，不走另环境/rubric（见 [playbook §1.1](playbook.md)），在本仓起 worktree 直接做，包内顺序 **T11 全部验收 → T1**。本仓有数仓凭证，39-case 真对账可就地跑。

**HITL grilling(你,先开)**:~~[G1 — Execution grader seam](tickets/G1-exec-grader-seam.md)~~ 已 resolved(2026-09-07);**GA-EVAL-CASESET-EVENT-ANCHOR 优先**(它 blocks 一切 event-case 的 real-exec 测量);[G1b — Ground-truth lifecycle](tickets/G1b-ground-truth-lifecycle.md) 已由 R1 解锁,但须先吸收 G1 发现 ④——**provenance schema 已存在**(`rbi-10000251-exec` 39/39 带 `expected.sql`+`meta.anchor_ds`,rbi `schema_version: 3`),所以迁移分类的起点是「保留既有 schema 还是与 k11-v2 合流」,不是从零设计;G4/G2/G6 独立可开。

**AFK 级联**(各 G 解后):~~**T11→T1**~~（**2026-09-09 已完成**）;**R10→G10→T9+R21**（G10 仍持有 case schema 归属与 B/H/E 切分，但**不再阻塞 T1**）;**T1→R23→GA-EVAL-EXPAND→{R12/R17/G9}**（现以 R23 为首）;T1+G10→T12;G3→T3→R15;G4→T4+T4b→R16;G5→T5+T5b;G6→P1→T6+R18;G8→T7;G11→T10。

## Not yet specified(fog)

> 已知在 scope 内,但还问不出足够 sharp 的问题,所以不开票。frontier 推进后毕业成票。**"能不能现在精确陈述这个问题"是判据,不是"能不能现在回答它"。**

- **`match_modes` 5 枚举 → policy object 的迁移归属**。它是否与 k11-v2 / rbi 两套 case schema 的合流同属一票，要等 R10→G10 定下 benchmark / harness / environment 的切分后才问得 sharp。（原本这条雾还包含“去重与包重切的编排顺序”与“重构期间两条基线如何保持可比”，**二者已毕业**：前者拆成 [G1](tickets/G1-exec-grader-seam.md) D2 的去重验收项（T1）与 [T12](tickets/T12-eval-package-consolidation.md) 的包重组（blocked by T1+G10，证据在 [R24](tickets/R24-eval-package-consolidation.md)）；后者已由 D4/D6 裁定——**不可比，重新起锚**，见 §Destination 的失效警示。）
- **judge 用 BM25 候选当 schema context,是否是 73.7% 假通过的一个独立机制**(而非单纯 judge-leniency)。GA-EVAL-EVENTDEF-PREFETCH 记录的案例:case 135 pre-(a) 用 DWS 表时 judge 给 1.0×3 判 correct,post-(a) 用与 reference 同构的 event SQL 时 judge 给 0.4/0.2/0.2 判 wrong,原话「使用了 Schema 上下文之外的 ODS 底层表」——**仪表此前一直在奖励取错源的答案**。缺陷本身已修(`0f7b9234a2`),但它在 35.9pp 里占多少未知,须 R14 分维分解后才能问 sharp。喂 G3/G8。
- **三套失败词表的对齐**。eval `FailureClass` 5 类(`packages/eval/eval/src/types.ts:28`)、engine `FailureKind` frozen 6 类(`packages/data/nl2sql-engine/src/types.ts:96-103`,配 `RECOVERABLE_FAILURES` `:109-112` / `UNRECOVERABLE_FAILURES` `:115-120`)、provider `classifyMaxcError` 5 值(`packages/query/query-maxcompute/src/index.ts:179-181`,另有 `transport`/`retryable`/`remote` 走别的分支)——**三套互不重叠,且无 adapter 在其间翻译**。属方向 9(R9→G9)地盘,但 G1 锁定的三事实分离一落地就会先撞上它:`failureClass` 要进 `AttemptResult`,就得决定它与上游两套的映射。

## ⚠ 验证 TODO(2026 引用,进 ticket 前必 primary-fetch arxiv.org)

**已 spot-check 真实**:GradeSQL(2606.30851)、TrustJudge(2509.21117)、AgentCompass(2607.13705)。
**已 primary-URL-confirmed(WebSearch 返回 arxiv.org URL)**:见各方向论文行(2305.20050/2312.08935/2501.07301/2603.17815/2605.02395/2602.02219/2608.17938/2608.14684/2608.12097/2608.01810/2607.22572/2509.00581/2606.31041/2408.05109/2211.09110/2206.04615/2406.04770/2602.01698/2412.15255/2412.15194/2505.06120/2606.17634/2607.06799/2512.07019/2501.10970/2512.11150/2507.08794/2306.05685/2107.03374/2203.11171/2504.07086/2103.14749/1809.08887/2305.03111/2411.07763/2406.19314/2403.07974/2410.10783/2404.04453)。
**❌ 弃用(臆造)**:"More Convincing Not More Correct"(2607.05904)、"Noisy but Valid"(2601.20913)。
**⚠ 待核(未独立确认)**:CoreEval(2511.18889)、SWE-bench-Live(2505.23419)、DySQL-Bench、Claw-Eval(2604.06132)、AgentAtlas(2605.20530)、LiveAgentBench(2603.02586)、ClawArena-Team(2606.31174)、Privacy-Defenses-RAG(2608.09001)、CoDeC。
**secondary-only(不引,仅概念)**:NL2SQL-BUGs、ROSE(2604.12988)、RTS(2501.10858)、IRT-safety-bench(2606.20626)、Spider-SYN/DK/ADVETA/Dr.Spider、DyePack(2505.23001)。

## ⚠ 可复现性风险

`packages/eval/eval/cases/rbi-10000251-exec/`(39 case,GA-EVAL-REAL-EXEC 12.8% 真执行基线所依赖)**已被 git 追踪**(2026-09-07 `git ls-files` 核实——本节此前声称未追踪,该声明已过期)。根目录另有未追踪 `analyze-real-exec-gap.mjs`。

**但该基线本身已被证明污染**(2026-09-07 G1 + GA-EVAL-CASESET-EVENT-ANCHOR):这 39 个 case 全带 `expected.sql`,实跑对账后 **event 16/18 期望值已与自己的 reference SQL 不符**;且 `loadCase` 静默丢弃 `expected.sql`/`meta.anchor_ds`(→ T11),所以评分时无法发现这种漂移。12.8% 不能当作可比锚点使用,须在 T11+CASESET-EVENT-ANCHOR 之后重新派生。
