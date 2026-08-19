# P2 — llm-dashscope Provider

**Type**: prototype
**Phase**: 1（P0）
**Status**: Resolved（2026-08-19, claude / wayfinder 会话）— was unblocked（R1 已解）
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

## Resolution（2026-08-19）

已实现 `packages/llm/llm-dashscope/`（src 8 文件 + tests 7 文件 + package.json/tsconfig），wire 从零 native AGA（见 Design）。验证：
- `tsc -b packages/llm/llm-dashscope/tsconfig.json` exit 0（src 类型干净，lib/types 出）。
- `tsc -b tsconfig.host.json` exit 0（含新加的 `./packages/llm/llm-dashscope` reference + 我的 tests，host 聚合类型干净）。
- vitest 62/62 单元 spec 全过（serialize/sse/translate/adapter，pin native wire 契约）。
- 6 个 live 探针已兑现 wire（见 research/p2-dashscope-wire.md §1）。

**Finding**：
- runtime（dsh-llm）`resolveCallFor` 默认 maxTokens（`callConfigEquals` 比 maxTokens）→ dashscope 无显式 maxTokens 时请求带 `parameters.max_tokens`（DEFAULT_MAX_TOKENS=8192，dbg 实证）。**无 P7 caveat**——之前"无 reasoning 适配器丢默认 maxTokens"是误读 toMatchObject diff 所致，证伪。
- reasoning：`resolveModel` 不暴露 efforts（native 无 per-request 思考开关）→ 调用方设 `reasoningEffort` 被 `resolveCallConfig` 拒（`UNSUPPORTED_REASONING_EFFORT`）；思考靠选模型（P7 须知）。
- 流式 reasoning_content/tool_calls 形状（delta vs snapshot）靠 mock+单元 spec 的 delta 假设；`adapter.e2e.ts`（key-gated）已 ship，**live e2e 4/4 green（2026-08-19，预发 AGA 网关）已兑现**——思考模型 reasoning delta + tool-call round-trip（含 passback）均过 → delta 假设成立（R1 resolved；R3 passback 对 tool-call 轮 confirmed）。
- **Deferred 确认（code review R3/R4/R5，非 bug）**：R3 passback——e2e tool-call round-trip 过（tool-call 轮 passback confirmed）；全轮 plain-turn 多轮 thinking 仍未单测（低风险，规则照搬 deepseek）；R4 HTTP 200+错误体未处理（非 2xx 已处理；200+error-body 会走 parseSse→translate 找不到 output.choices→STREAM_CLOSED 误分类——RBI 有 `test_200_with_error_body` 测试或为真实行为，待 docs/live 确认后加 content-type 嗅探/code-presence 检查）；R5 `streamIdleTimeoutMs` 300s 在排队下首字节窗口（probe 见 `:HTTP_STATUS/200` per-event，但首字节前队列期未刻画，待负载测试确认网关队列期发 keep-alive）。

**Assets**：`packages/llm/llm-dashscope/`（additive，未改 core）；throwaway 探针 `/tmp/probe-dashscope.mjs`；cited 笔记 `wayfinder/data-agent/research/p2-dashscope-wire.md`。
