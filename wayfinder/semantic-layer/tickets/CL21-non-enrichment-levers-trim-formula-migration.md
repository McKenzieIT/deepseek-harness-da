---
type: task
status: open
blocked_by: []
---

# CL-21: sql-judge 78% 推进——trim/概念formula/迁移（非 enrichment）

## Question

CL-17 部分关闭后的剩余：overall 70.8% < 78%。enrichment 杠杆已尽（labels 已在，概念 case 仍拒）。真正剩余 3 杠杆（皆非 "add labels"）：

1. **trim 过度 enrich 的表**：`univ_role_tag_df` 12 alt_labels（应 ≤6 targeted；ARPU/ARPPU/流失/LTV/首充/首次充值 generic 稀释 BM25——CL-9 教训）。08-31 日志称 "trimmed to 6" 但文件实有 12-14 → 未完全落地。审计其他 over-enriched 表（08-31 涉及 6 表）。
2. **概念 formula/定义**：大R 阈值（`pay_amt_std >= X`）/回归 标识字段（`is_return`/`react`）——agent 不知用 `pay_amt_std` 定义大R（live: `voice_026`/`028` 有时发明阈值，非确定性）。需 concept YAML 加 formula 字段（可能需 CL-2 concept schema 扩展）或表 alt_label 带口径。
3. **迁移真不可答 EXEC-refusal→DELIVERY**：`018`（PVE 最终关卡）/`071`（小队）/`058`/`064`/`066`/`070`（多表/缺字段）——拒绝质量高，DELIVERY judge 可打高分（CL-12/14/15 先例）。

## 背景

- CL-17 partial（enrichment 已尽；本票接剩余 3 杠杆）。
- 概念 case（`voice_026`/`028`/`alias_022`/`038` 大R/回归）08-31 已 enrich 但仍拒 → 需 formula 非 label。
- **CL-22 已解决**：dup 清理安全（0/9 lost alias 使用回归/回流，alias_016 随机翻转）；真实基线中位数 **73.2%**（非 70.8%，后者是 3-run 异常值）；距 78% 差 **~8 cases**（非 12）。
- **多 run 基线要求**（CL-22 新规）：验收 eval 必须 ≥3 run 取中位数，单 run delta 不可决策。
- CL-22 alias trace 发现：4/9 lost alias 是"裸 CASE 表达式"（LLM 格式缺陷，非检索问题），不在本票 3 杠杆范围内。

## 验收

- overall 中位数 ≥78%（≥3 run）。
- 概念 case（大R/回归）≥2 翻转（中位数口径）。
- trim 无 BM25 稀释回归（对比 eval，中位数口径）。
- 全量 eval ≥3 run + compare + experiment-log。

## 关键文件

- 语义层：`examples/k11-semantic-layer/tables/`、`concepts/`
- concept schema（若扩 formula）：`packages/data/semantic-layer/src/`（CL-2 ConceptKindPlugin）
- eval cases：`packages/eval/eval/cases/k11-v2/`
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
