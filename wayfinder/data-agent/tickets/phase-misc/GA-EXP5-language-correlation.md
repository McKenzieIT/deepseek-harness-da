# GA-EXP5 — prompt / 语义层 / conventions 三轴语言相关性实验

**Type**: experiment  ·  **Phase**: misc  ·  **Status**: Open
**Source**: Kind 1 重新评估 grilling session（2026-09-03）· 承接 [GA-GRILL2](GA-GRILL2-i18n-architecture.md) Kind 1 的**研究**诉求
**Blocked by**: [GA-EVAL-EXPAND](GA-EVAL-EXPAND-case-set-power.md)（功效前置）· ODPS executor 接线
**关联**: [GA-EXP2](GA-EXP2-prompt-language-experiment.md)、[GA-EXP3](GA-EXP3-en-prompt-degradation-root-cause.md)、[GA-EXP4](GA-EXP4-qwen37max-en-prompt-crossval.md)（三者的方法论缺陷是本票的设计前提）、[GA-EVAL-REBASELINE](GA-EVAL-REBASELINE-passk-semantics.md)、[GA-GT5](GA-GT5-domain-injection-seam.md)

---

## 背景：已测的语言变量只占模型所见中文的 0.2%

EXP2/EXP4 变的是 `prompt.ts` 的结构性指令，同时把中文语义层完全按住不动：

| 进模型的中文 | 体量（CJK） |
|---|---|
| **结构性 prompt**（`prompt.ts` 全文 782 + `conventions.ts` 结构 35） | **817** |
| conventions 内容（引擎包：`query-maxcompute/conventions.yaml` 83 + `query-postgres/src/conventions.ts` 130） | 213 |
| **语义层语料**（787 个 YAML） | **440,988** |
| ↳ 168 个 eval case 实际覆盖的子集（39 assets / 43 文件） | **34,273** |

单次 prompt 里只有召回的候选进去（in-prompt 比例低于 40×，未实测），但方向无可争辩：**已测的轴是极小一部分**。

GA-EXP3 曾把退化归因为「英文指令 + 中文动态内容的跨语言 code-switching 干扰 ~25-30%」——**该归因从头到尾没有对照组**，因为动态内容语言从未被变过。

### 三张前序票的方法论缺陷（本票必须避免）

EXP2/EXP3/EXP4 **均只报点估计，无一做显著性检验或功效分析**。补检后：

| 指标 | EXP4 (qwen3.7-max) | EXP2 (qwen-plus) |
|---|---|---|
| best-of-k pass rate | -3.0pp, **p=0.332 不显著** | -41.1pp, **p<0.001 显著** |
| pass^k pass rate | +1.2pp, **p=0.875 不显著** | -23.8pp, **p<0.001 显著** |
| attempt 级（n=504） | 73.6% vs 72.6% | 49.4% vs 14.1% |
| 序数 Wilcoxon（通过数 0-3） | **p=0.749 不显著** | **p<0.001 显著** |
| flaky case | 53 vs 46, **p=0.427 不显著** | 76 vs 47, **p=0.002 显著** |

**EXP4 的正确结论是零结果**（qwen3.7-max 上语言无可检出影响，效应 <5.4pp）——而零结果**比 `-3.0%` 更有力地支持 Kind 1 技术可行**。EXP2 的 qwen-plus 效应每个指标都显著，故「退化是 qwen-plus 能力问题」成立且强化。

## Question

结构性指令语言、语义层语言、conventions 语言三者，各自及交互对 NL2SQL 质量有多大影响？

## 实验设计：2×2×2 全因子

| 轴 | 变量 | 体量 |
|---|---|---|
| ① 指令语言 | `prompt.ts` 结构性 prompt zh/en | 782 汉字 |
| ② 语义层语言 | 候选表描述 / alt_labels / 事件定义 zh/en | 34,273 CJK |
| ③ conventions 语言 | `方言规范` 段（`conventions.ts` 结构 35 + 引擎内容 213）zh/en | 248 汉字 |

8 臂。**全因子而非部分因子**，以获得完整交互项。

**关键判别力**：只有全因子能区分「混语言本身有害」与「英文无害」——若混语言有害，则单侧英文臂都该差于双侧一致臂；若只是英文无害，八臂应接近。单跑一臂无法区分这两种解释。

### 配置

| 参数 | 值 |
|---|---|
| 模型 | aga/qwen3.7-max（[GA-MODEL1](GA-MODEL1-qwen37max-default.md) 已定） |
| case 集 | **`k11-v3`** = GA-EVAL-EXPAND 产出（修好期望值的 168 + 扩集，N≈360，n_d≥85，全部可执行验证） |
| pass@k | 3 |
| **SQL executor** | **`--with-query` 全臂开启** —— 仅在 `k11-v3` 上有效（见下） |
| 判分语义 | **pass^k 为主**（已落地为生产语义，当前基线 61.9%）；**同时报 best-of-k** 以便与 EXP2/EXP4 历史对照。两者从同一批 attempt 数据算出，无额外成本 |
| 统计 | McNemar 精确检验 + 序数 Wilcoxon + **必报 MDE** |

> **pass^k 已是生产语义**（`52330a98fa` / `cfbb710b50` 已提交），当前 168-case definitive 基线 = **61.9%**（`rebaseline-passk-168-clean`，2026-09-04）。注意 pass^k 的不一致率高于 best-of-k（23.8% vs 10.1%），**同样 MDE 需要 2 倍多样本**——「用 pass^k 测小效应」是最贵的组合，这已计入 GA-EVAL-EXPAND 的 N≈360 目标（按 pass^k 口径）。

### 为何全臂接 executor（且为何必须在修好期望值之后）

历史全部 run **未接 executor**（`query_result` 在 504/504 attempt 中为 `null`），EXEC case 的 `execution_match` 完全来自 SQL judge 的语义判断。judge 自身噪声已量化：EXP2 arm E 显示中英 judge 在 overall 上 +0.0%，但 **per-case 17.9% 不一致**——噪声比目标信号（±1~3pp）大一个数量级。真实执行把判定从「judge 认为语义对」换成「查出来的数一致」，直接消掉这层噪声。

**但 `--with-query` 不能直接跑在 k11-v2 上。** [GA-EVAL-CLEAN-RERUN](GA-EVAL-CLEAN-RERUN-uniform-clean-and-executor-baseline.md) Phase 2 实证：k11-v2 的 `expected.result_value` **不是真实执行推导的**（0/168 带 `expected.sql`；57 个 `scalar_exact` 里 34 个是手挑圆整数；`k11v2_001` 期望 1.5M vs 实际 SUM 13.6B）。接了 executor 后那 57 个 case **与 SQL 对错无关地必然全挂**，且在配对比较中贡献 **0 个不一致对** → 有效样本 168→~111，**功效反而下降**。

**因此本票的 executor 依赖 [GA-EVAL-EXPAND](GA-EVAL-EXPAND-case-set-power.md) 修好期望值**（新 case 带 `expected.sql` + 真实执行取值，旧 57 个重新推导），产出 `k11-v3`。在 `k11-v3` 上接 executor 才既严格又不损功效。

`--with-query` 的 boot bug（`context.ts` credentials-seam 回归）已由 GA-EVAL-CLEAN-RERUN 修好并 smoke 验证通路可用（`query_result=[[26770]]`），本票可直接复用。

### 修掉 EXP2/EXP4 英文臂的三个缺陷

`exp2-prompts-en.ts` 那个「全英文」臂实际带三个非语言缺陷，本票的英文臂必须全部修掉：

1. **仍输出中文 conventions 段** —— `:14` 导入并 `:35` 调用中文 `renderConventionsPrompt`
2. **重复 conventions 标题** —— `:84` 保留了 GA-GT2 已从 `prompt.ts:119` 删除的标题，导致一英一中背靠背
3. **规则 1/3 是 GT2 之前的 MaxCompute 硬编码版** —— 重新引入 `ds`/`MAX_PT`/`GET_JSON_OBJECT`/`GETDATE`，**采纳原文会回退 GA-GT2 的引擎中性**

英文 conventions 用**注入 fixture** 实现（`renderConventionsPrompt` 接受 `EngineConventions` 对象，不关心来源），**不改 `packages/query/*`**——把实验与架构决策解耦。

约 **82%** 的英文 `buildPrompt` 已存在可复用（`exp2-prompts-en.ts`，166 行 / 9132 chars），约 18% 因 GT2 而失效需重译。

### 已知不在本票范围

- **`buildEvalPrompt` 无英文版** —— 但它是**死代码**（`engine.ts:35` 只导入 `buildPrompt`，全仓引用仅 barrel + 3 个测试），删除已折进 `GA-CL-batch`
- **域身份**（persona / nlsqlOpener / expansionPrompt / fewShots）—— 归 [GA-GT5](GA-GT5-domain-injection-seam.md) `ctx.domain`
- **judge prompt 语言** —— EXP2 arm E 已测，+0.0% 且 `buildJudgePromptEN` 已存在
- **`EXPANSION_SYSTEM_PROMPT_EN` 的中文 few-shots** —— 刻意保留（BM25 目标语料是中文）。这是**全英文化并非处处可取**的直接证据

## 成本

N≈360、8 臂、全臂接 executor：

| 项 | 值 |
|---|---|
| 每臂 sum(latency) | ≈700 min（按 168→360 线性放大） |
| 每臂墙钟 @concurrency=3 | ≈3.9h |
| **8 臂总计 @concurrency=3** | **≈31h** |
| 8 臂总计 @concurrency=8 | ≈12h |
| MaxCompute 查询数 | **8 × 360 × 3 = 8,640** |

（executor 会额外增加每 attempt 延迟，上表未计。）

**并发上限注意**：GA-EVAL-CLEAN-RERUN 的教训是 conc=4 在机器负载下会触发 **AGA empty-response burst**（污染了 63/168 个 case，需重跑），最终改用 **conc=3**。所以「提并发压时间」这条路有实际上限——8 臂按 conc=3 规划，别按 conc=8。

## 成功标准

1. 8 臂全部跑完，**两种判分语义各自报告**
2. 每个主效应与交互项**必带 McNemar/Wilcoxon p 值与 MDE**——不接受只报点估计
3. 明确判定 GA-EXP3 的「跨语言干扰」归因成立或否
4. 给出 conventions 是否值得永久英文化的数据依据（当前刻意未决）
5. 若结果为零结果，**如实报告为零结果**，不再把噪声当发现

## 后续决策挂钩

- **conventions 永久英文化 / 是否要求每个新引擎适配器写英文** —— 待本票轴 ③ 结果；GA-GT2 已把 conventions 划归引擎所有，若英文化则新增贡献者义务
- **Kind 1 是否重启为实施票** —— 本票是研究票；即便结论「英文完全无害」，实施仍需独立理由（见 [GA-GRILL2](GA-GRILL2-i18n-architecture.md) 的 won't-do 记录）
