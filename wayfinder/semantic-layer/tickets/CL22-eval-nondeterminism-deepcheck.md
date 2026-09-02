---
type: research
status: open
blocked_by: []
---

# CL-22: eval 非确定性深查（-3pp / Alias -15pp / dup BM25 效应）

## Question

2026-09-02 联合 eval（run `32dd9532`）overall 70.8%（-3.0pp vs `10320fe2`），Alias -15.0pp。需回答：

1. **-3pp 是噪声还是真回归**：该 eval LLM 非确定性高（08-31 run 自身 net ±5）。单 run 不结论——需多 run（建议 ≥3）取中位数 + 置信区间，确认 70.8% 是 baseline 噪声还是代码态/dup 清理导致。
2. **dup 清理 BM25 效应**：CL-17 dup 清理（去 `univ_role_tag_df` 回归/回流 重复）理论中性，但 BM25 term-frequency 使其非严格中性。单 run 无法区分 dup 效应 vs 非确定性。需对照 run（dup 清理 vs 回滚）。
3. **Alias -15pp 归因**：lost 9 alias 多样（tool-call/SQL/CASE/拒绝），非 回归/回流 单一检索效应（回归 case `alias_016`/`028` 反 GAINED）。需逐 case trace 确认是检索变化还是 LLM 行为波动。

## 背景

- 2026-09-02 联合 eval + voice_017 单 case 已记 [experiment-audit-log.md](../research/experiment-audit-log.md)。
- eval wrapper `scripts/run-eval.sh`（`--skip-health-gate` + `~/.dsh/.credentials.yaml`）。
- 每次 full run 约 38min；多 run 成本需权衡。

## 验收

- ≥3 次 full run 中位数 + per-category 稳定性。
- dup 清理对照（回滚 vs 保留）的 Alias delta。
- 结论：70.8% 是否在噪声带 / dup 清理是否该回滚 / 是否需多 run 基线。
- 记 experiment-audit-log。

## 关键文件

- eval wrapper：`scripts/run-eval.sh`
- compare 工具：`packages/eval/eval-cli/bin/compare.ts`
- 实验日志：`wayfinder/semantic-layer/research/experiment-audit-log.md`
- dup 清理点：`examples/k11-semantic-layer/tables/dws_10000251_univ_role_tag_df.yaml`
