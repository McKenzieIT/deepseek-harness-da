# experiment-audit-log — dsh-data-agent evaluation

> 任何用实验/探针支撑决策的(probe / 召回-歧义测量 / A-B / pass^k 重基线 / judge 校准测量),须把 setup + 数据(verbatim,非转述)+ verdict + fidelity caveat(任何 port-vs-shipped 分歧:tokenizer/idf/floor/weights)+ ticket 指针持久化到此审计日志——不仅在 ticket / 探针输出里(见 AGENTS.md「Decision-informing experiments are audited」)。
> **历史 eval 实验**(GA-EVAL-REAL-EXEC 12.8%/35.9pp、GA-EVAL-SQLGEN-PROMPT-FIX、GA-EVAL-CLEAN-RERUN 61.9%、GA-EVAL-REBASELINE 52.4%、GA-EXP2/3/4)记录在 `../../data-agent/research/experiment-audit-log.md`;本 log 自 2026-09-06 起记本 effort 的新实验(R12-R22)。

## 标准模板(同 CLAUDE.md / data-agent log)

```markdown
## YYYY-MM-DD: <ticket/变更描述>

### Setup
- **基线**: Run `<baseline_run_id>`(引用上一次标准 run)
- **Cases**: <count> <case-set>(K11-v2 168 / rbi-10000251-exec 39 / k11-v3 ...)
- **Model**: <provider>/<model>, <responder>, pass_k=<n>, concurrency=<n>, sql-judge enabled?
- **变更**: <本次改动的具体内容>

### Data (verbatim)
<粘贴 compare.ts 输出或手动 category 表>

### Verdict
<编号分析:什么变了、为什么、下一步>

### Ticket Pointer
Resolves: [<ticket>](link)
```

## 趋势对比工具
```bash
node --import tsx/esm packages/eval/eval-cli/bin/compare.ts <run_id_A> <run_id_B>
```
每次 eval 必与上一次基线 run 对比(category delta + case flips)。

---

## (首 session 起填:R12-R22 实验记录)

---

## 2026-09-09: T11 — loader 保全 provenance 后的 39-case 对账复现

### Setup

- **基线**: 2026-09-06 的 `case-expected-value-audit` 对账(记录在 [data-agent log](../../data-agent/research/experiment-audit-log.md) §2026-09-06 与 [GA-EVAL-CASESET-EVENT-ANCHOR](../../data-agent/tickets/phase-misc/GA-EVAL-CASESET-EVENT-ANCHOR-stale-expected-values.md))。**不是 pass_rate run**——这是 case 语料的仪表校验,对账对象是 `expected.result_value` vs 该 case 自己的 `expected.sql` 实跑值。
- **Cases**: 39 `rbi-10000251-exec`(event 18 / dws 21),全部经 `loadCase` 加载。
- **Model**: 无。本对账不经模型、不经 agent;只跑 case 自带的人写 reference SQL。
- **执行器身份**: 真 `maxc` CLI(`~/Library/Python/3.13/bin/maxc`),`MAXC_CONFIG=~/.maxc/config_ieu_cdm.yaml`,`MAXC_WAIT_SECONDS=300`,`CONC=3`。**非** stand-in sidecar。
- **变更**: `EvalCaseSchema` 保留 rbi provenance 且结构位置改 `strictObject`;新增 `resolveReferenceSql` 按 case 自己的 `meta.anchor_ds` 解析模板;对账脚本改走 `loadCase` + 该解析器,删掉自带 `yaml.load`、硬编码 `TODAY='20260806'`、跨 worktree 默认路径、写死的 maxc 路径与 config。
- **本次要验的**: 改造后语义**不得漂移**——同一批 case、同一锚点、同一数据源,计数须与 2026-09-06 逐位相同。

### Data (verbatim)

原始输出:[`artifacts/t11-case-expected-value-audit-event-20260909.log`](artifacts/t11-case-expected-value-audit-event-20260909.log)、[`artifacts/t11-case-expected-value-audit-dws-20260909.log`](artifacts/t11-case-expected-value-audit-dws-20260909.log)。

```
data_source=event : MATCH=2  STALE_EXPECTED=16  SKIPPED=0  (of 18)
data_source=dws   : MATCH=13 STALE_EXPECTED=0   SKIPPED=8  (of 21)
```

2026-09-06 记录值:event MATCH=2 / STALE=16(of 18)、dws MATCH=13 / STALE=0(of 21,8 个 multi-row SKIPPED)。**逐位相同。**

两个 event MATCH 均为 `0 == 0`(`056`、`130`),与原记录「both matches are 0 == 0」一致。event 侧 16 个 STALE 的逐 case 值(expected → live):`057` 773500→null、`119` 510→552、`120` 4314→4530、`121` 33503→46306、`122` 3708→4095、`123` 33571→38098、`124` 110362→129189、`125` 4327→4545、`126` 2774223→3413512、`127` 33564→45845、`128` 231133→285137、`129` 6901→8183、`135` 773500→2409900、`136` 432→482、`137` 288→259、`138` 48→null。

模板解析:39/39 全部 `resolved`,无 `UNRESOLVABLE`;37 个按 `anchor_ds=20260806` 代入(`ds_yesterday=20260805`、`ds_7d_ago=20260730`),2 个(`044`、`048`)不含模板——与「不带 `anchor_ds` 的 2 个」是同一批(本票要求核对的一项,结论:同一批)。

### Verdict

1. **改造无语义漂移。** 计数与逐 case 值都复现,说明 loader 改 strict + 保留 provenance + 按 case 解析模板,在真数据上与旧的硬编码脚本等价。旧脚本的 `TODAY='20260806'` 恰好等于全部 37 个 case 的 `anchor_ds`,所以等价是**可解释的**而非巧合;一旦有 case 换锚点,新实现才会与旧实现分叉,而那正是本票要修的缺陷。
2. **`057`/`138` 的 `live=null` 不是「陈旧」而是「无行返回」**,但与 2026-09-06 一样被计入 16 个 STALE(判定逻辑逐字保留,`Number(null)=0 ≠ expected`)。复现优先于改判——重新定义这两个 case 的口径属 GA-EVAL-CASESET-EVENT-ANCHOR,不在 T11。
3. **T11 闸门通过**,T1 可以开工。

### Fidelity caveat

- 判定逻辑逐字沿用旧脚本(含把「无行」计为 STALE),以复现为目的;它**不是** execution grader 的判分口径,T1 的五分结局与此无关。
- 本对账仍直接 `spawn maxc`,未走 query capability——收口属 T1。
- event 分区不冻结,故 event 侧的 live 值只对 2026-09-09 这一天成立;下次重跑数字会再变,这正是 GA-EVAL-CASESET-EVENT-ANCHOR 的题面。

### Ticket Pointer

Resolves: [T11 — case loader 静默丢弃 reference SQL 与 snapshot 锚点](../tickets/T11-loader-provenance-strip.md)
Unblocks: [T1 — Execution grader 实现](../tickets/T1-exec-grader-impl.md)、[G1b](../tickets/G1b-ground-truth-lifecycle.md)

---

## 2026-09-09: T1 — 统一 executor 端口后的 39-case 对账（含翻面清单与 environment-blocked 计数）

### Setup

- **基线**: 本 log 上一条（2026-09-09 T11，直接 `spawn maxc` + 原始行）。同一天、同一批 case、同一 config、同一 wait 窗口。
- **Cases**: 39 `rbi-10000251-exec`（event 18 / dws 21）。**不是 pass_rate run**——不经模型、不经 agent，只跑 case 自带的人写 reference SQL；目的是隔离“换执行通路”这一个变量。
- **执行器身份**（本票新增的落盘项）: `packages/query/query-maxcompute/dev/maxc-sidecar.mjs`（**真** sidecar，非默认 stand-in），`MAXC_CONFIG=~/.maxc/config_ieu_cdm.yaml`，`MAXC_WAIT_SECONDS=300`，`CONC=3`。
- **comparator policy**: `version=1`、`columnSemantics=by-name`、`maxStoredRows=200`。
- **变更**: 对账从 `spawn maxc` 改走 `ctx.query` + 统一 executor 端口 + `executeAndNormalize`；行坐标从“原始行数组”改为“按列名 addressing”。

### Data (verbatim)

原始输出：[`artifacts/t1-port-reconciliation-event-20260909.log`](artifacts/t1-port-reconciliation-event-20260909.log)、[`artifacts/t1-port-reconciliation-dws-20260909.log`](artifacts/t1-port-reconciliation-dws-20260909.log)。

```
data_source=event : MATCH=2  STALE_EXPECTED=14  SKIPPED=2  (of 18)
data_source=dws   : MATCH=13 STALE_EXPECTED=0   SKIPPED=8  (of 21)
```

与 T11 基线逐 case 对账（verdict + live 值同时比）：

| data_source | 逐 case 完全不变 | 有差异 |
| --- | ---: | --- |
| dws | **21 / 21** | 无 |
| event | 14 / 18 | `057`、`138`、`123`、`126` |

四个差异逐条：

| case | old（T11） | new（T1） | 归因 |
| --- | --- | --- | --- |
| `057` | STALE / live=null | STALE / live=2409900 | 旧 run 该查询没返回行，本 run 返回了。**verdict 未变**。 |
| `138` | STALE / live=null | STALE / live=39 | 同上。**verdict 未变**。 |
| `123` | STALE / live=38098 | **environment-blocked** / `query pending: instanceId=20260909055817787gzyf7wozk11` | 超过 300s 窗口被 promote 成 pending |
| `126` | STALE / live=3413512 | **environment-blocked** / `query pending: instanceId=2026090905592889ga7xrvkj12q1` | 同上（道具变动全量事件表，最重的两条） |

**environment-blocked 计数：2**（均为 event，`MAXC_WAIT_SECONDS=300`）。

**列语义翻面清单：空（0 个 case）。**

### Verdict

1. **MATCH 计数全部复现**：event MATCH=2（仍是 `056`/`130` 两个 `0 == 0`）、dws MATCH=13。dws 侧 21/21 逐 case 值也一致，说明换执行通道本身无语义偏移。
2. **列语义零翻面，但不等于风险不存在。** 本对账取首行首格（`Object.values(row)[0]`），而两种 addressing 都保持单元格顺序，所以首格必然相同。真正会翻面的是按列名取值的 `multi_scalar_exact` / `set_equal`，而这两个模式在活跃语料里 **0 使用**（R1 v3 §4.1）。结论：本批无翻面是**可解释的**，不是“风险已消除”；取值仍归 [R23](../tickets/R23-comparator-policy-mutation-baseline.md)。
3. **pending → environment-blocked 已在真数据上发生**，且就是 T1 预告的那一类：即使 `MAXC_WAIT_SECONDS=300`（而非默认 60），仍有 2 条 event 查询超窗。旧路径把它们记为 STALE（即“语料陈旧”），新路径记为“仓库没给结论”——后者才是事实。**同一批内不得中途改 wait 值**；本批固定 300。
4. **`057`/`138` 说明旧判定把“无行返回”和“值陈旧”混为一谈。** 两者 verdict 碰巧相同，所以 T11 的复现仍成立；但它提醒 STALE 计数本身不是干净指标，口径归 GA-EVAL-CASESET-EVENT-ANCHOR。
5. **一个真实的环境坑被新路径暴露**：sidecar 默认从 `PATH` 解析 `maxc`（`--maxc-bin` 默认 `maxc`），非交互 shell 下 `~/Library/Python/3.13/bin` 不在 PATH 里，首次跑得到 21/21 `spawn maxc ENOENT`。它**全部落成显式错误**而非静默误分，符合本票意图；修正方式是跑时把该目录加入 PATH。

### Fidelity caveat

- **本次跑的是 reference SQL 对账，不是一次完整的 pass^k eval run**。它验的是“统一端口后真执行通路与旧通路结果一致”，**不是**模型质量数字。本批未重建任何 pass_rate 基线。
- **上线覆盖面**：真执行判分只覆盖 **57 个 `scalar_exact` case**；86 个 `row_count_range` 仍只查行数，待 [G1b](../tickets/G1b-ground-truth-lifecycle.md) 重建；25 个 DELIVERY-only 记 `not-measured`。**不得写“143 个 case 已被执行级评分”。**
- event 分区不冻结，live 值只对 2026-09-09 成立；`057`/`138`/`123`/`126` 的跑间差异就是该不稳定性的直接证据。
- 本对账未使用 `attach`：端口保留了它，但当前策略是“遇 pending 即判 environment-blocked”。`123`/`126` 的 instanceId 已落盘，日后改策略时可用。
- **截断信号未实测**：本批无一 case 命中 `rowCount !== rows.length`（均为单行或少量行），所以 v1 锁定第 6 条的那条**待验假设仍未验**。`providerTruncated` 已按测量实现（不读 provider 的 `truncated`），但需一个已知超大结果集才能确认分叉，物料本次未备。

### Ticket Pointer

Resolves: [T1 — Execution grader 实现](../tickets/T1-exec-grader-impl.md)（实现部分；未完项见该票 Resolution）
Unblocks: [R23 — comparator policy mutation baseline](../tickets/R23-comparator-policy-mutation-baseline.md)（离线重打分所需的 artifact + raw/normalized digest 已就位）
