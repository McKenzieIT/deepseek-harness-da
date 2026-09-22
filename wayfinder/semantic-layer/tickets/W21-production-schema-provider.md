---
type: task
status: open
assignee: null
blocked_by: []
---

# W21: 生产 SchemaProvider 与生命周期注册

## Question

实现首个生产 SchemaProvider，使 `discover`、`describe`、`sample` 不再只依赖测试 `StandInSchemaProvider`，并以 `ctx.effect()` 管理注册和卸载。

范围：

- MaxCompute provider 的 discover/describe/sample。
- 用 effect-owned registration 替代裸 `setSchemaProvider()` 生命周期。
- 缺 provider 时保持明确失败，不引入隐式 vendor fallback。
- 完成 focused tests、package README 和 bundle/provider 配置。
- 第二个 provider 出现前，不设计多 provider 优先级。
