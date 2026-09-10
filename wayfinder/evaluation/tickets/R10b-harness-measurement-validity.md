# R10b — Benchmark adapter parity、interface censoring 与 run isolation 认读

**Type**: research  ·  **Status**: **Resolved (2026-09-10)**
**Assignee**: McKenzieIT  ·  **Claimed**: 2026-09-10
**产物**: [`../research/harness-measurement-validity-papers.md`](../research/harness-measurement-validity-papers.md)
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: 无
**Blocks**: [G10 — Harness B/H/E 拆分](G10-harness-bhe-split.md)
**Mode**: AFK
**Branch**: `research/R10b-harness-measurement-validity`
**Scout**: [`../research/g10-2026-followup-papers.md`](../research/g10-2026-followup-papers.md)

## Question

Harbor Adapters/Harbor-Index、Interface-Induced Trajectory Censoring、Outcome Finality and Cross-Unit Separation 与 HarnessDev 对 G10 的共享 task-material protocol、Benchmark Adapter、Harness identity、Environment finality 和 cross-run isolation 提出了哪些一手约束？哪些要求必须进入 G10 的接口与 T9/T12 验收，哪些只是特定 benchmark 的实现选择？

## 必须回答

- Legacy benchmark adapter 如何证明与原实现 parity，而不只是“能加载”。
- Oracle/reference、hidden tests、solution 与 comparator policy 分别由谁拥有，怎样与 Harness 隔离。
- Raw emission、parsed action、execution、observation 和 grader evidence 是否需要成为持久化阶段。
- Template/parser/tool schema 的组合 preflight 怎样定义失败语义。
- Outcome finality、pending effect、namespace/reset/cleanup 与 cross-run separation 如何进入 Environment interface。
- Harness artifact/version、runtime model 和 heldout transfer 怎样进入 run identity。

## 待认读一手来源

- Harbor Adapters and Harbor-Index (`2609.04298`)
- Interface-Induced Trajectory Censoring (`2609.03966`)
- When Is an Agent Evaluation Over? Outcome Finality and Cross-Unit Separation (`2608.14940`)
- HarnessDev (`2609.01437`)
- DAREBench (`2609.06059`，evidence-audit 旁证)
- Evaluation Context Protocol (`2608.19263`，wire-protocol 旁证)

## 产出

`../research/harness-measurement-validity-papers.md`。严格区分来源事实与本仓设计推论，并给 G10 输出一份新增/修订验收清单。

## Resolution comment (2026-09-10)

认读产物见 [`../research/harness-measurement-validity-papers.md`](../research/harness-measurement-validity-papers.md)。Legacy adapter 只有同时具备 source revision、oracle/reference validation、原实现与适配实现的 matched parity、逐 case evidence、不确定性和显式偏差记录，才能标为 validated；“能加载”或单侧 oracle pass 不构成 parity。

Benchmark pack 拥有 task material、reference/oracle、hidden tests/solution、grader/comparator policy 与聚合语义；Harness 只拥有模型交互和 evidence capture；Environment 只拥有执行状态与 lifecycle evidence。普通 model run 必须只看到 public task view，private grading material 只能由受控评分入口读取。

运行证据应保存 raw emission → parsed action → execution → observation → grader evidence 五阶段。真实 model/provider/template/parser/tool-schema 组合必须在 batch 前 preflight；`preflight_failed` 与 `interface_incompatible` 使 configuration invalid，不进入模型能力分母。

Environment 必须分别证明 outcome finality 与 cross-run separation：pending effect 未终结或未被足够收窄时结果为 unresolved；跨 run route 未隔离时不得把 runs 当独立 trials。Run identity 至少固定 Benchmark、Adapter、Harness artifact、runtime model、interface stack、Environment 和 grader policy。heldout transfer 只能比较同一 frozen Harness artifact，且开发反馈、heldout 与 fixed-runtime 各腿不可跨 commit 或 identity 拼接。

这些是 G10/T9/T12 的跨 benchmark 约束；parity 重复次数与统计量、具体 oracle 形式、finality observation window、namespace 技术、parser repair 和 heldout 规模仍由各 benchmark 或 G10 裁定。ECP 仅作为 experimental wire/audit 旁证，不能替代 parity、finality 或 isolation 证明。
