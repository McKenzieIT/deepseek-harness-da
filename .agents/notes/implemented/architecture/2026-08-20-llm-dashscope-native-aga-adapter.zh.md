# Agent Note: llm-dashscope native AGA protocol adapter

Status: implemented

[English](2026-08-20-llm-dashscope-native-aga-adapter.md) | 中文

## 问题

[data-agent additive scaffold](2026-08-19-data-agent-additive-scaffold.md) 预留了一个 `llm-dashscope` 挂载点作为 profile 的直连 LLM，但发包前须先定 wire 契约。R1（wayfinder ticket）假设 DashScope 以公网 OpenAI 兼容端点可达，提议把 `rbi-llm` 的 `DashScopeProvider` 移植成 harness adapter、镜像 `llm-deepseek` 的 OpenAI 兼容 wire。live 探针（`wayfinder/data-agent/research/p2-dashscope-wire.md`）证伪了这点：DashScope 经**阿里内网 AGA（AI Gateway）** 走 **DashScope 原生 text-generation 协议**，非 OpenAI chat completions。故该包须从零做 native adapter，问题随之变成：native AGA wire 契约到底是什么，以及如何在无稳定发布 spec 可依时把它钉死，使网关日后漂移表现为 spec 失败而非静默回归。

## 决策

`@deepseek-ai/dsh-llm-dashscope` 是**从零实现的 native AGA 协议 adapter**，**非** `llm-deepseek` 的 OpenAI 兼容镜像。它镜像 `llm-deepseek` 的**结构**（src/{adapter,sse,translate,serialize,types,invariant,index}.ts + tests/ + package.json/tsconfig），因 harness 的 `LlmAdapter` seam 是共享的；但 wire 层是 native、与 OpenAI chat-completions 不相交。此即证伪 R1 的 OpenAI 兼容假设。

关键 wire 事实（对预发 AGA 网关 live 探测，并由单元 spec 钉死）：
- 请求体 `{model, input:{messages}, parameters:{result_format:"message", incremental_output:true, max_tokens?, temperature?, tools?}}`。tools 放 `parameters.tools`；顶层 `tools` 被网关静默丢弃（实测）。
- 流式：头 `X-DashScope-SSE: enable` + 体 `incremental_output: true` → SSE `data:` 行为 native JSON，其中 `output.choices[].message` 是 **delta**（`incremental_output`，非 snapshot）。**无 `[DONE]` 哨兵**；当某事件 `finish_reason` 为非 `"null"` 字面串时流终止。每事件带 cumulative `usage`，adapter 取最新。
- `requestId` 从**错误体 `request_id`** 取，非响应头。
- `usage` 是 DISJOINT：native `input_tokens`/`output_tokens`/`total_tokens` 加 `prompt_tokens_details.cached_tokens` 与 `output_tokens_details.reasoning_tokens`。adapter 投影 `inputTokens = input_tokens - cached_tokens`（缓存输入不被双重计数）、`cacheReadTokens = cached_tokens`。
- adapter **不引入** `enable_thinking`、`thinking_budget`、`tool_stream`、`include_usage`——均非 native AGA 字段。思考靠选模型：`resolveModel` 不暴露 reasoning efforts，调用方设 `reasoningEffort` 被拒（`UNSUPPORTED_REASONING_EFFORT`）；思考经模型选择（qwen3.6-plus 等）。

身份：provider `dashscope`；默认 `PUBLIC_BASE_URL=https://pre-aga-ai-gateway.alibaba-inc.com/api/v1/services/aigc/text-generation/generation`；env `DASHSCOPE_API_KEY`/`DASHSCOPE_BASE_URL`；catalog {qwen-flash, qwen-plus, qwen3.7-max, qwen3.6-plus}；归因头 `x-dashscope-harness-*`；可选 `discoverModels` 打 `GET /api/v1/models`。图片输入 phase-1 不做（text-only，`assertTextOnly`）；限流排队不返 429，故 `streamIdleTimeoutMs` 放宽（300s）以容忍首字节前排队窗口。[data-agent bundle](2026-08-19-data-agent-additive-scaffold.md) 的 `cordis.patch.yml` 经 active `- insert:` 行挂载该包、并把 `agent-default-model` 设为 `dashscope`/`qwen-plus`；其余 base provider 保持挂载且可配。

## 验证

- `tsc -b packages/llm/llm-dashscope/tsconfig.json` exit 0；`tsc -b tsconfig.host.json` exit 0（新增 `./packages/llm/llm-dashscope` reference 加其 tests，host 聚合类型干净）。
- 64 单元 spec 跨 serialize/sse/translate/adapter 钉死 native wire 契约（serialize.spec 20、sse.spec 6、translate.spec 11、adapter.spec 27——后者经 `it.each` 覆盖 7 个 HTTP 状态映射）。全过。
- key-gated live e2e（`adapter.e2e.ts`，`skipIf !DASHSCOPE_API_KEY`，key 经 env/credentials seam——不入库）对预发 AGA 网关 4/4 green：文本流、思考模型 reasoning delta、tool-call round-trip、tool-call passback 全确认。`reasoning_content`/`tool_calls` 的 delta 形状假设（delta vs snapshot）现经 live 确认，非仅 mock 假设。

## 备选方案

- **`llm-deepseek` 的 OpenAI 兼容镜像（R1）。** live 探针证伪：AGA 走 DashScope native text-generation，非 OpenAI chat completions。镜像 `llm-deepseek` 的 wire 会发出网关静默丢字段的体、永不收 `[DONE]`、且按外来（非 disjoint）公式投影 usage。
- **复用 `llm-deepseek` adapter + translate shim。** 请求/响应形状不相交（`input.messages` + `parameters.tools`、无 `[DONE]`、disjoint usage）；shim 会比 native adapter 更大，且把 wire 事实藏在外来词汇背后，违背"钉死 wire"的目标。
- **把 `enable_thinking`/`thinking_budget` 暴露为 reasoning efforts。** 均非 native AGA 字段；编造它们会发不支持参数、并固化一个网关按模型选择来解决的 per-request 思考契约。思考保持 model-bound。
- **phase-1 做图片输入。** 不在范围；`assertTextOnly` 让 phase-1 面保持 text-only，避免本 ticket 不拥有的多模态契约。

## 后果

- data agent 有了 over AGA 的直连 native LLM；scaffold 预留的 `llm-dashscope` 挂载现已 active，profile 默认为 `dashscope`/`qwen-plus`（可 per-request 或经设置 UI 覆盖，其余 base provider 仍挂载、可切换）。
- native wire 契约被 64 单元 spec + 4 live e2e 钉死；AGA 日后漂移表现为 spec 失败而非静默回归。该包不对 core 做源码改动——是 additive 插件。
- Deferred（code review R3/R4/R5，非 bug）：R3——全轮多轮 reasoning-passback 单测延后（live e2e 已覆盖 tool-call 轮；plain-turn 多轮 thinking 单测低风险，规则照搬 `llm-deepseek`）。R4——HTTP 200 带错误体尚未特判（非 2xx 已处理；200+error-body 会走 `parseSse`→`translate`、找不到 `output.choices`、误分类为 `STREAM_CLOSED`；待 docs/live 确认后加 content-type 嗅探/code-presence 检查）。R5——`streamIdleTimeoutMs` 300s 在网关排队下的首字节窗口尚未压测（探针见 per-event `:HTTP_STATUS/200`，但首字节前排队期未刻画；待负载测试确认网关排队期发 keep-alive）。
