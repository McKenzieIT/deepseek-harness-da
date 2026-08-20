# @deepseek-ai/dsh-llm-dashscope

English | [中文](README.zh.md)

DashScope (AGA AI Gateway) native-protocol chat-completions adapter for the DeepSeek Harness LLM seam (`ctx.llm`). Implements the DashScope native wire protocol (NOT OpenAI-compatible) over the Alibaba internal AGA gateway.

## Overview

A Cordis Service adapter that translates the harness `ctx.llm` contract to DashScope native SSE streaming:

- Request body: `{model, input:{messages}, parameters:{result_format:"message", incremental_output:true, max_tokens?, temperature?, tools?}}`
- Streaming: `X-DashScope-SSE:enable` header + SSE `data:` native JSON (cumulative `usage` per event, `finish_reason !== "null"` terminates — no `[DONE]` sentinel)
- Identity: env `DASHSCOPE_API_KEY` / `DASHSCOPE_BASE_URL`, provider name `dashscope`
- Catalog: qwen-flash, qwen-plus, qwen3.7-max, qwen3.6-plus
- Reasoning: no per-request thinking toggle; reasoning via model selection (qwen3.6-plus etc.)

## Verification

```sh
tsc -b packages/llm/llm-dashscope/tsconfig.json   # typecheck
pnpm vitest run packages/llm/llm-dashscope         # 64 unit specs
DSH_KEYCHAIN_LIVE=1 DASHSCOPE_API_KEY=... pnpm vitest run packages/llm/llm-dashscope/tests/adapter.e2e.ts  # key-gated live e2e
```

## Known Limitations and Deferred Work

- **R3 — Multi-turn passback** — tool-call round-trip passback is confirmed working (e2e green); however, full multi-turn plain-turn thinking passback lacks dedicated unit tests (low risk, rules mirror deepseek adapter).
- **R4 — HTTP 200 + error body** — non-2xx errors are handled, but a 200 response with an error body (no `output.choices`) is mis-classified as `STREAM_CLOSED`. Needs content-type sniffing or `code`-presence check after docs/live confirmation.
- **R5 — First-byte idle window** — `streamIdleTimeoutMs` is 300s to accommodate gateway queuing, but the queue period before the first byte is not fully characterized. Pending load-test confirmation of whether the gateway sends keep-alive during queue wait.
- **Image input** — text-only (phase-1); `assertTextOnly` rejects image content blocks. Multi-modal support is deferred.
- **`resolveModel` reasoning efforts** — DashScope has no per-request thinking budget toggle; `reasoningEffort` is rejected (`UNSUPPORTED_REASONING_EFFORT`). Thinking is selected via model choice only.
