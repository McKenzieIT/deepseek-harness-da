# @deepseek-ai/dsh-llm-dashscope

[English](README.md) | 中文

DashScope（AGA AI Gateway）原生协议 chat-completions 适配器，用于 DeepSeek Harness LLM 接缝（`ctx.llm`）。实现 DashScope 原生线路协议（非 OpenAI 兼容），经阿里内部 AGA 网关通信。

## 概述

一个 Cordis Service 适配器，将 harness `ctx.llm` 契约转换为 DashScope 原生 SSE 流：

- 请求体：`{model, input:{messages}, parameters:{result_format:"message", incremental_output:true, max_tokens?, temperature?, tools?}}`
- 流式：`X-DashScope-SSE:enable` 头 + SSE `data:` 原生 JSON（每事件累积 `usage`，`finish_reason !== "null"` 终止——无 `[DONE]` 哨兵）
- 身份：env `DASHSCOPE_API_KEY` / `DASHSCOPE_BASE_URL`，provider 名称 `dashscope`
- 目录：qwen-flash、qwen-plus、qwen3.7-max、qwen3.6-plus
- 推理：无逐请求思考开关；推理通过模型选择（qwen3.6-plus 等）

## 验证

```sh
tsc -b packages/llm/llm-dashscope/tsconfig.json   # typecheck
pnpm vitest run packages/llm/llm-dashscope         # 64 unit specs
DSH_KEYCHAIN_LIVE=1 DASHSCOPE_API_KEY=... pnpm vitest run packages/llm/llm-dashscope/tests/adapter.e2e.ts  # key-gated live e2e
```

## Model Experience

无，因为适配器仅将已组装的 harness 对话重新编码为/自 DashScope 原生线路协议，不添加任何模型绑定文本、schema 或消息。

#### KV Cache effect

Pass-through；适配器经原生线路原样转发已组装的请求前缀，故 agent loop 选择的 provider 和路由拥有缓存复用和路由边界。

## Known Limitations and Deferred Work

- **R3 — 多轮 passback** — tool-call 轮 passback 已确认工作（e2e green）；但完整多轮 plain-turn thinking passback 缺少专用单测（低风险，规则照搬 deepseek 适配器）。
- **R4 — HTTP 200 + 错误体** — 非 2xx 错误已处理，但 200 响应含错误体（无 `output.choices`）被误分类为 `STREAM_CLOSED`。需在 docs/live 确认后添加 content-type 嗅探或 `code` 存在检查。
- **R5 — 首字节空闲窗口** — `streamIdleTimeoutMs` 为 300s 以适应网关排队，但首字节前的排队期未完全刻画。待负载测试确认网关排队期间是否发送 keep-alive。
- **图片输入** — 仅文本（phase-1）；`assertTextOnly` 拒绝图片内容块。多模态支持延期。
- **`resolveModel` 推理力度** — DashScope 无逐请求 thinking budget 开关；`reasoningEffort` 被拒绝（`UNSUPPORTED_REASONING_EFFORT`）。思考仅通过模型选择。
