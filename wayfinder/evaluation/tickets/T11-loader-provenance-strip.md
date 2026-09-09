# T11 — case loader 静默丢弃 reference SQL 与 snapshot 锚点

**Type**: task  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: 无
**Blocks**: T1-exec-grader-impl、[G1b — Ground-truth lifecycle](G1b-ground-truth-lifecycle.md)
**Mode**: AFK（后端方向，**本地直接做**，不走另环境/rubric；见 [playbook](../playbook.md) §1.1）
**Batch**: 与 [T1](T1-exec-grader-impl.md) 同批，**T11 先完成全部验收再起 T1**（T1 的证据面建在 loader 输出上，loader 语义中途再变会使 T1 的测试重写）
**Surfaced by**: [G1 — Execution grader seam](G1-exec-grader-seam.md)（2026-09-07 发现 ④）

## Question

`EvalCaseSchema` 的 zod object 默认 strip 未知键，导致 case 文件里已有的 provenance 字段在加载时被静默丢弃：`expected.sql`（reference SQL）、`meta`（含 `anchor_ds` 快照锚点、`tier`、`provenance`）、`schema_version`。且 `expected.sql` 是**模板**而非可直接执行的 SQL（含 `{{ds_yesterday}}` 等占位符），其解析依赖同一 case 的 `meta.anchor_ds`。

应如何扩展 schema 与 loader，使这些字段被保留、reference SQL **可解析**、并能被 execution grader 与既有对账工具共用；同时不破坏 `k11-v2`（0/168 带 `sql`）的加载？

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

## reference SQL 是模板，不是可执行 SQL（2026-09-07 实测）

`rbi-10000251-exec` 39 个 case 中：

| 项 | 数量 |
| --- | ---: |
| 含模板变量的 case | **37 / 39** |
| `{{ds_yesterday}}` 出现次数 | 38 |
| `{{ds_7d_ago}}` 出现次数 | 6 |
| 带 `meta.anchor_ds: "20260806"` 的 case | **37 / 39** |

所以「保住 `expected.sql`」不足以让它可用——还须保住 `meta.anchor_ds`，并把「占位符如何绑定到 anchor」这条契约放在一个有测试的共享位置。

目前这条契约**只存在于一个 dev 脚本里，且是硬编码的**：`packages/eval/eval-cli/dev/case-expected-value-audit.mjs:44` 写死 `TODAY = '20260806'`，`:51` 由它算出 `ds_yesterday`/`ds_7d_ago`，`:75` 做正则替换。它重复了 37 个 case 自己已经声明的 `anchor_ds`，且一旦某个 case 换锚点就会静默算错。

同一个脚本还带另外两处**已过期**的痕迹：`:39` 默认路径指向另一个 worktree(`/Users/mckenzie/workspace/dsh-eventdef/...`)，`:31` 的注释仍称 case set「not git-tracked」——两者都已不成立（2026-09-07 `git ls-files` 核实已追踪）。

**2026-09-09 复核**：`git ls-files packages/eval/eval/cases/rbi-10000251-exec` 返回 39 个文件，case set 确已被 git 追踪。脚本另有两处硬编码环境假设：`:40` 把 `maxc` 可执行路径写死为 `~/Library/Python/3.13/bin/maxc`、`:41` 把配置写死为 `~/.maxc/config_ieu_cdm.yaml`；`:55` 自带 `--wait 300`，与 sidecar 默认的 60 不一致。

## 与合并后 G1 的关系（2026-09-09）

G1 已在 2026-09-08 完成 v3 独立重做并与 v1 决议合并，两条直接落到本票：

- **D5 把「loader 不得静默吐掉未知 `expected.*` 字段」划归 G1 所有权**（理由是 fail-loud 与 provenance 内容无关）。本票是这条决议的**实现票**。
- **D6 定下当前 143 个 EXECUTION case 的 expected 不合格、需重建**，而 `rbi-10000251-exec` 的 39 个（人写 `expected.sql` + `tier: verified` + `anchor_ds`）是仓内**唯一合格的模板**。本票因此从卫生项升为语料重建的前置：模板读不到，重建就无从对照。

## 验收

**loader 侧**

- `loadCase` 保留 `expected.sql`、`meta.anchor_ds`、`meta.tier`、`meta.provenance`、`schema_version`（或显式声明的等价字段），并有测试逐字段 pin 一个带这些字段的 fixture 往返不丢。
- `k11-v2` 168 个 case 仍全部加载通过——缺 `sql`/`meta` 不得报错（两套 schema 并存是当前事实）。
- **未知键不再被静默 strip**：要么保留，要么显式报错；选哪个须在 ticket 里写明理由（zod `strict` 会让 `rbi-10000251-exec` 立即失败，`passthrough` 会让未声明字段无类型——两者都有代价）。
- 与 AGENTS.md「在 durable/file 边界做校验」一致：保留字段不等于放弃校验。

**模板解析侧**

- 占位符 → 具体 ds 的替换从 dev 脚本移到有测试的共享位置，且**按 case 读 `meta.anchor_ds`**，不使用全局常量。
- 缺 `anchor_ds` 却含占位符的 case（当前 39 里有 2 个不带模板，须核对是否同一批）必须**显式失败或显式跳过**，不得静默产出未替换的 SQL 送去执行。
- 支持的占位符集合是封闭且被测试枚举的；出现未知占位符要报错，不是原样透传。

**端到端验收演示**

- `case-expected-value-audit.mjs` 改用 `loadCase` + 共享的模板解析，删掉自己的 `yaml.load`、硬编码 `TODAY`、以及跨 worktree 的默认路径；更正 `:31` 的 not-git-tracked 注释。
- 改造后重跑全部 39 个 case，**结果须复现已知结论**：`data_source=event` MATCH=2 / STALE=16（共 18），`data_source=dws` MATCH=13 / STALE=0（共 21，8 个 multi-row SKIPPED）。复现即证明修复在真数据上成立；不复现说明改动引入了语义偏移，须查清后才算完成。

## 不在本票范围

- **`anchor_ds` 是否算合法的 snapshot identity**。本票只让它可达、可用于模板解析；它**是不是冻结锚点是另一回事**——GA-EVAL-CASESET-EVENT-ANCHOR 已实测 event 数据的历史分区不冻结，所以对 event case 而言 `anchor_ds` 恰恰**不是**有效锚点。本票不得暗示它是。
- 用 reference SQL 实际执行来重新派生 expected 值（[G1b](G1b-ground-truth-lifecycle.md)）——本票只对账，不回填。
- comparator policy object 的设计（R1 §4.2 → [R23](R23-comparator-policy-mutation-baseline.md)）。
- 两套 case schema 的合流与包边界（R10 → G10）。
- event case 的评分口径（GA-EVAL-CASESET-EVENT-ANCHOR）。
- 让 audit 脚本改走 `ctx.query`（它现在 `:55` 直接 spawn `maxc`，是第三条执行路径）——属 T1 的 grader 接线，本票只换 YAML 解析与模板来源，不动执行方式。

## 前置（开工前需就位）

- **warehouse 凭证与 `maxc` 可用**：端到端验收要真跑 39 条 reference SQL。改造后路径与配置走 `MAXC_CONFIG`（eval-cli 已用该 env，`packages/eval/eval-cli/src/context.ts:767`），不再写死 home 路径。
- **39 个 case 在工作树内**：已 git 追踪，无需外部拷贝。
- **不用等 G1b**：本票只让字段可达、模板可解，不解释 `anchor_ds` 是否有效锚点，也不回填 expected。

## 工作面

核心三个文件：`packages/eval/eval/src/eval_case.ts`（schema）、`packages/eval/eval/src/case_loader.ts`（loader）、`packages/eval/eval-cli/dev/case-expected-value-audit.mjs`（端到端验收的载体）。新增一处共享的模板解析实现及其测试。牵连面是 `packages/eval/eval/tests/eval_case.spec.ts`、`case_loader.spec.ts`，以及任何断言 `EvalCase` 形状的测试。
