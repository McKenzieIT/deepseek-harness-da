# Session Prompt: CL-16 + CL-17 sql-judge 质量推进至 80%

## 上下文

CL-15 确立了 sql-judge 为标准 eval 基线，并对 44 个 wrong cases 做了完整分类诊断。当前基线：

```
sql-judge 模式（Run 10320fe2，2026-08-30）：
  Original 80:     60 pass / 20 wrong = 75.0%
  Alias 40:        31 pass / 9 wrong  = 77.5%
  Voice EXEC 30:   21 pass / 9 wrong  = 70.0%  （注：CL-15 迁移后 EXEC 从 32→30）
  Voice DELIVERY 18: 12 pass / 6 wrong = 66.7%  （注：CL-15 迁移后 DELIVERY 从 16→20，其中 4 个新迁移待验证）
  Total 168:       124 pass / 44 wrong = 73.8%
```

CL-15 已迁移 4 个主观 case 为 DELIVERY（074/080/voice_034/voice_039），尚未跑 eval 验证。

## 本 session 目标

两个 ticket 并行推进，目标 **overall 78%+**（中期 80% 目标的踏脚石）。

## ⚠️ 实验记录强制要求

**每次 eval run 必须记录到 `wayfinder/semantic-layer/research/experiment-audit-log.md`。**

- 使用标准模板（见 `packages/eval/eval-cli/README.md` "Recording Results"）
- 必须用 `compare.ts` 与基线 run 对比
- 未记录的 eval run 等于未发生（LLM 非确定性，不可重现）
- 即使中间调试 run，若结果影响决策也要记录简要条目

**基线 run_id**（上一次标准 run）：`10320fe2-f2af-4586-aa82-705ed12aef09`

## CL-16: Reply 管道二次修复

### 问题

8 个 DELIVERY case 仍 wrong，分三类：

**类型 1 — pipeline 提取错误（3 个，优先修复）**：
- `k11v2_019`（"昨天的负面舆情条数"）：agent 输出 `<call>load_table_dimensions(...)`
- `k11v2_voice_017`（"玩家反馈怎么样"）：agent 输出 `{"name": "load_event_definition", ...}`
- `k11v2_voice_042`（"帮我看看昨天的关键指标"）：agent 输出 `<tool>{"name": ...}`

**根因定位方向**：`packages/eval/eval-cli/src/context.ts` 中 reply 提取逻辑。CL-11 修复了 "Declined: ..." 截断，但未覆盖 agent 输出混杂 tool calls + 文本的情况。需确保取 agent 最终文本回复，而非中间 tool calls。

**类型 2 — agent 对 DELIVERY 问题生成 SQL（4 个）**：
- `k11v2_075`（"哪些玩法需要优化"）、`k11v2_079`（"卡牌平衡性怎么样"）
- `k11v2_voice_043`（"有没有什么数据值得关注的"）、`k11v2_voice_048`（"这个月运营数据总结一下"）

**处理方向**：检查这些 case 的 expected.answer。如果 agent 生成的 SQL 是合理回答 → 改回 EXEC。如果拒绝/引导更合适 → 调整 expected.answer 措辞。

**类型 3 — 空输出（1 个）**：
- `k11v2_078`（"最近有什么异常数据"）：agent 无输出

### 关键文件

- **reply 提取逻辑**：`packages/eval/eval-cli/src/context.ts`（搜索 `LlmJudgeExecutor`、reply 管道、`generated_sql` 提取）
- **judge prompt**：`packages/eval/eval-runner-service/src/index.ts`
- **CL-11 修复参考**：git log 搜索 CL-11 相关 commit

### 验收

- 类型 1 的 3 个 case 修复（reply 管道正确提取文本）
- DELIVERY 通过率 ≥ 85%

## CL-17: 数据源缺口 enrichment 第二轮

### 高优先级候选（enrichment 可修复，7 个）

| Case | 问题 | 操作方向 |
|---|---|---|
| k11v2_027 | "昨天金币的总消耗量" | 检查 `item_circle_df` 的 alt_labels/pref_label，加强 BM25 信号 |
| k11v2_029 | "全服平均等级" | 检查是否有角色等级字段的表，补充 alt_labels |
| k11v2_037 | "iOS和安卓平台的付费人数对比" | 检查 `com_pay_order_di` 是否有 platform/channel 字段 |
| k11v2_018 | "通关最终关卡的角色有多少" | `pve_progress_df` 已有 enrichment，检查 alt_labels 是否覆盖"关卡""通关" |
| k11v2_071 | "加入小队的用户和未加入的用户留存率" | 检查社交/小队相关表 |
| k11v2_voice_005 | "这把卡池出金率多少" | `gacha_result_statis_di` 检查 alt_labels |
| k11v2_voice_007 | "免费玩家占多大比例" | `acc_summary_df` 检查 pay 字段 alt_labels |

### 概念缺口（5 个）

| Case | 问题 | 操作方向 |
|---|---|---|
| k11v2_voice_026 | "各服大R占比和活跃人数有没有关联" | 「大R」→ 考虑在 `acc_summary_df` 加 alt_label "大R"/"高付费用户" |
| k11v2_voice_028 | "流失用户里面大R有多少" | 同上 |
| k11v2_alias_016 | "回归玩家中重新付费的转化率" | 「回归」→ 检查是否有回流/回归相关表 |
| k11v2_alias_022 | "回归玩家各渠道来源的分布" | 同上 |
| k11v2_alias_038 | "零氪用户和氪金用户的回归率差异" | 同上 |

### 操作流程

1. 逐表查看 `examples/k11-semantic-layer/tables/<table>.yaml` 的当前 alt_labels
2. 用 `grep` 确认目标表的字段/维度
3. 修改 YAML 补充 alt_labels / pref_label
4. 单 case 快速验证（`--case <id>`）
5. 全量 eval 验证 + `compare.ts` 对比

### 验收

- 7 个检索缺口 case 至少 4 个翻转为 correct
- 概念缺口 5 个至少 2 个翻转
- overall ≥ 78%

## 推荐执行顺序

1. **先跑一次全量 eval 验证 CL-15 的 4 个 DELIVERY 迁移**（用当前代码，不做任何变更）→ 记录实验结果
2. **CL-16 类型 1 修复**（reply 管道，3 case）→ 单 case 验证
3. **CL-17 enrichment**（逐表分析 + 补充 alt_labels）
4. **全量 eval 验证 CL-16 + CL-17 联合效果** → 记录实验结果 → 用 `compare.ts` 对比基线

## 运行 eval 命令

```bash
# 全量 sql-judge eval
DASHSCOPE_API_KEY=$(grep DASHSCOPE_API_KEY ~/.dsh/.credentials.yaml | awk '{print $2}') \
node --import tsx/esm packages/eval/eval-cli/bin/eval.ts \
  --cases packages/eval/eval/cases/k11-v2 --pass-k 1 --concurrency 4 --skip-health-gate

# 单 case 调试
DASHSCOPE_API_KEY=$(grep DASHSCOPE_API_KEY ~/.dsh/.credentials.yaml | awk '{print $2}') \
node --import tsx/esm packages/eval/eval-cli/bin/eval.ts \
  --cases packages/eval/eval/cases/k11-v2 --case k11v2_019 --pass-k 1 --skip-health-gate

# 趋势对比（基线 vs 新 run）
node --import tsx/esm packages/eval/eval-cli/bin/compare.ts 10320fe2 <new_run_id>
```

## 重要文件位置

- eval 结果（CL-15 基线）: `eval-results/10320fe2-f2af-4586-aa82-705ed12aef09.json`
- eval-cli 主入口: `packages/eval/eval-cli/src/main.ts`
- reply 提取 + judge 逻辑: `packages/eval/eval-cli/src/context.ts`
- judge prompt: `packages/eval/eval-runner-service/src/index.ts`
- eval case YAML: `packages/eval/eval/cases/k11-v2/`
- 语义层定义: `examples/k11-semantic-layer/tables/`
- concepts: `examples/k11-semantic-layer/concepts/`
- compare 工具: `packages/eval/eval-cli/bin/compare.ts`
- 实验日志: `wayfinder/semantic-layer/research/experiment-audit-log.md`
- wayfinder map: `wayfinder/semantic-layer/map.md`

## 质量目标

| 指标 | CL-15 结果 | 本 session 目标 |
|------|-----------|----------------|
| Overall | 73.8% | **78%+** |
| Original | 75.0% | **78%+** |
| DELIVERY | 66.7%（迁移后） | **85%+** |
| Voice EXEC | 70.0% | **保持或提升** |
