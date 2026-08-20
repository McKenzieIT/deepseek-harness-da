# P2c · DashScope (AGA) queue keep-alive + first-byte window 实证

> 研究问题：`streamIdleTimeoutMs` 默认 300s（5min，`packages/llm/llm-dashscope/src/adapter.ts` `DEFAULT_STREAM_IDLE_TIMEOUT_MS`）。AGA 网关限流是**排队等待、不返 429**（调用文档 §8「高负载时排队延迟可达数十秒」）。流式期间每 SSE 事件带 `:HTTP_STATUS/200` comment（`sse.ts` `onComment`→`adapter.ts` `watchdog.pulse()` 保活，P2 §1.3 已证）。但**首字节前**（排队 hold 期）是否发 keep-alive comment 保活 watchdog 未刻画——若网关 hold >300s 且不发任何字节，watchdog 触发 `LLM_STREAM_IDLE_TIMEOUT`→`TIMEOUT`。本笔记用 light live-probe 实证 hold 时长 + keep-alive 行为，并结合 `idleWatchdog` 语义释读风险窗口，回答 300s 默认是否安全。

## TL;DR

**300s 默认安全，无需 fix。** light live-probe（4 并发流式 generation，预发 AGA，2026-08-20，key 经 credentials seam 文件 `~/.dsh/.credentials.yaml`、不入库/不进 env/不打印）+ `idleWatchdog` 语义释读共兑现：

- **hold（首字节前、fetch-pending 期）= 368–498ms**（s-rt 133–262ms），4 并发**无排队**——比 300s 低约 600×。调用文档 §8「高负载时排队可达数十秒」(<100s) 仍 << 300s（约 3× 余量）；本探针的 light-load 实测更低（亚秒级）。
- **keep-alive comment 机制如期工作**：fetch 一 resolve，**首个到达字节即 `:HTTP_STATUS/200` comment**（每请求 1 个 pre-data comment，与首个 `data:` 行同帧/紧前到达）→ `onComment`→`watchdog.pulse()` 立即重 armed 300s 计时器。fetch-resolve→first-data 的「受保护窗口」≈0ms 且被该 comment 覆盖。
- **流式期间 comment 频率**：每流 8 comment（1 comment/event + 1 data/event，同 P2 §1.3），gap 0.1–45ms（max 45ms）→ watchdog 每 event pulse 一次，max gap 45ms vs 300s（约 6600× 余量）。
- **`idleWatchdog` 语义钉死风险窗口**：timer 在 `watchdog.next(iterator)` 起 armed，首个 `next()` 跨 **`fetch()`（hold）+ parseSse 至首个 `yield`** 全程；`pulse()` **仅当 `next()` outstanding 时** rearm。→ `onComment→pulse` 能保活「body 已开始流（含 pre-first-data comment）」阶段，但**保活不了 `fetch()` pending（hold、零字节）阶段**——该阶段 `outstanding=true`、timer armed、无字节→`onComment` 不触发→无 pulse。**唯一风险窗口 = fetch-pending hold > 300s 且零字节**；探针实证 <0.5s，文档上界「数十秒」<< 300s → 风险不兑现。

**决策 (c)**：document 现状 + `streamIdleTimeoutMs` 默认 300s 安全、**无需 fix**（additive-only，不碰 `adapter.ts`——P2b 独占）。keep-alive 机制（`:HTTP_STATUS/*` comment→`onComment`→`pulse`）如设计工作；300s 对「数十秒」排队上界有约 3× 余量、对 light-load 实测有约 600× 余量。**不毕业生产 ticket**（无 fix 推荐）。仅留一条非阻断 ops 观察：若未来 AGA 高负载排队实测逼近 300s（目前文档/实测均远低），再考虑调大默认或加应用层 `streamIdleTimeoutMs` override——非现在。

## 1. 探针实证（primary source）

4 并发流式 generation 请求，预发 AGA 网关 `https://pre-aga-ai-gateway.alibaba-inc.com/api/v1/services/aigc/text-generation/generation`，2026-08-20，key 经 credentials seam 文件 `~/.dsh/.credentials.yaml`（len 不披露、不入 env/不打印/不入库）。探针脚本 `/tmp/probe-p2c.mjs`（throwaway，mirror P2/T2 探针法：从 seam 文件读 key、绝不打印、redact-guard 自检输出不含 key、每请求 120s 超时 ceiling）。**light load only——4 并发，非高并发压测**（ticket 禁止 high-concurrency load-test AGA）。原始输出见会话探针结果。

模型 `qwen-flash`（便宜快，P2 §1.3 流式 baseline），prompt「Count from 1 to 8, one number per line, slowly.」（同 P2 产出多 event 流以测 comment 频率）。流式头 `X-DashScope-SSE: enable` + `parameters.incremental_output: true`（native 协议，同 P2 §1.3 / `serialize.ts`）。

### 1.1 全 4 请求 200，无 429、无排队

| id | status | s-rt (ms) | s-brt (ms) | TTFB/fetch-pending (ms) | first_byte (ms) | first_data (ms) | end (ms) |
|----|--------|-----------|-----------|--------------------------|------------------|------------------|----------|
| 0  | 200    | 133       | 131       | 368.3                    | 369.2            | 369.3            | 503.2    |
| 1  | 200    | 219       | 218       | 436.1                    | 436.3            | 436.3            | 548.4    |
| 2  | 200    | 213       | 211       | 447.5                    | 447.6            | 447.6            | 529.1    |
| 3  | 200    | 262       | 260       | 497.6                    | 497.7            | 497.7            | 606.9    |

- wall（4 并发 wall-clock）= 620.8ms。
- **无 429**（与 P2 §5.5「排队不返 429」一致）；**无排队**——4 并发 qwen-flash 全立即服务，s-rt 133–262ms（比 P2 单请求 5–5900ms 更低，因 qwen-flash 非 thinking 模型）。
- → hold（fetch-pending）= 368–498ms，**比 300s 低约 600×**。light-load 下 AGA 不排队。

### 1.2 首个到达字节即 `:HTTP_STATUS/200` keep-alive comment

每请求 `pre_data_comment_count = 1`，且该 comment 就是首字节：

- id 0：pre_data_comment `:HTTP_STATUS/200` @ 369.3ms（first_data @ 369.3ms）。
- id 1：`:HTTP_STATUS/200` @ 436.3ms（first_data @ 436.3ms）。
- id 2：`:HTTP_STATUS/200` @ 447.6ms（first_data @ 447.6ms）。
- id 3：`:HTTP_STATUS/200` @ 497.7ms（first_data @ 497.7ms）。

→ **fetch 一 resolve，`response.body` 首块即含 `:HTTP_STATUS/200` comment + 首 `data:` 行**（同帧/紧前）。`EventSourceParserStream({onComment})`→`sse.ts` `onComment`→`adapter.ts` `() => { watchdog.pulse() }` 立即 pulse → 300s 计时器 rearm。**fetch-resolve→first-data 的「受保护窗口」≈0ms 且被该 comment 覆盖**（即使该窗口变长，comment 仍会先到并 pulse）。

### 1.3 流式期间 comment 频率：每 event 1 comment，gap 0.1–45ms

每请求 `comment_count = 8`、`data_event_count = 8`（1 comment + 1 data per SSE event，与 P2 §1.3 帧 `id:/event:result/:HTTP_STATUS/200/data:` 完全一致）。comment 到达时间样本 + 相邻 gap：

| id | comment_ts_sample (ms) | gap range (ms) | max gap (ms) |
|----|------------------------|-----------------|--------------|
| 0  | 369.3, 370.2, 370.3, 415.3, 440.9, 469.7, 498.8, 502.5 | 0.1–45 | 45 |
| 1  | 436.3, 441.5, 448.3, 455.6, 483.8, 513.1, 545.8, 545.8 | 0–32.7 | 32.7 |
| 2  | 447.6, 451.6, 457, 462.6, 484.1, 505.4, 528.2, 528.2 | 0–22.8 | 22.8 |
| 3  | 497.7, 500.5, 508.1, 515.2, 544.8, 574.3, 606.2, 606.3 | 0.1–31.9 | 31.9 |

→ 流式期间 watchdog 每 event pulse 一次，**max gap 45ms vs 300s（约 6600× 余量）**。一旦流开始，300s idle timeout 永不逼近。

### 1.4 hold 期（fetch-pending）零字节——keep-alive comment 保活不了该窗口（机制释读）

关键释读（非探针新数据，而是 `idleWatchdog` 语义对探针窗口的标注）：

- `fetch()` 在响应**状态行+头**到达时 resolve；SSE comment 是 response **body** 内的帧，**仅在 fetch resolve 后、body 开始流时**才可读。
- 故「hold 期是否发 keep-alive comment」在标准 HTTP/SSE fetch 模型下**不可观测且不可保活**：若 AGA 在发 200 头之前 hold（连接已建、状态行未发），client 读不到任何字节→`onComment` 不触发→`watchdog.pulse()` 不调→300s 计时器在 `fetch` pending 期间持续 armed。**该 fetch-pending 阶段是唯一无 keep-alive 保护的风险窗口**（见 §2 语义钉死）。
- 本探针的 fetch-pending = 368–498ms（§1.1），远 << 300s；即便 AGA 在高负载 hold「数十秒」（调用文档 §8 上界），仍 < 100s << 300s。
- 探针**未**（也**禁止**）触发高负载排队 regime——ticket 明令「禁止高并发 load-test」。故「数十秒」文档上界作为风险 ceiling，由 light-load 实测（亚秒）+ 文档（<100s）双线印证 << 300s。

## 2. `idleWatchdog` 语义释读（风险窗口钉死）

`packages/util/timeout/src/index.ts` `idleWatchdog`（adapter 经 `@deepseek-ai/dsh-timeout` 引入）：

- **timer 在 `watchdog.next(iterator)` 起 armed**（`arm()` 在 `outstanding=true` 后立即调），首个 `next()` 跨 `iterator.next()` 全程。adapter `stream()` 的首个 `watchdog.next(iterator)` 对应 `request()` async generator 的首个 `yield`——即 **`fetch()`（含 hold）+ `parseSse` body 读至 `translate` 首 `yield`** 全程 timer armed、`outstanding=true`。
- **`pulse()` 仅当 `next()` outstanding 时 rearm**：`if (disposed || !outstanding) return; arm()`。`onComment→pulse` 在 body 流期间（含 pre-first-data comment，§1.2 实证）有效。
- → **保活覆盖**：body 流阶段（fetch resolve 后，含 pre-first-data comment 至 first yield）——comment 到达即 pulse。
- → **保活不覆盖**：`fetch()` pending 阶段（hold、零字节、response 未开始）——`outstanding=true`、timer armed、无字节→`onComment` 不触发→无 pulse。**此即风险窗口**：若 hold > 300s 且零字节→`TimeoutReason('LLM_STREAM_IDLE_TIMEOUT', 300_000)`→adapter `catch` 映射 `LlmError(... 'TIMEOUT')`。

**结合 §1 实证**：风险窗口（fetch-pending hold）实测 368–498ms（<< 300s，约 600× 余量），文档上界「数十秒」(<100s，约 3× 余量)。→ **300s 默认安全，无需调大**。

> 注：P2b 独占 `adapter.ts`；本笔记**仅 document+释读**，**不 implement**任何 `streamIdleTimeoutMs` 默认变更（即使要调也是毕业到生产 ticket / fold 入 P2b，非此处）。结论是无 fix，故无毕业 ticket。

## 3. 推荐方案（决策 c：document 现状，无需 fix）

- **`streamIdleTimeoutMs` 默认 300s 保持不变**。light-load 实测 hold 亚秒级、文档高负载上界「数十秒」<100s，皆 << 300s（3×–600× 余量）。
- **keep-alive 机制如设计工作**：fetch resolve 即首字节 `:HTTP_STATUS/200` comment→pulse；流式期间每 event 1 comment（max gap 45ms）→pulse。300s idle timeout 在 body 流阶段永不逼近。
- **不毕业生产 ticket**（无 fix）。仅留非阻断 ops 观察：若未来 AGA 高负载排队实测逼近 300s（目前文档/实测均远低），再考虑调大默认或加 per-call `streamIdleTimeoutMs` override——非 P2c 范畴、非现在。
- **不碰 `adapter.ts`**（P2b 独占；additive-only）。本笔记产出仅 `research/p2c-*.md` + `tickets/phase-misc/P2c-*.md` 两文件。

## 4. 剩余决策（待用户确认）

1. **是否需更高 load 的 hold 实测**：ticket 明令禁止 high-concurrency load-test AGA，故「数十秒」排队 regime 无法安全复现。若 ops 侧未来有受控灰度压测窗口，可补一档（受控并发、带熔断）以逼近文档上界——非 P2c 范畴，留 ops 决定。
2. **`streamIdleTimeoutMs` 是否暴露 per-call override**：目前 `DashScopeConnectionOptions.streamIdleTimeoutMs` 是 connection 级（plugin `resolveAdapterOptions` 定）。若 ops 想为重负载场景调大（如 600s）而不改默认，可由 plugin resolution 注入——非 adapter 改动，非 P2c 范畴。

## 来源（Sources）

- **primary**：会话内 live 探针 `/tmp/probe-p2c.mjs` 输出（2026-08-20，预发 AGA 网关，4 并发流式 generation 请求；key 经 `~/.dsh/.credentials.yaml` credentials seam 文件、不入库/不进 env/不打印、redact-guard 自检通过）。〔本文 §1 引用其原始输出〕
- `packages/util/timeout/src/index.ts` `idleWatchdog`/`IdleWatchdog`/`TimeoutReason`/`timeoutOf` 实现（timer armed 时机、`pulse()` 仅 outstanding 时 rearm、`next()` 跨 iterator 全程——§2 释读依据）+ `packages/util/timeout/tests/timeout.spec.ts`（`idleWatchdog` 行为 spec：outstanding arm、pulse rearm、dispose clear）。
- `packages/llm/llm-dashscope/src/adapter.ts`（`DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000`；`stream()` 用 `idleWatchdog(upstream, connection.streamIdleTimeoutMs, STREAM_IDLE_TIMEOUT_CODE)`；`request()` `onComment: () => { watchdog.pulse() }`；`watchdog.next(iterator)` 包装 fetch+parse 首个 yield；catch 映射 `TIMEOUT`）。
- `packages/llm/llm-dashscope/src/sse.ts`（`parseSse` 用 `EventSourceParserStream({onComment})`；comment 不入 yielded payload、仅经 `onComment` 回调）。
- `wayfinder/data-agent/research/p2-dashscope-wire.md` §1.3（流式 `:HTTP_STATUS/200` comment→onComment→watchdog.pulse 保活 + §5.5 排队不返 429 + s-rt 5–5900ms）+ §3（adapter/sse/translate 推荐原状）。
- `wayfinder/data-agent/research/t2-aga-embeddings-probe.md`（探针法模板：seam 文件读 key、throwaway `/tmp/probe-*.mjs`、redact-guard、控制组+变体组）。
- `wayfinder/data-agent/tickets/phase-misc/P2c-dashscope-queue-keepalive.md`（ticket 全文 + 调用文档 §8「排队可达数十秒」引用）。
