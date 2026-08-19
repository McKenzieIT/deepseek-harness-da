# P2 · DashScope（AGA AI Gateway）wire 真能力调研

> 研究问题：dsh-data-agent 的 `llm-dashscope` 该实现哪套 wire？R1（OpenAI 兼容镜像 llm-deepseek）vs reverse-bi 的 DashScopeProvider（原生）哪个对？调用文档-emp-414028 说的原生协议实测形状如何？dsh-data-agent 最适方案？
>
> 本笔记纠正 R1（`research/r1-dashscope-seam.md`）的"OpenAI 兼容镜像"前提——R1 全程未读 reverse-bi 真实实现，也未实测，论线作废。详见 §2。

## TL;DR

**实现 DashScope 原生协议**（经阿里内网 AGA AI Gateway），**不是** R1 假设的公网 OpenAI 兼容镜像。wire 经 6 个真实探针（2026-08-19 12:07 UTC，预发 AGA 网关）兑现：

- 端点 `https://pre-aga-ai-gateway.alibaba-inc.com/api/v1/services/aigc/text-generation/generation`，`Authorization: Bearer $DASHSCOPE_API_KEY`。
- 请求体 `{model, input:{messages}, parameters:{result_format:"message" [, max_tokens, temperature, incremental_output, tools]}}`。messages 在 `input.messages`；**tools 必须在 `parameters.tools`**（顶层被静默丢弃——实测确认）。
- 响应体 `{output:{choices:[{finish_reason, message:{role, content, reasoning_content?, tool_calls?}}]}, usage, request_id}`。content 文本类=string、思考/多模态类=array；`request_id` 在**体**顶层（非响应头）。
- 流式：头 `X-DashScope-SSE: enable` + `parameters.incremental_output: true` → SSE 帧 `id:/event:result/:HTTP_STATUS/200/data:`，data 是原生 JSON，**content 为增量 delta**，**无 `[DONE]`**，末事件 `finish_reason` 非 `"null"`（字面串）即终止；每事件带 cumulative `usage`（取最新）。
- 思考：靠**选模型**（qwen3.6-plus 等），**无 `enable_thinking`/`thinking_budget`/`tool_stream` 请求字段**；`message.reasoning_content` 回传；`output_tokens` 含思维链 token，`output_tokens_details.reasoning_tokens` 拆出。
- usage 字段：`input_tokens`/`output_tokens`/`total_tokens`/`prompt_tokens_details.cached_tokens`（缓存命中，OpenAI 兼容拼写）/`output_tokens_details.reasoning_tokens`。
- `GET /api/v1/models` 实时模型清单可用（实测 10 个，比调用文档静态表多 `qwen3.7-plus`）。
- 限流：**排队不返 429**（实测无 429；s-rt 5–5900ms）。

R1 的"百炼 OpenAI 兼容、镜像 llm-deepseek、sse.ts/translate.ts 原样复用、发 enable_thinking/thinking_budget/tool_stream、requestId 走响应头、`stream_options.include_usage`"整条作废。RBI 的 DashScopeProvider wire **方向对**（原生），但只实现了非流式 `chat()`、无流式/无 thinking 控制字段——未完工，需在 harness 里从零重实现（含流式）。

## 1. 探针实证（primary source）

6 个请求，预发 AGA 网关，2026-08-19 12:07 UTC，key 经 env（不入库/不进 git）。探针脚本 `/tmp/probe-dashscope.mjs`（throwaway，只读 env，绝不打印 key）。原始输出见会话探针结果。

### 1.1 GET /api/v1/models
- 200。响应头：`eagleeye-traceid`/`s-brt`/`s-rt`/`ups-target-key`/`x-protocol`，**无 `x-request-id`/`request-id`**。
- body：`{"models":["qwen-flash","qwen-plus","qwen-plus-latest","qwen3-max","qwen3.5-flash","qwen3.5-plus","qwen3.6-flash","qwen3.6-plus","qwen3.7-max","qwen3.7-plus"]}`。
- → requestId **不在响应头**；模型清单可实时查（比调用文档静态表多 `qwen3.7-plus`）。

### 1.2 非流式 qwen-flash pong
- 200。body：`{"output":{"choices":[{"finish_reason":"stop","message":{"role":"assistant","content":"pong"}}]},"usage":{"input_tokens":15,"output_tokens":1,"total_tokens":16,"prompt_tokens_details":{"cached_tokens":0}},"request_id":"9387736a-..."}`。
- → 响应骨架 `output.choices[0].message.content`(string) + 顶层 `usage` + 顶层 **`request_id`**。usage 带 `prompt_tokens_details.cached_tokens`（OpenAI 兼容拼写，cache=0 时为 0）。

### 1.3 流式 qwen-flash incremental_output 数数
- 200，`content-type: text/event-stream`，`transfer-encoding: chunked`，`content-encoding: gzip`（fetch 自动解压）。
- 7 个 SSE 事件，帧格式：
  ```
  id:1
  event:result
  :HTTP_STATUS/200
  data:{...}
  ```
- 每 `data` = `{"output":{"choices":[{"finish_reason":"...","message":{"role":"assistant","content":"<增量>"}}]},"usage":{...},"request_id":"..."}`。
- content 序列：`"1"`,`",""`,`"2"`,`",""`,`"3,4,"`,`"5"`,`""`(末空) → **增量 delta**（`incremental_output:true`）。
- `finish_reason`：非末事件=`"null"`（**字面串**，非 JSON null），末事件=`"stop"`。
- **无 `[DONE]`**（`hasDONE=false`）。终止 = 末事件 `finish_reason` 真值 + 流关闭。
- 每事件带 cumulative `usage`（output_tokens 1→2→3→4→8→9→9），取最新。
- `request_id` 每事件同值（per-stream）。
- `:HTTP_STATUS/200` 是 SSE comment 行 → eventsource-parser `onComment`，可作 idle watchdog pulse。

### 1.4a tools 放 parameters（qwen-plus）
- 200。body：`{"output":{"choices":[{"finish_reason":"tool_calls","message":{"role":"assistant","content":"","tool_calls":[{"id":"call_5c01...","index":0,"type":"function","function":{"name":"get_weather","arguments":"{\"city\": \"Paris\"}"}}]},"index":0}]},"usage":{"input_tokens":160,...},"request_id":"..."}`。
- → `parameters.tools` 走通，返 `finish_reason:"tool_calls"` + `message.tool_calls[].{id,index,type,function.{name,arguments(JSON string)}}`。input_tokens=160（含 tools 定义）。

### 1.4b tools 放顶层（qwen-plus）
- 200。body：`{"output":{"choices":[{"finish_reason":"stop","message":{"role":"assistant","content":"I'll check... ```tool_code\nget_weather(location=\"Paris\")\n```"}}]},"usage":{"input_tokens":21,...},"request_id":"..."}`。
- → 顶层 tools **被静默丢弃**，模型当纯文本回（用 `tool_code` markdown 试图调），`finish_reason:"stop"` 非 `"tool_calls"`，input_tokens=21（不含 tools 定义）。
- → **钉死 RBI note 自相矛盾**：`parameters.tools` 对、顶层错；RBI code 对、RBI note §1 curl 错。

### 1.5 思考模型 qwen3.6-plus（非流式）
- 200，s-rt 5900ms。body：`{"output":{"choices":[{"finish_reason":"stop","message":{"role":"assistant","content":[{"text":"9.8"}],"reasoning_content":"Here's a thinking process:..."}}]},"usage":{"input_tokens":31,"output_tokens":327,"total_tokens":358,"output_tokens_details":{"reasoning_tokens":319,"text_tokens":327},"input_tokens_details":{"text_tokens":31}},"request_id":"..."}`。
- → content 是 **array** `[{"text":"9.8"}]`（思考/多模态类）；`reasoning_content` 是 string（思维链）；**无 enable_thinking/thinking_budget 请求字段**——思考靠选模型。
- → usage：`output_tokens`(327) 含思维链；`output_tokens_details.reasoning_tokens`(319) 拆出；另有 `text_tokens`/`input_tokens_details`。

## 2. 对 R1 / RBI 的纠正

| 项 | R1 假设 | RBI | 实测（本文）|
|---|---|---|---|
| 协议 | OpenAI 兼容（镜像 llm-deepseek） | 原生（对） | **原生** |
| 流式 | delta + `[DONE]`（同 DeepSeek） | note 说 full-snapshot、无 [DONE] | **incremental_output:true→delta；无 [DONE]；末 finish_reason 真值终止**（RBI note 的 full-snapshot 是没设 incremental_output 的默认态）|
| 流式 payload | `choices[].delta.{content,reasoning_content,tool_calls}` | — | `output.choices[].message.{content,reasoning_content,tool_calls}`（delta 在 message）|
| 终止 | `[DONE]` | finish_reason 非 null | `finish_reason` 非 `"null"`（字面串）+ 流关闭 |
| enable_thinking/budget/tool_stream | 要发 | 无 | **无此三字段**；思考靠选模型 |
| requestId | 响应头 | 体 `request_id` | **体顶层 `request_id`**，响应头无 |
| usage | prompt_tokens/completion_tokens | input_tokens/output_tokens | **input_tokens/output_tokens/total_tokens + prompt_tokens_details.cached_tokens + output_tokens_details.reasoning_tokens** |
| tools 位置 | 顶层 | parameters.tools | **parameters.tools**（顶层静默丢弃，实测）|
| include_usage | stream_options | — | 原生每事件/末事件自带 usage，无需请求 |

## 3. 给 dsh-data-agent 的推荐方案

**native AGA 原生协议 + 流式（`X-DashScope-SSE:enable` + `incremental_output:true`）**，作为 harness `ctx.llm` adapter，**只仿 llm-deepseek 的结构**（包/adapter/invariant/index/Config/credentials-seam/卫生门），wire **从零实现**：

- `serialize.ts`：原生体 `{model, input:{messages}, parameters:{result_format:"message", incremental_output:true, max_tokens?, temperature?, tools?}}`；tools 放 `parameters.tools`；**不引入** enable_thinking/thinking_budget/tool_stream。assistant 回放：content 绝不 null（`""` 或文本），tool-call 轮回放 `reasoning_content`（passback 规则待多轮 tool-call 实测确认——先照 DeepSeek 同构：tool-call 轮才回放）。
- `types.ts`：原生 WireRequest（`input`/`parameters`）、WireChunk（`output.choices[].message`）、WireUsage（input_tokens/output_tokens/total_tokens/prompt_tokens_details.cached_tokens/output_tokens_details.reasoning_tokens）、WireError（体 `code`+`message`+`request_id`）。
- `sse.ts`：用 `EventSourceParserStream`（处理 id/event/comment 字段）；抽 `data`；`:HTTP_STATUS/*` comment 作 watchdog pulse；**不期望 `[DONE]`**，靠 payload 内 `finish_reason` 真值 + 流关闭终止（流关闭前未见真值→`STREAM_CLOSED`）。
- `translate.ts`：**从零**——每 `data` parse 为 `{output:{choices:[{finish_reason, message}]}, usage, request_id}`；`message.content` 兼容 str/array（array join `text`）；`reasoning_content`→`reasoning-delta`；`tool_calls`→`tool-call-delta`（按 `index` 拼，arguments JSON string）；`finish_reason==="null"` 忽略、真值→`mapFinishReason`（stop/tool_calls/length）；`usage` 取最新→`mapUsage`（DISJOINT：`inputTokens=input_tokens-cached_tokens`）；末事件 emit block-end+usage+finish。
- `adapter.ts`：fetch `${baseURL}`（baseURL 即完整 generation 路径）+ Bearer + `X-DashScope-SSE:enable`（流式）+ attributionHeaders + `x-dashscope-harness-*`；错误分类按 RBI `_classify_status`（401/403→AUTH，404→MODEL_NOT_AVAILABLE，400→INVALID_REQUEST，429→RATE_LIMIT[稀有]，5xx→SERVER），requestId 从**错误体 `request_id`** 取；限流排队→retry 策略放宽超时（`streamIdleTimeoutMs` 默认调大）。
- `index.ts`：`name='llm-dashscope'`，`PROVIDER='dashscope'`，`PUBLIC_BASE_URL='https://pre-aga-ai-gateway.alibaba-inc.com/api/v1/services/aigc/text-generation/generation'`，env `DASHSCOPE_API_KEY`/`DASHSCOPE_BASE_URL`，catalog qwen；**可选** `registerModelDiscovery`+`discoverModels` 打 `GET /api/v1/models`。
- **reasoning 控制**：native 无 per-request thinking 开关（思考是模型属性——qwen3.6-plus 思考、qwen-flash 不思考）。adapter `resolveModel` **不暴露 reasoning efforts**（`reasoning` 字段省略）→ 调用方设 `reasoningEffort` 会被 `resolveCallConfig` 拒（`UNSUPPORTED_REASONING_EFFORT`）。data-agent 靠**选模型**控制思考深度（P7 编排须知）。不引入 enable_thinking/thinking_budget。

**理由**：source-faithful（RBI+调用文档+实测皆原生）+ intranet-security-first（内网 AGA 网关，无公网出口）+ 契合 harness streaming 契约（incremental delta → StreamChunk delta）。比 R1 估的大：4 个 wire 文件从零 + adapter + 身份 + 测试，全原生。

## 4. 剩余决策（待用户确认）

1. **默认 catalog**：建议 `{qwen-flash（便宜，title/compaction）, qwen-plus（SQL 生成主力）, qwen3.7-max（硬推理）, qwen3.6-plus（思考/多模态）}`。可精简或调整。
2. **图片输入**：原生支持（content array + image url）。data-agent（NL→SQL）phase-1 建议**不做**（text-only，仿 llm-deepseek `assertTextOnly`）。
3. **model discovery**：建议**实现** `registerModelDiscovery`+`discoverModels` 打 `GET /api/v1/models`（实测可用、llm-deepseek 没有的能力、调用文档推荐实时查）。
4. **reasoning 控制**：建议**不暴露 efforts**，思考靠选模型（见 §3）。
5. **e2e**：mock+单元 spec（pin wire，现可跑）+ key-gated live e2e 打预发 AGA（`skipIf !DASHSCOPE_API_KEY`）——探针已证 live 可行。key 走 env/credentials seam，不入库。

## 来源（Sources）

- **primary**：会话内 live 探针 `/tmp/probe-dashscope.mjs` 输出（2026-08-19 12:07 UTC，预发 AGA 网关，6 请求；key 经 env 不入库）。〔本文 §1 引用其原始输出〕
- `wayfinder/data-agent/tickets/phase-1/调用文档-emp-414028.md`（emp-414028 业务方专属接入说明：原生协议+模型+流式+错误行为+key）。
- reverse-bi `libs/rbi-llm/src/rbi_llm/providers/dashscope.py` + `config.py` + `tests/test_dashscope_provider.py` + `tests/test_dashscope_errors.py`（原生实现，非流式，错误分类，体 `request_id`）。
- reverse-bi `docs/wayfinder/self-built-agent/research/r1-dashscope-function-calling.md`（native vs compat 对比表 + tools 位置警告 + 流式 full-snapshot 描述[此处被实测纠正：incremental_output:true=delta]）。
- harness `packages/llm/llm/src/types.ts`（StreamChunk/ContentBlock/FinishReason/TokenUsage/GenerateOptions）+ `packages/llm/llm/src/index.ts`（LlmAdapter/registerAdapter/registerConfigurableProviders/registerModelDiscovery/discoverModels）。
- `packages/llm/llm-deepseek/src/*`（结构范本：adapter/sse/translate/serialize/types/index/invariant + tests/{mock-server,adapter.spec,adapter.e2e,serialize.spec,assemble,sse.spec,translate.spec}）。
