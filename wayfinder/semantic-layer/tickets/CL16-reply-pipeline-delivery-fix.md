---
type: task
status: open
blocked_by: []
---

# CL-16: Reply 管道二次修复 + DELIVERY 通过率提升

## Question

CL-11 修复了 DELIVERY 的 reply 管道（从截断的 "Declined: ..." 变为完整传递），使 DELIVERY 从 1/14 → 11/14。但 CL-15 分析发现仍有 8 个 DELIVERY case 失败，需要二次修复。

## 背景

CL-15 对 44 wrong cases 的诊断中，8 个 DELIVERY judge 失败分为三类：

### 类型 1：Agent 输出 tool calls 而非文本（3 个）

| Case | 问题 | Agent 输出 |
|---|---|---|
| k11v2_019 | "昨天的负面舆情条数有多少" | `<call>load_table_dimensions(...)` |
| k11v2_voice_017 | "玩家反馈怎么样" | `{"name": "load_event_definition", ...}` |
| k11v2_voice_042 | "帮我看看昨天的关键指标" | `<tool>{"name": "load_event_definition", ...}` |

**根因假设**：`context.ts` 中 reply 提取逻辑取到了 agent 的中间 tool call 而非最终文本回复。CL-11 修复了 "Declined: ..." 截断，但未覆盖 agent 输出混杂 tool calls + 文本的情况。

### 类型 2：Agent 对 DELIVERY 问题错误生成 SQL（4 个）

| Case | 问题 | Agent 行为 |
|---|---|---|
| k11v2_075 | "哪些玩法需要优化" | 生成了 SELECT SQL |
| k11v2_079 | "卡牌平衡性怎么样" | 生成了 SELECT SQL |
| k11v2_voice_043 | "有没有什么数据值得关注的" | 生成了 SELECT SQL |
| k11v2_voice_048 | "这个月运营数据总结一下" | 生成了 SELECT SQL |

**根因假设**：这些问题表面上可以用 SQL 回答（有对应表），但 expected.answer 期望的是澄清/引导式回复。Agent 未识别出应拒绝并引导。这是 agent 行为问题而非管道问题。

### 类型 3：空输出（1 个）

| Case | 问题 | Agent 输出 |
|---|---|---|
| k11v2_078 | "最近有什么异常数据" | （空） |

**根因假设**：pipeline 故障，agent 未产生任何输出。

## 行动项

1. **诊断 reply 提取逻辑**（`packages/eval/eval-cli/src/context.ts`）：
   - 定位 agent 回复提取点，确认为何 tool calls 被当作最终回复
   - 修复：确保取 agent 的最后一条纯文本消息（非 tool call）
   - 验证：对 k11v2_019 / voice_017 / voice_042 单独跑 eval

2. **评估类型 2 的 expected.answer 措辞**：
   - 检查 k11v2_075 / 079 / voice_043 / voice_048 的 expected.answer
   - 如果 agent 生成的 SQL 实际上是合理回答 → 考虑将这些 case 改回 EXEC
   - 如果 expected.answer 的拒绝/引导确实更合适 → 保持 DELIVERY，调整 expected.answer 措辞使 judge 能更宽容地匹配

3. **诊断 k11v2_078 空输出**

4. **跑完整 eval 验证**，用 `compare.ts` 对比基线

## 验收标准

- DELIVERY 通过率从 75.0%（12/16 → 迁移后 12/20）提升至 85%+
- 类型 1 的 3 个 case 全部修复
- 全量 eval run 记录到 experiment-audit-log.md

## 关键文件

- reply 提取逻辑：`packages/eval/eval-cli/src/context.ts`
- judge prompt：`packages/eval/eval-runner-service/src/index.ts`
- DELIVERY case YAML：`packages/eval/eval/cases/k11-v2/`
- 实验日志：`wayfinder/semantic-layer/research/experiment-audit-log.md`
