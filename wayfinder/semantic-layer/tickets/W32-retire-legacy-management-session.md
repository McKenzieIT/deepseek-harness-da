---
type: task
status: open
assignee: null
blocked_by:
  - W22
  - W26
---

# W32: Patrol 迁移后退役旧 management-session

**Branch**: `codex/semantic-layer-w32-retire-management-session`

## Question

在新的 Management Context capability 已投入使用且 W22 不再调用 `getActive()` 后，如何完整删除旧 `management-session` package、事件和重复生命周期语义？

## Scope

- 确认 Management View、patrol-mode 和其他生产消费者均不再依赖 `ctx.managementSession`、`getActive()`、`listActive()`、`isManagementSession()` 或旧 create/destroy API。
- 删除 fork-owned `packages/data/management-session` package 及其 tests、README、workspace/build/config/generated registrations。
- 删除 `management-session/created` 与 `management-session/destroyed` 事件声明和生成目录条目。
- patrol-mode 使用 W22 确立的显式 Management Context 或 Session target，不再读取进程中最近创建的管理会话。
- 清理旧 parent-session summary 和 descriptor 类型；Management Session 的 Workspace、Data Scope、preset 与历史由新的 durable records 表达。
- 保留上游 Session Controller、Conversation 与 Chat 源码不变。

## Acceptance

- 全仓无旧 package import、`ctx.managementSession` 使用或旧事件消费者。
- data-agent shipped composition 与 patrol 真实装配测试通过，且多 Workspace/Scope 不会选择进程级最近 Session。
- package、config、module graph、API catalog、README 和 generated artifacts 一致。
- 删除前后现有持久 Management Session 仍由 Session Controller 和新的 projections 恢复。

## Out of scope

- 实现 patrol 的真实 edit、audit、eval 与 revert 流程；这些仍由 [W22: Patrol 真实编辑执行与 composition](W22-patrol-real-edit-composition.md) 负责。
- 修改上游 DSH package 行为。
