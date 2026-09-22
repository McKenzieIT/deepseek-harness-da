---
type: task
status: open
assignee: null
blocked_by:
  - W28
---

# W30: Graph Narration Gate 的真实 Session adapter

**Branch**: `codex/semantic-layer-w30-narration-gate`

## Question

如何让 Graph Narration Gate 直接消费 Management Session 的真实 event window，并在 Agent 说明后释放本轮成功语义修改对应的图谱变化？

## Scope

- 删除自定义 push-style `SessionEventSource`，以纯 adapter 消费上游 `SessionBinding.eventSource` 的 `SessionEventWindow`、delta 与 durable/transient entry。
- 只接受成功且携带有效 graph delta 的 `tool/result`；tool failure 不产生 graph update。
- 按 turn 聚合 pending updates；后续可见 durable `assistant/message` 结算后批量释放并播放动画。
- tool 已成功但 assistant 失败、取消或无可见说明时，在 durable `turn/end` 重新读取最新 graph snapshot，无成功动画地同步结果，并展示降级说明。
- 建立 live watermark：打开、恢复和 reconnect 时历史用于恢复 Conversation 和最新 graph baseline，不重放已经结束 turn 的动画。
- 删除固定 30 秒语义释放；时间流逝不替代 durable lifecycle event。卡死诊断如有真实需求，另开可配置 follow-up。
- Graph data refresh、released update 与 G6 animation 的 ownership 保持单一，避免 Conversation 和 graph 各自订阅另一条 event bus。

## Acceptance

- 真实 Session Controller event window 驱动 `tool/result → assistant/message → graph animation`，不使用自定义 fake push source。
- 同一 turn 多个成功工具结果只在对应说明后批量释放。
- tool failure、assistant failure、abort、completed-without-visible-message、disconnect/reconnect 和 Session resume 均有行为测试。
- resume 先读取最新 graph snapshot，旧 `tool/result` 不触发动画。
- 真实装配测试观察 G6 数据变化或 animation invocation；仅测试 gate 内部数组不足以验收。
- keyless recorded-session 场景覆盖事件顺序；真实 management Agent GIF 展示说明完成后关系边出现。

## Out of scope

- 修改 Session Controller event wire、增加新的全局 event bus 或把动画事件写入 Session log。
- G8 的关系审计语义和 W24 的 Dashboard evidence replay。
