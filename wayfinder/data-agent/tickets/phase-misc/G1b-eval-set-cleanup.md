# G1b-eval-set-cleanup — 归档低质量 eval case set

**Type**: task
**Phase**: misc
**Status**: open
**Assignee**: (unclaimed)

## Question

归档 `packages/eval/eval/cases/k11/` (161 cases) 和 `eval-results/g1b-30cases/` (30 cases 子集)，统一使用 `packages/eval/eval/cases/k11-v2/` (80 cases) 作为 G1b eval 的标准 case set。

## 原因

| 问题 | k11 (v1) | k11-v2 |
|------|----------|--------|
| 问题表述 | 英文表名片段混搭（"biz role tag汇总"）| 自然中文（"昨天的总付费金额是多少"）|
| expected 值 | 大量占位符(12345/8900/62100) | 更合理的估计值 |
| row_count_range 范围 | 固定 {25,30}（不区分趋势/分布）| 多样化 {1,3}/{5,7}/{5,50} |
| 覆盖 | 161 case 但质量低 | 80 case 精选 |

k11 v1 的核心缺陷：
1. 问题不像真实用户会问的（"algo role ch昨日数据" ← 谁会这么说？）
2. scalar_exact 的 expected 值全是占位符，永远不可能 pass
3. `eval-results/g1b-30cases/` 是 k11 的子集，没有独立存在价值

## 执行计划

1. 将 `packages/eval/eval/cases/k11/` 移至 `packages/eval/eval/cases/_archived/k11-v1/`
2. 删除 `eval-results/g1b-30cases/`（与 k11 v1 完全重复）
3. 删除 `eval-results/g1b-cases/`（5 case 诊断子集，已无用）
4. 更新 `eval-results/g1b/diag-single.sh` 和 `rerun-configC.sh` 指向 k11-v2
5. 确认 eval CLI `--cases packages/eval/eval/cases/k11-v2` 能正常加载

## 验收标准

- k11-v2 是唯一的 active eval case set
- 旧 case set 归档但不删除（保留 git 历史可追溯）
- eval CLI 默认指向 k11-v2
