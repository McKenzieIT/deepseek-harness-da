---
type: task
status: open
assignee: null
blocked_by:
  - W26
  - W27
---

# W28: Semantic Layer Management View 合并、导航与 Conversation 绑定

**Branch**: `codex/semantic-layer-w28-management-view`

## Question

如何把 fork-owned `ui-context-layer` 合并进 `ui-semantic-layer`，并通过正式 Global Main Panel 装配正确 Management Context 的 Semantic Graph 与标准 Conversation？

## Scope

- 删除独立 `@deepseek-ai/dsh-client-ui-context-layer` package，把仍有当前 owner 的 graph、node detail、search、filter、layout 和 animation 模块迁入 `ui-semantic-layer` 的内部目录。
- `ui-semantic-layer` 注册匹配的 `main` keyed panel 与 `sidebar.panellist` 一级入口；删除 `shell.overlay` 页面入口和 `ContextLayerService`。
- 打开 Management View 时读取当前 Workspace 与明确 Data Scope，调用 W26 的 `resolveOrCreate()`，retain 返回的普通 Session，并由 Management View 持有、释放 `SessionReference`。
- 使用现有 `SessionProvider` 与 `conversation.content` embedded variant 渲染固定 Chat view，复用标准 history、streaming、tool presenters、errors、retry、approval、attachments、stop、queue 和 steering。
- 返回操作调用 `ctx.layout.selectPanel(null)`，恢复原普通 Conversation，不修改全局当前 Session；关闭 Management View 不取消正在运行的管理 Agent。
- Asset Detail 的“在知识图谱中查看”进入同一 panel 并携带 focus node；不再依赖先打开 Schema Explorer 的偶然路径。
- 页面分别呈现 graph loading/error 与 Management Session resolving/reconnecting/unavailable/deleted 状态；preset 创建失败不得回退到默认 Agent。
- 删除 `ManagementChatPanel`、私有 `ChatMessage`、messages/send/streaming props 和重复聊天状态。
- 合并 locale、README、package metadata、tsconfig、bundle rows、测试与生成目录；只移除 fork-owned 注册，不改变上游 package 行为。

## Acceptance

- 从侧栏可直接打开 Management View，不需要先进入 Schema Explorer。
- 同一 Workspace 与 Data Scope 重开时恢复同一 Management Session；切换 Workspace 或 Data Scope 时绑定对应记录。
- 图谱内显示真实 Session 历史，可发送消息，并显示 W9/W10 的 tool cards。
- 退出后原普通 Conversation 的 Session、draft、scroll 和运行状态不变。
- Graph 可用而管理 Agent 不可用时保持只读浏览；断线恢复同一 Session，不创建替代记录。
- shipped Loader/Web composition 测试经过 data-agent patch、实际 panel/slot registration、Management Context Remote、Session Controller 和 Conversation；不得通过直接传 `messages` 或 fake `SessionEventSource` 获得绿灯。
- 产品可见变化更新 keyless Web recorded-session evidence，并从 PR 的真实 server 与真实 management Agent 流录制 GIF。

## Out of scope

- Semantic Dashboard 的 evidence-query run-history replay；该证据仍由 [W24: Semantic Dashboard recorded-session Web snapshot harness](W24-semantic-dashboard-web-snapshot-harness.md) 负责。
- URL deep link、command palette 和快捷键入口。
- 完整图节点键盘遍历。
