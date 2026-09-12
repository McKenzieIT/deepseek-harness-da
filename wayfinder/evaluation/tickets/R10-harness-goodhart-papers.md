# R10 — Harness/Benchmark/Environment 拆分与 Goodhart 审计论文认读

**Type**: research  ·  **Status**: **Resolved (2026-09-09)**
**Assignee**: McKenzieIT  ·  **Claimed**: 2026-09-09
**产物**: [`../research/harness-goodhart-papers.md`](../research/harness-goodhart-papers.md)；[G10 学习指南](../research/g10-learning-guide.md)；[2026 follow-up 侦察](../research/g10-2026-followup-papers.md)
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
- MT-Bench(2306.05685)、Arena-Hard(2406.11939)、WildBench(2406.04770) —— judge bias、separability、style control、CI
- LED(2602.01698) —— post-training 抬 pass@1 但采样探索塌缩；其标准 `pass@n`（至少一次成功）**不等于**本仓 strict `pass^k`（全部成功）
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

- 实际做出架构决策（[G10](G10-harness-bhe-split.md)）或实施 foundation-first stack（[T13](T13-context-projection-service.md) → [T9](T9-evaluation-foundations.md) → [T14](T14-data-analysis-extension-pack-migration.md) → [T15](T15-evaluation-controller-cli.md) → [T12](T12-eval-package-consolidation.md)）。
- 引用未验证论文。map §⚠ 验证 TODO 的「待核」项须先 primary-fetch `arxiv.org` 才能进产物；本环境曾 403，换网络或人工核。
- subagent 的输出未经自己机械复核不得进产物（CLAUDE.md 引证纪律 2）。

## Resolution comment (2026-09-09)

认读产物见 [`../research/harness-goodhart-papers.md`](../research/harness-goodhart-papers.md)。来源事实把三类职责钉死：Benchmark 拥有 case、ground truth、grader/comparator policy 与最终评分语义；Harness 只拥有模型交互、agent loop、重试和 trajectory；Environment 只拥有隔离执行、资源、安全与清理。论文不决定本仓 npm 包名，但排除了 Harness 判对、Environment 持有 benchmark 内容、以及 loader 静默丢字段三种设计。

对 G10 的三个问题，来源支持的最小答案是：benchmark pack 拥有作者态 case schema 与 policy 选择；共享库可以实现通用 comparator 与 canonical runtime protocol；`k11-v2` 与 `rbi-10000251-exec` 可保留不同 source schema，但必须无损、显式、版本化地编译到同一 canonical case envelope，不能靠宽松 loader 假装合流。具体包名、导出、迁移方式和 comparator 默认值仍由 G10/R23 决定。

Goodhart 审计需同时维护公开 train、受控 heldout、冻结后采集的 fresh slice，并记录跨 slice delta、bootstrap 95% CI、raw/style-controlled judge 分数、provenance 与训练/蒸馏谱系、重叠与变换探针、canary/dye sentinel、盲评解封和人工抽查。Arena-Hard 论文写 95% CI，但本次固定提交的官方代码取 5%/95% 分位数（中央 90%），复现时必须显式声明区间定义。

认读同时纠正 map 原有表述：LED 研究的是标准 `pass@n`（n 次中至少一次成功），不是本仓 strict `pass^k`（k 次全部成功）；它支持审计探索能力退化，但不能直接作为本仓 `pass^k` 的实证依据。

后续侦察把 adapter parity、interface censoring 与 run isolation 收束为 [R10b — Benchmark adapter parity、interface censoring 与 run isolation 认读](R10b-harness-measurement-validity.md)，并将污染、judge、统计、多轮和动态 benchmark 证据分流到各自 ticket。G10 在 R10b 完成后锁接口。
