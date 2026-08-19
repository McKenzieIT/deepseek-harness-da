# R1 — DashScope LLM seam 兼容性（research, resolved）

**Type**: research（AFK, /research）
**Phase**: 1
**Status**: Resolved
**Blocks**: P2

**Question**: `packages/llm/llm` 是否支持 DashScope 百炼 OpenAI 兼容端点（streaming/tool-call/reasoning_content）？能否镜像 `llm-deepseek`（fetch + eventsource-parser SSE）？

**Research note**: → `../../research/r1-dashscope-seam.md`（已解）。

**Finding**: **能。** `llm-dashscope` 可干净镜像 `llm-deepseek`。LlmAdapter 契约（`packages/llm/llm/src/types.ts` StreamChunk）：stream() 返 7 类 chunk（block-start/text-delta/reasoning-delta/tool-call-delta/block-end/usage/finish），reasoning+tool-call 增量原生支持。llm-deepseek = fetch + eventsource-parser SSE + translate（`delta.reasoning_content`→reasoning-delta 等）。百炼 OpenAI 兼容端点（`dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`）wire 与 DeepSeek 同构；**流解析层（sse.ts/translate.ts）原样可复用**，仅序列化+身份层改：`thinking:{type}`→`enable_thinking:boolean`、`reasoning_effort`→`thinking_budget`、加 `tool_stream:true`、改 baseURL/env(`DASHSCOPE_API_KEY`)/provider(dashscope)/catalog(qwen)。文件结构镜像 llm-deepseek。INFERENCE 风险：thinking_budget 分档 token 数、reasoning_content passback、stream_options.include_usage、requestId 头名——需 e2e 验证。
