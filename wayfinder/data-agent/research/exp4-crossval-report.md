# GA-EXP4 — qwen3.7-max 英文 Prompt 交叉验证报告

**日期**: 2026-09-03
**实验票**: [GA-EXP4](../tickets/phase-misc/GA-EXP4-qwen37max-en-prompt-crossval.md)
**数据**: `eval-results/exp4/exp4-arm-{a,b}.json`

---

## 核心结论

**qwen3.7-max 英文 prompt 退化仅 -3.0%（88.1%→85.1%），完全在文献预期范围内。EXP2 的 -41.1% 灾难性退化是 qwen-plus 能力不足，不是英文 prompt 的结构性问题。**

## 结果对比

| 实验 | 模型 | Prompt | Pass Rate | B-A Delta |
|------|------|--------|-----------|-----------|
| EXP2 ARM A | qwen-plus | 中文 | 72.0% | — |
| EXP2 ARM B | qwen-plus | 英文 | 31.0% | **-41.1%** |
| **EXP4 ARM A** | **qwen3.7-max** | **中文** | **88.1%** | — |
| **EXP4 ARM B** | **qwen3.7-max** | **英文** | **85.1%** | **-3.0%** |

## SQL 生成行为对比

| 指标 | EXP2 qwen-plus ZH | EXP2 qwen-plus EN | EXP4 qwen3.7-max ZH | EXP4 qwen3.7-max EN |
|------|-------------------|-------------------|---------------------|---------------------|
| has_sql（最终 attempt） | 126 | 66 | 115 | 114 |
| no_sql | 7 | 93 | 0 | 0 |
| text_not_sql | 35 | 9 | 53 | 54 |

**qwen3.7-max 完全消除了 "Helpful Assistant" 模式切换问题**：
- EXP2 qwen-plus EN 有 93 个 case 最终 attempt 无 SQL（55%），EXP4 qwen3.7-max EN 是 **0 个**
- 两组 SQL 生成率几乎相同（114 vs 115）

## Diff 分析

| 类别 | EXP4 数量 | EXP2 数量 |
|------|-----------|-----------|
| both_correct | 137 | 45 |
| A correct, B wrong | 11 | 76 |
| B correct, A wrong | 6 | 7 |
| both_wrong | 14 | 40 |

EXP4 仅 11 个 case A 过 B 未过（vs EXP2 的 76 个），且有 6 个反向 case（B 过 A 未过），净损失仅 5 个 case。

## 对 GA-EXP3 结论的修正

GA-EXP3 归因的三个因子在 qwen3.7-max 上的表现：

| GA-EXP3 因子 | qwen-plus 表现 | qwen3.7-max 表现 | 结论 |
|-------------|---------------|-----------------|------|
| ① 模型行为模式切换（~55-60%） | 灾难性：67% case 无 SQL | **完全消除**：0 个 case 无 SQL | **纯 qwen-plus 能力问题** |
| ② 跨语言上下文干扰（~25-30%） | 表选择 60%→34% | 退化仅 -3.0% | **更强模型可忽略此干扰** |
| ③ 翻译精度损失（~5-10%） | 微弱 | 被 -3.0% 总退化吸收 | 符合预期 |

## 决策影响

1. **Kind 1（prompt 英文化）重新打开**：模型升级到 qwen3.7-max 后，英文 prompt 可行（-3.0% 在可接受范围）
2. **GA-EXP3 "qwen-plus 特定结论" 被验证**：退化确实是模型能力不足，不是任务类型或混合语言的结构性问题
3. **qwen3.7-max baseline 显著提升**：88.1% vs qwen-plus 的 72.0%（+16.1%），模型升级本身就是最大的质量杠杆
4. **文献预期被确认**：-3.0% 退化在 Layer Swap 报告的 1.9-3.5% 范围内——前沿研究结论在更强模型上成立
