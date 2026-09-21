# Session Prompt: CL-15 sql-judge 标准基线确立

## 上下文

CL-11~14 联合完成了 sql-judge 质量提升，当前基线：

```
sql-judge 模式（Run 10320fe2，2026-08-30）：
  Original 80: 60 pass / 20 wrong = 75.0%
  Alias 40:    31 pass / 9 wrong  = 77.5%
  Voice EXEC 32: 21 pass / 11 wrong = 65.6%
  Voice DELIVERY 16: 12 pass / 4 wrong = 75.0%
  Total 168:   124 pass / 44 wrong = 73.8%
```

对比 CL-10 基线（66.1%）提升了 +7.7pp。主要改进来自：
- DELIVERY judge 修复（reply 管道 + prompt 改进）：1/14 → 11/14
- 9 表 alt_labels enrichment：voice_003/008/030/032 翻转
- 7 个不可回答 case 迁移为 DELIVERY 格式

**剩余差距**：距 75% 目标差 1.2pp，距 original 80% 目标差 5pp。15 个 loss 为 LLM 非确定性波动。

## 本 session 目标

CL-15 的核心目标是将 sql-judge 模式**确立为标准 eval 基线**，并推进质量到 75%+ 稳定线。

## 推荐执行内容

### 1. sql-judge 标准化文档 + CI 集成

**具体步骤**：
1. 在 `packages/eval/eval-cli/README.md` 或 `docs/` 中记录 sql-judge 模式为标准评估方式
2. 确认 eval 命令行默认启用 sql-judge（当前 `--no-sql-judge` 是 opt-out）
3. 考虑在 CI 脚本中加入 eval smoke test（可选：挑选 5-10 个 stable case 做回归门禁）

### 2. 质量趋势追踪基建

**具体步骤**：
1. 设计 eval 结果的持久化格式（当前已有 `eval-results/<run_id>.json`）
2. 编写简单的趋势对比脚本：输入两个 run_id，输出 category 级别的 delta + case-level flips
3. 在 experiment-audit-log.md 中建立标准记录模板

### 3. 稳定性提升（可选，如果时间允许）

分析 44 个 remaining wrong cases 中的 "low-hanging fruit"：

**迁移到 DELIVERY 的候选（agent 正确拒绝但被判 execution_match=false）**：
- 检查剩余 wrong cases 中 `generated_sql` 为文本拒绝的 case
- 如果 agent 拒绝理由合理且数据确实不支持 → 迁移为 DELIVERY

**可修复的 enrichment 缺口**：
- k11v2_027（金币消耗）：agent 找到 dim 表而非 item_circle_df，需要更强的 BM25 排序信号
- k11v2_059（流失预测高风险）：agent 找不到 algo_role_churn_pred 表
- k11v2_066/067：多表 join 案例，需要两个表同时被检索到

**迁移到 DELIVERY 的候选（5 个迁移中只有 2 个 pass 的诊断）**：
- k11v2_019, 075, 078, 079, voice_017 judge 仍打分低于 0.6
- 检查 judge 实际看到的 reply 内容 vs expected.answer，可能需要进一步调整 expected.answer 措辞

## 重要文件位置

- eval 结果（最新）: `eval-results/10320fe2-f2af-4586-aa82-705ed12aef09.json`
- eval 结果（CL-10 基线）: `eval-results/9788424c-a167-4a19-9c72-e27ae7455f58.json`
- eval-cli: `packages/eval/eval-cli/src/main.ts`
- judge + reply 逻辑: `packages/eval/eval-cli/src/context.ts`（LlmJudgeExecutor + reply 管道）
- judge prompt（eval-runner-service）: `packages/eval/eval-runner-service/src/index.ts`
- eval case schema: `packages/eval/eval/src/eval_case.ts`
- 语义层定义: `examples/k11-semantic-layer/tables/`
- voice cases: `packages/eval/eval/cases/k11-v2/k11v2_voice_*.yaml`
- wayfinder map: `wayfinder/semantic-layer/map.md`
- 实验日志: `wayfinder/semantic-layer/research/experiment-audit-log.md`

## 运行 eval 命令

```bash
# sql-judge 模式（标准）
DASHSCOPE_API_KEY=$(grep DASHSCOPE_API_KEY ~/.dsh/.credentials.yaml | awk '{print $2}') \
node --import tsx/esm packages/eval/eval-cli/src/bin.ts \
  --cases packages/eval/eval/cases/k11-v2 --pass-k 1 --concurrency 4 --skip-health-gate
```

## 质量目标

| 指标 | CL-11~14 结果 | 本 session 目标 |
|------|--------------|----------------|
| Overall | 73.8% | **75%+ 稳定** |
| Original | 75.0% | **78%+** |
| Voice DELIVERY | 75.0% | **保持** |

## CL-11~14 遗留分析（供参考）

### 44 个 remaining wrong 的分类

**Original 20 wrong** 主要模式：
- ~12 个 "no_sql"（agent 拒绝而非生成 SQL）：agent 找不到正确表或过于谨慎
- ~3 个实际 SQL 语义错误：选错表、缺 join、过滤条件偏差
- ~5 个 migrated-to-DELIVERY 但 judge 仍打分低：expected.answer 措辞可能需调整

**Alias 9 wrong** 主要模式：
- 多为 LLM 非确定性波动（基线 80% → 77.5%，-2.5pp）

**Voice 11 wrong (EXEC)** 主要模式：
- ~5 个数据源缺口（agent 找不到表）
- ~3 个多表 join 不完整
- ~3 个 LLM 非确定性

**Voice 4 wrong (DELIVERY)** 主要模式：
- voice_042/043/048：judge 分数接近阈值（0.6），可能 prompt 微调可修复
- voice_042 是 "关键指标有哪些变化" — agent 生成了 tool calls 而非文本拒绝
