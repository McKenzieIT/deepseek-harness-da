# GA-EXP2 实验报告 — Prompt 语言对 SQL 生成质量的影响

**日期**: 2026-09-02
**实验票**: [GA-EXP2](../tickets/phase-misc/GA-EXP2-prompt-language-experiment.md)
**方法论**: [exp2-methodology.md](exp2-arms/exp2-methodology.md)
**数据**: `eval-results/exp2/exp2-arm-{a,b,e}.json`

---

## 1. 实验配置

| 参数 | 值 |
|------|-----|
| 模型 | aga/qwen-plus |
| eval cases | K11-v2 全量 168 cases |
| pass@k | 3 |
| 并发 | 3 |
| SQL Judge | 启用（中文 judge for A/B，英文 judge for E） |
| 日期 | 2026-09-02 |

### 跑了 3 个 variant（原计划 5 个，C/D 延后）

| Variant | 结构性 prompt | 动态内容 | Judge | EXP2_ARM |
|---------|-------------|---------|-------|----------|
| A (baseline) | 混合（prompt.ts 中文 + phase-gate 英文） | 中文 | 中文 | unset |
| B (full-EN) | 全英文 | 中文 | 中文 | B |
| E (baseline + EN judge) | 混合（同 A） | 中文 | 英文 | E |

Variant C（full-EN + respond-in）和 D（all-EN including dynamic content）因 B 的灾难性结果而无需再跑。

## 2. 核心结果

### 2.1 Overall

| Variant | Correct | Wrong | Declined | Pass Rate |
|---------|---------|-------|----------|-----------|
| **A (baseline)** | 121 | 47 | 0 | **72.0%** |
| **B (full-EN)** | 52 | 116 | 0 | **31.0%** |
| **E (EN judge)** | 121 | 47 | 0 | **72.0%** |

**B vs A: -41.1%（灾难性退化）**
**E vs A: +0.0%（judge 语言无影响）**

### 2.2 Per-intent breakdown

| Intent | N | A (%) | B (%) | E (%) | B-A |
|--------|---|-------|-------|-------|-----|
| metric_lookup | 59 | 81.4% | 30.5% | 74.6% | **-50.8%** |
| comparison | 27 | 44.4% | 14.8% | 59.3% | -29.6% |
| open_ended | 26 | 69.2% | 38.5% | 69.2% | -30.8% |
| trend | 20 | 80.0% | 40.0% | 85.0% | -40.0% |
| ranking | 15 | 80.0% | 20.0% | 86.7% | **-60.0%** |
| distribution | 10 | 70.0% | 50.0% | 70.0% | -20.0% |
| filter | 8 | 75.0% | 12.5% | 50.0% | **-62.5%** |
| proportion | 3 | 66.7% | 100.0% | 66.7% | +33.3% |

退化在**所有 intent 类别**上普遍存在（proportion 除外，但仅 3 case 无统计意义）。最严重：filter（-62.5%）、ranking（-60.0%）、metric_lookup（-50.8%）。

### 2.3 Per-complexity breakdown

| Complexity | N | A (%) | B (%) | E (%) | B-A |
|------------|---|-------|-------|-------|-----|
| L1 | 44 | 79.5% | 36.4% | 84.1% | -43.2% |
| L2 | 69 | 81.2% | 30.4% | 79.7% | **-50.7%** |
| L3 | 44 | 59.1% | 27.3% | 54.5% | -31.8% |
| L4 | 11 | 36.4% | 27.3% | 45.5% | -9.1% |

退化在 L1-L3 上均严重（-30%~-50%）。L4 退化较小（-9.1%），但 L4 基线本身很低（36.4%）。

### 2.4 Diff case 分析

| 类别 | 数量 |
|------|------|
| A 通过、B 未通过 | 76 cases |
| B 通过、A 未通过 | 7 cases |
| **净损失** | **69 cases** |

B 相对于 A 净损失 69 个 case，且大部分集中在 metric_lookup（最大 intent 类别）和 L1/L2 简单查询。

### 2.5 Judge 语言一致性（H3 验证）

E vs A 在 overall pass_rate 上完全一致（72.0% vs 72.0%），但 per-case 判定有 30/168 cases（17.9%）不一致。这表明：
- 英文 judge 和中文 judge 在宏观层面产出相同结论
- 微观 per-case 层面存在噪声（17.9% 不一致率），但正负抵消
- **Judge 语言不是一个需要控制的混杂变量**

## 3. 假设检验

| 假设 | 结果 | 结论 |
|------|------|------|
| H1: 英文 prompt 与中文无显著差异（<3%） | **-41.1%** | **强烈否决** — 英文 prompt 导致灾难性退化 |
| H2: 混合语言不劣于纯中文 | 未直接测（A 本身是混合） | 间接支持 — A（混合）= 72%，远优于 B（全英文）= 31% |
| H3: judge 语言存在系统性偏差 | +0.0% overall，17.9% per-case 不一致 | **否决** — 无系统性偏差，仅有随机噪声 |

## 4. 与文献预期的矛盾

本实验结果与 2026 年文献预期**严重不一致**：

- **Layer Swap (arxiv 2605.26735, 2026-08)**: 报告 reasoning gap 仅 1.9-3.5%，而我们看到 -41%
- **Frontiers in Medicine (2026-08)**: 报告 "no significant language-related performance differences"，而我们看到灾难性差异
- **可能解释**：
  1. 上述研究测的是自然语言推理，不是 SQL 生成 + 工具调用的复杂 agent pipeline
  2. 我们的 prompt 不是简单指令——包含 SOP、规则集、工具目录、conventions，翻译可能丢失经过 eval 调优的微妙 prompt engineering
  3. 动态内容（候选表描述、事件定义）是中文的，英文指令 + 中文动态内容的混合可能比全中文更差
  4. 翻译质量可能是问题——语义翻译不等于 prompt-engineering-equivalent 翻译
  5. 模型（qwen-plus）可能对中文 prompt 有特定优化/预训练偏好

**此矛盾值得深入研究** → 新票 GA-EXP3

## 5. 决策

按决策矩阵：

> **B < A（中文显著更好，gap ≥ 3%）→ 保留中文（性能优先于可维护性）**

**prompt.ts 语言不改。Kind 1（prompt 模板化/英文化）的前提不成立。**

## 6. 受影响的决策

| Ticket | 影响 | 行动 |
|--------|------|------|
| **GA-GRILL2 Kind 1** | Kind 1 的前提（prompt 可安全改英文）被否决 | 关闭 Kind 1 方向；Kind 2（逻辑层去中文）不受影响（已完成 GA-I18N-1~5） |
| **GA-CL15** | eval-cli context.ts 中文扩展 prompt "引用单一源 + localize" 的动机减弱 | CL15 仍可做（消除重复），但 localize 方向不再是英文化，而是保持中文 |
| **GA-EXP2 本身** | 实验完成 | 关闭为 resolved |
| **GA-I18N-1~5** | 不受影响（已完成，Kind 2 逻辑层去中文 ≠ prompt 语言） | 无 |
| **GA-I18N-R1** | 不受影响（trend 检测 recall 提升，与 prompt 语言无关） | 无 |

## 7. 实验基础设施产出（复用价值）

本实验留下了可复用的 variant 切换基础设施：
- `Nl2sqlEngine` 的 `promptBuilder` 注入点（`engine.ts`）
- `LlmSqlSemanticJudge` 的 `buildPromptOverride` 注入点（`sql_semantic_judge.ts`）
- eval-cli 的 `EXP2_ARM` 环境变量切换机制（`context.ts`）
- 完整的英文 prompt 变体文件（`eval-cli/src/exp2-prompts-en.ts`）

这些可用于未来任何 prompt 变体实验。
