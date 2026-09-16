# T21 — snapshots 与 consumers lane：请求计数与 Web 并发断言不可靠

**Type**: task
**Phase**: post-discovery
**Status**: open
**Assignee**: unclaimed
**Related**: [T11](T11-test-coverage-failing.md)；已合并的 PR #149（title settlement）、#154（子进程预算）、#155（hook 预算）是同族的前序修复
**证据**: `node 24 / snapshots and artifacts` job 104534944193（PR #155 head `7f1365dfb6`）与 job 104631963514（PR #156 head `71bf17d990`）

## Question

三项失败共享一个模式：断言依赖调度产物（请求条数、流式 frame 计数、并发到达顺序），而非语义状态。

### 1. `headless.expected.e2e.ts:564` — pi-ai 请求条数

「sends pi-ai DeepSeek compatibility through the one-shot app」期望 2 个请求，实到 3 个。与 PR #149 修掉的 title-settlement 竞态同族：那次是「等到 1 个、要求 2 个」，改为等待语义状态后又在高负载下得到 3 个。此处仍在断言偶然总数。

### 2. `chat-scroll-contract.e2e.ts:557` — history 与 streaming 并发

「preserves the reader anchor when history and streaming arrive concurrently」报 `expected 124 to be greater than 129`，前置 matcher 已 10 秒超时。用例先记录 `chunksAfterAnchor`，再等待「再到 5 个 chunk」以确保并发窗口成立。replay 脚本总共只有 120 个 text-delta（`textStream(..., 120)`），加上 block-start/end、usage、finish 后 frame 总数有限——**在负载下 124 个 frame 可能已经是全部**，此时无论等多久都不会再有第 6 个 chunk。这不是超时长度问题，是等待条件本身可能不可满足。

修法方向：用显式 stream barrier（`ctx.on('llm/stream', ...)` 门控，`steering.e2e.ts` 的 `releaseReplay` 是现成范式）让并发窗口成为构造出来的确定状态，而不是靠计数推断。

### 3. `present-svg.e2e.ts:113` — 连接告警

`tripwire.warnings` 收到 `[connection] connection lost, retry #1`，期望空数组。**本地复现失败**：`DSH_SNAPSHOT=replay vitest run --config vitest.web.config.ts apps/web/tests/present-svg.e2e.ts` 在本机 2 passed。属并发/teardown 竞态，需先取得可复现负控再动手；`acknowledgeReloadConnectionLoss` 已是同族问题的既有出口，但此用例没有主动 reload，所以不能直接套用。

## Scope

按三项各自的根因分别处理，不合并成一次改动：

1. pi-ai 项：断言语义状态（哪些请求存在、其载荷特征），不断言总数。
2. chat-scroll 项：改用显式 stream barrier 构造并发窗口；先证明现等待条件在 frame 耗尽时不可满足。
3. present-svg 项：先取得可复现负控（并发文件、重复运行），再判定是 teardown 未静默还是共享资源争用。

三项都不接受放宽超时、加 `retry` 或删断言。

验收：`node 24 / snapshots and artifacts` 连续两次真实运行全绿。
