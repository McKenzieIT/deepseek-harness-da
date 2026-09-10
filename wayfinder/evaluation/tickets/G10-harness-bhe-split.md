# G10 — Harness Benchmark/Harness/Environment 拆分

**Type**: grilling  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: 无（[R10](R10-harness-goodhart-papers.md) 与 [R10b](R10b-harness-measurement-validity.md) 已 resolved）
**Blocks**: T9-bhe-split-impl；并解 [G1](G1-exec-grader-seam.md) 移交的三条；[T1](T1-exec-grader-impl.md) 的落点
**Mode**: HITL
**Branch**: `grilling/G10-harness-bhe-split`
**Supersedes**: GA-GT4 的架构面（`wayfinder/data-agent/tickets/phase-misc/`，须先调和）

## Question

`packages/eval/` 应如何切分为 Benchmark（评测内容）/ Harness（运行时）/ Environment（仓库适配），使 benchmark 内容可版本化、harness 与具体 benchmark 无关、且 Goodhart 漂移可被 train/heldout/fresh 的对比检出？

## G1 移交的三条（本票必须裁定）

[G1](G1-exec-grader-seam.md) 于 2026-09-07 锁定了 6 条**架构无关**的 execution grader 决策，并把以下三条**架构相关**的移交本票——G1 明确不裁，以免 T1 落地后被本票重切：

1. **grader 与 comparator policy 落在哪个包。**
2. **case schema 归谁拥有** —— `match_modes` 的 5 枚举 → R1 §4.2 policy object 的迁移路径。
3. **`k11-v2`（168）与 `rbi-10000251-exec`（39）两套 schema 如何合流** —— 或明确决定长期并存。

## 本票同时要处理的

- **de-K11 架构答案** —— K11-v2 移出成版本化 benchmark-pack；`eval-runner` + `MultiTurnSession` 变 benchmark-agnostic；加 LiveK11 pack。此项 supersede GA-GT4 的架构面，**须先与 GA-GT4 调和**再动。
- **Goodhart Δ** —— `compare.ts` 输出 K11-train vs heldout vs fresh 的差值；Arena-Hard 式 style control + separability + 95% CI；dye-pack sentinel。当前**既无 heldout 也无 fresh slice**（见 R10 事实 ⑥）。
- **重构编排顺序** —— map §Not yet specified 的第一块 fog：已确定该删的（core 死编排 + 两份 adapter fork）与包重切，是「先删再切」还是「切的时候一并删」。

## 2026 follow-up 要补进决策的硬约束

完整一手认读见 [`harness-measurement-validity-papers.md`](../research/harness-measurement-validity-papers.md)，前置侦察见 [`g10-2026-followup-papers.md`](../research/g10-2026-followup-papers.md)，学习导读见 [`g10-learning-guide.md`](../research/g10-learning-guide.md)。本票锁接口时必须逐项吸收 R10b 的跨 benchmark 约束，并把 benchmark-specific choices 留给 pack policy。

- **Benchmark Adapter 是正式模块**：legacy source schema 通过具名、版本化 adapter 编译到 canonical task material；每个 adapter 需要 upstream parity、oracle/reference validation 与 provenance-preservation 证据。
- **Task material 与 run evidence 分 schema**：Benchmark 拥有 instruction、hidden expected/reference、environment requirements 与 grader policy；Harness 运行结果拥有 model/harness/adapter/environment identity、raw→parsed→executed→observed stages、finality 与 isolation。
- **Interface preflight**：chat template、parser、tool schema 和 provider envelope 的组合不兼容时必须在跑批前失败，不能静默产出零 tool call。
- **Environment finality**：agent 停止输出不等于结果最终；pending side effect、namespace/reset/cleanup 和 cross-run separation 必须进入接口与证据。
- **双 provenance**：benchmark provenance 描述 case 来源与派生；run provenance 描述本次 model、Harness、Environment、elicitation budget、memory、tool/network access 与运行中反馈。
- **统计协议显式化**：Benchmark Pack 为结果声明 estimand、aggregation、tie/invalid/abstention、sampling/cluster unit 与 CI 定义；standard `pass@n` 和 strict `pass^k` 分开。
- **Judge 双向验证**：对语义等价变换保持 invariance，对最小实质错误具备 construct sensitivity；style control 不能替代 correctness sensitivity。
- **持久多轮状态**：`MultiTurnSession` 的评测证据包含 workspace/environment lineage、累计 verifier、artifact changes、regression 与 fail-stop outcome，而不只是 transcript。

## 已知约束（R10/R10b 提供论文依据，但这些是本仓实测事实）

- **不能简单合并 `dsh-eval` 与 `dsh-eval-runner`** —— 包外消费者在区分两者（`packages/data/tool-trigger-eval/src/index.ts:17` 取 runner 的 `RunResult`；`scripts/live-verify-w1-w5.ts:19` 取 core 的 `loadCases`）。
- **benchmark 内容当前住在纯库包内** —— `packages/eval/eval/cases/`，与 case schema 同包。这是最直接的 B/H/E 违例。
- **`dsh-eval-runner-service` 是 bundle 实际挂载的那个**（`packages/bundle/data-agent/cordis.patch.yml:197`），重切不能把它落下。
- **基线不可比** —— 61.9% pass^k 测在 `k11-v2`，12.8% 真执行测在 `rbi-10000251-exec`，后者 event 期望值 16/18 已失效。本票若移动 case set，须**明确宣布旧基线不可比并重新起锚**，而不是假装可比（map §⚠ 可复现性风险）。

## 验收

- 三条移交问题各有明确裁定 + 理由，且注明哪些依据来自 R10/R10b、哪些是本仓自主选择。
- 明确 Benchmark Pack、Benchmark Adapter、共享 eval protocol、Harness、Environment Adapter 与 composition root 的接口和所有权。
- 为 `k11-v2` 与 RBI 迁移定义 `validated | parity_unresolved | invalid` 状态；验收同时覆盖 oracle/reference validation、matched original-vs-adapted parity、逐 case evidence、hidden-material isolation 与 schema preservation。
- 为运行定义 raw emission → parsed action → execution → observation → grader evidence 的可关联持久化，以及 `preflight_failed | interface_incompatible | auto_inconclusive` 的评分前失败语义。
- Environment interface 分别证明 outcome finality 与 cross-run separation：pending effect、namespace/stream、settle/cancel/finalize、verified reset/cleanup 和 `unresolved` 均有显式表示。
- Run identity 固定 Benchmark/Adapter/Harness digest、runtime model revision、template/parser/tool schema、Environment image/config 与 grader policy；heldout transfer 不跨 Harness commit 或 identity component 拼接。
- 为 Goodhart audit 定义 benchmark/run 双 provenance、train/heldout/fresh 生命周期、estimand/cluster unit、standard `pass@n` 与 strict `pass^k`。
- 与 GA-GT4 的调和结论写明（supersede 哪些面、保留哪些）。
- 产出或更新一篇 `.agents/notes/proposed/architecture/` Agent Note。
- 明确 T9-bhe-split-impl 的验收面，以及它与 [T1](T1-exec-grader-impl.md)、[T11](T11-loader-provenance-strip.md) 的落包顺序。

## 不在本票范围

- 实施重构（T9-bhe-split-impl）。
- 重开 G1 已锁的 6 条架构无关决策。
- comparator 默认值（[R23](R23-comparator-policy-mutation-baseline.md) 提供 mutation 证据）。
- event case 评分口径（GA-EVAL-CASESET-EVENT-ANCHOR）。
