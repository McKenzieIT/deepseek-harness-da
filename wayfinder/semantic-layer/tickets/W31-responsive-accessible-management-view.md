---
type: task
status: open
assignee: null
blocked_by:
  - W29
  - W30
---

# W31: Management View 响应式与无障碍行为

**Branch**: `codex/semantic-layer-w31-management-view-a11y`

## Question

如何让 Semantic Graph 与 Embedded Conversation 在宽屏、窄屏、键盘和 Reduced Motion 环境中保持可用且不丢失 Session 状态？

## Scope

- 可同时满足两个区域最低可用宽度时，使用 graph 主区域与右侧 Embedded Conversation；空间不足时切换为“图谱 / 对话”单区域模式。
- 使用 container-aware layout，不把部署相关阈值藏在业务逻辑的固定常量中。
- 折叠和区域切换只改变可见性，不卸载 Conversation、Graph 或 `SessionReference`，并保持 draft、scroll、streaming 和 pending graph updates。
- Asset Reference 插入后展示对话区域并聚焦 composer；返回、区域切换、Node Detail 和 close 控件具有明确键盘顺序与 accessible name。
- Graph Narration Gate 释放时通过状态区域播报新增、更新或删除数量。
- `prefers-reduced-motion` 下立即呈现最终 graph state，不播放 fade、pulse 或 blink。
- 更新 locale-owned copy、README、focused component tests 与真实浏览器响应式验证。

## Acceptance

- 宽屏与窄屏浏览器测试覆盖区域切换、Conversation 保持挂载、draft/scroll 保留和 graph resize。
- 键盘可以进入和离开 graph、Node Detail、对话与返回控件，引用插入后焦点落到 composer。
- screen reader status 对一次 graph batch 只播报一次可理解摘要。
- Reduced Motion 测试确认最终数据更新且 animation primitives 未运行。
- 产品可见变化更新 keyless Web snapshot，并录制宽屏与窄屏真实流程 GIF 或同一 GIF 中的两种 viewport 证据。

## Out of scope

- G6 内所有节点和边的完整键盘遍历；在基础导航完成后按 G6 能力另开票。
- Graph layout 性能、虚拟化和大型图渐进加载。
- URL deep link、command palette 和全局快捷键。
