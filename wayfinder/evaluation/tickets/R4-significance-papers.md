# R4 — Estimand、cluster bootstrap 与重复可靠性论文认读

**Type**: research  ·  **Status**: **resolved**（2026-10-06）
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: 无
**Blocks**: G4-significance-contract；[R22 — Consistency at k](R22-consistency-at-k.md)
**Mode**: AFK
**Branch**: `research/R4-significance-papers`
**Scout**: [`../research/g10-2026-followup-papers.md`](../research/g10-2026-followup-papers.md)

## Question

当一个 case 含多次 attempt、多个 rubric dimension、多个 judge 与位置交换时，正确的 estimand、aggregation level、sampling unit、cluster unit、abstention policy 和 CI 应如何定义？标准 `pass@n`、strict `pass^k` 与 retry-free stability 应如何共同报告？

## 新增一手来源

- Agreement Metrics for LLM-as-Judge Evaluation (`2606.00093`)
- Accuracy, Stability, and Repeated-Run Reliability (`2606.00920`)
- Efficient Evaluation of LLM Performance with Statistical Guarantees (`2601.20251`)
- Benchmark² (`2601.03986`)

## 产出

`../research/significance-estimand-papers.md`，给 G4/compare.ts 输出显式统计协议。

---

## Answer（resolved 2026-10-06）

**产物**：[`../research/significance-estimand-papers.md`](../research/significance-estimand-papers.md)（9 节，核心是 §7.3 的 `compare.ts` 字段契约）。**97 条引文，由本 session orchestrator 以独立脚本机械回核 97/97 通过**。

> **⚠ 本票含一条由 orchestrator 推翻的 subagent 断言**，已在产物内就地更正并留痕（见下第 5 条）。**认读结论不等于已核结论**——这是本 effort 第 4 次在「全称否定」类命题上踩同一个坑。

### 1. McNemar 存活——但只能作用在 case 级折叠后的二值量上

`2606.00920` §3.5 逐字做的就是这件事：「exact McNemar tests on **the binary indicator of whether all R = 5 runs pass**」。**clustering 不是被忽略，是被折叠消解了。** 裁决：

| 对什么做 McNemar | 可否 |
|---|---|
| **E2（per-case strict `pass^k`）/ E3（per-case any-pass）的配对指示量** | ✅ 文献现成做法 |
| **E1（per-attempt）/ E5（criterion 级 7475 条）的配对指示量** | ❌ 簇内相关为正时低报不确定性 |
| E4（AV，连续量） | ❌ 该走非参 bootstrap |

⇒ map 方向 4 的 McNemar 框架**可救**；要改的是**单位**与 MDE 算术，不是检验本身。

### 2. 更根本的一刀：本仓的「95% CI」在声明抽样模型之前没有定义

`2601.20251` 把评测铸成**有限总体**推断：label「fixed-but-unknown」，覆盖率是对**抽哪些题**取的，并明说 curated suite「need not represent a superpopulation」。**本仓一次 run 跑满全部 168 case（`n_b = N_q`，即普查）⇒ 其 CI 退化为一点**；FAQ/PAI 是省预算工具，不是本仓 CI 的来源。
`2606.00093` 独立给出同一条界：任何 bootstrap 区间「additionally require a sampling model … and **vacuous for a deterministic judge scored once on a fixed evaluation set**」。

⇒ **G4 契约的第一个强制字段是 `sampling_model`**（`finite_census` 无 CI / `item_superpopulation` / `rerun_stochasticity`）。两个合法来源给出**不同的数**，且不可互替：`CI-case` 只能作条件性陈述并强制标注 caveat，`CI-rerun` 才是本仓**无条件**有定义的那一个。

### 3. 本仓自有证据：扁平重采样把 CI 压窄 1.8 倍

在本仓 1495 次判官调用 × 5 个二值准则 = **7475 条 criterion decision** 上实测（固定种子，B=3000，零 LLM 调用）：

| 重采样单位 | 95% 半宽 | design effect | ESS |
|---|---|---|---|
| 扁平 decision（7475） | **0.66pp** | 1.00× | 7475 |
| **case 级 cluster（1215）** | **1.19pp** | **3.27×** | **2286** |

隐含 ICC ≈ 0.51；1495 次调用里 **1247 次（83.4%）输出完全相同的全 1 模式**。⇒ 任何扁平区间在本仓**低报宽度 ~1.8 倍、高报有效样本 ~3.3 倍**。产物 §3.4 给出可直接实现的 case 级 cluster bootstrap（含配对变体、undefined replicate 必报、B=10000）。

### 4. 三项结构性修正（都与票面假设相反）

- **判官×位置不是 crossed factor——它们在 eval 判分路径上不存在**。单判官（`SqlJudgeVerdict` 无 judge id），`swap` 只命中两个测试文件。⇒ **cluster 模型是三层嵌套，不是嵌套+交叉**，协议显著变简单；且**位置偏置不能被当作本仓 eval 数字的误差来源**。
- **judge-only run 对 EXECUTION estimand 的 γ = 0** ⇒ 代入 Manski 界得 `A_full ∈ [0,1]`，**界是空的**。这给 `compare.ts` 既有的执行模式拒渲染一个**形式化统计证明**，而非工程直觉。
- **T1 的五值 `execution_outcome` 在落盘物里出现 0 次**（orchestrator 独立复核：含 `execution_outcome` 的文件 **0** 个 vs 含 `execution_match` 的 **132** 个）。⇒ 历史 artifact 全是旧 boolean schema，§6 的 γ 与 identification 界**现在算不出来**。

### 5. ❌ 一条 subagent 断言被 orchestrator 推翻（留痕）

初稿曾断言「`GA-EVAL-EXPAND-case-set-power.md` **文件不存在**」且「`n_d≥85` 把方向搞反了」。**两者都不成立**：

- 该文件**存在**（`wayfinder/data-agent/tickets/phase-misc/GA-EVAL-EXPAND-case-set-power.md`，14,259 bytes，2026-09-08），map:68 链接**有效**；初稿的 `grep` 范围漏了 `wayfinder/data-agent/`，**是检索范围错误，不是缺件**。
- 原始推导就在里面，且**比初稿假设的更正确**：`:26` 标题即「关键认识：功效变量是 n_d，不是 N」；`:41-46` 指出固定 n_d 下放大 N 只会让「pp 数字好看 6 倍，真实判别力一点没变」；`:48` **明确拒绝**靠筛 case 抬 n_d（称「作弊 eval」）；`:50-52` 的达成路径是**在实测 r=23.8% 下扩到 N≈360 自然得到 n_d≈85**，而非在 N=168 上要求 n_d=85。

**⇒ 成立的结论收窄为一条文档缺陷**：map 第 68 行把「扩充后 regime 的 n_d 目标」与「n=168 regime 的 MDE 区间」压进同一格，读者无法分辨。**本票的交付因此是文档修复，不是统计修复**；§4.4 的 MDE 表（n_d=85 @ N=168 ⇒ 16.3pp；n_d≈10–37 @ N=168 ⇒ 5.0–9.9pp）仍然成立且有用，它正是**两个 regime 不能并列**的算术证明。map:68 已按此拆开重写。

### 6. 交付：`compare.ts` 的强制字段契约

产物 §7.3 给出 22 行字段表，标 **M（缺则拒渲染）/ O**，每行附一手依据。承重项：`estimand_id`、`aggregation_level`、`resampling_unit`（必须与聚合层级逐层匹配否则拒渲染）、`sampling_model`、`n_total/n_in_population/n_attributable`、`gamma`、**三个排除率分别报**、`identification_interval`（标签必须写「identification, not CI」）、`ci_95`、`n_d` + `n_d_split`、`mcnemar_p`、`mde_80`、`paired_case_set_identical`、以及 k≥2 时的 `attempt_vector` 与 `rlpr/psr/pass_at_k/av` **四者同时输出**。

**现状对账**：`grep -c "McNemar|confidence|bootstrap|n_d|ci_low|mde|power"` = **0**，显著性层完全不存在；`compare.ts:364` 把 `unjudged`/`infra_failure`/`case_defect` **合成一个 `excluded` 桶**，于是「界要加宽」与「N 要缩小」两种完全不同的统计后果在输出里不可区分；`compare.ts:473` 对只存在于一臂的 case 静默 `continue`，使配对集完整性不可核。清单 11 条中**违反 5 项**。
另：**`declined` 是分母里的死分支**（被 `computeSummary` 与 `compare.ts` 计入 attributable，但 `passKVerdict` 永不返回它）—— G4 须裁去留。

### 解锁

- **[R22 — Consistency at k](R22-consistency-at-k.md)** —— 统计量与样本量已给具体数（估 flaky 占比 ±5% 需 N≈246–385；k 建议 ≥5）。**但 R22 不能回溯现有 artifact**：84 个 run 里仅 7 个有 k≥2，唯一的 168-case k=3 run 是退化的（168/168 全 `generated_sql: null`，且无 `config` ⇒ 已不可渲染）。⇒ **R22 必须自产语料。** 另记一处**命名冲突须在 R22 SPEC 裁掉**：map 方向 6 的 `consistency@k`（扰动变体间）与 R22 的（同条件重跑间）是两个 estimand，建议分名 `perturbation_consistency@k` / `rerun_consistency@k`。
- **G4-significance-contract** —— §7.3 契约 + §6 的五值 outcome 分流规则（`case-defect` 退出 **population**、`environment-blocked`/`not-measured` 走 exclusion 并适用 Manski 界）直接作为题面。

### 本票未回答

11 项列于产物 §9。要点：`2601.20251` 的 `σ̂²` 闭式与 Assumptions A.1–A.3 未读（故不对其有限样本行为作断言）；4 条已读到但未入 manifest 的引文标「待核」；**本仓 1495 条判决没有配对人工标注**，故 `2606.00093` 清单第 3/4 项在本仓**无法计算**——这是**语料缺陷**而非报告缺陷，归 R14/R20。
