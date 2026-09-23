# 原型 — G15 当前 Task DAG 客户端位置

[English](README.md) | 中文

> [G15 当前任务编排客户端位置](../tickets/G15-current-client-placement.md)的一次性交互原型。
>
> 问题：当前 DSH 组合能否在不新增布局系统的情况下，同时提供常驻状态、常规检查空间和大图检查？

此原型应用了 [G15 现有 Task DAG UI 调研](../research/G15-existing-task-dag-ui-prior-art.md)的结论。它只验证一套架构，因为当前公开 DSH 界面已使其成为唯一未被其他方案支配的位置选择：

- `conversation.input.dock`——输入框上方的当前状态摘要；
- `sidebar.right.pane.tab`——每个 Session 一个稳定的 Task DAG 页签；
- 右侧栏全屏——放大同一个页签进行检查。

图主体特意使用与渲染器无关的 HTML 和 SVG。[R5 G6 渲染器适配器稳定性](../tickets/R5-g6-renderer-adapter-stability.md)负责决定渲染器。

## 运行

```sh
node wayfinder/task-orchestration-dag/prototype-g15-current-client/server.mjs
# http://localhost:4315/
```

页面无网络依赖，也不需要构建步骤。

## 场景与控制

- **GMV 下跌归因**展示问数 Run：它包含已验证输入、一个重试的 Attempt、可执行工作、受阻工作、证据和当前停止记录。
- **每日宽表构建**展示数据工程 Run：它因上游凭据不可用而停在 Hold。
- 点击输入框摘要，打开或定位 Task DAG 页签。
- 点击 Task，检查当前 Attempts、主 Binding、Outputs、Evidence、验证和 Holds，而不把这些记录画成与 Task 并列的节点。
- 使用右侧栏全屏控件打开大图检查。原型也接受 `Escape` 以评估该交互；生产键盘行为仍由右侧栏子系统统一拥有。
- 切换 Sessions，验证图数据和界面选择不会跨 Session 泄漏。
- **模拟 Client 重载**会丢弃界面状态、将 Task DAG Remote 显示为不可用，然后重新加载权威快照。恢复的领域状态保持不变，右侧栏返回折叠状态。
- **窄屏模拟**展示常规右栏无法保留中心区域最小宽度时，右侧栏自动使用全屏。
- **推进 watch**应用一次当前状态更新，展示摘要和已打开页签消费同一个受监视值。

## 范围

原型覆盖当前 Tasks、Attempts、Host Bindings、Outputs、Evidence、验证、Holds、可移植预算和最新 RunStopRecord。它不验证历史导航、trace explorer、分栏、浮动页签、Task 编辑、高级图简化或动画语义。

## 截图

- [桌面对话与常规右侧栏页签](shots/desktop.png)
- [右侧栏全屏检查](shots/fullscreen.png)
- [窄屏数据工程 Hold 检查](shots/narrow-hold.png)

## 验证

已于 2026-09-16 使用 1440×900 的 Chromium 验证：

- 紧凑摘要会打开已有 Task DAG 页签身份；
- 全屏会放大同一个页签，原型中的 `Escape` 交互会返回停靠视图；
- 从 GMV 分析 Session 切换到每日宽表 Session 时，不复用图选择或面板状态；
- 数据工程视图分别展示 `HostUnavailable Hold`、已取消 Attempt、主 Binding 和缺失 Output；
- 窄屏模式自动使用全屏；
- 模拟 Client 重载会折叠界面状态、报告 Remote 不可用，并在不从 transcript 重建 Task 状态的情况下恢复持久快照；
- 未观察到页面错误或控制台错误。
