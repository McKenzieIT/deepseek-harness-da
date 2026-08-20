# P2b — llm-dashscope: confirm 200+error-body handling

**Type**: task
**Phase**: misc（low）
**Status**: Resolved (2026-08-20)
**Assignee**: wayfinder-subagent 2026-08-20
**Blocked by**: (none — P2 resolved)

**Question**: `llm-dashscope` adapter（`packages/llm/llm-dashscope/src/adapter.ts`）只在 `!response.ok` 处理错误体。若 AGA 网关返回 **HTTP 200 + 错误体**（`code`/`message`/`request_id` 在体里，非 SSE 流），`parseSse`→`translate` 找不到 `output.choices` → 抛 `STREAM_CLOSED`（误分类——应为网关错误码如 AUTH/MODEL_NOT_AVAILABLE/INVALID_REQUEST）。RBI 的 `test_200_with_error_body` 暗示这是真实行为；调用文档 §8「HTTP 状态也可能非 2xx」模糊。确认 + 若真则补处理。

**Design**:
- **确认（live-probe）**：用 key 对预发 AGA 发一个会触发错误的请求（坏 model id / 坏参数 / 坏 tool schema），观察响应是 200+error-body 还是非 2xx。key 经 env（`!` 设或文件法，不入库）。
- **若 200+error-body 为真**：adapter.ts 在 2xx 路径上加 content-type 嗅探（非 `text/event-stream` → 当错误体解析，走 `httpErrorCode` 分类 + body `request_id`）OR translate.ts 检测 `chunk.code`/`chunk.error.code`（无 `output.choices` 但有 `code` → 抛 `LlmError` 带 body code/message/request_id，复用 `httpErrorCode` 逻辑）。
- 参考：reverse-bi `libs/rbi-llm/src/rbi_llm/providers/dashscope.py` 的 `_malformed_payload_error` + `classify_by_code` + `tests/test_dashscope_errors.py` 的 `TestMalformedPayload`。

来源：code review R4；`research/p2-dashscope-wire.md` §5.5；P2 ticket Finding。

## Finding

**200+error-body 假设不真**（live-probe 5 请求，2026-08-20，预发 AGA，key 经 `~/.dsh/.credentials.yaml` seam、不进 env/不打印/不入库；探针 `/tmp/probe-p2b.mjs` throwaway）：AGA 对错误请求**正确用 4xx 状态码**——坏 model id（`bad-model-p2b`）→ **404**（纯 JSON `{"error":{code,message,type}}`，无 `request_id`）；坏参数（`max_tokens:-1`）→ **400**（SSE 框架 body `id:1\nevent:error\n:HTTP_STATUS/400\ndata:{code,message,request_id}`，却标 `content-type: application/json`）；空 messages→**400**（同 SSE 框架形）；坏 tool schema→**200 正常 SSE**（网关不校验 schema）。**无一 200+error-body**。RBI `test_200_with_error_body` 是**防御性 fixture**（覆盖一种 AGA 未实测形状），非实证。task case 4 适用（2xx 路径无需 fix、translate.ts 无需加 `chunk.code` 防御）。

**但探针在同源 `!response.ok` 路径捞出真 bug**：AGA 4xx 错误体是 **SSE 框架的**（却标 `application/json`），adapter `response.json()` 在 SSE 框架上抛 SyntaxError、catch 吞掉，message 退化为通用 `DashScope API error (HTTP 400)`、body 的 `code`/`message`/`request_id` **全丢**（操作员失去进网关侧日志的唯一线索 `request_id`）。分类本身**没错**（`httpErrorCode(400, undefined)` 仍按 status 返 `INVALID_REQUEST`），但**详情与 request_id 丢失**。既有 `it.each([…,400,…])` 测试用纯 JSON fixture，与真实 wire 形不符，故一直绿但掩盖真 bug。

**Fix（implemented, 最小, source-faithful）**：adapter.ts 加 `parseErrorBody(text)` helper（先试纯 JSON——404 body 形；失败则 `parseSse` drain 取首个非空 `data:` payload 再 JSON.parse——400 SSE 框架形；**content-type-agnostic**，因 AGA 把 SSE 错误体误标 `application/json`）；`!response.ok` 路径改用 `parseErrorBody(await response.text())` 替 `response.json()`；复用既有 `parseSse`/`httpErrorCode`/`requestIdOf`，DRY；fallback 安全（无可恢复 JSON → `undefined`，按 status 分类，不回归）。**不碰** translate.ts / sse.ts / types.ts（2xx 路径无需动）。详见 `research/p2b-dashscope-200-error-body.md`。

## Assets

- `wayfinder/data-agent/research/p2b-dashscope-200-error-body.md`（cited note：TL;DR + 探针实证 5 请求 status/content-type/体形 + fix design + implemented diff + 来源）。
- `packages/llm/llm-dashscope/src/adapter.ts`（+`parseErrorBody`/`bodyAsStream` helper；`!response.ok` 路径 `response.json()`→`parseErrorBody(await response.text())`）。
- `packages/llm/llm-dashscope/tests/adapter.spec.ts`（+7 测试：2 集成 [SSE 框架 400 恢复 code/message/request_id + 嵌套 404 形] + 5 单元 `parseErrorBody`；guard 列表加 `parseErrorBody`）。
- 探针 `/tmp/probe-p2b.mjs`（throwaway，不入库/不进 git）。

## Unblocks

- P2b 闭环：200+error-body 假设证伪 + 同源 4xx SSE 框架错误体 mis-parse 真 bug 修复 + 7 测试 pin 真实 wire 形。
- 既有 `it.each` HTTP 状态映射测试现在有真实 wire 形 fixture 配对（SSE 框架 400 + 嵌套 404），不再只覆盖纯 JSON 假设形。
- 无新 ticket 毕业（fix 非平凡但落地了；2xx/translate.ts 防御**不**毕业——200+error-body 未实证，source-faithful 优先于防御 speculative 形状，若将来 live 实证再单开）。

