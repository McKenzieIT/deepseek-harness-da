# GA-MODEL1 — qwen3.7-max 默认化：基线分析与两项前提修正

**日期**: 2026-09-03
**实施票**: [GA-MODEL1](../tickets/phase-misc/GA-MODEL1-qwen37max-default.md)
**数据**: `eval-results/exp4/exp4-arm-{a,b}.json`、`eval-results/exp2/exp2-arm-a.json`、`eval-results/1510b3e0-e9c8-4a62-b568-6535e70797be.json`
**上游**: [GA-EXP4 交叉验证](exp4-crossval-report.md)

---

## 核心结论

1. **模型选择成立**：qwen3.7-max vs qwen-plus 在同代码/同协议/同日下 **+16.1%**（72.0%→88.1%），**8 个 intent + 4 个 complexity + 4 个 category 全维度零回归**。
2. **但 GA-MODEL1 票的两项前提不成立**（详见下文）——「切默认模型」实际是「把既有事实默认显式化 + 正式否决 qwen-plus」。
3. **延迟代价 +48.9%**（mean 78.4s→116.7s/case）；**成本无法从产物计算**（结果 JSON 无 token usage）。
4. **88.1% 是 best-of-k 语义下的数字**，与 worktree 中待落地的 pass^k 改动不兼容 → 需 re-baseline（[GA-EVAL-REBASELINE](../tickets/phase-misc/GA-EVAL-REBASELINE-passk-semantics.md)）。

---

## 前提修正 ① README 的 76.8% 基线本来就是 qwen3.7-max

票上原写「当前基线 76.8% @ qwen-plus → 预期 ~88% @ qwen3.7-max」。**错误。**

README 的 76.8% 对应 run `1510b3e0`，而 [experiment-audit-log](../../semantic-layer/research/experiment-audit-log.md) 第 147 行记：

> **Model**: aga/qwen3.7-max, engine responder, pass_k=1, concurrency=4, sql-judge enabled

该 audit log 中**全部 8 处 `**Model**:` 行（行 9/82/117/147/207/257/310/453，覆盖 2026-08-30 ~ 09-02）均为 `aga/qwen3.7-max`**。

**成因**：[GA-CL8](../tickets/phase-misc/GA-CL8-eval-cli-responder-config.md) 之前 `main.ts` 的 `--provider`/`--model` 存在**静默默认 `aga`/`qwen3.7-max`**，历史 run 一律走该默认；CL8 去掉默认改为 fail-loud。**GA-EXP2 是仓库里第一次显式指定 qwen-plus 的 run。**

**推论**：`76.8% → 88.1%` 这个 delta 内**不含模型变化**，它 = 协议差异（pass@1 → pass@3 best-of-k）+ 代码差异（08-30 → 09-02，期间落 CL-18/V1/CL-17 dup 清理/GA-I18N-1~5/GA-GT1-impl）。有效的模型对比只能是 **exp4-arm-a vs exp2-arm-a**。

**推论 2**：代码层**没有「默认模型」可切**——`main.ts:225-234` 的 `resolveResponderLlmConfig` 无默认值，两个来源（`--provider`/`--model` 或 `EVAL_LLM_PROVIDER`/`EVAL_LLM_MODEL`）都缺则 throw `'eval-cli: no responder provider/model configured'`。这是 CL8 的刻意设计（防静默默认误导实验归因），**不应回退**。故 GA-MODEL1 的「配置变更」实际只剩文档工作。

## 前提修正 ② 88.1% 在当前 worktree 代码下不可复现

`packages/eval/eval-runner/src/runner.ts` 有**未提交**改动，改了判分语义：

| | 旧（EXP2/EXP4 实际跑的） | 新（当前 worktree） |
|---|---|---|
| 判分函数 | `bestOfKVerdict` — k 个 attempt **任一**过即 correct | `passKVerdict` — k 个 attempt **全部**过才 correct |
| 无 executor 且无 sqlJudge | `executionMatch = true` | `executionMatch = false` |

新代码注释自陈动机：*"An unverifiable execution must NOT count as matched — otherwise passKVerdict's all-must-pass rule would silently count it as passed, inflating the recorded pass_rate."*

**反查确认旧语义确为 best-of-k**（三 run 全部精确匹配 ANY，均不匹配 ALL）：

| run | 上报 | ANY 过 | ALL 过 | FIRST | LAST | 多数 |
|---|---|---|---|---|---|---|
| exp4-arm-a | 148 (88.1%) | **148** ✓ | 95 | 120 | 127 | 128 |
| exp4-arm-b | 143 (85.1%) | **143** ✓ | 97 | 123 | 122 | 126 |
| exp2-arm-a | 121 (72.0%) | **121** ✓ | 45 | 81 | 83 | 83 |

**在录制 attempt 数据上重放各语义**：

| 语义 | exp4-arm-a | exp4-arm-b | exp2-arm-a | 1510b3e0 |
|---|---|---|---|---|
| 录制原样（best-of-k + 旧 exec 默认） | **88.1%** | 85.1% | 72.0% | 76.8% |
| best-of-k + 新 exec 默认 | 75.0% | 72.6% | 60.7% | 66.1% |
| **pass^k + 新 exec 默认（当前 worktree）** | **47.6%** | 49.4% | 21.4% | 66.1% |

（`1510b3e0` 为 pass@1，此时 pass^k ≡ best-of-k，故仅受 exec 默认改动影响。）

**关联事实**：全部录制 run **未接 SQL executor**（`query_result` 在 504/504 attempt 中为 `null`），故 `execution_match` 完全来自 SQL judge；其中 **75 个 attempt 无 judge**（`sql_judge` absent=75，占 14.9%），旧代码将其自动判 `true`。这正是新注释所指的虚高来源。

**结论**：88.1% 有效，但**必须连同协议标注一起记录**；pass^k 落地后需整体 re-baseline。

---

## 全维度 breakdown（exp4-arm-a vs exp2-arm-a — 唯一变量是模型）

维度取自 168 个 case YAML 的 `dimensions.query_intent` / `dimensions.sql_complexity`。

### per-complexity

| complexity | N | qwen-plus | qwen3.7-max | 模型 Δ | q37max EN | EN Δ |
|---|---|---|---|---|---|---|
| L1 | 44 | 79.5% (35) | 90.9% (40) | **+11.4** | 90.9% (40) | +0.0 |
| L2 | 69 | 81.2% (56) | 88.4% (61) | **+7.2** | 89.9% (62) | +1.4 |
| L3 | 44 | 59.1% (26) | 84.1% (37) | **+25.0** | 70.5% (31) | **-13.6** |
| L4 | 11 | 36.4% (4) | 90.9% (10) | **+54.5** | 90.9% (10) | +0.0 |

### per-intent

| intent | N | qwen-plus | qwen3.7-max | 模型 Δ | q37max EN | EN Δ |
|---|---|---|---|---|---|---|
| metric_lookup | 59 | 81.4% | 89.8% | +8.5 | 86.4% | -3.4 |
| comparison | 27 | 44.4% | 81.5% | **+37.0** | 70.4% | -11.1 |
| open_ended | 26 | 69.2% | 88.5% | +19.2 | 84.6% | -3.8 |
| trend | 20 | 80.0% | 95.0% | +15.0 | 95.0% | +0.0 |
| ranking | 15 | 80.0% | 86.7% | +6.7 | 100.0% | +13.3 |
| distribution | 10 | 70.0% | 80.0% | +10.0 | 70.0% | -10.0 |
| filter | 8 | 75.0% | 87.5% | +12.5 | 87.5% | +0.0 |
| proportion | 3 | 66.7% | 100.0% | +33.3 | 100.0% | +0.0 |

### per-category（README 口径）

| category | N | qwen-plus | qwen3.7-max | 模型 Δ |
|---|---|---|---|---|
| Original | 80 | 76.3% (61) | 86.3% (69) | +10.0 |
| Alias | 40 | 67.5% (27) | 87.5% (35) | **+20.0** |
| Voice EXEC | 30 | 63.3% (19) | 93.3% (28) | **+30.0** |
| Voice DELIVERY | 18 | 77.8% (14) | 88.9% (16) | +11.1 |
| **TOTAL** | **168** | **72.0%** | **88.1%** | **+16.1** |

**零意外回归**：8 intent + 4 complexity + 4 category = 16 个切片全部提升，无一下降。最大杠杆落在 qwen-plus 原本最弱处（L4 +54.5、comparison +37.0、Voice EXEC +30.0、L3 +25.0）。

### 副产物：英文 prompt 退化的分布（对 Kind 1 的直接输入）

EXP4 报告只给了总量 -3.0%，未做维度拆解。实际**退化高度集中**：

- **L3 -13.6pp（37→31 case）是唯一显著退化点**；L1/L4 完全无退化，L2 甚至 +1.4。
- intent 侧由 **comparison -11.1** 与 **distribution -10.0** 集中承担；**ranking 反而 +13.3**。
- 即：英文 prompt 的代价集中在**中等复杂度 + 比较/分布类**查询，而非均匀铺开。

→ 供 [GA-GRILL2](../tickets/phase-misc/GA-GRILL2-i18n-architecture.md) Kind 1 scope 决策使用。

---

## 延迟

| run | model | mean | median | p90 | max | 总墙钟 |
|---|---|---|---|---|---|---|
| exp2-arm-a | qwen-plus | 78.4s | 68.9s | 125.7s | 196.2s | 219.6 min |
| exp4-arm-a | qwen3.7-max | **116.7s** | **114.5s** | 167.5s | 320.0s | **326.7 min** |
| exp4-arm-b | qwen3.7-max (EN) | 112.8s | 110.0s | 170.4s | 273.8s | 315.9 min |

mean **+48.9%**、median **+66.2%**、p90 **+33.3%**、总墙钟 **+48.8%**。concurrency=3 下跑满 168 case 从 3.7h → 5.4h。

`latency_ms` 为整 case 墙钟（含全部 pass_k attempt），非单次 LLM 调用延迟。

## 成本

- **调用量不变**：两 run attempt 数完全相同（504 vs 504，直方图均 `{"3":168}`）。`pass_k` **不短路**（成功也跑满 k 次），故 LLM 调用次数由协议固定，模型切换不改变调用量。成本差 = 纯 per-token 价差 × 相同调用量。
- **无 token 数据**：结果 JSON 无任何 usage 字段（全部嵌套对象 key 扫描无 `usage`/`tokens`/`prompt_tokens`）。**per-token 成本无法从 eval 产物推导**，需 DashScope 侧计费数据，或给 runner 增加 usage 采集。
- 并发限制：concurrency=3 下两 run 均无 infra_failure（`infra_failure=0`），未观察到限流。

**结论**：延迟 +48.9% 为已知 tradeoff，考虑 +16.1% 质量收益（且高复杂度切片 +25~55pp）在 eval 场景可接受。生产场景若对 P90 敏感需单独评估——本票不覆盖生产 SLA。

---

## 待办去向

| 事项 | 去向 |
|---|---|
| pass^k 语义落地后 re-baseline | [GA-EVAL-REBASELINE](../tickets/phase-misc/GA-EVAL-REBASELINE-passk-semantics.md) |
| runner 增加 token usage 采集（成本可观测） | 同上票 scope |
| 英文 prompt 退化的 L3/comparison 集中性 | [GA-GRILL2](../tickets/phase-misc/GA-GRILL2-i18n-architecture.md) Kind 1 |
| 生产侧 P90 延迟评估 | 未开票（生产 SLA 未定义） |
