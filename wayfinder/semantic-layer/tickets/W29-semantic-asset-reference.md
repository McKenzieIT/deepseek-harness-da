---
type: task
status: open
assignee: null
blocked_by:
  - W28
---

# W29: Semantic asset reference source 与 composer 集成

**Branch**: `codex/semantic-layer-w29-asset-reference`

## Question

如何让 Semantic Graph 的显式“插入聊天引用”操作写入当前 Management Session 的标准 composer，并以稳定资产身份提交给 Agent？

## Scope

- 定义 `Asset Reference Intent` 的最小字段：稳定 asset id、kind 与 label；Graph 和 Node Detail 不拥有 draft 状态。
- 注册 semantic asset reference source，校验引用属于 Management Session 绑定的 Data Scope，并将结构化引用序列化为简洁的模型输入。
- Management View 把显式按钮操作路由到 `ctx.conversation.input.for(binding.ctx)`；在当前光标处插入 reference chip、保留原 draft 并聚焦 composer。
- 节点选择、图谱 focus 和详情打开不得隐式修改 draft；引用不得自动发送。
- 完整 definition 不复制进引用；Agent 按需调用 `get_definition` 读取当前版本。
- Session 未准备好、Data Scope 已删除或 asset 不属于绑定 scope 时禁用操作并给出明确反馈，不建立私有 intent queue。

## Acceptance

- 从真实 Node Detail 按钮到标准 composer 完成引用插入，测试断言 reference occurrence、draft、focus 和提交序列化，而非只断言回调。
- 已有文本、附件和其他 reference 保持原顺序；Undo 和 draft persistence 使用标准 composer 行为。
- 资产引用提交后模型输入包含稳定 identity，不包含整份 definition。
- 不同 Workspace 或 Data Scope 的同名资产不会被静默解析成当前 scope 外的定义。
- keyless Web snapshot 覆盖可见 reference chip 与发送后的 Session 记录；真实浏览器 GIF 由包含该流程的产品实现 PR 提供。

## Out of scope

- 自动发送、自动打开资产详情或把节点选择等同于引用插入。
- 完整 definition 预取、引用 hover preview 和跨 scope asset migration。
