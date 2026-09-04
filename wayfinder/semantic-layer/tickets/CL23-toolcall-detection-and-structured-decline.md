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

## 2026-09-04 pass^k 协议澄清（阈值**不需要**重设）

先前一度以为「pass^k 落地使全部基线失效，78%/80%/85% 阈值全须重设」。
[离线重打分](../research/passk-rescore-2026-09-03.md) + 协议核查后**更正**：

**基线不是一个数，它取决于 `passK`：**

| 协议 | 168-case 结果 | 来源 |
|---|---|---|
| **k=1**（`scripts/run-eval.sh` 的显式默认，注释写明 "baseline-matching flags: `--pass-k 1`"） | **73.8%** / 73.2% / 70.8% / 76.8% | CL-15、CL-22 全部基线 |
| k=3 + pass^k（全中才算过） | 52.4%（单个拼接 run） | `rebaseline-passk-168-merged`, `cfbb710b50` |
| k=3 + best-of-k（旧规则） | 89.3% | 同一份数据重打分 |

**关键**：pass^k 与 best-of-k 在 k=1 时**数学恒等**（26 个 k=1 run 的 delta 全为 +0.0pp）。
所以 `run-eval.sh` 今天跑出来仍是 ~73%——**CL-15 的标准基线没有失效，可复现**。
52.4% 的跌幅来自 **k 从 1 改成 3**，不是来自判定规则。

**两者测的是不同问题**：k=1 问「能不能做对」，k=3+pass^k 问「是不是**稳定**做对」。
注意 CL-22 的「≥3 run 取中位数」与 pass_k=3 **方向相反**——前者把抖动当噪声抹平，
后者把抖动当失败惩罚。二者都用「3」但含义对立，不可混用。

**结论：本票的验收阈值按 `run-eval.sh`（k=1）+ CL-22 的 ≥3 run 中位数口径，原样有效，
无需重设，也无需重跑基线。** 若将来决定把验收切到 k=3+pass^k（更严的可靠性口径），
则须整体重设阈值并重建基线——那是一次独立的口径变更决策，不在本票范围。
