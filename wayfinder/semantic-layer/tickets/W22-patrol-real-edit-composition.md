---
type: task
status: open
assignee: null
blocked_by: []
---

# W22: Patrol 真实编辑执行与 composition

## Question

使 patrol-mode 的已确认编辑真正写入语义定义，并让事件与计数只记录实际完成的编辑；随后把该能力挂入受支持的 data-agent composition 并完成真实 session 验证。

范围：

- `executeEdit()` 调用拥有写入职责的 service/tool，而不是只发送 `patrol/edit-executed`。
- 失败、拒绝、超时和部分写入不得计入 `editsExecuted`。
- bundle/preset 装配必须显式，缺依赖时失败语义明确。
- 真实 session 验证覆盖 edit → audit delta → eval → retain/revert。
