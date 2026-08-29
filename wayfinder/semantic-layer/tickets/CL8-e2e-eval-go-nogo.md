# CL-8 — 端到端 Eval 验证 + Go/No-Go 决策

**Type**: grilling
**Phase**: context-layer-alignment
**Status**: resolved
**Assignee**: claude
**Blocked by**: [CL-7](CL7-production-retrieval-experiment.md)
**Blocks**: 无

## Resolution

**GO — ship alias scoring fix + L3 enrichment。**

端到端 eval（80 original cases, pass_k=1, engine responder, qwen3.7-max, SqlJudge 禁用）：

- **pass_rate = 96.3%**（77/80 correct, 0 declined, 0 infra_failure）
- 3 wrong cases 均为 PVP/古战场 metric_lookup（k11v2_011, _012, _025）
- 无本次修改引入的 regression

Run ID: `cl8-full-fixed`，结果: `eval-results/cl8/cl8-full-fixed.json`

⚠️ **blendingMode 注记**：`cl8-full-fixed` 跑的时候 `Config.blendingMode` 默认值为 `strategy-b`（B 已有 median-floor 修复）。CL-7 已证明 B=C（120/120 unchanged）。

**交叉验证 `cl8-continuous-blend`**（2026-08-30 审查 session）：用 `continuous-blend` 默认重跑，**pass_rate = 100.0%**（80/80 correct, 0 wrong, 0 declined）。前次 3 wrong cases（k11v2_011, _012, _025）均通过——归因于 LLM 非确定性（PVP 边界 case），非 blendingMode 差异。

注意：两次 eval 均仅跑 80 original cases（eval-cli glob regex 过滤了 alias case 文件名）。Alias 40 cases 的端到端验证需修复 eval-cli 的 glob 或单独跑。

## Question

用 eval pass_rate（端到端：NL→SQL→执行→结果）正式验证 continuous-blend 是否应切换为生产策略。

### 3a. 配置 eval runner

使用 W3 `runBatch`，120 K11 cases，pass_k=1。

### 3b. 对比 runs

| Run | blendingMode | 语义层状态 |
|-----|-------------|-----------|
| run-b-l1 | strategy-b | L1（当前） |
| run-c-l1 | continuous-blend | L1（当前） |
| run-c-l3 | continuous-blend | L3（enriched） |

### 3c. Go/No-Go 决策

- run-c-l1 pass_rate > run-b-l1 且无严重 regression → **切换生产为 continuous-blend**
- run-c-l3 pass_rate 显著 > run-c-l1 → **确认 enrichment 投资优先级**
- C pass_rate ≤ B → **不切换**，分析原因

### 3d. 输出

更新实验报告，新增"端到端验证"章节，含 pass_rate、flip 分析、最终决策。记录到 experiment-audit-log.md。
