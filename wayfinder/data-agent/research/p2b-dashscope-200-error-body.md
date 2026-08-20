# P2b · DashScope AGA 错误体形 live-probe + 错误体解析 fix

> 研究问题：AGA 网关是否返回 **HTTP 200 + 错误体**（`code`/`message`/`request_id` 在体、非 SSE 流）？若是，adapter.ts 只在 `!response.ok` 处理错误体，2xx 路径会把 200+error-body 误分类为 `STREAM_CLOSED`（`translate` 见流末无 `finish_reason` 真值即抛）。本笔记用 live 探针实证回答，并实施 source-faithful fix。

## TL;DR

**200+error-body 假设不真**（5 个探针，2026-08-20，预发 AGA 网关，key 经 credentials seam 文件 `~/.dsh/.credentials.yaml`、不入库/不进 env/不打印）：AGA 对错误请求**正确用 4xx 状态码**——坏 model id→404、坏参数（`max_tokens:-1`）→400、空 messages→400；坏 tool schema 不被网关拒（模型正常回 200+正常 SSE）。**无任何 200+error-body 实证**。RBI 的 `test_200_with_error_body` 是**防御性 fixture**（覆盖一种 AGA 未实测出的形状），非 AGA 实证。

**但探针捞出一条同源真 bug**：AGA 的 4xx 错误体是 **SSE 框架的**（`id:1\nevent:error\n:HTTP_STATUS/<status>\ndata:{code,message,request_id}`），却**标 `content-type: application/json`**（实测 P2/P4）。adapter.ts 的 `!response.ok` 路径调 `response.json()`，在 SSE 框架上抛 SyntaxError，catch 吞掉，message 退化为通用 `DashScope API error (HTTP 400)`、body 的 `code`/`message`/`request_id` **全丢**——操作员失去进网关侧日志的唯一线索（`request_id`）。分类本身**没错**（`httpErrorCode(400, undefined)` 仍返 `INVALID_REQUEST`，按 status），但**错误详情与 request_id 丢失**。现有 `it.each([…,400,…])` 测试用**纯 JSON** fixture，与真实 wire 形不符，故既有测试一直绿但掩盖了真 bug。

**Fix（implemented, 最小, source-faithful）**：adapter.ts 加 `parseErrorBody(text)` helper——先试纯 JSON（404 body 是纯 JSON `{"error":{code,message,type}}`），失败则 `parseSse` drain 取首个非空 `data:` payload 再 JSON.parse（4xx SSE 框架 body）。**不靠 content-type 判别**（AGA 把 SSE 错误体标 `application/json`，content-type 会误导）。复用既有 `parseSse` + `httpErrorCode` + `requestIdOf`，DRY。`!response.ok` 路径改用 `parseErrorBody(await response.text())` 替 `response.json()`。加 7 个测试（2 集成 + 5 单元，mirror rbi `TestMalformedPayload` 防御覆盖）。

**2xx 路径不动**：200+error-body 既未实证，translate.ts 无需加 `chunk.code` 防御检测（task case 4）。RBI 的防御性 `test_200_with_error_body` 是对一个**未实证形状**的兜底；harness 不跟注（source-faithful 优先于防御 speculative 形状）——若将来 live 实证 200+error-body，再单开 ticket 加 translate.ts 防御。

## 1. 探针实证（primary source）

5 个请求，预发 AGA 网关 `https://pre-aga-ai-gateway.alibaba-inc.com/api/v1/services/aigc/text-generation/generation`，2026-08-20，key 经 credentials seam 文件（len=16，不进 env/不打印/不入库）。探针脚本 `/tmp/probe-p2b.mjs`（throwaway，mirror T2 `/tmp/probe-aga-embeddings.mjs` + P2 `/tmp/probe-dashscope.mjs`，每请求 15s 超时，绝不打印 key、redact `Bearer` 回显）。原始输出见会话探针结果。

### 1.1 C1 chat pong（控制：key 有效 + AGA 可达 + native chat 通）
- `model:"qwen-flash"`, `max_tokens:16`，问 "reply with the single word: pong"。
- **200**，`content-type: text/event-stream`，442ms。body 是标准 SSE（`id:1\nevent:result\n:HTTP_STATUS/200\ndata:{output:{choices:[{finish_reason, message}]}, usage, request_id}`），content=`"pong"`，`request_id` 在体顶层。
- → key 有效、AGA 可达、native chat 协议通（控制组通过：4xx 的非鉴权/非不可达）。

### 1.2 P1 坏 model id（`bad-model-p2b`）
- **404 Not Found**，`content-type: application/json`，54ms。body **纯 JSON**（非 SSE）：`{"error":{"message":"model 'bad-model-p2b' not found or no enabled endpoints","type":"invalid_request_error","code":"model_not_found"}}`。
- → **404 错误体是纯 JSON**，`code`/`message` 嵌在 `error.{}` 下，**无 `request_id`**（体里无、头里也无）。与 P2 wire note §1 的「`request_id` 在错误体」**不完全一致**——P2 note 说的是 200 成功体的 `request_id`；404 这条 wire 上 AGA 不回 `request_id`。
- → 现有 adapter `response.json()` 能 parse（纯 JSON），`parsed.error?.message` 取到真实 message，`httpErrorCode(404, parsed)`=`MODEL_NOT_AVAILABLE`，`requestIdOf(parsed)`=`undefined`（body 无 request_id）。**此 case 现有 adapter 处理正确**，无需 fix。

### 1.3 P2 坏参数（`max_tokens: -1`）⚠ 真实 wire 形
- `model:"qwen-flash"`, `parameters.max_tokens: -1`。
- **400 Bad Request**，`content-type: application/json`（！），176ms。body **SSE 框架的**：
  ```
  id:1
  event:error
  :HTTP_STATUS/400
  data:{"code":"InvalidParameter","message":"<400> InternalError.Algo.InvalidParameter: Range of max_tokens should be [1, 32768]","request_id":"f19efcde-711c-9eff-af2f-e6a09d189750"}
  ```
- → **400 错误体是 SSE 框架的**（`event:error` + `:HTTP_STATUS/400` comment + `data:` JSON），但**标 `application/json`**（content-type 与 body 实形不符——AGA 把 SSE 错误体误标 JSON）。`code`/`message`/`request_id` 在 `data:` payload 的**顶层**（非嵌 `error`）。
- → 现有 adapter `response.json()` 在 SSE 框架上**抛 SyntaxError**（`id:1\nevent:…` 非 JSON），catch 吞掉，`parsed`=`undefined`，message 退化为 `DashScope API error (HTTP 400)`，**真实 message + `request_id` 全丢**。`httpErrorCode(400, undefined)` 仍按 status 返 `INVALID_REQUEST`（分类对）。**此 case 是 fix 目标。**

### 1.4 P3 坏 tool schema（`parameters: "not-a-schema"`）
- `model:"qwen-plus"`, `parameters.tools[0].function.parameters: "not-a-schema"`（非 JSON Schema 对象）。
- **200**，`content-type: text/event-stream`，614ms。body 是正常 SSE，模型正常回 "Hello! How can I..."。
- → **AGA 不校验 tool schema**，坏 schema 不触发错误；模型当纯文本回（与 P2 note §1.4b「顶层 tools 被静默丢弃」同律——网关对 tools 字段宽松）。**此 case 无错误可探**，不贡献 200+error-body 实证。

### 1.5 P4 空 messages 数组（`input.messages: []`）
- `model:"qwen-flash"`, `input.messages: []`。
- **400 Bad Request**，`content-type: application/json`，108ms。body **SSE 框架的**（同 P2 形）：
  ```
  id:1
  event:error
  :HTTP_STATUS/400
  data:{"code":"InvalidParameter","message":"<400> InternalError.Algo.InvalidParameter: Role must be in [\"user\",\"assistant\",\"system\",\"function\",\"plugin\",\"tool\"] and the role in last message must be in [\"user\",\"function\",\"tool\"]","request_id":"19971784-0255-92da-b334-f43a11a3fe9e"}
  ```
- → 与 P2 同形：400 + SSE 框架 body + 标 `application/json` + `code`/`message`/`request_id` 在 `data:` payload 顶层。

### 1.6 4xx 错误体形总释读
- **404**：纯 JSON `{"error":{code,message,type}}`，**无 `request_id`**。content-type `application/json` 与 body 实形**一致**。
- **400**：SSE 框架 `id:1\nevent:error\n:HTTP_STATUS/400\ndata:{code,message,request_id}`，**有 `request_id`**（顶层）。content-type `application/json` 与 body 实形**不符**（实为 SSE）。
- → **content-type 不是可靠判别器**（404 和 400 都标 `application/json`，但 404 是纯 JSON、400 是 SSE 框架）。fix 必须 content-type-agnostic：先试 JSON、失败再 SSE-drain。
- → **200+error-body 不真**：4 个错误触发 case 全返 4xx（404/400），无一返 200+error-body。P2b 假设证伪。

## 2. 对 P2b ticket 假设的判定

| 项 | P2b 假设 / RBI 防御 | 本探针（本文） |
|---|---|---|
| AGA 返 200+error-body？ | 「若真则 STREAM_CLOSED 误分类」（ticket）；rbi `test_200_with_error_body` 防御覆盖 | **live-probe 证伪**：4 个错误 case 全 4xx，无一 200+error-body |
| 4xx 错误体形 | （ticket 未问，只问 200+error-body） | **live-probe 实证**：400 是 SSE 框架（`event:error` + `:HTTP_STATUS/400` + `data:` JSON），404 是纯 JSON `{"error":{}}`；content-type 都标 `application/json` |
| 4xx 错误体解析 | 现有 adapter `response.json()` | **真 bug**：在 SSE 框架上抛 SyntaxError，catch 吞，message 退化、`request_id` 丢（分类仍对，按 status） |
| `request_id` 位置 | P2 note §1「在错误体」 | 400 有（`data:` payload 顶层）；404 **无**（body 无、头无）——P2 note 的「在错误体」仅适用于 200 成功体与 400 错误体，不适用 404 |

**判定**：P2b 原假设（200+error-body → STREAM_CLOSED 误分类）**不真**，task case 4 适用（document 现状 + 无需 fix 2xx 路径）。但探针在同源 `!response.ok` 路径捞出 **4xx SSE 框架错误体 mis-parse** 真 bug（task case 2 的 spirit：error-body handling 须正确），实施最小 fix（见 §3）。

## 3. Fix design（implemented）

**位置**：`packages/llm/llm-dashscope/src/adapter.ts`（`!response.ok` 路径 + 新 `parseErrorBody` helper）。**不碰** translate.ts / sse.ts / types.ts / serialize.ts（2xx 路径无需动——200+error-body 未实证）。

**设计**：source-faithful 优先于防御 speculative 形状。mirror rbi `_malformed_payload_error`/`extract_gateway_error` 的「先取体、再按 code/message 分类」思路，但落点是 `!response.ok`（rbi 落 `_first_choice` 是因为 rbi 只非流式 `chat()`、无 SSE 路径；harness 恒流式，错误体在 `!response.ok` 已分流）。

### 3.1 `parseErrorBody(text)` helper（adapter.ts，exported for unit test）
```ts
/** Wrap a decoded error-body string as a single-chunk UTF-8 stream for parseSse. */
function bodyAsStream(text: string): ReadableStream<BufferSource> {
  const encoded = new TextEncoder().encode(text)
  return new ReadableStream({
    start(controller) { controller.enqueue(encoded); controller.close() },
  })
}

export async function parseErrorBody(text: string): Promise<WireChunk | undefined> {
  if (text.length === 0) return undefined
  try {
    return JSON.parse(text) as WireChunk            // 404 body: 纯 JSON {"error":{code,message,type}}
  } catch {
    // 400 body: SSE 框架。content-type 不判别（AGA 把 SSE 错误体标 application/json，会误导）。
  }
  for await (const data of parseSse(bodyAsStream(text))) {   // 复用既有 sse.ts
    try { return JSON.parse(data) as WireChunk } catch { continue }
  }
  return undefined                                  // 无可恢复 JSON（如 HTML 502 页）
}
```

- **content-type-agnostic**：先试 JSON，失败再 SSE-drain。这是对探针 §1.6「404 纯 JSON、400 SSE 框架，但都标 `application/json`」的直接响应。
- **DRY**：复用 `parseSse`（sse.ts），不重写 SSE 解析；复用 `httpErrorCode` + `requestIdOf`（既有）。
- **fallback 安全**：无可恢复 JSON → `undefined`，`httpErrorCode(status, undefined)` 仍按 status 分类（404→MODEL_NOT_AVAILABLE、400→INVALID_REQUEST、5xx→SERVER），message 退化通用，request_id 缺。与 fix 前行为一致，不回归。

### 3.2 `!response.ok` 路径替换（adapter.ts）
```ts
// before:
parsed = await response.json() as WireChunk
const text = parsed.message ?? parsed.error?.message
// after:
parsed = await parseErrorBody(await response.text())
const text = parsed?.message ?? parsed?.error?.message
```
- `response.text()` 替 `response.json()`：拿原文，交 `parseErrorBody` 判别。body 只消费一次（2xx 路径不进此分支，互斥）。
- `parsed?.message ?? parsed?.error?.message`：`parsed` 现在可能 `undefined`（`parseErrorBody` 返 `WireChunk | undefined`），加可选链。
- `requestIdOf(parsed)` 与 `httpErrorCode(response.status, parsed)`：`parsed` 是 `undefined` 时 ternary 跳过 / 传 undefined（`httpErrorCode` 的 `error?: WireChunk` 可选参）。行为：404 纯 JSON→`requestIdOf` 取 `parsed.error?.request_id`（无，返 undefined）；400 SSE→`requestIdOf` 取 `parsed.request_id`（有，恢复）。

### 3.3 测试（adapter.spec.ts，+8）
- **集成 2**：
  - `recovers code/message/request_id from an SSE-framed 4xx error body (live AGA wire shape)`：构造 400 SSE 框架 body（mirror 探针 P2 实形），断言 `failure: {code:'INVALID_REQUEST', status:400, message:'Range of max_tokens should be [1, 32768]', requestId:'req-400-sse'}`——**钉 request_id 恢复**（fix 前此值丢失）。
  - `parses a nested-error 404 body (live AGA wire shape: error.{code,message,type}, no request_id)`：构造 404 纯 JSON `{"error":{code,message,type}}`（mirror 探针 P1 实形），断言 `MODEL_NOT_AVAILABLE` + 真实 message + `requestId` undefined（body 无 request_id，非 bug）。
- **单元 5**（`describe('parseErrorBody (non-2xx error-body recovery)')`）：纯 JSON 404 / 顶层 JSON / SSE 框架 400 / 空 body / HTML 502 无 `data:` / 非 JSON `data:` payload——mirror rbi `TestMalformedPayload` 防御覆盖。
- **guard 更新 1**：`keeps wire helpers off the package root` 加 `parseErrorBody` 到 helper 列表（与 `httpErrorCode` 同律，不 re-export 自 index.ts）。

### 3.4 不动 2xx 路径 / translate.ts 的理由
- 200+error-body **未实证**（4 个错误 case 全 4xx）。task case 4 明确：「若 200+error-body 不真（非 2xx）：document 现状 + 无需 fix」。translate.ts 加 `chunk.code` 防御检测属 speculative（source-faithful 优先于防御未实证形状）。
- RBI `test_200_with_error_body` 是**防御性 fixture**（其注释「有网关用『200 + 错误体』表达失败」是对一种**可能**形状的兜底，非 AGA 实证）。harness 不跟注——若将来 live 实证 200+error-body（如 quota/content-filter 未探 case），再单开 ticket 加 translate.ts 防御（`chunk.code` && 无 `output.choices` → 抛 LlmError 带 `httpErrorCode` 分类）。现 `WireChunk` 类型已含 `code`/`message`/`error` 字段（types.ts 注释「Error body fields (HTTP non-2xx, or '200 + error body' failures)」），类型层已留口，逻辑层不跟。

## 4. 验证（本地）

- `pnpm vitest run packages/llm/llm-dashscope`：**4 文件 72 测试全绿**（adapter.spec.ts 27→35，+8；sse 6 / translate 11 / serialize 20 不变）。
- `npx tsc -b packages/llm/llm-dashscope/tsconfig.json`：**exit 0**（src 类型净）。
- `pnpm vitest run --typecheck packages/llm/llm-dashscope`：**72 测试全绿 + 类型净**（tests 类型净）。
- `npx oxlint packages/llm/llm-dashscope/src/adapter.ts packages/llm/llm-dashscope/tests/adapter.spec.ts`：**0 warnings 0 errors**。

## 5. 来源（Sources）

- **primary**：会话内 live 探针 `/tmp/probe-p2b.mjs` 输出（2026-08-20，预发 AGA 网关，5 请求；key 经 `~/.dsh/.credentials.yaml` credentials seam 文件、不入库/不进 env/不打印）。〔本文 §1 引用其原始输出〕
- `wayfinder/data-agent/research/p2-dashscope-wire.md`（AGA native 协议实证 + §5.5 note 结构模板 + `request_id` 在体 + error body `code`/`message`/`request_id` 形）。
- `wayfinder/data-agent/research/t2-aga-embeddings-probe.md`（探针法模板——key 经 seam、/tmp throwaway、绝不打印；chat pong 控制证 key/AGA 可达）。
- `packages/llm/llm-dashscope/src/{adapter,translate,sse,types}.ts`（既有实现：`!response.ok` 调 `response.json()`、`httpErrorCode`/`requestIdOf`、`WireChunk` 已含 `code`/`message`/`error` 字段、`parseSse` 可复用）。
- `packages/llm/llm-dashscope/tests/{adapter,translate,sse}.spec.ts` + `mock-server.ts`（既有测试 + mock `http-error` behavior 支持任意 status+body+contentType）。
- reverse-bi `libs/rbi-llm/src/rbi_llm/providers/dashscope.py`（`_malformed_payload_error`/`extract_gateway_error`/`classify_by_code` 的「先取体、再按 code 分类」思路）。
- reverse-bi `libs/rbi-llm/tests/test_dashscope_errors.py`（`TestMalformedPayload` 防御覆盖模板——`test_200_with_error_body_classified_by_code` 是防御性 fixture，非 AGA 实证）。
- `packages/llm/llm/src/error.ts`（`isQuotaExceededError`/`isContextWindowExceededError` regex 确认 fixture `code:"InvalidParameter"`/`message:"Range of max_tokens..."` 不误匹配 quota/context-window）。
