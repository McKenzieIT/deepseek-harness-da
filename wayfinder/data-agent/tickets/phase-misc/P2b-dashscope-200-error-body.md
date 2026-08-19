# P2b — llm-dashscope: confirm 200+error-body handling

**Type**: task
**Phase**: misc（low）
**Status**: Unblocked
**Assignee**: (unclaimed)
**Blocked by**: (none — P2 resolved)

**Question**: `llm-dashscope` adapter（`packages/llm/llm-dashscope/src/adapter.ts`）只在 `!response.ok` 处理错误体。若 AGA 网关返回 **HTTP 200 + 错误体**（`code`/`message`/`request_id` 在体里，非 SSE 流），`parseSse`→`translate` 找不到 `output.choices` → 抛 `STREAM_CLOSED`（误分类——应为网关错误码如 AUTH/MODEL_NOT_AVAILABLE/INVALID_REQUEST）。RBI 的 `test_200_with_error_body` 暗示这是真实行为；调用文档 §8「HTTP 状态也可能非 2xx」模糊。确认 + 若真则补处理。

**Design**:
- **确认（live-probe）**：用 key 对预发 AGA 发一个会触发错误的请求（坏 model id / 坏参数 / 坏 tool schema），观察响应是 200+error-body 还是非 2xx。key 经 env（`!` 设或文件法，不入库）。
- **若 200+error-body 为真**：adapter.ts 在 2xx 路径上加 content-type 嗅探（非 `text/event-stream` → 当错误体解析，走 `httpErrorCode` 分类 + body `request_id`）OR translate.ts 检测 `chunk.code`/`chunk.error.code`（无 `output.choices` 但有 `code` → 抛 `LlmError` 带 body code/message/request_id，复用 `httpErrorCode` 逻辑）。
- 参考：reverse-bi `libs/rbi-llm/src/rbi_llm/providers/dashscope.py` 的 `_malformed_payload_error` + `classify_by_code` + `tests/test_dashscope_errors.py` 的 `TestMalformedPayload`。

来源：code review R4；`research/p2-dashscope-wire.md` §5.5；P2 ticket Finding。
