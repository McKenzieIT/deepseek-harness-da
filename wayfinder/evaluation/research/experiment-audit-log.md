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
