# T16 — Execution artifact 截断信号实测

**Type**: task（validation，AFK）  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: [T1 — Execution grader implementation](T1-exec-grader-impl.md)
**Blocks**: [R25 — Evaluation re-baseline](R25-evaluation-rebaseline.md)
**Mode**: AFK（需要真实 query Provider 与可控的大结果集）
**Branch**: `task/T16-execution-artifact-truncation-validation`

## Question

真实 data-agent query Provider 返回大结果集时，`rowCount`、materialized rows 与 Provider 自身截断行为是否足以让 Execution Artifact 准确区分“完整结果”“Provider 未返回完整结果”和“仅持久化预览被截断”，并让正式基线拒绝不可重放的 grade？

## Required scope

- 构造或选择一个已知超过结果物化上限的只读数据查询，不使用合成 stand-in 冒充真实 Provider 行为。
- 记录 Provider 配置、scope、SQL、等待窗口、返回 `rowCount`、实际 materialized rows、Provider 状态与 execution artifact。
- 验证在线评分不受 `maxStoredRows` 影响；持久化后需要完整行集的 comparator 在证据不足时返回 `not-measured`，不计为模型错误。
- 若 Provider 的 `rowCount` 与 rows 永不分叉，记录该事实，并为 Provider 增加一个可验证的截断/分页事实来源；不得把 Provider 的恒定 `truncated` 自报字段当成已验证证据。
- 按 evaluation experiment-audit-log 模板保存 Setup、Data、Verdict、fidelity caveat 与本票指针。

## Success criteria

- 至少一个真实 Provider 大结果集 run 可复现，并保留原始输出与版本/配置身份。
- `providerTruncated` 与 `storageTruncated` 的语义分别得到可执行测试和真实运行证据。
- 任何无法从 sealed artifact 重评分的 case 都显式为不可测，不进入模型错误分母。
- [T1](T1-exec-grader-impl.md) 与 [map](../map.md) 的残留说明链接到本票；R25 在本票完成前保持 blocked。

## Out of scope

- 改 comparator 默认值或容差（[R23](R23-comparator-policy-mutation-baseline.md)）。
- 重建 legacy expected values（[G1b](G1b-ground-truth-lifecycle.md) / [T14](T14-data-analysis-extension-pack-migration.md)）。
- 最终 package cutover（[T12](T12-eval-package-consolidation.md)）。
