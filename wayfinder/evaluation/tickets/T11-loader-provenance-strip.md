# T11 — case loader 静默丢弃 reference SQL 与 snapshot 锚点

**Type**: task  ·  **Status**: **resolved 2026-09-09**
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: 无
**Blocks**: T1-exec-grader-impl、[G1b — Ground-truth lifecycle](G1b-ground-truth-lifecycle.md)
**Mode**: AFK（后端方向，**本地直接做**，不走另环境/rubric；见 [playbook](../playbook.md) §1.1）
**Batch**: 与 [T1](T1-exec-grader-impl.md) 同批，**T11 先完成全部验收再起 T1**（T1 的证据面建在 loader 输出上，loader 语义中途再变会使 T1 的测试重写）
**Surfaced by**: [G1 — Execution grader seam](G1-exec-grader-seam.md)（2026-09-07 发现 ④）
**Branch**: `feat/T1-exec-grader-impl`

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

## Resolution（2026-09-09）

### 做了什么

**loader 侧**（`packages/eval/eval/src/eval_case.ts`）—— rbi 字段声明为 optional，两套 case set 过同一个 schema；`schema_version`、`expected.sql`、`expected.behavior`、`meta.anchor_ds`、`meta.tier`、`meta.provenance` 均存活，逐字段有 fixture 往返测试。`case_loader.ts` 本体未动——丢弃发生在 schema，不在 loader。

**未知键的取舍（本票要求写明理由）** —— 按位置分开定，而非全仓一刀切：

- **结构位置（顶层、`input`、`expected`）用 `strictObject`：未知键报错。** 理由是这些位置的键名有固定含义，写错一个（`expected.sqll`）旧行为是静默丢弃后拿默认值打分——正是本票 §“通用缺陷”指的那类无信号失效。**代价**：新增一个真正的结构字段（比如第二段 reference SQL）必须先改 schema，不能先在 case 里写上。接受，因为那次修改正是它的类型与含义应该落地的地方。
- **`meta` 用 `looseObject`：未声明键保留。** 与 `dimensions` 已有的 record 形状对称。grader 要读的三个（`anchor_ds`/`tier`/`provenance`）声明并定型，其余 provenance（`roles`、`needs_repin`、`business_context` …）原样存活。**代价**：这些字段无类型。接受，因为它们是语料元数据而非判分输入；且本票验收要的“今后加字段不再被静默忽略”在这两个位置得到满足。
- **全仓 `passthrough` 被否决**：它保住字段但全部无类型，且写错的结构键仍然无信号——把本票要消除的静默又买了回来。
- **全仓 `strict` 被否决**：会把 `meta` 下每个未列举的 provenance 变成加载错误，使语料无处放自由形式溯源。

**模板解析侧**（新增 `packages/eval/eval/src/reference_sql.ts`）—— `resolveReferenceSql(case)` 按 case 自己的 `meta.anchor_ds` 代入，封闭占位符集合 `{ds_yesterday, ds_7d_ago}` 由测试枚举。四成员返回值：`resolved` / `absent`（k11-v2 无 reference SQL，不是错）/ `unresolvable`（`missing-anchor` / `unknown-placeholder` / `malformed-anchor`）。选返回判别联合而非抛异常，是为了让 T1 能把拒绝映成 `case-defect` 而不必在判分路径上 try/catch。UTC 日期运算，主机时区不能挪动分区。

**本票要求核对的一项（§验收）**：不带模板的 2 个 case（`044`、`048`）与不带 `anchor_ds` 的 2 个**是同一批**。所以不存在“含占位符却缺锚点”的 case；该分支仍有单测覆盖。

**对账脚本**（`case-expected-value-audit.mjs` → `.ts`）—— 改走 `loadCase` + `resolveReferenceSql`；删自带 `yaml.load` 与 `shiftDays`；删硬编码 `TODAY`、跨 worktree 默认路径、写死的 `maxc` 路径与 `config_ieu_cdm.yaml`；`MAXC_CONFIG` 改为**必填**（它选择数仓项目，默认值会静默对错数据），`MAXC_BIN` 可选，`--wait` 改读 `MAXC_WAIT_SECONDS`；更正 not-git-tracked 注释；无法解析的 case 列为 `UNRESOLVABLE` 而不被未代入就执行。

### 闸门结果（真 sidecar，非 stand-in）

```
data_source=event : MATCH=2  STALE_EXPECTED=16  SKIPPED=0  (of 18)
data_source=dws   : MATCH=13 STALE_EXPECTED=0   SKIPPED=8  (of 21)
```

与 2026-09-06 记录**逐位相同**，且逐 case 值也相同；两个 event MATCH 均为 `0 == 0`。数据与 fidelity caveat 入库 [experiment-audit-log §2026-09-09](../research/experiment-audit-log.md)，原始输出在 `research/artifacts/t11-case-expected-value-audit-{event,dws}-20260909.log`。

### 留给后续的

- 对账脚本仍 `spawn maxc`（仍是第三条执行路径）——收口属 [T1](T1-exec-grader-impl.md)。
- `057`/`138` 的 `live=null` 实为“无行返回”而非“期望值陈旧”，但为复现保留了旧判定；口径属 GA-EVAL-CASESET-EVENT-ANCHOR。
- 两套 case schema 的合流仍归 R10 → G10；本票只让它们共存。
