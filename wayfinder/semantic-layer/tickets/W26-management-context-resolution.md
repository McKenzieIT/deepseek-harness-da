---
type: task
status: open
assignee: null
blocked_by: []
---

# W26: Management Context 解析与持久 Data Scope 绑定

**Branch**: `codex/semantic-layer-w26-management-context`

## Question

如何以 fork-owned capability 实现 `Management Context = Workspace × Data Scope` 到普通持久 Management Session 的并发安全解析与创建，同时只消费上游 DSH 的公开接口？

## Scope

- 新建 fork-owned `ManagementContextService`，不修改 `packages/api/session-controller`、`packages/core/session`、`packages/client/ui-conversation` 或 `packages/client/ui-chat` 的源码。
- 提供 `resolveOrCreate({ workspaceId, dataScopeId })` 与 `createNew({ workspaceId, dataScopeId })`；默认进入按 Management Context single-flight，并返回 `{ sessionId, created }`。
- 调用上游公开 `ctx.sessionController.create()` 创建普通 Session，并固定 `semantic-layer-management` preset。
- 通过 fork package 的 declaration merging 与 Session Projection 注册持久记录 `data-scope/bound`，向 Client Session list 暴露 `dataScope`；不得从 workspace 名称、路径、Session title 或进程级 active scope 推断。
- 创建前验证 Workspace 与 Data Scope；创建后的 Data Scope 不可原地改变。Scope 后续被删除时保留历史，但新的管理操作失败并报告原 scope 不存在。
- 默认恢复从目标 Workspace 的 Session membership 中选择 preset 与 `dataScope` 均匹配且 `updatedAt` 最新的记录；显式新建始终创建另一条 Session。
- 提供 fork-owned Client Remote 装配，不向上游 `api-remotes` 或 Session Controller 添加 data-agent 专用行为。
- README 与 JSDoc 记录并发、幂等、失败、持久化和不回退语义。

## Acceptance

- 两个并发 `resolveOrCreate()` 请求只产生一条默认 Management Session，并返回同一 `sessionId`。
- `createNew()` 在同一 Management Context 中创建不同 Session，随后默认解析选择最新记录。
- 不同 Workspace、不同 Data Scope 和同 scope 的不同 Workspace 均解析到独立记录。
- Session list projection 可在不打开完整历史的情况下识别 preset 与 Data Scope。
- 不存在的 Workspace、Data Scope、不可用 preset 和 Session 创建失败均明确失败；没有默认 preset 或 active-scope fallback。
- 真实装配测试通过 Workspace Registry、Scope Registry、Session Controller、Agent Presets 和实际 `semantic-layer-management` preset 运行，不以 fake lifecycle service 代替。
- Session event/projection 变化更新所需 TypeScript SDK、Python SDK 与 recorded-session expected outputs。

## Out of scope

- Management View、Conversation 渲染和 Semantic Graph UI。
- 修改 CL31 的 retrieval corpus scope 路由或 Evaluation T13 的 Context Projection。
- 删除旧 `management-session` package；该清理由 [W32: Patrol 迁移后退役旧 management-session](W32-retire-legacy-management-session.md) 负责。
