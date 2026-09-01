# G11 — DAG view simplification strategies

**Type**: task
**Status**: open
**Blocked by**: [G5 dynamic node insertion design](G5-dynamic-node-insertion-design.md), [G6 infra contracts for dynamic workflows](G6-infra-contracts-for-dynamic-workflows.md)
**Blocks**: —

## Context

D4 决议（G5 grilling）确认：数据层永久保留所有节点（选项 A），渲染层通过 `viewFilter(dagModel, viewMode)` 纯函数管道简化视图。V1 只实现 `viewMode='all'`（全显示 + 状态样式区分）。本票追踪后续三个正交的视图简化方向。

三者通过同一管道组合，层之间无依赖——可以单独启用、任意组合：

```
viewFilter(dagModel, config) → G6 Data
  ├─ 1. 结构聚合 (S1) → 合并同构重复节点
  ├─ 2. 状态折叠 (S3) → 已完成子图 → 摘要节点
  └─ 3. 视图过滤 (S2) → All / Active / Focus
```

## Sub-directions

### S1: 结构聚合（Langfuse-style）— 优先级最高

- `parallel()` 产生的同构 workflow-agent 节点聚合为 "N× label" 摘要节点
- 检测条件：同一 workflow-run 下、同一 phase 内、label 模式匹配的 agent 节点
- 用户可点击展开查看个体
- 这是规模上限（D7）的第一道防线
- 参考：Langfuse Agent Graph View (2026年7月 beta) 的 Aggregated 模式

### S2: 活跃视图过滤（C-Active）— 优先级中

- `viewMode='active'`：只显示 pending + in_progress 节点及相关边
- 最简实现：status filter + edge filter
- 多 Agent 场景下"只看活跃任务"是最常用的过滤需求
- 可扩展为 `viewMode='focus'`：只显示与当前活跃 Agent 相关的节点

### S3: 完成子图折叠（B）— 优先级较低

- 当一个节点及其所有后继都 completed → 折叠为摘要节点 "N/N ✓"
- 需要图遍历算法检测"完全完成的子图"
- 3-30 节点规模下收益有限，50+ 节点时变得重要
- 与 G8 (Z enhancement) 的 `classifyEdge` 有协同——已完成路径的视觉处理可复用

## Industry references

- **Langfuse Agent Graph View** (2026-07 beta): 聚合模式 + 顺序模式双视图
- **LangSmith Engine** (2026-08): 执行路径追踪 + 状态转换捕获
- **Microsoft Foundry Observability** (2026-08): OpenTelemetry 驱动的 agent trace 图可视化

## Upstream sync risk

**None** — 完全在 `ui-task-dag` 插件包内部，`viewFilter` 是纯渲染层变换。
