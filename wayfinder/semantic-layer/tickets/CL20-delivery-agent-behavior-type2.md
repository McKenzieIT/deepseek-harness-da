---
type: task
status: open
blocked_by: []
---

# CL-20: DELIVERY Type-2 agent 行为（开放问题错误生成 SQL）

## Question

CL-16 部分关闭后的剩余：DELIVERY 77.8%（14/18）< 85%。剩余 DELIV-FAIL 中 **Type-2**（`075`/`079`/`voice_048` 等）：agent 对开放/主观问题（"哪些玩法需要优化"/"卡牌平衡性怎么样"/"运营数据总结一下"）**错误生成 SQL 而非拒绝+引导**。`expected.answer` 明确要拒绝+引导，agent 给 SQL → DELIVERY judge 判负。

需决策 + 实施：如何让 agent 对 open-ended L4 问题**先拒绝+引导**（而非直出 SQL）？候选：
1. **prompt**（`prompt.ts`）：generation prompt 增"open-ended/主观 → 先拒"规则；
2. **critic**（`critic.ts`）：加规则——问题 intent=open_ended 且无明确指标 → 拒绝；
3. **judge 校准**：放宽 DELIVERY judge 接受"探索性 SQL + 解释"（但会降 DELIVERY 标准，慎用）。

## 背景

- CL-16 partial（pipeline 已尽；Type-1→CL-19；Type-2 本票）。
- DELIVERY judge 已校准（接受结构化拒绝打高分），问题在 agent 不产出拒绝。
- engine 核心 git 干净；验证需 eval（`scripts/run-eval.sh`）。

## 验收

- DELIVERY ≥85%（voice DELIVERY 18 + 迁移的 original DELIVERY cases）。
- Type-2 case（075/079/voice_048 等）翻转。
- 全量 eval + compare + experiment-log。

## 关键文件

- engine prompt：`packages/data/nl2sql-engine/src/prompt.ts`
- critic：`packages/data/nl2sql-engine/src/critic.ts`
- reply 管道：`packages/eval/eval-cli/src/context.ts`
- eval wrapper：`scripts/run-eval.sh`
- 实验日志：`wayfinder/semantic-layer/research/experiment-audit-log.md`
