# G38 — Structural aggregation and terminal summaries

**Type**: grilling
**Status**: open
**Blocked by**: [G11 DAG view simplification strategies](G11-dag-view-simplification-strategies.md), [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md)
**Blocks**: —

## Question

在默认全图与手动任务聚焦之外，真实使用证据是否足以支持按已有任务分组折叠、结构聚合或已完成／已被替代分支摘要；若支持，哪一个最小切片能减少阅读负担，同时保留跨组依赖、逐项状态、异常入口、替代项访问和可核对的省略数？

## Trigger

首版评估记录用户因重复检查稳定任务组、已结束分支或大量替代记录而难以理解当前计划；记录任务规模、场景、重复操作与实际阅读困难。只有性能变慢而没有阅读问题时，由 [G34 Renderer scaling and replacement threshold](G34-renderer-scaling-and-replacement-threshold.md) 先处理。证据触发新的决策，不自动启用折叠。

## Scope boundary

只决定展示聚合资格、分组或摘要标识、展开恢复、跨组关系、混合 assurance／Hold 的呈现以及与手动聚焦的组合顺序。聚合不是新 Task，不参与调度，不把包含关系变成依赖，不把部分成功表示成整组已验证。保持 [G4 Animation and edge design](G4-animation-and-edge-design.md) 的替代项访问和状态区分。完整历史浏览归 [G28 History, trace, and plan inspection](G28-history-trace-and-plan-inspection.md)，首版手动聚焦不依赖本票解决。
