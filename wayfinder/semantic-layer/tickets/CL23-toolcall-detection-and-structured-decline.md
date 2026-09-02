---
type: task
status: open
blocked_by: []
---

# CL-23: tool-call 检测 + 结构化拒绝合成（CL-19 修复落地）

## Question

CL-19 根因已定位（TOOL_CATALOG prompt 触发 LLM 发射 tool-call 文本），需实施 (a) engine 检测 + (b) reply 层合成 + looksLikeToolCall 扩展三层修复，翻转 voice_017/voice_042 DELIVERY case。

## 范围

### 1. 扩展 `looksLikeToolCall`（context.ts:72-78）

补齐 CL-19 识别的缺口格式：

```typescript
function looksLikeToolCall(text: string): boolean {
  const trimmed = text.trim()
  if (/^<(call|tool)/i.test(trimmed)) return true
  if (/^\{[\s]*"(name|tool_calls)"\s*:/i.test(trimmed)) return true
  if (/^call:/i.test(trimmed)) return true
  if (/^[a-z_]+\s*\(/i.test(trimmed) && /^\w+\s*\([\s\S]*\)\s*$/.test(trimmed)) return true
  return false
}
```

新增覆盖：`call:default_api:...`、`call:func{...}`、`{"tool_calls":[...]}`。

### 2. (a) Engine 层 tool-call 检测（engine.ts `run()`）

位置：`llm.generate()` 之后、`extractSqlCandidate` 之前。

```
gen = await this.llm.generate(...)
if (looksLikeToolCall(gen.sql)) {
  // 不进 critic/execute，直接 decline
  trace.push({ step: 'tool_call_detected', attempt, text: gen.sql.slice(0, 200) })
  // 解析 tool name + target 用于有信息量的 decline reason
  return { ok: false, decline: true, reason: `LLM 发射 tool-call 而非 SQL: ${gen.sql.slice(0, 100)}`, trace }
}
```

注意：`looksLikeToolCall` 需从 eval-cli 提取到 engine 包（或在 engine 中独立实现相同逻辑），因为 engine 不应依赖 eval-cli。

### 3. (b) Reply 层结构化拒绝合成（context.ts `respond()`）

位置：`respond()` 中处理 engine 结果的分支。

当 engine 返回 `decline: true` 且 `result.sql` 含 tool-call 文本（或 reason 含 tool-call 标记）时，用 LLM 合成结构化回复：

```typescript
if (result.decline && result.sql && looksLikeToolCall(result.sql)) {
  // 用 LLM 基于检索候选合成结构化拒绝
  reply = await this.llm.completeText([
    `用户问了"${question}"。数据 agent 无法直接回答此问题。`,
    `请基于以下候选数据源，生成一条简洁的拒绝/澄清回复：`,
    `1. 说明为什么不能直接回答`,
    `2. 说明可以提供什么（基于候选数据源的能力）`,
    `3. 建议用户如何改进提问`,
    `候选数据源：${schemaContext}`,
  ].join('\n'))
} else if (result.decline) {
  reply = `Declined: ${result.reason ?? 'unable to answer'}`
}
```

## 验收

- [ ] `looksLikeToolCall` 覆盖所有 CL-19 识别的格式（单元测试）
- [ ] engine 对 tool-call 输出返回 clean decline（非 `ok=true`）
- [ ] reply 层对 tool-call decline 合成结构化回复（非 "Declined: ..."）
- [ ] eval 验证：voice_017 翻转为 pass（DELIVERY judge 接受结构化回复）
- [ ] eval 验证：其他 case 无回归（full 168 case run + compare.ts）
- [ ] 记录到 `experiment-audit-log.md`
