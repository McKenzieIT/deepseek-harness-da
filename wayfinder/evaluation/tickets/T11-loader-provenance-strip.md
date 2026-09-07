# T11 — case loader 静默丢弃 reference SQL 与 snapshot 锚点

**Type**: task  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: 无
**Blocks**: T1-exec-grader-impl、[G1b — Ground-truth lifecycle](G1b-ground-truth-lifecycle.md)
**Mode**: AFK（走 SPEC → rubric → 另一环境，见 [playbook](../playbook.md)）
**Surfaced by**: [G1 — Execution grader seam](G1-exec-grader-seam.md)（2026-09-07 发现 ④）

## Question

`EvalCaseSchema` 的 zod object 默认 strip 未知键，导致 case 文件里已有的 provenance 字段在加载时被静默丢弃：`expected.sql`（reference SQL）、`meta`（含 `anchor_ds` 快照锚点、`tier`、`provenance`）、`schema_version`。应如何扩展 schema 与 loader，使这些字段被保留、可被 execution grader 读取、并能进入可重放证据；同时不破坏 `k11-v2`（0/168 带 `sql`）的加载？

## 已核事实（G1 session 实测）

`packages/eval/eval/src/eval_case.ts:39-44` 的 `CaseExpectedSchema` 只声明 `result_value`/`match_mode`/`answer`/`delivery_match`；`EvalCaseSchema`（`:54-58`）只声明 `case_id`/`input`/`expected`/`dimensions`。两处都是 zod object 默认行为（strip 未知键，不报错）。

两个 case set 的实际内容：

| case set | 文件数 | 带 `expected.sql` | 带 `result_value` |
| --- | ---: | ---: | ---: |
| `k11-v2` | 168 | **0** | 168 |
| `rbi-10000251-exec` | 39 | **39** | 39 |

`rbi-10000251-exec` 的 case 形如（`eval_10000251_036.yaml`）：`schema_version: 3`、`expected.sql`（人写的 reference SQL）、`expected.behavior`、`meta.anchor_ds: "20260806"`、`meta.tier: verified`、`meta.provenance: migrated`。

实跑 `loadCase` 的输出：

```
top-level keys   : case_id,input,expected,dimensions
expected keys    : result_value,match_mode,answer,delivery_match
expected.sql     : undefined
meta present     : false   schema_version: false
```

## 为什么它阻塞其他票

1. **execution grading 读不到 reference SQL。** G1 锁定「gold/reference SQL 执行失败 = benchmark 基础设施失败」与「一次评分可重放」，两者都要求 grader 能拿到 reference SQL 与 snapshot 锚点。现在拿不到。
2. **G1b 以为要新建的 schema 已经存在。** R1 的「0 个 case 带 reference SQL」只对 `k11-v2` 成立；`rbi-10000251-exec` 的 39 个已带 rbi `schema_version: 3` 的 provenance。G1b 的迁移分类应以「保留既有 schema 还是合流」为起点，而非从零设计。
3. **它是既有污染的机制。** [GA-EVAL-CASESET-EVENT-ANCHOR](../../data-agent/tickets/phase-misc/GA-EVAL-CASESET-EVENT-ANCHOR-stale-expected-values.md) 查出 event 16/18 期望值与自己的 `expected.sql` 不符，靠的是独立脚本 `packages/eval/eval-cli/dev/case-expected-value-audit.mjs` 绕过 loader 直接解 YAML。eval 路径本身看不到 `expected.sql`，所以这类漂移无法在评分时被发现——12.8% 真执行基线正测在这 39 个 case 上。
4. **通用缺陷**：只要 strip 行为不变，**今后往 case 文件加的任何 provenance 字段都会被静默忽略**，且没有任何信号。这比丢掉当前三个字段更严重。

## 验收

- `loadCase` 保留 `expected.sql`、`meta.anchor_ds`、`meta.tier`、`meta.provenance`、`schema_version`（或显式声明的等价字段），并有测试逐字段 pin 一个带这些字段的 fixture 往返不丢。
- `k11-v2` 168 个 case 仍全部加载通过——缺 `sql`/`meta` 不得报错（两套 schema 并存是当前事实）。
- **未知键不再被静默 strip**：要么保留，要么显式报错；选哪个须在 ticket 里写明理由（zod `strict` 会让 `rbi-10000251-exec` 立即失败，`passthrough` 会让未声明字段无类型——两者都有代价）。
- `rbi-10000251-exec` 39 个 case 的 `expected.sql` 可从 loader 输出读到，无需绕过 loader 解 YAML。
- 与 AGENTS.md「在 durable/file 边界做校验」一致：保留字段不等于放弃校验。

## 不在本票范围

- comparator policy object 的设计（R1 §4.2 → [R23](R23-comparator-policy-mutation-baseline.md)）。
- case migration 与 expected 值重新派生（[G1b](G1b-ground-truth-lifecycle.md)）。
- 两套 case schema 的合流与包边界（R10 → G10）。
- event case 的评分口径（GA-EVAL-CASESET-EVENT-ANCHOR）。
