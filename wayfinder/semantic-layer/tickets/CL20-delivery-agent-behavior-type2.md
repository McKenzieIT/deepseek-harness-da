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
