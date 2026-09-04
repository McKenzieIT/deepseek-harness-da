# GA-EVAL-EXPAND — 扩充 eval 集以获得可用统计功效

**Type**: task  ·  **Phase**: misc  ·  **Status**: Open
**Source**: [GA-MODEL1 功效分析](../../research/model1-baseline-analysis.md)（2026-09-03）· Kind 1 grilling session
**Blocked by**: 无（但排在 GA-GT3 数据丢失修复之后）
**Blocks**: [GA-EXP5](GA-EXP5-language-correlation.md)
**先例**: [P11e](../phase-4/P11e-eval-case-set-v2-realistic.md)（realistic case set 方法论，resolved 2026-08-26）
**关联**: [GA-EVAL-CLEAN-RERUN](GA-EVAL-CLEAN-RERUN-uniform-clean-and-executor-baseline.md)（Phase 2 实证 executor 在 k11-v2 上不可行——本票承接该缺口）· [GA-EVAL-REBASELINE](GA-EVAL-REBASELINE-passk-semantics.md)

> **基线现状（2026-09-04）**：pass^k 语义**已落地并提交**（`52330a98fa` / `cfbb710b50`），当前 definitive 基线 = **61.9%（104/168，`rebaseline-passk-168-clean`，conc=3）**，取代 hybrid merge 的 52.4%。本票所有功效计算基于 EXP2/EXP4 的 A-vs-B 配对不一致率（那仍是唯一可用的 discordance 来源——单臂 run 无法给出不一致对）。

---

## 背景：n=168 无法回答任何 <5.4pp 的问题

GA-MODEL1 调查中对 EXP2/EXP4 补做了配对显著性检验，发现 **EXP4 的 `-3.0%` 不显著**（McNemar p=0.332），pass^k 的 +1.2pp 也不显著（p=0.875），序数检验 p=0.749，flaky 差异 p=0.427。

**n=168 的最小可检出效应（MDE，α=.05，power=.80）≈ 5.4–10.1pp。** 要检出观测到的 1.2pp 需 N≈10,000。

EXP2/EXP3/EXP4 三张票**均只报点估计，无一做显著性检验或功效分析**——这是共同缺陷，也是本票存在的理由。

## Question

如何在**不作弊**的前提下把 eval 集扩到可用功效？

## 关键认识：功效变量是 n_d（不一致对数），不是 N

配对检验的功效**只**取决于不一致对数与其分裂比：

| 想检出的分裂比 | 需要 n_d |
|---|---|
| 60/40 | 194 |
| **65/35** | **85** |
| 70/30 | 47 |
| 75/25 | 29 |

当前 n_d：best-of-k **17**、pass^k **40**。

**加「容易」case 是稀释分母，不是增加功效**：

| N | n_d 仍=40 时的临界净差 | 看起来的 MDE |
|---|---|---|
| 168 | 13 case | 7.74pp |
| 1000 | 13 case | **1.30pp** |

pp 数字好看 6 倍，真实判别力**一点没变**。所以本票的成功标准是 **n_d ≥ 85**，**不是** N ≥ 某数。

**推论：不筛 case。** 按「丢掉稳过/稳挂的」来最大化 n_d 是**作弊 eval**——它按模型不确定性挑样本，人为压低 pass rate、偏离真实提问分布、等于反向对着测试集调优。

**而且不需要筛。** r（不一致率）是真实分布的固有属性，r=23.8% 正是在现有 168 个手写真实 case 上实测的。真实地扩到 N≈360 即自然得到 n_d≈85：

| 口径 | 达到 n_d≈85 所需 N | 倍数 |
|---|---|---|
| **pass^k（r=23.8%）** | **≈358** | 2.1× |
| best-of-k（r=10.1%） | ≈842 | 5.0× |

**目标 N≈360（+约 190 个新 case）**，按 pass^k 口径——pass^k 是 re-baseline 后的目标语义（见 [GA-EVAL-REBASELINE](GA-EVAL-REBASELINE-passk-semantics.md)）。

## 方法：沿用 P11e，不重新发明

P11e 当初解决的正是作弊问题——原 161 个 case 的问法是**表名/字段名拼接**（如 `"com gm activ昨日数据"`），本质在测 BM25 模糊匹配。它定下的**反作弊验收标准**直接沿用：

1. 每条 question 能被**非技术的游戏运营人员**理解
2. **不含表名、字段名**等技术术语作为问题主体
3. 分层配比 **L1 40% / L2 30% / L3 20% / L4 10%**
4. pass rate 落在 **50–75%** 合理区间

**佐证 P11e 的难度区间仍然有效**：现有 168 个 case 在 best-of-k 下 88.1%（超出上限），在 pass^k 下 **61.9%（`rebaseline-passk-168-clean`，正落在区间内）**。这独立支持 pass^k 是更有意义的口径，且现有 case 集难度未过时。

### 效度局限（显式记录，不含糊）

**无真实用户提问日志可用**（已确认）。P11e §3 的「从真实场景采样（如有条件）——历史 BI 查询日志 / 用户提问记录」这一条件项**从未落实，本票同样无法落实**。

因此新 case 只能 LLM 辅助生成 + P11e 标准把关。**这是本票产出的已知效度上限**：生成的问题再像业务问法，也不等于真实用户实际问过的问题。任何基于扩集的结论都应带此限定。

## 工作清单

### 0. 硬要求：expected 值必须由真实执行推导

**这是本票的第一等要求，不是可选项。** 现有 168 个 case 的 `expected.result_value` **从来不是执行出来的**：

- **0 / 168 个 case 带 `expected.sql`** —— 没有参考查询，那个数字不可能是执行产物
- **来源已不可考**：[P11e](../phase-4/P11e-eval-case-set-v2-realistic.md) 明写「**保留 covered_assets 和 expected 不变**」，只重写了问题措辞——期望值是从更早那批「表名拼接式」161 个 case 继承的
- **57 个 `scalar_exact` 里 34 个（60%）带 ≥2 个尾零**：`1500000`、`2800`、`120000`、`5200`、`8500`、`35000`、`0.15`——手挑的圆整数，真实 SUM/COUNT 不会正好落在这些值上
- [GA-EVAL-CLEAN-RERUN](GA-EVAL-CLEAN-RERUN-uniform-clean-and-executor-baseline.md) 实测：`k11v2_001` 期望 1.5M，覆盖表上 SUM = **13.6B**（差 4 个数量级）

**后果**：全部历史基线都是 **judge-only** —— EXEC case 的 `execution_match` 来自 judge 的**语义**判断，而非真实结果比对。

> **✅ judge 放过率已被测出，且触目惊心（[GA-EVAL-REAL-EXEC](GA-EVAL-REAL-EXEC-real-execution-baseline.md) resolved 2026-09-04）**：在 RBI 的 real-exec-derived case set（39 个 EXEC case）上——
> - **real-exec pass rate = 12.8%（5/39）**
> - judge ceiling（同批，execution-blind 双评）= **48.7%（19/39）**
> - **judge false-pass = 35.9pp（14/39）——judge 的通过判定里 73.7% 是假的**（语义看着对，真执行值错）
>
> 这意味着 **k11-v2 的 61.9% judge-only 基线很可能被大幅高估**（case set 不同不能直接外推，但量级警示成立）。**这是本票「expected 值必须真实执行推导」从「方法论洁癖」升级为「基线可信度问题」的决定性证据**——judge-only 不只是 upper bound，而是一个偏差可能达数十 pp 的 upper bound。
>
> 本票的「量化 judge 放过率」目标因此**已在 RBI case set 上部分达成**；本票剩余增量 = 在 k11-v3 上取得同口径数字，使其与 168-case 历史谱系可比。

**按 match_mode 的精确影响面**（勿笼统说「k11-v2 不能接 executor」）：

| match_mode | 数量 | 接 executor 后 |
|---|---|---|
| `scalar_exact` | **57（34%）** | **必然全挂**——期望值虚构，与 SQL 对错无关 |
| `row_count_range` | **86（51%）** | **大体可用**——`[1,3]`/`[5,7]`/`[25,30]` 是结构性断言，不依赖数值量级 |
| `null`（DELIVERY） | 25（15%） | 不受影响 |

**且对本票的核心目标有反作用**：配对比较中「两臂都必挂」的 case 贡献 **0 个不一致对**，所以在 k11-v2 上接 executor 会把有效样本从 168 压到约 111（86+25），**n_d 下降 → 功效下降**。这正是必须修期望值、而不是绕开 executor 的原因。

- [ ] **新 case 全部带 `expected.sql`（人工确定的参考 SQL）+ 真实执行取 expected 值**，使扩集天然可执行验证并可追溯
- [ ] **同时修复旧 57 个 `scalar_exact` 的期望值**（重新推导为真实执行结果 + 补 `expected.sql`），使 168 + 扩集**整体**可执行验证
- [ ] 修复后跑一次 `--with-query`，取得 **k11-v3 上的 judge 放过率**（与 168-case 历史谱系同口径可比；RBI case set 上已测得 35.9pp，见上）

> **⚠ 循环性风险，必须人工把关**：派生 expected 值要求先写出「正确 SQL」，而「业务问题的正确 SQL 是什么」**恰是 eval 本身要测的东西**。参考 SQL 必须由**人工**确定（这是 ground truth，合法）；**若交给 LLM 生成，会把系统当前的错误固化为「正确答案」**，eval 从此测不出那类错误。这是 57 个 case 修复工作量大的根本原因——不是机械劳动。
>
> **⚠ 与 [GA-EVAL-REAL-EXEC](GA-EVAL-REAL-EXEC-real-execution-baseline.md) 重叠**：该票 §1 的「备选」项正是本节内容，且它**因工量大而降级**（「优先 RBI eval」）。该票走的是**换 case set** 路线（RBI `eval_10000251_*` 已 real-exec-derived）——更便宜更快，但 case set 不同，无法与 k11-v2 的 61.9% 基线对比。**该票已于 2026-09-04 resolved**（走「换 case set」路线，测出 judge false-pass 35.9pp）——所以「首次拿到 judge 放过率」这一目的**已达成**。本票的剩余理由收窄为两条：① `k11-v3` 与 168-case **历史谱系的可比性**（RBI case set 无法与 61.9% 对比）；② **GA-EXP5 的功效前置**（n_d≥85）。勿重复劳动。

### 1. 生成（两阶段，但不筛 case）

- [ ] 从 321 张表 + concepts/events/domains 生成业务问法候选，覆盖现有 intent × complexity 分布
- [ ] 刻意补齐 **L4 配比**——P11e 设计 10%，现有 168 个只有 11 个 L4（6.5%），欠配
- [ ] 参考 SQL 用**模板**写（**非** LLM 生成——那会把系统当前错误固化为「正确答案」），执行后取实际结果为 expected
- [ ] `match_mode` 混用：`scalar_exact` 现在可信（有真实执行背书），`row_count_range` 仍适用于排行/分布类结构断言

### 2. 效度检验（检验生成器，不筛 case）

- [ ] 试跑一轮测量新集的 r
- [ ] **若 r 明显低于 0.238 → 生成器在造不真实的简单问题 → 修生成器重新生成**，而**不是**挑 case
- [ ] 人工抽样核对 P11e 的 4 条验收标准
- [ ] 确认最终 n_d ≥ 85

### 3. 集合分工（勿混用）

- [ ] **原 168 个保持不动**，作为**可比历史基线**——与全部历史 run 同口径，供 [GA-EVAL-REBASELINE](GA-EVAL-REBASELINE-passk-semantics.md) 用
- [ ] 扩出来的作为**高功效实验集**，供 [GA-EXP5](GA-EXP5-language-correlation.md) 用
- [ ] 两者分别报告。**不要**用 LLM 生成的 case 去改写绝对质量基线

## 成功标准

1. **n_d ≥ 85**（pass^k 口径），而非仅 N ≥ 360
2. 新集 r ≥ 0.20（接近现有 0.238；显著更低即生成器效度不足）
3. 新 case 全部通过 P11e 四条反作弊验收标准
4. **全部 case（168 修复后 + 扩集）带 `expected.sql` 且 expected 值由真实执行推导** ← 硬要求
5. **judge 放过率被量化**（首次）
6. pass rate 落在 P11e 的 50–75% 区间（pass^k 口径）
7. 效度局限（无真实提问日志）写入产出文档

## 与 GA-EVAL-REBASELINE 的集合分工（已调整）

原计划「原 168 集零改动以保历史可比性」。**本票的期望值修复与之冲突**，取舍如下：

- 修期望值会使 168 集的**绝对数字与历史 run 不可比**（61.9% 等基线是在虚构期望值下测得的）
- 但历史可比性建立在一个**已知错误的基准**上，保它意义有限
- **决定**：修复后的 168 集打新版本号（如 `k11-v3`），**保留 `k11-v2` 原样归档**供历史对照。历史基线数字继续引用 `k11-v2`，新基线在 `k11-v3` 上重建

因此本票**新增一项产出**：`k11-v3` = 修复期望值的 168 + 扩集，`k11-v2` 冻结归档。

## 备注

ODPS executor 接线为本票**前置**（修期望值需真实执行）。[GA-EVAL-CLEAN-RERUN](GA-EVAL-CLEAN-RERUN-uniform-clean-and-executor-baseline.md) 已修好 `--with-query` boot bug（`context.ts` credentials-seam 回归）并 smoke 验证真实执行通路可用（`query_result=[[26770]]`），本票可直接复用。
