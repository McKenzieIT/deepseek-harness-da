# evaluation tickets — dsh-data-agent

> 按 direction 组织。每 ticket 一个文件(多 session 并行 claim 不冲突)，状态与 blocking 以各票文件为准。已 resolved 的决策见 `../map.md` 的 Decisions so far;研究笔记在 `../research/`。
> **命名**:`<type><n>-<slug>.md`,type ∈ {R research,G grilling,T task,P prototype}。本 effort 命名空间,**独立于 data-agent 的 R/G/T**(同号不同 dir,路径区分)。
> **执行流程**（按领域分流）: **后端方向（1/9/10-拆分）的 impl 本地直接做**；**只有 ML-eval 方向的跟-eval 实验票才走 SPEC→rubric→另环境**。G/R认读/P 本环境直接做。见 [`../playbook.md`](../playbook.md) §1.1。
> **领域职责**: evaluation effort 设计/实现 Benchmark、identity、evidence、grading、measurement 与 evaluation lifecycle；业务执行继续复用 data-agent capabilities，不另建 query/fs/workflow Provider。跨到正常产品路径的 [Context Projection](T13-context-projection-service.md) 仍是 data-agent capability，Evaluation 只消费和观察。
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
| 1 | 执行级评分+非循环 GT | R1、**R24** | G1/G1b | T1、**T11** | R23/R12 |
| 2 | Judge blind-rewrite | R2 | G2 | T2 | R13 |
| 3 | Judge 校准+gated | [R3](R3-judge-calibration-papers.md) | G3 | T3 | R14/R15 |
| 4 | Power-aware+显著性 | [R4](R4-significance-papers.md) | G4 | T4/T4b | R16 |
| 5 | 污染+动态 pipeline | [R5](R5-contamination-papers.md) | [G5](G5-dynamic-case-pipeline.md) | T5/T5b | [R17](R17-contamination-audit.md) |
| 6 | 轨迹+多轮基准 | [R6](R6-trajectory-papers.md) | G6 | P1/T6 | R18 |
| 7 | Step-level PRM | R7 | G7 | — | R19 |
| 8 | Judge 读出/量表/顺序 | **R8**(resolved)、**R8b**、**R8c** | **G8** | T7 | **R20** |
| 9 | Error taxonomy | R9 | G9 | T8 | — |
| 10 | Data-domain Evaluation Core + Context + Goodhart | R10/[R10b](R10b-harness-measurement-validity.md)/[R10c](R10c-context-layer-evaluation.md)（均 resolved） | [G10](G10-harness-bhe-split.md)（claimed）→ [G13](G13-context-evaluation-protocol.md)/[G14](G14-adaptive-context-holdout-policy.md)/[G15](G15-dynamic-evaluation-lifecycle.md) | [T13](T13-context-projection-service.md)→[T9](T9-evaluation-foundations.md)→[T14](T14-data-analysis-extension-pack-migration.md)→[T15](T15-evaluation-controller-cli.md)→[T12](T12-eval-package-consolidation.md) | [R25](R25-evaluation-rebaseline.md)→[R26](R26-context-counterfactual-matrix.md)/[R27](R27-context-perturbation-leakage-audit.md)/[R21](R21-goodhart-audit.md) |
| 11 | Robustness+active sampling | R11 | G11 | T10 | [R22](R22-consistency-at-k.md) |

**已建票文件**（其余仅在 map 点名，问题尚未 sharp 时不预先切割 fog）：R1、R3、R4、R5、R6、R8、R8b、R8c、R10、R10b、R10c、R17、R20、R21、R22、R23、R24、R25、R26、R27、G1、G1b、G5、G8、G10、G13、G14、G15、T1、T9、T11、T12、T13、T14、T15。

(问题已 sharp 时可在 charting 阶段创建票文件;claim 只改变占用状态。本 README 是 index,map.md 是权威状态。)
