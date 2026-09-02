# W13 — ContextLayer 动画层不重绘（update*Data ≠ repaint）

**Type**: task（直接修复）
**Status**: open
**Blocked by**: —
**发现来源**: task-orchestration-dag G2 原型（2026-09-02，像素哈希实测）;与
[W12](W12-contextlayer-node-click-dead.md) 同族——G6 使用层 API 误用,组件测试未覆盖
真实渲染路径,静默失效。

## Question（事实确认 + 修复）

`packages/client/ui-context-layer/src/client/graph-animations.ts` 共 **11 处**
`graph.updateNodeData(...)` / `graph.updateEdgeData(...)`(含 rAF 循环内的
pulseNode/blinkNodes、边 fade-in、narration-gate 释放等),**全文件零处 `graph.draw()`**。

**实测（G6 5.1.1,真实浏览器,像素哈希）**:对运行中边 rAF 循环提交
`updateEdgeData([{id, style:{lineDashOffset}}])` 600ms,画布像素哈希**完全不变**——
`update*Data` 只改数据,**不触发重绘**。即:图谱的节点脉冲、闪烁、边渐入等动画
视觉上从未生效(与 W12 的点击失效同模式:数据在动、画面没动)。

## Fix（原型已验证的两条路线）

1. **离散状态切换**(脉冲/恢复/highlight):每次 `update*Data` 后补 `graph.draw()`
   强制重绘(12-30 节点量级无性能问题)。
2. **连续样式动画**(流动/呼吸):走 @antv/g **Web Animations API**——
   `graph.getCanvas().document` 场景树按 item id 摸到显示对象(显示对象 `.id` ===
   item id),`el.animate([{lineDashOffset:0},{lineDashOffset:-周期整数倍}],`
   `{duration, iterations: Infinity})` 由渲染引擎动画循环驱动,实测像素流动。
   注意速度按 `graph.getZoom()` 换算保持屏幕观感恒定;zoom/pan 后重装
   (防抖监听 `afterTransform`);元素被重建(render/draw)后动画需重装。

参考实现(throwaway 原型,可照抄结构):
`wayfinder/task-orchestration-dag/prototype/dag-graph.js` 的
`findEl/installAnimations/hoverFocus` 三段。

## Verdict 计划

修复 + 真实浏览器像素级验证(修复前后哈希对比)后关闭;顺带确认
`ContextLayerGraph.applyLOD`(zoom 时 updateNodeData 换 LOD)是否同样不生效——
若是,LOD 切换也一并修。
