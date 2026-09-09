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
