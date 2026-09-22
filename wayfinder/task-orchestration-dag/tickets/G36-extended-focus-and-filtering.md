# G36 — Extended focus and filtering

**Type**: grilling
**Status**: open
**Blocked by**: [G11 DAG view simplification strategies](G11-dag-view-simplification-strategies.md), [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md)
**Blocks**: —

## Question

真实问数与数据工程使用中，是否需要在单任务完整上下游聚焦之外增加业务类别筛选、active-only 工作集、自动跟随运行任务、多锚点或逐层展开；若需要，哪一种交互有独立收益，其可见集合与其他展示转换按什么顺序组合？

## Trigger

首版评估确认用户反复手动切换同类任务，或单个任务的完整上下游仍不能有效回答其检查问题，并有具体场景、操作次数与遗漏案例。没有可用业务分类元数据时不能猜测类别或要求模型仅为界面分类。新交互必须重新确认用户控制、异常可见性与维护成本；证据本身不启动自动路由。

## Scope boundary

只改变展示范围和展示交互，不改变任务身份、执行权限、依赖、readiness、assurance 或调度优先级。定义多种筛选的组合顺序、精确省略数、范围外异常入口、焦点保持和恢复操作，不静默放宽用户选择。分组及终态聚合归 [G38 Structural aggregation and terminal summaries](G38-structural-aggregation-and-terminal-summaries.md)，性能实现归 [G34 Renderer scaling and replacement threshold](G34-renderer-scaling-and-replacement-threshold.md)，跨刷新检查状态与历史浏览归 [G28 History, trace, and plan inspection](G28-history-trace-and-plan-inspection.md)。首版只交付 G11 已定的手动聚焦。
