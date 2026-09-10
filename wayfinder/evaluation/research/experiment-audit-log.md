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

## 2026-09-10: R8 — judge readout 算术复核（= R20 探针 a）

### Setup
- **基线**: 无。**不是一次 eval run**——零 LLM 调用、零 agent 调用；对 `eval-results/` 已落盘结果的**确定性重新聚合**，同输入必得同输出。因此本条不适用「与上一次基线 run 对比」。
- **数据源**: `eval-results/*.json` 共 **80** 份；29 份含 `sql_judge`，其中 **19** 份带非空 `dimensions` ⇒ attempt 级逐维向量 **1495** 条（5 维齐全，键集合 100% 一致）。
- **Model**: 混合且**多数不可知**。1495 条里仅 **375 条（25.1%）**能恢复执行模式（`config.with_query` 存在）；带 `config` 的 6 份全为 `aga/qwen3.7-max`。**这本身是 G1 v3 D4「模式不可恢复」在 judge 维度上的同一个洞。**
- **被测对象**: `LlmSqlSemanticJudge` 的读出规则 `score = Σ(5 个二值维度)/5`（`packages/eval/eval-runner/src/sql_semantic_judge.ts:136-142`），阈值 `SQL_JUDGE_PASS_THRESHOLD = 0.6`（`packages/eval/eval-runner/src/runner.ts:34-35`）。

### Data (verbatim)

```
n=1495
mean>=0.6 PASS          : 1377  (92.11%)
overall_semantics==1    : 1249  (83.55%)   <- what a gated readout would pass
delta (mean-gate)       : 128  (8.56 pp)
PASS while overall==0   : 128  (8.56%)  <- 'overall outvoted 3:2'
FAIL while overall==1   : 0  (0.00%)

patterns among PASS-while-overall==0:
    (1, 1, 0, 1, 0) score= 0.6 77
    (1, 1, 1, 0, 0) score= 0.6 22
    (1, 0, 1, 1, 0) score= 0.6 15
    (1, 1, 1, 1, 0) score= 0.8 8
    (0, 1, 1, 1, 0) score= 0.6 6

patterns among FAIL-while-overall==1:
    (none)

among overall==1, all four mechanical dims ==1: 1247  (99.84%)
  -> vectors with overall==1 and >=1 mechanical 0: 2
      (1, 1, 0, 1, 1) 1
      (0, 1, 1, 1, 1) 1
among overall==0, mechanical dims mean:
   table_selection      0.6504
   field_selection      0.5569
   filter_conditions    0.3577
   aggregation_logic    0.6707
P(all-mech-1 | overall=1)=0.9984   P(all-mech-1 | overall=0)=0.0325

marginal pass rate per dim:
  table_selection      mean=0.9418  n1=1408  n0=87
  field_selection      mean=0.9271  n1=1386  n0=109
  filter_conditions    mean=0.8936  n1=1336  n0=159
  aggregation_logic    mean=0.9458  n1=1414  n0=81
  overall_semantics    mean=0.8355  n1=1249  n0=246

joint: (1,1,1,1,1) = 1247 / 1495 = 83.4%;  18 of 32 patterns observed
score distribution: 1.0 83.4% | 0.6 8.0% | 0.4 4.1% | 0.2 2.3% | 0.0 1.5% | 0.8 0.7%(10)
per-run all-ones share: 64.9%–100% across 19 files (14 files with n>=70 fall in 78.8%–90.4%)
```

### Verdict

1. **现行五维 flat-mean 读出从不比单看 `overall_semantics` 更严，只会更松，差额 8.56pp。** `overall=1` 却被判 FAIL 的有 **0/1495**——算术上可能（`(0,0,0,0,1)` ⇒ 0.2 < 0.6），经验上一次未出现。
2. **四个机械维度在 `overall=1` 时几乎恒为 1（0.9984），只在 `overall=0` 时分化，而分化的作用就是投票推翻那个 0。** 判官说「这条 SQL 答不了用户的问题」的 246 次里，**128 次（52.03%）该 case 仍然通过**。
3. **这比 map 方向 8 的原假设更极端**：不是「2-3 维测同一潜变量」，而是**四维在决策上几乎不参与，只充当漏**。
4. **跨 run 稳定**（19 份文件 all-ones 64.9%–100%），不是单次坏 run 造成的假象。
5. **不要把它读成「gated 读出更正确」**——本条只证明 flat-mean 不比 gate 更严，**没有真值参与**。哪个读出更接近执行事实要等 T1；判方向的探针见 R20 b/c，且 `2608.14684` 自陈 joint-vs-isolation 的差只测不稳定性、不测谁对。
6. **fidelity caveat**：1495 条池化了 19 次 run、1120 条模式不可知、且 80 份结果文件 **0 份**记录判官据以打分的 `schema_context`（judge 证据基础从未落盘）。所以这四个数是对「读出规则」的可靠陈述，**不是**对任何一次具体 run 质量的陈述。
7. **下一步**：把一次性脚本固化为 `packages/eval/eval-cli/dev/judge-readout-audit.mjs`（R20 探针 a 的剩余工作），使任何读出变更后可一条命令复算。

### 复算方式（2026-09-10 已固化）

```bash
node packages/eval/eval-cli/dev/judge-readout-audit.mjs          # 报告
EXPECT_NO_LEAK=1 node packages/eval/eval-cli/dev/judge-readout-audit.mjs   # 门：仍有漏则 exit 1
```

脚本已验证**逐数复现**本条 Data 段的全部数字（含 5 个 leak 模式的计数与 per-run 分层）。维度清单从数据发现、`DECISION_DIM`/`THRESHOLD` 可 env 覆盖，所以 G8 改维度数/阈值/闸门维度后无需改脚本。**注意其输出的模式元组按 prompt 顺序**（`table, field, filter, agg, overall`）排列，与本条 Data 段一致——脚本内部刻意不按字母序，否则同一批数据看起来像变了。

### Ticket Pointer
Resolves: [R8 — 判官读出 / 量表 / 顺序论文认读](../tickets/R8-pairwise-judge-papers.md)（探针 a 部分）
Feeds: [R20 — 判官读出与准则探针](../tickets/R20-judge-readout-probes.md)、[G8 — 判官读出与量表](../tickets/G8-judge-readout-scale.md)
证据文档: [`pairwise-judge-papers.md`](pairwise-judge-papers.md) §2
