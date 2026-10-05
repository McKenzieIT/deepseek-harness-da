# R22 — Consistency at k 与 strict reliability 实验

**Type**: research  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: [R4 — Estimand 与重复可靠性论文认读](R4-significance-papers.md)；T1-exec-grader-impl
**Mode**: ML-eval experiment（按 [playbook](../playbook.md) 走 SPEC→rubric→另一环境）
**Branch**: `research/R22-consistency-at-k`

## Question

同一 case 在固定模型、Harness、Environment、policy 与采样参数下重复运行时，standard `pass@n`、strict `pass^k`、per-case success count、variance 与 failure correlation 如何变化？单次 accuracy 是否高估 retry-free reliability，模型排名是否发生反转？

## 必须记录

- 完整 attempt vector，不只保存聚合 verdict。
- Model、prompt、Harness、adapter、environment、policy、seed 与预算。
- Standard `pass@n`、strict `pass^k`、per-attempt rate 和 confidence interval。
- Train/heldout/fresh 分层及难度分层。

每次完整运行写入 `../research/experiment-audit-log.md`。

---

## ⊕ 前置已就位（2026-10-06）：[R4](R4-significance-papers.md) resolved

**产物**：[`../research/significance-estimand-papers.md`](../research/significance-estimand-papers.md) §8（本票的统计量与样本量）。

### ⚠ 本票不能回溯现有 artifact，必须自产语料

实测 `eval-results/` 全部 84 个 run 文件：

- **仅 7 个 run 的 case 带 ≥2 个 attempt**，其余 77 个全是 k=1；
- **唯一的 168-case k=3 run 是退化的**：168/168 个 case 三次 attempt 全部 `generated_sql: null`、`correct: 0`，RLPR=PSR=AV=0，零稳定性信息；且**无 `config` 块** ⇒ 按 `checkRenderable` 本就拒渲染；
- **T1 的五值 `execution_outcome` 在落盘物里出现 0 次**（132 个文件仍是旧 boolean `execution_match`）。

### 统计量（零额外 LLM 调用，由 `S_i = Σ_r Y_{i,r}` 全部导出）

`RLPR = (1/Nk)ΣS_i`；`PSR(=本仓 pass^k) = (1/N)Σ1[S_i=k]`；`pass@k = (1/N)Σ1[S_i≥1]`；`AV = (1/N)Σ(k/(k−1))p̂_i(1−p̂_i)`；**`rerun_consistency@k = (1/N)Σ1[S_i ∈ {0,k}]`**。

### ⚠ 命名冲突须在本票 SPEC 裁掉

map 方向 11 的 `consistency@k` 指**扰动变体之间**的一致性；本票的是**同条件重跑之间**。**两个 estimand 共用一名会制造 R10 式混淆** ⇒ 建议分名 `perturbation_consistency@k` / `rerun_consistency@k`。

### 样本量与 k

估 flaky 占比到 ±5%（95%）需 **N ≈ 246–385**（视 π_f 先验 0.2–0.5）；±10% 需 N ≈ 62–97。**k 建议 ≥5**（`2606.00920` 用 R=5；AV 的 `(k/(k−1))` 偏差修正从 k=3 的 1.50 降到 1.25），且 **k 必须写进 run config**。
CI 走 **case 级 cluster bootstrap**（本仓实测 design effect **3.27×**、ICC≈0.51；扁平区间低报宽度 1.8 倍），B=10000，**undefined replicate 必报**。
