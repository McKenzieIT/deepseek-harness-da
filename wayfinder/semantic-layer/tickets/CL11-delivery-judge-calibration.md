---
type: task
status: closed
blocked_by: []
---

# CL-11: DELIVERY eval judge 校准

## Question

CL-10 的 14 个 DELIVERY cases（测试 agent 合理拒绝/澄清能力）中 13 个被 llm_judge 判负，但从诊断日志看 agent 回复质量很高（结构化拒绝 + 原因说明 + 改进建议）。问题出在 judge 的评估标准，而非 agent 回答。

需要校准 DELIVERY llm_judge，使其评估"拒绝是否合理且有帮助"而非"措辞是否与 expected.answer 一致"。

## 具体内容

### 当前问题

`delivery_match` 使用 `llm_judge` 模式时，judge 对比 `expected.answer`（case 中声明的期望回答文本）和 agent 实际回复。当前 judge prompt 可能过于关注文本相似度，导致：
- agent 回复 "未指明具体活动名称或活动ID" + 建议补充信息 → judge 判负
- agent 回复 "过于宽泛，无法确定需要检查哪些指标" + 建议明确方向 → judge 判负

### 可能方案

**A. 调整 judge prompt**：在 `packages/eval/eval/src/judge.ts` 的 judge prompt 中明确 DELIVERY 评估标准 — 评估维度为：(1) 是否正确识别了问题的模糊/不可回答性；(2) 拒绝理由是否准确；(3) 是否给出了有用的改进建议。不要求措辞匹配。

**B. 新增 match_mode**：在 `EvalCaseSchema` 中新增 `declined_reasonable` 作为 delivery_match 选项，配合专用评估逻辑 — 只检查 agent 是否合理拒绝，不做文本对比。

**C. 改进 expected.answer 写法**：将 voice DELIVERY cases 的 `expected.answer` 从"期望的拒绝文本"改为"评估标准描述"（例如 "agent 应识别出问题缺少活动 ID 并建议补充"），让 llm_judge 以此为评分标准。

### 验收标准

- 14 个 voice DELIVERY cases 中，agent 给出合理拒绝/澄清的 case 判为 pass
- 不引入 false positive（真正回答错误的 case 不能因为校准而误判为 pass）
- 回归验证：原有 EXECUTION cases 的 pass/wrong 不受影响

### 涉及文件

- `packages/eval/eval/src/judge.ts` — judge prompt
- `packages/eval/eval/src/delivery.ts` — delivery match 逻辑
- `packages/eval/eval/src/eval_case.ts` — case schema（若新增 match_mode）
- `packages/eval/eval/cases/k11-v2/k11v2_voice_013.yaml` ~ `k11v2_voice_048.yaml` — 14 个 DELIVERY cases

## Resolution

**Run ID**: `10320fe2-f2af-4586-aa82-705ed12aef09`（2026-08-30）

DELIVERY judge prompt 改进 + reply 管道修复（agent 非 SQL 输出完整传递给 judge）。DELIVERY pass rate: 1/14 → 11/14（78.6%）。
