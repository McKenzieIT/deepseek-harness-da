# wayfinder:map — dsh-data-agent evaluation

> 本地 markdown tracker。子 ticket 在 `tickets/`，研究笔记在 `research/`。本 map 是**索引**，非存储——决策详情在其 ticket / 研究笔记。
> **管理权**: 本 map 自 2026-09-06 起是 **evaluation** 工作的管理 map。历史 eval 票(`P11*`/`R3`/`G2`/`GA-EVAL-*`/`GA-EXP*`/`GA-GRILL*`)仍物理存于 `wayfinder/data-agent/tickets/`(phase-4 + phase-misc),本 map 引用之;**新方向票用本 effort 自己的 R/G/T/P 命名空间**,存于 `wayfinder/evaluation/tickets/`(非 GA-——GA 专指 2026-08-31 通用性审计)。
> **来源**: 两轮 frontier 研究(round 1 五角度 + round 2 五新角度 = 11 方向);2026 引用经 spot-check(TrustJudge 2509.21117、AgentCompass 2607.13705、GradeSQL 2606.30851 已验真实),臆造项已弃("More Convincing..." 2607.05904、"Noisy but Valid" 2601.20913)、待核项已标。

## Destination

把 dsh-data-agent 的 evaluation 从"判官说对就是对"(**73.7% 假通过**;judge ceiling 48.7% vs real-exec 12.8%,35.9pp gap;61.9% judge-only 基线很可能虚高)推进到**可信评估栈**:执行级 ground truth → 校准/重写判官 → 显著性与功率 → 多维(错误结构/鲁棒性)→ 多轮轨迹。以 dual-score(execution + judge)的 gap 可量化、pass^k 带 CI、judge false-pass <10pp 为阶段验收。

## Notes

- **域**: evaluation 框架(`packages/eval/`)的可信化与扩展。data-agent 的 eval 子流,独立成 wayfinder effort(同 `semantic-layer` 先例)。
- **职责**: evaluation 拥有 ground-truth provenance、snapshot identity、result normalization、comparator policy、评分与 evidence 语义；SQL 提交、scope routing、credentials、provider error 和 backend lifecycle 复用 dsh-data-agent 的 `@deepseek-ai/dsh-query` capability（`ctx.query.execute`），不在 evaluation 重建 warehouse executor。Rationale 见 [Evaluation 通过 query capability 执行 SQL](../../.agents/notes/proposed/testing/2026-09-07-evaluation-query-capability-boundary.md)。
- **每会话应查 skills**:`research`(认读论文/调查)、`grilling`+`domain-modeling`(决策)、`prototype`(新 seam 原型)、`tdd`(impl)。
- **执行流程**: T/R-experiment(impl/experiment)不在本环境直接做——走 SPEC→instruction+rubric→另一环境执行;G/R认读/P 在本环境直接做。见 [`playbook.md`](playbook.md)(流程不写进本 map,只引)。
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
| [R1 — 执行级评分与非循环 ground truth 论文认读](tickets/R1-exec-grader-papers.md) (evaluation) | research | 2026-09-07 | execution match 无统一语义；G1/G1b 须定义逐 case、可版本化 policy 与非循环 provenance，默认 profile 交 R23 实测 |
| [G1 — Execution grader seam](tickets/G1-exec-grader-seam.md) (evaluation) | grilling | 2026-09-07 | 锁 6 条架构无关决策(三事实分离/execution 主裁决/gold 失败=benchmark infra/端口一函数/provenance 由 grader 装配/截断与耗时自己观测);包边界与 case schema 归属移交 R10→G10。查出:两栈并存是撞车非设计、`mapQueryOutcome` 从未被调用、infra 失败被计为模型失败、**loader 静默丢弃 39 个 case 已有的 reference SQL 与快照锚点**(→ T11) |

## Open frontier(未解,票在 `wayfinder/data-agent/tickets/`)

| 票(loc) | Type | Status | 核心 | blocked-by/blocks |
|---|---|---|---|---|
| GA-EVAL-EXPAND | task | open | n=168 MDE 5.4-10.1pp;需 n_d≥85;全部 EXEC expected 由真实执行推导（k11-v2 当前 0/168 带 expected.sql;**但 `rbi-10000251-exec` 39/39 已带,只是被 loader 丢弃** → T11），25 个 DELIVERY case 豁免 | by R23、T11;blocks GA-EXP5 |
| GA-EXP5 | research | open | 2×2×2 全因子 8 臂语言相关性 | by GA-EVAL-EXPAND |
| GA-EXP1 | research | open·high | LLM-driven 表推断 vs 启发式;judge 校准从未执行 | — |
| [GA-EVAL-CASESET-EVENT-ANCHOR](../data-agent/tickets/phase-misc/GA-EVAL-CASESET-EVENT-ANCHOR-stale-expected-values.md) (phase-misc) | grilling | open·**high** | event case 期望值不是冻结锚点:实跑每个 case 自己的 `expected.sql` 对账 → **event 16/18 已不符、DWS 13/13 相符**(ODS 视图历史分区不冻结,DWS T+1 算完即冻);推翻既有结论(119 的 552、136 的 482 曾被记为模型错值,实为 reference SQL 今天的值);5 个候选口径 (A) 重锚 /(B) 容差 /(C) 冻结物化快照 /(D) event 退出 execution_match /(E) 相对锚,均不免费。工具 `packages/eval/eval-cli/dev/case-expected-value-audit.mjs` | blocks 任何用 real-exec `execution_match` 衡量 event-case 正确性的测量;blocks GA-EVAL-EXPAND 功效计算 |
| GA-EVAL-REBASELINE item4 | task | open | token usage interceptor | — |
| GA-GT4 | task | open | eval 去 K11(FailureClassifier+多引擎);**被本 map G9/G10 结构化** | — |

## Frontier directions(11;每方向:R 认读分析论文 → G grilling → T/P impl → R experiment)

> 排序按对 73.7% false-pass 危机的杠杆。每条给:**做什 / 已验证论文 / 票链**。R(n) 为认读分析票(AFK,产 research note),G(n) grilling(HITL),T(n) impl(AFK TDD),P(n) prototype,R(m) experiment。

### 1. 执行级评分 + 非循环 GT 溯源(linchpin)
做什:EX grader 通过 evaluation adapter 复用 `ctx.query.execute` 并归一结果集；evaluation 只拥有评分、ground truth、policy 与 evidence。为 143 个 EXEC cases 派生非-LLM expected result(human-reviewed `expected.sql`+snapshot identity)，25 个 DELIVERY cases 保持非 execution，退役 34 手挑圆整数，接受多种显式声明的等价结果。
论文:Spider(1809.08887)、BIRD(2305.03111)、Spider 2.0(2411.07763)、Northcutt(2103.14749)、GradeSQL ORM(2606.30851 ✅验)。
票链:[**R1 — 执行级评分与非循环 ground truth 论文认读**](tickets/R1-exec-grader-papers.md)（resolved）→ 并行 [**G1 — Execution grader seam**](tickets/G1-exec-grader-seam.md)+[**G1b — Ground-truth lifecycle**](tickets/G1b-ground-truth-lifecycle.md)→ **T1-exec-grader-impl**（blocked by G1+G1b）→ [**R23 — Comparator-policy mutation baseline**](tickets/R23-comparator-policy-mutation-baseline.md)→ [**GA-EVAL-EXPAND**](../data-agent/tickets/phase-misc/GA-EVAL-EXPAND-case-set-power.md)→ 条件 **G12-exec-orm-verifier**+**R12-exec-orm-baseline**（用执行结果训 ORM 替代 judge）。

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
- **R(认读分析论文,AFK,产 research note)**:[R1](tickets/R1-exec-grader-papers.md)(resolved)、R2-judge-blind-papers、R3-judge-calibration-papers、R4-significance-papers、R5-contamination-papers、R6-trajectory-papers、R7-step-prm-papers、R8-pairwise-judge-papers、R9-error-taxonomy-papers、[R10](tickets/R10-harness-goodhart-papers.md)、R11-robustness-sampling-papers。
- **R(experiment,AFK,数字入 audit-log)**:R12-exec-orm-baseline、R13-judge-blind-baseline、R14-judge-falsepass-by-dim、R15-calibrated-rebaseline、R16-significance-rerun、R17-contamination-audit、R18-trajectory-baseline、R19-step-prm-divergence、R20-radar-redundancy、R21-goodhart-audit、R22-consistency-at-k、[R23](tickets/R23-comparator-policy-mutation-baseline.md)。
- **G(grilling,HITL)**:[G1](tickets/G1-exec-grader-seam.md)(resolved)、[G1b](tickets/G1b-ground-truth-lifecycle.md)、G2-judge-blind-rewrite、G3-judge-calibration、G4-significance-contract、G5-dynamic-case-pipeline、G6-trajectory-scoring、G7-step-prm、G8-pairwise-judge、G9-failure-classifier、[G10](tickets/G10-harness-bhe-split.md)、G11-irt-sampler、(+G12-exec-orm-verifier 条件)。
- **T(impl,AFK TDD)**:[T1](tickets/T1-exec-grader-impl.md)、T2-judge-blind-impl、T3-calibration-impl、T4-sample-planner-impl+T4b-significance-impl、T5-dynamic-cases-impl+T5b-evolving-slice-impl、T6-multiturn-cases、T7-pairwise-judge-impl、T8-failure-classifier-impl、T9-bhe-split-impl、T10-active-sampler-impl、[T11-loader-provenance-strip](tickets/T11-loader-provenance-strip.md)(G1 产出,**阻塞 T1 与 G1b**)。
- **P(prototype,HITL)**:P1-trajectory-prototype。

> **已建票文件 8 张**:R1、R10、R23、G1、G1b、G10、T1、T11。其余仅在本 map 点名——问题尚未 sharp,**不预先切割 fog**(判据是「能否现在精确陈述这个问题」,不是「能否现在回答它」)。

## 推荐认领顺序

**linchpin 仍是 T1(EX grader)**——它是 R14/G3/R17/G9/G10/R21 的校准 oracle 与客观 GT 来源。但 2026-09-07 的 [G1](tickets/G1-exec-grader-seam.md) 查出三个**前置**,T1 不再是立即下一步:

1. **[T11](tickets/T11-loader-provenance-strip.md)**(AFK impl)——loader 丢弃 39 个 case 已有的 reference SQL 与快照锚点,T1 的「可重放证据」与「gold 失败=benchmark infra failure」两条验收面在此之前无法成立。
2. **R10-harness-goodhart-papers**(AFK 认读)——G1 把包边界与 case schema 归属移交 G10,而 G10 的论文前置(AgentCompass B/H/E)尚未做。T1 若先落地,grader 的位置会被 G10 重切。
3. **GA-EVAL-CASESET-EVENT-ANCHOR**(HITL grilling)——event case 期望值不是冻结锚点,它 blocks 任何用 real-exec `execution_match` 衡量 event case 的测量,因而也 blocks T1 的 re-baseline 有意义。

**现在 unblocked(AFK 可自跑,先开,为 grilling 做数据/论文前置)**:
1. **R10-harness-goodhart-papers**(认读;**下一 session 起这张**)——解 G10,而 G10 现在持有 G1 移交的包边界与 case schema 归属
2. **R14-judge-falsepass-by-dim**(既有数据分析,便宜)→ 喂 G3
3. **R20-radar-redundancy**(quick win,可能直接定位 0.6 通胀根因)→ 喂 G8
4. **R4-significance-papers**、**R8-pairwise-judge-papers**(认读分析,独立,便宜)

**[T11](tickets/T11-loader-provenance-strip.md) 已 unblocked 但攒批不单独落**——它 blocks 最多(T1 + G1b + GA-EVAL-EXPAND),但只有 ~76 KB 源码半径,撑不满一个 rubric 包;按 [playbook §4](playbook.md) 的 T-攒批规则与 T1(+G10 后的 T9)同批落。

**HITL grilling(你,先开)**:~~[G1 — Execution grader seam](tickets/G1-exec-grader-seam.md)~~ 已 resolved(2026-09-07);**GA-EVAL-CASESET-EVENT-ANCHOR 优先**(它 blocks 一切 event-case 的 real-exec 测量);[G1b — Ground-truth lifecycle](tickets/G1b-ground-truth-lifecycle.md) 已由 R1 解锁,但须先吸收 G1 发现 ④——**provenance schema 已存在**(`rbi-10000251-exec` 39/39 带 `expected.sql`+`meta.anchor_ds`,rbi `schema_version: 3`),所以迁移分类的起点是「保留既有 schema 还是与 k11-v2 合流」,不是从零设计;G4/G2/G6 独立可开。

**AFK 级联**(各 G 解后):**T11→T1**(新增前置);**R10→G10→T9+R21**(G10 现持有 G1 移交的包边界/case schema 归属);{G1 已解 + G1b + CASESET-EVENT-ANCHOR}→T1→R23→GA-EVAL-EXPAND→{R12/R17/G9};G3→T3→R15;G4→T4+T4b→R16;G5→T5+T5b;G6→P1→T6+R18;G8→T7;G11→T10。

## Not yet specified(fog)

> 已知在 scope 内,但还问不出足够 sharp 的问题,所以不开票。frontier 推进后毕业成票。**"能不能现在精确陈述这个问题"是判据,不是"能不能现在回答它"。**

- **eval 模块重构的范围与顺序**(2026-09-07 立场从 additive-only 改为允许重构后新增)。**已确定该删的**:core 的死编排(`packages/eval/eval/src/runner.ts` 178 行、`persistence.ts` 196 行、`health-gate.ts` 116 行,全部零 live caller)+ eval-cli 与 eval-runner-service 的两份 adapter fork——两条都已有独立 Agent Note 提出([delete-unused-eval-core-runtime-stack](../../.agents/notes/proposed/simplification/2026-09-03-delete-unused-eval-core-runtime-stack.md)、[promote-eval-cli-adapters](../../.agents/notes/proposed/simplification/2026-09-03-promote-eval-cli-adapters-to-eval-runner.md))。**还问不 sharp 的**:删除与 R10→G10 包重切的编排顺序(先删再切,还是切的时候一并删);`match_modes` 5 枚举 → R1 §4.2 policy object 的迁移是否与 k11-v2/rbi 两套 case schema 合流同属一票;以及重构期间 12.8%/61.9% 两条基线如何维持可比——或明确宣布不可比、重新起锚(倾向后者,见 §⚠ 可复现性风险)。等 R10 认读结果。
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
