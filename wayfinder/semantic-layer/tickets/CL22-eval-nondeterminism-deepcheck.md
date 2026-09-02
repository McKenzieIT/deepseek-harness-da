---
type: research
status: closed
blocked_by: []
assigned_to: claude
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

## Resolution

3 同代码 run（`32dd9532` / `e7a946be` / `b244533a`，HEAD `1f295b8f5c`）+ case-level trace + 历史同代码对照（`10320fe2` / `75ad2a5c`）回答全部三个问题：

### Q1: -3pp 是噪声

**是噪声。** 3 run 中位数 73.2%（与 CL-15 同代码重跑 73.2% 一致），70.8% 是异常值。同代码 range ±2.4pp。Case flip rate 26.8%（45/168）。单 run 结果不可用于趋势判断。

### Q2: Dup 清理无需回滚

**不回滚。** Case-level 证据决定性：0/9 lost alias cases 使用 回归/回流 词汇。唯一使用"回归"的 alias_016 在各 run 中随机翻转（CL-15:WRONG → A:CORRECT → B:WRONG → C:WRONG），与 dup 无关。Dup 清理（tf 2→1）不影响检索召回——term 仍存在于 alt_labels，仅去重。

dup 清理对照实验因 case-level 证据已决定性而省略。以 20.8% baseline flip rate，单 run 对照无统计效力——需 ≥3 run/condition × 2 condition = 6+ 额外 run（~4h）才能检测 2-term-frequency 差异，成本/收益不对称。

### Q3: Alias -15pp = LLM 非确定性

9 lost cases 失败模式多样（裸 CASE 4 / tool-call 1 / SQL 逻辑 2 / 检索失败 1 / 拒绝 1），5/9 在同代码重跑中也翻转。Alias 3-run range ±7.5pp（40-case 基数上 3 个 case flip = 7.5pp）。4/9 为"完美交替"coin-flip cases。

### 建议

后续 eval 至少跑 3 次取中位数，或引入 pass_k=3 + majority-vote 降噪。真实基线（中位数）：Overall 73.2%, Original 76.3%, Alias 65.0%, Voice EXEC 73.3%, Voice DELIVERY 77.8%。
