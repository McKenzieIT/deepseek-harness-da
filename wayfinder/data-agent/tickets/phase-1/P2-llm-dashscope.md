# P2 — llm-dashscope Provider

**Type**: prototype
**Phase**: 1（P0）
**Status**: In progress（claimed 2026-08-19, claude / wayfinder 会话）— unblocked（R1 已解）
**Assignee**: claude
**Blocked by**: ~~R1~~（已解）

**Question**: 从 rbi-llm DashScopeProvider 移植到 harness `ctx.llm`。经 live 探针（research/p2-dashscope-wire.md）实测：DashScope 经阿里内网 AGA 网关走 **DashScope 原生协议**（非 R1 假设的公网 OpenAI 兼容；R1 论线作废）。Phase 1, P0。

**Design (per research/p2-dashscope-wire.md，纠正 R1)**: 仿 llm-deepseek **结构**（src/{adapter,sse,translate,serialize,types,invariant,index}.ts + tests/ + package.json/tsconfig），wire **从零实现** native AGA：
- 请求体 `{model, input:{messages}, parameters:{result_format:"message", incremental_output:true, max_tokens?, temperature?, tools?}}`；tools 放 `parameters.tools`（顶层静默丢弃，实测）。
- 流式：头 `X-DashScope-SSE:enable`+`incremental_output:true` → SSE `data:` 原生 JSON（`output.choices[].message` delta），**无 `[DONE]`**，末事件 `finish_reason` 非 `"null"`(字面串) 终止，每事件 cumulative `usage` 取最新。
- **不引入** enable_thinking/thinking_budget/tool_stream/include_usage；思考靠选模型（qwen3.6-plus 等），`resolveModel` 不暴露 reasoning efforts。
- requestId 从**错误体 `request_id`** 取（非响应头）；usage=`input_tokens`/`output_tokens`/`total_tokens`/`prompt_tokens_details.cached_tokens`/`output_tokens_details.reasoning_tokens`（DISJOINT：`inputTokens=input_tokens-cached_tokens`）。
- 身份：`PUBLIC_BASE_URL=https://pre-aga-ai-gateway.alibaba-inc.com/api/v1/services/aigc/text-generation/generation`、env `DASHSCOPE_API_KEY`/`DASHSCOPE_BASE_URL`、provider `dashscope`、catalog {qwen-flash, qwen-plus, qwen3.7-max, qwen3.6-plus}、headers `x-dashscope-harness-*`；可选 `discoverModels` 打 `GET /api/v1/models`。
- 图片输入 phase-1 不做（text-only，`assertTextOnly`）；限流排队不 429 → `streamIdleTimeoutMs` 放宽。
- e2e：mock+单元 spec（pin wire 契约，现可跑）+ key-gated live e2e 打预发 AGA（`skipIf !DASHSCOPE_API_KEY`，key 经 env/credentials seam 不入库）。
详见 research/p2-dashscope-wire.md（含探针原始输出 + R1 纠正表）。
