---
type: task
status: open
blocked_by: []
---

# CL-23: tool-call 检测 + 结构化拒绝合成（CL-19 修复落地）

**Branch**: `fix/cl23-toolcall-structured-decline`  <!-- CLAUDE.md:64 要求每票声明分支；未声明不算认领 -->

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

## 2026-09-04 更正:上一段结论错误 —— 阈值**确实**已重设(按 pass^k)

上一段(「阈值不需要重设」)**是错的,已作废**。三处事实纠正:

1. **k=1 不是标准,是偏离。** CLI 默认就是 `--pass-k 3`(`main.ts:72`,help:
   "Pass@K attempts per case [default: 3]"),`DEFAULT_PASS_K = 3`,且
   **SPEC §6.5 / D9 Q2 明确规定 pass^k、k=3**("Three is D9's number")。
   `run-eval.sh` 的 `--pass-k 1` 是为"对齐旧基线"临时加的——循环论证
   (基线是 k=1 因为 wrapper 是 k=1)。**已修复:该 flag 已移除**,恢复 k=3。
2. **切换已经发生。** 当前基线是 `rebaseline-passk-168-clean` = **61.9%**
   (pass@3 pass^k,conc=3,零污染,commit `56c74aebae`)。
   `packages/eval/eval-cli/README.md` 已声明 "pass^k semantics is LIVE",
   且**目标值已按 pass^k 重设**:Overall **60%/70%/85%**、
   Original **65%/75%/88%**(标注 proposed, pending PM sign-off),
   旧的 best-of-k 目标(75/80/90)已标 superseded。
3. **"pass^k 方差更大"的反对理由不成立(方向搞反了)。** 实测 exp4-arm-a:
   k=1 三个 attempt slot 的 pass rate 为 71.4/73.8/75.6%(极差 **4.2pp**),
   pass^k bootstrap 2000× 的 90% 区间 **5.4pp** —— **量级相当**。
   pass^k 会把 p≈0.5 的边界 case 推向稳定失败(p³≈0.125),反而更一致。

**真正的数字:每 case 通过次数分布 20/20/33/95 → 53/168 = 31.5% 的 case 不确定
(3 次里通过 1 或 2 次)。** k=1 把这 31.5% 完全藏起来,随机给它们记分,于是报
71-76%,而真正可靠通过的只有 95/168 = 56.5%。对一个用户要信任其数字的取数 agent,
"三次里对一次"比"一直错"更危险——后者可发现,前者会被当成正确答案用。

**本票验收口径:以 README 的 pass^k 目标为准**(不要另发明数字),
基线 = `rebaseline-passk-168-clean` 61.9%,并按 CL-22 的 ≥3 run 中位数执行。
`pass_k=3` 管单 run 内抖动、`≥3 run 中位数` 管 run 间抖动,二者正交可叠加。

## 2026-09-04 实施：三层已落地，**部分达成**，不闭票

**Branch**: `fix/cl23-toolcall-structured-decline`（worktree `../dsh-cl23`，commit `d934e8af60`，已 push 到 origin）

### 已完成

- **① 共享 `looksLikeToolCall`** 落在 `nl2sql-engine/src/critic.ts`（与 `extractSqlCandidate` 同处）+ 从包 index 导出；eval-cli 的重复实现已删除改为导入。放 engine 包的理由：engine 与 eval reply 层都要用，而 engine 不能依赖 eval-cli。
- **② engine 层检测**：`engine.ts run()` 在 `llm.generate()` 之后、`extractSqlCandidate` 之前拦下 → clean decline + 新增 `declineKind: 'tool_call_emitted'`。不重试（TOOL_CATALOG 是诱因，重试无用；放行会被 `nearDup.allow('')` + stand-in default-done 变成**假成功**）。
- **③ reply 层合成**：`context.ts respond()` 在 `declineKind === 'tool_call_emitted'` 时用 LLM 基于候选合成诚实回复，取代 `Declined: …` 诊断串。`schemaContext` 上提到分支之前以供合成使用。
- 验证：critic 20 tests + nl2sql-engine/eval 453 tests 全绿，`tsc -b tsconfig.host.json` exit 0。

### 实测发现一个 CL-19 未记录的格式（已修 + 已钉测试）

voice_017 attempt 2 产出 `call\n{"name": "load_event_definition", …}` —— `call` + **换行** + JSON、**无冒号**，原 `^call\s*:` 匹配不到。已加 `^call\b\s*\{`。**CL-19 的格式清单需补这一条。**

### 为什么不闭票：剩余问题不是检测，是合成回复质量

| | 修复前 | 现在 |
|---|---|---|
| tool-call 泄漏成 `generated_sql` | attempt 2 泄漏 | **无泄漏**（全 `sql=None`）✅ |
| voice_017 `delivery_match` | 1 pass / 2 fail | 1 pass / 2 fail ❌ |
| pass^k 判定 | wrong | wrong |

`expected.answer` 要求 **schema-grounded 的具体内容**：

> 当前数据资产中没有**情感分析或满意度评分字段**，无法直接评估…可以提供的是**舆情互动数据（帖子数、评论数、点赞数）**。请明确您想了解的具体互动指标。

而合成 prompt 只说「缺少可量化的指标口径」这种**泛化**表述 → 模型有时命中具体版本（pass）、有时给泛化版本（fail）→ 稳定在 1/3。

### 下一步（明确、可执行）

合成 prompt 改为**强制 grounding**，三点写死：
1. 点明缺的是**哪一类字段**（从 question 意图与候选 schema 的差集推出，如"情感分析/满意度评分"）
2. **列出候选表实际有的列/指标**（从 `schemaContext` 的 top 候选取真实列名，如 `dws_10000251_public_sentiment_df` 的帖子数/评论数/点赞数）
3. 就这些**具体列**问用户要哪个

即：从"解释为什么不能答"升级为"用候选 schema 的真实列名构造可执行的下一步"。这是 prompt 对齐工作，**不是继续加检测格式**。

### 一个口径观察（支持切 k=3）

这个 case 在 **k=1 口径下会随机显示为已修复**（1/3 概率）。只有 pass^k 才暴露「合成回复只是有时满意」。反过来印证了切 k=3+pass^k 的价值。

### 遗留

- `gh pr create` 失败：`McKenzieIT does not have the correct permissions to execute CreatePullRequest`。token 有 `repo` scope、viewerPermission=ADMIN，但仓库 `isFork: true` 而 `parent: null`（upstream 不可达）—— GitHub 侧配置问题，非代码问题。分支已 push，PR 待人工建：
  https://github.com/McKenzieIT/deepseek-harness-da/pull/new/fix/cl23-toolcall-structured-decline
- 验证 run `cl23-verify-017` / `cl23-reverify-voice_017` / `-voice_042` 均为**单 run，不可作决策依据**（CL-22 分层协议）。voice_042 亦仍 wrong。
