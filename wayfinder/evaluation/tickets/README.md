# evaluation tickets — dsh-data-agent

> 按 direction 组织。每 ticket 一个文件(多 session 并行 claim 不冲突)，状态与 blocking 以各票文件为准。已 resolved 的决策见 `../map.md` 的 Decisions so far;研究笔记在 `../research/`。
> **命名**:`<type><n>-<slug>.md`,type ∈ {R research,G grilling,T task,P prototype}。本 effort 命名空间,**独立于 data-agent 的 R/G/T**(同号不同 dir,路径区分)。
> **执行流程**（按领域分流）: **后端方向（1/9/10-拆分）的 impl 本地直接做**；**只有 ML-eval 方向的跟-eval 实验票才走 SPEC→rubric→另环境**。G/R认读/P 本环境直接做。见 [`../playbook.md`](../playbook.md) §1.1。
> **领域职责**: evaluation 票只设计/实现 ground truth、normalization、comparator policy、评分和 evidence；SQL execution 通过 adapter 复用 dsh-data-agent 的 `@deepseek-ai/dsh-query` / `ctx.query.execute`，不另建 provider 或 warehouse lifecycle。
> **历史 eval 票**(`P11*`/`R3`/`G2`/`GA-EVAL-*`/`GA-EXP*`/`GA-GRILL*`)在 `../../data-agent/tickets/`(phase-4 + phase-misc),**不在本目录**——本 effort 仅放 2026-09-06 起的新方向票。

## 取票流程(多 session 并行)
- 每 session claim 一个 ticket(先 claim 再做)。
- 从最低 unblocked direction 取;blocked 票等其 blocker 解。
- 一个 ticket 一个 session(grilling/prototype HITL;research/task AFK)。
- ticket 头声明 `Branch: <type>/<id>-<slug>`;改完逻辑单元立即 commit、绝不 `git add -A`、按路径 stage。
- research 票产数字必入 `../research/experiment-audit-log.md`;认读分析产 `../research/<slug>-papers.md`。

## 方向与票链(见 `../map.md` §Frontier directions)
| # | 方向 | 认读 R | grilling G | impl T/P | experiment R |
|---|---|---|---|---|---|
| 1 | 执行级评分+非循环 GT | R1、**R24** | G1/G1b | T1、**T11**、**T12** | R23/R12 |
| 2 | Judge blind-rewrite | R2 | G2 | T2 | R13 |
| 3 | Judge 校准+gated | R3 | G3 | T3 | R14/R15 |
| 4 | Power-aware+显著性 | R4 | G4 | T4/T4b | R16 |
| 5 | 污染+动态 pipeline | R5 | G5 | T5/T5b | R17 |
| 6 | 轨迹+多轮基准 | R6 | G6 | P1/T6 | R18 |
| 7 | Step-level PRM | R7 | G7 | — | R19 |
| 8 | Judge 读出/量表/顺序 | **R8**(resolved) | **G8** | T7 | **R20** |
| 9 | Error taxonomy | R9 | G9 | T8 | — |
| 10 | Harness B/H/E+Goodhart | R10 | G10 | T9 | R21 |
| 11 | Robustness+active sampling | R11 | G11 | T10 | R22 |

**已建票文件**（其余仅在 map 点名,问题尚未 sharp,不预先切割 fog）:[R1](R1-exec-grader-papers.md)（resolved v3）、[**R8**](R8-pairwise-judge-papers.md)（**resolved**）、[R10](R10-harness-goodhart-papers.md)、[**R20**](R20-judge-readout-probes.md)（原 `R20-radar-redundancy`）、[R23](R23-comparator-policy-mutation-baseline.md)、[R24](R24-eval-package-consolidation.md)（resolved）、[G1](G1-exec-grader-seam.md)（resolved）、[G1b](G1b-ground-truth-lifecycle.md)、[**G8**](G8-judge-readout-scale.md)（原 `G8-pairwise-judge`）、[G10](G10-harness-bhe-split.md)、[T1](T1-exec-grader-impl.md)、[T11](T11-loader-provenance-strip.md)、[T12](T12-eval-package-consolidation.md)。

(问题已 sharp 时可在 charting 阶段创建票文件;claim 只改变占用状态。本 README 是 index,map.md 是权威状态。)
