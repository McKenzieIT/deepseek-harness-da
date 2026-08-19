# R1 · DashScope（百炼）Provider 接入可行性研究

> 研究问题：`packages/llm/llm` 是否支持 DashScope（百炼）OpenAI 兼容端点（流式 / tool-call / reasoning_content）？能否新建 `llm-dashscope` Provider 镜像 `llm-deepseek`（直连 fetch + eventsource-parser SSE，OpenAI 兼容 wire）？

> ⚠️ **本笔记结论已被 P2 live 探针证伪（2026-08-19）**。R1 全程未读 reverse-bi 真实 DashScopeProvider 实现、未实测；"百炼 OpenAI 兼容、可干净镜像 llm-deepseek、sse.ts/translate.ts 原样复用、发 enable_thinking/thinking_budget/tool_stream、requestId 走响应头、stream_options.include_usage"整条论线**作废**。reverse-bi 实际走阿里内网 AGA 网关 + DashScope **原生**协议，6 个 live 探针已兑现真实 wire（无 [DONE]、incremental_output delta、tools 在 parameters.tools、思考靠选模型、requestId 在错误体、usage 原生字段）。**正源见 `research/p2-dashscope-wire.md`**（含探针原始输出 + 纠正表）。本文以下仅作历史记录，**勿据以实现**。

## 摘要（TL;DR）

**能。** `llm-dashscope` 可以干净镜像 `llm-deepseek`。harness 的 `StreamChunk` 协议原生支持 `text-delta` / `reasoning-delta` / `tool-call-delta` 三类增量（`packages/llm/llm/src/types.ts` 的 `StreamChunk` 联合）。百炼 OpenAI 兼容端点（`https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`）采用与 DeepSeek 相同的 OpenAI 兼容 SSE wire——`data: {...}\n\n` + `[DONE]` 哨兵、`delta.reasoning_content`（思考）、`delta.tool_calls[].{index,id,function.{name,arguments}}`（工具调用）。因此 `sse.ts` 和 `translate.ts` 可**原样复用**。唯一需改写的是 `serialize.ts`（思考开关从 `thinking:{type}` 改为 `enable_thinking:boolean` + 可选 `thinking_budget`，新增 `tool_stream`）和 `adapter.ts` / `index.ts` 的身份信息（baseURL、env 变量、provider 名、默认 catalog）。Gap 集中在请求序列化层，不在流解析层。

---

## 1. harness `LlmAdapter.stream()` 契约

### 1.1 抽象契约

`LlmAdapter` 是所有 provider 后端的抽象基类，唯一必须实现的方法是 `stream()`（`packages/llm/llm/src/index.ts`，`LlmAdapter` 类）：

```ts
abstract stream(options: GenerateOptions): AsyncIterable<StreamChunk>
```

注册方式：`ctx.llm.registerAdapter(providers, adapter)` + `ctx.llm.registerConfigurableProviders([...])`（同文件 `LlmRuntime` 类）。每个 provider HTTP 请求必须包含 `attributionHeaders()`。

### 1.2 StreamChunk 增量词汇（核心）

定义在 `packages/llm/llm/src/types.ts`（`StreamChunk` 联合）：

| chunk type | 字段 | 用途 |
|---|---|---|
| `block-start` | `index`, `blockType` | 开启一个新内容块（text/reasoning/tool-call） |
| `text-delta` | `index`, `text` | 可见文本增量 |
| `reasoning-delta` | `index`, `text` | 思考/推理增量（`reasoning_content` 映射到这里） |
| `tool-call-delta` | `index`, `id: CallId`, `name?`, `argumentsDelta` | 工具调用参数增量（原始 JSON 字符串片段） |
| `block-end` | `index`, `block: ContentBlock` | 闭合一个块，携带组装好的块 |
| `usage` | `usage: TokenUsage` | token 用量（在 `finish` 之前） |
| `finish` | `reason: FinishReason`, `replayState?` | 终止块，之后不能再有 chunk |

关键不变量（同文件 `StreamChunk` 注释）：
- "Block indexes correlate interleaved deltas"——交错增量的 `index` 关联同一块。
- "Adapters emit usage before the terminal finish and nothing afterward"——`usage` 在 `finish` 前，`finish` 后无 chunk。
- "tool arguments remain raw JSON strings"——工具参数是原始 JSON 字符串。
- `LlmRuntime.stream()` 会把 adapter 抛出的异常归一化为终止 `error`/`aborted` `finish` chunk（`packages/llm/llm/src/index.ts`，`adapterStream` + `adapterFailureChunk`）。

### 1.3 ContentBlock 与 FinishReason

`ContentBlockMap`（同文件）含 `text` / `reasoning` / `image` / `tool-call` / `tool-result`。`FinishReasonMap`：`stop` / `tool-calls` / `max-tokens` / `aborted`（带 `failure`）/ `error`（带 `failure`）。

### 1.4 GenerateOptions（请求侧）

`GenerateOptions`（同文件）：`provider`、`model`、`reasoningEffort?: ReasoningEffortId`、`messages: Message[]`、`system?`、`tools?: ToolSchema[]`、`temperature?`、`maxTokens?`、`stop?`、`signal?`、`sessionId?`、`purpose?: 'compaction'|'session-title'`。`ToolSchema = { name, description, parameters: JSONSchema }`。

### 1.5 TokenUsage（计费侧）

`TokenUsage`（同文件）：`inputTokens`、`outputTokens`、`cacheReadTokens?`、`cacheWriteTokens?`、`reasoningTokens?`。注释明确："counts are DISJOINT"——`inputTokens` 不含缓存命中，缓存命中单独报 `cacheReadTokens`。

**结论 1**：harness 契约原生支持 reasoning 流（`reasoning-delta` + `ReasoningBlock`）和 tool-call 流（`tool-call-delta` + `ToolCallBlock`），且要求 adapter 把 provider wire 翻译成这七种 chunk。DashScope 的 `reasoning_content` 和 `tool_calls` 都有对应落点。

---

## 2. `llm-deepseek` 实现：fetch + eventsource-parser SSE，OpenAI 兼容 wire

### 2.1 整体架构

`DeepSeekAdapter extends LlmAdapter`（`packages/llm/llm-deepseek/src/adapter.ts`）。运行时依赖**只有** `eventsource-parser: ^3.1.0`（`packages/llm/llm-deepseek/package.json` 的 `dependencies`）。peer 依赖：`dsh-llm`、`dsh-credentials`、`dsh-timeout`、`dsh-anonymous-user-id`、`cordis`。

### 2.2 `stream()` 主流程（adapter.ts）

`stream(options)` 做：
1. 一次性解析 connection facts（`this.config.options()`）+ apiKey（`resolveApiKey(connection)`）+ userId。
2. 建 `AbortController` + `idleWatchdog`（`@deepseek-ai/dsh-timeout`），合并 caller signal 与 consumer signal（`AbortSignal.any`）。
3. 调 `this.request(...)` 异步生成器，用 watchdog 包装迭代（`watchdog.next(iterator)`），pulse 在 SSE comment 上。
4. 异常映射：watchdog 超时→`TIMEOUT`；caller abort→`ABORTED`；其他→`TRANSPORT`。

`request()`（同文件）做：
1. `serializeRequest(options, connection.defaults)` → JSON body。
2. `fetch(\`${connection.baseURL}/chat/completions\`, { method:'POST', headers, body, signal })`。
3. 非 2xx：解析 `WireError`，按 `httpErrorCode(status, error)` 抛 `LlmError`，携带 `status`、`providerRetryAfterMs`（从 `retry-after` 头）、`requestId`（从 `x-request-id` / `x-deepseek-request-id` 头）。
4. 2xx 但无 body→`EMPTY_RESPONSE`。
5. `yield* translate(parseSse(response.body, onComment))`。

请求头（同文件 `request()`）：
```ts
'authorization': `Bearer ${apiKey}`,
'content-type': 'application/json',
'accept': 'text/event-stream',
...attributionHeaders(),
'x-deepseek-harness-user-id': String(userId),
...options.sessionId !== undefined ? { 'x-deepseek-harness-session-id': ... } : {},
...options.purpose === 'compaction' ? { 'x-deepseek-harness-compact': '1' } : {},
```

### 2.3 SSE 解析：`sse.ts`（eventsource-parser）

`parseSse(stream, onComment)`（`packages/llm/llm-deepseek/src/sse.ts`）：
```ts
import { EventSourceParserStream } from 'eventsource-parser/stream'
const events = stream
  .pipeThrough(new TextDecoderStream())
  .pipeThrough(new EventSourceParserStream({ onComment }))
for await (const { data } of events) {
  yield data
  if (data === DONE) return  // DONE = '[DONE]'
}
throw new LlmError('SSE stream ended without [DONE]', 'STREAM_CLOSED')
```

关键点：
- 帧重组、UTF-8/CRLF/BOM、comment 跳过、多 `data:` 拼接——全部交给 `eventsource-parser`。
- `[DONE]` 作为最后一个 yield 交给调用方，调用方在 `translate` 里做最终 flush。
- EOF 前未见 `[DONE]` → `STREAM_CLOSED`（截断）。

### 2.4 wire→StreamChunk 翻译：`translate.ts`

`translate(payloads: AsyncIterable<string>)`（`packages/llm/llm-deepseek/src/translate.ts`）核心：

- 维护 `nextIndex`、`textBlock`、`reasoningBlock`、`toolBlocks: Map<number, OpenBlock>`、`order: OpenBlock[]`。
- 每个 payload：若 `=== DONE`，按 `order` 顺序 yield 所有 `block-end`，再 yield `usage`（若有），再 yield `finish`（reason 默认 `stop`；但 `stop` 且无块→`EMPTY_RESPONSE` error）。`return`。
- 否则 `JSON.parse` 为 `WireChunk`（失败→`MALFORMED_RESPONSE`）。
- 遍历 `chunk.choices`，对每个 `choice.delta`：
  - **reasoning first**：`delta.reasoning_content`（非空字符串）→ 开/追加 `reasoningBlock`，yield `block-start`(reasoning) + `reasoning-delta`。注释："The empty-string first chunk must not open a block"——空串首块不开块。
  - `delta.content`（非空）→ 开/追加 `textBlock`，yield `block-start`(text) + `text-delta`。
  - `delta.tool_calls[]`：按 `call.index` 找/开 `tool-call` 块，更新 `callId`/`name`/`arguments` 片段，yield `block-start`(tool-call)（首次）+ `tool-call-delta`。
  - `choice.finish_reason`（非空）→ 存 `pendingFinish`。
- `chunk.usage` → 存 `pendingUsage`（取最新）。

`mapFinishReason(reason)`（同文件）：
- `stop`→`{kind:'stop'}`；`tool_calls`→`{kind:'tool-calls'}`；`length`→`{kind:'max-tokens'}`；其他→`{kind:'error', failure:{code: reason.toUpperCase()}}`。

`mapUsage(usage)`（同文件）：
- `cacheRead = usage.prompt_tokens_details?.cached_tokens ?? usage.prompt_cache_hit_tokens`（兼容两种拼写）。
- `inputTokens = usage.prompt_tokens - (cacheRead ?? 0)`（减出缓存命中，保持 DISJOINT 约定）。
- `reasoning = usage.completion_tokens_details?.reasoning_tokens`。

### 2.5 请求序列化：`serialize.ts`（OpenAI 兼容 wire）

`serializeRequest(options, defaults)`（`packages/llm/llm-deepseek/src/serialize.ts`）返回 `WireRequest`：

```ts
{
  model: options.model,
  messages,
  stream: true,
  stream_options: { include_usage: true },
  ...resolvedThinking.thinking !== undefined ? { thinking: { type: resolvedThinking.thinking } } : {},
  ...resolvedThinking.reasoningEffort !== undefined ? { reasoning_effort: resolvedThinking.reasoningEffort } : {},
  ...tools?.length > 0 ? { tools } : {},
  ...temperature, max_tokens, stop,
}
```

`serializeAssistant`（同文件）关键 passback 规则：`reasoning_content` **只在 tool-call 轮回放**（"Official passback rule: reasoning_content must return on tool-call turns; it is ignored on plain turns"）；`content: text`（text-less 轮发 `""`，绝不 `null`）。`tool-result` → `{ role:'tool', tool_call_id, content }`。

`resolveThinking`（同文件）：把 harness 的 `reasoningEffort`（`off`/`low`/`high`/`max`）翻成 DeepSeek wire 的 `thinking:{type}` + `reasoning_effort`。`off`→`thinking:{type:'disabled'}`；`low`/`high`/`max`→`thinking:{type:'enabled'}` + `reasoning_effort:<值>`。

### 2.6 wire 类型：`types.ts`

`WireRequest`（`packages/llm/llm-deepseek/src/types.ts`）字段：`model`、`messages`、`stream:true`、`stream_options:{include_usage:true}`、`thinking?:{type:'enabled'|'disabled'}`（注释："top level, NOT inside extra_body on the wire"）、`reasoning_effort?:'low'|'high'|'max'`、`tools?`、`temperature?`、`max_tokens?`、`stop?`。

`WireDelta`：`role?`、`content?:string|null`、`reasoning_content?:string|null`（注释："The FIRST chunk carries an empty string (must not open a reasoning block); absent entirely in non-thinking mode"）、`tool_calls?: WireToolCallDelta[]`。

`WireToolCallDelta`：`index:number`、`id?:string`（首 delta 才有）、`type?:'function'`、`function?:{name?:string, arguments?:string}`（arguments 是 JSON 片段，按 index 拼接）。

`WireUsage`：`prompt_tokens`、`completion_tokens`、`prompt_cache_hit_tokens?`、`prompt_tokens_details?.cached_tokens?`（OpenAI 兼容拼写）、`completion_tokens_details?.reasoning_tokens?`。

### 2.7 插件入口：`index.ts`

`packages/llm/llm-deepseek/src/index.ts`：
- `name = 'llm-deepseek'`，`inject = ['llm']`。
- `PROVIDER = 'deepseek-official'`，`PUBLIC_BASE_URL = 'https://api.deepseek.com'`。
- `DEFAULT_API_KEY_ENV = 'DEEPSEEK_API_KEY'`，`BASE_URL_ENV = 'DEEPSEEK_BASE_URL'`。
- `DEFAULT_MODELS`：`deepseek-v4-flash`、`deepseek-v4-pro`（contextWindow = `DEFAULT_CONTEXT_WINDOW = 1_000_000`）。
- `Config` schema（schemastery）：`apiKeyEnv`、`baseURL`、`thinking`、`reasoningEffort`、`maxTokens`（默认 `DEFAULT_MAX_TOKENS = 256_000`）、`defaultContextWindow`、`models`、`streamIdleTimeoutMs`（默认 `DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000`）、`retryPolicy`。
- `resolveAdapterOptions(config, environment)`：校验 + baseURL 三级回退（config → `$DEEPSEEK_BASE_URL` 环境层 → `PUBLIC_BASE_URL`）。
- `apply(ctx, config)`：`options()`（last-good 缓存）+ `resolveApiKey`（先 credentials seam，后 ambient env，皆无→`MISSING_CREDENTIAL`）+ `resolveUserId` + `new DeepSeekAdapter(...)` + `registerConfigurableProviders([{provider,displayName,settingsNs:'llm-deepseek',settingsPath:[]}])` + `registerAdapter([PROVIDER], adapter)` + `installSettingsSection`（settings 变更触发 `registration.replace` 重读 retryPolicy）。

### 2.8 测试模式：`tests/`

`packages/llm/llm-deepseek/tests/mock-server.ts` 提供 `mockServer(script)` + `textEvents` 固定件：
```ts
export const textEvents = [
  '{"choices":[{"delta":{"role":"assistant","content":null,"reasoning_content":""}}]}',
  '{"choices":[{"delta":{"content":"hello"}}]}',
  '{"choices":[{"delta":{"content":""},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":1}}',
  '[DONE]',
]
```
`tests/adapter.spec.ts` 用 `harness(baseURL, config)` 组装 `Context` + `LlmRuntime` + `LlmDeepSeek`，断言 wire 请求体（`thinking:{type:'enabled'}`、`reasoning_effort:'high'`、`stream:true`、`stream_options:{include_usage:true}`、`max_tokens`）和头（`x-deepseek-harness-user-id` 等）。HTTP 错误码映射（401→AUTH、429→RATE_LIMIT/QUOTA_EXCEEDED、400→INVALID_REQUEST/CONTEXT_WINDOW_EXCEEDED、5xx→SERVER）也在 spec 里固化。

**结论 2**：`llm-deepseek` 是"直连 fetch + eventsource-parser SSE + OpenAI 兼容 wire"的范本。`sse.ts` 和 `translate.ts` 对**任何** OpenAI 兼容 SSE 端点都通用，因为它们只认 `data: {...}` + `[DONE]` + `delta.{content,reasoning_content,tool_calls}` 这一标准结构。

---

## 3. DashScope（百炼）OpenAI 兼容端点形态

### 3.1 端点与认证

- **Base URL**：`https://dashscope.aliyuncs.com/compatible-mode/v1`，拼接 `/chat/completions`（与 OpenAI 一致）。
  - 区域变体：`https://dashscope-intl.aliyuncs.com/compatible-mode/v1`（新加坡）、`https://dashscope-us.aliyuncs.com/compatible-mode/v1`（美国弗吉尼亚）。
  - 业务空间专属：`https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` 等。
- **认证**：`Authorization: Bearer $DASHSCOPE_API_KEY`（标准 OpenAI Bearer）。
- 官方文档（URL）：
  - OpenAI 兼容-Chat：https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions
  - 深度思考模型用法：https://help.aliyun.com/zh/model-studio/deep-thinking
  - OpenAI 兼容接口总览：https://help.aliyun.com/zh/model-studio/developer-reference/compatibility-of-openai-interface
  - Function Calling：https://help.aliyun.com/zh/model-studio/developer-reference/function-calling
  - 百炼上的 DeepSeek：https://help.aliyun.com/zh/model-studio/deepseek-api

> 注：`help.aliyun.com` 对自动化爬取返回 403，下列 wire 字段细节由多份二手资料（CSDN、知乎、博客）引用官方文档交叉确认，并标注 INFERENCE 处。

### 3.2 流式输出（streaming）

- 请求：`stream: true`。响应 `Content-Type: text/event-stream`，SSE 帧 `data: {json}\n\n`，末尾 `data: [DONE]`。
- **与 OpenAI 标准 SSE 完全一致**——增量 delta（非百炼原生 SDK 的"每次返回全文"模式）。百炼原生 SDK 才需 `incremental_output:true`；OpenAI 兼容模式下 delta 天然增量。

来源：
- https://blog.csdn.net/Astron_ma/article/details/160279947（源码级拆解 OpenAI vs DashScope 流式差异）
- https://blog.csdn.net/m0_74373135/article/details/160832525（保姆级教程，Base URL 列表）

### 3.3 reasoning_content（思考/思维链）

- **请求侧开关**：`enable_thinking: true | false`（布尔，**顶层**字段；OpenAI SDK 因 schema 不识别需走 `extra_body`，但裸 HTTP body 里就是顶层布尔）。
  - Qwen3 系列默认 `enable_thinking: true`（混合推理模型）。
  - 可选 `thinking_budget: <token 数>`（限制思考 token 上限）。
- **响应侧**：流式 `delta.reasoning_content`（字符串，先于 `delta.content` 出现）；非流式 `message.reasoning_content`。
- **与 DeepSeek 的差异**：DeepSeek 用 `thinking: { type: 'enabled' | 'disabled' }`（对象）+ `reasoning_effort: 'low'|'high'|'max'`；百炼用 `enable_thinking: boolean` + `thinking_budget: number`。**但 `delta.reasoning_content` 字段名相同**——这是关键兼容点。

来源：
- https://zhuanlan.zhihu.com/p/2071151233746917103（DeepSeek V4 Pro on 百炼，`extra_body={"enable_thinking": True}` 示例）
- https://help.aliyun.com/zh/model-studio/deep-thinking（深度思考模型用法）

### 3.4 tool-call（函数调用）

- **请求**：`tools: [{ type: 'function', function: { name, description, parameters } }]`（OpenAI 标准）。支持 `tool_choice`。
- **响应（流式）**：`delta.tool_calls[]`，每项 `{ index, id?, type?:'function', function?:{name?, arguments?} }`——与 OpenAI/DeepSeek 完全一致。`index` 区分并行调用，`id`/`function.name` 仅首 delta 出现，`function.arguments` 是 JSON 片段按 `index` 拼接。
- **工具结果回传**：`{ role: 'tool', tool_call_id, content }`（OpenAI 标准）。
- **百炼特有 `tool_stream` 参数**（非 OpenAI 标准）：
  - `tool_stream: false`（默认）：工具参数一次性输出（一个 chunk），复杂格式更准。
  - `tool_stream: true`：工具参数流式输出（多片段），无超时风险。

来源：
- https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions（`tool_stream` 说明，搜索结果摘要确认）
- https://help.aliyun.com/zh/model-studio/developer-reference/function-calling

**结论 3**：百炼 OpenAI 兼容端点支持流式、tool-call、reasoning_content，wire 结构与 DeepSeek/OpenAI 高度同构。差异仅在"思考开关字段名"和"`tool_stream` 扩展参数"。

---

## 4. `llm-dashscope` 能否干净镜像 `llm-deepseek`？Gap 分析

### 4.1 可直接复用（无改动）

| 模块 | 原因 |
|---|---|
| `sse.ts` | 百炼 SSE = `data:{json}\n\n` + `[DONE]`，与 DeepSeek 完全一致。`EventSourceParserStream` 通用。 |
| `translate.ts` | 百炼 `delta.{content, reasoning_content, tool_calls[].index/id/function.{name,arguments}}` 与 DeepSeek wire 同构。`mapFinishReason`（stop/tool_calls/length）和 `mapUsage`（prompt_tokens_details.cached_tokens 兼容）原样可用。 |
| `tests/mock-server.ts` | `textEvents` 固定件是 OpenAI 兼容 SSE，百炼同样适用。 |
| `tests/assemble.ts`、`tests/sse.spec.ts`、`tests/translate.spec.ts` | 同上，wire 无关。 |

### 4.2 需改写（Gap 列表）

**G1（serialize.ts — 思考开关字段）**【主要 gap】
- DeepSeek：`thinking: { type: 'enabled' | 'disabled' }`（对象，顶层）。
- 百炼：`enable_thinking: true | false`（布尔，顶层）。
- 适配：`serialize.ts` 的 `resolveThinking` 改写——`off`→`enable_thinking:false`；`low`/`high`/`max`→`enable_thinking:true`。`serializeRequest` 输出 `enable_thinking` 而非 `thinking`。

**G2（serialize.ts — reasoning effort 映射）**【INFERENCE】
- DeepSeek：`reasoning_effort: 'low'|'high'|'max'`。
- 百炼 Qwen3：无 low/high/max 档位概念，靠 `enable_thinking` 开关 + `thinking_budget`（token 数）控制思考深度。
- 适配（INFERENCE）：把 harness 的 `ReasoningEffortId`（`off`/`low`/`high`/`max`）映射为：`off`→`enable_thinking:false`；`low`/`high`/`max`→`enable_thinking:true` + 分档 `thinking_budget`（具体 token 数需查百炼文档确认，或暴露成 config）。另一可选方案：`llm-dashscope` 只暴露 `off`/`on` 两档（`OFF_ONLY_REASONING_EFFORTS`），把 `reasoning_effort` 直接透传 `enable_thinking` 布尔，更简单但损失档位粒度。

**G3（serialize.ts — tool_stream 扩展）**
- DeepSeek：无此参数（工具参数天然流式分片）。
- 百炼：`tool_stream`（默认 `false` = 一次性输出参数）。
- 适配：`translate.ts` 对单分片和多分片都兼容（按 `index` 拼接，单分片就是一个 delta），所以**功能上不设 `tool_stream` 也能工作**。但为降低首 token 延迟、对齐 DeepSeek 行为，建议显式设 `tool_stream: true`。INFERENCE：需验证百炼在 `tool_stream:true` 下复杂工具格式的准确性是否可接受（官方文档提示 false 更准）。

**G4（adapter.ts / index.ts — baseURL 默认）**
- DeepSeek：`PUBLIC_BASE_URL = 'https://api.deepseek.com'`。
- 百炼：`PUBLIC_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'`。注意：DeepSeek 的 baseURL 不含 `/v1`（adapter 拼接 `/chat/completions`），百炼的 baseURL 含 `/compatible-mode/v1`，adapter 同样拼 `/chat/completions`，路径正确。

**G5（adapter.ts — 请求头与 requestId）**【INFERENCE】
- DeepSeek：`x-deepseek-harness-user-id`、`x-deepseek-harness-session-id`、`x-deepseek-harness-compact`；`requestId()` 读 `x-request-id` / `x-deepseek-request-id`。
- 百炼：INFERENCE——harness 自有头可改为 `x-dashscope-harness-*` 或直接复用 `attributionHeaders()` 不加 provider 前缀；`requestId()` 至少保留 `x-request-id`（OpenAI 标准），百炼可能有自己的 `x-dashscope-request-id`（需验证）。建议 `requestId()` 读 `x-request-id` + `x-dashscope-request-id`。

**G6（adapter.ts / index.ts — provider 名与默认 catalog）**
- DeepSeek：`PROVIDER='deepseek-official'`，`DEFAULT_MODELS = [deepseek-v4-flash, deepseek-v4-pro]`。
- 百炼：`PROVIDER='dashscope'`（或 `bailian`），`DEFAULT_MODELS` 改为 qwen 系列（如 `qwen3-235b-a22b`、`qwen-plus`、`qwen-max`、`qwen-turbo`），contextWindow/maxTokens 按百炼文档填（如 qwen3-max-2026-01-23 的 262144 / 65536）。

**G7（index.ts — env 变量与 settingsNs）**
- DeepSeek：`DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`，`NS = settingsNamespace('llm-deepseek')`。
- 百炼：`DASHSCOPE_API_KEY`、`DASHSCOPE_BASE_URL`，`NS = settingsNamespace('llm-dashscope')`。

**G8（translate.ts — usage 字段）**【INFERENCE】
- DeepSeek `mapUsage` 已兼容 `prompt_tokens_details.cached_tokens`（OpenAI 标准）和 `prompt_cache_hit_tokens`（DeepSeek 私有）。INFERENCE：百炼大概率走 OpenAI 标准 `prompt_tokens_details.cached_tokens`，`mapUsage` 原样可用；若百炼有私有缓存字段，补一个 `??` 即可。`completion_tokens_details.reasoning_tokens` 同理。

**G9（translate.ts — finish_reason）**
- 百炼用 OpenAI 标准 `stop` / `tool_calls` / `length`，`mapFinishReason` 原样可用。无 gap。

### 4.3 结论 4

`llm-dashscope` **能干净镜像 `llm-deepseek`**。gap 集中在请求序列化层（`serialize.ts` 的思考开关 + tool_stream）和身份层（`adapter.ts`/`index.ts` 的 baseURL/env/provider/catalog/headers）。流解析层（`sse.ts` + `translate.ts`）因百炼 wire 与 DeepSeek 同构，可原样复用。整体改动量约 2 个文件重写（`serialize.ts`、`types.ts`）、3 个文件改身份（`adapter.ts`、`index.ts`、`invariant.ts`）、2 个文件改测试断言（`adapter.spec.ts`、`serialize.spec.ts`）。

---

## 5. `llm-dashscope` Provider 实现推荐

### 5.1 文件结构（镜像 `llm-deepseek`）

```
packages/llm/llm-dashscope/
  package.json        # name: @deepseek-ai/dsh-llm-dashscope
                      # dependencies: eventsource-parser ^3.1.0
                      # peerDependencies: 同 llm-deepseek（dsh-llm/dsh-credentials/dsh-timeout/dsh-anonymous-user-id/cordis）
  src/
    adapter.ts        # DashScopeAdapter extends LlmAdapter（镜像 DeepSeekAdapter）
    sse.ts            # 原样复制自 llm-deepseek（或抽公共包）
    translate.ts      # 原样复制自 llm-deepseek（或抽公共包）
    serialize.ts      # 【重写】enable_thinking + thinking_budget + tool_stream
    types.ts          # 【改】WireRequest 加 enable_thinking/thinking_budget/tool_stream，去 thinking/reasoning_effort
    invariant.ts      # 镜像（PACKAGE_NAME 改名）
    index.ts          # 【改】name/PROVIDER/env/PUBLIC_BASE_URL/DEFAULT_MODELS/Config schema/resolveAdapterOptions
  tests/
    adapter.spec.ts   # 镜像，改 wire 断言（enable_thinking、tool_stream）
    serialize.spec.ts # 【新】断言 enable_thinking 映射
    sse.spec.ts       # 原样复制
    translate.spec.ts # 原样复制
    mock-server.ts    # 原样复制（textEvents 通用）
    assemble.ts       # 原样复制
```

### 5.2 关键适配点（代码级）

**(a) `src/types.ts` — WireRequest 改字段**
```ts
export interface WireRequest {
  model: string
  messages: WireMessage[]
  stream: true
  stream_options: { include_usage: true }
  enable_thinking?: boolean        // 替代 thinking:{type}
  thinking_budget?: number         // 可选思考预算
  tool_stream?: boolean            // 百炼扩展，建议 true
  tools?: WireTool[]
  temperature?: number
  max_tokens?: number
  stop?: string[]
}
// WireDelta / WireToolCallDelta / WireUsage 原样保留（OpenAI 兼容结构不变）
```

**(b) `src/serialize.ts` — `resolveThinking` 改写**
```ts
function resolveThinking(options, defaults): { enable_thinking?: boolean; thinking_budget?: number } {
  if (options.purpose === 'session-title') return { enable_thinking: false }
  const effort = options.reasoningEffort ?? defaults.reasoningEffort
  if (effort === 'off') return { enable_thinking: false }
  if (effort === 'low' || effort === 'high' || effort === 'max') {
    return { enable_thinking: true, thinking_budget: THINKING_BUDGETS[effort] }  // INFERENCE: 分档 token 数
  }
  return defaults.thinking === 'disabled' ? { enable_thinking: false }
    : defaults.thinking === 'enabled' ? { enable_thinking: true } : {}
}
// serializeRequest 输出 enable_thinking / thinking_budget / tool_stream:true，去掉 thinking / reasoning_effort
```
`serializeAssistant` 的 `reasoning_content` passback 规则（tool-call 轮才回放）原样保留——百炼的 thinking-mode passback 与 DeepSeek 同理（INFERENCE：需百炼文档确认，但 OpenAI 兼容模式下字段名相同，行为大概率一致）。

**(c) `src/adapter.ts` — 身份与头**
```ts
export const PUBLIC_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
// headers: 把 'x-deepseek-harness-*' 改为 'x-dashscope-harness-*'（或去掉 provider 前缀只留 attributionHeaders）
// requestId(): 读 'x-request-id' + 'x-dashscope-request-id'（INFERENCE）
// providerInfo(): { id: provider, name: 'DashScope' }（或 '百炼'）
// REASONING_EFFORTS: 若选分档方案保留 off/low/high/max；若选极简方案用 OFF_ONLY
```

**(d) `src/index.ts` — 插件身份**
```ts
export const name = 'llm-dashscope'
export const inject = ['llm']
const NS = settingsNamespace('llm-dashscope')
const DEFAULT_API_KEY_ENV = 'DASHSCOPE_API_KEY'
const BASE_URL_ENV = 'DASHSCOPE_BASE_URL'
const PROVIDER = 'dashscope'  // 或 'bailian'
export const PUBLIC_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
const DEFAULT_MODELS: DashScopeCatalogModel[] = [
  { id: 'qwen3-235b-a22b', name: 'Qwen3-235B-A22B', contextWindow: 262144, maxTokens: 65536 },
  { id: 'qwen-plus', name: 'Qwen-Plus', /* ... */ },
  { id: 'qwen-max', name: 'Qwen-Max', /* ... */ },
]
// Config schema: thinking/reasoningEffort 字段语义不变（仍是 harness 侧 vocabulary），resolveAdapterOptions 透传
// apply(): registerConfigurableProviders([{provider:PROVIDER, displayName:'DashScope', settingsNs:NS, settingsPath:[]}])
```

**(e) `sse.ts` + `translate.ts` — 原样复用**
不改动。`parseSse` 通用；`translate` 的 `mapFinishReason`/`mapUsage` 对百炼 wire 直接适用。

### 5.3 测试策略（镜像 `tests/adapter.spec.ts`）

- `harness(baseURL, config)`：`vi.stubEnv('DASHSCOPE_API_KEY', 'test-key')`，`ctx.plugin(LlmDashScope, { baseURL, ...config })`。
- `textEvents` 固定件原样可用（已是 OpenAI 兼容 SSE）。
- wire 断言改为：
  ```ts
  expect(server.requests[0]).toMatchObject({
    enable_thinking: true, thinking_budget: /* ... */, tool_stream: true,
    stream: true, stream_options: { include_usage: true },
  })
  expect(server.requests[0]).not.toHaveProperty('thinking')
  expect(server.requests[0]).not.toHaveProperty('reasoning_effort')
  ```
- 头断言改为 `x-dashscope-harness-user-id` 等。
- HTTP 错误码映射 spec（401→AUTH、429→RATE_LIMIT 等）原样可用（`httpErrorCode` 逻辑通用）。

### 5.4 依赖与构建

- `package.json` 的 `dependencies` 只需 `eventsource-parser: ^3.1.0`，`peerDependencies` 与 `llm-deepseek` 完全一致（`dsh-credentials`/`dsh-launch-environment`/`dsh-invariants`/`dsh-llm`/`dsh-settings`/`dsh-timeout`/`dsh-anonymous-user-id`/`cordis`），再加 `@deepseek-ai/schemastery`。
- 构建：`tsdown.config.ts` 镜像 `llm-deepseek`（若存在）。

### 5.5 风险与验证项

| 风险 | 验证方式 |
|---|---|
| `thinking_budget` 分档 token 数（G2/INFERENCE） | 查百炼 `deep-thinking` 文档确认；或先只暴露 `off`/`on` 两档 |
| `tool_stream:true` 下复杂工具格式准确性（G3/INFERENCE） | e2e 测试用复杂 JSON schema 工具验证参数完整性 |
| 百炼 `reasoning_content` passback 规则是否与 DeepSeek 一致（INFERENCE） | 查百炼 thinking-mode 文档；多轮 tool-call e2e 验证 |
| 百炼 usage 缓存字段拼写（G8/INFERENCE） | e2e 抓真实流，确认 `prompt_tokens_details.cached_tokens` 还是私有字段 |
| 百炼 requestId 头名（G5/INFERENCE） | e2e 抓 429/5xx 响应头 |
| 百炼是否支持 `stream_options.include_usage`（INFERENCE） | e2e 验证 usage 是否在流末返回；若不支持，`translate` 的 trailing-usage 逻辑仍兼容（取最新） |

---

## 来源（Sources）

### 主源：源代码
- `packages/llm/llm/src/types.ts` — `StreamChunk`、`ContentBlock`、`FinishReason`、`GenerateOptions`、`TokenUsage`
- `packages/llm/llm/src/index.ts` — `LlmAdapter` 抽象类、`LlmRuntime`、`registerAdapter`/`registerConfigurableProviders`、`adapterStream`/`adapterFailureChunk`、`assertUsableApiKey`
- `packages/llm/llm-deepseek/src/adapter.ts` — `DeepSeekAdapter`、`stream()`、`request()`、`httpErrorCode`、headers、`requestId`、`DEFAULT_*` 常量
- `packages/llm/llm-deepseek/src/sse.ts` — `parseSse`、`DONE='[DONE]'`、`EventSourceParserStream`
- `packages/llm/llm-deepseek/src/translate.ts` — `translate`、`mapFinishReason`、`mapUsage`、`OpenBlock`、`closeBlock`
- `packages/llm/llm-deepseek/src/serialize.ts` — `serializeRequest`、`serializeMessages`、`serializeAssistant`、`resolveThinking`、`RequestDefaults`
- `packages/llm/llm-deepseek/src/types.ts` — `WireRequest`、`WireMessage`、`WireAssistantMessage`、`WireDelta`、`WireToolCallDelta`、`WireUsage`、`WireError`
- `packages/llm/llm-deepseek/src/index.ts` — `name`、`PROVIDER`、`PUBLIC_BASE_URL`、`DEFAULT_MODELS`、`Config` schema、`resolveAdapterOptions`、`apply`
- `packages/llm/llm-deepseek/src/invariant.ts` — companion invariant
- `packages/llm/llm-deepseek/package.json` — `eventsource-parser ^3.1.0` 依赖、peer deps
- `packages/llm/llm-deepseek/tests/mock-server.ts` — `mockServer`、`textEvents` 固定件
- `packages/llm/llm-deepseek/tests/adapter.spec.ts` — 测试模式、wire 断言、HTTP 错误码映射

### 主源：百炼官方文档（URL，部分内容经二手资料交叉确认，因 403 无法直抓）
- https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions — OpenAI 兼容-Chat，`tool_stream` 参数
- https://help.aliyun.com/zh/model-studio/deep-thinking — 深度思考模型用法，`enable_thinking`/`reasoning_content`
- https://help.aliyun.com/zh/model-studio/developer-reference/compatibility-of-openai-interface — OpenAI 兼容接口总览
- https://help.aliyun.com/zh/model-studio/developer-reference/function-calling — Function Calling
- https://help.aliyun.com/zh/model-studio/deepseek-api — 百炼上的 DeepSeek

### 二手资料（交叉确认 wire 字段）
- https://blog.csdn.net/m0_74373135/article/details/160832525 — Base URL 列表（华北2/新加坡/美国）
- https://blog.csdn.net/Astron_ma/article/details/160279947 — 源码级拆解 OpenAI vs DashScope 流式差异
- https://zhuanlan.zhihu.com/p/2071151233746917103 — DeepSeek V4 Pro on 百炼，`extra_body={"enable_thinking": True}` 示例
- https://www.cnblogs.com/zys2019/p/20018992 — curl 示例确认 Bearer 认证与 `/chat/completions` 路径
- https://blog.csdn.net/2402_85718639/article/details/160883413 — `compatible-mode/v1` 端点确认
