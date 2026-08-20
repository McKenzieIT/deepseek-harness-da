# P2c — llm-dashscope: confirm queueing keep-alive + first-byte window

**Type**: task
**Phase**: misc（low）
**Status**: Resolved (2026-08-20)
**Assignee**: wayfinder-subagent 2026-08-20
**Blocked by**: (none — P2 resolved)

**Question**: `streamIdleTimeoutMs` 默认 300s（5min，`packages/llm/llm-dashscope/src/adapter.ts`）。AGA 网关限流是**排队等待、不返 429**（调用文档 §8「高负载时排队延迟可达数十秒」）。probe 见流式期间每事件带 `:HTTP_STATUS/200` comment（`onComment`→`watchdog.pulse()` 保活）。但**首字节前**（排队 hold 期）是否发 keep-alive comment 未刻画——若网关 hold >300s 不发任何字节，watchdog 触发 `TIMEOUT`。确认窗口 + 是否需调大默认。

**Design**:
- **确认（load-test）**：高并发打预发 AGA，观察 (a) 排队 hold 时长（是否 >300s）、(b) hold 期间是否发 keep-alive comment（`:HTTP_STATUS/*` 等）保活 watchdog。key 经 env。
- **若 hold 可超 300s 且无 keep-alive**：调大 `streamIdleTimeoutMs` 默认（如 600s）OR 确认网关 hold 期发 keep-alive。
- 调用文档 §8「可达数十秒」暗示 hold 远 <300s（低风险），但首字节前 keep-alive 行为待证。

来源：code review R5；`research/p2-dashscope-wire.md` §5.5；P2 ticket Finding。

## Finding

**300s 默认安全，无需 fix。** light live-probe（4 并发流式 generation，预发 AGA，2026-08-20，key 经 credentials seam `~/.dsh/.credentials.yaml`、不入库/不进 env/不打印）+ `idleWatchdog` 语义释读共兑现：

- **hold（fetch-pending、首字节前）= 368–498ms**（s-rt 133–262ms），4 并发**无排队、无 429**——比 300s 低约 600×。调用文档 §8「高负载排队可达数十秒」(<100s) 仍 << 300s（约 3× 余量）；light-load 实测更低（亚秒）。
- **keep-alive comment 机制如期工作**：fetch 一 resolve，**首字节即 `:HTTP_STATUS/200` comment**（每请求 1 个 pre-data comment，与首 `data:` 同帧/紧前）→ `sse.ts` `onComment`→`adapter.ts` `watchdog.pulse()` 立即 rearm 300s。fetch-resolve→first-data「受保护窗口」≈0ms 且被覆盖。
- **流式期间 comment 频率**：每流 8 comment（1/event，max gap 45ms）→ watchdog 每 event pulse，max gap 45ms vs 300s（约 6600× 余量）。
- **`idleWatchdog` 语义钉死风险窗口**：timer 在 `watchdog.next()` 起 armed，首个 `next()` 跨 `fetch()`（hold）+ parseSse 至首 `yield` 全程；`pulse()` 仅 `next()` outstanding 时 rearm。→ `onComment→pulse` 保活「body 流（含 pre-first-data comment）」阶段，**保活不了 `fetch()` pending（hold、零字节）阶段**——该阶段 `outstanding=true`、timer armed、无字节→`onComment` 不触发→无 pulse。**唯一风险窗口 = fetch-pending hold > 300s 且零字节**；探针 <0.5s、文档「数十秒」<100s，皆 << 300s → 风险不兑现。

决策 (c)：document 现状，300s 默认安全、**无需 fix**（additive-only，不碰 `adapter.ts`——P2b 独占）。不毕业生产 ticket。详见 `research/p2c-dashscope-queue-keepalive.md`。

## Assets

- `wayfinder/data-agent/research/p2c-dashscope-queue-keepalive.md`（cited note：探针实证表 + `idleWatchdog` 语义释读 + 推荐无 fix + 来源）。
- `/tmp/probe-p2c.mjs`（throwaway 探针脚本：seam 文件读 key、4 并发流式、fetch-pending/first-byte/comment 频率度量、redact-guard 自检；不入库/不入 git）。
- `packages/util/timeout/src/index.ts`（`idleWatchdog` 实现，§2 释读依据，只读）+ `packages/llm/llm-dashscope/src/{adapter,sse}.ts`（`watchdog.pulse`/`onComment` wiring + `DEFAULT_STREAM_IDLE_TIMEOUT_MS=300_000`，只读，未改——P2b 独占）。

## Unblocks

- **P2c 自身 resolved**：300s `streamIdleTimeoutMs` 默认经 live-probe + watchdog 语义双线实证安全，无 fix。keep-alive 机制（`:HTTP_STATUS/*` comment→`onComment`→`pulse`）如设计工作。
- **非阻断 ops 观察**（不入新 ticket）：若未来 AGA 高负载排队实测逼近 300s（目前文档/实测均远低），再考虑调大默认或 plugin 注入 per-call `streamIdleTimeoutMs` override——非现在、非 P2c 范畴。
- 无下游 ticket 阻塞解除（P2c 是 leaf task）。
