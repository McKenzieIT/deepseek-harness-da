# Agent Note: llm-dashscope native AGA protocol adapter

Status: implemented

English | [中文](2026-08-20-llm-dashscope-native-aga-adapter.zh.md)

## Problem

The [data-agent additive scaffold](2026-08-19-data-agent-additive-scaffold.md) reserves a `llm-dashscope` mount as the profile's direct LLM, but a wire contract had to be settled before the package could ship. R1 (the wayfinder ticket) assumed DashScope was reachable as a public OpenAI-compatible endpoint and proposed porting `rbi-llm`'s `DashScopeProvider` into a harness adapter by mirroring `llm-deepseek`'s OpenAI-compatible wire. A live probe (`wayfinder/data-agent/research/p2-dashscope-wire.md`) refuted that: DashScope is reached through 阿里内网 AGA (AI Gateway) and speaks DashScope's native text-generation protocol, not OpenAI chat completions. So the package had to be a from-scratch native adapter, and the question became: what exactly is the native AGA wire contract, and how is it pinned so future gateway drift surfaces as a spec failure rather than a silent regression — given there is no stable published spec to code against.

## Decision

`@deepseek-ai/dsh-llm-dashscope` is a **from-scratch native AGA protocol adapter**, not an OpenAI-compatible mirror of `llm-deepseek`. It mirrors `llm-deepseek`'s *structure* (src/{adapter,sse,translate,serialize,types,invariant,index}.ts + tests/ + package.json/tsconfig) because the harness `LlmAdapter` seam is shared, but the wire layer is native and disjoint from OpenAI chat-completions. This refutes R1's OpenAI-compatible assumption.

Key wire facts, probed live against the pre发 AGA gateway and pinned by unit specs:
- Request body `{model, input:{messages}, parameters:{result_format:"message", incremental_output:true, max_tokens?, temperature?, tools?}}`. Tools live in `parameters.tools`; a top-level `tools` is silently dropped by the gateway (probed).
- Streaming: header `X-DashScope-SSE: enable` + body `incremental_output: true` yields SSE `data:` lines of native JSON where `output.choices[].message` is a **delta** (`incremental_output`, not a snapshot). There is **no `[DONE]` sentinel**; the stream terminates when an event's `finish_reason` is a non-`"null"` literal string. Each event carries a cumulative `usage`; the adapter takes the latest.
- `requestId` is read from the **error body's `request_id`** field, not a response header.
- `usage` is DISJOINT: native `input_tokens`/`output_tokens`/`total_tokens` plus `prompt_tokens_details.cached_tokens` and `output_tokens_details.reasoning_tokens`. The adapter projects `inputTokens = input_tokens - cached_tokens` (so cached input is not double-counted) and `cacheReadTokens = cached_tokens`.
- The adapter does **not** introduce `enable_thinking`, `thinking_budget`, `tool_stream`, or `include_usage` — none are native AGA fields. Reasoning is model-bound: `resolveModel` exposes no reasoning efforts, and a caller-set `reasoningEffort` is rejected (`UNSUPPORTED_REASONING_EFFORT`); thinking is selected by model (qwen3.6-plus, etc.).

Identity: provider `dashscope`; default `PUBLIC_BASE_URL=https://pre-aga-ai-gateway.alibaba-inc.com/api/v1/services/aigc/text-generation/generation`; env `DASHSCOPE_API_KEY`/`DASHSCOPE_BASE_URL`; catalog {qwen-flash, qwen-plus, qwen3.7-max, qwen3.6-plus}; attribution headers `x-dashscope-harness-*`; optional `discoverModels` hits `GET /api/v1/models`. Image input is out of scope for phase-1 (text-only, `assertTextOnly`); rate-limit queueing does not return 429, so `streamIdleTimeoutMs` is widened (300s) to tolerate the pre-first-byte queueing window. The [data-agent bundle](2026-08-19-data-agent-additive-scaffold.md)'s `cordis.patch.yml` mounts the package via an active `- insert:` row and sets `agent-default-model` to `dashscope`/`qwen-plus`; the other base providers stay mounted and configurable.

## Verification

- `tsc -b packages/llm/llm-dashscope/tsconfig.json` exit 0; `tsc -b tsconfig.host.json` exit 0 (the new `./packages/llm/llm-dashscope` reference plus its tests aggregate type-clean).
- 64 unit specs across serialize/sse/translate/adapter pin the native wire contract (serialize.spec 20, sse.spec 6, translate.spec 11, adapter.spec 27 — the last via `it.each` over 7 HTTP-status mappings). All green.
- Key-gated live e2e (`adapter.e2e.ts`, `skipIf !DASHSCOPE_API_KEY`, key via env/credentials seam — never committed) is 4/4 green against the pre发 AGA gateway: text streaming, thinking-model reasoning delta, tool-call round-trip, and tool-call passback all confirmed. The delta-shape assumption for `reasoning_content`/`tool_calls` (delta vs snapshot) is now live-confirmed, not just mock-assumed.

## Alternatives considered

- **OpenAI-compatible mirror of `llm-deepseek` (R1).** Refuted by the live probe: AGA speaks DashScope native text-generation, not OpenAI chat completions. Mirroring `llm-deepseek`'s wire would send a body the gateway silently drops fields from, would never receive `[DONE]`, and would project usage under a foreign (non-disjoint) formula.
- **Reuse `llm-deepseek`'s adapter with a translate shim.** The request/response shapes are disjoint (`input.messages` + `parameters.tools`, no `[DONE]`, disjoint usage); a shim would be larger than a native adapter and would hide wire facts behind a foreign vocabulary, defeating the pin-the-wire goal.
- **Expose `enable_thinking`/`thinking_budget` as reasoning efforts.** None are native AGA fields; inventing them would send unsupported parameters and fix a per-request thinking contract the gateway resolves by model selection. Reasoning stays model-bound.
- **Image input in phase-1.** Out of scope; `assertTextOnly` keeps the phase-1 surface text-only and avoids a multimodal contract this ticket does not own.

## Consequences

- The data agent has a direct, native LLM over AGA; the scaffold's reserved `llm-dashscope` mount is now active, and the profile default is `dashscope`/`qwen-plus` (overridable per-request or via the settings UI, with the other base providers still mounted and switchable).
- The native wire contract is pinned by 64 unit specs and 4 live e2e cases; future AGA drift surfaces as a spec failure, not a silent regression. The package owns no source edits to core — it is an additive plugin.
- Deferred (code-review R3/R4/R5, not bugs): R3 — a full multi-turn reasoning-passback unit test is deferred (the live e2e covers the tool-call round; a plain-turn multi-turn thinking unit test is low-risk, its rules copied from `llm-deepseek`). R4 — an HTTP 200 carrying an error body is not yet specially handled (non-2xx is handled; a 200+error-body would flow through `parseSse`→`translate`, find no `output.choices`, and misclassify as `STREAM_CLOSED`; awaiting docs/live confirmation before a content-type sniff or code-presence check). R5 — the `streamIdleTimeoutMs` 300s first-byte window under gateway queueing is not yet load-tested (the probe sees per-event `:HTTP_STATUS/200`, but the pre-first-byte queueing period is uncharacterized; awaiting a load test to confirm the gateway emits keep-alive during the queue).
