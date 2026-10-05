# R17 — Contamination audit 实验

**Type**: research  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: [R5 — 污染论文认读](R5-contamination-papers.md)；[G5 — Dynamic case pipeline](G5-dynamic-case-pipeline.md)；T1-exec-grader-impl；T5-dynamic-cases-impl；T5b-evolving-slice-impl
**Blocks**: GA-EVAL-EXPAND 的可信功效解释
**Mode**: ML-eval experiment（按 [playbook](../playbook.md) 走 SPEC→rubric→另一环境）
**Branch**: `research/R17-contamination-audit`

## Question

当前与未来的 train/heldout/fresh case 在 lexical、semantic、structural、lineage 和时间维度上存在多少污染或 benchmark-local shallow generalization？现有 detector 在目标污染比例上的统计功效是否足以支持 `not detected`，还是只能输出 `inconclusive`？

## 实验矩阵

- Exact exposure。
- Paraphrase/semantic duplicate。
- Structural transformation。
- Distillation/laundering surrogate。
- Clean matched control。
- 按相似度分桶的 performance lift。
- Detector calibration、transport gate、power 与 contamination-fraction certificate。

## 输出状态

`detected | not_detected_with_power | inconclusive`。每次完整运行按实验审计规则写入 `../research/experiment-audit-log.md`。

---

## ⊕ 前置已就位 + 输出枚举已修正（2026-10-06）：[R5](R5-contamination-papers.md) resolved

**产物**：[`../research/contamination-live-benchmark-papers.md`](../research/contamination-live-benchmark-papers.md) §3（可检测性状态机）、§6（本票的实验矩阵）。

### ⚠ 本票的输出枚举必须改为 `detected | inconclusive`

`2608.07914` eq. 7：`α_min(f, m) ≈ 2.486 / (e_f · √m)`（τ=.05、power=.80）。代入本仓实测语料（168 + 39 = **207** case）：

| 通道 | α_min @ m=207 | 达 α=10% 所需 m |
|---|---|---|
| verbatim | **0.23** | ≈ 1,126 |
| surface | **0.50** | ≈ 5,253 |
| answer-only | **> 1**（不可达） | ≈ 27,468 |

即**在 207 个 case 上连「23% 被逐字污染」都检不出**。叠加**可识别性失败**——该文明写闭源模型的匹配对照「are generally unavailable to an external auditor… so neither efficacy nor the exposed fraction is then identified」，本仓正处此状态。

⇒ **`not_detected_with_power` 这个取值无法诚实填写，从本票输出空间移除。** 每次审计须落盘 `m`、`e_f`（不可知则显式 `null`）、`α_min`。

### 两个 detector 臂已被证伪并移除

- **`2608.12652`（RSCP / Excess Separability）**：在**刻意污染的 checkpoint、exchangeability 精确成立的 split、已证记忆的模型**上，两个 duplication count **都检出 null**；placebo 自身抽样方差是 permutation null 的 1.30–1.56 倍；§10 标定是**计划而非已执行**。
- **`2604.01904`（laundering）**：estimand 是版权/MIA 而非分数虚高，需 token 级 logprob（本仓拿不到），「恢复检测」最好仅 AUC 0.766。

### 强制闸门与语义近邻的裁定

- **G-blind**：`2608.07914` 的 blind-separation gate ≡ `2608.12652` 的 Requirement E，两篇独立收敛 ⇒ **任何污染数字在过盲分离闸前不得发布**。
- **embedding 距离是召回工具，不是暴露代理**：`2602.12413` 测出非语义重复的 cosine 近邻**零 lift**；「污染率」随检索深度变（k=100 时 77.5% vs k=1 时 28.4%）。
- **本 effort 仍无可引的暴露后退化基线**；LiveClin 的 ~10pp 混合了污染 inflation 与知识过时且未过盲闸，**不得当此用**。

**⇒ 执行前须先与 [G5](G5-dynamic-case-pipeline.md) 对账语料规模**：功效在当前 207 case 上结构性不足，这是 scope 问题而非方法问题。
