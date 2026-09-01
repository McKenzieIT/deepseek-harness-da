# GA-EXP2 — Prompt 语言实验：中文 vs 英文 vs 混合对 SQL 生成质量的影响

**Type**: experiment  ·  **Phase**: misc  ·  **Status**: Open
**Source**: [GA-GRILL2 grilling session](GA-GRILL2-i18n-architecture.md) Kind 1 讨论（2026-09-01）
**Blocked by**: 无（使用现有 K11-v2 eval 基础设施）
**关联**: GA-GRILL2（i18n 架构）、GA-GT5（domain injection seam）、GA-I18N-1~5（Kind 2 逻辑层去中文）

---

## 背景

GA-GRILL2 Kind 1（prompt 模板化）讨论中，prompt.ts 的结构性 prompt 内容（TOOL_CATALOG / SOP / 八规则 / 诚实拒绝）是否应从中文改为英文存在分歧。2026 下半年研究表明：

- **Layer Swap (arxiv 2605.26735, 2026-08)**：LLM 内部推理以英文为主，母语 prompt 的 reasoning gap 仅 1.9-3.5%（Qwen3-8B 实验）
- **Frontiers in Medicine (2026-08)**：DeepSeek-R1 英文错误率 28.6% vs 中文 32.7%（英文略优）；但 reasoning 模型整体"no significant language-related performance differences"
- **Lower-Resource (arxiv 2607.14480, 2026-07)**：LLM-as-judge 存在结构性语言偏差——同内容不同 prompt 语言评分不同

**关键不确定性**：
1. 上述研究测的是自然语言推理任务，不是 SQL 生成。SQL 是语言中立代码，prompt 语言影响可能更小
2. 生产场景是**混合语言上下文**（英文指令框架 + 中文候选表描述/事件定义/用户问题），研究中没有这种设置
3. 当前中文 prompt 经过 K11 eval 打磨，翻译后是否回归未知

**因此不做理论推断，用数据说话。**

## 假设

**H1**：英文 prompt 在 SQL 生成质量（pass_rate）上与中文 prompt 无显著差异（<3% gap），因为输出是语言中立的 SQL 代码。

**H2**：混合语言上下文（英文指令 + 中文动态内容）不劣于纯中文上下文（模型擅长跨语言理解）。

**H3**：英文 judge prompt 与中文 judge prompt 对同一 SQL 的评分存在系统性差异（Lower-Resource 论文的 agent 场景验证）。

## 实验设计

### 实验变量

**自变量：Prompt 语言方案（5 个 variant）**

| Variant | prompt.ts 语言 | 动态内容语言 | 额外指令 | 目的 |
|---------|---------------|-------------|---------|------|
| **A（baseline）** | 中文（现状） | 中文 | 无 | 对照组 |
| **B（full-EN）** | 英文（完整翻译） | 中文 | 无 | 测英文指令 + 中文动态内容（生产场景） |
| **C（full-EN + respond-in）** | 英文 | 中文 | + "Respond in the user's language" | 测 respond-in 指令是否影响 SQL 质量或附带文本语言 |
| **D（all-EN）** | 英文 | 英文（候选描述翻译） | 无 | 测纯英文上下文上限（理想场景，非生产） |
| **E（baseline + EN-judge）** | 中文（同 A） | 中文 | 无，但 judge prompt 改英文 | 隔离 judge 语言偏差（H3 验证） |

### 控制变量

- **模型**：当前 eval 使用的模型（记录具体 model id + temperature）
- **eval case set**：K11-v2 全部 168 case
- **pass@k**：与现有 eval 配置一致
- **conventions**：相同 MaxCompute conventions 注入
- **candidates / event definitions**：相同 BM25 检索结果（固定 seed 或 cache）

### 因变量（指标）

**主指标**：
- `pass_rate`：execution_match 通过率（K11-v2 168 case）

**次指标**：
- 按 `query_intent` 分组 pass_rate（trend / metric_lookup / ranking / distribution / proportion / comparison / cohort）
- 按 `sql_complexity` 分组 pass_rate（L1 / L2 / L3 / L4）
- decline_rate：模型拒答比率（英文 prompt 可能改变拒答行为）

**Judge 一致性指标（H3 专用）**：
- Variant A（中文 prompt + 中文 judge）vs Variant E（中文 prompt + 英文 judge）的 per-case 评分差异
- Cohen's κ 或 Spearman ρ 衡量两 judge 的一致性

### Variant D 的候选描述翻译

Variant D 需要将语义层 YAML 中的中文 description 翻译为英文。两种做法：
- **LLM 一次性翻译**：用 qwen-flash 批量翻译 K11 321 张表的 description（一次性成本，~$2）
- **跳过 Variant D**：如果 B 和 A 的差异已经够小，D（纯英文上限）的边际信息量低，可以省掉

**推荐**：先跑 A/B/C/E 四组，看 B vs A 的差距。如果 B vs A gap < 2%，D 的边际价值低，跳过。

## 实施步骤

### Step 1：翻译 prompt.ts

将 `buildPrompt` / `buildEvalPrompt` 中的中文结构文本翻译为英文：
- TOOL_CATALOG → 英文
- §3 SOP（阶段 A/B/C/D）→ 英文
- §5 诚实拒绝 → 英文
- §6 八规则 → 英文
- section headers（"已知 JOIN 关系"、"候选表定义"、"当前问题"等）→ 英文

翻译在独立分支，不合入 main。Variant 切换通过参数或环境变量控制。

**翻译范围注意**（grill 收尾发现的额外中文点）：
- `conventions.ts:28` 渲染段头 `'## 方言速查'`、`'## 可用函数'`、placeholder `'（无 conventions）'`
- `prompt.ts:18` `granularityTag` 返回 `' [日粒度]'`、`' [快照]'`
- `eval-cli/src/context.ts:224` + `p15-probe.ts:57` 中的中文 expansion prompt（eval 工具，非生产，跟随主决策）

### Step 2：翻译 judge prompt

将 `sql_semantic_judge.ts` 的 `buildJudgePrompt` 翻译为英文版本（Variant E 专用）。

### Step 3：跑 eval

每个 Variant 跑 K11-v2 全量 168 case。记录：
- per-case execution_match
- per-case generated_sql（用于事后分析差异 case）
- per-case decline（如果适用）

### Step 4：分析

1. **Overall pass_rate 对比**：A vs B vs C vs E
2. **Per-intent 热力图**：哪些 intent 受 prompt 语言影响最大？
3. **差异 case 分析**：B pass 但 A fail（或反过来）的 case，逐个分析原因
4. **Judge 一致性**：A vs E 的评分差异分布
5. **统计显著性**：McNemar's test（配对二元分类），p < 0.05 判显著

## 决策矩阵（实验后）

| 实验结果 | 决策 |
|----------|------|
| B ≈ A（gap < 2%，无统计显著差异） | 改英文（收获代码可维护性 + phase-gate 一致性，无性能代价） |
| B > A（英文显著更好，gap ≥ 3%） | 改英文（性能+可维护性双赢） |
| B < A（中文显著更好，gap ≥ 3%） | 保留中文（性能优先于可维护性） |
| B < A 但 gap 2-3% 且集中在特定 intent | 混合策略：大部分改英文，敏感 intent 保留中文片段 |
| E ≠ A（judge 语言偏差显著） | judge prompt 必须独立处理（统一英文或动态匹配） |

## 工作量估算

| 步骤 | 工时 |
|------|------|
| prompt 翻译 + 审校 | 2h |
| judge prompt 翻译 | 0.5h |
| eval 管道加 variant 切换 | 1-2h |
| 跑 4 组 eval（168 case × 4） | ~4h（取决于模型/并发） |
| 分析 + 报告 | 2h |
| **总计** | **~10h** |

## 产出

1. 实验报告（per-variant pass_rate + breakdown + 差异 case 分析）
2. **明确的 prompt.ts 语言决策**（基于数据，不是理论推断）
3. **judge prompt 语言偏差量化**（为 GA-I18N judge 票提供数据支持）
4. 翻译后的英文 prompt 版本（如果决策为改英文，直接可用）

## Key files

packages/data/nl2sql-engine/src/prompt.ts; packages/eval/eval-runner/src/sql_semantic_judge.ts; packages/eval/eval/cases/k11-v2/; packages/eval/eval-cli/src/{main.ts,report.ts}
