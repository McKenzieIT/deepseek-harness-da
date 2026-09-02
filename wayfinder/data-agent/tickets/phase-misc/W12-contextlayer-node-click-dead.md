# W12 — ContextLayerGraph 节点点击/双击回调失效（evt.itemId 不存在）

**Type**: task（直接修复）
**Status**: code fixed 2026-09-02（未 commit；组装路径验证仍欠）
**Blocked by**: —
**发现来源**: task-orchestration-dag map 的 G2 原型验证（2026-09-02，headless 浏览器实测）

## Question（事实确认 + 修复）

`packages/client/ui-context-layer/src/client/ContextLayerGraph.tsx:226-235`：

```ts
// Node click handler (G6 v5: node ID is on evt.itemId)
graph.on<IElementEvent & { itemId?: string }>('node:click', (evt) => {
  const itemId = evt.itemId
  if (itemId) onNodeClick?.(itemId)
})
graph.on<IElementEvent & { itemId?: string }>('node:dblclick', (evt) => {
  const itemId = evt.itemId
  if (itemId) onNodeDoubleClick?.(itemId)
})
```

**实测（G6 5.1.1，真实浏览器事件）**：`node:click` 事件对象上 `'itemId' in evt === false`；
节点 id 在 **`evt.target.id`**（点击 `w1` 节点时 `evt.target.id === 'w1'`，`targetType === 'node'`）。
`IElementEvent`（`lib/types/event.d.ts`）也不声明 `itemId`。因此 `if (itemId)` 恒为假，
**`onNodeClick` / `onNodeDoubleClick` 从未被调用**——图上点击节点打开 NodeDetailPanel、
双击 focus 导航的链路在组装 UI 中是死路径（组件测试直接调 handler 或不经过真实 G6 事件，
故 736 tests 未暴露）。

## Fix

`const itemId = evt.target?.id`（两处），保留 `evt.itemId` 作回退亦可。修后需要一条**走真实
组装路径**的验证（W11 的 ContextLayerView 全屏 overlay 中点击节点 → NodeDetailPanel 出现），
jsdom 单测覆盖不了这条链路——这也是本 bug 溜进来的原因。

## Verdict 计划

修复 + 组装路径手动/浏览器验证后关闭；顺手确认 minimap 插件在小画布上遮挡内容的问题
（同组件 `position: 'right-bottom'`，G2 原型中同样复现）是否值得一并调整。

## 进展（2026-09-02，subagent 修复）

- 代码已修：两个 handler 改读 `evt.target?.id`，删除虚构的 `& { itemId?: string }`
  交叉类型（`IElementEvent` 不声明 `itemId`，保留回退会类型报错），更正注释。
  仅改 `ContextLayerGraph.tsx`；未 commit，待本 effort 归入 PR。
- `grep itemId` 包内无其他误用。
- `pnpm run test:gui`：306 files / 4211 passed | 1 skipped 全绿；
  `tsc -b packages/client/ui-context-layer` exit 0。
- **剩余**：组装路径验证（真实浏览器打开图谱 → 点节点 → NodeDetailPanel 出现）+
  随 PR commit。关闭工单前完成。
