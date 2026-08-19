# P2c — llm-dashscope: confirm queueing keep-alive + first-byte window

**Type**: task
**Phase**: misc（low）
**Status**: Unblocked
**Assignee**: (unclaimed)
**Blocked by**: (none — P2 resolved)

**Question**: `streamIdleTimeoutMs` 默认 300s（5min，`packages/llm/llm-dashscope/src/adapter.ts`）。AGA 网关限流是**排队等待、不返 429**（调用文档 §8「高负载时排队延迟可达数十秒」）。probe 见流式期间每事件带 `:HTTP_STATUS/200` comment（`onComment`→`watchdog.pulse()` 保活）。但**首字节前**（排队 hold 期）是否发 keep-alive comment 未刻画——若网关 hold >300s 不发任何字节，watchdog 触发 `TIMEOUT`。确认窗口 + 是否需调大默认。

**Design**:
- **确认（load-test）**：高并发打预发 AGA，观察 (a) 排队 hold 时长（是否 >300s）、(b) hold 期间是否发 keep-alive comment（`:HTTP_STATUS/*` 等）保活 watchdog。key 经 env。
- **若 hold 可超 300s 且无 keep-alive**：调大 `streamIdleTimeoutMs` 默认（如 600s）OR 确认网关 hold 期发 keep-alive。
- 调用文档 §8「可达数十秒」暗示 hold 远 <300s（低风险），但首字节前 keep-alive 行为待证。

来源：code review R5；`research/p2-dashscope-wire.md` §5.5；P2 ticket Finding。
