# V3 — 细粒度 auto-revert

**Type**: grilling (HITL)
**Phase**: post-G6, ③-gated
**Status**: open
**Assignee**: unclaimed
**Blocked by**: [V2](V2-eval-run-changeset-annotation.md)
**Related**: G6（D5 决策）、G3（eval-based confidence gate 设计）、W6a（goal-eval-policy）

## Question

eval regression 发生时，基于 changeset + affected scope 分析，只 revert 与回归相关的变更，而非全量 changeset 回滚。

需要讨论并决策：

1. **affected scope 映射**：如何确定"哪些 eval case 测的是哪些资产"？
   - 选项 A：eval case YAML 中显式标注 `target_assets: [...]`
   - 选项 B：从 case 的 question/expected SQL 中自动推断涉及的表名
   - 选项 C：运行时从 agent tool call chain 中提取实际使用的资产

2. **revert 粒度**：回归发生时 revert 的最小单位？
   - 选项 A：per-asset（某张表的整个定义回到上一个版本）
   - 选项 B：per-field（只回滚具体变更的字段，如 alt_labels）

3. **revert 触发条件**：G3 设计的 >5pp drop 阈值是否仍适用？是否需要 per-category 或 per-asset 的细粒度阈值？

4. **revert 后的 re-eval**：revert 后是否立即触发一次确认性 eval，验证 pass_rate 恢复？

### Scope

Grilling session 讨论细粒度 revert 的映射、粒度、触发条件。毕业实现 ticket。此 ticket 为 ③-gated，在 v1 ①② 栈完成后展开。
