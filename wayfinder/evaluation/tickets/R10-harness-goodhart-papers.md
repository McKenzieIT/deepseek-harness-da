# R10 — Harness/Benchmark/Environment 拆分与 Goodhart 审计论文认读

**Type**: research  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: 无
**Blocks**: [G10 — Harness B/H/E 拆分](G10-harness-bhe-split.md)
**Mode**: AFK（本环境直接做，见 [playbook](../playbook.md) §2 Phase 1）
**Branch**: `research/R10-harness-goodhart-papers`

## Question

AgentCompass 的 Benchmark/Harness/Environment 三拆、HELM 与 BIG-bench 的 harness 分层、Arena-Hard 与 WildBench 的 separability 与 style control，各自如何界定「benchmark 内容」「harness 运行时」「environment 适配」的边界与所有权？这些边界映射到 `packages/eval/` 时，哪些**来源事实**足以约束 G10 的三个待决问题——grader 与 comparator policy 落哪个包、case schema 归谁拥有、`k11-v2` 与 `rbi-10000251-exec` 两套 schema 如何合流？

以及：Goodhart 类工作对「train / heldout / fresh」切分与污染检测提出了哪些可落地的审计要求？

## 待认读论文（均已 primary-URL-confirmed，见 map §⚠ 验证 TODO）

- **AgentCompass(2607.13705)** ✅ 已 spot-check 真实 —— B/H/E 三拆，**本票主线**
- HELM(2211.09110)、BIG-bench(2206.04615) —— harness 分层、scenario 与 metric 分离
- Arena-Hard / MT-Bench(2306.05685)、WildBench(2406.04770) —— separability、style control、95% CI
- LED(2602.01698) —— GRPO 抬 pass@1 却塌 pass@n，即 **pass^k 上的 Goodhart**（本仓 verdict 语义正是 pass^k）
- Data Laundering(2412.15255)、MMLU-CF(2412.15194)、LLMs-Get-Lost(2505.06120)

## 本仓已知的纠缠事实（G1 2026-09-07 实测，认读时直接映射，不必重新发现）

**① benchmark 内容住在纯库包里** —— 这是最直接的 B/H/E 违例：

```
packages/eval/eval/cases/k11-v2/            ← 168 个 case
packages/eval/eval/cases/rbi-10000251-exec/ ← 39 个 case
```

case 数据与 case schema（`packages/eval/eval/src/eval_case.ts`）同处 `@deepseek-ai/dsh-eval`（一个 deps 只有 `js-yaml`+`zod` 的纯库）。这也是 loader 能静默丢弃 provenance 而无人察觉的结构原因（→ [T11](T11-loader-provenance-strip.md)）。

**② 当前四层结构（实测 deps 与规模）**

| 包 | deps | src 行数 | 性质 |
| --- | --- | ---: | --- |
| `dsh-eval` | `{js-yaml, zod}` | 2482 | 纯库，零 seam |
| `dsh-eval-runner` | `{dsh-eval}` | 1569 | 纯编排，零 seam |
| `dsh-eval-runner-service` | peer: cordis + query + llm + nl2sql-engine | 543 | Cordis 插件（bundle 挂这个，`packages/bundle/data-agent/cordis.patch.yml:197`） |
| `dsh-eval-cli` | 27 个 | 2811 | 独立 CLI |

依赖方向干净、无环。

**③ 包外消费者会区分这两层**（所以不能简单合并 core 与 runner）

- `packages/data/tool-trigger-eval/src/index.ts:17` —— 取 `dsh-eval-runner` 的 `RunResult`/`RunSummary`/`DeltaReport`
- `scripts/live-verify-w1-w5.ts:19` —— 取 `dsh-eval` 的 `loadCases`
- `packages/data/evidence-query/src/index.ts:263` —— 用注释**结构性复述** W3 JSONL 形状而不 import（有人已在躲这条依赖）

**④ 编排层被实现了两遍**（已有独立 Agent Note 提议删除死的那半）

`runner.ts`（core 178 行死 / runner 423 行活）、`persistence.ts`（196 死 / 68 活）、health gate（`health-gate.ts` 116 死 / `health_gate.ts` 102 活）——连文件名规范都分叉。根因是 P11b（08-20）与 W3（08-25）撞车，无设计理由。

**⑤ 两套 case schema 并存** —— `k11-v2` 0/168 带 `expected.sql`；`rbi-10000251-exec` 39/39 带 `expected.sql` + `meta.anchor_ds` + `meta.tier` + `meta.provenance`（rbi `schema_version: 3`），且其 reference SQL 是**模板**（37/39 含 `{{ds_yesterday}}` 等）。

**⑥ Goodhart 的现成靶子** —— 当前基线 61.9% pass^k 测在 `k11-v2`；12.8% 真执行测在 `rbi-10000251-exec`，而后者的 event case 期望值 16/18 已失效。**没有 heldout，也没有 fresh slice。**

## 产出

`../research/harness-goodhart-papers.md`，仿 [R1](R1-exec-grader-papers.md) 的做法**严格区分**：

- **来源事实** —— 论文、官方评测代码或本仓现状直接支持的
- **设计推论** —— 针对 G10 与 `packages/eval/` 的建议，不宣称是论文原文结论

须明确回答 G10 的三个待决问题各有哪些论文依据、哪些纯属本仓自主选择（论文不管的部分不要假借论文权威）。

## 不在本票范围

- 实际做出架构决策（[G10](G10-harness-bhe-split.md)）或实施重构（T9-bhe-split-impl）。
- 引用未验证论文。map §⚠ 验证 TODO 的「待核」项须先 primary-fetch `arxiv.org` 才能进产物；本环境曾 403，换网络或人工核。
- subagent 的输出未经自己机械复核不得进产物（CLAUDE.md 引证纪律 2）。
