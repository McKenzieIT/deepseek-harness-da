# GA-MODEL1 — 切 qwen3.7-max 为默认 eval/生产模型

**Type**: task  ·  **Phase**: misc  ·  **Status**: **Resolved**（2026-09-03）
**Source**: [GA-EXP4 交叉验证](GA-EXP4-qwen37max-en-prompt-crossval.md)（2026-09-03）
**Blocked by**: 无
**Blocks**: GA-GT3（eval 基线依赖）、GA-GRILL2 Kind 1 重新评估（前提）—— 均已解除
**产出**: [基线分析](../../research/model1-baseline-analysis.md) · 新票 [GA-EVAL-REBASELINE](GA-EVAL-REBASELINE-passk-semantics.md)

---

## 背景

GA-EXP4 证明 qwen3.7-max 在所有指标上显著优于 qwen-plus：

| 指标 | qwen-plus | qwen3.7-max | 差异 |
|------|-----------|-------------|------|
| 中文 pass rate | 72.0% | 88.1% | +16.1% |
| 英文 pass rate | 31.0% | 85.1% | +54.1% |
| EN B-A delta | -41.1% | -3.0% | 退化几乎消除 |

模型升级是当前最大的质量杠杆，且是后续所有工作（GT3 eval 验证、Kind 1 i18n）的前置条件。

## Question

将 qwen3.7-max 切为默认 eval 和生产 LLM 模型，需要做哪些变更和验证？

## 工作清单

### 1. 配置变更

- [ ] eval-cli: 更新 README 中的示例命令和基线数据（当前基线 76.8% @ qwen-plus → 预期 ~88% @ qwen3.7-max）
- [ ] eval-cli: `EVAL_LLM_MODEL` 环境变量文档更新
- [ ] 生产配置（如有）：DashScope 模型路由确认 qwen3.7-max 可用性
- [ ] 确认 qwen3.7-max 的成本/延迟/并发限制是否可接受

### 2. Eval 基线验证

- [ ] 用 qwen3.7-max 跑一轮完整 eval（168 cases × pass@3）作为新基线
  - EXP4 ARM A 已有数据（88.1%），可直接复用为新基线
  - 或重跑一轮确认可复现性
- [ ] 对比 per-intent、per-complexity breakdown 确认无意外回归
- [ ] 更新 eval-cli README 基线表

### 3. 成本/延迟评估

- [ ] 对比 qwen-plus vs qwen3.7-max 的：
  - 单 case 平均延迟（EXP2 A 78s vs EXP4 A 需测量）
  - token 消耗（如 DashScope 提供 usage 数据）
  - 并发限制（当前 concurrency=3 是否仍适用）

### 4. 文档更新

- [ ] eval-cli README 基线表更新
- [ ] wayfinder map Notes 中的模型参考更新

## 成功标准

1. qwen3.7-max 成为默认 eval 模型（环境变量 / 文档 / CI 配置）
2. 新基线 pass rate 记录在 eval-cli README（预期 ~88%）
3. 成本/延迟在可接受范围内（或标注 tradeoff）
4. 不引入任何代码回归（tsc + vitest 绿）

---

## Resolution（2026-09-03）

**完整分析**: [model1-baseline-analysis.md](../../research/model1-baseline-analysis.md)

### 模型决策：采纳 qwen3.7-max，正式否决 qwen-plus

`exp4-arm-a` vs `exp2-arm-a`（同代码、同协议、同日、同 judge，唯一变量是模型）：**+16.1%**（72.0% → 88.1%）。

**16 个切片零回归**——8 intent + 4 complexity + 4 category 全部提升：

| 维度 | 最大增益 | 最小增益 |
|---|---|---|
| complexity | L4 **+54.5pp**（36.4%→90.9%）、L3 +25.0pp | L2 +7.2pp |
| intent | comparison **+37.0pp**、proportion +33.3pp | ranking +6.7pp |
| category | Voice EXEC **+30.0pp**、Alias +20.0pp | Original +10.0pp |

增益集中在 qwen-plus 原本最弱处（高复杂度 + 比较类），无一维度下降。

### 票的两项前提被修正

**① README 的 76.8% 基线本来就是 qwen3.7-max，不是 qwen-plus。**
[experiment-audit-log](../../semantic-layer/research/experiment-audit-log.md) 中全部 8 处 `**Model**:` 行（2026-08-30 ~ 09-02）均为 `aga/qwen3.7-max`。成因：[GA-CL8](GA-CL8-eval-cli-responder-config.md) 之前 `main.ts` 有静默默认 `aga`/`qwen3.7-max`，历史 run 一律走该默认；EXP2 是仓库里第一次显式指定 qwen-plus 的 run。

→ `76.8% → 88.1%` 不含模型变化，= 协议差异（pass@1 → pass@3）+ 代码差异（08-30 → 09-02）。

**② 代码层无「默认模型」可切。**
`main.ts:225-234` `resolveResponderLlmConfig` 无默认值、两来源皆缺则 fail-loud——这是 CL8 的刻意设计（防静默默认误导实验归因），**不回退**。故本票「配置变更」实际只剩文档工作，符合原意（显式化 + 否决 qwen-plus）。

### 成本 / 延迟

| | qwen-plus | qwen3.7-max | Δ |
|---|---|---|---|
| mean / case | 78.4s | 116.7s | **+48.9%** |
| median | 68.9s | 114.5s | +66.2% |
| p90 | 125.7s | 167.5s | +33.3% |
| 168 case 总墙钟 | 219.6 min | 326.7 min | +48.8% |

- **调用量不变**：两 run attempt 数完全相同（504 vs 504）。`pass_k` 不短路，调用次数由协议固定 → 成本差 = 纯 per-token 价差。
- **成本无法从产物计算**：结果 JSON 无任何 token usage 字段 → 需 DashScope 计费数据或给 runner 加 usage 采集（→ GA-EVAL-REBASELINE）。
- 两 run `infra_failure=0`，concurrency=3 未触发限流。

**结论**：+48.9% 延迟为已接受 tradeoff（换 +16.1% 质量，高复杂度切片 +25~55pp）。生产 SLA 未定义，生产侧 P90 评估不在本票范围。

### 交付物

- `packages/eval/eval-cli/README.md`：Quality Baseline 改为**协议+模型三行对照表**（并列 76.8% pass@1 / 88.1% pass@3 / 72.0% qwen-plus 已否决），显式声明 76.8→88.1 是协议差异非模型差异；per-category 表更新为 exp4-arm-a；Quality Targets 刷新 Current 列 + 标注目标值系 best-of-k 语义下设定；示例命令改为显式 `EVAL_LLM_PROVIDER`/`EVAL_LLM_MODEL` 并修正 API key 来源（credential seam 非 env）；新增 Environment 表；补 `--provider`/`--model`/`--run-id`/`--today`/`--with-query` 选项行。
- 顺手修正两处既有文档错误：Category Definitions 的 Voice EXEC/DELIVERY 计数（32/16 → 实际 30/18，CL-15 迁移后未同步）；Usage 示例的 `DASHSCOPE_API_KEY=<key>` env 前缀（实际读 `~/.dsh/.credentials.yaml`）。
- 新票 [GA-EVAL-REBASELINE](GA-EVAL-REBASELINE-passk-semantics.md)。

### 遗留风险（已开票，不阻塞本票）

`runner.ts` 有**未提交**改动把判分从 `bestOfKVerdict`（任一过）改为 `passKVerdict`（全部过），并停止把无-judge 的 attempt 自动判过。在录制数据上重放：`exp4-arm-a` 88.1% → **47.6%**。

即 88.1% 是 best-of-k 语义下的上界（该 run 未接 executor，504 attempt 中 75 个无 judge 被自动判过）。README 已标注协议与 caveat；pass^k 落地后整体 re-baseline → [GA-EVAL-REBASELINE](GA-EVAL-REBASELINE-passk-semantics.md)。

**该风险不影响模型结论**：语义变化对两臂同向作用，+16.1% 与判分语义无关。

### 未做

- 未重跑 eval（复用 EXP4 ARM A 数据作基线，符合票中「可直接复用」选项）
- 未改任何生产/CI 配置（`EVAL_LLM_MODEL` 无默认是刻意设计；仓库内无 CI eval 配置消费该变量）
- 未动 `runner.ts` 的在途改动
